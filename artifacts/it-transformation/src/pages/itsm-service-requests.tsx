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
import { Plus, Trash2, Edit, Search, Eye, Headphones, CheckCircle2, Clock, Timer, Inbox } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";
import { ApprovalMatrix } from "@/components/approval-matrix";

const PAGE_SIZE = 10;
const CATEGORIES = ["Access Request", "Software Install", "Hardware Request", "Account Setup", "Password Reset", "VPN Access", "Email Setup", "Other"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const STATUSES = ["Open", "In Progress", "Pending Approval", "Approved", "Rejected", "Completed", "Cancelled"];
const CREATE_STATUSES = ["Open"];
const STATUS_BADGE: Record<string, string> = {
  Open: "border-blue-500/30 text-blue-600 bg-blue-50 dark:bg-blue-400/10",
  "In Progress": "border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-400/10",
  "Pending Approval": "border-violet-500/30 text-violet-600 bg-violet-50 dark:bg-violet-400/10",
  Completed: "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10",
  Cancelled: "border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
};

export default function ItsmServiceRequests() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: requests = [] } = useQuery({ queryKey: ["service-requests"], queryFn: () => apiFetch<any[]>("/service-requests") });

  const createReq = useMutation({ mutationFn: (d: any) => apiFetch("/service-requests", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-requests"] }) });
  const updateReq = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/service-requests/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-requests"] }) });
  const deleteReq = useMutation({ mutationFn: (id: number) => apiFetch(`/service-requests/${id}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-requests"] }) });

  const filtered = useMemo(() => {
    let list = requests;
    if (search) list = list.filter((r: any) => [r.requestNo, r.title, r.requestedBy, r.assignedTo].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterCategory) list = list.filter((r: any) => r.category === filterCategory);
    if (filterStatus) list = list.filter((r: any) => r.status === filterStatus);
    return list;
  }, [requests, search, filterCategory, filterStatus]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const openCount = requests.filter((r: any) => r.status === "Open").length;
  const inProgressCount = requests.filter((r: any) => r.status === "In Progress").length;
  const completedCount = requests.filter((r: any) => r.status === "Completed").length;

  function openCreate() { setEditingItem(null); setFormData({ status: "Open", priority: "Medium", category: "Other" }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }

  async function handleSave() {
    try {
      if (editingItem) { await updateReq.mutateAsync({ id: editingItem.id, ...formData }); toast({ title: "Service request updated" }); }
      else { await createReq.mutateAsync(formData); toast({ title: "Service request created" }); }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number, no: string) {
    if (!confirm(`Delete service request ${no}?`)) return;
    try { await deleteReq.mutateAsync(id); toast({ title: "Service request deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Service Requests</h1>
          <p className="text-sm text-muted-foreground">Manage IT service requests and fulfillment — {user?.name}</p>
        </div>
        <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />New Request</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Inbox} label="Open" value={openCount} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Timer} label="In Progress" value={inProgressCount} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={CheckCircle2} label="Completed" value={completedCount} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={Headphones} label="Total" value={requests.length} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600" borderColor="border-l-violet-500" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search requests..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div>
            <Select value={filterCategory} onValueChange={v => { setFilterCategory(v === "all" ? "" : v); setPage(1); }}><SelectTrigger className="w-[160px]"><SelectValue placeholder="All Categories" /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}><SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-[90px]">Request #</TableHead><TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Requested By</TableHead><TableHead>Assigned To</TableHead><TableHead className="w-[100px] text-center">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {paged.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No service requests found</TableCell></TableRow>}
              {paged.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs font-semibold">{r.requestNo}</TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">{r.title}</TableCell>
                  <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={r.priority === "Critical" ? "border-red-500/50 text-red-700 bg-red-50" : r.priority === "High" ? "border-orange-500/50 text-orange-700 bg-orange-50" : r.priority === "Medium" ? "border-amber-500/50 text-amber-700 bg-amber-50" : "border-blue-500/50 text-blue-600 bg-blue-50"}>{r.priority}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_BADGE[r.status] || ""}>{r.status}</Badge></TableCell>
                  <TableCell className="text-sm">{r.requestedBy || "—"}</TableCell>
                  <TableCell className="text-sm">{r.assignedTo || <span className="text-red-500">Unassigned</span>}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setViewModal(r)} className="p-1.5 rounded hover:bg-muted"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-muted"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                      {isAdmin && <button onClick={() => handleDelete(r.id, r.requestNo)} className="p-1.5 rounded hover:bg-muted"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Service Request {viewModal?.requestNo}</DialogTitle></DialogHeader>
          {viewModal && (
            <div className="space-y-4">
              <h3 className="font-semibold">{viewModal.title}</h3>
              <p className="text-sm text-muted-foreground">{viewModal.description || "No description"}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Category", viewModal.category], ["Priority", viewModal.priority], ["Status", viewModal.status], ["Requested By", viewModal.requestedBy], ["Assigned To", viewModal.assignedTo], ["Department", viewModal.department]].map(([l, v]) => (
                  <div key={l as string}><div className="text-[10px] uppercase text-muted-foreground font-semibold">{l}</div><div className="font-medium">{(v as string) || "—"}</div></div>
                ))}
              </div>
              {viewModal.fulfillmentNotes && <div><div className="text-[10px] uppercase text-muted-foreground font-semibold">Fulfillment Notes</div><div className="text-sm bg-emerald-50 dark:bg-emerald-900/10 p-2 rounded">{viewModal.fulfillmentNotes}</div></div>}
              <ApprovalMatrix ticketId={viewModal.id} ticketType="Service Request" readonly />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? `Edit ${editingItem.requestNo}` : "New Service Request"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
            <div><Label>Category</Label><Select value={formData.category || "Other"} onValueChange={v => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Priority</Label><Select value={formData.priority || "Medium"} onValueChange={v => setFormData({ ...formData, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Status</Label><Select value={formData.status || "Open"} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(editingItem ? STATUSES : CREATE_STATUSES).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Requested By</Label><Input value={formData.requestedBy || ""} onChange={e => setFormData({ ...formData, requestedBy: e.target.value })} /></div>
            <div><Label>Assigned To</Label><Input value={formData.assignedTo || ""} onChange={e => setFormData({ ...formData, assignedTo: e.target.value })} /></div>
            <div><Label>Department</Label><Input value={formData.department || ""} onChange={e => setFormData({ ...formData, department: e.target.value })} /></div>
            {formData.status === "Completed" && <div className="col-span-2"><Label>Fulfillment Notes</Label><Textarea value={formData.fulfillmentNotes || ""} onChange={e => setFormData({ ...formData, fulfillmentNotes: e.target.value })} rows={2} /></div>}
          </div>
          {editingItem && (
            <div className="mt-4">
              <ApprovalMatrix ticketId={editingItem.id} ticketType="Service Request" />
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.title} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">{editingItem ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
