import React, { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Search, HardDrive, Box, Package, TrendingUp, FileText, Printer, Tag, AlertCircle, Loader2 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch, API } from "@/lib/api";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { fmtDate } from "@/lib/date";

const PAGE_SIZE = 10;
const COLORS = ["#2D7FF9", "#0f766e", "#2563eb", "#dc2626", "#8b5cf6", "#ea580c", "#059669", "#6366f1"];

const ASSET_TYPES = ["Laptop", "Desktop", "Server", "Network Switch", "Firewall", "Access Point", "Printer", "Tablet", "Mobile", "Storage", "UPS", "Others"];

const STATUS_BADGE: Record<string, string> = {
  "In Stock": "border-blue-500/30 text-blue-600 bg-blue-50 dark:bg-blue-400/10",
  "Allocated": "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10",
  "In Use": "border-teal-500/30 text-teal-600 bg-teal-50 dark:bg-teal-400/10",
  "Under Maintenance": "border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-400/10",
  "Retired": "border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
  "Disposed": "border-red-500/30 text-red-600 bg-red-50 dark:bg-red-400/10",
};

/* ─── Asset Sticker Print ─────────────────────────────────────────────────── */
function StickerPrintDialog({ asset, onClose }: { asset: any; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const content = printRef.current?.innerHTML || "";
    const win = window.open("", "_blank", "width=400,height=300");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Asset Sticker</title><style>
      @page { size: 85mm 54mm; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Arial', sans-serif; }
      body { width: 85mm; height: 54mm; display: flex; align-items: stretch; justify-content: stretch; background: white; }
      .sticker { width: 85mm; height: 54mm; padding: 4mm 5mm; border: 1.5px solid #1a1a1a; display: flex; flex-direction: column; justify-content: space-between; }
      .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #ccc; padding-bottom: 2mm; margin-bottom: 2mm; }
      .org { font-size: 7pt; font-weight: bold; color: #1a1a1a; letter-spacing: 0.5px; text-transform: uppercase; }
      .dept { font-size: 6pt; color: #555; }
      .asset-tag { font-size: 18pt; font-weight: 900; font-family: 'Courier New', monospace; color: #1a1a1a; letter-spacing: 1px; line-height: 1; }
      .name { font-size: 8pt; color: #222; margin-top: 1mm; font-weight: 600; }
      .row { display: flex; gap: 6mm; margin-top: 1.5mm; }
      .field { flex: 1; }
      .field-label { font-size: 5.5pt; color: #888; text-transform: uppercase; letter-spacing: 0.3px; }
      .field-value { font-size: 7pt; color: #222; font-weight: 500; }
      .footer { font-size: 5pt; color: #aaa; border-top: 0.5px solid #eee; padding-top: 1.5mm; text-align: center; }
      .barcode-placeholder { font-family: 'Courier New', monospace; font-size: 10pt; letter-spacing: 3px; color: #333; }
    </style></head><body>${content}</body></html>`);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); win.close(); };
  }

  const tag = asset.assetTag || "—";
  const name = asset.name || "—";
  const type = asset.type || "—";
  const serial = asset.serialNumber || "—";
  const location = asset.location || "—";
  const dept = asset.department || "—";
  const purchaseDate = asset.purchaseDate || "—";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="w-4 h-4" />Asset Sticker Preview</DialogTitle></DialogHeader>
        <div className="bg-gray-50 p-4 rounded-lg flex items-center justify-center">
          <div ref={printRef} style={{ fontFamily: "Arial, sans-serif", width: "320px" }}>
            <div className="sticker" style={{ border: "1.5px solid #1a1a1a", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "6px", backgroundColor: "white", borderRadius: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #ddd", paddingBottom: "6px" }}>
                <div>
                  <div style={{ fontSize: "8px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.8px", color: "#1a1a1a" }}>ASHIKA GROUP</div>
                  <div style={{ fontSize: "7px", color: "#666" }}>IT Asset Management</div>
                </div>
                <div style={{ fontSize: "6px", color: "#999", textAlign: "right" }}>NIYTRI</div>
              </div>
              <div style={{ fontSize: "28px", fontWeight: "900", fontFamily: "Courier New, monospace", color: "#1a1a1a", letterSpacing: "1px", lineHeight: "1" }}>{tag}</div>
              <div style={{ fontSize: "11px", fontWeight: "600", color: "#222" }}>{name}</div>
              <div style={{ display: "flex", gap: "16px", marginTop: "2px" }}>
                <div>
                  <div style={{ fontSize: "7px", color: "#888", textTransform: "uppercase" }}>Type</div>
                  <div style={{ fontSize: "9px", fontWeight: "500" }}>{type}</div>
                </div>
                <div>
                  <div style={{ fontSize: "7px", color: "#888", textTransform: "uppercase" }}>Serial No</div>
                  <div style={{ fontSize: "9px", fontWeight: "500", fontFamily: "Courier New, monospace" }}>{serial}</div>
                </div>
                <div>
                  <div style={{ fontSize: "7px", color: "#888", textTransform: "uppercase" }}>Dept</div>
                  <div style={{ fontSize: "9px", fontWeight: "500" }}>{dept}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "16px" }}>
                <div>
                  <div style={{ fontSize: "7px", color: "#888", textTransform: "uppercase" }}>Location</div>
                  <div style={{ fontSize: "9px", fontWeight: "500" }}>{location}</div>
                </div>
                <div>
                  <div style={{ fontSize: "7px", color: "#888", textTransform: "uppercase" }}>Purchase Date</div>
                  <div style={{ fontSize: "9px", fontWeight: "500" }}>{purchaseDate}</div>
                </div>
              </div>
              <div style={{ borderTop: "0.5px solid #eee", paddingTop: "4px", fontSize: "7px", color: "#bbb", textAlign: "center" }}>
                Ashika Group · IT Department · {new Date().getFullYear()}
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" />Print Sticker
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function AssetManagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [stickerAsset, setStickerAsset] = useState<any>(null);
  const [tagLoading, setTagLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });
  const { data: stats } = useQuery({ queryKey: ["assets-stats"], queryFn: () => apiFetch<any>("/assets/stats") });
  const { data: vendors = [] } = useQuery({ queryKey: ["asset-vendors"], queryFn: () => apiFetch<any[]>("/asset-vendors") });
  const { data: licenses = [] } = useQuery({ queryKey: ["asset-licenses"], queryFn: () => apiFetch<any[]>("/asset-licenses") });
  const { data: allocations = [] } = useQuery({ queryKey: ["asset-allocations"], queryFn: () => apiFetch<any[]>("/asset-allocations") });

  const createAsset = useMutation({ mutationFn: (data: any) => apiFetch("/assets", { method: "POST", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["assets"] }); queryClient.invalidateQueries({ queryKey: ["assets-stats"] }); } });
  const updateAsset = useMutation({ mutationFn: ({ id, ...data }: any) => apiFetch(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["assets"] }); queryClient.invalidateQueries({ queryKey: ["assets-stats"] }); } });
  const deleteAsset = useMutation({ mutationFn: (id: number) => apiFetch(`/assets/${id}`, { method: "DELETE" }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["assets"] }); queryClient.invalidateQueries({ queryKey: ["assets-stats"] }); } });

  const filtered = useMemo(() => {
    let list = assets;
    if (search) list = list.filter((a: any) => [a.name, a.assetTag, a.ownerName, a.department, a.serialNumber].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterType) list = list.filter((a: any) => a.type === filterType);
    if (filterStatus) list = list.filter((a: any) => a.status === filterStatus);
    return list;
  }, [assets, search, filterType, filterStatus]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const types = [...new Set(assets.map((a: any) => a.type))];
  const statuses = [...new Set(assets.map((a: any) => a.status))];

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

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!formData.name?.trim()) errors.name = "Name is required";
    if (!formData.type) errors.type = "Type is required";
    if (!formData.serialNumber?.trim()) errors.serialNumber = "Serial number is required";
    if (!formData.vendorSelect) errors.vendor = "Vendor is required";
    if (formData.vendorSelect === "__others__" && !formData.vendorOthersName?.trim()) {
      errors.vendor = "Please enter vendor name";
    }
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
      ownerName: formData.ownerName,
      department: formData.department,
      location: formData.location,
      purchaseDate: formData.purchaseDate,
      purchaseOrderNo: formData.purchaseOrderNo,
      cost: formData.cost || null,
      vendorId: vendorId || null,
      vendorName: vendorName || null,
      warrantyExpiry: formData.warrantyExpiry,
      ipAddress: formData.ipAddress,
      macAddress: formData.macAddress,
      osVersion: formData.osVersion,
      configuration: formData.configuration,
      notes: formData.notes,
    };

    try {
      if (editingItem) {
        await updateAsset.mutateAsync({ id: editingItem.id, ...payload });
        toast({ title: "Asset updated" });
      } else {
        await createAsset.mutateAsync(payload);
        toast({ title: "Asset created successfully", description: `Asset tag: ${payload.assetTag}` });
      }
      setIsModalOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  function setField(key: string, value: any) {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
    if (formErrors[key]) setFormErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  const statusData = stats?.byStatus?.map((s: any) => ({ name: s.status, value: s.count })) || [];
  const typeData = stats?.byType?.map((t: any) => ({ name: t.type, value: t.count })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">IT Asset Management</h1>
          <p className="text-sm text-muted-foreground">NIYTRI Asset Management Module — {assets.length} assets registered</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { window.open(`${API}/export/asset-management-doc`, "_blank"); }} className="gap-2"><FileText className="w-4 h-4" />Export DOCX</Button>
          {isAdmin && <Button onClick={openCreate} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white"><Plus className="w-4 h-4 mr-2" />Add Asset</Button>}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="registry">Asset Registry</TabsTrigger>
          <TabsTrigger value="vendors">Vendors ({vendors.length})</TabsTrigger>
          <TabsTrigger value="licenses">Licenses ({licenses.length})</TabsTrigger>
          <TabsTrigger value="allocations">Allocations ({allocations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Box} label="Total Assets" value={stats?.total || 0} />
            <StatCard icon={Package} label="Active Vendors" value={vendors.length} />
            <StatCard icon={HardDrive} label="Software Licenses" value={licenses.length} />
            <StatCard icon={TrendingUp} label="Total Asset Value" value={`₹${(Number(stats?.totalCost || 0) / 100000).toFixed(1)}L`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Assets by Status</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart><Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Legend /><Tooltip /></PieChart>
              </ResponsiveContainer>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Assets by Type</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={typeData}><XAxis dataKey="name" fontSize={11} /><YAxis /><Tooltip /><Bar dataKey="value" fill="#2D7FF9" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
          <Card className="p-4">
            <h3 className="font-semibold mb-3">License Utilization</h3>
            <div className="space-y-3">
              {licenses.map((lic: any) => (
                <div key={lic.id} className="flex items-center gap-3">
                  <span className="text-sm w-48 truncate">{lic.productName}</span>
                  <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(lic.seatsUsed / lic.seatsTotal) * 100}%`, backgroundColor: (lic.seatsUsed / lic.seatsTotal) > 0.9 ? "#dc2626" : (lic.seatsUsed / lic.seatsTotal) > 0.7 ? "#2D7FF9" : "#059669" }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-20 text-right">{lic.seatsUsed}/{lic.seatsTotal} seats</span>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="registry" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search assets..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div>
            <Select value={filterType} onValueChange={v => { setFilterType(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Types</SelectItem>{types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem>{statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Asset Tag</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Serial No</TableHead><TableHead>Status</TableHead><TableHead>Owner</TableHead><TableHead>Location</TableHead><TableHead>Cost (₹)</TableHead>{isAdmin && <TableHead className="w-28">Actions</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {paged.map((a: any) => (
                  <TableRow key={a.id} className={a.status === "Retired" ? "opacity-50" : ""}>
                    <TableCell className="font-mono text-xs font-semibold">{a.assetTag}</TableCell>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{a.type}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.serialNumber || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_BADGE[a.status] || ""}>{a.status}</Badge></TableCell>
                    <TableCell className="text-sm">{a.ownerName || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[130px] truncate">{a.location || "—"}</TableCell>
                    <TableCell className="text-sm">{a.cost ? `₹${Number(a.cost).toLocaleString("en-IN")}` : "—"}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <button onClick={() => setStickerAsset(a)} className="p-1 hover:text-[#2D7FF9]" title="Print sticker"><Tag className="w-3.5 h-3.5" /></button>
                          <button onClick={() => openEdit(a)} className="p-1 hover:text-blue-600" title="Edit"><Edit className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { deleteAsset.mutate(a.id); toast({ title: "Asset deleted" }); }} className="p-1 hover:text-red-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </TabsContent>

        <TabsContent value="vendors" className="space-y-4">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Vendor Name</TableHead><TableHead>Contact Person</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Contract Period</TableHead><TableHead>Rating</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {vendors.map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>{v.contactPerson || "—"}</TableCell>
                    <TableCell className="text-sm">{v.email || "—"}</TableCell>
                    <TableCell className="text-sm">{v.phone || "—"}</TableCell>
                    <TableCell className="text-xs">{v.contractStart && v.contractEnd ? `${v.contractStart} — ${v.contractEnd}` : "—"}</TableCell>
                    <TableCell>{v.rating ? "⭐".repeat(v.rating) : "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={v.status === "Active" ? "border-emerald-500/30 text-emerald-600 bg-emerald-50" : ""}>{v.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="licenses" className="space-y-4">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Product</TableHead><TableHead>Vendor</TableHead><TableHead>Type</TableHead><TableHead>Expiry</TableHead><TableHead>Usage</TableHead><TableHead>Cost (₹)</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {licenses.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.productName}</TableCell>
                    <TableCell>{l.vendorName || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{l.licenseType}</Badge></TableCell>
                    <TableCell className="text-sm">{l.expiryDate ? fmtDate(l.expiryDate) : "Perpetual"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-muted rounded-full h-2"><div className="h-full rounded-full" style={{ width: `${(l.seatsUsed / l.seatsTotal) * 100}%`, backgroundColor: (l.seatsUsed / l.seatsTotal) > 0.9 ? "#dc2626" : "#059669" }} /></div>
                        <span className="text-xs">{l.seatsUsed}/{l.seatsTotal}</span>
                      </div>
                    </TableCell>
                    <TableCell>₹{Number(l.cost || 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell><Badge variant="outline" className={l.status === "Active" ? "border-emerald-500/30 text-emerald-600 bg-emerald-50" : l.status === "Expiring Soon" ? "border-amber-500/30 text-amber-600 bg-amber-50" : ""}>{l.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="allocations" className="space-y-4">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Asset ID</TableHead><TableHead>Assigned To</TableHead><TableHead>Department</TableHead><TableHead>Start Date</TableHead><TableHead>End Date</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {allocations.map((a: any) => {
                  const asset = assets.find((x: any) => x.id === a.assetId);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{asset?.assetTag || `#${a.assetId}`}</TableCell>
                      <TableCell className="font-medium">{a.userName || "—"}</TableCell>
                      <TableCell>{a.department || "—"}</TableCell>
                      <TableCell className="text-sm">{a.startDate ? fmtDate(a.startDate) : "—"}</TableCell>
                      <TableCell className="text-sm">{a.endDate ? fmtDate(a.endDate) : "Active"}</TableCell>
                      <TableCell><Badge variant="outline" className={a.status === "Active" ? "border-emerald-500/30 text-emerald-600 bg-emerald-50" : ""}>{a.status}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Asset Create / Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Box className="w-4 h-4" />
              {editingItem ? "Edit Asset" : "Register New Asset"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">

            {/* Type — must come before Asset Tag so auto-gen works */}
            <div>
              <Label className="text-xs font-medium">Asset Type <span className="text-red-500">*</span></Label>
              <Select
                value={formData.type || ""}
                onValueChange={v => {
                  setField("type", v);
                  if (!editingItem) fetchNextTag(v);
                }}
              >
                <SelectTrigger className={formErrors.type ? "border-red-500" : ""}><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              {formErrors.type && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.type}</p>}
            </div>

            {/* Auto-generated Asset Tag */}
            <div>
              <Label className="text-xs font-medium flex items-center gap-1">
                Asset Tag / ID
                {tagLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                {!editingItem && <span className="text-[10px] text-muted-foreground font-normal">(auto-generated)</span>}
              </Label>
              <Input
                value={formData.assetTag || ""}
                readOnly
                className="bg-muted/50 font-mono text-sm cursor-not-allowed"
                placeholder={tagLoading ? "Generating..." : "Select type to generate"}
              />
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
                className={`font-mono ${formErrors.serialNumber ? "border-red-500" : ""}`}
              />
              {formErrors.serialNumber && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.serialNumber}</p>}
              <p className="text-[10px] text-muted-foreground mt-0.5">Must be unique per asset type</p>
            </div>

            {/* Vendor — mandatory dropdown */}
            <div className="col-span-2">
              <Label className="text-xs font-medium">Vendor <span className="text-red-500">*</span></Label>
              <Select
                value={formData.vendorSelect || ""}
                onValueChange={v => {
                  setField("vendorSelect", v);
                  if (formErrors.vendor) setFormErrors(prev => { const n = { ...prev }; delete n.vendor; return n; });
                }}
              >
                <SelectTrigger className={formErrors.vendor ? "border-red-500" : ""}><SelectValue placeholder="Select a vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.filter((v: any) => v.status === "Active").map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                  ))}
                  {vendors.filter((v: any) => v.status !== "Active").length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide border-t mt-1 pt-2">Inactive Vendors</div>
                      {vendors.filter((v: any) => v.status !== "Active").map((v: any) => (
                        <SelectItem key={v.id} value={String(v.id)} className="text-muted-foreground">{v.name}</SelectItem>
                      ))}
                    </>
                  )}
                  <div className="border-t mt-1"><SelectItem value="__others__" className="text-[#2D7FF9] font-medium">+ Others (not in vendor master)</SelectItem></div>
                </SelectContent>
              </Select>
              {formErrors.vendor && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.vendor}</p>}
              {/* Others text input */}
              {formData.vendorSelect === "__others__" && (
                <div className="mt-2">
                  <Input
                    value={formData.vendorOthersName || ""}
                    onChange={e => setField("vendorOthersName", e.target.value)}
                    placeholder="Enter vendor name *"
                    className={`${!formData.vendorOthersName?.trim() && formErrors.vendor ? "border-red-500" : ""}`}
                    autoFocus
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">This vendor is not in the master list. Consider adding them via Vendor management.</p>
                </div>
              )}
            </div>

            {/* Status */}
            <div>
              <Label className="text-xs font-medium">Status</Label>
              <Select value={formData.status || "In Stock"} onValueChange={v => setField("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["In Stock", "Allocated", "In Use", "Under Maintenance", "Retired", "Disposed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
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
              <Input value={formData.location || ""} onChange={e => setField("location", e.target.value)} placeholder="e.g. Mumbai HQ — Floor 3" />
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
              <Input value={formData.configuration || ""} onChange={e => setField("configuration", e.target.value)} placeholder="e.g. Intel i7-13th, 16GB RAM, 512GB SSD" />
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea value={formData.notes || ""} onChange={e => setField("notes", e.target.value)} rows={2} placeholder="Any additional remarks..." />
            </div>
          </div>

          <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-2 flex justify-end gap-2 border-t bg-background px-6 py-3 sm:rounded-b-lg">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createAsset.isPending || updateAsset.isPending} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white gap-2">
              {(createAsset.isPending || updateAsset.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingItem ? "Update Asset" : "Register Asset"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Sticker Dialog */}
      {stickerAsset && <StickerPrintDialog asset={stickerAsset} onClose={() => setStickerAsset(null)} />}
    </div>
  );
}
