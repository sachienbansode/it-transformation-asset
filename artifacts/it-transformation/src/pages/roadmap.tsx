import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useListRoadmapItems, useCreateRoadmapItem, useUpdateRoadmapItem, useDeleteRoadmapItem, getListRoadmapItemsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Trash2, Edit, Eye, EyeOff, ChevronRight,
  IndianRupee, Calendar, ChevronDown, ChevronUp,
  ListTodo, CheckCircle2, Clock, History, ActivitySquare, Download, RotateCcw, Search,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import type { RoadmapItem } from "@workspace/api-client-react";
import { MasterSelect } from "@/components/master-select";
import { useCurrency } from "@/contexts/currency-context";
import { useAuth } from "@/contexts/auth-context";
import { ImportExportMenu } from "@/components/import-export-menu";
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";

interface UploadBatch {
  id: number; fileName: string | null; uploadedBy: string | null;
  rowCount: number; importedCount: number; skippedCount: number; archivedCount: number;
  rowErrors: string; createdAt: string;
}

interface AuditLog {
  id: number; entityType: string; entityId: number | null; action: string;
  performedBy: string | null; summary: string; performedAt: string;
}

const PAGE_SIZE = 10;

/** Format ISO date (YYYY-MM-DD) → DD-MM-YYYY for display */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

// ─── Gantt Chart ─────────────────────────────────────────────────────────────

const PHASE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "Phase 1: Quick Wins": { bg: "#16a34a", border: "#15803d", text: "#dcfce7" },
  "Phase 2: Core Transformation": { bg: "#2563eb", border: "#1d4ed8", text: "#dbeafe" },
  "Phase 3: Innovation & Scale": { bg: "#9333ea", border: "#7e22ce", text: "#f3e8ff" },
};
const DEFAULT_COLOR = { bg: "#d97706", border: "#b45309", text: "#fef3c7" };

function getPhaseColor(phase: string) {
  return PHASE_COLORS[phase] || DEFAULT_COLOR;
}

