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
import { Plus, Trash2, Edit, Search, Monitor, Box, Eye, Wrench, Archive, HardDrive, Server } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";

const PAGE_SIZE = 10;
const STATUS_BADGE: Record<string, string> = {
  "In Stock": "border-blue-500/30 text-blue-600 bg-blue-50 dark:bg-blue-400/10",
  "Allocated": "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10",
  "In Use": "border-teal-500/30 text-teal-600 bg-teal-50 dark:bg-teal-400/10",
  "Under Maintenance": "border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-400/10",
  "Retired": "border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
  "Disposed": "border-red-500/30 text-red-600 bg-red-50 dark:bg-red-400/10",
};
const ASSET_TYPES = ["Laptop", "Desktop", "Server", "Network Switch", "Firewall", "Access Point", "Printer", "Tablet", "Mobile"];
const ASSET_STATUSES = ["In Stock", "Allocated", "In Use", "Under Maintenance", "Retired", "Disposed"];

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
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });
  const { data: stats } = useQuery({ queryKey: ["assets-stats"], queryFn: () => apiFetch<any>("/assets/stats") });

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

  function openCreate() { setEditingItem(null); setFormData({ status: "In Stock" }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }
  function clearFilters() { setSearch(""); setFilterType(""); setFilterStatus(""); setFilterDept(""); setPage(1); }

  async function handleSave() {
    try {
      if (editingItem) {
        await updateAsset.mutateAsync({ id: editingItem.id, ...formData });
        toast({ title: "Asset updated successfully" });
      } else {
        await createAsset.mutateAsync(formData);
        toast({ title: "Asset created successfully" });
      }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete asset "${name}"? This action cannot be undone.`)) return;
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
        <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />Add Asset</Button>
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
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Cost (₹)</TableHead>
                <TableHead className="w-[100px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No assets found matching your filters</TableCell></TableRow>
              )}
              {paged.map((a: any) => (
                <TableRow key={a.id} className={a.status === "Retired" || a.status === "Disposed" ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-xs font-semibold">{a.assetTag}</TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{a.type}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_BADGE[a.status] || ""}>{a.status}</Badge></TableCell>
                  <TableCell className="text-sm">{a.ownerName || "—"}</TableCell>
                  <TableCell className="text-sm">{a.department || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{a.location || "—"}</TableCell>
                  <TableCell className="text-sm text-right">{a.cost ? `₹${Number(a.cost).toLocaleString("en-IN")}` : "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setViewModal(a)} className="p-1.5 rounded hover:bg-muted" title="View"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
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

      <Dialog open={!!viewModal} onOpenChange={() => setViewModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Asset Details — {viewModal?.assetTag}</DialogTitle></DialogHeader>
          {viewModal && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Name", viewModal.name], ["Type", viewModal.type], ["Serial Number", viewModal.serialNumber],
                ["Status", viewModal.status], ["Owner", viewModal.ownerName], ["Department", viewModal.department],
                ["Location", viewModal.location], ["Purchase Date", viewModal.purchaseDate], ["Cost", viewModal.cost ? `₹${Number(viewModal.cost).toLocaleString("en-IN")}` : "—"],
                ["Vendor", viewModal.vendorName], ["Warranty Expiry", viewModal.warrantyExpiry], ["OS Version", viewModal.osVersion],
                ["IP Address", viewModal.ipAddress], ["Configuration", viewModal.configuration],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div className="text-[10px] uppercase text-muted-foreground font-semibold">{label}</div>
                  <div className="font-medium">{(value as string) || "—"}</div>
                </div>
              ))}
              {viewModal.notes && <div className="col-span-2"><div className="text-[10px] uppercase text-muted-foreground font-semibold">Notes</div><div>{viewModal.notes}</div></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? "Edit Asset" : "Add New Asset"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Asset Tag *</Label><Input value={formData.assetTag || ""} onChange={e => setFormData({ ...formData, assetTag: e.target.value })} placeholder="AST-LAP-XXX" /></div>
            <div><Label>Name *</Label><Input value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
            <div><Label>Type *</Label>
              <Select value={formData.type || ""} onValueChange={v => setFormData({ ...formData, type: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Serial Number</Label><Input value={formData.serialNumber || ""} onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={formData.status || "In Stock"} onValueChange={v => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ASSET_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
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
            <Button onClick={handleSave} disabled={!formData.assetTag || !formData.name || !formData.type} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">{editingItem ? "Update Asset" : "Create Asset"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
