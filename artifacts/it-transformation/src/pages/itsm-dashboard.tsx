import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch, API } from "@/lib/api";
import {
  AlertTriangle, Bug, GitBranch, CheckCircle2, Clock, BookOpen, FileText,
  Shield, Headphones, Timer, XCircle, TrendingUp, TrendingDown, Activity,
  Zap, Target, BarChart3, ArrowUpRight, ArrowRight, Users, Flame, Gauge
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid, AreaChart, Area, LineChart, Line, RadialBarChart, RadialBar
} from "recharts";
import { useLocation } from "wouter";

const COLORS = ["#2D7FF9", "#0f766e", "#2563eb", "#dc2626", "#8b5cf6", "#ea580c", "#059669", "#6366f1"];
const PRIORITY_COLORS: Record<string, string> = { Critical: "#dc2626", High: "#ea580c", Medium: "#2D7FF9", Low: "#2563eb" };
const STATUS_COLORS: Record<string, string> = { Open: "#dc2626", "In Progress": "#ea580c", Resolved: "#059669", Closed: "#6b7280", "On Hold": "#2D7FF9", Pending: "#8b5cf6" };
const CHANGE_STATUS_COLORS: Record<string, string> = { Draft: "#6b7280", Submitted: "#8b5cf6", Approved: "#2563eb", "In Progress": "#ea580c", Completed: "#059669", Failed: "#dc2626", "Rolled Back": "#9ca3af" };
const SEVERITY_COLORS: Record<string, string> = { S1: "#dc2626", S2: "#ea580c", S3: "#2D7FF9", S4: "#2563eb" };

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <div className="font-semibold text-foreground mb-1">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          <span className="text-muted-foreground">{p.name || p.dataKey}:</span>
          <span className="font-semibold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.payload?.fill }} />
        <span className="font-semibold">{d.name}: {d.value}</span>
      </div>
    </div>
  );
};

