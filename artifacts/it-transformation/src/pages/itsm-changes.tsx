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
import { Plus, Trash2, Edit, Search, Eye, GitBranch, CheckCircle2, Clock, AlertTriangle, Shield } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";
import { ApprovalMatrix } from "@/components/approval-matrix";

const PAGE_SIZE = 10;
const CHANGE_TYPES = ["Standard", "Normal", "Emergency"];
const RISKS = ["High", "Medium", "Low"];
const STATUSES = ["Draft", "Open", "Pending Approval", "Approved", "Rejected", "In Progress", "Completed", "Failed", "Rolled Back", "Closed"];
const CREATE_STATUSES = ["Draft"];
const APPROVAL_STATUSES = ["Pending", "Approved", "Rejected"];
const TYPE_BADGE: Record<string, string> = { Standard: "border-blue-500/30 text-blue-600 bg-blue-50", Normal: "border-teal-500/30 text-teal-600 bg-teal-50", Emergency: "border-red-500/30 text-red-600 bg-red-50" };
const APPROVAL_BADGE: Record<string, string> = { Pending: "border-amber-500/30 text-amber-600 bg-amber-50", Approved: "border-emerald-500/30 text-emerald-600 bg-emerald-50", Rejected: "border-red-500/30 text-red-600 bg-red-50" };

