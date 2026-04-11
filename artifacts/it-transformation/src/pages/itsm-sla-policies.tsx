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
import { Plus, Trash2, Edit, Search, Eye, Shield, Clock, Timer, Target, AlertTriangle, Bug, GitBranch, Headphones } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";

const PAGE_SIZE = 10;
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const TICKET_TYPES = ["Incident", "Problem", "Change Request", "Service Request"];
const PRIORITY_COLORS: Record<string, string> = { Critical: "#dc2626", High: "#ea580c", Medium: "#d4a843", Low: "#2563eb" };
const TYPE_ICON: Record<string, any> = { Incident: AlertTriangle, Problem: Bug, "Change Request": GitBranch, "Service Request": Headphones };
const TYPE_COLOR: Record<string, string> = {
  Incident: "border-red-500/30 text-red-600 bg-red-50 dark:bg-red-400/10",
  Problem: "border-violet-500/30 text-violet-600 bg-violet-50 dark:bg-violet-400/10",
  "Change Request": "border-teal-500/30 text-teal-600 bg-teal-50 dark:bg-teal-400/10",
  "Service Request": "border-blue-500/30 text-blue-600 bg-blue-50 dark:bg-blue-400/10",
};

export default function ItsmSlaPolicies() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [activeType, setActiveType] = useState("Incident");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: slas = [] } = useQuery({ queryKey: ["sla-policies"], queryFn: () => apiFetch<any[]>("/sla-policies") });

  const createSla = useMutation({ mutationFn: (d: any) => apiFetch("/sla-policies", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sla-policies"] }) });
  const updateSla = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/sla-policies/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sla-policies"] }) });
  const deleteSla = useMutation({ mutationFn: (id: number) => apiFetch(`/sla-policies/${id}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sla-policies"] }) });

  const typeSlas = useMemo(() => slas.filter((s: any) => s.ticketType === activeType), [slas, activeType]);

  const filtered = useMemo(() => {
    let list = typeSlas;
    if (search) list = list.filter((s: any) => [s.name, s.priority].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterPriority) list = list.filter((s: any) => s.priority === filterPriority);
    return list;
  }, [typeSlas, search, filterPriority]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    TICKET_TYPES.forEach(t => { counts[t] = slas.filter((s: any) => s.ticketType === t).length; });
    return counts;
  }, [slas]);

  const avgResponse = typeSlas.length > 0 ? (typeSlas.reduce((s: number, p: any) => s + (p.responseTimeHours || 0), 0) / typeSlas.length).toFixed(1) : "—";
  const avgResolution = typeSlas.length > 0 ? (typeSlas.reduce((s: number, p: any) => s + (p.resolutionTimeHours || 0), 0) / typeSlas.length).toFixed(1) : "—";
  const escalationCount = typeSlas.filter((s: any) => s.escalationEnabled).length;

  function openCreate() { setEditingItem(null); setFormData({ ticketType: activeType, priority: "Medium", responseTimeHours: 4, resolutionTimeHours: 24, escalationEnabled: true }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }

  async function handleSave() {
    try {
      if (editingItem) { await updateSla.mutateAsync({ id: editingItem.id, ...formData }); toast({ title: "SLA policy updated" }); }
      else { await createSla.mutateAsync(formData); toast({ title: "SLA policy created" }); }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete SLA policy "${name}"?`)) return;
    try { await deleteSla.mutateAsync(id); toast({ title: "SLA policy deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SLA Policies</h1>
          <p className="text-sm text-muted-foreground">Define service level agreements per ticket type — {user?.name}</p>
        </div>
        <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />New SLA Policy</Button>
      </div>

      <div className="flex gap-2 border-b border-border pb-0">
        {TICKET_TYPES.map(type => {
          const Icon = TYPE_ICON[type];
          return (
            <button
              key={type}
              onClick={() => { setActiveType(type); setPage(1); setSearch(""); setFilterPriority(""); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeType === type ? "border-[#d4a843] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"}`}
            >
              <Icon className="w-4 h-4" />
              {type}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{typeCounts[type] || 0}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Shield} label={`${activeType} Policies`} value={typeSlas.length} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Target} label="With Escalation" value={escalationCount} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" />
        <StatCard icon={Clock} label="Avg Response" value={`${avgResponse}h`} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={Timer} label="Avg Resolution" value={`${avgResolution}h`} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600" borderColor="border-l-violet-500" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search SLA policies..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div>
            <Select value={filterPriority} onValueChange={v => { setFilterPriority(v === "all" ? "" : v); setPage(1); }}><SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger><SelectContent><SelectItem value="all">All Priorities</SelectItem>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Policy Name</TableHead><TableHead>Priority</TableHead><TableHead>Response Time</TableHead><TableHead>Resolution Time</TableHead><TableHead>Escalation</TableHead><TableHead>Status</TableHead><TableHead className="w-[100px] text-center">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {paged.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No SLA policies for {activeType}</TableCell></TableRow>}
              {paged.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><Badge variant="outline" style={{ borderColor: PRIORITY_COLORS[s.priority], color: PRIORITY_COLORS[s.priority] }}>{s.priority}</Badge></TableCell>
                  <TableCell className="font-semibold">{s.responseTimeHours}h</TableCell>
                  <TableCell className="font-semibold">{s.resolutionTimeHours}h</TableCell>
                  <TableCell>
                    {s.escalationEnabled ? (
                      <div>
                        <Badge variant="outline" className="border-red-500/30 text-red-600 bg-red-50 dark:bg-red-400/10">Enabled</Badge>
                        {s.escalationPolicy && <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] truncate">{s.escalationPolicy}</p>}
                      </div>
                    ) : (
                      <Badge variant="outline" className="border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10">Disabled</Badge>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={s.isActive !== false ? "border-emerald-500/30 text-emerald-600 bg-emerald-50" : "border-gray-400/30 text-gray-500 bg-gray-50"}>{s.isActive !== false ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setViewModal(s)} className="p-1.5 rounded hover:bg-muted"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-muted"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                      {isAdmin && <button onClick={() => handleDelete(s.id, s.name)} className="p-1.5 rounded hover:bg-muted"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>SLA Policy Details</DialogTitle></DialogHeader>
          {viewModal && (
            <div className="space-y-4">
              <h3 className="font-semibold">{viewModal.name}</h3>
              <Badge variant="outline" className={TYPE_COLOR[viewModal.ticketType] || ""}>{viewModal.ticketType}</Badge>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Priority", viewModal.priority], ["Response Time", `${viewModal.responseTimeHours} hours`], ["Resolution Time", `${viewModal.resolutionTimeHours} hours`], ["Status", viewModal.isActive !== false ? "Active" : "Inactive"]].map(([l, v]) => (
                  <div key={l as string}><div className="text-[10px] uppercase text-muted-foreground font-semibold">{l}</div><div className="font-medium">{v as string}</div></div>
                ))}
              </div>
              {viewModal.escalationPolicy && <div><div className="text-[10px] uppercase text-muted-foreground font-semibold">Escalation Policy</div><div className="text-sm bg-amber-50 dark:bg-amber-900/10 p-2 rounded">{viewModal.escalationPolicy}</div></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingItem ? "Edit SLA Policy" : "New SLA Policy"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Policy Name *</Label><Input value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
            <div><Label>Ticket Type</Label><Select value={formData.ticketType || "Incident"} onValueChange={v => setFormData({ ...formData, ticketType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TICKET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Priority</Label><Select value={formData.priority || "Medium"} onValueChange={v => setFormData({ ...formData, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Response Time (hours) *</Label><Input type="number" value={formData.responseTimeHours || ""} onChange={e => setFormData({ ...formData, responseTimeHours: parseInt(e.target.value) })} /></div>
            <div><Label>Resolution Time (hours) *</Label><Input type="number" value={formData.resolutionTimeHours || ""} onChange={e => setFormData({ ...formData, resolutionTimeHours: parseInt(e.target.value) })} /></div>
            <div><Label>Escalation Enabled</Label><Select value={formData.escalationEnabled ? "true" : "false"} onValueChange={v => setFormData({ ...formData, escalationEnabled: v === "true" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent></Select></div>
            <div><Label>Active</Label><Select value={formData.isActive !== false ? "true" : "false"} onValueChange={v => setFormData({ ...formData, isActive: v === "true" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Active</SelectItem><SelectItem value="false">Inactive</SelectItem></SelectContent></Select></div>
            <div className="col-span-2"><Label>Escalation Policy</Label><Input value={formData.escalationPolicy || ""} onChange={e => setFormData({ ...formData, escalationPolicy: e.target.value })} placeholder="Describe escalation procedure" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.name} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">{editingItem ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
