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
import { Plus, Trash2, Edit, Search, Eye, AlertTriangle, CheckCircle2, Clock, Timer, XCircle } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";

const PAGE_SIZE = 10;
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const SEVERITIES = ["S1", "S2", "S3", "S4"];
const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];
const CATEGORIES = ["Application", "Infrastructure", "Network", "Hardware", "Security", "Service Request"];
const PRIORITY_BADGE: Record<string, string> = {
  Critical: "border-red-500/50 text-red-700 bg-red-50 dark:bg-red-400/10",
  High: "border-orange-500/50 text-orange-700 bg-orange-50 dark:bg-orange-400/10",
  Medium: "border-amber-500/50 text-amber-700 bg-amber-50 dark:bg-amber-400/10",
  Low: "border-blue-500/50 text-blue-600 bg-blue-50 dark:bg-blue-400/10",
};
const STATUS_BADGE: Record<string, string> = {
  Open: "border-red-500/30 text-red-600 bg-red-50 dark:bg-red-400/10",
  "In Progress": "border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-400/10",
  Resolved: "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10",
  Closed: "border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
};

function timeSince(dateStr: string) {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diffMs / 3600000);
  return hours > 0 ? `${hours}h ago` : "Just now";
}

export default function ItsmIncidents() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: incidents = [] } = useQuery({ queryKey: ["incidents"], queryFn: () => apiFetch<any[]>("/incidents") });

  const createInc = useMutation({ mutationFn: (data: any) => apiFetch("/incidents", { method: "POST", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); queryClient.invalidateQueries({ queryKey: ["incidents-stats"] }); } });
  const updateInc = useMutation({ mutationFn: ({ id, ...data }: any) => apiFetch(`/incidents/${id}`, { method: "PATCH", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); queryClient.invalidateQueries({ queryKey: ["incidents-stats"] }); } });
  const deleteInc = useMutation({ mutationFn: (id: number) => apiFetch(`/incidents/${id}`, { method: "DELETE" }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); queryClient.invalidateQueries({ queryKey: ["incidents-stats"] }); } });

  const filtered = useMemo(() => {
    let list = incidents;
    if (search) list = list.filter((i: any) => [i.ticketNo, i.title, i.assignedTo, i.reportedBy, i.affectedSystem].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterPriority) list = list.filter((i: any) => i.priority === filterPriority);
    if (filterStatus) list = list.filter((i: any) => i.status === filterStatus);
    if (filterCategory) list = list.filter((i: any) => i.category === filterCategory);
    return list;
  }, [incidents, search, filterPriority, filterStatus, filterCategory]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCount = incidents.filter((i: any) => i.status === "Open").length;
  const inProgressCount = incidents.filter((i: any) => i.status === "In Progress").length;
  const resolvedCount = incidents.filter((i: any) => i.status === "Resolved").length;
  const criticalOpen = incidents.filter((i: any) => i.priority === "Critical" && (i.status === "Open" || i.status === "In Progress")).length;

  function openCreate() { setEditingItem(null); setFormData({ status: "Open", priority: "Medium", severity: "S3" }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }
  function clearFilters() { setSearch(""); setFilterPriority(""); setFilterStatus(""); setFilterCategory(""); setPage(1); }

  async function handleSave() {
    try {
      if (editingItem) { await updateInc.mutateAsync({ id: editingItem.id, ...formData }); toast({ title: "Incident updated" }); }
      else { await createInc.mutateAsync(formData); toast({ title: "Incident created" }); }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number, ticket: string) {
    if (!confirm(`Delete incident ${ticket}?`)) return;
    try { await deleteInc.mutateAsync(id); toast({ title: "Incident deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Incident Management</h1>
          <p className="text-sm text-muted-foreground">Track and resolve IT incidents — {user?.name}</p>
        </div>
        <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />New Incident</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={AlertTriangle} label="Open" value={openCount} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" sub={criticalOpen > 0 ? `${criticalOpen} critical` : undefined} />
        <StatCard icon={Timer} label="In Progress" value={inProgressCount} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={CheckCircle2} label="Resolved" value={resolvedCount} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={XCircle} label="Total Incidents" value={incidents.length} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search ticket, title, assignee..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterPriority} onValueChange={v => { setFilterPriority(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Priorities</SelectItem>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={v => { setFilterCategory(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Categories</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            {(search || filterPriority || filterStatus || filterCategory) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">Clear</Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground mb-2">Showing {filtered.length} of {incidents.length} incidents</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Ticket #</TableHead><TableHead>Title</TableHead><TableHead>Priority</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Category</TableHead><TableHead>Assigned To</TableHead><TableHead>Created</TableHead><TableHead className="w-[100px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No incidents found</TableCell></TableRow>}
              {paged.map((inc: any) => (
                <TableRow key={inc.id} className={inc.priority === "Critical" && inc.status === "Open" ? "bg-red-50/50 dark:bg-red-900/5" : ""}>
                  <TableCell className="font-mono text-xs font-semibold">{inc.ticketNo}</TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">{inc.title}</TableCell>
                  <TableCell><Badge variant="outline" className={PRIORITY_BADGE[inc.priority]}>{inc.priority}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{inc.severity}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_BADGE[inc.status] || ""}>{inc.status}</Badge></TableCell>
                  <TableCell className="text-xs">{inc.category || "—"}</TableCell>
                  <TableCell className="text-sm">{inc.assignedTo || <span className="text-red-500">Unassigned</span>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{timeSince(inc.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setViewModal(inc)} className="p-1.5 rounded hover:bg-muted" title="View"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(inc)} className="p-1.5 rounded hover:bg-muted" title="Edit"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                      {isAdmin && <button onClick={() => handleDelete(inc.id, inc.ticketNo)} className="p-1.5 rounded hover:bg-muted" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Incident {viewModal?.ticketNo}</DialogTitle></DialogHeader>
          {viewModal && (
            <div className="space-y-4">
              <h3 className="font-semibold">{viewModal.title}</h3>
              <p className="text-sm text-muted-foreground">{viewModal.description || "No description"}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Priority", viewModal.priority], ["Severity", viewModal.severity], ["Status", viewModal.status], ["Category", viewModal.category], ["Assigned To", viewModal.assignedTo], ["Assigned Group", viewModal.assignedGroup], ["Reported By", viewModal.reportedBy], ["Affected System", viewModal.affectedSystem]].map(([l, v]) => (
                  <div key={l as string}><div className="text-[10px] uppercase text-muted-foreground font-semibold">{l}</div><div className="font-medium">{(v as string) || "—"}</div></div>
                ))}
              </div>
              {viewModal.resolutionNotes && <div><div className="text-[10px] uppercase text-muted-foreground font-semibold">Resolution Notes</div><div className="text-sm bg-emerald-50 dark:bg-emerald-900/10 p-2 rounded">{viewModal.resolutionNotes}</div></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? `Edit ${editingItem.ticketNo}` : "New Incident"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
            <div><Label>Priority</Label><Select value={formData.priority || "Medium"} onValueChange={v => setFormData({ ...formData, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Severity</Label><Select value={formData.severity || "S3"} onValueChange={v => setFormData({ ...formData, severity: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Category</Label><Select value={formData.category || ""} onValueChange={v => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Status</Label><Select value={formData.status || "Open"} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Assigned To</Label><Input value={formData.assignedTo || ""} onChange={e => setFormData({ ...formData, assignedTo: e.target.value })} /></div>
            <div><Label>Assigned Group</Label><Input value={formData.assignedGroup || ""} onChange={e => setFormData({ ...formData, assignedGroup: e.target.value })} /></div>
            <div><Label>Reported By</Label><Input value={formData.reportedBy || ""} onChange={e => setFormData({ ...formData, reportedBy: e.target.value })} /></div>
            <div><Label>Affected System</Label><Input value={formData.affectedSystem || ""} onChange={e => setFormData({ ...formData, affectedSystem: e.target.value })} /></div>
            {(formData.status === "Resolved" || formData.status === "Closed") && <div className="col-span-2"><Label>Resolution Notes</Label><Textarea value={formData.resolutionNotes || ""} onChange={e => setFormData({ ...formData, resolutionNotes: e.target.value })} rows={2} /></div>}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.title} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">{editingItem ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
