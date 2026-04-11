import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Search, AlertTriangle, Bug, GitBranch, BookOpen, Clock, CheckCircle2, BarChart3, Shield, FileText } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch, API } from "@/lib/api";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PAGE_SIZE = 10;
const COLORS = ["#dc2626", "#ea580c", "#d4a843", "#059669", "#2563eb", "#8b5cf6", "#0f766e"];

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
  "Under Investigation": "border-violet-500/30 text-violet-600 bg-violet-50 dark:bg-violet-400/10",
  "Known Error": "border-orange-500/30 text-orange-600 bg-orange-50 dark:bg-orange-400/10",
  "Root Cause Identified": "border-teal-500/30 text-teal-600 bg-teal-50 dark:bg-teal-400/10",
  Draft: "border-gray-400/30 text-gray-500 bg-gray-50",
  Scheduled: "border-blue-500/30 text-blue-600 bg-blue-50",
  Approved: "border-emerald-500/30 text-emerald-600 bg-emerald-50",
  "Under Review": "border-amber-500/30 text-amber-600 bg-amber-50",
  Implementation: "border-violet-500/30 text-violet-600 bg-violet-50",
  Rejected: "border-red-500/30 text-red-600 bg-red-50",
  Pending: "border-amber-500/30 text-amber-600 bg-amber-50",
  Submitted: "border-blue-500/30 text-blue-600 bg-blue-50",
  Completed: "border-emerald-500/30 text-emerald-600 bg-emerald-50",
  Published: "border-emerald-500/30 text-emerald-600 bg-emerald-50",
};

function timeSince(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diffMs / 3600000);
  return hours > 0 ? `${hours}h ago` : "Just now";
}

