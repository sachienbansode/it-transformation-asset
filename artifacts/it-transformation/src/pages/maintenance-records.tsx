import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Search, Wrench, CheckCircle2, Clock, AlertTriangle, XCircle, CalendarClock, DollarSign, Loader2, AlertCircle, Download } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";

function exportToCsv(rows: any[], cols: { label: string; key: string }[], filename: string) {
  const esc = (v: any) => { const s = String(v ?? "").replace(/"/g, '""'); return /[,"\n]/.test(s) ? `"${s}"` : s; };
  const csv = [cols.map(c => c.label).join(","), ...rows.map(r => cols.map(c => esc(r[c.key])).join(","))].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

const PAGE_SIZE = 15;

const MAINTENANCE_TYPES = ["Preventive", "Corrective", "Reactive", "Emergency", "Upgrade", "Inspection"];
const MAINTENANCE_STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled"];

const STATUS_BADGE: Record<string, string> = {
  "Scheduled": "border-blue-500/30 text-blue-600 bg-blue-50 dark:bg-blue-400/10",
  "In Progress": "border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-400/10",
  "Completed": "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10",
  "Cancelled": "border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
};
const TYPE_BADGE: Record<string, string> = {
  "Preventive": "border-teal-500/30 text-teal-600 bg-teal-50 dark:bg-teal-400/10",
  "Corrective": "border-orange-500/30 text-orange-600 bg-orange-50 dark:bg-orange-400/10",
  "Reactive": "border-red-500/30 text-red-600 bg-red-50 dark:bg-red-400/10",
  "Emergency": "border-red-600/40 text-red-700 bg-red-100 dark:bg-red-400/20 font-semibold",
  "Upgrade": "border-purple-500/30 text-purple-600 bg-purple-50 dark:bg-purple-400/10",
  "Inspection": "border-slate-500/30 text-slate-600 bg-slate-50 dark:bg-slate-400/10",
};

export default function MaintenanceRecords() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAsset, setFilterAsset] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: records = [] } = useQuery({ queryKey: ["maintenance-records"], queryFn: () => apiFetch<any[]>("/maintenance-records") });
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });

  const createRecord = useMutation({
    mutationFn: (data: any) => apiFetch("/maintenance-records", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance-records"] }),
  });
  const updateRecord = useMutation({
    mutationFn: ({ id, ...data }: any) => apiFetch(`/maintenance-records/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["maintenance-records"] }); queryClient.invalidateQueries({ queryKey: ["assets"] }); },
  });
  const deleteRecord = useMutation({
    mutationFn: (id: number) => apiFetch(`/maintenance-records/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance-records"] }),
  });

  const assetOptions = useMemo(() => assets.map((a: any) => ({ id: a.id, label: `${a.assetTag} — ${a.name}`, type: a.type })).sort((a: any, b: any) => a.label.localeCompare(b.label)), [assets]);

  const filtered = useMemo(() => {
    let list = records;
    if (search) list = list.filter((r: any) => [r.description, r.type, r.vendorName, r.notes].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterType) list = list.filter((r: any) => r.type === filterType);
    if (filterStatus) list = list.filter((r: any) => r.status === filterStatus);
    if (filterAsset) list = list.filter((r: any) => r.assetId === parseInt(filterAsset));
    return list;
  }, [records, search, filterType, filterStatus, filterAsset]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const scheduled = records.filter((r: any) => r.status === "Scheduled").length;
  const inProgress = records.filter((r: any) => r.status === "In Progress").length;
  const completed = records.filter((r: any) => r.status === "Completed").length;
  const totalCost = records.reduce((s: number, r: any) => s + Number(r.cost || 0), 0);

  function setField(key: string, value: any) {
    setFormData((p: any) => ({ ...p, [key]: value }));
    if (formErrors[key]) setFormErrors(p => { const n = { ...p }; delete n[key]; return n; });
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!formData.assetId) errors.assetId = "Asset is required";
    if (!formData.type) errors.type = "Type is required";
    if (!formData.description?.trim()) errors.description = "Description is required";
    if (!formData.status) errors.status = "Status is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function openCreate() {
    setEditingItem(null);
    setFormData({ status: "Scheduled", type: "Preventive", scheduledDate: new Date().toISOString().split("T")[0] });
    setFormErrors({});
    setIsModalOpen(true);
  }

  function openEdit(item: any) {
    setEditingItem(item);
    setFormData({ ...item });
    setFormErrors({});
    setIsModalOpen(true);
  }

  async function handleSave() {
    if (!validate()) return;
    if (!await confirmDialog(editingItem ? "Save changes to this maintenance record?" : "Create this maintenance record?", { title: editingItem ? "Update maintenance" : "Schedule maintenance", confirmText: editingItem ? "Save changes" : "Create" })) return;
    try {
      if (editingItem) {
        await updateRecord.mutateAsync({ id: editingItem.id, ...formData });
        toast({ title: "Maintenance record updated" });
      } else {
        await createRecord.mutateAsync(formData);
        toast({ title: "Maintenance record created" });
      }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number) {
    if (!await confirmDialog("Delete this maintenance record?")) return;
    try {
      await deleteRecord.mutateAsync(id);
      toast({ title: "Record deleted" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  function getAssetLabel(assetId: number) {
    const a = assets.find((x: any) => x.id === assetId);
    return a ? `${a.assetTag} — ${a.name}` : `Asset #${assetId}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Maintenance Records</h1>
          <p className="text-sm text-muted-foreground">Track scheduled and completed IT asset maintenance — {user?.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { const enriched = records.map((r: any) => { const asset = assets.find((a: any) => a.id === r.assetId); return { ...r, assetTag: asset?.assetTag || "", assetName: asset?.name || "" }; }); exportToCsv(enriched, [{label:"Asset Tag",key:"assetTag"},{label:"Asset Name",key:"assetName"},{label:"Type",key:"type"},{label:"Description",key:"description"},{label:"Scheduled Date",key:"scheduledDate"},{label:"Completed Date",key:"completedDate"},{label:"Vendor",key:"vendorName"},{label:"Cost (₹)",key:"cost"},{label:"Status",key:"status"}], "maintenance-records.csv"); }} className="gap-1.5"><Download className="w-4 h-4" />Export CSV</Button>
          <Button onClick={openCreate} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white gap-2"><Plus className="w-4 h-4" />New Record</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={CalendarClock} label="Scheduled" value={scheduled} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Clock} label="In Progress" value={inProgress} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={CheckCircle2} label="Completed" value={completed} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" sub={`${records.length} total`} />
        <StatCard icon={DollarSign} label="Total Cost (₹)" value={`₹${totalCost.toLocaleString("en-IN")}`} iconBg="bg-gray-100 dark:bg-gray-900/30" iconColor="text-gray-600" borderColor="border-l-gray-400" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search description, vendor…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterType} onValueChange={v => { setFilterType(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Types</SelectItem>{MAINTENANCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem>{MAINTENANCE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterAsset} onValueChange={v => { setFilterAsset(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Assets" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assets</SelectItem>
                {assetOptions.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {(search || filterType || filterStatus || filterAsset) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterType(""); setFilterStatus(""); setFilterAsset(""); setPage(1); }}>Clear</Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground mb-2">Showing {filtered.length} of {records.length} records</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Cost (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[90px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No maintenance records found.</TableCell></TableRow>
              )}
              {paged.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs font-semibold text-[#1B63D6]">{getAssetLabel(r.assetId)}</TableCell>
                  <TableCell><Badge variant="outline" className={TYPE_BADGE[r.type] || ""}>{r.type}</Badge></TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate" title={r.description}>{r.description || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.scheduledDate || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.completedDate || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.vendorName || "—"}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{r.cost ? `₹${Number(r.cost).toLocaleString("en-IN")}` : "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_BADGE[r.status] || ""}>{r.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-muted" title="Edit"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                      {isAdmin && <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded hover:bg-muted" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-[#2D7FF9]" />
              {editingItem ? "Edit Maintenance Record" : "New Maintenance Record"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">

            {/* Asset */}
            <div className="col-span-2">
              <Label className="text-xs font-medium">Asset <span className="text-red-500">*</span></Label>
              <Select value={formData.assetId ? String(formData.assetId) : ""} onValueChange={v => setField("assetId", parseInt(v))}>
                <SelectTrigger className={formErrors.assetId ? "border-red-500" : ""}><SelectValue placeholder="Select asset…" /></SelectTrigger>
                <SelectContent>{assetOptions.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
              {formErrors.assetId && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.assetId}</p>}
            </div>

            {/* Type */}
            <div>
              <Label className="text-xs font-medium">Maintenance Type <span className="text-red-500">*</span></Label>
              <Select value={formData.type || ""} onValueChange={v => setField("type", v)}>
                <SelectTrigger className={formErrors.type ? "border-red-500" : ""}><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{MAINTENANCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              {formErrors.type && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.type}</p>}
            </div>

            {/* Status */}
            <div>
              <Label className="text-xs font-medium">Status <span className="text-red-500">*</span></Label>
              <Select value={formData.status || ""} onValueChange={v => setField("status", v)}>
                <SelectTrigger className={formErrors.status ? "border-red-500" : ""}><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>{MAINTENANCE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              {formErrors.status && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.status}</p>}
            </div>

            {/* Description */}
            <div className="col-span-2">
              <Label className="text-xs font-medium">Description <span className="text-red-500">*</span></Label>
              <Textarea value={formData.description || ""} onChange={e => setField("description", e.target.value)} rows={2} placeholder="What maintenance work is being done?" className={formErrors.description ? "border-red-500" : ""} />
              {formErrors.description && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.description}</p>}
            </div>

            {/* Scheduled Date */}
            <div>
              <Label className="text-xs font-medium">Scheduled Date</Label>
              <Input type="date" value={formData.scheduledDate || ""} onChange={e => setField("scheduledDate", e.target.value)} />
            </div>

            {/* Completed Date */}
            <div>
              <Label className="text-xs font-medium">Completed Date</Label>
              <Input type="date" value={formData.completedDate || ""} onChange={e => setField("completedDate", e.target.value)} />
            </div>

            {/* Vendor */}
            <div>
              <Label className="text-xs font-medium">Vendor / Technician</Label>
              <Input value={formData.vendorName || ""} onChange={e => setField("vendorName", e.target.value)} placeholder="e.g. Dell Support" />
            </div>

            {/* Cost */}
            <div>
              <Label className="text-xs font-medium">Cost (₹)</Label>
              <Input type="number" value={formData.cost || ""} onChange={e => setField("cost", e.target.value)} placeholder="0" />
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea value={formData.notes || ""} onChange={e => setField("notes", e.target.value)} rows={2} placeholder="Any additional notes…" />
            </div>
          </div>
          <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-2 flex justify-end gap-2 border-t bg-background px-6 py-3 sm:rounded-b-lg">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createRecord.isPending || updateRecord.isPending}
              className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white gap-2"
            >
              {(createRecord.isPending || updateRecord.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingItem ? "Update Record" : "Create Record"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