export default function ItsmDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: incidents = [] } = useQuery({ queryKey: ["incidents"], queryFn: () => apiFetch<any[]>("/incidents") });
  const { data: incidentStats } = useQuery({ queryKey: ["incidents-stats"], queryFn: () => apiFetch<any>("/incidents/stats") });
  const { data: problems = [] } = useQuery({ queryKey: ["problems"], queryFn: () => apiFetch<any[]>("/problems") });
  const { data: changes = [] } = useQuery({ queryKey: ["changes"], queryFn: () => apiFetch<any[]>("/changes") });
  const { data: changeStats } = useQuery({ queryKey: ["changes-stats"], queryFn: () => apiFetch<any>("/changes/stats") });
  const { data: kb = [] } = useQuery({ queryKey: ["knowledge-base"], queryFn: () => apiFetch<any[]>("/knowledge-base") });
  const { data: slas = [] } = useQuery({ queryKey: ["sla-policies"], queryFn: () => apiFetch<any[]>("/sla-policies") });
  const { data: serviceRequests = [] } = useQuery({ queryKey: ["service-requests"], queryFn: () => apiFetch<any[]>("/service-requests") });
  const { data: itsmMetrics } = useQuery({ queryKey: ["itsm-metrics"], queryFn: () => apiFetch<any>("/itsm-metrics") });

  const openIncidents = incidents.filter((i: any) => i.status === "Open").length;
  const inProgressIncidents = incidents.filter((i: any) => i.status === "In Progress").length;
  const resolvedIncidents = incidents.filter((i: any) => i.status === "Resolved" || i.status === "Closed").length;
  const closedIncidents = incidents.filter((i: any) => i.status === "Closed").length;
  const criticalIncidents = incidents.filter((i: any) => i.priority === "Critical" && i.status !== "Closed" && i.status !== "Resolved").length;
  const pendingChanges = changes.filter((c: any) => c.approvalStatus === "Pending").length;
  const activeProblems = problems.filter((p: any) => p.status !== "Closed").length;
  const openSR = serviceRequests.filter((s: any) => s.status !== "Completed" && s.status !== "Cancelled").length;
  const totalTickets = incidents.length + problems.length + changes.length + serviceRequests.length;
  const slaBreachedCount = incidentStats?.slaBreached || 0;

  const totalIncidents = incidentStats?.total || incidents.length;
  const resolutionRate = totalIncidents > 0 ? Math.round((resolvedIncidents / totalIncidents) * 100) : 0;

  const statusData = incidentStats?.byStatus?.map((s: any) => ({ name: s.status, value: s.count, fill: STATUS_COLORS[s.status] || "#999" })) || [];
  const priorityData = incidentStats?.byPriority?.map((p: any) => ({ name: p.priority, value: p.count, fill: PRIORITY_COLORS[p.priority] || "#999" })) || [];
  const severityData = incidentStats?.bySeverity?.map((s: any) => ({ name: s.severity, value: s.count, fill: SEVERITY_COLORS[s.severity] || "#999" })) || [];

  const changePipeline = useMemo(() => {
    const byStatus: Record<string, number> = {};
    changes.forEach((c: any) => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
    const order = ["Draft", "Submitted", "Under Review", "Approved", "Scheduled", "In Progress", "Completed", "Failed", "Rolled Back", "Rejected", "Cancelled"];
    return [...order, ...Object.keys(byStatus).filter(s => !order.includes(s))].filter(s => byStatus[s]).map(s => ({
      name: s, value: byStatus[s] || 0, fill: CHANGE_STATUS_COLORS[s] || "#999"
    }));
  }, [changes]);

  const changeByType = useMemo(() => {
    const byType: Record<string, number> = {};
    changes.forEach((c: any) => { byType[c.type || "Standard"] = (byType[c.type || "Standard"] || 0) + 1; });
    return Object.entries(byType).map(([name, value]) => ({ name, value }));
  }, [changes]);

  const problemsByStatus = useMemo(() => {
    const s: Record<string, number> = {};
    problems.forEach((p: any) => { s[p.status] = (s[p.status] || 0) + 1; });
    return Object.entries(s).map(([name, value]) => ({ name, value }));
  }, [problems]);

  const categoryBreakdown = useMemo(() => {
    const cats: Record<string, number> = {};
    incidents.forEach((i: any) => { cats[i.category || "Other"] = (cats[i.category || "Other"] || 0) + 1; });
    return Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [incidents]);

  const assigneeWorkload = useMemo(() => {
    const w: Record<string, { open: number; inProgress: number; total: number }> = {};
    incidents.forEach((i: any) => {
      const a = i.assignedTo || "Unassigned";
      if (!w[a]) w[a] = { open: 0, inProgress: 0, total: 0 };
      w[a].total++;
      if (i.status === "Open") w[a].open++;
      if (i.status === "In Progress") w[a].inProgress++;
    });
    return Object.entries(w).map(([name, d]) => ({ name: name.length > 12 ? name.slice(0, 12) + "…" : name, ...d })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [incidents]);

  const weeklyTrend = useMemo(() => {
    const getISOWeekKey = (date: Date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
    };
    const weeks: Record<string, { opened: number; resolved: number }> = {};
    const weekKeys: string[] = [];
    const now = Date.now();
    for (let w = 7; w >= 0; w--) {
      const d = new Date(now - w * 7 * 86400000);
      const key = getISOWeekKey(d);
      if (!weeks[key]) { weeks[key] = { opened: 0, resolved: 0 }; weekKeys.push(key); }
    }
    incidents.forEach((i: any) => {
      const key = getISOWeekKey(new Date(i.createdAt));
      if (weeks[key]) weeks[key].opened++;
    });
    incidents.filter((i: any) => i.status === "Resolved" || i.status === "Closed").forEach((i: any) => {
      const key = getISOWeekKey(new Date(i.updatedAt || i.createdAt));
      if (weeks[key]) weeks[key].resolved++;
    });
    return weekKeys.map(key => ({ name: key.split("-")[1], ...weeks[key] }));
  }, [incidents]);

  const srByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    serviceRequests.forEach((sr: any) => { cats[sr.category || "General"] = (cats[sr.category || "General"] || 0) + 1; });
    return Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [serviceRequests]);

  const recentIncidents = [...incidents].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);
  const recentChanges = [...changes].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  const kbViews = kb.reduce((s: number, a: any) => s + (a.views || 0), 0);

  const serviceHealth = useMemo(() => {
    const score = Math.max(0, 100 - (criticalIncidents * 15) - (openIncidents * 3) - (activeProblems * 5));
    return Math.min(100, score);
  }, [criticalIncidents, openIncidents, activeProblems]);

  const healthColor = serviceHealth >= 80 ? "#059669" : serviceHealth >= 60 ? "#2D7FF9" : "#dc2626";
  const healthLabel = serviceHealth >= 80 ? "Healthy" : serviceHealth >= 60 ? "Degraded" : "Critical";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ITSM Command Center</h1>
          <p className="text-sm text-muted-foreground">Welcome, {user?.name || "User"} — Real-time IT Service Management Overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs font-medium" style={{ borderColor: healthColor, color: healthColor }}>
            <Activity className="w-3.5 h-3.5" />
            Service Health: {healthLabel}
          </Badge>
          <Button variant="outline" onClick={() => window.open(`${API}/export/itsm-doc`, "_blank")} className="gap-2">
            <FileText className="w-4 h-4" />Export Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard icon={AlertTriangle} label="Open Incidents" value={openIncidents} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" sub={criticalIncidents > 0 ? `${criticalIncidents} critical` : "0 critical"} />
        <StatCard icon={Timer} label="In Progress" value={inProgressIncidents} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={CheckCircle2} label="Resolved" value={resolvedIncidents} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" sub={`${resolutionRate}% rate`} />
        <StatCard icon={Bug} label="Active Problems" value={activeProblems} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600" borderColor="border-l-violet-500" />
        <StatCard icon={GitBranch} label="Pending Changes" value={pendingChanges} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" sub={`${changes.length} total`} />
        <StatCard icon={Headphones} label="Open Requests" value={openSR} iconBg="bg-teal-100 dark:bg-teal-900/30" iconColor="text-teal-600" borderColor="border-l-teal-500" sub={`${serviceRequests.length} total`} />
        <StatCard icon={Shield} label="SLA Breached" value={slaBreachedCount} iconBg="bg-orange-100 dark:bg-orange-900/30" iconColor="text-orange-600" borderColor="border-l-orange-500" />
        <StatCard icon={BookOpen} label="KB Articles" value={kb.length} iconBg="bg-indigo-100 dark:bg-indigo-900/30" iconColor="text-indigo-600" borderColor="border-l-indigo-500" sub={`${kbViews} views`} />
        <StatCard icon={Gauge} label="Total Tickets" value={totalTickets} iconBg="bg-gray-100 dark:bg-gray-900/30" iconColor="text-gray-600" borderColor="border-l-gray-400" sub={`${openIncidents + inProgressIncidents + activeProblems + openSR} open across all types`} />
      </div>

      {itsmMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Timer className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mean Time To Resolve</div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {itsmMetrics.mttr != null ? `${itsmMetrics.mttr}h` : "—"}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Average resolution time across resolved incidents</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SLA Compliance</div>
                  <div className={`text-2xl font-bold ${itsmMetrics.slaCompliance == null ? "text-muted-foreground" : itsmMetrics.slaCompliance >= 90 ? "text-emerald-600 dark:text-emerald-400" : itsmMetrics.slaCompliance >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                    {itsmMetrics.slaCompliance != null ? `${itsmMetrics.slaCompliance}%` : "—"}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{itsmMetrics.slaCompliance == null ? (itsmMetrics.slaPolicies ? "No incident carries an SLA target yet" : "No SLA policies defined — add them in SLA Policies") : `${itsmMetrics.slaMeasured - itsmMetrics.slaBreached} of ${itsmMetrics.slaMeasured} incidents within SLA`}</p>
              {itsmMetrics.slaCompliance != null && (
                <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${itsmMetrics.slaCompliance >= 90 ? "bg-emerald-500" : itsmMetrics.slaCompliance >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${itsmMetrics.slaCompliance}%` }} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ticket Aging</div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{itsmMetrics.totalOpen ?? 0} open</div>
                </div>
              </div>
              {itsmMetrics.aging && (
                <div className="mt-2 space-y-1">
                  {Object.entries(itsmMetrics.aging as Record<string, number>).map(([bucket, count]) => (
                    <div key={bucket} className="flex items-center gap-2 text-xs">
                      <span className="w-12 text-muted-foreground font-mono">{bucket}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-amber-400 dark:bg-amber-500" style={{ width: itsmMetrics.totalOpen > 0 ? `${Math.round((count / itsmMetrics.totalOpen) * 100)}%` : "0%" }} />
                      </div>
                      <span className="font-semibold w-4 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {criticalIncidents > 0 && (
        <Card className="border-red-500/50 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
                  <Flame className="w-4 h-4 text-white" />
                </div>
                <div>
                  <span className="font-semibold text-red-800 dark:text-red-400">Critical Incidents — Immediate Action Required</span>
                  <p className="text-[10px] text-red-600/70 dark:text-red-400/60">{criticalIncidents} unresolved critical incident{criticalIncidents > 1 ? "s" : ""}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1.5 text-xs" onClick={() => navigate("/itsm-incidents")}>
                View All <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {incidents.filter((i: any) => i.priority === "Critical" && i.status !== "Closed" && i.status !== "Resolved").map((i: any) => (
                <div key={i.id} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg px-3 py-2.5 border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] text-red-600 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">{i.ticketNo}</span>
                    <span className="text-sm font-medium truncate">{i.title}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-600">{i.severity || "Sev-1"}</Badge>
                    <span className="text-[10px] text-muted-foreground">{i.assignedTo || "Unassigned"}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-12 gap-5">
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-blue-500" />Service Health Score</CardTitle>
              <Badge variant="outline" className="text-[10px]" style={{ borderColor: healthColor, color: healthColor }}>{healthLabel}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="relative w-[140px] h-[140px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" data={[{ value: serviceHealth, fill: healthColor }]} startAngle={90} endAngle={-270}>
                    <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={10} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold" style={{ color: healthColor }}>{serviceHealth}</span>
                  <span className="text-[10px] text-muted-foreground">/ 100</span>
                </div>
              </div>
              <div className="space-y-3 flex-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Critical Incidents</span>
                  <span className="font-semibold" style={{ color: criticalIncidents > 0 ? "#dc2626" : "#059669" }}>
                    {criticalIncidents > 0 ? `${criticalIncidents} active` : "None"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Resolution Rate</span>
                  <span className="font-semibold">{resolutionRate}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Open Problems</span>
                  <span className="font-semibold">{activeProblems}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Pending Changes</span>
                  <span className="font-semibold">{pendingChanges}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">SLA Compliance</span>
                  <Badge variant="outline" className="text-[10px]">{slas.length} policies active</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" />Incident Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={weeklyTrend}>
                <defs>
                  <linearGradient id="openGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="opened" stroke="#dc2626" fill="url(#openGrad)" strokeWidth={2} name="Opened" dot={{ r: 3, fill: "#dc2626" }} />
                <Area type="monotone" dataKey="resolved" stroke="#059669" fill="url(#resolvedGrad)" strokeWidth={2} name="Resolved" dot={{ r: 3, fill: "#059669" }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />Incidents by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {statusData.map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
              {statusData.map((s: any) => (
                <div key={s.name} className="flex items-center gap-1.5 text-[10px]">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.fill }} />
                  <span>{s.name} ({s.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />By Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={priorityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {priorityData.map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
              {priorityData.map((p: any) => (
                <div key={p.name} className="flex items-center gap-1.5 text-[10px]">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
                  <span>{p.name} ({p.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-500" />By Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categoryBreakdown} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="name" fontSize={9} width={75} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Target className="w-4 h-4 text-rose-500" />By Severity</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={severityData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {severityData.map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
              {severityData.map((s: any) => (
                <div key={s.name} className="flex items-center gap-1.5 text-[10px]">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.fill }} />
                  <span>{s.name} ({s.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <Card className="col-span-12 lg:col-span-4">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><GitBranch className="w-4 h-4 text-blue-500" />Change Pipeline</CardTitle>
              <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 gap-1" onClick={() => navigate("/itsm-changes")}>View <ArrowUpRight className="w-3 h-3" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {changePipeline.map((stage) => {
                const maxVal = Math.max(...changePipeline.map(s => s.value), 1);
                const pct = (stage.value / maxVal) * 100;
                return (
                  <div key={stage.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">{stage.name}</span>
                      <span className="text-muted-foreground font-semibold">{stage.value}</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: stage.fill }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-border/50">
              <div className="grid grid-cols-2 gap-2">
                {changeByType.map((t) => (
                  <div key={t.name} className="flex items-center justify-between bg-muted/50 rounded-lg px-2.5 py-1.5">
                    <span className="text-[10px] text-muted-foreground">{t.name}</span>
                    <span className="text-xs font-semibold">{t.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-12 lg:col-span-4">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-violet-500" />Assignee Workload</CardTitle>
              <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 gap-1" onClick={() => navigate("/itsm-incidents")}>View <ArrowUpRight className="w-3 h-3" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={assigneeWorkload} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="name" fontSize={9} width={80} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="open" stackId="a" fill="#dc2626" name="Open" radius={[0, 0, 0, 0]} />
                <Bar dataKey="inProgress" stackId="a" fill="#ea580c" name="In Progress" radius={[0, 4, 4, 0]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-red-500" />Recent Incidents</CardTitle>
              <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 gap-1" onClick={() => navigate("/itsm-incidents")}>View All <ArrowUpRight className="w-3 h-3" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {recentIncidents.map((i: any) => (
                <div key={i.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition cursor-pointer group" onClick={() => navigate("/itsm-incidents")}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PRIORITY_COLORS[i.priority] || "#999" }} />
                    <span className="font-mono text-[10px] text-muted-foreground w-[72px] flex-shrink-0">{i.ticketNo}</span>
                    <span className="text-xs truncate">{i.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge variant="outline" className="text-[9px] px-1.5" style={{ borderColor: PRIORITY_COLORS[i.priority], color: PRIORITY_COLORS[i.priority] }}>{i.priority}</Badge>
                    <Badge variant="outline" className="text-[9px] px-1.5">{i.status}</Badge>
                    <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><GitBranch className="w-4 h-4 text-blue-500" />Recent Changes</CardTitle>
              <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 gap-1" onClick={() => navigate("/itsm-changes")}>View All <ArrowUpRight className="w-3 h-3" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {recentChanges.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition cursor-pointer group" onClick={() => navigate("/itsm-changes")}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHANGE_STATUS_COLORS[c.status] || "#999" }} />
                    <span className="font-mono text-[10px] text-muted-foreground w-[72px] flex-shrink-0">{c.changeNo}</span>
                    <span className="text-xs truncate">{c.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge variant="outline" className="text-[9px] px-1.5">{c.type || "Standard"}</Badge>
                    <Badge variant="outline" className="text-[9px] px-1.5" style={{ borderColor: CHANGE_STATUS_COLORS[c.status], color: CHANGE_STATUS_COLORS[c.status] }}>{c.status}</Badge>
                    <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Bug className="w-4 h-4 text-violet-500" />Problems Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-violet-50 dark:bg-violet-950/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-violet-600">{activeProblems}</div>
                <div className="text-[10px] text-violet-600/70">Active</div>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-emerald-600">{problems.length - activeProblems}</div>
                <div className="text-[10px] text-emerald-600/70">Closed</div>
              </div>
            </div>
            {problemsByStatus.length > 0 && (
              <div className="space-y-2">
                {problemsByStatus.map((ps) => {
                  const maxVal = Math.max(...problemsByStatus.map(p => p.value), 1);
                  return (
                    <div key={ps.name} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-20 flex-shrink-0">{ps.name}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(ps.value / maxVal) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-semibold w-6 text-right">{ps.value}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Headphones className="w-4 h-4 text-teal-500" />Service Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-teal-50 dark:bg-teal-950/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-teal-600">{openSR}</div>
                <div className="text-[10px] text-teal-600/70">Open</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-600">{serviceRequests.length}</div>
                <div className="text-[10px] text-gray-500">Total</div>
              </div>
            </div>
            {srByCategory.length > 0 && (
              <div className="space-y-2">
                {srByCategory.slice(0, 5).map((cat) => {
                  const maxVal = Math.max(...srByCategory.map(c => c.value), 1);
                  return (
                    <div key={cat.name} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-20 flex-shrink-0 truncate">{cat.name}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(cat.value / maxVal) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-semibold w-6 text-right">{cat.value}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-[#2D7FF9]" />Quick Navigation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Incidents", desc: `${incidents.length} tickets`, href: "/itsm-incidents", icon: AlertTriangle, color: "bg-red-500" },
                { label: "Problems", desc: `${problems.length} tracked`, href: "/itsm-problems", icon: Bug, color: "bg-violet-500" },
                { label: "Changes", desc: `${changes.length} requests`, href: "/itsm-changes", icon: GitBranch, color: "bg-blue-500" },
                { label: "Knowledge Base", desc: `${kb.length} articles`, href: "/itsm-kb", icon: BookOpen, color: "bg-emerald-500" },
                { label: "SLA Policies", desc: `${slas.length} policies`, href: "/itsm-sla", icon: Shield, color: "bg-amber-500" },
                { label: "Service Requests", desc: `${serviceRequests.length} requests`, href: "/itsm-requests", icon: Headphones, color: "bg-teal-500" },
              ].map(item => (
                <button key={item.href} onClick={() => navigate(item.href)} className="flex items-center gap-2.5 p-2.5 rounded-lg border hover:bg-muted/50 hover:border-[#2D7FF9]/30 transition text-left group">
                  <div className={`w-8 h-8 rounded-lg ${item.color} flex items-center justify-center flex-shrink-0`}>
                    <item.icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{item.label}</div>
                    <div className="text-[9px] text-muted-foreground">{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
