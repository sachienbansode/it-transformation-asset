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
import { Plus, Trash2, Edit, Search, Eye, GitBranch, CheckCircle2, Clock, AlertTriangle, Shield, Download, Link2, Server, CalendarClock, ListChecks, Paperclip, Users } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";
import { ApprovalMatrix } from "@/components/approval-matrix";
import { TicketWorkflow } from "@/components/ticket-workflow";
import { CsatPanel, RelatedRecords, useOpenFromUrl } from "@/components/itsm-extras";
import { TicketAttachments } from "@/components/itsm-attachments";
import { TicketDialog, FormSection, PendingAttachments, linkPendingFiles, pendingBusy, type PendingFile, EnvAppsFields, EnvAppsView } from "@/components/itsm-form";
import { UserSearchCombobox } from "@/components/user-search-combobox";
import { CategoryFields, RoutingPreview, useRoute, TeamMemberSelect, OnBehalfSelect, useMyTeams, TransferFields, fmtDay } from "@/components/itsm-routing";
import { useItsmConfig } from "@/hooks/use-itsm-config";
import { confirmDialog, reasonDialog } from "@/components/confirm-dialog";
import { fmtCell, fmtDate, fmtDateTime } from "@/lib/date";

const PAGE_SIZE = 10;
const CHANGE_TYPES = ["Standard", "Normal", "Emergency"];
const RISKS = ["High", "Medium", "Low"];
const STATUSES = ["Draft", "Open", "Pending Approval", "Approved", "Rejected", "In Progress", "Completed", "Failed", "Rolled Back", "Closed"];
const CREATE_STATUSES = ["Draft"];
const REOPENABLE = ["Completed", "Closed", "Cancelled"];
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

function formatDate(dateStr: string | null | undefined) {
  return fmtDate(dateStr);
}

function formatDateTime(dateStr: string | null | undefined) {
  return fmtDateTime(dateStr);
}

