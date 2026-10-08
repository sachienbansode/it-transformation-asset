import React, { useState, useMemo, useRef } from "react";
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
import { Plus, Trash2, Edit, Search, Monitor, Box, Eye, Wrench, Archive, Tag, AlertCircle, Loader2, Printer, Download } from "lucide-react";
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

const PAGE_SIZE = 10;
const STATUS_BADGE: Record<string, string> = {
  "In Stock": "border-blue-500/30 text-blue-600 bg-blue-50 dark:bg-blue-400/10",
  "Allocated": "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10",
  "In Use": "border-teal-500/30 text-teal-600 bg-teal-50 dark:bg-teal-400/10",
  "Under Maintenance": "border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-400/10",
  "Retired": "border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
  "Disposed": "border-red-500/30 text-red-600 bg-red-50 dark:bg-red-400/10",
};
const ASSET_TYPES = ["Laptop", "Desktop", "Server", "Network Switch", "Firewall", "Access Point", "Printer", "Tablet", "Mobile", "Storage", "UPS", "Others"];
const ASSET_STATUSES = ["In Stock", "Allocated", "In Use", "Under Maintenance", "Retired", "Disposed"];

/* ─── Asset Transaction History ─────────────────────────────────────────── */
function AssetHistory({ assetId, assetTag }: { assetId: number; assetTag: string }) {
  const { data: txns = [], isLoading } = useQuery({
    queryKey: ["asset-transactions", assetId],
    queryFn: () => apiFetch<any[]>(`/asset-transactions?assetId=${assetId}`),
    enabled: !!assetId,
  });

  const ACTION_COLORS: Record<string, string> = {
    "Allocation": "bg-emerald-500",
    "Bulk Allocation": "bg-emerald-600",
    "Return": "bg-blue-500",
    "Status Change": "bg-amber-500",
    "Maintenance Started": "bg-orange-500",
    "Maintenance Completed": "bg-teal-500",
  };

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading history…</div>;
  if (txns.length === 0) return (
    <div className="py-10 text-center">
      <div className="text-4xl mb-2">📋</div>
      <div className="text-sm text-muted-foreground">No transaction history for {assetTag}</div>
    </div>
  );

  return (
    <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
      {txns.map((t: any, i: number) => (
        <div key={t.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${ACTION_COLORS[t.action] || "bg-gray-400"}`} />
            {i < txns.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
          </div>
          <div className="pb-3 flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t.action}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{new Date(t.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
            {(t.oldStatus || t.newStatus) && (
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                {t.oldStatus && <span className="px-1.5 py-0.5 rounded bg-muted">{t.oldStatus}</span>}
                {t.oldStatus && t.newStatus && <span>→</span>}
                {t.newStatus && <span className="px-1.5 py-0.5 rounded bg-muted font-medium">{t.newStatus}</span>}
              </div>
            )}
            {t.userName && <div className="text-xs text-muted-foreground mt-0.5">by {t.userName}</div>}
            {t.notes && <div className="text-xs text-muted-foreground mt-0.5 italic">{t.notes}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Sticker Print Dialog ───────────────────────────────────────────────── */
function StickerPrintDialog({ asset, onClose }: { asset: any; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const content = printRef.current?.innerHTML || "";
    const win = window.open("", "_blank", "width=420,height=320");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Asset Sticker – ${asset.assetTag}</title><style>
      @page { size: 85mm 54mm; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
      body { width: 85mm; height: 54mm; background: white; }
    </style></head><body>${content}</body></html>`);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); setTimeout(() => win.close(), 500); };
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="w-4 h-4 text-[#d4a843]" />Asset Sticker Preview</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Preview below — print to a 85×54mm label (business card size).</p>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 flex justify-center">
          <div ref={printRef}>
            <div style={{ width: "320px", border: "1.5px solid #1a1a1a", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "5px", backgroundColor: "white", borderRadius: "4px", fontFamily: "Arial, sans-serif" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #ddd", paddingBottom: "5px", marginBottom: "3px" }}>
                <div>
                  <div style={{ fontSize: "8px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.8px", color: "#1a1a1a" }}>ASHIKA GROUP</div>
                  <div style={{ fontSize: "7px", color: "#666" }}>IT Asset Management · NIYTRI</div>
                </div>
                <div style={{ width: "28px", height: "28px", backgroundColor: "#d4a843", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: "14px", color: "white", fontWeight: "bold" }}>A</div>
                </div>
              </div>
              <div style={{ fontSize: "26px", fontWeight: "900", fontFamily: "Courier New, monospace", color: "#1a1a1a", letterSpacing: "1px", lineHeight: "1" }}>{asset.assetTag || "—"}</div>
              <div style={{ fontSize: "11px", fontWeight: "600", color: "#222", marginTop: "1px" }}>{asset.name || "—"}</div>
              <div style={{ display: "flex", gap: "12px", marginTop: "3px" }}>
                <div><div style={{ fontSize: "6.5px", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Type</div><div style={{ fontSize: "9px", fontWeight: "500" }}>{asset.type || "—"}</div></div>
                <div><div style={{ fontSize: "6.5px", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Serial No</div><div style={{ fontSize: "9px", fontWeight: "500", fontFamily: "Courier New, monospace" }}>{asset.serialNumber || "—"}</div></div>
                <div><div style={{ fontSize: "6.5px", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Dept</div><div style={{ fontSize: "9px", fontWeight: "500" }}>{asset.department || "—"}</div></div>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <div><div style={{ fontSize: "6.5px", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Location</div><div style={{ fontSize: "9px", fontWeight: "500" }}>{asset.location || "—"}</div></div>
                <div><div style={{ fontSize: "6.5px", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Vendor</div><div style={{ fontSize: "9px", fontWeight: "500" }}>{asset.vendorName || "—"}</div></div>
              </div>
              <div style={{ borderTop: "0.5px solid #eee", paddingTop: "4px", fontSize: "6px", color: "#bbb", textAlign: "center", marginTop: "2px" }}>
                Ashika Group · IT Department · {asset.purchaseDate ? `Purchased: ${asset.purchaseDate}` : new Date().getFullYear()}
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" />Print Sticker
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function AssetRegistry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [viewTab, setViewTab] = useState<"details" | "history">("details");
  const [stickerAsset, setStickerAsset] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [tagLoading, setTagLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });
  const { data: stats } = useQuery({ queryKey: ["assets-stats"], queryFn: () => apiFetch<any>("/assets/stats") });
  const { data: vendors = [] } = useQuery({ queryKey: ["asset-vendors"], queryFn: () => apiFetch<any[]>("/asset-vendors") });

  const createAsset = useMutation({ mutationFn: (data: any) => apiFetch("/assets", { method: "POST", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["assets"] }); queryClient.invalidateQueries({ queryKey: ["assets-stats"] }); } });
  const updateAsset = useMutation({ mutationFn: ({ id, ...data }: any) => apiFetch(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["assets"] }); queryClient.invalidateQueries({ queryKey: ["assets-stats"] }); } });
  const deleteAsset = useMutation({ mutationFn: (id: number) => apiFetch(`/assets/${id}`, { method: "DELETE" }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["assets"] }); queryClient.invalidateQueries({ queryKey: ["assets-stats"] }); } });

  const departments = [...new Set(assets.map((a: any) => a.department).filter(Boolean))];
  const filtered = useMemo(() => {
    let list = assets;
    if (search) list = list.filter((a: any) => [a.name, a.assetTag, a.ownerName, a.serialNumber, a.department].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterType) list = list.filter((a: any) => a.type === filterType);
    if (filterStatus) list = list.filter((a: any) => a.status === filterStatus);
    if (filterDept) list = list.filter((a: any) => a.department === filterDept);
    return list;
  }, [assets, search, filterType, filterStatus, filterDept]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeCount = assets.filter((a: any) => a.status === "Allocated" || a.status === "In Use").length;
  const stockCount = assets.filter((a: any) => a.status === "In Stock").length;
  const maintenanceCount = assets.filter((a: any) => a.status === "Under Maintenance").length;
  const retiredCount = assets.filter((a: any) => a.status === "Retired" || a.status === "Disposed").length;

  async function fetchNextTag(type: string) {
    if (!type) return;
    setTagLoading(true);
    try {
      const res = await apiFetch<any>(`/assets/next-tag?type=${encodeURIComponent(type)}`);
      setFormData((prev: any) => ({ ...prev, assetTag: res.tag }));
    } catch { /* ignore */ } finally { setTagLoading(false); }
  }

  function openCreate() {
    setEditingItem(null);
    setFormData({ status: "In Stock", vendorSelect: "" });
    setFormErrors({});
    setIsModalOpen(true);
  }

  function openEdit(item: any) {
    setEditingItem(item);
    const vendorIsOthers = item.vendorId == null && item.vendorName;
    setFormData({
      ...item,
      vendorSelect: item.vendorId ? String(item.vendorId) : (vendorIsOthers ? "__others__" : ""),
      vendorOthersName: vendorIsOthers ? item.vendorName : "",
    });
    setFormErrors({});
    setIsModalOpen(true);
  }

  function clearFilters() { setSearch(""); setFilterType(""); setFilterStatus(""); setFilterDept(""); setPage(1); }

  function setField(key: string, value: any) {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
    if (formErrors[key]) setFormErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!formData.name?.trim()) errors.name = "Name is required";
    if (!formData.type) errors.type = "Type is required";
    if (!formData.serialNumber?.trim()) errors.serialNumber = "Serial number is required";
    if (!formData.vendorSelect) errors.vendor = "Vendor is required";
    if (formData.vendorSelect === "__others__" && !formData.vendorOthersName?.trim()) errors.vendor = "Vendor is required — please enter the vendor name below";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    if (!validateForm()) return;
    const vendorId = formData.vendorSelect && formData.vendorSelect !== "__others__" ? parseInt(formData.vendorSelect) : undefined;
    const vendorObj = vendors.find((v: any) => v.id === vendorId);
    const vendorName = vendorId ? vendorObj?.name : formData.vendorOthersName?.trim();

    const payload = {
      assetTag: formData.assetTag,
      name: formData.name,
      type: formData.type,
      serialNumber: formData.serialNumber,
      status: formData.status || "In Stock",
      ownerName: formData.ownerName || null,
      department: formData.department || null,
      location: formData.location || null,
      purchaseDate: formData.purchaseDate || null,
      purchaseOrderNo: formData.purchaseOrderNo || null,
      cost: formData.cost || null,
      vendorId: vendorId || null,
      vendorName: vendorName || null,
      warrantyExpiry: formData.warrantyExpiry || null,
      ipAddress: formData.ipAddress || null,
      macAddress: formData.macAddress || null,
      osVersion: formData.osVersion || null,
      configuration: formData.configuration || null,
      notes: formData.notes || null,
    };

    try {
      if (editingItem) {
        await updateAsset.mutateAsync({ id: editingItem.id, ...payload });
        toast({ title: "Asset updated successfully" });
      } else {
        await createAsset.mutateAsync(payload);
        toast({ title: "Asset registered", description: `Tag: ${payload.assetTag}` });
      }
      setIsModalOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!await confirmDialog(`Delete asset "${name}"? This action cannot be undone.`)) return;
    try {
      await deleteAsset.mutateAsync(id);
      toast({ title: "Asset deleted" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset Registry</h1>
          <p className="text-sm text-muted-foreground">Manage all IT hardware and equipment — {user?.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToCsv(assets, [{label:"Asset Tag",key:"assetTag"},{label:"Name",key:"name"},{label:"Type",key:"type"},{label:"Serial No",key:"serialNumber"},{label:"Status",key:"status"},{label:"Owner",key:"ownerName"},{label:"Department",key:"department"},{label:"Location",key:"location"},{label:"Cost (₹)",key:"purchaseCost"},{label:"Manufacturer",key:"manufacturer"},{label:"Model",key:"model"},{label:"Warranty Expiry",key:"warrantyExpiry"},{label:"Purchase Date",key:"purchaseDate"}], "asset-registry.csv")} className="gap-1.5"><Download className="w-4 h-4" />Export CSV</Button>
          <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />Add Asset</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Box} label="Total Assets" value={assets.length} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Monitor} label="Active / In Use" value={activeCount} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" sub={`${stockCount} in stock`} />
        <StatCard icon={Wrench} label="Under Maintenance" value={maintenanceCount} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={Archive} label="Retired / Disposed" value={retiredCount} iconBg="bg-gray-100 dark:bg-gray-900/30" iconColor="text-gray-500" borderColor="border-l-gray-400" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name, tag, owner, serial..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterType} onValueChange={v => { setFilterType(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Types</SelectItem>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem>{ASSET_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={v => { setFilterDept(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Depts" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Departments</SelectItem>{departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
            {(search || filterType || filterStatus || filterDept) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">Clear Filters</Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground mb-2">Showing {filtered.length} of {assets.length} assets</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Asset Tag</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Serial No</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Cost (₹)</TableHead>
                <TableHead className="w-[110px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No assets found matching your filters</TableCell></TableRow>
              )}
              {paged.map((a: any) => (
                <TableRow key={a.id} className={a.status === "Retired" || a.status === "Disposed" ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-xs font-semibold text-[#b8922e]">{a.assetTag}</TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{a.type}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{a.serialNumber || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_BADGE[a.status] || ""}>{a.status}</Badge></TableCell>
                  <TableCell className="text-sm">{a.ownerName || "—"}</TableCell>
                  <TableCell className="text-sm">{a.department || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{a.location || "—"}</TableCell>
                  <TableCell className="text-sm text-right">{a.cost ? `₹${Number(a.cost).toLocaleString("en-IN")}` : "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setViewModal(a)} className="p-1.5 rounded hover:bg-muted" title="View details"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => setStickerAsset(a)} className="p-1.5 rounded hover:bg-muted" title="Print sticker"><Tag className="w-3.5 h-3.5 text-[#d4a843]" /></button>
                      <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-muted" title="Edit"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                      {isAdmin && <button onClick={() => handleDelete(a.id, a.name)} className="p-1.5 rounded hover:bg-muted" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </CardContent>
      </Card>

      {/* View Details Modal */}
      <Dialog open={!!viewModal} onOpenChange={() => { setViewModal(null); setViewTab("details"); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono text-[#d4a843]">{viewModal?.assetTag}</span>
              <span className="text-muted-foreground font-normal">— Asset Details</span>
            </DialogTitle>
          </DialogHeader>
          {/* Tab bar */}
          <div className="flex gap-1 border-b mb-4 -mx-1 px-1">
            {(["details", "history"] as const).map(tab => (
              <button key={tab} onClick={() => setViewTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize transition border-b-2 -mb-px ${viewTab === tab ? "border-[#d4a843] text-[#b8922e]" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {tab}
              </button>
            ))}
          </div>
          {viewModal && viewTab === "details" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {([
                  ["Name", viewModal.name], ["Type", viewModal.type],
                  ["Serial Number", viewModal.serialNumber], ["Status", viewModal.status],
                  ["Owner", viewModal.ownerName], ["Department", viewModal.department],
                  ["Location", viewModal.location], ["Purchase Date", viewModal.purchaseDate],
                  ["Cost", viewModal.cost ? `₹${Number(viewModal.cost).toLocaleString("en-IN")}` : "—"],
                  ["Vendor", viewModal.vendorName], ["Warranty Expiry", viewModal.warrantyExpiry],
                  ["IP Address", viewModal.ipAddress], ["MAC Address", viewModal.macAddress],
                  ["OS Version", viewModal.osVersion],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label}>
                    <div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">{label}</div>
                    <div className="font-medium mt-0.5">{value || "—"}</div>
                  </div>
                ))}
              </div>
              {viewModal.configuration && (
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Configuration</div>
                  <div className="font-medium mt-0.5 text-sm">{viewModal.configuration}</div>
                </div>
              )}
              {viewModal.notes && (
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Notes</div>
                  <div className="text-sm mt-0.5">{viewModal.notes}</div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setStickerAsset(viewModal); setViewModal(null); }}>
                  <Tag className="w-3.5 h-3.5" />Print Sticker
                </Button>
                <Button size="sm" className="gap-1.5 bg-[#d4a843] hover:bg-[#b8922e] text-white" onClick={() => { openEdit(viewModal); setViewModal(null); }}>
                  <Edit className="w-3.5 h-3.5" />Edit Asset
                </Button>
              </div>
            </div>
          )}
          {viewModal && viewTab === "history" && (
            <AssetHistory assetId={viewModal.id} assetTag={viewModal.assetTag} />
          )}
        </DialogContent>
      </Dialog>

      {/* Add / Edit Asset Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Box className="w-4 h-4" />
              {editingItem ? `Edit Asset — ${editingItem.assetTag}` : "Register New Asset"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">

            {/* Type — first so tag auto-generates */}
            <div>
              <Label className="text-xs font-medium">Asset Type <span className="text-red-500">*</span></Label>
              <Select
                value={formData.type || ""}
                onValueChange={v => {
                  setField("type", v);
                  if (!editingItem) fetchNextTag(v);
                }}
              >
                <SelectTrigger className={formErrors.type ? "border-red-500" : ""}><SelectValue placeholder="Select asset type" /></SelectTrigger>
                <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              {formErrors.type && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.type}</p>}
            </div>

            {/* Auto-generated Asset Tag */}
            <div>
              <Label className="text-xs font-medium flex items-center gap-1.5">
                Asset Tag / ID
                {tagLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                {!editingItem && !tagLoading && <span className="text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-normal">auto-generated</span>}
              </Label>
              <Input
                value={formData.assetTag || ""}
                readOnly
                className="bg-muted/60 font-mono text-sm cursor-not-allowed select-all border-dashed"
                placeholder={tagLoading ? "Generating…" : "Select type above →"}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">System-assigned · non-editable</p>
            </div>

            {/* Name */}
            <div>
              <Label className="text-xs font-medium">Asset Name <span className="text-red-500">*</span></Label>
              <Input value={formData.name || ""} onChange={e => setField("name", e.target.value)} placeholder="e.g. Dell Latitude 5540" className={formErrors.name ? "border-red-500" : ""} />
              {formErrors.name && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.name}</p>}
            </div>

            {/* Serial Number — mandatory */}
            <div>
              <Label className="text-xs font-medium">Serial Number <span className="text-red-500">*</span></Label>
              <Input
                value={formData.serialNumber || ""}
                onChange={e => setField("serialNumber", e.target.value)}
                placeholder="Manufacturer serial number"
                className={`font-mono text-sm ${formErrors.serialNumber ? "border-red-500" : ""}`}
              />
              {formErrors.serialNumber ? (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.serialNumber}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground mt-0.5">Must be unique per asset type</p>
              )}
            </div>

            {/* Vendor — mandatory dropdown */}
            <div className="col-span-2">
              <Label className="text-xs font-medium">Vendor <span className="text-red-500">*</span></Label>
              <Select
                value={formData.vendorSelect || ""}
                onValueChange={v => {
                  setField("vendorSelect", v);
                  if (v !== "__others__") setField("vendorOthersName", "");
                }}
              >
                <SelectTrigger className={formErrors.vendor ? "border-red-500" : ""}><SelectValue placeholder="Select vendor from master list" /></SelectTrigger>
                <SelectContent>
                  {(vendors as any[]).filter(v => v.status === "Active").map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                  ))}
                  {(vendors as any[]).filter(v => v.status !== "Active").length > 0 && (
                    <>
                      <div className="px-2 pt-2 pb-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide border-t">Inactive Vendors</div>
                      {(vendors as any[]).filter(v => v.status !== "Active").map((v: any) => (
                        <SelectItem key={v.id} value={String(v.id)} className="text-muted-foreground">{v.name}</SelectItem>
                      ))}
                    </>
                  )}
                  <div className="border-t mt-1">
                    <SelectItem value="__others__" className="text-[#d4a843] font-semibold">+ Others (not in vendor master)</SelectItem>
                  </div>
                </SelectContent>
              </Select>
              {formErrors.vendor && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.vendor}</p>}

              {/* Others — free-text input */}
              {formData.vendorSelect === "__others__" && (
                <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <Label className="text-xs font-medium text-amber-800 dark:text-amber-300">Enter Vendor Name <span className="text-red-500">*</span></Label>
                  <Input
                    value={formData.vendorOthersName || ""}
                    onChange={e => setField("vendorOthersName", e.target.value)}
                    placeholder="Type vendor name…"
                    className="mt-1"
                    autoFocus
                  />
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">This vendor is not in the master list. Consider adding them via the Asset Management → Vendors tab.</p>
                </div>
              )}
            </div>

            {/* Status */}
            <div>
              <Label className="text-xs font-medium">Status</Label>
              <Select value={formData.status || "In Stock"} onValueChange={v => setField("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ASSET_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Owner */}
            <div>
              <Label className="text-xs font-medium">Owner / Assigned To</Label>
              <Input value={formData.ownerName || ""} onChange={e => setField("ownerName", e.target.value)} placeholder="Employee name" />
            </div>

            {/* Department */}
            <div>
              <Label className="text-xs font-medium">Department</Label>
              <Input value={formData.department || ""} onChange={e => setField("department", e.target.value)} />
            </div>

            {/* Location */}
            <div>
              <Label className="text-xs font-medium">Location</Label>
              <Input value={formData.location || ""} onChange={e => setField("location", e.target.value)} placeholder="e.g. Mumbai HQ — Floor 3, Rack A" />
            </div>

            {/* Purchase Date */}
            <div>
              <Label className="text-xs font-medium">Purchase Date</Label>
              <Input type="date" value={formData.purchaseDate || ""} onChange={e => setField("purchaseDate", e.target.value)} />
            </div>

            {/* Cost */}
            <div>
              <Label className="text-xs font-medium">Cost (₹)</Label>
              <Input type="number" value={formData.cost || ""} onChange={e => setField("cost", e.target.value)} placeholder="0" />
            </div>

            {/* Warranty Expiry */}
            <div>
              <Label className="text-xs font-medium">Warranty Expiry</Label>
              <Input type="date" value={formData.warrantyExpiry || ""} onChange={e => setField("warrantyExpiry", e.target.value)} />
            </div>

            {/* PO Number */}
            <div>
              <Label className="text-xs font-medium">Purchase Order No.</Label>
              <Input value={formData.purchaseOrderNo || ""} onChange={e => setField("purchaseOrderNo", e.target.value)} placeholder="PO-XXXX" />
            </div>

            {/* IP Address */}
            <div>
              <Label className="text-xs font-medium">IP Address</Label>
              <Input value={formData.ipAddress || ""} onChange={e => setField("ipAddress", e.target.value)} placeholder="192.168.x.x" className="font-mono" />
            </div>

            {/* MAC Address */}
            <div>
              <Label className="text-xs font-medium">MAC Address</Label>
              <Input value={formData.macAddress || ""} onChange={e => setField("macAddress", e.target.value)} placeholder="XX:XX:XX:XX:XX:XX" className="font-mono" />
            </div>

            {/* OS Version */}
            <div>
              <Label className="text-xs font-medium">OS / Firmware Version</Label>
              <Input value={formData.osVersion || ""} onChange={e => setField("osVersion", e.target.value)} placeholder="e.g. Windows 11 Pro 23H2" />
            </div>

            {/* Configuration */}
            <div className="col-span-2">
              <Label className="text-xs font-medium">Configuration / Specs</Label>
              <Input value={formData.configuration || ""} onChange={e => setField("configuration", e.target.value)} placeholder="e.g. Intel i7, 16GB RAM, 512GB SSD" />
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea value={formData.notes || ""} onChange={e => setField("notes", e.target.value)} rows={2} placeholder="Any additional remarks…" />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createAsset.isPending || updateAsset.isPending || tagLoading}
              className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"
            >
              {(createAsset.isPending || updateAsset.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingItem ? "Update Asset" : "Register Asset"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sticker Print */}
      {stickerAsset && <StickerPrintDialog asset={stickerAsset} onClose={() => setStickerAsset(null)} />}
    </div>
  );
}
