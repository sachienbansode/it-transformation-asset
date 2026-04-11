import React, { useState, useMemo, useEffect } from "react";
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
import { Plus, Trash2, Edit, Search, Monitor, Server, HardDrive, Wifi, Box, Package, BarChart3, TrendingUp, FileText } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch, API } from "@/lib/api";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PAGE_SIZE = 10;
const COLORS = ["#d4a843", "#0f766e", "#2563eb", "#dc2626", "#8b5cf6", "#ea580c", "#059669", "#6366f1"];

const STATUS_BADGE: Record<string, string> = {
  "In Stock": "border-blue-500/30 text-blue-600 bg-blue-50 dark:bg-blue-400/10",
  "Allocated": "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10",
  "In Use": "border-teal-500/30 text-teal-600 bg-teal-50 dark:bg-teal-400/10",
  "Under Maintenance": "border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-400/10",
  "Retired": "border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
  "Disposed": "border-red-500/30 text-red-600 bg-red-50 dark:bg-red-400/10",
};

const TYPE_ICON: Record<string, any> = {
  Laptop: Monitor, Desktop: Monitor, Server: Server, "Network Switch": Wifi, Firewall: Wifi,
  "Access Point": Wifi, Printer: HardDrive, Tablet: Monitor,
};

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

  function openCreate() { setEditingItem(null); setFormData({ status: "In Stock" }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }

  async function handleSave() {
    try {
      if (editingItem) {
        await updateAsset.mutateAsync({ id: editingItem.id, ...formData });
        toast({ title: "Asset updated" });
      } else {
        await createAsset.mutateAsync(formData);
        toast({ title: "Asset created" });
      }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
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
          {isAdmin && <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white"><Plus className="w-4 h-4 mr-2" />Add Asset</Button>}
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
                <BarChart data={typeData}><XAxis dataKey="name" fontSize={11} /><YAxis /><Tooltip /><Bar dataKey="value" fill="#d4a843" radius={[4, 4, 0, 0]} /></BarChart>
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
                    <div className="h-full rounded-full transition-all" style={{ width: `${(lic.seatsUsed / lic.seatsTotal) * 100}%`, backgroundColor: (lic.seatsUsed / lic.seatsTotal) > 0.9 ? "#dc2626" : (lic.seatsUsed / lic.seatsTotal) > 0.7 ? "#d4a843" : "#059669" }} />
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
                <TableHead>Asset Tag</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Owner</TableHead><TableHead>Location</TableHead><TableHead>Cost (₹)</TableHead>{isAdmin && <TableHead className="w-20">Actions</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {paged.map((a: any) => (
                  <TableRow key={a.id} className={a.status === "Retired" ? "opacity-50" : ""}>
                    <TableCell className="font-mono text-xs">{a.assetTag}</TableCell>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{a.type}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_BADGE[a.status] || ""}>{a.status}</Badge></TableCell>
                    <TableCell className="text-sm">{a.ownerName || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{a.location || "—"}</TableCell>
                    <TableCell className="text-sm">{a.cost ? `₹${Number(a.cost).toLocaleString("en-IN")}` : "—"}</TableCell>
                    {isAdmin && <TableCell><div className="flex gap-1"><button onClick={() => openEdit(a)} className="p-1 hover:text-blue-600"><Edit className="w-4 h-4" /></button><button onClick={() => { deleteAsset.mutate(a.id); toast({ title: "Asset deleted" }); }} className="p-1 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
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
                    <TableCell className="text-sm">{l.expiryDate || "Perpetual"}</TableCell>
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
                      <TableCell className="text-sm">{a.startDate || "—"}</TableCell>
                      <TableCell className="text-sm">{a.endDate || "Active"}</TableCell>
                      <TableCell><Badge variant="outline" className={a.status === "Active" ? "border-emerald-500/30 text-emerald-600 bg-emerald-50" : ""}>{a.status}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? "Edit Asset" : "Add New Asset"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Asset Tag *</Label><Input value={formData.assetTag || ""} onChange={e => setFormData({ ...formData, assetTag: e.target.value })} placeholder="AST-LAP-XXX" /></div>
            <div><Label>Name *</Label><Input value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
            <div><Label>Type *</Label>
              <Select value={formData.type || ""} onValueChange={v => setFormData({ ...formData, type: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{["Laptop", "Desktop", "Server", "Network Switch", "Firewall", "Access Point", "Printer", "Tablet", "Mobile"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Serial Number</Label><Input value={formData.serialNumber || ""} onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={formData.status || "In Stock"} onValueChange={v => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["In Stock", "Allocated", "In Use", "Under Maintenance", "Retired", "Disposed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Owner</Label><Input value={formData.ownerName || ""} onChange={e => setFormData({ ...formData, ownerName: e.target.value })} /></div>
            <div><Label>Department</Label><Input value={formData.department || ""} onChange={e => setFormData({ ...formData, department: e.target.value })} /></div>
            <div><Label>Location</Label><Input value={formData.location || ""} onChange={e => setFormData({ ...formData, location: e.target.value })} /></div>
            <div><Label>Purchase Date</Label><Input type="date" value={formData.purchaseDate || ""} onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })} /></div>
            <div><Label>Cost (₹)</Label><Input type="number" value={formData.cost || ""} onChange={e => setFormData({ ...formData, cost: e.target.value })} /></div>
            <div><Label>Vendor</Label><Input value={formData.vendorName || ""} onChange={e => setFormData({ ...formData, vendorName: e.target.value })} /></div>
            <div><Label>Warranty Expiry</Label><Input type="date" value={formData.warrantyExpiry || ""} onChange={e => setFormData({ ...formData, warrantyExpiry: e.target.value })} /></div>
            <div><Label>IP Address</Label><Input value={formData.ipAddress || ""} onChange={e => setFormData({ ...formData, ipAddress: e.target.value })} /></div>
            <div><Label>OS Version</Label><Input value={formData.osVersion || ""} onChange={e => setFormData({ ...formData, osVersion: e.target.value })} /></div>
            <div className="col-span-2"><Label>Configuration</Label><Input value={formData.configuration || ""} onChange={e => setFormData({ ...formData, configuration: e.target.value })} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">{editingItem ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
