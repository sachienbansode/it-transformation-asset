import React, { useState, useMemo, useEffect, useRef } from "react";
import { useListChecklistItems, useCreateChecklistItem, useUpdateChecklistItem, useDeleteChecklistItem, useGetChecklistStats, getListChecklistItemsQueryKey, getGetChecklistStatsQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Trash2, Edit, X, ChevronLeft, ChevronRight, Check, CheckSquare, AlertTriangle, XCircle, TrendingUp, MessageSquare, History, Send, Clock, User } from "lucide-react";
import type { ChecklistItem } from "@workspace/api-client-react";
import { MasterSelect } from "@/components/master-select";
import { useMasters, getBadgeClass } from "@/hooks/use-masters";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ImportExportMenu } from "@/components/import-export-menu";
import { StatCard } from "@/components/stat-card";
import { formatDistanceToNow } from "date-fns";
import { confirmDialog } from "@/components/confirm-dialog";

const PAGE_SIZE = 10;

interface BusinessUnit { id: number; name: string; code: string; }

function useBusinessUnits() {
  return useQuery({
    queryKey: ["business-units"],
    queryFn: () => apiFetch<BusinessUnit[]>("/business-units"),
  });
}

// Multi-select BU filter chip bar
function BUMultiFilter({ options, selected, onToggle, onClear }: {
  options: BusinessUnit[]; selected: string[]; onToggle: (code: string) => void; onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground font-medium">BU:</span>
      {options.map(bu => (
        <button
          key={bu.code}
          onClick={() => onToggle(bu.code)}
          className={cn(
            "px-2 py-0.5 rounded text-xs font-medium border transition-all",
            selected.includes(bu.code)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
          )}
        >
          {bu.name}
        </button>
      ))}
      {selected.length > 0 && (
        <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
          <X className="h-3 w-3" /> Clear
        </button>
      )}
    </div>
  );
}

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <span className="text-xs text-muted-foreground">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} items
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
          const p = page <= 3 ? i + 1 : page + i - 2;
          if (p < 1 || p > pages) return null;
          return (
            <Button key={p} variant={p === page ? "default" : "ghost"} size="icon" className="h-7 w-7 text-xs" onClick={() => onChange(p)}>
              {p}
            </Button>
          );
        })}
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === pages} onClick={() => onChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Multi-select for BU in the form
function BUMultiSelect({ options, selected, onChange }: { options: BusinessUnit[]; selected: string[]; onChange: (s: string[]) => void }) {
  const toggle = (code: string) =>
    onChange(selected.includes(code) ? selected.filter(c => c !== code) : [...selected, code]);
  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-input rounded-md bg-background min-h-[38px]">
      {options.map(bu => (
        <button
          key={bu.code}
          type="button"
          onClick={() => toggle(bu.code)}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all",
            selected.includes(bu.code)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted text-muted-foreground border-border hover:border-primary/40"
          )}
        >
          {selected.includes(bu.code) && <Check className="h-2.5 w-2.5" />}
          {bu.name}
        </button>
      ))}
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChecklistComment { id: number; checklistItemId: number; authorName: string; content: string; createdAt: string; }
interface AuditLog { id: number; entityType: string; entityId: number; action: string; performedBy: string; performedAt: string; summary: string; oldValues?: any; newValues?: any; }
interface DashSummary { checklistByBusiness: { key: string; count: number; completed: number; pct: number }[] }

