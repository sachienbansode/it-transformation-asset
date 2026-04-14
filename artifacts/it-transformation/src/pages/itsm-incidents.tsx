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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Search, Eye, AlertTriangle, CheckCircle2, Timer, XCircle, Download, Clock, Link2, X, ChevronDown } from "lucide-react";
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
const SEVERITIES = ["S1", "S2", "S3", "S4"];
const STATUSES = ["Open", "In Progress", "Pending Approval", "Resolved", "Closed"];
const CREATE_STATUSES = ["Open"];

const PRIORITY_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Critical: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
  High:     { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", dot: "bg-orange-500" },
  Medium:   { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  Low:      { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-400" },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Open:              { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  "In Progress":     { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  "Pending Approval":{ bg: "bg-violet-50 dark:bg-violet-900/20", text: "text-violet-600 dark:text-violet-400", dot: "bg-violet-500" },
  Resolved:          { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  Closed:            { bg: "bg-gray-100 dark:bg-gray-800/40", text: "text-gray-500 dark:text-gray-400", dot: "bg-gray-400" },
};

const SEV_STYLES: Record<string, string> = {
  S1: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  S2: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  S3: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  S4: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
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
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-${value === "In Progress" ? "pulse" : "none"}`} />
      {value}
    </span>
  );
}

function SeverityBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-[10px] font-bold tracking-wide ${SEV_STYLES[value] || "bg-gray-100 text-gray-600"}`}>
      {value}
    </span>
  );
}

function AssigneeBadge({ name }: { name?: string }) {
  if (!name) return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground italic">Unassigned</span>;
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-[#d4a843]/20 text-[#b8922e] text-[10px] font-bold flex items-center justify-center flex-shrink-0">{initials}</span>
      <span className="text-sm font-medium truncate max-w-[100px]">{name}</span>
    </span>
  );
}

function TicketNo({ no }: { no: string }) {
  const [prefix, ...rest] = no.split("-");
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-xs">
      <span className="font-bold text-[#d4a843]">{prefix}</span>
      <span className="text-muted-foreground">-{rest.join("-")}</span>
    </span>
  );
}

function timeSince(dateStr: string) {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diffMs / 3600000);
  return hours > 0 ? `${hours}h ago` : "Just now";
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

function SlaBadge({ slaBreachAt, status }: { slaBreachAt?: string | null; status: string }) {
  if (!slaBreachAt || status === "Resolved" || status === "Closed") return null;
  const hoursLeft = (new Date(slaBreachAt).getTime() - Date.now()) / 3600000;
  if (hoursLeft < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
        BREACHED
      </span>
    );
  }
  const display = hoursLeft < 1 ? `${Math.round(hoursLeft * 60)}m` : hoursLeft < 24 ? `${Math.round(hoursLeft)}h` : `${Math.round(hoursLeft / 24)}d`;
  const isWarning = hoursLeft < 4;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${isWarning ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"}`}>
      <Clock className="w-2.5 h-2.5" />{display}
    </span>
  );
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

