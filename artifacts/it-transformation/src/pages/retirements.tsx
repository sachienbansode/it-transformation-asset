import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  useListRetirements,
  useCreateRetirement,
  useUpdateRetirement,
  useDeleteRetirement,
  getListRetirementsQueryKey,
  useListApplications,
} from "@workspace/api-client-react";
import type { Retirement } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Edit, Search, X, User, Upload, FileText,
  Download, AlertCircle, Paperclip, Archive, Clock, IndianRupee,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MasterSelect } from "@/components/master-select";
import { useCurrency } from "@/contexts/currency-context";
import { useAuth } from "@/contexts/auth-context";
import { ImportExportMenu } from "@/components/import-export-menu";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/components/confirm-dialog";

const PAGE_SIZE = 10;

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface RetirementDocument {
  id: number;
  retirementId: number;
  fileName: string;
  filePath: string;
  fileSize: number | null;
  mimeType: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function useRetirementDocuments(retirementId: number | null) {
  return useQuery<RetirementDocument[]>({
    queryKey: ["retirement-docs", retirementId],
    queryFn: () => apiFetch<RetirementDocument[]>(`/retirements/${retirementId}/documents`),
    enabled: !!retirementId,
  });
}

export default function Retirements() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { data: items } = useListRetirements();
  const { data: allApps } = useListApplications();
  const { format, unit, cycle, label: currencyLabel } = useCurrency();

  const createItem = useCreateRetirement();
  const updateItem = useUpdateRetirement();
  const deleteItem = useDeleteRetirement();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterBusiness, setFilterBusiness] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Retirement | null>(null);
  const [formData, setFormData] = useState<Partial<Retirement>>({});
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: existingDocs, refetch: refetchDocs } = useRetirementDocuments(editingItem?.id ?? null);

  const businesses = useMemo(
    () => [...new Set((items || []).map(i => i.business).filter(Boolean))].sort(),
    [items]
  );

  const filteredItems = useMemo(
    () =>
      (items || []).filter(item => {
        const q = search.toLowerCase();
        if (
          q &&
          !item.appName?.toLowerCase().includes(q) &&
          !item.business?.toLowerCase().includes(q) &&
          !item.reason?.toLowerCase().includes(q)
        )
          return false;
        if (filterBusiness !== "all" && item.business !== filterBusiness) return false;
        if (filterStatus !== "all" && item.status !== filterStatus) return false;
        return true;
      }),
    [items, search, filterBusiness, filterStatus]
  );

  const activeApps = useMemo(
    () => (allApps || []).filter(a => a.applicationStatus !== "Retired" && a.isActive !== false),
    [allApps]
  );

  const linkedApp = useMemo(() => {
    if (!selectedAppId) return null;
    return activeApps.find(a => a.id === selectedAppId) ?? null;
  }, [selectedAppId, activeApps]);

  const handleOpenModal = (item: Retirement | null = null) => {
    setEditingItem(item);
    setFormErrors({});
    setPendingFiles([]);
    if (item) {
      setSelectedAppId(item.applicationId ?? null);
      setFormData({
        applicationId: item.applicationId,
        appName: item.appName,
        business: item.business,
        reason: item.reason,
        migrationEffort: item.migrationEffort,
        status: item.status,
        budgetLakhs: item.budgetLakhs ?? undefined,
        targetDate: item.targetDate ?? "",
        successor: item.successor ?? "",
        comments: item.comments ?? "",
      });
    } else {
      setSelectedAppId(null);
      setFormData({ appName: "", business: "", reason: "", migrationEffort: "", status: "Planned" });
    }
    setIsModalOpen(true);
  };

  const handleAppSelect = (appIdStr: string) => {
    const appId = appIdStr === "none" ? null : Number(appIdStr);
    setSelectedAppId(appId);
    if (appId) {
      const app = activeApps.find(a => a.id === appId);
      if (app) {
        setFormData(prev => ({
          ...prev,
          applicationId: appId,
          appName: app.name,
          business: app.business ?? "",
        }));
      }
    } else {
      setFormData(prev => ({ ...prev, applicationId: undefined, appName: "", business: "" }));
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.appName?.trim()) errors.appName = "App name is required";
    if (!formData.business?.trim()) errors.business = "Business unit is required";
    if (!formData.reason?.trim()) errors.reason = "Retirement reason is required";
    if (!formData.migrationEffort?.trim()) errors.migrationEffort = "Migration effort is required";
    if (!formData.status?.trim()) errors.status = "Status is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const uploadFiles = async (retirementId: number): Promise<void> => {
    if (pendingFiles.length === 0) return;
    const fd = new FormData();
    pendingFiles.forEach(f => fd.append("files", f));
    await fetch(`${BASE}/api/retirements/${retirementId}/documents`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    queryClient.invalidateQueries({ queryKey: ["retirement-docs", retirementId] });
  };

  const handleSave = () => {
    if (!validate()) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    const payload = { ...formData, applicationId: selectedAppId ?? undefined };
    if (editingItem) {
      updateItem.mutate(
        { id: editingItem.id, data: payload as any },
        {
          onSuccess: async (updated) => {
            await uploadFiles(editingItem.id);
            queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() });
            setIsModalOpen(false);
            toast({ title: "Updated successfully" });
          },
        }
      );
    } else {
      createItem.mutate(
        { data: payload as any },
        {
          onSuccess: async (created: any) => {
            if (pendingFiles.length > 0) {
              await uploadFiles(created.id);
            }
            queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() });
            setIsModalOpen(false);
            toast({ title: "Created successfully" });
          },
        }
      );
    }
  };

  const handleDelete = async (id: number) => {
    if (await confirmDialog("Are you sure you want to delete this retirement plan?")) {
      deleteItem.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() });
            toast({ title: "Deleted successfully" });
          },
        }
      );
    }
  };

  const handleDeleteDoc = async (docId: number) => {
    if (!await confirmDialog("Delete this document?")) return;
    await apiFetch(`/retirements/documents/${docId}`, { method: "DELETE" });
    if (editingItem) refetchDocs();
    toast({ title: "Document deleted" });
  };

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    setPendingFiles(prev => [...prev, ...files]);
  }, []);

  const totalPlanned = items?.length || 0;
  const inProgress = items?.filter(i => i.status === "In Progress").length || 0;
  const totalBudget = items?.reduce((sum, item) => sum + (item.budgetLakhs || 0), 0) || 0;

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const getEffortBadge = (effort: string) => {
    if (effort === "High") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (effort === "Medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-green-500/20 text-green-400 border-green-500/30";
  };

  const getStatusBadge = (status: string) => {
    if (status === "Completed") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (status === "In Progress") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  };

  const fieldCls = (field: string) =>
    cn(formErrors[field] && "border-destructive ring-1 ring-destructive/30");

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">App Retirement Plan</h2>
          <p className="text-xs text-muted-foreground">{totalPlanned} total · {filteredItems.length} shown</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ImportExportMenu
            module="retirements"
            label="Retirements"
            onImportSuccess={() => queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() })}
          />
          {isAdmin && (
            <Button size="sm" onClick={() => handleOpenModal(null)}>
              <Plus className="mr-2 h-4 w-4" /> Add Plan
            </Button>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search app, business, reason…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2 top-2">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={filterBusiness} onValueChange={v => { setFilterBusiness(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Business Unit" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Business Units</SelectItem>
            {businesses.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {["Planned", "In Progress", "Completed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || filterBusiness !== "all" || filterStatus !== "all") && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setSearch(""); setFilterBusiness("all"); setFilterStatus("all"); setPage(1); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Total Planned" value={totalPlanned} sub="retirement entries" icon={Archive} iconBg="bg-blue-50 dark:bg-blue-400/10" iconColor="text-blue-600" />
        <StatCard label="In Progress" value={inProgress} sub="actively being retired" icon={Clock} iconBg="bg-orange-50 dark:bg-orange-400/10" iconColor="text-orange-500" valueColor={inProgress > 0 ? "text-orange-500" : undefined} />
        <StatCard label={`Total Budget (${currencyLabel})`} value={format(totalBudget, 1)} sub="planned spend" icon={IndianRupee} iconBg="bg-emerald-50 dark:bg-emerald-400/10" iconColor="text-emerald-600" />
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>App Name</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Target Date</TableHead>
              <TableHead>Successor</TableHead>
              <TableHead>Effort</TableHead>
              <TableHead>
                <button onClick={cycle} className="flex items-center gap-1 hover:text-foreground transition-colors" title="Click to switch currency unit">
                  Budget <span className="text-[10px] text-muted-foreground">({unit === "crores" ? "₹Cr" : unit === "millions" ? "$M" : "₹L"})</span>
                </button>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created By</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedItems.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.appName}</TableCell>
                <TableCell><Badge variant="outline">{item.business}</Badge></TableCell>
                <TableCell><Badge variant="secondary">{item.reason}</Badge></TableCell>
                <TableCell className="text-xs">{item.targetDate || "-"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{item.successor || "-"}</TableCell>
                <TableCell><Badge className={getEffortBadge(item.migrationEffort)}>{item.migrationEffort}</Badge></TableCell>
                <TableCell className="font-medium text-xs">{item.budgetLakhs != null ? format(item.budgetLakhs, 1) : "—"}</TableCell>
                <TableCell><Badge className={getStatusBadge(item.status)}>{item.status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-28 truncate">
                  {(item as any).createdBy ? (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate">{(item as any).createdBy.split(" <")[0]}</span>
                    </span>
                  ) : "-"}
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {pagedItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 10 : 9} className="py-10 text-center text-sm text-muted-foreground">
                  No retirement plans found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="px-4 pb-3">
          <Pagination page={page} totalPages={totalPages} totalItems={items?.length || 0} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? "Edit Retirement Plan" : "Add Retirement Plan"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">

            {/* Application Selector */}
            <div className="grid gap-2">
              <Label>Link to Application Inventory</Label>
              <Select
                value={selectedAppId ? String(selectedAppId) : "none"}
                onValueChange={handleAppSelect}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select application (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Enter manually —</SelectItem>
                  {activeApps.map(app => (
                    <SelectItem key={app.id} value={String(app.id)}>
                      {app.name} {app.business ? `(${app.business})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkedApp && (
                <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground grid grid-cols-2 gap-1">
                  <span><strong>Vendor:</strong> {linkedApp.vendor || "-"}</span>
                  <span><strong>Category:</strong> {linkedApp.category || "-"}</span>
                  <span><strong>Hosting:</strong> {linkedApp.hosting || "-"}</span>
                  <span><strong>Criticality:</strong> {linkedApp.criticality || "-"}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">App Name <span className="text-destructive">*</span></Label>
                {linkedApp ? (
                  <Input value={formData.appName || ""} disabled className="bg-muted/40 text-muted-foreground text-xs h-8" />
                ) : (
                  <Input
                    value={formData.appName || ""}
                    onChange={e => setFormData({ ...formData, appName: e.target.value })}
                    className={cn("text-xs h-8", fieldCls("appName"))}
                    placeholder="Application name"
                  />
                )}
                {formErrors.appName && <p className="text-[10px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{formErrors.appName}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Business Unit <span className="text-destructive">*</span></Label>
                {linkedApp ? (
                  <Input value={formData.business || ""} disabled className="bg-muted/40 text-muted-foreground text-xs h-8" />
                ) : (
                  <div className={fieldCls("business")}>
                    <MasterSelect category="business" value={formData.business || ""} onChange={v => setFormData({ ...formData, business: v })} placeholder="Select business" />
                  </div>
                )}
                {formErrors.business && <p className="text-[10px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{formErrors.business}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Retirement Reason <span className="text-destructive">*</span></Label>
                <div className={fieldCls("reason")}>
                  <MasterSelect category="retirement_reason" value={formData.reason || ""} onChange={v => setFormData({ ...formData, reason: v })} placeholder="Select reason" />
                </div>
                {formErrors.reason && <p className="text-[10px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{formErrors.reason}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Target Date</Label>
                <Input type="date" value={formData.targetDate || ""} onChange={e => setFormData({ ...formData, targetDate: e.target.value })} className="text-xs h-8" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Successor App</Label>
                <Input value={formData.successor || ""} onChange={e => setFormData({ ...formData, successor: e.target.value })} placeholder="Replacement system" className="text-xs h-8" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Migration Effort <span className="text-destructive">*</span></Label>
                <div className={fieldCls("migrationEffort")}>
                  <MasterSelect category="migration_effort" value={formData.migrationEffort || ""} onChange={v => setFormData({ ...formData, migrationEffort: v })} placeholder="Select effort" />
                </div>
                {formErrors.migrationEffort && <p className="text-[10px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{formErrors.migrationEffort}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Budget (₹ Lakhs)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.budgetLakhs ?? ""}
                  onChange={e => setFormData({ ...formData, budgetLakhs: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="e.g. 25 for ₹25L"
                  className="text-xs h-8"
                />
                <p className="text-[10px] text-muted-foreground">Enter value in Lakhs (₹1L = ₹1,00,000)</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Status <span className="text-destructive">*</span></Label>
                <div className={fieldCls("status")}>
                  <MasterSelect category="retirement_status" value={formData.status || ""} onChange={v => setFormData({ ...formData, status: v })} placeholder="Select status" />
                </div>
                {formErrors.status && <p className="text-[10px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{formErrors.status}</p>}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Comments</Label>
              <Input value={formData.comments || ""} onChange={e => setFormData({ ...formData, comments: e.target.value })} placeholder="Additional notes" className="text-xs h-8" />
            </div>

            {/* Supporting Documents */}
            <div className="grid gap-2">
              <Label className="text-xs flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> Supporting Documents</Label>

              {/* Existing docs (edit mode) */}
              {editingItem && (existingDocs ?? []).length > 0 && (
                <div className="rounded-md border border-border divide-y divide-border">
                  {(existingDocs ?? []).map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate font-medium">{doc.fileName}</span>
                      {doc.fileSize && <span className="text-muted-foreground">{formatBytes(doc.fileSize)}</span>}
                      <a
                        href={`${BASE}/api/retirements/documents/${doc.id}/download`}
                        className="text-primary hover:underline"
                        download
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      {isAdmin && (
                        <button onClick={() => handleDeleteDoc(doc.id)} className="text-destructive hover:text-destructive/80">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Drop zone for new files */}
              <div
                className="border-2 border-dashed border-border rounded-md p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Drop files here or <span className="text-primary">click to browse</span></p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Max 20 MB per file · Multiple files supported</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    setPendingFiles(prev => [...prev, ...files]);
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Staged files list */}
              {pendingFiles.length > 0 && (
                <div className="rounded-md border border-border divide-y divide-border">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                      <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                      <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {formData.status === "Completed" && selectedAppId && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 mt-1">
              Marking as <strong>Completed</strong> will automatically update the linked application's status to <strong>Retired</strong> in Application Inventory.
            </p>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createItem.isPending || updateItem.isPending}>
              {(createItem.isPending || updateItem.isPending) ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