// ─── BU Completion Bars ───────────────────────────────────────────────────────
function BUCompletionBars({ items }: { items: ChecklistItem[] }) {
  const buMap: Record<string, { total: number; completed: number }> = {};
  const GENERIC = new Set(["All", "Both", "all", "both"]);

  for (const item of items) {
    const parts = (item.business || "").split(",").map(b => b.trim()).filter(b => b && !GENERIC.has(b));
    for (const b of parts) {
      if (!buMap[b]) buMap[b] = { total: 0, completed: 0 };
      buMap[b].total++;
      if (item.status === "Available") buMap[b].completed++;
    }
  }

  const rows = Object.entries(buMap)
    .map(([key, v]) => ({ key, ...v, pct: v.total ? Math.round((v.completed / v.total) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);

  if (rows.length === 0) return null;

  const getColor = (pct: number) => pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">BU-wise Completion</h3>
          <span className="text-xs text-muted-foreground">(% features Available)</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {rows.map(row => (
            <div key={row.key} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground truncate">{row.key}</span>
                <span className={cn("text-xs font-bold", row.pct >= 70 ? "text-emerald-600" : row.pct >= 40 ? "text-amber-600" : "text-red-600")}>
                  {row.pct}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", getColor(row.pct))}
                  style={{ width: `${row.pct}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{row.completed}/{row.total}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Checklist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { data: items } = useListChecklistItems();
  const { data: businessUnits } = useBusinessUnits();

  const createItem = useCreateChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const deleteItem = useDeleteChecklistItem();

  const { data: statuses } = useMasters("checklist_status");
  const { data: priorities } = useMasters("priority");

  const [search, setSearch] = useState("");
  const [filterBUs, setFilterBUs] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [formData, setFormData] = useState<Partial<ChecklistItem> & { businessMulti?: string[] }>({});
  const [modalTab, setModalTab] = useState("details");

  // Comments state
  const [comments, setComments] = useState<ChecklistComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const commentEndRef = useRef<HTMLDivElement>(null);

  // History state
  const [historyLogs, setHistoryLogs] = useState<AuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchComments = async (id: number) => {
    setCommentsLoading(true);
    try {
      const data = await apiFetch<ChecklistComment[]>(`/checklist/${id}/comments`);
      setComments(data);
    } catch { setComments([]); }
    finally { setCommentsLoading(false); }
  };

  const fetchHistory = async (id: number) => {
    setHistoryLoading(true);
    try {
      const data = await apiFetch<{ logs: AuditLog[] }>(`/audit-logs?entityType=checklist_item&entityId=${id}&limit=30`);
      setHistoryLogs(data.logs ?? []);
    } catch { setHistoryLogs([]); }
    finally { setHistoryLoading(false); }
  };

  const handleAddComment = async () => {
    if (!editingItem || !newComment.trim()) return;
    setCommentSaving(true);
    try {
      await apiFetch(`/checklist/${editingItem.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: newComment.trim() }) });
      setNewComment("");
      await fetchComments(editingItem.id);
      setTimeout(() => commentEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      toast({ title: "Comment added" });
    } catch (e: any) {
      toast({ title: "Failed to add comment", description: e.message, variant: "destructive" });
    } finally { setCommentSaving(false); }
  };

  const toggleBU = (code: string) => {
    setFilterBUs(prev => prev.includes(code) ? prev.filter(b => b !== code) : [...prev, code]);
    setPage(1);
  };

  const filteredItems = useMemo(() => {
    return (items ?? []).filter(item => {
      if (search && !item.feature.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterBUs.length > 0) {
        const itemBUsNorm = (item.business || "").split(",").map(b => b.trim().toLowerCase());
        const isAll = itemBUsNorm.includes("all");
        if (!isAll && !filterBUs.some(f => itemBUsNorm.includes(f.toLowerCase()))) return false;
      }
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      return true;
    });
  }, [items, search, filterBUs, filterStatus]);

  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleOpenModal = (item: ChecklistItem | null = null) => {
    setEditingItem(item);
    setModalTab("details");
    setComments([]);
    setHistoryLogs([]);
    setNewComment("");
    if (item) {
      const buList = (item.business || "").split(",").map(b => b.trim()).filter(Boolean);
      setFormData({ ...item, businessMulti: buList });
      fetchComments(item.id);
      fetchHistory(item.id);
    } else {
      setFormData({ category: "", feature: "", business: "", status: "", priority: "", businessMulti: [] });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const businessStr = (formData.businessMulti ?? []).join(",");
    const payload = { ...formData, business: businessStr };
    delete (payload as any).businessMulti;

    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: payload as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetChecklistStatsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Updated successfully" });
        },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      });
    } else {
      createItem.mutate({ data: payload as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetChecklistStatsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Created successfully" });
        },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!await confirmDialog("Delete this checklist item?")) return;
    deleteItem.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetChecklistStatsQueryKey() });
        toast({ title: "Deleted" });
      },
    });
  };

  const getStatusBadge = (status: string) => {
    const m = statuses?.find(s => s.label === status);
    if (m?.color) return getBadgeClass(m.color);
    if (status === "Available") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    if (status === "Not Available") return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
    if (status === "Legacy") return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    if (status === "Partial") return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30";
    return "bg-muted text-muted-foreground";
  };

  const getPriorityBadge = (prio: string) => {
    const m = priorities?.find(p => p.label === prio);
    if (m?.color) return getBadgeClass(m.color);
    if (prio === "High") return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
    if (prio === "Medium") return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    if (prio === "Low") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    return "bg-muted text-muted-foreground";
  };

  const renderBUChips = (business: string) => {
    const parts = business.split(",").map(b => b.trim()).filter(Boolean);
    if (parts.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {parts.map(b => (
          <span key={b} className="px-1.5 py-0 rounded text-[10px] font-medium border border-primary/30 text-primary bg-primary/8">{b}</span>
        ))}
      </div>
    );
  };

  const totalItems = items?.length ?? 0;
  const availableCount = items?.filter(i => i.status === "Available").length ?? 0;
  const notAvailableCount = items?.filter(i => i.status === "Not Available" || i.status === "Legacy").length ?? 0;
  const highPriorityCount = items?.filter(i => i.priority === "High").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">IT Master Checklist</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalItems} total items · {filteredItems.length} filtered
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportMenu module="checklist" label="Checklist" onImportSuccess={() => queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey() })} />
          {isAdmin && (
            <Button onClick={() => handleOpenModal(null)} size="sm">
              <Plus className="mr-1.5 h-4 w-4" /> Add Item
            </Button>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Total Items" value={totalItems} sub="checklist entries" icon={CheckSquare} iconBg="bg-blue-50 dark:bg-blue-400/10" iconColor="text-blue-600" borderColor="border-l-blue-400" />
        <StatCard label="Available" value={availableCount} sub="features ready" icon={TrendingUp} iconBg="bg-emerald-50 dark:bg-emerald-400/10" iconColor="text-emerald-600" borderColor="border-l-emerald-400" valueColor={availableCount > 0 ? "text-emerald-600" : undefined} />
        <StatCard label="Gaps / Legacy" value={notAvailableCount} sub="needs attention" icon={AlertTriangle} iconBg="bg-red-50 dark:bg-red-400/10" iconColor="text-red-500" borderColor="border-l-red-400" valueColor={notAvailableCount > 0 ? "text-red-500" : undefined} />
        <StatCard label="High Priority" value={highPriorityCount} sub="critical items" icon={XCircle} iconBg="bg-orange-50 dark:bg-orange-400/10" iconColor="text-orange-500" borderColor="border-l-orange-400" valueColor={highPriorityCount > 0 ? "text-orange-500" : undefined} />
      </div>

      {/* BU Completion Bars */}
      {items && items.length > 0 && <BUCompletionBars items={items} />}

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3 space-y-2.5">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search features..." className="pl-8 h-8 text-sm" value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statuses?.map(s => <SelectItem key={s.id} value={s.label}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <BUMultiFilter
            options={businessUnits ?? []}
            selected={filterBUs}
            onToggle={toggleBU}
            onClear={() => setFilterBUs([])}
          />
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs uppercase tracking-wide font-semibold text-muted-foreground w-28">Category</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">Feature</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">Business Unit</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">Current App</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold text-muted-foreground w-28">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold text-muted-foreground w-24">Priority</TableHead>
                {isAdmin && <TableHead className="w-20 text-right text-xs uppercase tracking-wide font-semibold text-muted-foreground">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedItems.map(item => (
                <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-xs text-muted-foreground py-3">{item.category}</TableCell>
                  <TableCell className="font-medium text-sm py-3 max-w-56">
                    <span className="truncate block">{item.feature}</span>
                  </TableCell>
                  <TableCell className="py-3">{renderBUChips(item.business || "")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground py-3">{item.currentApp || "—"}</TableCell>
                  <TableCell className="py-3">
                    <Badge className={cn("text-xs border", getStatusBadge(item.status))}>{item.status}</Badge>
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge className={cn("text-xs border", getPriorityBadge(item.priority))}>{item.priority}</Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenModal(item)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {pagedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                    No checklist items match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination page={page} total={filteredItems.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </Card>

      {/* Add/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
            <DialogTitle className="text-base">{editingItem ? `Edit: ${editingItem.feature?.substring(0, 40)}${(editingItem.feature?.length ?? 0) > 40 ? "…" : ""}` : "Add Checklist Item"}</DialogTitle>
          </DialogHeader>

          {editingItem ? (
            <Tabs value={modalTab} onValueChange={setModalTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="rounded-none border-b border-border bg-transparent mx-6 h-9 justify-start gap-1 shrink-0">
                <TabsTrigger value="details" className="text-xs px-3 h-7">Details</TabsTrigger>
                <TabsTrigger value="comments" className="text-xs px-3 h-7 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Comments {comments.length > 0 && <span className="bg-primary text-primary-foreground text-[9px] rounded-full px-1">{comments.length}</span>}
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs px-3 h-7 flex items-center gap-1">
                  <History className="h-3 w-3" />
                  History {historyLogs.length > 0 && <span className="bg-muted text-muted-foreground text-[9px] rounded-full px-1">{historyLogs.length}</span>}
                </TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="flex-1 overflow-y-auto m-0">
                <div className="grid gap-4 px-6 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <Label>Category</Label>
                      <MasterSelect category="checklist_category" value={formData.category || ""} onChange={v => setFormData({...formData, category: v})} placeholder="Select category" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Status</Label>
                      <MasterSelect category="checklist_status" value={formData.status || ""} onChange={v => setFormData({...formData, status: v})} placeholder="Select status" />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Feature / Requirement</Label>
                    <Input value={formData.feature || ""} onChange={e => setFormData({...formData, feature: e.target.value})} placeholder="Describe the feature or requirement" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Business Units <span className="text-muted-foreground font-normal">(select all that apply)</span></Label>
                    <BUMultiSelect options={businessUnits ?? []} selected={formData.businessMulti ?? []} onChange={v => setFormData({...formData, businessMulti: v})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <Label>Current App / System</Label>
                      <Input value={formData.currentApp || ""} onChange={e => setFormData({...formData, currentApp: e.target.value})} placeholder="Existing system" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Priority</Label>
                      <MasterSelect category="priority" value={formData.priority || ""} onChange={v => setFormData({...formData, priority: v})} placeholder="Select priority" />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Notes</Label>
                    <Textarea value={formData.comments || ""} onChange={e => setFormData({...formData, comments: e.target.value})} placeholder="Additional notes..." rows={2} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
                  <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={updateItem.isPending}>Update</Button>
                </div>
              </TabsContent>

              {/* Comments Tab */}
              <TabsContent value="comments" className="flex-1 flex flex-col overflow-hidden m-0">
                <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">
                  {commentsLoading && <p className="text-xs text-muted-foreground text-center py-4">Loading comments…</p>}
                  {!commentsLoading && comments.length === 0 && (
                    <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                      <MessageSquare className="h-8 w-8 opacity-20" />
                      <p className="text-xs">No comments yet. Be the first to add one.</p>
                    </div>
                  )}
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] text-primary font-bold">{c.authorName?.[0]?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1 bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground">{c.authorName}</span>
                          <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed">{c.content}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={commentEndRef} />
                </div>
                <div className="px-6 py-3 border-t border-border shrink-0">
                  <div className="flex gap-2">
                    <Textarea
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      placeholder="Add a comment…"
                      rows={2}
                      className="text-sm resize-none flex-1"
                      onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAddComment(); }}
                    />
                    <Button onClick={handleAddComment} disabled={commentSaving || !newComment.trim()} size="icon" className="self-end h-9 w-9">
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Ctrl+Enter to submit</p>
                </div>
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history" className="flex-1 overflow-y-auto m-0">
                <div className="px-6 py-3 space-y-2.5">
                  {historyLoading && <p className="text-xs text-muted-foreground text-center py-4">Loading history…</p>}
                  {!historyLoading && historyLogs.length === 0 && (
                    <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                      <History className="h-8 w-8 opacity-20" />
                      <p className="text-xs">No change history found for this item.</p>
                    </div>
                  )}
                  {historyLogs.map(log => (
                    <div key={log.id} className="flex gap-3 p-3 bg-muted/30 rounded-lg border border-border/40">
                      <div className="flex-shrink-0 mt-0.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">{log.action}</Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {log.performedAt ? formatDistanceToNow(new Date(log.performedAt), { addSuffix: true }) : ""}
                          </span>
                        </div>
                        <p className="text-xs text-foreground mt-1 leading-snug">{log.summary}</p>
                        {log.performedBy && (
                          <div className="flex items-center gap-1 mt-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">{log.performedBy}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            /* Create Mode (no tabs) */
            <>
              <div className="grid gap-4 px-6 py-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>Category</Label>
                    <MasterSelect category="checklist_category" value={formData.category || ""} onChange={v => setFormData({...formData, category: v})} placeholder="Select category" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Status</Label>
                    <MasterSelect category="checklist_status" value={formData.status || ""} onChange={v => setFormData({...formData, status: v})} placeholder="Select status" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Feature / Requirement</Label>
                  <Input value={formData.feature || ""} onChange={e => setFormData({...formData, feature: e.target.value})} placeholder="Describe the feature or requirement" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Business Units <span className="text-muted-foreground font-normal">(select all that apply)</span></Label>
                  <BUMultiSelect options={businessUnits ?? []} selected={formData.businessMulti ?? []} onChange={v => setFormData({...formData, businessMulti: v})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>Current App / System</Label>
                    <Input value={formData.currentApp || ""} onChange={e => setFormData({...formData, currentApp: e.target.value})} placeholder="Existing system" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Priority</Label>
                    <MasterSelect category="priority" value={formData.priority || ""} onChange={v => setFormData({...formData, priority: v})} placeholder="Select priority" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Notes</Label>
                  <Textarea value={formData.comments || ""} onChange={e => setFormData({...formData, comments: e.target.value})} placeholder="Additional notes..." rows={2} />
                </div>
              </div>
              <div className="flex justify-end gap-2 px-6 pb-5 pt-2 shrink-0 border-t border-border">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={createItem.isPending}>Create</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
