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
import { Plus, Trash2, Edit, Search, Eye, Headphones, CheckCircle2, Timer, Inbox, Download } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";
import { ApprovalMatrix } from "@/components/approval-matrix";
import { TicketAttachments } from "@/components/itsm-attachments";
import { CategoryFields, RoutingPreview, useRoute, TeamMemberSelect, OnBehalfSelect, useMyTeams, RaisedByCell, WithCell, ClosureCell, TimeCell, ViewTabs, TransferFields, fmtDay, useCatalog } from "@/components/itsm-routing";
import { useItsmConfig } from "@/hooks/use-itsm-config";
import { confirmDialog, reasonDialog } from "@/components/confirm-dialog";

const PAGE_SIZE = 10;
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const STATUSES = ["Open", "In Progress", "Pending Approval", "Approved", "Rejected", "Completed", "Cancelled"];
const CREATE_STATUSES = ["Open"];

const PRIORITY_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Critical: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
  High:     { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", dot: "bg-orange-500" },
  Medium:   { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  Low:      { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-400" },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Open:               { bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  "In Progress":      { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  "Pending Approval": { bg: "bg-violet-50 dark:bg-violet-900/20", text: "text-violet-600 dark:text-violet-400", dot: "bg-violet-500" },
  Approved:           { bg: "bg-teal-50 dark:bg-teal-900/20", text: "text-teal-600 dark:text-teal-400", dot: "bg-teal-500" },
  Rejected:           { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  Completed:          { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  Cancelled:          { bg: "bg-gray-100 dark:bg-gray-800/40", text: "text-gray-500 dark:text-gray-400", dot: "bg-gray-400" },
};

const CAT_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
];

function PriorityBadge({ value }: { value: string }) {
  const s = PRIORITY_STYLES[value] || { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {value}
    </span>
  );
}

function StatusBadge({ value }: { value: string }) {
  const s = STATUS_STYLES[value] || { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {value}
    </span>
  );
}

function CategoryBadge({ value }: { value: string }) {
  const hash = value.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const color = CAT_COLORS[hash % CAT_COLORS.length];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${color}`}>{value}</span>
  );
}

function AssigneeBadge({ name }: { name?: string }) {
  if (!name) return <span className="text-xs text-muted-foreground italic">Unassigned</span>;
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{initials}</span>
      <span className="text-sm font-medium truncate max-w-[100px]">{name}</span>
    </span>
  );
}

function TicketNo({ no }: { no: string }) {
  const [prefix, ...rest] = no.split("-");
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-xs">
      <span className="font-bold text-teal-600 dark:text-teal-400">{prefix}</span>
      <span className="text-muted-foreground">-{rest.join("-")}</span>
    </span>
  );
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

async function downloadReport(type: string, filename: string) {
  const data = await apiFetch<any[]>(`/itsm-report?type=${type}`);
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(","), ...data.map(row =>
    headers.map(h => {
      const val = row[h] == null ? "" : String(row[h]);
      return `"${val.replace(/"/g, '""')}"`;
    }).join(",")
  )];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ItsmServiceRequests() {
  const cfg = useItsmConfig();
  const URGENCIES = cfg["itsm.urgencyLevels"];
  const DEPARTMENTS = cfg["itsm.departments"];
  const { data: catalog = [] } = useCatalog("request");
  const CATEGORIES = useMemo(() => catalog.filter((c: any) => !c.subcategory).map((c: any) => c.category), [catalog]);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user, canAccess } = useAuth();
  const canEdit = canAccess("itsm_requests", "write"); const canDelete = canAccess("itsm_requests", "admin");
  const { data: myTeams = [] } = useMyTeams();
  const isAgent = isAdmin || myTeams.length > 0;
  const [view, setView] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: requests = [] } = useQuery({ queryKey: ["service-requests", view], queryFn: () => apiFetch<any[]>(`/service-requests${view ? `?view=${view}` : ""}`) });
  const invalidate = () => { ["service-requests", "my-approvals", "my-approvals-count"].forEach(k => queryClient.invalidateQueries({ queryKey: [k] })); };
  const createReq = useMutation({ mutationFn: (d: any) => apiFetch("/service-requests", { method: "POST", body: JSON.stringify(d) }), onSuccess: invalidate });
  const updateReq = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/service-requests/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: invalidate });
  const deleteReq = useMutation({ mutationFn: ({ id, reason }: { id: number; reason: string }) => apiFetch(`/service-requests/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }), onSuccess: invalidate });

  const filtered = useMemo(() => {
    let list = requests;
    if (search) list = list.filter((r: any) => [r.requestNo, r.title, r.requestedBy, r.assignedTo, r.assignedGroup, r.subcategory].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterCategory) list = list.filter((r: any) => r.category === filterCategory);
    if (filterStatus) list = list.filter((r: any) => r.status === filterStatus);
    return list;
  }, [requests, search, filterCategory, filterStatus]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const openCount = requests.filter((r: any) => ["Open", "Pending Approval", "Approved"].includes(r.status)).length;
  const inProgressCount = requests.filter((r: any) => r.status === "In Progress").length;
  const completedCount = requests.filter((r: any) => r.status === "Completed").length;
  const overdue = requests.filter((r: any) => r.expectedClosureDate && !["Completed", "Cancelled", "Rejected"].includes(r.status) && new Date().toISOString().slice(0, 10) > r.expectedClosureDate).length;

  const myTeamIds = myTeams.map(t => t.id);
  const canWork = (r: any) => isAdmin || (r?.teamId && myTeamIds.includes(r.teamId));
  const isMine = (r: any) => r?.requesterUserId === user?.id;

  function openCreate() { setEditingItem(null); setFormData({ priority: "Medium" }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item, _teamId: item.teamId, _reason: "" }); setIsModalOpen(true); }

  async function handleSave() {
    try {
      if (editingItem) {
        const d: any = { title: formData.title, description: formData.description, urgency: formData.urgency, department: formData.department };
        if (canWork(editingItem)) {
          Object.assign(d, { priority: formData.priority, status: formData.status, assignedTo: formData.assignedTo ?? null, fulfillmentNotes: formData.fulfillmentNotes, category: formData.category, subcategory: formData.subcategory });
          if (formData._teamId && formData._teamId !== editingItem.teamId) { d.teamId = formData._teamId; d.transferReason = formData._reason; }
          else if (formData.category !== editingItem.category || (formData.subcategory || null) !== (editingItem.subcategory || null)) d.transferReason = formData._reason || "Category corrected";
          if (formData.reopenReason) d.reopenReason = formData.reopenReason;
        }
        await updateReq.mutateAsync({ id: editingItem.id, ...d }); toast({ title: `${editingItem.requestNo} updated` });
      } else {
        const r: any = await createReq.mutateAsync({ title: formData.title, description: formData.description, category: formData.category, subcategory: formData.subcategory, priority: formData.priority, urgency: formData.urgency, department: formData.department, assignedTo: formData.assignedTo || undefined, onBehalfOfUserId: formData.onBehalfOfUserId || undefined });
        toast({ title: `${r.requestNo} raised`, description: `Assigned to ${r.assignedGroup} · expected closure ${fmtDay(r.expectedClosureDate)}` });
      }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); }
  }

  async function cancelOwn(r: any) {
    if (!await confirmDialog(`Cancel your request ${r.requestNo} — ${r.title}?`, { title: "Cancel request", confirmText: "Cancel request", destructive: true })) return;
    try { await updateReq.mutateAsync({ id: r.id, status: "Cancelled" }); toast({ title: `${r.requestNo} cancelled` }); setIsModalOpen(false); }
    catch (e: any) { toast({ title: "Could not cancel", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number, no: string) {
    const reason = await reasonDialog(`Delete service request ${no}? It is removed from the lists but kept in the audit trail.`, { title: "Delete service request", confirmText: "Delete", destructive: true, label: "Reason for deleting" });
    if (!reason) return;
    try { await deleteReq.mutateAsync({ id, reason }); toast({ title: "Service request deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  const DONE = ["Completed", "Cancelled", "Rejected"];
  const route = useRoute("request", isModalOpen && !editingItem ? formData.category : (isModalOpen && editingItem && canWork(editingItem) && (formData.category !== editingItem.category || (formData.subcategory || null) !== (editingItem.subcategory || null)) ? formData.category : null), formData.subcategory);
  const workMode = !!editingItem && canWork(editingItem);
  const reqMode = !!editingItem && !workMode;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Service Requests</h1>
          <p className="text-sm text-muted-foreground">Raise a request by category — it goes to the mapped team automatically with an expected closure date.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAgent && <Button variant="outline" size="sm" onClick={() => downloadReport("service-requests", `service-requests-report-${new Date().toISOString().slice(0,10)}.csv`)} className="gap-2 text-xs"><Download className="w-3.5 h-3.5" />Export Report</Button>}
          {canEdit && <Button onClick={openCreate} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white gap-2"><Plus className="w-4 h-4" />New Request</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Inbox} label="Open / awaiting" value={openCount} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Timer} label="In Progress" value={inProgressCount} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={CheckCircle2} label="Completed" value={completedCount} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={Headphones} label="Past expected closure" value={overdue} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap gap-3 items-center p-4 border-b">
            <ViewTabs value={view} onChange={v => { setView(v); setPage(1); }} showTeam={isAgent} />
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search number, title, requester, team…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterCategory} onValueChange={v => { setFilterCategory(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Categories</SelectItem>{CATEGORIES.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/20">Showing <span className="font-semibold text-foreground">{filtered.length}</span> of <span className="font-semibold text-foreground">{requests.length}</span> requests</div>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Request</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Raised by</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Priority</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">With</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Expected closure</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Time</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (<TableRow><TableCell colSpan={8} className="text-center py-16 text-muted-foreground"><Headphones className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="font-medium">No service requests here</p></TableCell></TableRow>)}
              {paged.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setViewModal(r)}>
                  <TableCell className="py-3"><TicketNo no={r.requestNo} /><div className="font-medium text-sm leading-tight max-w-[240px] truncate" title={r.title}>{r.title}</div><div className="text-[11px] text-muted-foreground truncate max-w-[240px]">{[r.category, r.subcategory].filter(Boolean).join(" › ")}</div></TableCell>
                  <TableCell className="py-3"><RaisedByCell name={r.requestedBy} createdBy={r.createdBy} at={r.createdAt} /></TableCell>
                  <TableCell className="py-3"><PriorityBadge value={r.priority} /></TableCell>
                  <TableCell className="py-3"><StatusBadge value={r.status} /></TableCell>
                  <TableCell className="py-3"><WithCell team={r.assignedGroup} assignee={r.assignedTo} /></TableCell>
                  <TableCell className="py-3"><ClosureCell date={r.expectedClosureDate} done={DONE.includes(r.status)} doneAt={r.completedAt || (DONE.includes(r.status) ? r.updatedAt : null)} /></TableCell>
                  <TableCell className="py-3"><TimeCell createdAt={r.createdAt} endAt={DONE.includes(r.status) ? (r.completedAt || r.updatedAt) : null} firstResponseAt={r.firstResponseAt} /></TableCell>
                  <TableCell className="py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5 justify-center">
                      <button onClick={() => setViewModal(r)} title="View" className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Eye className="w-4 h-4" /></button>
                      {canEdit && (canWork(r) || isMine(r)) && <button onClick={() => openEdit(r)} title={DONE.includes(r.status) ? "Closed — view only" : canWork(r) ? "Work on request" : "Edit my request"} disabled={DONE.includes(r.status) && !canWork(r)} className={`p-2 rounded-md transition-colors ${DONE.includes(r.status) && !canWork(r) ? "opacity-30 cursor-not-allowed text-muted-foreground" : "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 hover:text-blue-600"}`}><Edit className="w-4 h-4" /></button>}
                      {canDelete && <button onClick={() => handleDelete(r.id, r.requestNo)} title="Delete" className="p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          <div className="px-4 pb-3"><Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} /></div>
        </CardContent>
      </Card>

      <Dialog open={!!viewModal} onOpenChange={() => setViewModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-3"><TicketNo no={viewModal?.requestNo || ""} /><StatusBadge value={viewModal?.status || ""} /></DialogTitle></DialogHeader>
          {viewModal && (
            <div className="space-y-4">
              <h3 className="font-semibold text-base">{viewModal.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{viewModal.description || "No description provided"}</p>
              <div className="flex flex-wrap gap-2"><CategoryBadge value={[viewModal.category, viewModal.subcategory].filter(Boolean).join(" › ") || "—"} /><PriorityBadge value={viewModal.priority} /></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {[["Raised by", viewModal.requestedBy], ["Raised on", formatDateTime(viewModal.createdAt)], ["Department", viewModal.department], ["Assigned group", viewModal.assignedGroup], ["Assigned to", viewModal.assignedTo || "Unassigned"], ["Expected closure", fmtDay(viewModal.expectedClosureDate)], ["First response", viewModal.firstResponseAt ? formatDateTime(viewModal.firstResponseAt) : "—"], ["Completed", viewModal.completedAt ? formatDateTime(viewModal.completedAt) : "—"], ["Urgency", viewModal.urgency]].map(([l, v]) => (
                  <div key={l as string} className="space-y-1"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{l}</div><div className="font-medium text-sm">{(v as string) || "—"}</div></div>
                ))}
              </div>
              {viewModal.fulfillmentNotes && (<div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/50 dark:border-emerald-800/30 p-3"><div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold mb-1">Fulfilment notes</div><div className="text-sm text-emerald-800 dark:text-emerald-300">{viewModal.fulfillmentNotes}</div></div>)}
              <ApprovalMatrix ticketId={viewModal.id} ticketType="Service Request" readonly />
              <TicketHistory ticketId={viewModal.id} />
              <hr className="border-border/40" />
              <TicketAttachments ticketType="Service Request" ticketId={viewModal.id} readonly />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{editingItem ? `${workMode ? "Work on" : "My request"} ${editingItem.requestNo}` : "New Service Request"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Label>Title *</Label><Input disabled={reqMode && !["Open", "Pending Approval"].includes(editingItem?.status)} value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="What do you need?" /></div>
            <div className="sm:col-span-2"><Label>Description</Label><Textarea disabled={reqMode && !["Open", "Pending Approval"].includes(editingItem?.status)} value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
            <CategoryFields kind="request" category={formData.category} subcategory={formData.subcategory} disabled={reqMode} onChange={(c, sc) => setFormData({ ...formData, category: c, subcategory: sc, assignedTo: editingItem ? formData.assignedTo : null })} />
            {(!editingItem || (workMode && (formData.category !== editingItem.category || (formData.subcategory || null) !== (editingItem.subcategory || null)))) && <RoutingPreview route={route.data} loading={route.isFetching && !route.data} />}
            {editingItem && <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-[10px] border bg-muted/30 p-3 text-sm">
              <div><div className="text-[11px] text-muted-foreground">Raised by</div><div className="font-medium">{editingItem.requestedBy}</div></div>
              <div><div className="text-[11px] text-muted-foreground">Assigned group</div><div className="font-medium">{editingItem.assignedGroup || "—"}</div></div>
              <div><div className="text-[11px] text-muted-foreground">Expected closure</div><div className="font-medium">{fmtDay(editingItem.expectedClosureDate)}</div></div>
            </div>}
            <div><Label>Priority</Label><Select disabled={reqMode} value={formData.priority || "Medium"} onValueChange={v => setFormData({ ...formData, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Urgency</Label><Select value={formData.urgency || "__none__"} onValueChange={v => setFormData({ ...formData, urgency: v === "__none__" ? "" : v })}><SelectTrigger><SelectValue placeholder="Select urgency" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{URGENCIES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Department</Label><Select value={formData.department || "__none__"} onValueChange={v => setFormData({ ...formData, department: v === "__none__" ? "" : v })}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
            {!editingItem && (isAgent ? <div><Label>Raised for</Label><OnBehalfSelect value={formData.onBehalfOfUserId} onChange={id => setFormData({ ...formData, onBehalfOfUserId: id })} /></div>
              : <div><Label>Raised by</Label><div className="h-10 flex items-center text-sm font-medium">{user?.name}</div></div>)}
            {!editingItem && route.data?.ok && route.data.canAssign && <div><Label>Assign to (optional)</Label><TeamMemberSelect teamId={route.data.teamId} value={formData.assignedTo} onChange={v => setFormData({ ...formData, assignedTo: v })} /></div>}
            {!editingItem && route.data?.ok && !route.data.canAssign && <div className="text-[11px] text-muted-foreground self-end pb-2">{route.data.team} will pick it up and assign it.</div>}
            {workMode && <>
              <div><Label>Status</Label><Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Assign to (team member)</Label><TeamMemberSelect teamId={editingItem.teamId} value={formData.assignedTo} onChange={v => setFormData({ ...formData, assignedTo: v })} /></div>
              <TransferFields currentTeamId={editingItem.teamId} teamId={formData._teamId} reason={formData._reason} onChange={(t, r) => setFormData({ ...formData, _teamId: t, _reason: r })} />
              {DONE.includes(editingItem.status) && formData.status !== editingItem.status && !DONE.includes(formData.status) && <div className="sm:col-span-2"><Label>Reason to reopen *</Label><Input value={formData.reopenReason || ""} onChange={e => setFormData({ ...formData, reopenReason: e.target.value })} /></div>}
              <div className="sm:col-span-2"><Label>Fulfilment notes {formData.status === "Completed" && "*"}</Label><Textarea value={formData.fulfillmentNotes || ""} onChange={e => setFormData({ ...formData, fulfillmentNotes: e.target.value })} rows={2} placeholder="What was done (required to complete)" /></div>
            </>}
            {reqMode && <div className="sm:col-span-2 text-xs text-muted-foreground">Only {editingItem.assignedGroup || "the assigned team"} can change the status or assign this request. You can update the details while it is open, or cancel it.</div>}
          </div>
          {editingItem && (<><div className="mt-4"><ApprovalMatrix ticketId={editingItem.id} ticketType="Service Request" /></div><hr className="border-border/40 mt-4" /><div className="mt-2"><TicketAttachments ticketType="Service Request" ticketId={editingItem.id} /></div></>)}
          <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-2 flex justify-between gap-2 border-t bg-background px-6 py-3 sm:rounded-b-lg">
            <div>{reqMode && !DONE.includes(editingItem.status) && editingItem.status !== "In Progress" && <Button variant="outline" className="text-red-600" onClick={() => cancelOwn(editingItem)}>Cancel my request</Button>}</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>Close</Button>
              <Button onClick={handleSave} disabled={!formData.title || (reqMode && !["Open", "Pending Approval"].includes(editingItem?.status)) || (!editingItem && !route.data?.ok) || (workMode && !!formData._teamId && formData._teamId !== editingItem.teamId && (formData._reason || "").trim().length < 5)} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white">{editingItem ? "Save" : "Raise request"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Ticket history (status, assignment, transfers, approvals) — newest first. */
function TicketHistory({ ticketId }: { ticketId: number }) {
  const { data = [] } = useQuery<any[]>({ queryKey: ["ticket-history", "service_request", ticketId], queryFn: () => apiFetch(`/ticket-history?ticketId=${ticketId}&ticketType=service_request`) });
  if (!data.length) return null;
  return (
    <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">History</div>
      <ol className="space-y-1.5 border-l pl-3">{data.map((h: any) => <li key={h.id} className="text-xs"><span className="text-muted-foreground">{formatDateTime(h.createdAt)} · {String(h.updatedBy || "").replace(/ <.*>$/, "")}</span><div>{h.notes}</div></li>)}</ol>
    </div>
  );
}