export default function ItsmIncidents() {
  const cfg = useItsmConfig();
  const CATEGORIES = cfg["itsm.incidentCategories"];
  const URGENCIES = cfg["itsm.urgencyLevels"];
  const IMPACT_LEVELS = cfg["itsm.impactLevels"];
  const SOURCES = cfg["itsm.incidentSources"];
  const SUBCATEGORIES = cfg["itsm.incidentSubcategories"];

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

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [showBulkBar, setShowBulkBar] = useState(false);

  const { data: incidents = [] } = useQuery({ queryKey: ["incidents"], queryFn: () => apiFetch<any[]>("/incidents") });
  const { data: stats } = useQuery({ queryKey: ["incidents-stats"], queryFn: () => apiFetch<any>("/incidents/stats") });
  const { data: problems = [] } = useQuery({ queryKey: ["problems"], queryFn: () => apiFetch<any[]>("/problems") });

  const createInc = useMutation({ mutationFn: (data: any) => apiFetch("/incidents", { method: "POST", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); queryClient.invalidateQueries({ queryKey: ["incidents-stats"] }); } });
  const updateInc = useMutation({ mutationFn: ({ id, ...data }: any) => apiFetch(`/incidents/${id}`, { method: "PATCH", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); queryClient.invalidateQueries({ queryKey: ["incidents-stats"] }); } });
  const deleteInc = useMutation({ mutationFn: (id: number) => apiFetch(`/incidents/${id}`, { method: "DELETE" }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); queryClient.invalidateQueries({ queryKey: ["incidents-stats"] }); } });
  const bulkUpdate = useMutation({
    mutationFn: (body: any) => apiFetch("/incidents/bulk-update", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); queryClient.invalidateQueries({ queryKey: ["incidents-stats"] }); setSelectedIds([]); setBulkStatus(""); setBulkAssignee(""); setShowBulkBar(false); }
  });

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

  const categoryBreakdown = useMemo(() => {
    if (stats?.byCategory) return stats.byCategory;
    const cats: Record<string, number> = {};
    incidents.forEach((i: any) => { const c = i.category || "Uncategorized"; cats[c] = (cats[c] || 0) + 1; });
    return Object.entries(cats).map(([category, count]) => ({ category, count }));
  }, [stats, incidents]);

  function openCreate() { setEditingItem(null); setFormData({ status: "Open", priority: "Medium", severity: "S3" }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }
  function clearFilters() { setSearch(""); setFilterPriority(""); setFilterStatus(""); setFilterCategory(""); setPage(1); }

  function toggleSelect(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleSelectAll() {
    const pagedIds = paged.map((i: any) => i.id);
    const allSelected = pagedIds.every((id: number) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter(id => !pagedIds.includes(id)) : [...new Set([...selectedIds, ...pagedIds])]);
  }
  async function applyBulkAction() {
    if (!selectedIds.length) return;
    const body: any = { ids: selectedIds };
    if (bulkStatus) body.status = bulkStatus;
    if (bulkAssignee.trim()) body.assignedTo = bulkAssignee.trim();
    try {
      await bulkUpdate.mutateAsync(body);
      toast({ title: `Updated ${selectedIds.length} incidents` });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadReport("incidents", `incidents-report-${new Date().toISOString().slice(0,10)}.csv`)} className="gap-2 text-xs"><Download className="w-3.5 h-3.5" />Export Report</Button>
          <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />New Incident</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={AlertTriangle} label="Open" value={openCount} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" sub={criticalOpen > 0 ? `${criticalOpen} critical` : undefined} />
        <StatCard icon={Timer} label="In Progress" value={inProgressCount} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={CheckCircle2} label="Resolved" value={resolvedCount} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={XCircle} label="Total Incidents" value={incidents.length} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
      </div>

      {categoryBreakdown.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">By Category</h3>
            <div className="flex flex-wrap gap-2">
              {categoryBreakdown.map((c: any) => (
                <button
                  key={c.category}
                  onClick={() => { setFilterCategory(c.category === filterCategory ? "" : c.category); setPage(1); }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${filterCategory === c.category ? "bg-[#d4a843]/10 border-[#d4a843]/50 text-[#d4a843]" : "bg-muted/30 border-border hover:bg-muted/50"}`}
                >
                  {c.category || "Uncategorized"}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-background border">{c.count}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap gap-3 items-center p-4 border-b">
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
            {(search || filterPriority || filterStatus || filterCategory) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground">Clear filters</Button>
            )}
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-[#d4a843]/5 border-b border-[#d4a843]/20">
              <span className="text-xs font-semibold text-[#b8922e]">{selectedIds.length} selected</span>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue placeholder="Change Status" /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Assign to..." value={bulkAssignee} onChange={e => setBulkAssignee(e.target.value)} className="h-7 text-xs w-[160px]" />
              <Button size="sm" onClick={applyBulkAction} disabled={bulkUpdate.isPending || (!bulkStatus && !bulkAssignee.trim())} className="h-7 text-xs bg-[#d4a843] hover:bg-[#b8922e] text-white">Apply</Button>
              <Button size="sm" variant="ghost" onClick={() => { setSelectedIds([]); setBulkStatus(""); setBulkAssignee(""); }} className="h-7 text-xs text-muted-foreground">
                <X className="w-3 h-3 mr-1" />Clear
              </Button>
            </div>
          )}

          <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/20">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of <span className="font-semibold text-foreground">{incidents.length}</span> incidents
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-10 py-3">
                  <Checkbox
                    checked={paged.length > 0 && paged.every((i: any) => selectedIds.includes(i.id))}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[110px]">Ticket #</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Title</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[110px]">Priority</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[60px]">Sev</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[140px]">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[80px]">SLA</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Category</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3">Assigned To</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[90px]">Created</TableHead>
                <TableHead className="text-xs uppercase tracking-wide font-semibold py-3 w-[80px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-16 text-muted-foreground">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No incidents found</p>
                    <p className="text-xs mt-1">Try adjusting your filters</p>
                  </TableCell>
                </TableRow>
              )}
              {paged.map((inc: any) => (
                <TableRow
                  key={inc.id}
                  className={`transition-colors ${selectedIds.includes(inc.id) ? "bg-[#d4a843]/5 dark:bg-[#d4a843]/5" : inc.priority === "Critical" && inc.status === "Open" ? "bg-red-50/40 dark:bg-red-900/5 hover:bg-red-50/60 dark:hover:bg-red-900/10" : "hover:bg-muted/30"}`}
                >
                  <TableCell className="py-3">
                    <Checkbox checked={selectedIds.includes(inc.id)} onCheckedChange={() => toggleSelect(inc.id)} />
                  </TableCell>
                  <TableCell className="py-3"><TicketNo no={inc.ticketNo} /></TableCell>
                  <TableCell className="py-3">
                    <div className="font-medium text-sm leading-tight max-w-[200px] truncate" title={inc.title}>{inc.title}</div>
                    {inc.affectedSystem && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{inc.affectedSystem}</div>}
                  </TableCell>
                  <TableCell className="py-3"><PriorityBadge value={inc.priority} /></TableCell>
                  <TableCell className="py-3"><SeverityBadge value={inc.severity} /></TableCell>
                  <TableCell className="py-3"><StatusBadge value={inc.status} /></TableCell>
                  <TableCell className="py-3"><SlaBadge slaBreachAt={inc.slaBreachAt} status={inc.status} /></TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground font-medium">{inc.category || "—"}</TableCell>
                  <TableCell className="py-3"><AssigneeBadge name={inc.assignedTo} /></TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">{formatDate(inc.createdAt)}</TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-0.5 justify-center">
                      <button onClick={() => setViewModal(inc)} title="View details" className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => openEdit(inc)} title={["Resolved","Closed"].includes(inc.status) ? "Ticket is locked — cannot edit resolved/closed" : "Edit incident"} disabled={["Resolved","Closed"].includes(inc.status)} className={`p-2 rounded-md transition-colors ${["Resolved","Closed"].includes(inc.status) ? "opacity-30 cursor-not-allowed text-muted-foreground" : "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 hover:text-blue-600"}`}><Edit className="w-4 h-4" /></button>
                      {isAdmin && <button onClick={() => handleDelete(inc.id, inc.ticketNo)} title="Delete incident" className="p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>}
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
              <TicketNo no={viewModal?.ticketNo || ""} />
              <StatusBadge value={viewModal?.status || ""} />
            </DialogTitle>
          </DialogHeader>
          {viewModal && (
            <div className="space-y-4">
              <h3 className="font-semibold text-base">{viewModal.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{viewModal.description || "No description provided"}</p>
              <div className="flex flex-wrap gap-2">
                <PriorityBadge value={viewModal.priority} />
                <SeverityBadge value={viewModal.severity} />
              </div>
              {viewModal.slaBreachAt && viewModal.status !== "Resolved" && viewModal.status !== "Closed" && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${(new Date(viewModal.slaBreachAt).getTime() - Date.now()) < 0 ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400" : "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"}`}>
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span className="font-semibold">SLA Deadline:</span>
                  <span>{formatDateTime(viewModal.slaBreachAt)}</span>
                  <SlaBadge slaBreachAt={viewModal.slaBreachAt} status={viewModal.status} />
                </div>
              )}
              {viewModal.problemId && (problems as any[]).find((p: any) => p.id === viewModal.problemId) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800 text-sm text-violet-700 dark:text-violet-400">
                  <Link2 className="w-4 h-4 flex-shrink-0" />
                  <span className="font-semibold">Linked Problem:</span>
                  <span>{(problems as any[]).find((p: any) => p.id === viewModal.problemId)?.problemNo} — {(problems as any[]).find((p: any) => p.id === viewModal.problemId)?.title}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Category", viewModal.category], ["Subcategory", viewModal.subcategory], ["Urgency", viewModal.urgency], ["Impact Level", viewModal.impactLevel], ["Source", viewModal.source], ["Assigned To", viewModal.assignedTo], ["Assigned Group", viewModal.assignedGroup], ["Reported By", viewModal.reportedBy], ["Affected System", viewModal.affectedSystem], ["Created", formatDateTime(viewModal.createdAt)], ["Last Updated", formatDateTime(viewModal.updatedAt)]].map(([l, v]) => (
                  <div key={l as string} className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{l}</div>
                    <div className="font-medium text-sm">{(v as string) || "—"}</div>
                  </div>
                ))}
              </div>
              {viewModal.resolutionNotes && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/50 dark:border-emerald-800/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold mb-1">Resolution Notes</div>
                  <div className="text-sm text-emerald-800 dark:text-emerald-300">{viewModal.resolutionNotes}</div>
                </div>
              )}
              <ApprovalMatrix ticketId={viewModal.id} ticketType="Incident" readonly />
              <hr className="border-border/40" />
              <TicketAttachments ticketType="Incident" ticketId={viewModal.id} readonly />
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
            <div><Label>Urgency</Label><Select value={formData.urgency || "__none__"} onValueChange={v => setFormData({ ...formData, urgency: v === "__none__" ? "" : v })}><SelectTrigger><SelectValue placeholder="Select urgency" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{URGENCIES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Impact Level</Label><Select value={formData.impactLevel || "__none__"} onValueChange={v => setFormData({ ...formData, impactLevel: v === "__none__" ? "" : v })}><SelectTrigger><SelectValue placeholder="Select impact" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{IMPACT_LEVELS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Category</Label><Select value={formData.category || "__none__"} onValueChange={v => setFormData({ ...formData, category: v === "__none__" ? "" : v, subcategory: "" })}><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Subcategory</Label><Select value={formData.subcategory || "__none__"} onValueChange={v => setFormData({ ...formData, subcategory: v === "__none__" ? "" : v })} disabled={!formData.category || formData.category === "__none__"}><SelectTrigger><SelectValue placeholder={formData.category ? "Select subcategory" : "Select category first"} /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{(SUBCATEGORIES[formData.category] || []).map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Source</Label><Select value={formData.source || "__none__"} onValueChange={v => setFormData({ ...formData, source: v === "__none__" ? "" : v })}><SelectTrigger><SelectValue placeholder="How was it reported?" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Status</Label><Select value={formData.status || "Open"} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(editingItem ? STATUSES : CREATE_STATUSES).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Assigned To</Label><UserSearchCombobox value={formData.assignedTo || ""} onChange={v => setFormData({ ...formData, assignedTo: v })} /></div>
            <div><Label>Assigned Group</Label><GroupSelect value={formData.assignedGroup || ""} onChange={v => setFormData({ ...formData, assignedGroup: v })} /></div>
            <div><Label>Reported By</Label><UserSearchCombobox value={formData.reportedBy || ""} onChange={v => setFormData({ ...formData, reportedBy: v })} placeholder="Search reporter…" /></div>
            <div><Label>Affected System</Label><Input value={formData.affectedSystem || ""} onChange={e => setFormData({ ...formData, affectedSystem: e.target.value })} placeholder="e.g. ERP, SAP, CRM Portal" /></div>
            {(formData.status === "Resolved" || formData.status === "Closed") && <div className="col-span-2"><Label>Resolution Notes</Label><Textarea value={formData.resolutionNotes || ""} onChange={e => setFormData({ ...formData, resolutionNotes: e.target.value })} rows={2} /></div>}
            <div className="col-span-2">
              <Label className="flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5 text-muted-foreground" />Link to Problem</Label>
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
          </div>
          {editingItem && (
            <>
              <div className="mt-4"><ApprovalMatrix ticketId={editingItem.id} ticketType="Incident" /></div>
              <hr className="border-border/40 mt-4" />
              <div className="mt-2"><TicketAttachments ticketType="Incident" ticketId={editingItem.id} /></div>
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