export default function ITSM() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"incident" | "problem" | "change" | "kb">("incident");
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: incidents = [] } = useQuery({ queryKey: ["incidents"], queryFn: () => apiFetch<any[]>("/incidents") });
  const { data: incidentStats } = useQuery({ queryKey: ["incidents-stats"], queryFn: () => apiFetch<any>("/incidents/stats") });
  const { data: problems = [] } = useQuery({ queryKey: ["problems"], queryFn: () => apiFetch<any[]>("/problems") });
  const { data: changes = [] } = useQuery({ queryKey: ["changes"], queryFn: () => apiFetch<any[]>("/changes") });
  const { data: changeStats } = useQuery({ queryKey: ["changes-stats"], queryFn: () => apiFetch<any>("/changes/stats") });
  const { data: kb = [] } = useQuery({ queryKey: ["knowledge-base"], queryFn: () => apiFetch<any[]>("/knowledge-base") });
  const { data: slas = [] } = useQuery({ queryKey: ["sla-policies"], queryFn: () => apiFetch<any[]>("/sla-policies") });
  const { data: serviceRequests = [] } = useQuery({ queryKey: ["service-requests"], queryFn: () => apiFetch<any[]>("/service-requests") });

  const createIncident = useMutation({ mutationFn: (d: any) => apiFetch("/incidents", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); queryClient.invalidateQueries({ queryKey: ["incidents-stats"] }); } });
  const updateIncident = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/incidents/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); queryClient.invalidateQueries({ queryKey: ["incidents-stats"] }); } });
  const deleteIncident = useMutation({ mutationFn: (id: number) => apiFetch(`/incidents/${id}`, { method: "DELETE" }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); } });

  const createProblem = useMutation({ mutationFn: (d: any) => apiFetch("/problems", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["problems"] }) });
  const updateProblem = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/problems/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["problems"] }) });

  const createChange = useMutation({ mutationFn: (d: any) => apiFetch("/changes", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["changes"] }); queryClient.invalidateQueries({ queryKey: ["changes-stats"] }); } });
  const updateChange = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/changes/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["changes"] }); queryClient.invalidateQueries({ queryKey: ["changes-stats"] }); } });

  const createKB = useMutation({ mutationFn: (d: any) => apiFetch("/knowledge-base", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge-base"] }) });

  const openIncidents = incidents.filter((i: any) => i.status === "Open" || i.status === "In Progress").length;
  const resolvedIncidents = incidents.filter((i: any) => i.status === "Resolved" || i.status === "Closed").length;

  const filteredIncidents = useMemo(() => {
    let list = incidents;
    if (search) list = list.filter((i: any) => [i.ticketNo, i.title, i.assignedTo, i.reportedBy].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterPriority) list = list.filter((i: any) => i.priority === filterPriority);
    if (filterStatus) list = list.filter((i: any) => i.status === filterStatus);
    return list;
  }, [incidents, search, filterPriority, filterStatus]);

  const totalPages = Math.ceil(filteredIncidents.length / PAGE_SIZE);
  const pagedIncidents = filteredIncidents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openModal(type: "incident" | "problem" | "change" | "kb", item?: any) {
    setModalType(type);
    setEditingItem(item || null);
    setFormData(item ? { ...item } : { status: type === "incident" ? "Open" : type === "change" ? "Draft" : type === "problem" ? "Open" : "Published", priority: "Medium" });
    setIsModalOpen(true);
  }

  async function handleSave() {
    try {
      if (modalType === "incident") {
        if (editingItem) { await updateIncident.mutateAsync({ id: editingItem.id, ...formData }); }
        else { await createIncident.mutateAsync(formData); }
      } else if (modalType === "problem") {
        if (editingItem) { await updateProblem.mutateAsync({ id: editingItem.id, ...formData }); }
        else { await createProblem.mutateAsync(formData); }
      } else if (modalType === "change") {
        if (editingItem) { await updateChange.mutateAsync({ id: editingItem.id, ...formData }); }
        else { await createChange.mutateAsync(formData); }
      } else if (modalType === "kb") {
        await createKB.mutateAsync(formData);
      }
      toast({ title: `${modalType === "kb" ? "Article" : modalType.charAt(0).toUpperCase() + modalType.slice(1)} ${editingItem ? "updated" : "created"}` });
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  const statusData = incidentStats?.byStatus?.map((s: any) => ({ name: s.status, value: s.count })) || [];
  const priorityData = incidentStats?.byPriority?.map((p: any) => ({ name: p.priority, value: p.count })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">IT Service Management</h1>
          <p className="text-sm text-muted-foreground">NIYTRI ITSM Module — Incidents, Problems, Changes & Knowledge Base</p>
        </div>
        <Button variant="outline" onClick={() => { window.open(`${API}/export/itsm-doc`, "_blank"); }} className="gap-2"><FileText className="w-4 h-4" />Export DOCX</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="incidents">Incidents ({incidents.length})</TabsTrigger>
          <TabsTrigger value="problems">Problems ({problems.length})</TabsTrigger>
          <TabsTrigger value="changes">Changes ({changes.length})</TabsTrigger>
          <TabsTrigger value="kb">Knowledge Base ({kb.length})</TabsTrigger>
          <TabsTrigger value="sla">SLA Policies</TabsTrigger>
          <TabsTrigger value="requests">Service Requests ({serviceRequests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={AlertTriangle} label="Open Incidents" value={openIncidents} />
            <StatCard icon={CheckCircle2} label="Resolved" value={resolvedIncidents} />
            <StatCard icon={Bug} label="Active Problems" value={problems.filter((p: any) => p.status !== "Closed").length} />
            <StatCard icon={GitBranch} label="Pending Changes" value={changes.filter((c: any) => c.approvalStatus === "Pending").length} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Incidents by Status</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart><Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Legend /><Tooltip /></PieChart>
              </ResponsiveContainer>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Incidents by Priority</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={priorityData}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {priorityData.map((_: any, i: number) => <Cell key={i} fill={i === 0 ? "#dc2626" : i === 1 ? "#ea580c" : i === 2 ? "#d4a843" : "#2563eb"} />)}
                </Bar></BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
          <Card className="p-4">
            <h3 className="font-semibold mb-3">SLA Policies</h3>
            <Table>
              <TableHeader><TableRow><TableHead>Priority</TableHead><TableHead>Response Time</TableHead><TableHead>Resolution Time</TableHead><TableHead>Escalation</TableHead></TableRow></TableHeader>
              <TableBody>{slas.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell><Badge variant="outline" className={PRIORITY_BADGE[s.priority]}>{s.priority}</Badge></TableCell>
                  <TableCell>{s.responseTimeHours}h</TableCell>
                  <TableCell>{s.resolutionTimeHours}h</TableCell>
                  <TableCell>{s.escalationEnabled ? "✅ Enabled" : "Disabled"}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="incidents" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search incidents..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div>
            <Select value={filterPriority} onValueChange={v => { setFilterPriority(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Priorities</SelectItem>{["Critical", "High", "Medium", "Low"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem>{["Open", "In Progress", "Resolved", "Closed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => openModal("incident")} className="bg-[#d4a843] hover:bg-[#b8922e] text-white"><Plus className="w-4 h-4 mr-2" />New Incident</Button>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Ticket #</TableHead><TableHead>Title</TableHead><TableHead>Priority</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Assigned To</TableHead><TableHead>Created</TableHead>{isAdmin && <TableHead className="w-20">Actions</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {pagedIncidents.map((inc: any) => (
                  <TableRow key={inc.id}>
                    <TableCell className="font-mono text-xs">{inc.ticketNo}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{inc.title}</TableCell>
                    <TableCell><Badge variant="outline" className={PRIORITY_BADGE[inc.priority]}>{inc.priority}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{inc.severity}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_BADGE[inc.status] || ""}>{inc.status}</Badge></TableCell>
                    <TableCell className="text-sm">{inc.assignedTo || "Unassigned"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{timeSince(inc.createdAt)}</TableCell>
                    {isAdmin && <TableCell><div className="flex gap-1"><button onClick={() => openModal("incident", inc)} className="p-1 hover:text-blue-600"><Edit className="w-4 h-4" /></button><button onClick={() => { deleteIncident.mutate(inc.id); toast({ title: "Incident deleted" }); }} className="p-1 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </TabsContent>

        <TabsContent value="problems" className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => openModal("problem")} className="bg-[#d4a843] hover:bg-[#b8922e] text-white"><Plus className="w-4 h-4 mr-2" />New Problem</Button></div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Problem #</TableHead><TableHead>Title</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Root Cause</TableHead><TableHead>Assigned To</TableHead><TableHead>Related Incidents</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {problems.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.problemNo}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{p.title}</TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_BADGE[p.status] || ""}>{p.status}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={PRIORITY_BADGE[p.priority]}>{p.priority}</Badge></TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{p.rootCause || "TBD"}</TableCell>
                    <TableCell className="text-sm">{p.assignedTo || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.relatedIncidents || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="changes" className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => openModal("change")} className="bg-[#d4a843] hover:bg-[#b8922e] text-white"><Plus className="w-4 h-4 mr-2" />New Change Request</Button></div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Change #</TableHead><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Risk</TableHead><TableHead>Approval</TableHead><TableHead>Status</TableHead><TableHead>Implementation</TableHead><TableHead>Requested By</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {changes.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.changeNo}</TableCell>
                    <TableCell className="font-medium max-w-[180px] truncate">{c.title}</TableCell>
                    <TableCell><Badge variant="outline">{c.type}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={c.riskLevel === "High" ? PRIORITY_BADGE.High : c.riskLevel === "Low" ? PRIORITY_BADGE.Low : PRIORITY_BADGE.Medium}>{c.riskLevel}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_BADGE[c.approvalStatus] || ""}>{c.approvalStatus}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_BADGE[c.status] || ""}>{c.status}</Badge></TableCell>
                    <TableCell className="text-sm">{c.implementationDate || "TBD"}</TableCell>
                    <TableCell className="text-sm">{c.requestedBy || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="kb" className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => openModal("kb")} className="bg-[#d4a843] hover:bg-[#b8922e] text-white"><Plus className="w-4 h-4 mr-2" />New Article</Button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kb.map((article: any) => (
              <Card key={article.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <Badge variant="outline" className="text-xs">{article.category || "General"}</Badge>
                  <span className="text-xs text-muted-foreground">{article.views} views</span>
                </div>
                <h3 className="font-semibold text-sm mb-2">{article.title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-3">{article.content}</p>
                <div className="flex items-center justify-between mt-3 pt-2 border-t">
                  <span className="text-xs text-muted-foreground">By {article.authorName || "Unknown"}</span>
                  <div className="flex gap-1">{article.tags?.split(",").slice(0, 3).map((t: string) => <Badge key={t} variant="secondary" className="text-[10px]">{t.trim()}</Badge>)}</div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sla" className="space-y-4">
          <Card className="p-4">
            <Table>
              <TableHeader><TableRow><TableHead>Policy Name</TableHead><TableHead>Priority</TableHead><TableHead>Response Time</TableHead><TableHead>Resolution Time</TableHead><TableHead>Escalation</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{slas.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><Badge variant="outline" className={PRIORITY_BADGE[s.priority]}>{s.priority}</Badge></TableCell>
                  <TableCell>{s.responseTimeHours} hours</TableCell>
                  <TableCell>{s.resolutionTimeHours} hours</TableCell>
                  <TableCell>{s.escalationEnabled ? "✅ Yes" : "❌ No"}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_BADGE[s.status] || ""}>{s.status}</Badge></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Request #</TableHead><TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Requested By</TableHead><TableHead>Assigned To</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {serviceRequests.map((sr: any) => (
                  <TableRow key={sr.id}>
                    <TableCell className="font-mono text-xs">{sr.requestNo}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{sr.title}</TableCell>
                    <TableCell><Badge variant="outline">{sr.category}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={PRIORITY_BADGE[sr.priority]}>{sr.priority}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_BADGE[sr.status] || ""}>{sr.status}</Badge></TableCell>
                    <TableCell className="text-sm">{sr.requestedBy || "—"}</TableCell>
                    <TableCell className="text-sm">{sr.assignedTo || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? `Edit ${modalType}` : `New ${modalType === "kb" ? "Knowledge Base Article" : modalType.charAt(0).toUpperCase() + modalType.slice(1)}`}</DialogTitle></DialogHeader>
          {modalType === "incident" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
              <div className="col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
              <div><Label>Priority</Label><Select value={formData.priority || "Medium"} onValueChange={v => setFormData({ ...formData, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Critical", "High", "Medium", "Low"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Severity</Label><Select value={formData.severity || "S3"} onValueChange={v => setFormData({ ...formData, severity: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["S1", "S2", "S3", "S4"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Category</Label><Select value={formData.category || ""} onValueChange={v => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{["Application", "Infrastructure", "Network", "Hardware", "Security", "Service Request"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Status</Label><Select value={formData.status || "Open"} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Open", "In Progress", "Resolved", "Closed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Assigned To</Label><Input value={formData.assignedTo || ""} onChange={e => setFormData({ ...formData, assignedTo: e.target.value })} /></div>
              <div><Label>Reported By</Label><Input value={formData.reportedBy || ""} onChange={e => setFormData({ ...formData, reportedBy: e.target.value })} /></div>
              <div><Label>Affected System</Label><Input value={formData.affectedSystem || ""} onChange={e => setFormData({ ...formData, affectedSystem: e.target.value })} /></div>
              <div><Label>Assigned Group</Label><Input value={formData.assignedGroup || ""} onChange={e => setFormData({ ...formData, assignedGroup: e.target.value })} /></div>
              {formData.status === "Resolved" && <div className="col-span-2"><Label>Resolution Notes</Label><Textarea value={formData.resolutionNotes || ""} onChange={e => setFormData({ ...formData, resolutionNotes: e.target.value })} rows={2} /></div>}
            </div>
          )}
          {modalType === "problem" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
              <div className="col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
              <div><Label>Priority</Label><Select value={formData.priority || "Medium"} onValueChange={v => setFormData({ ...formData, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Critical", "High", "Medium", "Low"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Status</Label><Select value={formData.status || "Open"} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Open", "Under Investigation", "Root Cause Identified", "Known Error", "Closed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Assigned To</Label><Input value={formData.assignedTo || ""} onChange={e => setFormData({ ...formData, assignedTo: e.target.value })} /></div>
              <div><Label>Related Incidents</Label><Input value={formData.relatedIncidents || ""} onChange={e => setFormData({ ...formData, relatedIncidents: e.target.value })} placeholder="INC-00001, INC-00002" /></div>
              <div className="col-span-2"><Label>Root Cause</Label><Textarea value={formData.rootCause || ""} onChange={e => setFormData({ ...formData, rootCause: e.target.value })} rows={2} /></div>
              <div className="col-span-2"><Label>Workaround</Label><Textarea value={formData.workaround || ""} onChange={e => setFormData({ ...formData, workaround: e.target.value })} rows={2} /></div>
            </div>
          )}
          {modalType === "change" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
              <div className="col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
              <div><Label>Type</Label><Select value={formData.type || "Normal"} onValueChange={v => setFormData({ ...formData, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Standard", "Normal", "Major", "Emergency"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Risk Level</Label><Select value={formData.riskLevel || "Medium"} onValueChange={v => setFormData({ ...formData, riskLevel: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Low", "Medium", "High"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Status</Label><Select value={formData.status || "Draft"} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Draft", "Under Review", "Approved", "Scheduled", "Implementation", "Completed", "Rejected"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Approval</Label><Select value={formData.approvalStatus || "Pending"} onValueChange={v => setFormData({ ...formData, approvalStatus: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Pending", "Approved", "Rejected"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Requested By</Label><Input value={formData.requestedBy || ""} onChange={e => setFormData({ ...formData, requestedBy: e.target.value })} /></div>
              <div><Label>Implementation Date</Label><Input type="date" value={formData.implementationDate || ""} onChange={e => setFormData({ ...formData, implementationDate: e.target.value })} /></div>
              <div className="col-span-2"><Label>Rollback Plan</Label><Textarea value={formData.rollbackPlan || ""} onChange={e => setFormData({ ...formData, rollbackPlan: e.target.value })} rows={2} /></div>
            </div>
          )}
          {modalType === "kb" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
              <div className="col-span-2"><Label>Content</Label><Textarea value={formData.content || ""} onChange={e => setFormData({ ...formData, content: e.target.value })} rows={6} /></div>
              <div><Label>Category</Label><Select value={formData.category || ""} onValueChange={v => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{["Application", "Infrastructure", "Network", "Hardware", "Security", "Identity", "General"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Tags (comma-separated)</Label><Input value={formData.tags || ""} onChange={e => setFormData({ ...formData, tags: e.target.value })} placeholder="vpn,network,troubleshoot" /></div>
              <div><Label>Author Name</Label><Input value={formData.authorName || ""} onChange={e => setFormData({ ...formData, authorName: e.target.value })} /></div>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">{editingItem ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
