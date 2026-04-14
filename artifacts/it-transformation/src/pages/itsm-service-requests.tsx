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
import { UserSearchCombobox, GroupSelect } from "@/components/user-search-combobox";
import { useItsmConfig } from "@/hooks/use-itsm-config";

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
  const CATEGORIES = cfg["itsm.srCategories"];
  const URGENCIES = cfg["itsm.urgencyLevels"];
  const DEPARTMENTS = cfg["itsm.departments"];

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadReport("service-requests", `service-requests-report-${new Date().toISOString().slice(0,10)}.csv`)} className="gap-2 text-xs"><Download className="w-3.5 h-3.5" />Export Report</Button>
          <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />New Request</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Inbox} label="Open" value={openCount} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Timer} label="In Progress" value={inProgressCount} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={CheckCircle2} label="Completed" value={completedCount} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={Headphones} label="Total" value={requests.length} iconBg="bg-teal-100 dark:bg-teal-900/30" iconColor="text-teal-600" borderColor="border-l-teal-500" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap gap-3 items-center p-4 border-b">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search requests..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterCategory} onValueChange={v => { setFilterCategory(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Categories</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            {(search || filterCategory || filterStatus) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterCategory(""); setFilterStatus(""); setPage(1); }} className="text-xs text-muted-foreground">Clear filters</Button>
            )}
          </div>

          <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/20">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of <span className="font-semibold text-foreground">{requests.length}</span> requests
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[110px]">Request #</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Title</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[140px]">Category</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[110px]">Priority</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[140px]">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Requested By</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Assigned To</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[100px]">Created</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[100px]">Updated</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[90px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-16 text-muted-foreground">
                    <Headphones className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No service requests found</p>
                    <p className="text-xs mt-1">Try adjusting your filters</p>
                  </TableCell>
                </TableRow>
              )}
              {paged.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="py-3"><TicketNo no={r.requestNo} /></TableCell>
                  <TableCell className="py-3">
                    <div className="font-medium text-sm leading-tight max-w-[200px] truncate" title={r.title}>{r.title}</div>
                    {r.department && <div className="text-[11px] text-muted-foreground mt-0.5">{r.department}</div>}
                  </TableCell>
                  <TableCell className="py-3"><CategoryBadge value={r.category} /></TableCell>
                  <TableCell className="py-3"><PriorityBadge value={r.priority} /></TableCell>
                  <TableCell className="py-3"><StatusBadge value={r.status} /></TableCell>
                  <TableCell className="py-3"><AssigneeBadge name={r.requestedBy} /></TableCell>
                  <TableCell className="py-3"><AssigneeBadge name={r.assignedTo} /></TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">{formatDate(r.updatedAt)}</TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-0.5 justify-center">
                      <button onClick={() => setViewModal(r)} title="View" className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => openEdit(r)} title={["Completed","Cancelled"].includes(r.status) ? "Ticket is locked — cannot edit completed/cancelled requests" : "Edit"} disabled={["Completed","Cancelled"].includes(r.status)} className={`p-2 rounded-md transition-colors ${["Completed","Cancelled"].includes(r.status) ? "opacity-30 cursor-not-allowed text-muted-foreground" : "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 hover:text-blue-600"}`}><Edit className="w-4 h-4" /></button>
                      {isAdmin && <button onClick={() => handleDelete(r.id, r.requestNo)} title="Delete" className="p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>}
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
              <TicketNo no={viewModal?.requestNo || ""} />
              <StatusBadge value={viewModal?.status || ""} />
            </DialogTitle>
          </DialogHeader>
          {viewModal && (
            <div className="space-y-4">
              <h3 className="font-semibold text-base">{viewModal.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{viewModal.description || "No description provided"}</p>
              <div className="flex flex-wrap gap-2">
                <CategoryBadge value={viewModal.category} />
                <PriorityBadge value={viewModal.priority} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Requested By", viewModal.requestedBy], ["Department", viewModal.department], ["Urgency", viewModal.urgency], ["Due Date", viewModal.dueDate], ["Assigned To", viewModal.assignedTo], ["Assigned Group", viewModal.assignedGroup], ["Created", formatDateTime(viewModal.createdAt)], ["Last Updated", formatDateTime(viewModal.updatedAt)]].map(([l, v]) => (
                  <div key={l as string} className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{l}</div>
                    <div className="font-medium text-sm">{(v as string) || "—"}</div>
                  </div>
                ))}
              </div>
              {viewModal.fulfillmentNotes && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/50 dark:border-emerald-800/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold mb-1">Fulfillment Notes</div>
                  <div className="text-sm text-emerald-800 dark:text-emerald-300">{viewModal.fulfillmentNotes}</div>
                </div>
              )}
              <ApprovalMatrix ticketId={viewModal.id} ticketType="Service Request" readonly />
              <hr className="border-border/40" />
              <TicketAttachments ticketType="Service Request" ticketId={viewModal.id} readonly />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? `Edit ${editingItem.requestNo}` : "New Service Request"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
            <div><Label>Category</Label><Select value={formData.category || "Other"} onValueChange={v => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Priority</Label><Select value={formData.priority || "Medium"} onValueChange={v => setFormData({ ...formData, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Urgency</Label><Select value={formData.urgency || "__none__"} onValueChange={v => setFormData({ ...formData, urgency: v === "__none__" ? "" : v })}><SelectTrigger><SelectValue placeholder="Select urgency" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{URGENCIES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Status</Label><Select value={formData.status || "Open"} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(editingItem ? STATUSES : CREATE_STATUSES).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Requested By</Label><UserSearchCombobox value={formData.requestedBy || ""} onChange={v => setFormData({ ...formData, requestedBy: v })} placeholder="Search requester…" /></div>
            <div><Label>Department</Label><Select value={formData.department || "__none__"} onValueChange={v => setFormData({ ...formData, department: v === "__none__" ? "" : v })}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Assigned To</Label><UserSearchCombobox value={formData.assignedTo || ""} onChange={v => setFormData({ ...formData, assignedTo: v })} /></div>
            <div><Label>Assigned Group</Label><GroupSelect value={formData.assignedGroup || ""} onChange={v => setFormData({ ...formData, assignedGroup: v })} /></div>
            <div><Label>Due Date</Label><Input type="date" value={formData.dueDate || ""} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} /></div>
            <div className="col-span-2"><Label>Fulfillment Notes</Label><Textarea value={formData.fulfillmentNotes || ""} onChange={e => setFormData({ ...formData, fulfillmentNotes: e.target.value })} rows={2} placeholder="Notes on fulfillment progress or completion…" /></div>
          </div>
          {editingItem && (
            <>
              <div className="mt-4"><ApprovalMatrix ticketId={editingItem.id} ticketType="Service Request" /></div>
              <hr className="border-border/40 mt-4" />
              <div className="mt-2"><TicketAttachments ticketType="Service Request" ticketId={editingItem.id} /></div>
            </>
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
