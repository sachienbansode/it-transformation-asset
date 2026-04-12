import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
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
import { TicketAttachments } from "@/components/itsm-attachments";

const PAGE_SIZE = 10;
const CHANGE_TYPES = ["Standard", "Normal", "Emergency"];
const RISKS = ["High", "Medium", "Low"];
const STATUSES = ["Draft", "Open", "Pending Approval", "Approved", "Rejected", "In Progress", "Completed", "Failed", "Rolled Back", "Closed"];
const CREATE_STATUSES = ["Draft"];
const APPROVAL_STATUSES = ["Pending", "Approved", "Rejected"];

const TYPE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Standard:  { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
  Normal:    { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-700 dark:text-teal-400", dot: "bg-teal-500" },
  Emergency: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
};

const APPROVAL_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Pending:  { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  Approved: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  Rejected: { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
};

const RISK_STYLES: Record<string, { bg: string; text: string }> = {
  High:   { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  Medium: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  Low:    { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400" },
};

function TypeBadge({ value }: { value: string }) {
  const s = TYPE_STYLES[value] || { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {value}
    </span>
  );
}

function ApprovalBadge({ value }: { value: string }) {
  const s = APPROVAL_STYLES[value] || { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {value}
    </span>
  );
}

function RiskBadge({ value }: { value: string }) {
  const s = RISK_STYLES[value] || { bg: "bg-gray-100", text: "text-gray-600" };
  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${s.bg} ${s.text}`}>
      {value}
    </span>
  );
}

function AssigneeBadge({ name, label = "Requested" }: { name?: string; label?: string }) {
  if (!name) return <span className="text-xs text-muted-foreground italic">—</span>;
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{initials}</span>
      <span className="text-sm font-medium truncate max-w-[100px]">{name}</span>
    </span>
  );
}

function TicketNo({ no }: { no: string }) {
  const [prefix, ...rest] = no.split("-");
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-xs">
      <span className="font-bold text-blue-600 dark:text-blue-400">{prefix}</span>
      <span className="text-muted-foreground">-{rest.join("-")}</span>
    </span>
  );
}

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

  function openCreate() { setEditingItem(null); setFormData({ status: "Draft", type: "Normal", riskLevel: "Medium", approvalStatus: "Pending" }); setIsModalOpen(true); }
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
        <CardContent className="p-0">
          <div className="flex flex-wrap gap-3 items-center p-4 border-b">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search change requests..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterType} onValueChange={v => { setFilterType(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Types</SelectItem>{CHANGE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterApproval} onValueChange={v => { setFilterApproval(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Approval" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Approvals</SelectItem>{APPROVAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            {(search || filterType || filterApproval) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterType(""); setFilterApproval(""); setPage(1); }} className="text-xs text-muted-foreground">Clear filters</Button>
            )}
          </div>

          <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/20">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of <span className="font-semibold text-foreground">{changes.length}</span> change requests
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[110px]">Change #</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Title</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[110px]">Type</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[80px]">Risk</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[120px]">Approval</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[100px]">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[100px]">Scheduled</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Requested By</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[90px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                    <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No change requests found</p>
                    <p className="text-xs mt-1">Try adjusting your filters</p>
                  </TableCell>
                </TableRow>
              )}
              {paged.map((c: any) => (
                <TableRow key={c.id} className={`transition-colors ${c.type === "Emergency" ? "bg-red-50/30 dark:bg-red-900/5 hover:bg-red-50/50 dark:hover:bg-red-900/10" : "hover:bg-muted/30"}`}>
                  <TableCell className="py-3"><TicketNo no={c.changeNo} /></TableCell>
                  <TableCell className="py-3">
                    <div className="font-medium text-sm leading-tight max-w-[200px] truncate" title={c.title}>{c.title}</div>
                    {c.impact && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{c.impact}</div>}
                  </TableCell>
                  <TableCell className="py-3"><TypeBadge value={c.type} /></TableCell>
                  <TableCell className="py-3"><RiskBadge value={c.riskLevel} /></TableCell>
                  <TableCell className="py-3"><ApprovalBadge value={c.approvalStatus} /></TableCell>
                  <TableCell className="py-3 text-xs font-medium text-muted-foreground">{c.status}</TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">{c.implementationDate || <span className="italic">TBD</span>}</TableCell>
                  <TableCell className="py-3"><AssigneeBadge name={c.requestedBy} /></TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-0.5 justify-center">
                      <button onClick={() => setViewModal(c)} title="View" className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => openEdit(c)} title="Edit" className="p-2 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 hover:text-blue-600 transition-colors"><Edit className="w-4 h-4" /></button>
                      {isAdmin && <button onClick={() => handleDelete(c.id, c.changeNo)} title="Delete" className="p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-4 pb-3">
            <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!viewModal} onOpenChange={() => setViewModal(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <TicketNo no={viewModal?.changeNo || ""} />
              <ApprovalBadge value={viewModal?.approvalStatus || ""} />
            </DialogTitle>
          </DialogHeader>
          {viewModal && (
            <div className="space-y-4">
              <h3 className="font-semibold text-base">{viewModal.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{viewModal.description || "No description provided"}</p>
              <div className="flex flex-wrap gap-2">
                <TypeBadge value={viewModal.type} />
                <RiskBadge value={viewModal.riskLevel} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Status", viewModal.status], ["Requested By", viewModal.requestedBy], ["Approved By", viewModal.approvedBy], ["Implementation Date", viewModal.implementationDate], ["Impact", viewModal.impact]].map(([l, v]) => (
                  <div key={l as string} className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{l}</div>
                    <div className="font-medium text-sm">{(v as string) || "—"}</div>
                  </div>
                ))}
              </div>
              {viewModal.rollbackPlan && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-800/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400 font-semibold mb-1">Rollback Plan</div>
                  <div className="text-sm text-red-800 dark:text-red-300">{viewModal.rollbackPlan}</div>
                </div>
              )}
              <ApprovalMatrix ticketId={viewModal.id} ticketType="Change Request" readonly />
              <hr className="border-border/40" />
              <TicketAttachments ticketType="Change Request" ticketId={viewModal.id} />
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
          {editingItem && <div className="mt-4"><ApprovalMatrix ticketId={editingItem.id} ticketType="Change Request" /></div>}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.title} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">{editingItem ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
