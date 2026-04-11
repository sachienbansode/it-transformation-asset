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
import { Plus, Trash2, Edit, Search, Eye, Bug, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";

const PAGE_SIZE = 10;
const STATUSES = ["Open", "Under Investigation", "Root Cause Identified", "Known Error", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PRIORITY_BADGE: Record<string, string> = { Critical: "border-red-500/50 text-red-700 bg-red-50 dark:bg-red-400/10", High: "border-orange-500/50 text-orange-700 bg-orange-50 dark:bg-orange-400/10", Medium: "border-amber-500/50 text-amber-700 bg-amber-50 dark:bg-amber-400/10", Low: "border-blue-500/50 text-blue-600 bg-blue-50 dark:bg-blue-400/10" };
const STATUS_BADGE: Record<string, string> = { Open: "border-red-500/30 text-red-600 bg-red-50", "Under Investigation": "border-violet-500/30 text-violet-600 bg-violet-50", "Root Cause Identified": "border-teal-500/30 text-teal-600 bg-teal-50", "Known Error": "border-orange-500/30 text-orange-600 bg-orange-50", Closed: "border-gray-400/30 text-gray-500 bg-gray-50" };

export default function ItsmProblems() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: problems = [] } = useQuery({ queryKey: ["problems"], queryFn: () => apiFetch<any[]>("/problems") });

  const createProblem = useMutation({ mutationFn: (d: any) => apiFetch("/problems", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["problems"] }) });
  const updateProblem = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/problems/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["problems"] }) });
  const deleteProblem = useMutation({ mutationFn: (id: number) => apiFetch(`/problems/${id}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["problems"] }) });

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
    if (!confirm(`Delete problem ${no}?`)) return;
    try { await deleteProblem.mutateAsync(id); toast({ title: "Problem deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Problem Management</h1>
          <p className="text-sm text-muted-foreground">Root cause analysis and known error tracking — {user?.name}</p>
        </div>
        <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />New Problem</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Bug} label="Total Problems" value={problems.length} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600" borderColor="border-l-violet-500" />
        <StatCard icon={AlertTriangle} label="Active" value={activeCount} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" />
        <StatCard icon={CheckCircle2} label="Root Cause Found" value={rootCauseIdentified} iconBg="bg-teal-100 dark:bg-teal-900/30" iconColor="text-teal-600" borderColor="border-l-teal-500" />
        <StatCard icon={Clock} label="Known Errors" value={knownErrors} iconBg="bg-orange-100 dark:bg-orange-900/30" iconColor="text-orange-600" borderColor="border-l-orange-500" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search problems..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}><SelectTrigger className="w-[170px]"><SelectValue placeholder="All Statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            <Select value={filterPriority} onValueChange={v => { setFilterPriority(v === "all" ? "" : v); setPage(1); }}><SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger><SelectContent><SelectItem value="all">All Priorities</SelectItem>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-[90px]">Problem #</TableHead><TableHead>Title</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Root Cause</TableHead><TableHead>Assigned To</TableHead><TableHead>Related</TableHead><TableHead className="w-[100px] text-center">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {paged.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No problems found</TableCell></TableRow>}
              {paged.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs font-semibold">{p.problemNo}</TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">{p.title}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_BADGE[p.status] || ""}>{p.status}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={PRIORITY_BADGE[p.priority]}>{p.priority}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate text-muted-foreground">{p.rootCause || "TBD"}</TableCell>
                  <TableCell className="text-sm">{p.assignedTo || "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.relatedIncidents || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setViewModal(p)} className="p-1.5 rounded hover:bg-muted"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-muted"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                      {isAdmin && <button onClick={() => handleDelete(p.id, p.problemNo)} className="p-1.5 rounded hover:bg-muted"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
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
          <DialogHeader><DialogTitle>Problem {viewModal?.problemNo}</DialogTitle></DialogHeader>
          {viewModal && (
            <div className="space-y-4">
              <h3 className="font-semibold">{viewModal.title}</h3>
              <p className="text-sm text-muted-foreground">{viewModal.description || "No description"}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Status", viewModal.status], ["Priority", viewModal.priority], ["Assigned To", viewModal.assignedTo], ["Related Incidents", viewModal.relatedIncidents], ["Affected Systems", viewModal.affectedSystems]].map(([l, v]) => (
                  <div key={l as string}><div className="text-[10px] uppercase text-muted-foreground font-semibold">{l}</div><div className="font-medium">{(v as string) || "—"}</div></div>
                ))}
              </div>
              {viewModal.rootCause && <div><div className="text-[10px] uppercase text-muted-foreground font-semibold">Root Cause</div><div className="text-sm bg-teal-50 dark:bg-teal-900/10 p-2 rounded">{viewModal.rootCause}</div></div>}
              {viewModal.workaround && <div><div className="text-[10px] uppercase text-muted-foreground font-semibold">Workaround</div><div className="text-sm bg-amber-50 dark:bg-amber-900/10 p-2 rounded">{viewModal.workaround}</div></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? `Edit ${editingItem.problemNo}` : "New Problem"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
            <div><Label>Priority</Label><Select value={formData.priority || "Medium"} onValueChange={v => setFormData({ ...formData, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Status</Label><Select value={formData.status || "Open"} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Assigned To</Label><Input value={formData.assignedTo || ""} onChange={e => setFormData({ ...formData, assignedTo: e.target.value })} /></div>
            <div><Label>Related Incidents</Label><Input value={formData.relatedIncidents || ""} onChange={e => setFormData({ ...formData, relatedIncidents: e.target.value })} placeholder="INC-00001, INC-00002" /></div>
            <div className="col-span-2"><Label>Affected Systems</Label><Input value={formData.affectedSystems || ""} onChange={e => setFormData({ ...formData, affectedSystems: e.target.value })} /></div>
            <div className="col-span-2"><Label>Root Cause</Label><Textarea value={formData.rootCause || ""} onChange={e => setFormData({ ...formData, rootCause: e.target.value })} rows={2} /></div>
            <div className="col-span-2"><Label>Workaround</Label><Textarea value={formData.workaround || ""} onChange={e => setFormData({ ...formData, workaround: e.target.value })} rows={2} /></div>
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