async function downloadReport(type: string, filename: string) {
  const data = await apiFetch<any[]>(`/itsm-report?type=${type}`);
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(","), ...data.map(row =>
    headers.map(h => {
      const val = row[h] == null ? "" : String(fmtCell(row[h]));
      return `"${val.replace(/"/g, '""')}"`;
    }).join(",")
  )];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ItsmChanges() {
  const cfg = useItsmConfig();
  const CHANGE_CATEGORIES = cfg["itsm.changeCategories"];

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user, canAccess } = useAuth();
  const canEdit = canAccess("itsm_changes", "write"); const canDelete = canAccess("itsm_changes", "admin");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterApproval, setFilterApproval] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: changes = [] } = useQuery({ queryKey: ["changes"], queryFn: () => apiFetch<any[]>("/changes") });
  useOpenFromUrl(changes, setViewModal);
  const { data: problems = [] } = useQuery({ queryKey: ["problems"], queryFn: () => apiFetch<any[]>("/problems") });

  const createChange = useMutation({ mutationFn: (d: any) => apiFetch("/changes", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["changes"] }); queryClient.invalidateQueries({ queryKey: ["changes-stats"] }); } });
  const updateChange = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/changes/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["changes"] }); queryClient.invalidateQueries({ queryKey: ["changes-stats"] }); } });
  const deleteChange = useMutation({ mutationFn: ({ id, reason }: { id: number; reason: string }) => apiFetch(`/changes/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["changes"] }); queryClient.invalidateQueries({ queryKey: ["changes-stats"] }); } });

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

  const { data: myTeams = [] } = useMyTeams();
  const myTeamIds = (myTeams as any[]).map((t: any) => t.id);
  const isAgent = isAdmin || myTeams.length > 0;
  const canWork = (r: any) => isAdmin || (r?.teamId && myTeamIds.includes(r.teamId));
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]); const [saving, setSaving] = useState(false);
  function openCreate() { setEditingItem(null); setFormData({ status: "Draft", type: "Normal", riskLevel: "Medium", approvalStatus: "Pending" }); setPendingFiles([]); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item, _teamId: item.teamId, _reason: "" }); setIsModalOpen(true); }

  async function handleSave() {
    try {
      const { _teamId, _reason, ...f } = formData;
      if (editingItem) {
        const d: any = { ...f };
        for (const k of ["id", "changeNo", "createdAt", "updatedAt", "createdBy", "updatedBy", "isActive", "teamId", "assignedGroup", "requesterUserId", "expectedClosureDate", "firstResponseAt", "approvalStatus", "approvedBy"]) delete d[k];
        if (!canWork(editingItem)) for (const k of ["status", "assignedTo", "category", "subcategory", "priority"]) delete d[k];
        else {
          if (_teamId && _teamId !== editingItem.teamId) { d.teamId = _teamId; d.transferReason = _reason; }
          else if (f.category !== editingItem.category || (f.subcategory || null) !== (editingItem.subcategory || null)) d.transferReason = _reason || "Category corrected";
        }
        await updateChange.mutateAsync({ id: editingItem.id, ...d }); toast({ title: `${editingItem.changeNo} updated` });
      } else {
        setSaving(true);
        const { assignedGroup, ...c } = f;
        const r: any = await createChange.mutateAsync({ ...c, assignedTo: f.assignedTo || undefined, onBehalfOfUserId: f.onBehalfOfUserId || undefined });
        const bad = pendingFiles.length && r?.id ? await linkPendingFiles("Change Request", r.id, pendingFiles) : 0;
        toast({ title: `${r?.changeNo || "Change Request"} created`, description: `Assigned to ${r?.assignedGroup || "—"}${r?.expectedClosureDate ? ` · expected closure ${fmtDay(r.expectedClosureDate)}` : ""}${pendingFiles.length ? ` · ${pendingFiles.length - bad} file(s) attached` : ""}${bad ? ` · ${bad} could not be attached` : ""}` });
      }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  }
  const workMode = !!editingItem && canWork(editingItem);
  const reqMode = !!editingItem && !workMode;
  const route = useRoute("change", isModalOpen && (!editingItem || (workMode && (formData.category !== editingItem.category || (formData.subcategory || null) !== (editingItem.subcategory || null)))) ? formData.category : null, formData.subcategory);

  async function handleDelete(id: number, no: string) {
    const reason = await reasonDialog(`Delete change request ${no}? It is removed from the lists but kept in the audit trail.`, { title: "Delete change request", confirmText: "Delete", destructive: true, label: "Reason for deleting" });
    if (!reason) return;
    try { await deleteChange.mutateAsync({ id, reason }); toast({ title: "Change request deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Change Request Management</h1>
          <p className="text-sm text-muted-foreground">Review and approve IT change requests — {user?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadReport("changes", `changes-report-${new Date().toISOString().slice(0,10)}.csv`)} className="gap-2 text-xs"><Download className="w-3.5 h-3.5" />Export Report</Button>
          {canEdit && <Button onClick={openCreate} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white gap-2"><Plus className="w-4 h-4" />New Change Request</Button>}
        </div>
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
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[100px]">Created</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[100px]">Updated</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[90px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-16 text-muted-foreground">
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
                  <TableCell className="py-3 text-xs text-muted-foreground">{c.implementationDate ? fmtDate(c.implementationDate) : <span className="italic">TBD</span>}</TableCell>
                  <TableCell className="py-3"><AssigneeBadge name={c.requestedBy} /></TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">{formatDate(c.updatedAt)}</TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-0.5 justify-center">
                      <button onClick={() => setViewModal(c)} title="View" className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Eye className="w-4 h-4" /></button>
                      {canEdit && <button onClick={() => openEdit(c)} title={["Completed","Closed","Failed","Rolled Back"].includes(c.status) ? "Ticket is locked — cannot edit completed/closed changes" : "Edit"} disabled={["Completed","Closed","Failed","Rolled Back"].includes(c.status)} className={`p-2 rounded-md transition-colors ${["Completed","Closed","Failed","Rolled Back"].includes(c.status) ? "opacity-30 cursor-not-allowed text-muted-foreground" : "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 hover:text-blue-600"}`}><Edit className="w-4 h-4" /></button>}
                      
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
              <EnvAppsView env={viewModal.environment} apps={viewModal.affectedApps} />
              <div className="flex flex-wrap gap-2">
                <TypeBadge value={viewModal.type} />
                <RiskBadge value={viewModal.riskLevel} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Status", viewModal.status], ["Category", viewModal.category], ["Requested By", viewModal.requestedBy], ["Approved By", viewModal.approvedBy], ["Implementation Date", fmtDate(viewModal.implementationDate)], ["Backout Duration", viewModal.backoutDuration], ["Impact", viewModal.impact], ["Created", formatDateTime(viewModal.createdAt)], ["Last Updated", formatDateTime(viewModal.updatedAt)]].map(([l, v]) => (
                  <div key={l as string} className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{l}</div>
                    <div className="font-medium text-sm">{(v as string) || "—"}</div>
                  </div>
                ))}
              </div>
              {viewModal.problemId && (problems as any[]).find((p: any) => p.id === viewModal.problemId) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800 text-sm text-violet-700 dark:text-violet-400">
                  <Link2 className="w-4 h-4 flex-shrink-0" />
                  <span className="font-semibold">Linked Problem:</span>
                  <span className="truncate">{(problems as any[]).find((p: any) => p.id === viewModal.problemId)?.problemNo} — {(problems as any[]).find((p: any) => p.id === viewModal.problemId)?.title}</span>
                </div>
              )}
              {viewModal.affectedAssets && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-800/30 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-blue-700 dark:text-blue-400 font-semibold mb-1"><Server className="w-3 h-3" />Affected Assets / CIs</div>
                  <div className="text-sm text-blue-800 dark:text-blue-300 whitespace-pre-wrap">{viewModal.affectedAssets}</div>
                </div>
              )}
              {viewModal.rollbackPlan && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-800/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400 font-semibold mb-1">Rollback Plan</div>
                  <div className="text-sm text-red-800 dark:text-red-300">{viewModal.rollbackPlan}</div>
                </div>
              )}
              {viewModal.testPlan && (
                <div className="rounded-lg bg-teal-50 dark:bg-teal-900/10 border border-teal-200/50 dark:border-teal-800/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-teal-700 dark:text-teal-400 font-semibold mb-1">Test Plan</div>
                  <div className="text-sm text-teal-800 dark:text-teal-300 whitespace-pre-wrap">{viewModal.testPlan}</div>
                </div>
              )}
              <TicketWorkflow kind="change" id={viewModal.id} ticketNo={viewModal.changeNo} />
              <RelatedRecords kind="change" id={viewModal.id} />
              <ApprovalMatrix ticketId={viewModal.id} ticketType="Change Request" readonly />
              <hr className="border-border/40" />
              <TicketAttachments ticketType="Change Request" ticketId={viewModal.id} readonly />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <TicketDialog open={isModalOpen} onOpenChange={setIsModalOpen} kind="change" status={editingItem?.status} wide
        title={editingItem ? `${editingItem.changeNo} · ${editingItem.title}` : "Plan a change"}
        subtitle={editingItem ? <span className="inline-flex items-center gap-2">Approval: <ApprovalBadge value={formData.approvalStatus || "Pending"} />{formData.approvedBy ? ` by ${formData.approvedBy}` : ""}</span> : "Any planned change to systems, network, software or configuration — approved before it is done."}
        footer={<>
          <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || pendingBusy(pendingFiles) || !formData.title || (!editingItem && !route.data?.ok) || (reqMode && !["Draft", "Pending Approval"].includes(editingItem?.status)) || (workMode && !!formData._teamId && formData._teamId !== editingItem.teamId && (formData._reason || "").trim().length < 5)} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white" data-testid="change-save">{saving ? "Saving…" : pendingBusy(pendingFiles) ? "Uploading files…" : editingItem ? "Save" : "Create change"}</Button>
        </>}>
        <FormSection title="The change" icon={GitBranch}>
          <div className="sm:col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Upgrade core switch firmware to 17.9" /></div>
          <div className="sm:col-span-2"><Label>Description & reason</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} placeholder="What will change, why it is needed, what happens if it is not done" /></div>
          <div><Label>Change type</Label><Select value={formData.type || "Normal"} onValueChange={v => setFormData({ ...formData, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANGE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
          <div className="hidden sm:block" />
          <CategoryFields kind="change" category={formData.category} subcategory={formData.subcategory} disabled={reqMode} onChange={(c, sc) => setFormData({ ...formData, category: c, subcategory: sc, assignedTo: editingItem ? formData.assignedTo : null })} />
          {(!editingItem || (workMode && (formData.category !== editingItem.category || (formData.subcategory || null) !== (editingItem.subcategory || null)))) && <RoutingPreview route={route.data} loading={route.isFetching && !route.data} />}
          <EnvAppsFields env={formData.environment} apps={formData.affectedApps} appsRequired={/^software|^application/i.test(formData.category || "")} onChange={(environment, affectedApps) => setFormData({ ...formData, environment, affectedApps })} />
        </FormSection>
        <FormSection title="Risk & schedule" icon={CalendarClock}>
          <div><Label>Risk level</Label><Select value={formData.riskLevel || "Medium"} onValueChange={v => setFormData({ ...formData, riskLevel: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RISKS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Implementation date</Label><Input type="date" value={formData.implementationDate || ""} onChange={e => setFormData({ ...formData, implementationDate: e.target.value })} /></div>
          <div><Label>Backout duration</Label><Input value={formData.backoutDuration || ""} onChange={e => setFormData({ ...formData, backoutDuration: e.target.value })} placeholder="e.g. 2 hours" /></div>
          <div className="sm:col-span-2"><Label>Business impact</Label><Input value={formData.impact || ""} onChange={e => setFormData({ ...formData, impact: e.target.value })} placeholder="Who / what is affected during the change, expected downtime" /></div>
        </FormSection>
        <FormSection title="People & work" icon={Users}>
          {!editingItem && (isAgent ? <div><Label>Raised for</Label><OnBehalfSelect value={formData.onBehalfOfUserId} onChange={id => setFormData({ ...formData, onBehalfOfUserId: id })} /></div>
            : <div><Label>Raised by</Label><div className="h-10 flex items-center text-sm font-medium">{user?.name}</div></div>)}
          {!editingItem && route.data?.ok && route.data.canAssign && <div><Label>Assign to (optional)</Label><TeamMemberSelect teamId={route.data.teamId} value={formData.assignedTo} onChange={v => setFormData({ ...formData, assignedTo: v })} /></div>}
          {workMode && <>
            <div><Label>Status</Label><Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Assign to (team member)</Label><TeamMemberSelect others={isAdmin} teamId={editingItem.teamId} value={formData.assignedTo} onChange={v => setFormData({ ...formData, assignedTo: v })} /></div>
            <TransferFields currentTeamId={editingItem.teamId} teamId={formData._teamId} reason={formData._reason} onChange={(t, r) => setFormData({ ...formData, _teamId: t, _reason: r })} />
            {REOPENABLE.includes(editingItem.status) && formData.status !== editingItem.status && !REOPENABLE.includes(formData.status) && <div className="sm:col-span-2"><Label>Reason to reopen *</Label><Input value={formData.reopenReason || ""} onChange={e => setFormData({ ...formData, reopenReason: e.target.value })} /></div>}
          </>}
          {editingItem && <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-[10px] border bg-muted/30 p-3 text-sm">
            <div><div className="text-[11px] text-muted-foreground">Raised by</div><div className="font-medium">{editingItem.reportedBy || editingItem.requestedBy || editingItem.createdBy || "—"}</div></div>
            <div><div className="text-[11px] text-muted-foreground">Assigned group</div><div className="font-medium">{editingItem.assignedGroup || "—"}</div></div>
            <div><div className="text-[11px] text-muted-foreground">Expected closure</div><div className="font-medium">{fmtDay(editingItem.expectedClosureDate)}</div></div>
          </div>}
          {reqMode && <div className="sm:col-span-2 text-xs text-muted-foreground">Only {editingItem.assignedGroup || "the assigned team"} can change the status or assign this ticket.</div>}
        </FormSection>
        <FormSection title="Plans" icon={ListChecks} hint="what you will do if it goes wrong, and how you will know it worked">
          <div className="sm:col-span-2"><Label>Rollback plan</Label><Textarea value={formData.rollbackPlan || ""} onChange={e => setFormData({ ...formData, rollbackPlan: e.target.value })} rows={2} placeholder="Steps to undo the change" /></div>
          <div className="sm:col-span-2"><Label>Test plan</Label><Textarea value={formData.testPlan || ""} onChange={e => setFormData({ ...formData, testPlan: e.target.value })} rows={2} placeholder="Steps to check the change worked" /></div>
        </FormSection>
        <FormSection title="Links & files" icon={Paperclip}>
          <div className="sm:col-span-2">
            <Label className="flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5 text-muted-foreground" />Linked problem</Label>
            <Select value={formData.problemId ? String(formData.problemId) : "none"} onValueChange={v => setFormData({ ...formData, problemId: v === "none" ? null : parseInt(v) })}>
              <SelectTrigger><SelectValue placeholder="No linked problem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No linked problem —</SelectItem>
                {(problems as any[]).filter((p: any) => p.status !== "Closed").map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.problemNo} — {p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5 text-muted-foreground" />Affected assets / CIs</Label>
            <Textarea placeholder="One per line (e.g. SRV-001, SWITCH-12, APP-DB01)" value={formData.affectedAssets || ""} onChange={e => setFormData({ ...formData, affectedAssets: e.target.value })} rows={2} />
          </div>
          {editingItem ? <div className="sm:col-span-2"><TicketAttachments ticketType="Change Request" ticketId={editingItem.id} /></div>
            : <PendingAttachments files={pendingFiles} onChange={setPendingFiles} />}
        </FormSection>
        {editingItem && <ApprovalMatrix ticketId={editingItem.id} ticketType="Change Request" />}
      </TicketDialog>
    </div>
  );
}
