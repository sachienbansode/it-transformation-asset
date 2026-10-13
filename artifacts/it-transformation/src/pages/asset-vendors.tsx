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
import { Plus, Trash2, Edit, Search, Eye, Package, Star, CheckCircle2, Clock, Download } from "lucide-react";
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

export default function AssetVendors() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: vendors = [] } = useQuery({ queryKey: ["asset-vendors"], queryFn: () => apiFetch<any[]>("/asset-vendors") });

  const createVendor = useMutation({ mutationFn: (data: any) => apiFetch("/asset-vendors", { method: "POST", body: JSON.stringify(data) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-vendors"] }) });
  const updateVendor = useMutation({ mutationFn: ({ id, ...data }: any) => apiFetch(`/asset-vendors/${id}`, { method: "PATCH", body: JSON.stringify(data) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-vendors"] }) });
  const deleteVendor = useMutation({ mutationFn: (id: number) => apiFetch(`/asset-vendors/${id}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-vendors"] }) });

  const filtered = useMemo(() => {
    let list = vendors;
    if (search) list = list.filter((v: any) => [v.name, v.contactPerson, v.email].some(val => val?.toLowerCase().includes(search.toLowerCase())));
    if (filterStatus) list = list.filter((v: any) => v.status === filterStatus);
    return list;
  }, [vendors, search, filterStatus]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeVendors = vendors.filter((v: any) => v.status === "Active").length;
  const avgRating = vendors.length > 0 ? (vendors.reduce((s: number, v: any) => s + (v.rating || 0), 0) / vendors.length).toFixed(1) : "—";
  const expiringSoon = vendors.filter((v: any) => {
    if (!v.contractEnd) return false;
    const diff = new Date(v.contractEnd).getTime() - Date.now();
    return diff > 0 && diff < 90 * 86400000;
  }).length;

  function openCreate() { setEditingItem(null); setFormData({ status: "Active", rating: 3 }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }

  async function handleSave() {
    if (!await confirmDialog(editingItem ? `Save changes to vendor "${formData.name || editingItem.name}"?` : `Create vendor "${formData.name || ""}"?`, { title: editingItem ? "Update vendor" : "Create vendor", confirmText: editingItem ? "Save changes" : "Create" })) return;
    try {
      if (editingItem) { await updateVendor.mutateAsync({ id: editingItem.id, ...formData }); toast({ title: "Vendor updated" }); }
      else { await createVendor.mutateAsync(formData); toast({ title: "Vendor created" }); }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number, name: string) {
    if (!await confirmDialog(`Delete vendor "${name}"?`)) return;
    try { await deleteVendor.mutateAsync(id); toast({ title: "Vendor deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendor Management</h1>
          <p className="text-sm text-muted-foreground">Manage IT asset vendors and contracts — {user?.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToCsv(vendors, [{label:"Vendor Name",key:"name"},{label:"Contact Person",key:"contactPerson"},{label:"Email",key:"email"},{label:"Phone",key:"phone"},{label:"Contract Start",key:"contractStart"},{label:"Contract End",key:"contractEnd"},{label:"Rating",key:"rating"},{label:"Status",key:"status"}], "vendors.csv")} className="gap-1.5"><Download className="w-4 h-4" />Export CSV</Button>
          <Button onClick={openCreate} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white gap-2"><Plus className="w-4 h-4" />Add Vendor</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Package} label="Total Vendors" value={vendors.length} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={CheckCircle2} label="Active" value={activeVendors} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={Star} label="Avg Rating" value={avgRating} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={Clock} label="Contracts Expiring" value={expiringSoon} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" sub="Within 90 days" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search vendors..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Name</TableHead><TableHead>Contact Person</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Contract Period</TableHead><TableHead>Rating</TableHead><TableHead>Status</TableHead><TableHead className="w-[100px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No vendors found</TableCell></TableRow>}
              {paged.map((v: any) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>{v.contactPerson || "—"}</TableCell>
                  <TableCell className="text-sm">{v.email || "—"}</TableCell>
                  <TableCell className="text-sm">{v.phone || "—"}</TableCell>
                  <TableCell className="text-xs">{v.contractStart && v.contractEnd ? `${v.contractStart} — ${v.contractEnd}` : "—"}</TableCell>
                  <TableCell><div className="flex gap-0.5">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`w-3 h-3 ${i < (v.rating || 0) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />)}</div></TableCell>
                  <TableCell><Badge variant="outline" className={v.status === "Active" ? "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10" : "border-gray-400/30 text-gray-500 bg-gray-50"}>{v.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setViewModal(v)} className="p-1.5 rounded hover:bg-muted" title="View"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(v)} className="p-1.5 rounded hover:bg-muted" title="Edit"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                      {isAdmin && <button onClick={() => handleDelete(v.id, v.name)} className="p-1.5 rounded hover:bg-muted" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Vendor Details</DialogTitle></DialogHeader>
          {viewModal && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[["Name", viewModal.name], ["Contact", viewModal.contactPerson], ["Email", viewModal.email], ["Phone", viewModal.phone], ["Contract Start", viewModal.contractStart], ["Contract End", viewModal.contractEnd], ["Rating", viewModal.rating ? "⭐".repeat(viewModal.rating) : "—"], ["Status", viewModal.status]].map(([l, v]) => (
                <div key={l as string}><div className="text-[10px] uppercase text-muted-foreground font-semibold">{l}</div><div className="font-medium">{(v as string) || "—"}</div></div>
              ))}
              {viewModal.notes && <div className="col-span-2"><div className="text-[10px] uppercase text-muted-foreground font-semibold">Notes</div><div>{viewModal.notes}</div></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingItem ? "Edit Vendor" : "Add New Vendor"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Vendor Name *</Label><Input value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
            <div><Label>Contact Person</Label><Input value={formData.contactPerson || ""} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={formData.email || ""} onChange={e => setFormData({ ...formData, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={formData.phone || ""} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={formData.status || "Active"} onValueChange={v => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Contract Start</Label><Input type="date" value={formData.contractStart || ""} onChange={e => setFormData({ ...formData, contractStart: e.target.value })} /></div>
            <div><Label>Contract End</Label><Input type="date" value={formData.contractEnd || ""} onChange={e => setFormData({ ...formData, contractEnd: e.target.value })} /></div>
            <div><Label>Rating (1-5)</Label><Input type="number" min="1" max="5" value={formData.rating || 3} onChange={e => setFormData({ ...formData, rating: parseInt(e.target.value) })} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.name} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white">{editingItem ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
