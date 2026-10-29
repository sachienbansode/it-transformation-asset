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
import { Plus, Trash2, Edit, Search, Eye, Bug, CheckCircle2, Clock, AlertTriangle, Download, GitBranch, AlertCircle } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";
import { ApprovalMatrix } from "@/components/approval-matrix";
import { TicketAttachments } from "@/components/itsm-attachments";
import { UserSearchCombobox, GroupSelect } from "@/components/user-search-combobox";
import { useLocation } from "wouter";
import { useItsmConfig } from "@/hooks/use-itsm-config";
import { confirmDialog, reasonDialog } from "@/components/confirm-dialog";
import { fmtCell, fmtDate, fmtDateTime } from "@/lib/date";

const PAGE_SIZE = 10;
const STATUSES = ["Open", "Under Investigation", "Root Cause Identified", "Known Error", "Pending Approval", "Resolved", "Closed"];
const CREATE_STATUSES = ["Open"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

const PRIORITY_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Critical: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
  High:     { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", dot: "bg-orange-500" },
  Medium:   { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  Low:      { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-400" },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Open:                    { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  "Under Investigation":   { bg: "bg-violet-50 dark:bg-violet-900/20", text: "text-violet-600 dark:text-violet-400", dot: "bg-violet-500" },
  "Root Cause Identified": { bg: "bg-teal-50 dark:bg-teal-900/20", text: "text-teal-600 dark:text-teal-400", dot: "bg-teal-500" },
  "Known Error":           { bg: "bg-orange-50 dark:bg-orange-900/20", text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  "Pending Approval":      { bg: "bg-indigo-50 dark:bg-indigo-900/20", text: "text-indigo-600 dark:text-indigo-400", dot: "bg-indigo-500" },
  Resolved:                { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  Closed:                  { bg: "bg-gray-100 dark:bg-gray-800/40", text: "text-gray-500 dark:text-gray-400", dot: "bg-gray-400" },
};

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

function AssigneeBadge({ name }: { name?: string }) {
  if (!name) return <span className="text-xs text-muted-foreground italic">Unassigned</span>;
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{initials}</span>
      <span className="text-sm font-medium truncate max-w-[100px]">{name}</span>
    </span>
  );
}

function TicketNo({ no }: { no: string }) {
  const [prefix, ...rest] = no.split("-");
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-xs">
      <span className="font-bold text-violet-600 dark:text-violet-400">{prefix}</span>
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

export default function ItsmProblems() {
  const cfg = useItsmConfig();
  const PROBLEM_CATEGORIES = cfg["itsm.problemCategories"];
  const IMPACT_LEVELS = cfg["itsm.impactLevels"];

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user, canAccess } = useAuth();
  const canEdit = canAccess("itsm_problems", "write"); const canDelete = canAccess("itsm_problems", "admin");
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: problems = [] } = useQuery({ queryKey: ["problems"], queryFn: () => apiFetch<any[]>("/problems") });
  const { data: incidents = [] } = useQuery({ queryKey: ["incidents"], queryFn: () => apiFetch<any[]>("/incidents") });

  const createProblem = useMutation({ mutationFn: (d: any) => apiFetch("/problems", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["problems"] }) });
  const updateProblem = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/problems/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["problems"] }) });
  const deleteProblem = useMutation({ mutationFn: ({ id, reason }: { id: number; reason: string }) => apiFetch(`/problems/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["problems"] }) });

  const filtered = useMemo(() => {
    let list = problems;
    if (search) list = list.filter((p: any) => [p.problemNo, p.title, p.assignedTo, p.rootCause].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterStatus) list = list.filter((p: any) => p.status === filterStatus);
    if (filterPriority) list = list.filter((p: any) => p.priority === filterPriority);
    return list;
  }, [problems, search, filterStatus, filterPriority]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeCount = problems.filter((p: any) => p.status !== "Closed").length;
  const knownErrors = problems.filter((p: any) => p.status === "Known Error").length;
  const rootCauseIdentified = problems.filter((p: any) => p.status === "Root Cause Identified").length;

  function openCreate() { setEditingItem(null); setFormData({ status: "Open", priority: "Medium" }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }

  async function handleSave() {
    try {
      if (editingItem) { await updateProblem.mutateAsync({ id: editingItem.id, ...formData }); toast({ title: "Problem updated" }); }
      else { await createProblem.mutateAsync(formData); toast({ title: "Problem created" }); }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number, no: string) {
    const reason = await reasonDialog(`Delete problem ${no}? It is removed from the lists but kept in the audit trail.`, { title: "Delete problem", confirmText: "Delete", destructive: true, label: "Reason for deleting" });
    if (!reason) return;
    try { await deleteProblem.mutateAsync({ id, reason }); toast({ title: "Problem deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Problem Management</h1>
          <p className="text-sm text-muted-foreground">Root cause analysis and known error tracking — {user?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadReport("problems", `problems-report-${new Date().toISOString().slice(0,10)}.csv`)} className="gap-2 text-xs"><Download className="w-3.5 h-3.5" />Export Report</Button>
          {canEdit && <Button onClick={openCreate} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white gap-2"><Plus className="w-4 h-4" />New Problem</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Bug} label="Total Problems" value={problems.length} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600" borderColor="border-l-violet-500" />
        <StatCard icon={AlertTriangle} label="Active" value={activeCount} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" />
        <StatCard icon={CheckCircle2} label="Root Cause Found" value={rootCauseIdentified} iconBg="bg-teal-100 dark:bg-teal-900/30" iconColor="text-teal-600" borderColor="border-l-teal-500" />
        <StatCard icon={Clock} label="Known Errors" value={knownErrors} iconBg="bg-orange-100 dark:bg-orange-900/30" iconColor="text-orange-600" borderColor="border-l-orange-500" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap gap-3 items-center p-4 border-b">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search problems..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={v => { setFilterPriority(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Priorities</SelectItem>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            {(search || filterStatus || filterPriority) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterStatus(""); setFilterPriority(""); setPage(1); }} className="text-xs text-muted-foreground">Clear filters</Button>
            )}
          </div>

          <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/20">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of <span className="font-semibold text-foreground">{problems.length}</span> problems
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[110px]">Problem #</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Title</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[170px]">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[110px]">Priority</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Root Cause</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Assigned To</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[100px]">Related</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[100px]">Created</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[100px]">Updated</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[90px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-16 text-muted-foreground">
                    <Bug className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No problems found</p>
                    <p className="text-xs mt-1">Try adjusting your filters</p>
                  </TableCell>
                </TableRow>
              )}
              {paged.map((p: any) => (
                <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="py-3"><TicketNo no={p.problemNo} /></TableCell>
                  <TableCell className="py-3">
                    <div className="font-medium text-sm leading-tight max-w-[200px] truncate" title={p.title}>{p.title}</div>
                    {p.affectedSystems && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.affectedSystems}</div>}
                  </TableCell>
                  <TableCell className="py-3"><StatusBadge value={p.status} /></TableCell>
                  <TableCell className="py-3"><PriorityBadge value={p.priority} /></TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground max-w-[180px] truncate">{p.rootCause || <span className="italic">TBD</span>}</TableCell>
                  <TableCell className="py-3"><AssigneeBadge name={p.assignedTo} /></TableCell>
                  <TableCell className="py-3 font-mono text-xs text-muted-foreground">{p.relatedIncidents || "—"}</TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">{formatDate(p.updatedAt)}</TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-0.5 justify-center">
                      <button onClick={() => setViewModal(p)} title="View" className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Eye className="w-4 h-4" /></button>
                      {canEdit && <button onClick={() => openEdit(p)} title={["Resolved","Closed"].includes(p.status) ? "Ticket is locked — cannot edit resolved/closed" : "Edit"} disabled={["Resolved","Closed"].includes(p.status)} className={`p-2 rounded-md transition-colors ${["Resolved","Closed"].includes(p.status) ? "opacity-30 cursor-not-allowed text-muted-foreground" : "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 hover:text-blue-600"}`}><Edit className="w-4 h-4" /></button>}
                      {canDelete && <button onClick={() => handleDelete(p.id, p.problemNo)} title="Delete" className="p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>}
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
              <TicketNo no={viewModal?.problemNo || ""} />
              <StatusBadge value={viewModal?.status || ""} />
            </DialogTitle>
          </DialogHeader>
          {viewModal && (() => {
            const linkedIncidents = (incidents as any[]).filter((i: any) => i.problemId === viewModal.id);
            return (
            <div className="space-y-4">
              <h3 className="font-semibold text-base">{viewModal.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{viewModal.description || "No description provided"}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <PriorityBadge value={viewModal.priority} />
                <Button size="sm" variant="outline" onClick={() => { setViewModal(null); navigate("/itsm-changes"); }} className="h-7 text-xs gap-1.5 border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400">
                  <GitBranch className="w-3.5 h-3.5" />Raise Change
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Category", viewModal.category], ["Impact Level", viewModal.impactLevel], ["Assigned To", viewModal.assignedTo], ["Assigned Group", viewModal.assignedGroup], ["Affected Systems", viewModal.affectedSystems], ["Created", formatDateTime(viewModal.createdAt)], ["Last Updated", formatDateTime(viewModal.updatedAt)]].map(([l, v]) => (
                  <div key={l as string} className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{l}</div>
                    <div className="font-medium text-sm">{(v as string) || "—"}</div>
                  </div>
                ))}
              </div>
              {linkedIncidents.length > 0 && (
                <div className="rounded-lg border border-red-200/50 dark:border-red-800/30 bg-red-50/40 dark:bg-red-900/10 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400 font-semibold mb-2">
                    <AlertCircle className="w-3.5 h-3.5" />Linked Incidents ({linkedIncidents.length})
                  </div>
                  <div className="space-y-1.5">
                    {linkedIncidents.map((inc: any) => (
                      <div key={inc.id} className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-red-600 dark:text-red-400">{inc.ticketNo}</span>
                        <span className="text-muted-foreground truncate flex-1">{inc.title}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${inc.priority === "Critical" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>{inc.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {viewModal.rootCause && (
                <div className="rounded-lg bg-teal-50 dark:bg-teal-900/10 border border-teal-200/50 dark:border-teal-800/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-teal-700 dark:text-teal-400 font-semibold mb-1">Root Cause</div>
                  <div className="text-sm text-teal-800 dark:text-teal-300">{viewModal.rootCause}</div>
                </div>
              )}
              {viewModal.workaround && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold mb-1">Workaround</div>
                  <div className="text-sm text-amber-800 dark:text-amber-300">{viewModal.workaround}</div>
                </div>
              )}
              <ApprovalMatrix ticketId={viewModal.id} ticketType="Problem" readonly />
              <hr className="border-border/40" />
              <TicketAttachments ticketType="Problem" ticketId={viewModal.id} readonly />
            </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? `Edit ${editingItem.problemNo}` : "New Problem"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
            <div><Label>Priority</Label><Select value={formData.priority || "Medium"} onValueChange={v => setFormData({ ...formData, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Status</Label><Select value={formData.status || "Open"} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(editingItem ? STATUSES : CREATE_STATUSES).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Category</Label><Select value={formData.category || "__none__"} onValueChange={v => setFormData({ ...formData, category: v === "__none__" ? "" : v })}><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{PROBLEM_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Impact Level</Label><Select value={formData.impactLevel || "__none__"} onValueChange={v => setFormData({ ...formData, impactLevel: v === "__none__" ? "" : v })}><SelectTrigger><SelectValue placeholder="Select impact" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{IMPACT_LEVELS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Assigned To</Label><UserSearchCombobox value={formData.assignedTo || ""} onChange={v => setFormData({ ...formData, assignedTo: v })} /></div>
            <div><Label>Assigned Group</Label><GroupSelect value={formData.assignedGroup || ""} onChange={v => setFormData({ ...formData, assignedGroup: v })} /></div>
            <div><Label>Related Incidents</Label><Input value={formData.relatedIncidents || ""} onChange={e => setFormData({ ...formData, relatedIncidents: e.target.value })} placeholder="INC-00001, INC-00002" /></div>
            <div><Label>Affected Systems</Label><Input value={formData.affectedSystems || ""} onChange={e => setFormData({ ...formData, affectedSystems: e.target.value })} placeholder="e.g. ERP, Network, SAP" /></div>
            <div className="col-span-2"><Label>Root Cause</Label><Textarea value={formData.rootCause || ""} onChange={e => setFormData({ ...formData, rootCause: e.target.value })} rows={2} /></div>
            <div className="col-span-2"><Label>Workaround</Label><Textarea value={formData.workaround || ""} onChange={e => setFormData({ ...formData, workaround: e.target.value })} rows={2} /></div>
          </div>
          {editingItem && (
            <>
              <div className="mt-4"><ApprovalMatrix ticketId={editingItem.id} ticketType="Problem" /></div>
              <hr className="border-border/40 mt-4" />
              <div className="mt-2"><TicketAttachments ticketType="Problem" ticketId={editingItem.id} /></div>
            </>
          )}
          <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-2 flex justify-end gap-2 border-t bg-background px-6 py-3 sm:rounded-b-lg">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.title} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white">{editingItem ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