export default function ItsmChanges() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterApproval, setFilterApproval] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: changes = [] } = useQuery({ queryKey: ["changes"], queryFn: () => apiFetch<any[]>("/changes") });

  const createChange = useMutation({ mutationFn: (d: any) => apiFetch("/changes", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["changes"] }); queryClient.invalidateQueries({ queryKey: ["changes-stats"] }); } });
  const updateChange = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/changes/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["changes"] }); queryClient.invalidateQueries({ queryKey: ["changes-stats"] }); } });
  const deleteChange = useMutation({ mutationFn: (id: number) => apiFetch(`/changes/${id}`, { method: "DELETE" }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["changes"] }); queryClient.invalidateQueries({ queryKey: ["changes-stats"] }); } });

  const filtered = useMemo(() => {
    let list = changes;
    if (search) list = list.filter((c: any) => [c.changeNo, c.title, c.requestedBy].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterType) list = list.filter((c: any) => c.type === filterType);
    if (filterApproval) list = list.filter((c: any) => c.approvalStatus === filterApproval);
    return list;
  }, [changes, search, filterType, filterApproval]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pendingCount = changes.filter((c: any) => c.approvalStatus === "Pending").length;
  const approvedCount = changes.filter((c: any) => c.approvalStatus === "Approved").length;
  const emergencyCount = changes.filter((c: any) => c.type === "Emergency").length;

  function openCreate() { setEditingItem(null); setFormData({ status: "Open", type: "Normal", riskLevel: "Medium", approvalStatus: "Pending" }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }

  async function handleSave() {
    try {
      if (editingItem) { await updateChange.mutateAsync({ id: editingItem.id, ...formData }); toast({ title: "Change request updated" }); }
      else { await createChange.mutateAsync(formData); toast({ title: "Change request created" }); }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number, no: string) {
    if (!confirm(`Delete change request ${no}?`)) return;
    try { await deleteChange.mutateAsync(id); toast({ title: "Change request deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Change Request Management</h1>
          <p className="text-sm text-muted-foreground">Review and approve IT change requests — {user?.name}</p>
        </div>
        <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />New Change Request</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={GitBranch} label="Total Changes" value={changes.length} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Clock} label="Pending Approval" value={pendingCount} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={CheckCircle2} label="Approved" value={approvedCount} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={AlertTriangle} label="Emergency" value={emergencyCount} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search change requests..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div>
            <Select value={filterType} onValueChange={v => { setFilterType(v === "all" ? "" : v); setPage(1); }}><SelectTrigger className="w-[140px]"><SelectValue placeholder="All Types" /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem>{CHANGE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
            <Select value={filterApproval} onValueChange={v => { setFilterApproval(v === "all" ? "" : v); setPage(1); }}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Approval" /></SelectTrigger><SelectContent><SelectItem value="all">All Approvals</SelectItem>{APPROVAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-[90px]">Change #</TableHead><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Risk</TableHead><TableHead>Approval</TableHead><TableHead>Status</TableHead><TableHead>Scheduled</TableHead><TableHead>Requested By</TableHead><TableHead className="w-[100px] text-center">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {paged.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No change requests found</TableCell></TableRow>}
              {paged.map((c: any) => (
                <TableRow key={c.id} className={c.type === "Emergency" ? "bg-red-50/30 dark:bg-red-900/5" : ""}>
                  <TableCell className="font-mono text-xs font-semibold">{c.changeNo}</TableCell>
                  <TableCell className="font-medium max-w-[180px] truncate">{c.title}</TableCell>
                  <TableCell><Badge variant="outline" className={TYPE_BADGE[c.type] || ""}>{c.type}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={c.riskLevel === "High" ? "border-red-500/30 text-red-600 bg-red-50" : c.riskLevel === "Medium" ? "border-amber-500/30 text-amber-600 bg-amber-50" : "border-emerald-500/30 text-emerald-600 bg-emerald-50"}>{c.riskLevel}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={APPROVAL_BADGE[c.approvalStatus] || ""}>{c.approvalStatus}</Badge></TableCell>
                  <TableCell className="text-xs">{c.status}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.implementationDate || "TBD"}</TableCell>
                  <TableCell className="text-sm">{c.requestedBy || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setViewModal(c)} className="p-1.5 rounded hover:bg-muted"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                      {isAdmin && <button onClick={() => handleDelete(c.id, c.changeNo)} className="p-1.5 rounded hover:bg-muted"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
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
          <DialogHeader><DialogTitle>Change Request {viewModal?.changeNo}</DialogTitle></DialogHeader>
          {viewModal && (
            <div className="space-y-4">
              <h3 className="font-semibold">{viewModal.title}</h3>
              <p className="text-sm text-muted-foreground">{viewModal.description || "No description"}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Type", viewModal.type], ["Risk Level", viewModal.riskLevel], ["Status", viewModal.status], ["Approval", viewModal.approvalStatus], ["Requested By", viewModal.requestedBy], ["Approved By", viewModal.approvedBy], ["Implementation Date", viewModal.implementationDate], ["Impact", viewModal.impact]].map(([l, v]) => (
                  <div key={l as string}><div className="text-[10px] uppercase text-muted-foreground font-semibold">{l}</div><div className="font-medium">{(v as string) || "—"}</div></div>
                ))}
              </div>
              {viewModal.rollbackPlan && <div><div className="text-[10px] uppercase text-muted-foreground font-semibold">Rollback Plan</div><div className="text-sm bg-red-50 dark:bg-red-900/10 p-2 rounded">{viewModal.rollbackPlan}</div></div>}
              <ApprovalMatrix ticketId={viewModal.id} ticketType="Change Request" readonly />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? `Edit ${editingItem.changeNo}` : "New Change Request"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
            <div><Label>Change Type</Label><Select value={formData.type || "Normal"} onValueChange={v => setFormData({ ...formData, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANGE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Risk Level</Label><Select value={formData.riskLevel || "Medium"} onValueChange={v => setFormData({ ...formData, riskLevel: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RISKS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Status</Label><Select value={formData.status || "Draft"} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(editingItem ? STATUSES : CREATE_STATUSES).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Approval Status</Label><Select value={formData.approvalStatus || "Pending"} onValueChange={v => setFormData({ ...formData, approvalStatus: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{APPROVAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Requested By</Label><Input value={formData.requestedBy || ""} onChange={e => setFormData({ ...formData, requestedBy: e.target.value })} /></div>
            <div><Label>Approved By</Label><Input value={formData.approvedBy || ""} onChange={e => setFormData({ ...formData, approvedBy: e.target.value })} /></div>
            <div><Label>Implementation Date</Label><Input type="date" value={formData.implementationDate || ""} onChange={e => setFormData({ ...formData, implementationDate: e.target.value })} /></div>
            <div><Label>Impact</Label><Input value={formData.impact || ""} onChange={e => setFormData({ ...formData, impact: e.target.value })} /></div>
            <div className="col-span-2"><Label>Rollback Plan</Label><Textarea value={formData.rollbackPlan || ""} onChange={e => setFormData({ ...formData, rollbackPlan: e.target.value })} rows={2} /></div>
          </div>
          {editingItem && (
            <div className="mt-4">
              <ApprovalMatrix ticketId={editingItem.id} ticketType="Change Request" />
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
