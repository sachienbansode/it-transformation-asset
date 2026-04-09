import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { StatCard } from "@/components/stat-card";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import {
  BarChart3, Target, Calendar, Play, Star, CheckCircle2, FileText,
  Settings2, Plus, Edit, Trash2, ChevronDown, ChevronUp, TrendingUp,
  Users, User, AlertTriangle, Clock, Award, RefreshCw, Download, Send,
} from "lucide-react";
import {
  ResponsiveContainer, RadialBarChart, RadialBar, BarChart, Bar, XAxis, YAxis,
  Tooltip, Cell, Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KpiYear { id: number; label: string; startDate: string; endDate: string; isActive: boolean; isCurrent: boolean; }
interface KpiCategory { id: number; name: string; description?: string; color?: string; }
interface Kpi {
  id: number; yearId: number; type: "CTO" | "Team"; name: string; description?: string;
  categoryId?: number; weightage?: string; metric?: string; unit?: string;
  owner?: string; ownerEmail?: string; businessUnit?: string;
  status: string; approvalRequired: boolean; createdBy?: number;
}
interface KpiTarget { id: number; kpiId: number; yearId: number; annualTarget?: string; q1Target?: string; q2Target?: string; q3Target?: string; q4Target?: string; notes?: string; }
interface KpiActual { id: number; kpiId: number; yearId: number; quarter: number; actualValue?: string; score?: string; scoreOverride: boolean; comments?: string; }
interface KpiApproval { id: number; kpiId: number; status: string; comments?: string; requestedAt: string; reviewedAt?: string; }
interface KpiSettings { id?: number; approvalEnabled: boolean; scoringModel: string; defaultWeightageType: string; allowCtoOverride: boolean; }
interface KpiDashboard { total: number; ctoKpis: number; teamKpis: number; active: number; draft: number; pending: number; avgScore: number | null; totalActuals: number; }

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useKpiYears() { return useQuery({ queryKey: ["kpi-years"], queryFn: () => apiFetch<KpiYear[]>("/kpi-years") }); }
function useKpiCategories() { return useQuery({ queryKey: ["kpi-categories"], queryFn: () => apiFetch<KpiCategory[]>("/kpi-categories") }); }
function useKpis(yearId?: number, type?: string) {
  return useQuery({
    queryKey: ["kpis", yearId, type],
    queryFn: () => apiFetch<Kpi[]>(`/kpis${yearId ? `?yearId=${yearId}` : ""}${type ? `${yearId ? "&" : "?"}type=${type}` : ""}`),
    enabled: !!yearId,
  });
}
function useKpiTargets(yearId?: number) {
  return useQuery({ queryKey: ["kpi-targets", yearId], queryFn: () => apiFetch<KpiTarget[]>(`/kpi-targets?yearId=${yearId}`), enabled: !!yearId });
}
function useKpiActuals(yearId?: number) {
  return useQuery({ queryKey: ["kpi-actuals", yearId], queryFn: () => apiFetch<KpiActual[]>(`/kpi-actuals?yearId=${yearId}`), enabled: !!yearId });
}
function useKpiApprovals() { return useQuery({ queryKey: ["kpi-approvals"], queryFn: () => apiFetch<KpiApproval[]>("/kpi-approvals") }); }
function useKpiSettings() { return useQuery({ queryKey: ["kpi-settings"], queryFn: () => apiFetch<KpiSettings>("/kpi-settings") }); }
function useKpiDashboard(yearId?: number) {
  return useQuery({ queryKey: ["kpi-dashboard", yearId], queryFn: () => apiFetch<KpiDashboard>(`/kpi-dashboard${yearId ? `?yearId=${yearId}` : ""}`), enabled: !!yearId });
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  Draft: "border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
  Pending: "border-yellow-500/30 text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-400/10",
  Approved: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10",
  Active: "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10",
  Closed: "border-gray-500/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
};

const CHART_COLORS = ["#2563eb", "#d97706", "#9333ea", "#16a34a", "#dc2626", "#0891b2"];

function scoreColor(s: number | null): string {
  if (s === null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (s >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-500 dark:text-red-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function YearSelector({ years, currentId, onChange }: { years: KpiYear[]; currentId: number | null; onChange: (id: number) => void }) {
  return (
    <Select value={currentId?.toString() || ""} onValueChange={v => onChange(parseInt(v))}>
      <SelectTrigger className="w-44 h-8 text-xs">
        <SelectValue placeholder="Select Year" />
      </SelectTrigger>
      <SelectContent>
        {years.map(y => (
          <SelectItem key={y.id} value={y.id.toString()}>
            {y.label} {y.isCurrent && <span className="text-primary ml-1">★</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab({ yearId, kpis, actuals, targets, categories }: {
  yearId: number; kpis: Kpi[]; actuals: KpiActual[]; targets: KpiTarget[]; categories: KpiCategory[];
}) {
  const { data: dash } = useKpiDashboard(yearId);

  const kpiScores = useMemo(() => {
    return kpis.map(kpi => {
      const kpiActuals = actuals.filter(a => a.kpiId === kpi.id);
      const withScore = kpiActuals.filter(a => a.score !== null);
      const avgScore = withScore.length > 0 ? Math.round(withScore.reduce((s, a) => s + parseFloat(a.score || "0"), 0) / withScore.length) : null;
      const target = targets.find(t => t.kpiId === kpi.id);
      const cat = categories.find(c => c.id === kpi.categoryId);
      return { ...kpi, avgScore, target, cat };
    });
  }, [kpis, actuals, targets, categories]);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    kpis.forEach(k => {
      const cat = categories.find(c => c.id === k.categoryId);
      const name = cat?.name || "Uncategorised";
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  }, [kpis, categories]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Total KPIs" value={dash?.total ?? kpis.length} sub="this FY" icon={Target} iconBg="bg-blue-50 dark:bg-blue-400/10" iconColor="text-blue-600" borderColor="border-l-blue-400" />
        <StatCard label="CTO KPIs" value={dash?.ctoKpis ?? kpis.filter(k => k.type === "CTO").length} sub="strategic" icon={User} iconBg="bg-purple-50 dark:bg-purple-400/10" iconColor="text-purple-600" borderColor="border-l-purple-400" />
        <StatCard label="Team KPIs" value={dash?.teamKpis ?? kpis.filter(k => k.type === "Team").length} sub="departmental" icon={Users} iconBg="bg-yellow-50 dark:bg-yellow-400/10" iconColor="text-yellow-600" borderColor="border-l-yellow-400" />
        <StatCard label="Avg Score" value={dash?.avgScore !== null && dash?.avgScore !== undefined ? `${dash.avgScore}%` : "—"} sub="overall performance" icon={Award} iconBg="bg-emerald-50 dark:bg-emerald-400/10" iconColor="text-emerald-600" borderColor="border-l-emerald-400" valueColor={dash?.avgScore ? scoreColor(dash.avgScore) : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* KPI by Category */}
        <Card>
          <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">KPIs by Category</CardTitle></CardHeader>
          <CardContent className="pb-4">
            {categoryBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No KPIs defined yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={categoryBreakdown} barSize={28}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="KPIs" radius={[3, 3, 0, 0]}>
                    {categoryBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* KPI Status breakdown */}
        <Card>
          <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Status Breakdown</CardTitle></CardHeader>
          <CardContent className="pb-4">
            <div className="space-y-2.5 pt-2">
              {[
                { label: "Approved / Active", count: dash?.active ?? 0, color: "bg-emerald-500" },
                { label: "Pending Approval", count: dash?.pending ?? 0, color: "bg-yellow-500" },
                { label: "Draft", count: dash?.draft ?? 0, color: "bg-gray-400" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="text-xs text-muted-foreground w-32 flex-shrink-0">{item.label}</div>
                  <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", item.color)} style={{ width: kpis.length > 0 ? `${(item.count / kpis.length) * 100}%` : "0%" }} />
                  </div>
                  <div className="text-xs font-semibold w-6 text-right">{item.count}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t">
              {kpiScores.filter(k => k.avgScore !== null).slice(0, 3).map(k => (
                <div key={k.id} className="text-center">
                  <div className={cn("text-lg font-bold", scoreColor(k.avgScore))}>{k.avgScore}%</div>
                  <div className="text-[10px] text-muted-foreground truncate">{k.name}</div>
                </div>
              ))}
              {kpiScores.filter(k => k.avgScore !== null).length === 0 && (
                <div className="col-span-3 text-center text-xs text-muted-foreground py-4">No scores recorded yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Score table */}
      <Card>
        <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">KPI Performance Overview</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs">KPI</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs">Owner</TableHead>
                <TableHead className="text-xs">Weightage</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kpiScores.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No KPIs defined for this year</TableCell></TableRow>
              )}
              {kpiScores.map(k => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium text-sm max-w-48"><span className="truncate block">{k.name}</span></TableCell>
                  <TableCell><Badge variant="outline" className={cn("text-[10px]", k.type === "CTO" ? "border-purple-400/30 text-purple-600 dark:text-purple-400" : "border-blue-400/30 text-blue-600 dark:text-blue-400")}>{k.type}</Badge></TableCell>
                  <TableCell><span className="text-xs">{k.cat?.name || "—"}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{k.owner || "—"}</TableCell>
                  <TableCell className="text-xs">{k.weightage ? `${k.weightage}%` : "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={cn("text-[10px]", STATUS_BADGE[k.status] || "")}>{k.status}</Badge></TableCell>
                  <TableCell className="text-right"><span className={cn("text-sm font-bold", scoreColor(k.avgScore))}>{k.avgScore !== null ? `${k.avgScore}%` : "—"}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── KPI Management Tab ───────────────────────────────────────────────────────
function KpiManagementTab({ yearId, kpis, categories, settings, onRefresh }: {
  yearId: number; kpis: Kpi[]; categories: KpiCategory[]; settings: KpiSettings; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Kpi | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [form, setForm] = useState<Partial<Kpi>>({});

  const filtered = useMemo(() => kpis.filter(k => filterType === "all" || k.type === filterType), [kpis, filterType]);

  const openModal = (kpi: Kpi | null = null) => {
    setEditing(kpi);
    setForm(kpi ? { ...kpi } : { type: "CTO", status: "Draft", approvalRequired: settings.approvalEnabled });
    setModal(true);
  };

  const save = async () => {
    if (!form.name?.trim() || !form.type) { toast({ title: "Name and type are required", variant: "destructive" }); return; }
    try {
      if (editing) {
        await apiFetch(`/kpis/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast({ title: "KPI updated" });
      } else {
        await apiFetch("/kpis", { method: "POST", body: JSON.stringify({ ...form, yearId }) });
        toast({ title: "KPI created" });
      }
      setModal(false);
      onRefresh();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const del = async (id: number) => {
    if (!confirm("Delete this KPI?")) return;
    try { await apiFetch(`/kpis/${id}`, { method: "DELETE" }); toast({ title: "Deleted" }); onRefresh(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const submitForApproval = async (kpi: Kpi) => {
    try {
      await apiFetch("/kpi-approvals", { method: "POST", body: JSON.stringify({ kpiId: kpi.id }) });
      toast({ title: "Submitted for approval" });
      onRefresh();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const activateDirect = async (kpi: Kpi) => {
    try {
      await apiFetch(`/kpis/${kpi.id}`, { method: "PATCH", body: JSON.stringify({ status: "Approved" }) });
      toast({ title: "KPI activated" });
      onRefresh();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const f = (k: keyof Kpi, v: any) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={filterType} onValueChange={setFilterType}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-3 h-6">All ({kpis.length})</TabsTrigger>
            <TabsTrigger value="CTO" className="text-xs px-3 h-6">CTO ({kpis.filter(k => k.type === "CTO").length})</TabsTrigger>
            <TabsTrigger value="Team" className="text-xs px-3 h-6">Team ({kpis.filter(k => k.type === "Team").length})</TabsTrigger>
          </TabsList>
        </Tabs>
        {isAdmin && <Button size="sm" onClick={() => openModal()}><Plus className="mr-1.5 h-3.5 w-3.5" />Create KPI</Button>}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs">KPI Name</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Category</TableHead>
              <TableHead className="text-xs">Owner</TableHead>
              <TableHead className="text-xs">Metric</TableHead>
              <TableHead className="text-xs">Weightage</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              {isAdmin && <TableHead className="text-right text-xs">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-muted-foreground">No KPIs found. Create your first KPI.</TableCell></TableRow>}
            {filtered.map(kpi => (
              <TableRow key={kpi.id} className="group">
                <TableCell className="font-medium text-sm max-w-56">
                  <div className="truncate">{kpi.name}</div>
                  {kpi.description && <div className="text-[10px] text-muted-foreground truncate">{kpi.description}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-[10px]", kpi.type === "CTO" ? "border-purple-400/30 text-purple-600 dark:text-purple-400" : "border-blue-400/30 text-blue-600 dark:text-blue-400")}>{kpi.type}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{categories.find(c => c.id === kpi.categoryId)?.name || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{kpi.owner || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{kpi.metric ? `${kpi.metric}${kpi.unit ? ` (${kpi.unit})` : ""}` : "—"}</TableCell>
                <TableCell className="text-xs">{kpi.weightage ? `${kpi.weightage}%` : "—"}</TableCell>
                <TableCell><Badge variant="outline" className={cn("text-[10px]", STATUS_BADGE[kpi.status] || "")}>{kpi.status}</Badge></TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {kpi.status === "Draft" && (
                        settings.approvalEnabled
                          ? <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => submitForApproval(kpi)}>Submit</Button>
                          : <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => activateDirect(kpi)}>Activate</Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openModal(kpi)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del(kpi.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit KPI" : "Create KPI"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>KPI Type <span className="text-destructive">*</span></Label>
                <Select value={form.type || "CTO"} onValueChange={v => f("type", v as "CTO" | "Team")}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CTO">CTO (Strategic)</SelectItem>
                    <SelectItem value="Team">Team (Departmental)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.categoryId?.toString() || ""} onValueChange={v => f("categoryId", v ? parseInt(v) : undefined)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>KPI Name <span className="text-destructive">*</span></Label>
              <Input value={form.name || ""} onChange={e => f("name", e.target.value)} placeholder="e.g. System Uptime SLA" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description || ""} onChange={e => f("description", e.target.value)} rows={2} placeholder="What does this KPI measure?" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Measurement Metric</Label>
                <Input value={form.metric || ""} onChange={e => f("metric", e.target.value)} placeholder="e.g. % uptime" />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={form.unit || ""} onChange={e => f("unit", e.target.value)} placeholder="%, days, score" />
              </div>
              <div className="space-y-1.5">
                <Label>Weightage (%)</Label>
                <Input type="number" min={0} max={100} value={form.weightage || ""} onChange={e => f("weightage", e.target.value)} placeholder="0–100" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Input value={form.owner || ""} onChange={e => f("owner", e.target.value)} placeholder="Team lead / Manager name" />
              </div>
              <div className="space-y-1.5">
                <Label>Owner Email</Label>
                <Input type="email" value={form.ownerEmail || ""} onChange={e => f("ownerEmail", e.target.value)} placeholder="owner@ashikagroup.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Business Unit</Label>
                <Input value={form.businessUnit || ""} onChange={e => f("businessUnit", e.target.value)} placeholder="e.g. Technology, NBFC" />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={!!form.approvalRequired} onCheckedChange={v => f("approvalRequired", v)} />
                <Label className="text-sm">Requires Approval</Label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save}>{ editing ? "Update" : "Create" } KPI</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── KPI Planning Tab ─────────────────────────────────────────────────────────
function KpiPlanningTab({ yearId, kpis, targets, onRefresh }: {
  yearId: number; kpis: Kpi[]; targets: KpiTarget[]; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<KpiTarget>>({});
  const [modal, setModal] = useState(false);

  const openPlan = (kpi: Kpi) => {
    const existing = targets.find(t => t.kpiId === kpi.id);
    setEditing(kpi.id);
    setForm(existing ? { ...existing } : { kpiId: kpi.id, yearId });
    setModal(true);
  };

  const save = async () => {
    try {
      await apiFetch("/kpi-targets", { method: "POST", body: JSON.stringify({ ...form, kpiId: editing, yearId }) });
      toast({ title: "Targets saved" });
      setModal(false);
      onRefresh();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const f = (k: keyof KpiTarget, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Define annual and quarterly targets for each KPI.</p>
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs">KPI</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs text-right">Annual Target</TableHead>
              <TableHead className="text-xs text-right">Q1</TableHead>
              <TableHead className="text-xs text-right">Q2</TableHead>
              <TableHead className="text-xs text-right">Q3</TableHead>
              <TableHead className="text-xs text-right">Q4</TableHead>
              {isAdmin && <TableHead className="text-right text-xs">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {kpis.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-muted-foreground">Create KPIs first in KPI Management tab.</TableCell></TableRow>}
            {kpis.map(kpi => {
              const t = targets.find(t => t.kpiId === kpi.id);
              return (
                <TableRow key={kpi.id} className="group">
                  <TableCell className="font-medium text-sm max-w-48"><span className="truncate block">{kpi.name}</span></TableCell>
                  <TableCell><Badge variant="outline" className={cn("text-[10px]", kpi.type === "CTO" ? "border-purple-400/30 text-purple-600" : "border-blue-400/30 text-blue-600")}>{kpi.type}</Badge></TableCell>
                  <TableCell className="text-right text-sm font-semibold">{t?.annualTarget ?? "—"}{t?.annualTarget && kpi.unit ? ` ${kpi.unit}` : ""}</TableCell>
                  {[t?.q1Target, t?.q2Target, t?.q3Target, t?.q4Target].map((q, i) => (
                    <TableCell key={i} className="text-right text-xs text-muted-foreground">{q ?? "—"}</TableCell>
                  ))}
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs opacity-0 group-hover:opacity-100" onClick={() => openPlan(kpi)}>
                        {t ? <Edit className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        {t ? " Edit" : " Set"}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Set Quarterly Targets — {kpis.find(k => k.id === editing)?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Annual Target</Label>
                <Input value={form.annualTarget || ""} onChange={e => f("annualTarget", e.target.value)} placeholder="e.g. 99.9" />
              </div>
              {[1, 2, 3, 4].map(q => (
                <div key={q} className="space-y-1.5">
                  <Label>Q{q} Target</Label>
                  <Input value={(form as any)[`q${q}Target`] || ""} onChange={e => f(`q${q}Target` as keyof KpiTarget, e.target.value)} placeholder={`Q${q} target`} />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes || ""} onChange={e => f("notes", e.target.value)} rows={2} placeholder="Target rationale or assumptions..." />
            </div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save}>Save Targets</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Execution Tab ────────────────────────────────────────────────────────────
function ExecutionTab({ yearId, kpis, actuals, targets, onRefresh }: {
  yearId: number; kpis: Kpi[]; actuals: KpiActual[]; targets: KpiTarget[]; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [modal, setModal] = useState(false);
  const [selKpi, setSelKpi] = useState<Kpi | null>(null);
  const [selQ, setSelQ] = useState(1);
  const [form, setForm] = useState<Partial<KpiActual>>({});

  const openUpdate = (kpi: Kpi, quarter: number) => {
    setSelKpi(kpi);
    setSelQ(quarter);
    const existing = actuals.find(a => a.kpiId === kpi.id && a.quarter === quarter);
    setForm(existing ? { ...existing } : { kpiId: kpi.id, yearId, quarter });
    setModal(true);
  };

  const autoScore = (actual: string, target: string) => {
    const a = parseFloat(actual), t = parseFloat(target);
    if (isNaN(a) || isNaN(t) || t === 0) return "";
    return Math.min(100, Math.round((a / t) * 100)).toString();
  };

  const save = async () => {
    const payload = { ...form, kpiId: selKpi?.id, yearId, quarter: selQ };
    const target = targets.find(t => t.kpiId === selKpi?.id);
    const qTarget = (target as any)?.[`q${selQ}Target`];
    if (payload.actualValue && qTarget && !payload.scoreOverride) {
      payload.score = autoScore(payload.actualValue, qTarget);
    }
    try {
      await apiFetch("/kpi-actuals", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "Actual saved" });
      setModal(false);
      onRefresh();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const f = (k: keyof KpiActual, v: any) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Record quarterly actuals for active KPIs.</p>
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs">KPI</TableHead>
              <TableHead className="text-xs">Target / Metric</TableHead>
              {[1, 2, 3, 4].map(q => <TableHead key={q} className="text-xs text-center">Q{q}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {kpis.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-sm text-muted-foreground">No KPIs found.</TableCell></TableRow>}
            {kpis.map(kpi => {
              const target = targets.find(t => t.kpiId === kpi.id);
              return (
                <TableRow key={kpi.id}>
                  <TableCell className="font-medium text-sm max-w-44"><span className="truncate block">{kpi.name}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {target?.annualTarget ? `${target.annualTarget}${kpi.unit ? ` ${kpi.unit}` : ""}` : "—"}
                  </TableCell>
                  {[1, 2, 3, 4].map(q => {
                    const actual = actuals.find(a => a.kpiId === kpi.id && a.quarter === q);
                    return (
                      <TableCell key={q} className="text-center">
                        {actual ? (
                          <button className="group/cell" onClick={isAdmin ? () => openUpdate(kpi, q) : undefined}>
                            <div className={cn("text-xs font-bold", actual.score ? scoreColor(parseFloat(actual.score)) : "text-muted-foreground")}>
                              {actual.actualValue ?? "—"}
                            </div>
                            {actual.score && <div className="text-[9px] text-muted-foreground">{actual.score}%</div>}
                          </button>
                        ) : (
                          isAdmin ? (
                            <button onClick={() => openUpdate(kpi, q)} className="text-[10px] text-muted-foreground hover:text-primary hover:underline">
                              + Add
                            </button>
                          ) : <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Q{selQ} Actual — {selKpi?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Actual Value {selKpi?.unit ? `(${selKpi.unit})` : ""}</Label>
                <Input value={form.actualValue || ""} onChange={e => f("actualValue", e.target.value)} placeholder="e.g. 99.5" />
              </div>
              <div className="space-y-1.5">
                <Label>Score Override (%)</Label>
                <div className="flex items-center gap-2">
                  <Input value={form.scoreOverride ? (form.score || "") : ""} onChange={e => f("score", e.target.value)} placeholder="Auto-calculated" disabled={!form.scoreOverride} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={!!form.scoreOverride} onCheckedChange={v => f("scoreOverride", v)} />
              <Label className="text-sm">Manual Score Override</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Comments / Evidence</Label>
              <Textarea value={form.comments || ""} onChange={e => f("comments", e.target.value)} rows={3} placeholder="Describe achievements, blockers, evidence link..." />
            </div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save}>Save Actual</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Approvals Tab ────────────────────────────────────────────────────────────
function ApprovalsTab({ kpis, settings, onRefresh }: { kpis: Kpi[]; settings: KpiSettings; onRefresh: () => void; }) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { data: approvals } = useKpiApprovals();

  const reviewApproval = async (id: number, status: "Approved" | "Rejected") => {
    try {
      await apiFetch(`/kpi-approvals/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast({ title: `KPI ${status}` });
      onRefresh();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  if (!settings.approvalEnabled) {
    return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
        Approval workflow is disabled. Enable it in Settings to use this feature.
      </CardContent></Card>
    );
  }

  const pending = approvals?.filter(a => a.status === "Pending") || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Pending" value={pending.length} icon={Clock} iconBg="bg-yellow-50 dark:bg-yellow-400/10" iconColor="text-yellow-600" borderColor="border-l-yellow-400" />
        <StatCard label="Approved" value={approvals?.filter(a => a.status === "Approved").length ?? 0} icon={CheckCircle2} iconBg="bg-emerald-50 dark:bg-emerald-400/10" iconColor="text-emerald-600" borderColor="border-l-emerald-400" />
        <StatCard label="Rejected" value={approvals?.filter(a => a.status === "Rejected").length ?? 0} icon={AlertTriangle} iconBg="bg-red-50 dark:bg-red-400/10" iconColor="text-red-500" borderColor="border-l-red-400" />
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs">KPI</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Requested</TableHead>
              {isAdmin && <TableHead className="text-right text-xs">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(approvals || []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-10 text-sm text-muted-foreground">No approval requests yet.</TableCell></TableRow>}
            {(approvals || []).map(a => {
              const kpi = kpis.find(k => k.id === a.kpiId);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium text-sm">{kpi?.name || `KPI #${a.kpiId}`}</TableCell>
                  <TableCell><Badge variant="outline" className={cn("text-[10px]", STATUS_BADGE[a.status] || "")}>{a.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(a.requestedAt).toLocaleDateString()}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {a.status === "Pending" && (
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" className="h-7 text-[11px] border-emerald-500/30 text-emerald-600 hover:bg-emerald-50" onClick={() => reviewApproval(a.id, "Approved")}>Approve</Button>
                          <Button variant="outline" size="sm" className="h-7 text-[11px] border-red-400/30 text-red-500 hover:bg-red-50" onClick={() => reviewApproval(a.id, "Rejected")}>Reject</Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Reports Tab ──────────────────────────────────────────────────────────────
function ReportsTab({
  yearId, yearLabel, kpis, actuals, targets, categories, onRefresh,
}: {
  yearId: number; yearLabel: string; kpis: Kpi[]; actuals: KpiActual[];
  targets: KpiTarget[]; categories: KpiCategory[]; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [submitDialog, setSubmitDialog] = useState(false);
  const [submitComment, setSubmitComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const scorecard = useMemo(() => kpis.map(kpi => {
    const kpiActuals = actuals.filter(a => a.kpiId === kpi.id);
    const kpiTarget = targets.find(t => t.kpiId === kpi.id);
    const cat = categories.find(c => c.id === kpi.categoryId);
    const scores = kpiActuals.filter(a => a.score !== null).map(a => parseFloat(a.score!));
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
    return { kpi, cat, kpiTarget, kpiActuals, avgScore };
  }), [kpis, actuals, targets, categories]);

  const overallAvg = scorecard.filter(s => s.avgScore !== null);
  const totalScore = overallAvg.length > 0
    ? Math.round(overallAvg.reduce((s, v) => s + v.avgScore!, 0) / overallAvg.length) : null;

  const ctoKpis = scorecard.filter(s => s.kpi.type === "CTO");
  const pendingCount = kpis.filter(k => k.status === "Pending").length;
  const eligibleCount = kpis.filter(k => k.type === "CTO" && (k.status === "Draft" || k.status === "Approved")).length;

  // ─── Excel Export ────────────────────────────────────────────────────────
  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    // ── Sheet 1: Cover ──────────────────────────────────────────────────
    const coverData = [
      ["ASHIKA GROUP — CTO KPI SCORECARD"],
      [`Financial Year: ${yearLabel}`],
      [`Report Generated: ${dateStr}`],
      [`Prepared By: CTO — Sachin Bhatia`],
      [`Submitted To: CEO, Ashika Group`],
      [""],
      ["EXECUTIVE SUMMARY"],
      ["Total CTO KPIs Defined", ctoKpis.length],
      ["KPIs with Actuals Recorded", overallAvg.length],
      ["Overall Average Score", totalScore !== null ? `${totalScore}%` : "No actuals yet"],
      ["High Performers (≥80%)", overallAvg.filter(s => s.avgScore! >= 80).length],
      ["Needs Attention (<60%)", overallAvg.filter(s => s.avgScore! < 60).length],
      [""],
      ["CATEGORY BREAKDOWN"],
      ["Category", "# KPIs", "% Weightage"],
      ...["Run", "Change", "Transform"].map(cat => {
        const catKpis = ctoKpis.filter(s => s.cat?.name === cat);
        const wt = catKpis.reduce((sum, s) => sum + parseFloat(s.kpi.weightage || "0"), 0);
        return [cat, catKpis.length, `${wt}%`];
      }),
      [""],
      ["LEGEND"],
      ["Run", "Keep the lights on — operations & maintenance KPIs"],
      ["Change", "Incremental improvements, projects & upgrades"],
      ["Transform", "Strategic innovation & business transformation"],
      [""],
      ["Score ≥80%", "On Track / High Performer"],
      ["Score 60–79%", "Needs Monitoring"],
      ["Score <60%", "At Risk / Needs Immediate Attention"],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(coverData);
    ws1["!cols"] = [{ wch: 38 }, { wch: 22 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Cover");

    // ── Sheet 2: CTO KPI Scorecard ────────────────────────────────────
    const headers = [
      "#", "KPI Name", "Description", "Category", "Weightage",
      "Metric", "Unit", "Status",
      "Annual Target", "Q1 Target", "Q2 Target", "Q3 Target", "Q4 Target",
      "Q1 Actual", "Q2 Actual", "Q3 Actual", "Q4 Actual",
      "Q1 Score%", "Q2 Score%", "Q3 Score%", "Q4 Score%",
      "Avg Score%", "Performance",
    ];
    const rows = ctoKpis.map((s, i) => {
      const t = s.kpiTarget;
      const getActual = (q: number) => s.kpiActuals.find(a => a.quarter === q);
      const getScore = (q: number) => {
        const a = getActual(q);
        return a?.score ? parseFloat(a.score).toFixed(1) : "—";
      };
      const perf = s.avgScore === null ? "No Data"
        : s.avgScore >= 80 ? "On Track" : s.avgScore >= 60 ? "Monitor" : "At Risk";
      return [
        i + 1,
        s.kpi.name,
        s.kpi.description || "",
        s.cat?.name || "",
        s.kpi.weightage ? `${s.kpi.weightage}%` : "",
        s.kpi.metric || "",
        s.kpi.unit || "",
        s.kpi.status,
        t?.annualTarget || "", t?.q1Target || "", t?.q2Target || "", t?.q3Target || "", t?.q4Target || "",
        getActual(1)?.actualValue || "—", getActual(2)?.actualValue || "—",
        getActual(3)?.actualValue || "—", getActual(4)?.actualValue || "—",
        getScore(1), getScore(2), getScore(3), getScore(4),
        s.avgScore !== null ? `${s.avgScore}%` : "—",
        perf,
      ];
    });
    const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws2["!cols"] = [
      { wch: 4 }, { wch: 36 }, { wch: 55 }, { wch: 12 }, { wch: 10 },
      { wch: 28 }, { wch: 8 }, { wch: 10 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 11 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "CTO KPI Scorecard");

    // ── Sheet 3: Category Summary ─────────────────────────────────────
    const catHeaders = ["Category", "Description", "# KPIs", "Total Weightage", "KPIs On Track", "KPIs Monitoring", "KPIs At Risk", "Avg Score"];
    const catRows = categories.map(cat => {
      const catKpis = ctoKpis.filter(s => s.cat?.id === cat.id);
      const wt = catKpis.reduce((sum, s) => sum + parseFloat(s.kpi.weightage || "0"), 0);
      const scored = catKpis.filter(s => s.avgScore !== null);
      const catAvg = scored.length > 0 ? Math.round(scored.reduce((s, v) => s + v.avgScore!, 0) / scored.length) : null;
      return [
        cat.name, cat.description || "",
        catKpis.length, `${wt}%`,
        scored.filter(s => s.avgScore! >= 80).length,
        scored.filter(s => s.avgScore! >= 60 && s.avgScore! < 80).length,
        scored.filter(s => s.avgScore! < 60).length,
        catAvg !== null ? `${catAvg}%` : "No Actuals",
      ];
    });
    const ws3 = XLSX.utils.aoa_to_sheet([catHeaders, ...catRows]);
    ws3["!cols"] = [{ wch: 12 }, { wch: 50 }, { wch: 9 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 11 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Category Summary");

    XLSX.writeFile(wb, `Ashika_Group_CTO_KPIs_${yearLabel.replace(/\s+/g, "_")}_${now.toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Excel report downloaded", description: `CTO KPI Scorecard for ${yearLabel}` });
  };

  // ─── Submit to CEO ────────────────────────────────────────────────────────
  const submitToCeo = async () => {
    setSubmitting(true);
    try {
      const result = await apiFetch<{ submitted: number }>("/kpis/submit-ceo", {
        method: "POST",
        body: JSON.stringify({ yearId, requestedBy: (user as any)?.id, comments: submitComment || undefined }),
      });
      toast({ title: `${result.submitted} KPIs submitted to CEO for review`, description: "Status updated to Pending. The CEO can review in the Approvals tab." });
      setSubmitDialog(false);
      setSubmitComment("");
      onRefresh();
    } catch (e: any) {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">CTO KPI Report — {yearLabel}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Download or submit to CEO for review and approval</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={downloadExcel} className="h-8 text-xs">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Download Excel
          </Button>
          <Button size="sm" onClick={() => setSubmitDialog(true)} disabled={eligibleCount === 0} className="h-8 text-xs bg-primary hover:bg-primary/90">
            <Send className="mr-1.5 h-3.5 w-3.5" /> Submit to CEO
            {eligibleCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-white/20">{eligibleCount}</span>}
          </Button>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-50 dark:bg-yellow-400/10 border border-yellow-300/50 text-yellow-700 dark:text-yellow-400 text-xs">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          <span><strong>{pendingCount} KPIs</strong> are currently awaiting CEO review. Use the Approvals tab to track or action them.</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Overall Score" value={totalScore !== null ? `${totalScore}%` : "—"} icon={Award} iconBg="bg-blue-50 dark:bg-blue-400/10" iconColor="text-blue-600" borderColor="border-l-blue-400" valueColor={totalScore ? scoreColor(totalScore) : undefined} />
        <StatCard label="KPIs Scored" value={overallAvg.length} sub={`of ${ctoKpis.length} CTO KPIs`} icon={BarChart3} iconBg="bg-purple-50 dark:bg-purple-400/10" iconColor="text-purple-600" borderColor="border-l-purple-400" />
        <StatCard label="On Track" value={overallAvg.filter(s => s.avgScore! >= 80).length} sub="≥80% score" icon={TrendingUp} iconBg="bg-emerald-50 dark:bg-emerald-400/10" iconColor="text-emerald-600" borderColor="border-l-emerald-400" />
        <StatCard label="At Risk" value={overallAvg.filter(s => s.avgScore! < 60).length} sub="<60% score" icon={AlertTriangle} iconBg="bg-red-50 dark:bg-red-400/10" iconColor="text-red-500" borderColor="border-l-red-400" />
      </div>

      {/* Full Scorecard Table */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">CTO KPI Detailed Scorecard</CardTitle>
            <span className="text-[11px] text-muted-foreground">{ctoKpis.length} KPIs · {yearLabel}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs w-8">#</TableHead>
                <TableHead className="text-xs min-w-48">KPI Name</TableHead>
                <TableHead className="text-xs">Cat.</TableHead>
                <TableHead className="text-xs text-center">Wt.</TableHead>
                <TableHead className="text-xs text-center">Annual Target</TableHead>
                <TableHead className="text-xs text-center">Q1</TableHead>
                <TableHead className="text-xs text-center">Q2</TableHead>
                <TableHead className="text-xs text-center">Q3</TableHead>
                <TableHead className="text-xs text-center">Q4</TableHead>
                <TableHead className="text-xs text-right">Score</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ctoKpis.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center py-10 text-sm text-muted-foreground">No CTO KPIs found for this year.</TableCell></TableRow>
              )}
              {ctoKpis.map(({ kpi, cat, kpiTarget, kpiActuals, avgScore }, idx) => (
                <TableRow key={kpi.id} className="hover:bg-muted/20">
                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <div className="min-w-44">
                      <p className="text-xs font-semibold leading-tight">{kpi.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 max-w-xs">{kpi.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 italic">{kpi.metric} {kpi.unit ? `(${kpi.unit})` : ""}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${cat?.color || "#888"}22`, color: cat?.color || "#888" }}>
                      {cat?.name || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-xs font-medium">{kpi.weightage ? `${kpi.weightage}%` : "—"}</TableCell>
                  <TableCell className="text-center text-xs font-semibold">{kpiTarget?.annualTarget || "—"}</TableCell>
                  {[1, 2, 3, 4].map(q => {
                    const tgt = q === 1 ? kpiTarget?.q1Target : q === 2 ? kpiTarget?.q2Target : q === 3 ? kpiTarget?.q3Target : kpiTarget?.q4Target;
                    const actual = kpiActuals.find(a => a.quarter === q);
                    const sc = actual?.score ? parseFloat(actual.score) : null;
                    return (
                      <TableCell key={q} className="text-center">
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-muted-foreground">T: {tgt || "—"}</div>
                          <div className="text-[10px] font-medium">{actual?.actualValue || "—"}</div>
                          {sc !== null && <div className={cn("text-[10px] font-bold", scoreColor(sc))}>{sc.toFixed(0)}%</div>}
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn("text-sm font-bold", scoreColor(avgScore))}>{avgScore !== null ? `${avgScore}%` : "—"}</span>
                      <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full rounded-full", avgScore === null ? "bg-muted" : avgScore >= 80 ? "bg-emerald-500" : avgScore >= 60 ? "bg-yellow-500" : "bg-red-500")} style={{ width: avgScore !== null ? `${Math.min(avgScore, 100)}%` : "0%" }} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-[10px]", STATUS_BADGE[kpi.status] || "")}>{kpi.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Submit to CEO Dialog */}
      <Dialog open={submitDialog} onOpenChange={setSubmitDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Submit CTO KPIs to CEO</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 space-y-2">
              <p className="text-sm font-medium">Submission Summary</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Financial Year</span><span className="font-medium text-foreground">{yearLabel}</span></div>
                <div className="flex justify-between"><span>CTO KPIs to Submit</span><span className="font-medium text-foreground">{eligibleCount}</span></div>
                <div className="flex justify-between"><span>Prepared By</span><span className="font-medium text-foreground">CTO — Sachin Bhatia</span></div>
                <div className="flex justify-between"><span>Submit To</span><span className="font-medium text-foreground">CEO, Ashika Group</span></div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cover Note / Comments (optional)</Label>
              <Textarea
                value={submitComment}
                onChange={e => setSubmitComment(e.target.value)}
                rows={3}
                placeholder={`Dear Sir,\n\nPlease find enclosed the CTO KPI scorecard for ${yearLabel} for your review and approval...`}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This will update the status of all eligible CTO KPIs to <strong>Pending</strong> and create approval records visible in the Approvals tab.
              Once submitted, the CEO can approve or reject each KPI.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSubmitDialog(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submitToCeo} disabled={submitting || eligibleCount === 0}>
              <Send className="mr-1.5 h-3.5 w-3.5" /> {submitting ? "Submitting..." : `Submit ${eligibleCount} KPIs`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ settings, categories, onRefresh }: { settings: KpiSettings; categories: KpiCategory[]; onRefresh: () => void; }) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [s, setS] = useState({ ...settings });
  const [catModal, setCatModal] = useState(false);
  const [catForm, setCatForm] = useState<Partial<KpiCategory>>({});
  const [editCat, setEditCat] = useState<KpiCategory | null>(null);

  const saveSettings = async () => {
    try {
      await apiFetch("/kpi-settings", { method: "PATCH", body: JSON.stringify(s) });
      toast({ title: "Settings saved" });
      onRefresh();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const saveCat = async () => {
    if (!catForm.name?.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    try {
      if (editCat) { await apiFetch(`/kpi-categories/${editCat.id}`, { method: "PATCH", body: JSON.stringify(catForm) }); }
      else { await apiFetch("/kpi-categories", { method: "POST", body: JSON.stringify(catForm) }); }
      toast({ title: editCat ? "Category updated" : "Category created" });
      setCatModal(false);
      onRefresh();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Workflow Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Approval Workflow</p>
                <p className="text-xs text-muted-foreground">Require approval before KPIs become active</p>
              </div>
              <Switch checked={s.approvalEnabled} onCheckedChange={v => setS(p => ({ ...p, approvalEnabled: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">CTO Score Override</p>
                <p className="text-xs text-muted-foreground">Allow CTO to manually override auto-calculated scores</p>
              </div>
              <Switch checked={s.allowCtoOverride} onCheckedChange={v => setS(p => ({ ...p, allowCtoOverride: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Scoring Model</Label>
              <Select value={s.scoringModel} onValueChange={v => setS(p => ({ ...p, scoringModel: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (Actual/Target × 100)</SelectItem>
                  <SelectItem value="points">Points (0–10 scale)</SelectItem>
                  <SelectItem value="rag">RAG (Red/Amber/Green)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Default Weightage</Label>
              <Select value={s.defaultWeightageType} onValueChange={v => setS(p => ({ ...p, defaultWeightageType: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">Equal (auto-distribute)</SelectItem>
                  <SelectItem value="manual">Manual (set per KPI)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isAdmin && <Button onClick={saveSettings} className="w-full mt-2">Save Settings</Button>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">KPI Categories</CardTitle>
              {isAdmin && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditCat(null); setCatForm({}); setCatModal(true); }}><Plus className="h-3 w-3 mr-1" />Add</Button>}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-2 rounded-md border border-border hover:bg-muted/30">
                <div className="flex items-center gap-2">
                  {cat.color && <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />}
                  <div>
                    <p className="text-sm font-medium">{cat.name}</p>
                    {cat.description && <p className="text-[11px] text-muted-foreground">{cat.description}</p>}
                  </div>
                </div>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditCat(cat); setCatForm({ ...cat }); setCatModal(true); }}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={catModal} onOpenChange={setCatModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>{editCat ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={catForm.name || ""} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={catForm.description || ""} onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Color (hex)</Label>
              <div className="flex items-center gap-2">
                <Input value={catForm.color || ""} onChange={e => setCatForm(p => ({ ...p, color: e.target.value }))} placeholder="#2563eb" className="flex-1" />
                {catForm.color && <div className="w-9 h-9 rounded border border-border flex-shrink-0" style={{ backgroundColor: catForm.color }} />}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCatModal(false)}>Cancel</Button><Button onClick={saveCat}>{editCat ? "Update" : "Create"}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Year Management ──────────────────────────────────────────────────────────
function YearManagementModal({ open, onClose, onRefresh }: { open: boolean; onClose: () => void; onRefresh: () => void; }) {
  const { toast } = useToast();
  const { data: years } = useKpiYears();
  const [isCurrent, setIsCurrent] = useState(false);
  const labelRef = React.useRef<HTMLInputElement>(null);
  const startRef = React.useRef<HTMLInputElement>(null);
  const endRef = React.useRef<HTMLInputElement>(null);

  const save = async () => {
    const label = labelRef.current?.value?.trim() || "";
    const startDate = startRef.current?.value?.trim() || "";
    const endDate = endRef.current?.value?.trim() || "";
    if (!label || !startDate || !endDate) {
      toast({ title: "All fields required", description: "Please fill in label, start date and end date.", variant: "destructive" });
      return;
    }
    try {
      await apiFetch("/kpi-years", { method: "POST", body: JSON.stringify({ label, startDate, endDate, isCurrent, isActive: true }) });
      toast({ title: "Financial year created" });
      if (labelRef.current) labelRef.current.value = "";
      if (startRef.current) startRef.current.value = "";
      if (endRef.current) endRef.current.value = "";
      setIsCurrent(false);
      onRefresh();
      onClose();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader><DialogTitle>Manage Financial Years</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            {(years || []).map(y => (
              <div key={y.id} className="flex items-center justify-between px-3 py-2 rounded-md border border-border">
                <div>
                  <span className="text-sm font-medium">{y.label}</span>
                  {y.isCurrent && <Badge className="ml-2 text-[10px] bg-primary/10 text-primary border-primary/20">Current</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">{y.startDate} → {y.endDate}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add New Year</p>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input ref={labelRef} placeholder="FY 2026-27" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Start Date (YYYY-MM-DD)</Label><Input ref={startRef} placeholder="2026-04-01" /></div>
              <div className="space-y-1.5"><Label>End Date (YYYY-MM-DD)</Label><Input ref={endRef} placeholder="2027-03-31" /></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isCurrent} onCheckedChange={setIsCurrent} />
              <Label className="text-sm">Set as current year</Label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={save}>Create Year</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "management", label: "KPI Management", icon: Target },
  { id: "planning", label: "Planning", icon: Calendar },
  { id: "execution", label: "Execution", icon: Play },
  { id: "approvals", label: "Approvals", icon: CheckCircle2 },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export default function TechKpis() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [yearModal, setYearModal] = useState(false);

  const { data: years } = useKpiYears();
  const { data: categories } = useKpiCategories();
  const { data: settings } = useKpiSettings();
  const { data: kpis } = useKpis(selectedYearId ?? undefined);
  const { data: targets } = useKpiTargets(selectedYearId ?? undefined);
  const { data: actuals } = useKpiActuals(selectedYearId ?? undefined);
  const { isAdmin } = useAuth();

  // Auto-select current year
  React.useEffect(() => {
    if (years && years.length > 0 && !selectedYearId) {
      const current = years.find(y => y.isCurrent) || years[0];
      setSelectedYearId(current.id);
    }
  }, [years, selectedYearId]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["kpis"] });
    queryClient.invalidateQueries({ queryKey: ["kpi-targets"] });
    queryClient.invalidateQueries({ queryKey: ["kpi-actuals"] });
    queryClient.invalidateQueries({ queryKey: ["kpi-approvals"] });
    queryClient.invalidateQueries({ queryKey: ["kpi-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["kpi-years"] });
    queryClient.invalidateQueries({ queryKey: ["kpi-categories"] });
    queryClient.invalidateQueries({ queryKey: ["kpi-settings"] });
  };

  const pendingApprovals = useKpiApprovals().data?.filter(a => a.status === "Pending").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Technology KPIs</h1>
          <p className="text-xs text-muted-foreground mt-0.5">CTO KPI Management · Year-wise lifecycle tracking</p>
        </div>
        <div className="flex items-center gap-2">
          {years && <YearSelector years={years} currentId={selectedYearId} onChange={setSelectedYearId} />}
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setYearModal(true)}>
              <Calendar className="mr-1.5 h-3.5 w-3.5" /> Manage Years
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={refresh}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* No year state */}
      {!years || years.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <Calendar className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">No Financial Year configured</p>
          <p className="text-xs text-muted-foreground mb-4">Create a financial year to start defining KPIs.</p>
          {isAdmin && <Button onClick={() => setYearModal(true)}><Plus className="mr-1.5 h-4 w-4" />Create First Year</Button>}
        </CardContent></Card>
      ) : (
        <>
          {/* Tab nav */}
          <div className="flex items-center gap-0.5 border-b border-border overflow-x-auto pb-0">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const hasBadge = tab.id === "approvals" && pendingApprovals > 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap relative",
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  {tab.label}
                  {hasBadge && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-orange-500 text-white">{pendingApprovals}</span>}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div>
            {activeTab === "dashboard" && selectedYearId && (
              <DashboardTab yearId={selectedYearId} kpis={kpis ?? []} actuals={actuals ?? []} targets={targets ?? []} categories={categories ?? []} />
            )}
            {activeTab === "management" && selectedYearId && (
              <KpiManagementTab yearId={selectedYearId} kpis={kpis ?? []} categories={categories ?? []} settings={settings ?? { approvalEnabled: false, scoringModel: "percentage", defaultWeightageType: "equal", allowCtoOverride: true }} onRefresh={refresh} />
            )}
            {activeTab === "planning" && selectedYearId && (
              <KpiPlanningTab yearId={selectedYearId} kpis={kpis ?? []} targets={targets ?? []} onRefresh={refresh} />
            )}
            {activeTab === "execution" && selectedYearId && (
              <ExecutionTab yearId={selectedYearId} kpis={kpis ?? []} actuals={actuals ?? []} targets={targets ?? []} onRefresh={refresh} />
            )}
            {activeTab === "approvals" && (
              <ApprovalsTab kpis={kpis ?? []} settings={settings ?? { approvalEnabled: false, scoringModel: "percentage", defaultWeightageType: "equal", allowCtoOverride: true }} onRefresh={refresh} />
            )}
            {activeTab === "reports" && selectedYearId && (
              <ReportsTab
                yearId={selectedYearId}
                yearLabel={years?.find(y => y.id === selectedYearId)?.label ?? ""}
                kpis={kpis ?? []} actuals={actuals ?? []} targets={targets ?? []} categories={categories ?? []}
                onRefresh={refresh}
              />
            )}
            {activeTab === "settings" && (
              <SettingsTab settings={settings ?? { approvalEnabled: false, scoringModel: "percentage", defaultWeightageType: "equal", allowCtoOverride: true }} categories={categories ?? []} onRefresh={refresh} />
            )}
          </div>
        </>
      )}

      <YearManagementModal open={yearModal} onClose={() => setYearModal(false)} onRefresh={refresh} />
    </div>
  );
}
