import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Search, Eye, Users, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";

const PAGE_SIZE = 10;

export default function AssetAllocations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: allocations = [] } = useQuery({ queryKey: ["asset-allocations"], queryFn: () => apiFetch<any[]>("/asset-allocations") });
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });

  const createAlloc = useMutation({ mutationFn: (data: any) => apiFetch("/asset-allocations", { method: "POST", body: JSON.stringify(data) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-allocations"] }) });
  const updateAlloc = useMutation({ mutationFn: ({ id, ...data }: any) => apiFetch(`/asset-allocations/${id}`, { method: "PATCH", body: JSON.stringify(data) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-allocations"] }) });
  const deleteAlloc = useMutation({ mutationFn: (id: number) => apiFetch(`/asset-allocations/${id}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-allocations"] }) });

  const departments = [...new Set(allocations.map((a: any) => a.department).filter(Boolean))];
  const filtered = useMemo(() => {
    let list = allocations;
    if (search) list = list.filter((a: any) => [a.userName, a.department].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterStatus) list = list.filter((a: any) => a.status === filterStatus);
    if (filterDept) list = list.filter((a: any) => a.department === filterDept);
    return list;
  }, [allocations, search, filterStatus, filterDept]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeAllocs = allocations.filter((a: any) => a.status === "Active").length;
  const returnedAllocs = allocations.filter((a: any) => a.status === "Returned").length;

  function openCreate() { setEditingItem(null); setFormData({ status: "Active", startDate: new Date().toISOString().split("T")[0] }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }

  async function handleSave() {
    try {
      if (editingItem) { await updateAlloc.mutateAsync({ id: editingItem.id, ...formData }); toast({ title: "Allocation updated" }); }
      else { await createAlloc.mutateAsync(formData); toast({ title: "Allocation created" }); }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this allocation record?")) return;
    try { await deleteAlloc.mutateAsync(id); toast({ title: "Allocation deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset Allocations</h1>
          <p className="text-sm text-muted-foreground">Track asset assignments to employees — {user?.name}</p>
        </div>
        <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />New Allocation</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={ArrowRight} label="Total Allocations" value={allocations.length} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={CheckCircle2} label="Active" value={activeAllocs} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={Clock} label="Returned" value={returnedAllocs} iconBg="bg-gray-100 dark:bg-gray-900/30" iconColor="text-gray-500" borderColor="border-l-gray-400" />
        <StatCard icon={Users} label="Departments" value={departments.length} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600" borderColor="border-l-violet-500" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by user, department..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="Active">Active</SelectItem><SelectItem value="Returned">Returned</SelectItem><SelectItem value="Lost">Lost</SelectItem></SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={v => { setFilterDept(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Depts" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Departments</SelectItem>{departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead><TableHead>Assigned To</TableHead><TableHead>Department</TableHead><TableHead>Start Date</TableHead><TableHead>End Date</TableHead><TableHead>Status</TableHead><TableHead className="w-[100px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No allocations found</TableCell></TableRow>}
              {paged.map((a: any) => {
                const asset = assets.find((x: any) => x.id === a.assetId);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{asset?.assetTag || `#${a.assetId}`} <span className="text-muted-foreground">— {asset?.name || ""}</span></TableCell>
                    <TableCell className="font-medium">{a.userName || "—"}</TableCell>
                    <TableCell>{a.department || "—"}</TableCell>
                    <TableCell className="text-sm">{a.startDate || "—"}</TableCell>
                    <TableCell className="text-sm">{a.endDate || <span className="text-emerald-600">Ongoing</span>}</TableCell>
                    <TableCell><Badge variant="outline" className={a.status === "Active" ? "border-emerald-500/30 text-emerald-600 bg-emerald-50" : "border-gray-400/30 text-gray-500 bg-gray-50"}>{a.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => setViewModal(a)} className="p-1.5 rounded hover:bg-muted" title="View"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-muted" title="Edit"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                        {isAdmin && <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded hover:bg-muted" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
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
          <DialogHeader><DialogTitle>Allocation Details</DialogTitle></DialogHeader>
          {viewModal && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[["Asset", assets.find((x: any) => x.id === viewModal.assetId)?.name || `#${viewModal.assetId}`], ["Assigned To", viewModal.userName], ["Department", viewModal.department], ["Start Date", viewModal.startDate], ["End Date", viewModal.endDate || "Ongoing"], ["Status", viewModal.status]].map(([l, v]) => (
                <div key={l as string}><div className="text-[10px] uppercase text-muted-foreground font-semibold">{l}</div><div className="font-medium">{(v as string) || "—"}</div></div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingItem ? "Edit Allocation" : "New Allocation"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Asset ID *</Label><Input type="number" value={formData.assetId || ""} onChange={e => setFormData({ ...formData, assetId: parseInt(e.target.value) })} /></div>
            <div><Label>Assigned To *</Label><Input value={formData.userName || ""} onChange={e => setFormData({ ...formData, userName: e.target.value })} /></div>
            <div><Label>Department</Label><Input value={formData.department || ""} onChange={e => setFormData({ ...formData, department: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={formData.status || "Active"} onValueChange={v => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Returned">Returned</SelectItem><SelectItem value="Lost">Lost</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Start Date</Label><Input type="date" value={formData.startDate || ""} onChange={e => setFormData({ ...formData, startDate: e.target.value })} /></div>
            <div><Label>End Date</Label><Input type="date" value={formData.endDate || ""} onChange={e => setFormData({ ...formData, endDate: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.assetId || !formData.userName} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">{editingItem ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