function GanttChart({ items }: { items: RoadmapItem[] }) {
  const activeItems = items.filter(i => (i as any).isActive !== false);
  if (activeItems.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">No active initiatives to display.</div>;
  }

  // Determine timeline range from startDate/endDate if available, else startMonth/endMonth
  // DB stores dates as ISO YYYY-MM-DD strings (PostgreSQL date type)
  const parseIsoDate = (d: unknown): Date | null => {
    if (!d || typeof d !== "string") return null;
    const dt = new Date(d + "T00:00:00"); // force local-time parse
    return isNaN(dt.getTime()) ? null : dt;
  };
  const hasRealDates = activeItems.some(i => parseIsoDate((i as any).startDate) && parseIsoDate((i as any).endDate));

  let totalMonths = 12;
  if (hasRealDates) {
    const dates = activeItems
      .flatMap(i => [parseIsoDate((i as any).startDate), parseIsoDate((i as any).endDate)])
      .filter((d): d is Date => d !== null);
    if (dates.length >= 2) {
      const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
      const start = sorted[0];
      const end = sorted[sorted.length - 1];
      totalMonths = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)) + 1;
      totalMonths = Math.max(12, Math.min(totalMonths, 36));
    }
  } else {
    totalMonths = Math.max(12, ...activeItems.map(i => i.endMonth || 12));
  }

  const getBarStyle = (item: RoadmapItem) => {
    const start = (item.startMonth - 1) / totalMonths * 100;
    const width = Math.max(1, (item.endMonth - item.startMonth + 1)) / totalMonths * 100;
    return { left: `${start}%`, width: `${width}%` };
  };

  const monthLabels = Array.from({ length: totalMonths }, (_, i) => {
    const m = i + 1;
    if (totalMonths <= 12) return `M${m}`;
    return m % 3 === 1 ? `Q${Math.ceil(m / 3)}` : null;
  });

  const STATUS_COLORS: Record<string, string> = {
    Completed: "#16a34a", "In Progress": "#2563eb", Planning: "#9ca3af",
    Planned: "#9ca3af", Blocked: "#dc2626",
  };

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: `${Math.max(600, totalMonths * 50)}px` }}>
        {/* Month header */}
        <div className="flex border-b border-border pb-1 mb-2">
          <div className="w-48 flex-shrink-0" />
          <div className="flex-1 relative h-5">
            {monthLabels.map((label, i) =>
              label ? (
                <span
                  key={i}
                  className="absolute text-[10px] text-muted-foreground font-medium"
                  style={{ left: `${(i / totalMonths) * 100}%`, transform: "translateX(-50%)" }}
                >
                  {label}
                </span>
              ) : null
            )}
          </div>
        </div>

        {/* Items */}
        <div className="space-y-1.5">
          {activeItems.map(item => {
            const color = getPhaseColor(item.phase);
            const statusColor = STATUS_COLORS[item.status] || "#9ca3af";
            return (
              <div key={item.id} className="flex items-center gap-2 group">
                <div className="w-48 flex-shrink-0 flex items-center gap-1.5 pr-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
                  <span className="text-xs text-foreground truncate" title={item.title}>{item.title}</span>
                </div>
                <div className="flex-1 relative h-6 rounded bg-muted/40">
                  {/* Grid lines */}
                  {Array.from({ length: totalMonths - 1 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-border/30"
                      style={{ left: `${((i + 1) / totalMonths) * 100}%` }}
                    />
                  ))}
                  {/* Bar */}
                  <div
                    className="absolute top-0.5 bottom-0.5 rounded cursor-default transition-opacity"
                    style={{
                      ...getBarStyle(item),
                      backgroundColor: color.bg,
                      border: `1px solid ${color.border}`,
                    }}
                    title={`${item.title}\nM${item.startMonth} – M${item.endMonth}\n${item.status}`}
                  >
                    <span className="absolute inset-0 flex items-center px-1.5 text-[9px] font-semibold truncate" style={{ color: color.text }}>
                      {item.status !== "Planning" && item.status !== "Planned" ? item.status : ""}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
          {Object.entries(PHASE_COLORS).map(([phase, c]) => (
            <div key={phase} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.bg }} />
              <span className="text-[11px] text-muted-foreground">{phase.split(":")[0]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Form Validation ──────────────────────────────────────────────────────────

function validateForm(data: Partial<RoadmapItem & { isActive?: boolean; startDate?: string; endDate?: string }>): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!data.title?.trim()) errs.title = "Title is required";
  if (!data.phase?.trim()) errs.phase = "Phase is required";
  if (!data.business?.trim()) errs.business = "Business unit is required";
  const sm = data.startMonth ?? 1;
  const em = data.endMonth ?? 1;
  if (sm < 1 || sm > 36) errs.startMonth = "Start month must be 1–36";
  if (em < 1 || em > 36) errs.endMonth = "End month must be 1–36";
  if (em < sm) errs.endMonth = "End month must be ≥ start month";
  if ((data as any).startDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test((data as any).startDate)) errs.startDate = "Use YYYY-MM-DD format";
  }
  if ((data as any).endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test((data as any).endDate)) errs.endDate = "Use YYYY-MM-DD format";
    else if ((data as any).startDate && (data as any).endDate < (data as any).startDate) errs.endDate = "End date must be ≥ start date";
  }
  if (data.budgetLakhs !== undefined && data.budgetLakhs < 0) errs.budgetLakhs = "Budget cannot be negative";
  return errs;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  Completed: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10",
  "In Progress": "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10",
  Planning: "border-gray-400/30 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-400/10",
  Planned: "border-gray-400/30 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-400/10",
  Blocked: "border-red-500/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10",
};

// ─── Main Component ───────────────────────────────────────────────────────────

type FormData = Partial<RoadmapItem> & { isActive?: boolean; startDate?: string; endDate?: string };

export default function Roadmap() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: items } = useListRoadmapItems();
  const { format } = useCurrency();

  const createItem = useCreateRoadmapItem();
  const updateItem = useUpdateRoadmapItem();
  const deleteItem = useDeleteRoadmapItem();

  const [activeTab, setActiveTab] = useState("All");
  const [showTimeline, setShowTimeline] = useState(true);
  const [page, setPage] = useState(1);
  const [searchQ, setSearchQ] = useState("");

  const setTabAndReset = (v: string) => { setActiveTab(v); setPage(1); setSearchQ(""); };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Upload History & Audit Trail
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showAuditDialog, setShowAuditDialog] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<UploadBatch[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [restoringBatch, setRestoringBatch] = useState<number | null>(null);

  const loadUploadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try { const data = await apiFetch<UploadBatch[]>("/roadmap/upload-history"); setUploadHistory(data); }
    catch (e: any) { toast({ title: "Failed to load history", description: e.message, variant: "destructive" }); }
    finally { setLoadingHistory(false); }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try { const data = await apiFetch<AuditLog[]>("/roadmap/audit-trail"); setAuditLogs(data); }
    catch (e: any) { toast({ title: "Failed to load audit trail", description: e.message, variant: "destructive" }); }
    finally { setLoadingAudit(false); }
  }, []);

  useEffect(() => { if (showHistoryDialog) loadUploadHistory(); }, [showHistoryDialog]);
  useEffect(() => { if (showAuditDialog) loadAuditLogs(); }, [showAuditDialog]);

  const handleRestoreBatch = async (batchId: number) => {
    if (!await confirmDialog("Restore this upload? All current active initiatives will be archived and replaced by this batch.")) return;
    setRestoringBatch(batchId);
    try {
      await apiFetch(`/roadmap/upload-history/${batchId}/restore`, { method: "POST" });
      toast({ title: "Batch restored successfully" });
      queryClient.invalidateQueries({ queryKey: getListRoadmapItemsQueryKey() });
      setShowHistoryDialog(false);
    } catch (e: any) { toast({ title: "Restore failed", description: e.message, variant: "destructive" }); }
    finally { setRestoringBatch(null); }
  };

  const handleDownloadBatch = (batchId: number, fileName: string | null) => {
    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
    const link = document.createElement("a");
    link.href = `${BASE}/api/roadmap/upload-history/${batchId}/download`;
    link.download = fileName || `batch-${batchId}.csv`;
    link.click();
  };

  const filteredItems = useMemo(() => {
    if (!items) return [];
    const q = searchQ.toLowerCase();
    return items.filter(item => {
      const matchPhase = activeTab === "All" || item.phase === activeTab;
      if (!matchPhase) return false;
      if (!q) return true;
      return (
        item.title?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.owner?.toLowerCase().includes(q) ||
        item.business?.toLowerCase().includes(q) ||
        item.status?.toLowerCase().includes(q)
      );
    });
  }, [items, activeTab, searchQ]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeItems = items ?? [];

  const totalBudget = items?.reduce((sum, i) => sum + (i.budgetLakhs || 0), 0) || 0;
  const completedCount = items?.filter(i => i.status === "Completed").length || 0;
  const inProgressCount = items?.filter(i => i.status === "In Progress").length || 0;

  const handleOpenModal = (item: RoadmapItem | null = null) => {
    setEditingItem(item);
    if (item) {
      setFormData({
        ...item,
        isActive: (item as any).isActive !== false,
        startDate: (item as any).startDate || "",
        endDate: (item as any).endDate || "",
      });
    } else {
      setFormData({
        title: "", description: "", phase: "Phase 1: Quick Wins", business: "",
        status: "Planning", priority: "Medium", budgetLakhs: 0,
        startMonth: 1, endMonth: 6, owner: "",
        isActive: true, startDate: "", endDate: "",
      });
    }
    setErrors({});
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const errs = validateForm(formData);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const payload = { ...formData };
    if (!(payload as any).startDate) delete (payload as any).startDate;
    if (!(payload as any).endDate) delete (payload as any).endDate;

    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: payload as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRoadmapItemsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Initiative updated" });
        },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      });
    } else {
      createItem.mutate({ data: payload as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRoadmapItemsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Initiative created" });
        },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (await confirmDialog("Delete this initiative?")) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRoadmapItemsQueryKey() });
          toast({ title: "Deleted" });
        },
      });
    }
  };

  const set = (key: keyof FormData, value: unknown) => {
    setFormData(p => ({ ...p, [key]: value }));
    setErrors(e => { const n = { ...e }; delete n[key as string]; return n; });
  };

  const FieldError = ({ k }: { k: string }) =>
    errors[k] ? <p className="text-xs text-destructive mt-0.5">{errors[k]}</p> : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Transformation Roadmap</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{items?.length ?? 0} initiatives · {completedCount} completed · {inProgressCount} in progress</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowHistoryDialog(true)}>
                <History className="h-4 w-4" /> Upload History
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAuditDialog(true)}>
                <ActivitySquare className="h-4 w-4" /> Audit Trail
              </Button>
            </>
          )}
          <ImportExportMenu
            module="roadmap"
            label="Roadmap"
            archiveWarning="Uploading a new CSV will archive all currently active initiatives and replace them with the new file. Previous data is preserved in upload history and can be restored."
            onImportSuccess={() => queryClient.invalidateQueries({ queryKey: getListRoadmapItemsQueryKey() })}
          />
          {isAdmin && (
            <Button size="sm" onClick={() => handleOpenModal(null)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Initiative
            </Button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Initiatives" value={items?.length ?? 0} sub="roadmap items" icon={ListTodo} iconBg="bg-blue-50 dark:bg-blue-400/10" iconColor="text-blue-600" borderColor="border-l-blue-400" />
        <StatCard label="Total Budget" value={format(totalBudget, 0)} sub="planned spend" icon={IndianRupee} iconBg="bg-yellow-50 dark:bg-yellow-400/10" iconColor="text-yellow-600" borderColor="border-l-yellow-400" />
        <StatCard label="Completed" value={completedCount} sub="initiatives done" icon={CheckCircle2} iconBg="bg-emerald-50 dark:bg-emerald-400/10" iconColor="text-emerald-600" borderColor="border-l-emerald-400" valueColor={completedCount > 0 ? "text-emerald-600" : undefined} />
        <StatCard label="In Progress" value={inProgressCount} sub="active initiatives" icon={Clock} iconBg="bg-purple-50 dark:bg-purple-400/10" iconColor="text-purple-600" borderColor="border-l-purple-400" valueColor={inProgressCount > 0 ? "text-purple-600" : undefined} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={activeTab} onValueChange={setTabAndReset}>
          <TabsList className="h-8">
            <TabsTrigger value="All" className="text-xs px-2.5 h-6">All</TabsTrigger>
            <TabsTrigger value="Phase 1: Quick Wins" className="text-xs px-2.5 h-6">Phase 1</TabsTrigger>
            <TabsTrigger value="Phase 2: Core Transformation" className="text-xs px-2.5 h-6">Phase 2</TabsTrigger>
            <TabsTrigger value="Phase 3: Innovation & Scale" className="text-xs px-2.5 h-6">Phase 3</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            placeholder="Search initiatives…"
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); setPage(1); }}
            className="w-full pl-8 pr-3 py-1.5 h-8 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {(searchQ || activeTab !== "All") && (
          <span className="text-xs text-muted-foreground">{filteredItems.length} result{filteredItems.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Initiative cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pagedItems.map(item => {
          const color = getPhaseColor(item.phase);
          return (
            <Card key={item.id} className="relative group">
              <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-lg" style={{ backgroundColor: color.bg }} />
              <CardHeader className="pb-2 pt-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Badge variant="outline" className="text-[10px] w-fit" style={{ borderColor: `${color.bg}40`, color: color.bg }}>
                      {item.phase.split(":")[0]}
                    </Badge>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleOpenModal(item)}><Edit className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  )}
                </div>
                <CardTitle className="text-sm leading-snug">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {item.description && <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{item.business}</Badge>
                  <Badge variant="outline" className={cn("text-[10px] border", STATUS_BADGE[item.status] || "")}>{item.status}</Badge>
                  {item.priority && <Badge variant="outline" className="text-[10px]">{item.priority}</Badge>}
                </div>
                <div className="flex justify-between items-center text-xs pt-1.5 border-t border-border">
                  <span className="font-semibold text-primary">{format(item.budgetLakhs || 0, 0)}</span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {(item as any).startDate && (item as any).endDate
                      ? `${fmtDate((item as any).startDate)} → ${fmtDate((item as any).endDate)}`
                      : `M${item.startMonth} – M${item.endMonth}`
                    }
                  </span>
                </div>
                {item.owner && <p className="text-xs text-muted-foreground">Owner: {item.owner}</p>}
              </CardContent>
            </Card>
          );
        })}
        {pagedItems.length === 0 && (
          <div className="col-span-3 py-12 text-center text-sm text-muted-foreground">No initiatives found.</div>
        )}
      </div>

      {filteredItems.length > PAGE_SIZE && (
        <Pagination
          page={page} totalPages={totalPages} totalItems={filteredItems.length}
          pageSize={PAGE_SIZE} onPageChange={setPage}
        />
      )}

      {/* ─── Timeline (bottom, hideable) ──────────── */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Timeline (Gantt View)
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={() => setShowTimeline(p => !p)}
            >
              {showTimeline ? <><EyeOff className="h-3.5 w-3.5" /> Hide</> : <><Eye className="h-3.5 w-3.5" /> Show</>}
            </Button>
          </div>
        </CardHeader>
        {showTimeline && (
          <CardContent className="pt-4">
            <GanttChart items={filteredItems} />
          </CardContent>
        )}
      </Card>

      {/* ─── Add/Edit Modal ─────────────────────────────── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Initiative" : "Add Initiative"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">

            {/* Title */}
            <div className="grid gap-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                value={formData.title || ""}
                onChange={e => set("title", e.target.value)}
                className={errors.title ? "border-destructive" : ""}
                placeholder="e.g. CRM Platform Modernisation"
              />
              <FieldError k="title" />
            </div>

            {/* Description */}
            <div className="grid gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={formData.description || ""}
                onChange={e => set("description", e.target.value)}
                rows={2}
                placeholder="Brief description of the initiative"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Phase */}
              <div className="grid gap-1.5">
                <Label>Phase <span className="text-destructive">*</span></Label>
                <MasterSelect
                  category="phase"
                  value={formData.phase || ""}
                  onChange={v => set("phase", v)}
                  placeholder="Select phase"
                />
                <FieldError k="phase" />
              </div>
              {/* Business */}
              <div className="grid gap-1.5">
                <Label>Business Unit <span className="text-destructive">*</span></Label>
                <MasterSelect
                  category="business"
                  value={formData.business || ""}
                  onChange={v => set("business", v)}
                  placeholder="Select BU"
                />
                <FieldError k="business" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Status */}
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <MasterSelect category="roadmap_status" value={formData.status || ""} onChange={v => set("status", v)} placeholder="Status" />
              </div>
              {/* Priority */}
              <div className="grid gap-1.5">
                <Label>Priority</Label>
                <MasterSelect category="priority" value={formData.priority || ""} onChange={v => set("priority", v)} placeholder="Priority" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* Budget */}
              <div className="grid gap-1.5">
                <Label>Budget (₹ Lakhs)</Label>
                <Input type="number" min={0} value={formData.budgetLakhs ?? 0} onChange={e => set("budgetLakhs", Number(e.target.value))} className={errors.budgetLakhs ? "border-destructive" : ""} />
                <FieldError k="budgetLakhs" />
              </div>
              {/* Start Month */}
              <div className="grid gap-1.5">
                <Label>Start Month <span className="text-destructive">*</span></Label>
                <Input type="number" min={1} max={36} value={formData.startMonth ?? 1} onChange={e => set("startMonth", Number(e.target.value))} className={errors.startMonth ? "border-destructive" : ""} />
                <FieldError k="startMonth" />
              </div>
              {/* End Month */}
              <div className="grid gap-1.5">
                <Label>End Month <span className="text-destructive">*</span></Label>
                <Input type="number" min={1} max={36} value={formData.endMonth ?? 6} onChange={e => set("endMonth", Number(e.target.value))} className={errors.endMonth ? "border-destructive" : ""} />
                <FieldError k="endMonth" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Start Date */}
              <div className="grid gap-1.5">
                <Label>Start Date <span className="text-xs text-muted-foreground">(optional, YYYY-MM-DD)</span></Label>
                <Input
                  type="date"
                  value={(formData as any).startDate || ""}
                  onChange={e => set("startDate" as any, e.target.value)}
                  className={errors.startDate ? "border-destructive" : ""}
                />
                <FieldError k="startDate" />
              </div>
              {/* End Date */}
              <div className="grid gap-1.5">
                <Label>End Date <span className="text-xs text-muted-foreground">(optional, YYYY-MM-DD)</span></Label>
                <Input
                  type="date"
                  value={(formData as any).endDate || ""}
                  onChange={e => set("endDate" as any, e.target.value)}
                  className={errors.endDate ? "border-destructive" : ""}
                />
                <FieldError k="endDate" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Owner */}
              <div className="grid gap-1.5">
                <Label>Owner</Label>
                <Input value={formData.owner || ""} onChange={e => set("owner", e.target.value)} placeholder="e.g. CTO" />
              </div>
              {/* Active */}
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <div className="flex items-center gap-2 pt-1.5">
                  <Switch
                    checked={(formData as any).isActive !== false}
                    onCheckedChange={v => set("isActive" as any, v)}
                  />
                  <span className="text-sm">{(formData as any).isActive !== false ? "Active" : "Inactive"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createItem.isPending || updateItem.isPending}>
              {editingItem ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Upload History Dialog ─────────────────────────────── */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Roadmap Upload History</DialogTitle>
          </DialogHeader>
          {loadingHistory ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : uploadHistory.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No upload history found. Import a CSV to start tracking history.</div>
          ) : (
            <div className="space-y-3">
              {uploadHistory.map((batch, idx) => {
                const errs: string[] = (() => { try { return JSON.parse(batch.rowErrors); } catch { return []; } })();
                return (
                  <div key={batch.id} className={cn("border border-border rounded-lg p-4 space-y-2", idx === 0 && "border-primary/40 bg-primary/5")}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {idx === 0 && <Badge className="text-[10px] bg-primary text-primary-foreground">Latest</Badge>}
                          <p className="text-sm font-semibold text-foreground">{batch.fileName || `Batch #${batch.id}`}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Uploaded by <span className="font-medium">{batch.uploadedBy || "Unknown"}</span> · {new Date(batch.createdAt).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDownloadBatch(batch.id, batch.fileName)}>
                          <Download className="h-3 w-3" /> Download
                        </Button>
                        {isAdmin && (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-amber-500/50 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-400/10"
                            onClick={() => handleRestoreBatch(batch.id)} disabled={restoringBatch === batch.id || idx === 0}>
                            <RotateCcw className="h-3 w-3" /> {restoringBatch === batch.id ? "Restoring…" : idx === 0 ? "Current" : "Restore"}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: "Total Rows", value: batch.rowCount, color: "" },
                        { label: "Imported", value: batch.importedCount, color: "text-emerald-600" },
                        { label: "Skipped", value: batch.skippedCount, color: batch.skippedCount > 0 ? "text-amber-600" : "" },
                        { label: "Archived", value: batch.archivedCount, color: "text-muted-foreground" },
                      ].map(s => (
                        <div key={s.label} className="rounded-md bg-muted/40 p-2">
                          <p className={cn("text-base font-bold", s.color)}>{s.value}</p>
                          <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {errs.length > 0 && (
                      <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10 rounded p-2 space-y-0.5">
                        {errs.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                        {errs.length > 5 && <div className="text-muted-foreground">…and {errs.length - 5} more errors</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Audit Trail Dialog ──────────────────────────────────── */}
      <Dialog open={showAuditDialog} onOpenChange={setShowAuditDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ActivitySquare className="h-4 w-4" /> Roadmap Audit Trail</DialogTitle>
          </DialogHeader>
          {loadingAudit ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : auditLogs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No audit events recorded yet.</div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    {["Time","Action","Details","Performed By"].map(h => (
                      <th key={h} className="px-3 py-2.5 font-semibold text-left text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => {
                    const actionColors: Record<string, string> = {
                      create: "text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10",
                      update: "text-blue-600 bg-blue-50 dark:bg-blue-400/10",
                      delete: "text-red-600 bg-red-50 dark:bg-red-400/10",
                      import: "text-purple-600 bg-purple-50 dark:bg-purple-400/10",
                      restore_batch: "text-amber-600 bg-amber-50 dark:bg-amber-400/10",
                    };
                    const cls = actionColors[log.action] || "text-gray-600 bg-gray-50 dark:bg-gray-400/10";
                    return (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                          {new Date(log.performedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide", cls)}>
                            {log.action.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-foreground max-w-xs">{log.summary}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{log.performedBy || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
