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
import { Plus, Trash2, Edit, Search, Eye, HardDrive, AlertTriangle, CheckCircle2, Clock, DollarSign } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";

const PAGE_SIZE = 10;
const LICENSE_TYPES = ["Perpetual", "Subscription", "Per User", "Per Device", "Site License", "Volume", "OEM"];
const LICENSE_STATUSES = ["Active", "Expiring Soon", "Expired", "Cancelled"];

export default function AssetLicenses() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: licenses = [] } = useQuery({ queryKey: ["asset-licenses"], queryFn: () => apiFetch<any[]>("/asset-licenses") });

  const createLicense = useMutation({ mutationFn: (data: any) => apiFetch("/asset-licenses", { method: "POST", body: JSON.stringify(data) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-licenses"] }) });
  const updateLicense = useMutation({ mutationFn: ({ id, ...data }: any) => apiFetch(`/asset-licenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-licenses"] }) });
  const deleteLicense = useMutation({ mutationFn: (id: number) => apiFetch(`/asset-licenses/${id}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-licenses"] }) });

  const filtered = useMemo(() => {
    let list = licenses;
    if (search) list = list.filter((l: any) => [l.productName, l.vendorName, l.licenseKey].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterType) list = list.filter((l: any) => l.licenseType === filterType);
    if (filterStatus) list = list.filter((l: any) => l.status === filterStatus);
    return list;
  }, [licenses, search, filterType, filterStatus]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalCost = licenses.reduce((s: number, l: any) => s + Number(l.cost || 0), 0);
  const totalSeats = licenses.reduce((s: number, l: any) => s + (l.seatsTotal || 0), 0);
  const usedSeats = licenses.reduce((s: number, l: any) => s + (l.seatsUsed || 0), 0);
  const expiringSoon = licenses.filter((l: any) => l.status === "Expiring Soon").length;

  function openCreate() { setEditingItem(null); setFormData({ status: "Active", licenseType: "Subscription", seatsTotal: 1, seatsUsed: 0 }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }

  async function handleSave() {
    try {
      if (editingItem) { await updateLicense.mutateAsync({ id: editingItem.id, ...formData }); toast({ title: "License updated" }); }
      else { await createLicense.mutateAsync(formData); toast({ title: "License created" }); }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete license "${name}"?`)) return;
    try { await deleteLicense.mutateAsync(id); toast({ title: "License deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">License Management</h1>
          <p className="text-sm text-muted-foreground">Track software licenses and utilization — {user?.name}</p>
        </div>
        <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />Add License</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={HardDrive} label="Total Licenses" value={licenses.length} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={CheckCircle2} label="Seat Utilization" value={totalSeats > 0 ? `${Math.round((usedSeats / totalSeats) * 100)}%` : "—"} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" sub={`${usedSeats} of ${totalSeats} seats used`} />
        <StatCard icon={AlertTriangle} label="Expiring Soon" value={expiringSoon} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={DollarSign} label="Total License Cost" value={`₹${(totalCost / 100000).toFixed(1)}L`} iconBg="bg-[#d4a843]/20" iconColor="text-[#d4a843]" borderColor="border-l-[#d4a843]" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search licenses..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterType} onValueChange={v => { setFilterType(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Types</SelectItem>{LICENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem>{LICENSE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead><TableHead>Vendor</TableHead><TableHead>Type</TableHead><TableHead>Expiry</TableHead><TableHead>Usage</TableHead><TableHead className="text-right">Cost (₹)</TableHead><TableHead>Status</TableHead><TableHead className="w-[100px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No licenses found</TableCell></TableRow>}
              {paged.map((l: any) => {
                const pct = l.seatsTotal > 0 ? (l.seatsUsed / l.seatsTotal) * 100 : 0;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.productName}</TableCell>
                    <TableCell className="text-sm">{l.vendorName || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{l.licenseType}</Badge></TableCell>
                    <TableCell className="text-sm">{l.expiryDate || "Perpetual"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-muted rounded-full h-2"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct > 90 ? "#dc2626" : pct > 70 ? "#d4a843" : "#059669" }} /></div>
                        <span className="text-xs text-muted-foreground">{l.seatsUsed}/{l.seatsTotal}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">₹{Number(l.cost || 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={l.status === "Active" ? "border-emerald-500/30 text-emerald-600 bg-emerald-50" : l.status === "Expiring Soon" ? "border-amber-500/30 text-amber-600 bg-amber-50" : l.status === "Expired" ? "border-red-500/30 text-red-600 bg-red-50" : ""}>{l.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => setViewModal(l)} className="p-1.5 rounded hover:bg-muted" title="View"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEdit(l)} className="p-1.5 rounded hover:bg-muted" title="Edit"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                        {isAdmin && <button onClick={() => handleDelete(l.id, l.productName)} className="p-1.5 rounded hover:bg-muted" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </CardContent>
      </Card>

      <Dialog open={!!viewModal} onOpenChange={() => setViewModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>License Details</DialogTitle></DialogHeader>
          {viewModal && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[["Product", viewModal.productName], ["Vendor", viewModal.vendorName], ["Type", viewModal.licenseType], ["License Key", viewModal.licenseKey], ["Seats Used/Total", `${viewModal.seatsUsed}/${viewModal.seatsTotal}`], ["Expiry", viewModal.expiryDate || "Perpetual"], ["Cost", `₹${Number(viewModal.cost || 0).toLocaleString("en-IN")}`], ["Status", viewModal.status]].map(([l, v]) => (
                <div key={l as string}><div className="text-[10px] uppercase text-muted-foreground font-semibold">{l}</div><div className="font-medium">{(v as string) || "—"}</div></div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingItem ? "Edit License" : "Add New License"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Product Name *</Label><Input value={formData.productName || ""} onChange={e => setFormData({ ...formData, productName: e.target.value })} /></div>
            <div><Label>Vendor</Label><Input value={formData.vendorName || ""} onChange={e => setFormData({ ...formData, vendorName: e.target.value })} /></div>
            <div><Label>License Type</Label>
              <Select value={formData.licenseType || "Subscription"} onValueChange={v => setFormData({ ...formData, licenseType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LICENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>License Key</Label><Input value={formData.licenseKey || ""} onChange={e => setFormData({ ...formData, licenseKey: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={formData.status || "Active"} onValueChange={v => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LICENSE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Seats Total</Label><Input type="number" value={formData.seatsTotal || 1} onChange={e => setFormData({ ...formData, seatsTotal: parseInt(e.target.value) })} /></div>
            <div><Label>Seats Used</Label><Input type="number" value={formData.seatsUsed || 0} onChange={e => setFormData({ ...formData, seatsUsed: parseInt(e.target.value) })} /></div>
            <div><Label>Expiry Date</Label><Input type="date" value={formData.expiryDate || ""} onChange={e => setFormData({ ...formData, expiryDate: e.target.value })} /></div>
            <div><Label>Cost (₹)</Label><Input type="number" value={formData.cost || ""} onChange={e => setFormData({ ...formData, cost: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.productName} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">{editingItem ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
