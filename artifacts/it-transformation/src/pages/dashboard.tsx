import React, { useState, useMemo } from "react";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, RadialBarChart, RadialBar, LabelList,
} from "recharts";
import {
  Server, Archive, CheckSquare, IndianRupee, ShieldAlert, BrainCircuit,
  Filter, X, LayoutDashboard, Map, Shield, ChevronLeft, ChevronRight,
  TrendingUp, AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

// ─── Constants ─────────────────────────────────────────────────────────────
const CHART_COLORS = ["#d97706","#2563eb","#16a34a","#dc2626","#9333ea","#ea580c","#0891b2","#db2777"];
const STATUS_COLORS: Record<string, string> = {
  Available: "#16a34a", "Not Available": "#dc2626", Legacy: "#d97706", Partial: "#ea580c",
  Completed: "#16a34a", "In Progress": "#2563eb", Planned: "#9333ea", "On Hold": "#ea580c",
  Critical: "#dc2626", High: "#ea580c", Medium: "#d97706", Low: "#16a34a", None: "#9ca3af",
  Active: "#16a34a", Retired: "#6b7280", Stopped: "#dc2626",
};

type DashTab = "overview" | "applications" | "roadmap" | "checklist" | "security";

const TABS: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "applications", label: "Applications", icon: Server },
  { id: "roadmap", label: "Roadmap", icon: Map },
  { id: "checklist", label: "Checklist", icon: CheckSquare },
  { id: "security", label: "Security", icon: Shield },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const GENERIC_BUSINESS = new Set(["All", "Both", "All Business Units", "all", "both"]);
function matchesBU(business: string | null | undefined, filterBU: string) {
  if (filterBU === "all") return true;
  return business === filterBU || GENERIC_BUSINESS.has(business ?? "");
}

function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function KpiCard({
  title, value, sub, icon: Icon, iconBg, iconColor, border, progress, progressColor,
}: {
  title: string; value: string | number; sub?: string; icon: React.ElementType;
  iconBg?: string; iconColor?: string; border?: string; progress?: number; progressColor?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden", border ? `border-l-4 ${border}` : "")}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{title}</p>
            <p className="text-xl font-bold text-foreground leading-none">{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">{sub}</p>}
          </div>
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0", iconBg || "bg-muted")}>
            <Icon className={cn("h-3.5 w-3.5", iconColor || "text-muted-foreground")} />
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-3">
            <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
              <span>Progress</span><span className="font-semibold">{progress}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: progressColor || "#16a34a" }} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChartTooltip({ active, payload, label, format }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-2.5 shadow-lg text-xs">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">{p.name?.toLowerCase().includes("budget") ? format(p.value, 1) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function SmallPagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-border">
      <span className="text-[10px] text-muted-foreground">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page === 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-3 w-3" />
        </Button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
          const p = page <= 3 ? i + 1 : page + i - 2;
          if (p < 1 || p > pages) return null;
          return (
            <Button key={p} variant={p === page ? "default" : "ghost"} size="icon" className="h-6 w-6 text-[10px]" onClick={() => onChange(p)}>
              {p}
            </Button>
          );
        })}
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page === pages} onClick={() => onChange(page + 1)}>
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "#9ca3af";
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}30` }}>
      {status}
    </span>
  );
}

// ─── Tab: Overview ───────────────────────────────────────────────────────────
function OverviewTab({ s, filterBU, format, unit }: { s: any; filterBU: string; format: any; unit: string }) {
  const filtChecklist = useMemo(() => {
    const all: any[] = s.checklistByBusiness ?? [];
    if (filterBU === "all") return all;
    return all.filter((b: any) => b.key === filterBU || GENERIC_BUSINESS.has(b.key));
  }, [s, filterBU]);

  const budgetTick = (v: number) =>
    unit === "crores" ? `${(v / 100).toFixed(0)}Cr` : unit === "millions" ? `${(v / 10).toFixed(0)}M` : `${v}L`;

  const completionPct = s.checklistCompletionPct ?? 0;

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <KpiCard title="Applications" value={s.totalApplications} sub="in inventory"
          icon={Server} iconBg="bg-blue-50 dark:bg-blue-400/10" iconColor="text-blue-600 dark:text-blue-400" border="border-blue-400" />
        <KpiCard title="Total Budget" value={format(s.roadmapBudgetLakhs, 0)}
          sub={`${s.roadmapTotal} initiatives · ${s.roadmapCompletedItems} done`}
          icon={IndianRupee} iconBg="bg-yellow-50 dark:bg-yellow-400/10" iconColor="text-yellow-600" border="border-yellow-400" />
        <KpiCard title="Checklist Ready" value={`${completionPct}%`}
          sub={`${s.checklistAvailable}/${s.checklistTotal} available`}
          icon={CheckSquare} iconBg="bg-emerald-50 dark:bg-emerald-400/10" iconColor="text-emerald-600 dark:text-emerald-400" border="border-emerald-400"
          progress={completionPct} progressColor="#16a34a" />
        <KpiCard title="Pending Retirements" value={s.appsToRetire}
          sub={`${s.appsRetired ?? 0} already retired`}
          icon={Archive} iconBg="bg-orange-50 dark:bg-orange-400/10" iconColor="text-orange-600" border="border-orange-400" />
        <KpiCard title="Critical CVEs" value={s.sbomCriticalCves}
          sub={`${s.sbomHighCves} high · ${s.sbomTotal} entries`}
          icon={ShieldAlert} iconBg="bg-red-50 dark:bg-red-400/10" iconColor="text-red-600 dark:text-red-400" border="border-red-500" />
      </div>

      {/* 3-column chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Checklist Status Pie */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Checklist Status</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={s.checklistByStatus ?? []} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="count" nameKey="key" labelLine={false} label={renderPieLabel}>
                  {(s.checklistByStatus ?? []).map((e: any, i: number) => <Cell key={i} fill={STATUS_COLORS[e.key] || CHART_COLORS[i]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip format={format} />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: "10px" }} formatter={(value, entry: any) => `${value} (${entry.payload.count})`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Roadmap by Phase */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Budget by Phase</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={s.roadmapByPhase ?? []} margin={{ left: 0, right: 4, top: 14 }}>
                <XAxis dataKey="key" fontSize={9} tickLine={false} axisLine={false} stroke="#9ca3af" tick={{ fontSize: 8 }} />
                <YAxis fontSize={9} tickLine={false} axisLine={false} stroke="#9ca3af" tickFormatter={budgetTick} width={32} />
                <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="budgetLakhs" name="Budget" fill="#d97706" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="budgetLakhs" position="top" fontSize={8} formatter={(v: number) => budgetTick(v)} style={{ fill: "#9ca3af" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Security risk */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Security Risk Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={s.sbomByRisk ?? []} margin={{ left: 0, right: 4, top: 14 }}>
                <XAxis dataKey="key" fontSize={9} tickLine={false} axisLine={false} stroke="#9ca3af" />
                <YAxis fontSize={9} tickLine={false} axisLine={false} stroke="#9ca3af" width={28} />
                <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="count" name="CVEs" radius={[3, 3, 0, 0]}>
                  {(s.sbomByRisk ?? []).map((e: any, i: number) => <Cell key={i} fill={STATUS_COLORS[e.key] || CHART_COLORS[i]} />)}
                  <LabelList dataKey="count" position="top" fontSize={8} style={{ fill: "#9ca3af" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom 2-column row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Checklist by BU */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Readiness by Business Unit</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={155}>
              <BarChart data={filtChecklist} layout="vertical" margin={{ left: 0, right: 8 }}>
                <XAxis type="number" fontSize={9} tickLine={false} axisLine={false} stroke="#9ca3af" />
                <YAxis dataKey="key" type="category" fontSize={9} tickLine={false} axisLine={false} width={90} stroke="#9ca3af" />
                <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="count" fill="#16a34a" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* App lifecycle & retirement */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Application Lifecycle & Retirement</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="grid grid-cols-2 gap-3 h-40">
              <div>
                <p className="text-[10px] text-muted-foreground mb-2">By Lifecycle</p>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={s.appsByLifecycle ?? []} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="count" nameKey="key" labelLine={false} label={renderPieLabel}>
                      {(s.appsByLifecycle ?? []).map((e: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip format={format} />} />
                    <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: "9px" }} formatter={(value, entry: any) => `${value} (${entry.payload.count})`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-2">Retirement Status</p>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={s.retirementsByStatus ?? []} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="count" nameKey="key" labelLine={false} label={renderPieLabel}>
                      {(s.retirementsByStatus ?? []).map((e: any, i: number) => <Cell key={i} fill={STATUS_COLORS[e.key] || CHART_COLORS[i]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip format={format} />} />
                    <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: "9px" }} formatter={(value, entry: any) => `${value} (${entry.payload.count})`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Applications ───────────────────────────────────────────────────────
function ApplicationsTab({ filterBU, format }: { filterBU: string; format: any }) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const { data: allApps = [], isLoading: appsLoading } = useQuery<any[]>({
    queryKey: ["applications-dashboard"],
    queryFn: () => apiFetch<any[]>("/applications"),
    staleTime: 60_000,
  });

  const filtApps = useMemo(() => {
    return allApps.filter((a: any) => matchesBU(a.business, filterBU));
  }, [allApps, filterBU]);

  const pagedApps = filtApps.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const byHosting = useMemo(() => {
    const m: Record<string, number> = {};
    filtApps.forEach((a: any) => { const k = a.hosting || "Unknown"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtApps]);

  const byCrit = useMemo(() => {
    const m: Record<string, number> = {};
    filtApps.forEach((a: any) => { const k = a.criticality || "Unknown"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtApps]);

  const byStatus = useMemo(() => {
    const m: Record<string, number> = {};
    filtApps.forEach((a: any) => { const k = a.applicationStatus || "Active"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtApps]);

  if (appsLoading) return <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading applications…</div>;

  return (
    <div className="space-y-4">
      {/* Mini KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold">{filtApps.length}</p><p className="text-[10px] text-muted-foreground">Total Apps</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-blue-600">{byHosting.find(([k]) => k === "Cloud")?.[1] ?? 0}</p><p className="text-[10px] text-muted-foreground">Cloud Apps</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-red-600">{byCrit.find(([k]) => k === "Critical")?.[1] ?? 0}</p><p className="text-[10px] text-muted-foreground">Critical Apps</p></CardContent></Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-4">
        {/* By Hosting */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4"><CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">By Hosting</CardTitle></CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie data={byHosting.map(([key, count]) => ({ key, count }))} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="count" nameKey="key">
                  {byHosting.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip format={format} />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: "9px" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By Criticality */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4"><CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">By Criticality</CardTitle></CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie data={byCrit.map(([key, count]) => ({ key, count }))} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="count" nameKey="key">
                  {byCrit.map(([k], i) => <Cell key={i} fill={STATUS_COLORS[k] || CHART_COLORS[i]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip format={format} />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: "9px" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By Status */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4"><CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">By Status</CardTitle></CardHeader>
          <CardContent className="p-3">
            <div className="space-y-2 pt-1">
              {byStatus.map(([status, count]) => (
                <div key={status} className="flex items-center gap-2">
                  <StatusBadge status={status} />
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.round((count / filtApps.length) * 100)}%`, backgroundColor: STATUS_COLORS[status] || "#6b7280" }} />
                  </div>
                  <span className="text-[10px] font-semibold w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {["App ID", "Name", "Business", "Category", "Hosting", "Criticality", "Status"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedApps.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No applications found.</td></tr>
                ) : pagedApps.map((a: any) => (
                  <tr key={a.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{a.appId}</td>
                    <td className="px-3 py-2 font-medium max-w-40 truncate">{a.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.business || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.category || "—"}</td>
                    <td className="px-3 py-2">{a.hosting || "—"}</td>
                    <td className="px-3 py-2"><StatusBadge status={a.criticality || "—"} /></td>
                    <td className="px-3 py-2"><StatusBadge status={a.applicationStatus || "Active"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SmallPagination page={page} total={filtApps.length} pageSize={PAGE_SIZE} onChange={p => setPage(p)} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: Roadmap ────────────────────────────────────────────────────────────
function RoadmapTab({ s, filterBU, format, unit }: { s: any; filterBU: string; format: any; unit: string }) {
  const [filterPhase, setFilterPhase] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const filtItems = useMemo(() => {
    return (s.roadmapItems ?? []).filter((r: any) =>
      matchesBU(r.business, filterBU) &&
      (filterPhase === "all" || r.phase === filterPhase) &&
      (filterStatus === "all" || r.status === filterStatus)
    );
  }, [s, filterBU, filterPhase, filterStatus]);

  const pagedItems = filtItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalBudget = filtItems.reduce((s: number, r: any) => s + (r.budgetLakhs ?? 0), 0);
  const completedCount = filtItems.filter((r: any) => r.status === "Completed").length;
  const inProgressCount = filtItems.filter((r: any) => r.status === "In Progress").length;

  const budgetTick = (v: number) =>
    unit === "crores" ? `${(v / 100).toFixed(0)}Cr` : unit === "millions" ? `${(v / 10).toFixed(0)}M` : `${v}L`;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold">{filtItems.length}</p><p className="text-[10px] text-muted-foreground">Initiatives</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-primary">{format(totalBudget, 0)}</p><p className="text-[10px] text-muted-foreground">Total Budget</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-emerald-600">{completedCount}</p><p className="text-[10px] text-muted-foreground">Completed</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-blue-600">{inProgressCount}</p><p className="text-[10px] text-muted-foreground">In Progress</p></CardContent></Card>
      </div>

      {/* Filter row + chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-0 pt-3 px-4"><CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Budget by Phase</CardTitle></CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={165}>
              <BarChart data={s.roadmapByPhase ?? []} margin={{ left: 0, right: 4, top: 14 }}>
                <XAxis dataKey="key" fontSize={8} tickLine={false} axisLine={false} stroke="#9ca3af" tick={{ fontSize: 7 }} />
                <YAxis fontSize={8} tickLine={false} axisLine={false} stroke="#9ca3af" tickFormatter={budgetTick} width={30} />
                <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="budgetLakhs" name="Budget" fill="#d97706" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="budgetLakhs" position="top" fontSize={7} formatter={(v: number) => budgetTick(v)} style={{ fill: "#9ca3af" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-0 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Initiatives</CardTitle>
              <div className="flex gap-1.5">
                <Select value={filterPhase} onValueChange={v => { setFilterPhase(v); setPage(1); }}>
                  <SelectTrigger className="h-6 text-[10px] w-28 bg-background"><SelectValue placeholder="Phase" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Phases</SelectItem>
                    {(s.phases ?? []).map((p: string) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
                  <SelectTrigger className="h-6 text-[10px] w-28 bg-background"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {["Planned","In Progress","Completed","On Hold"].map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {["Initiative","Phase","Status","Priority","Budget","Owner"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedItems.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground text-xs">No initiatives match the filters.</td></tr>
                ) : pagedItems.map((r: any) => (
                  <tr key={r.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-medium max-w-40 truncate">{r.title}</td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground">{r.phase?.split(":")[0] || "—"}</td>
                    <td className="px-3 py-2"><StatusBadge status={r.status || "—"} /></td>
                    <td className="px-3 py-2"><StatusBadge status={r.priority || "—"} /></td>
                    <td className="px-3 py-2 font-semibold text-primary text-[10px]">{r.budgetLakhs ? format(r.budgetLakhs, 1) : "—"}</td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground truncate max-w-24">{r.owner || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SmallPagination page={page} total={filtItems.length} pageSize={PAGE_SIZE} onChange={p => setPage(p)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Checklist ──────────────────────────────────────────────────────────
function ChecklistTab({ s, filterBU }: { s: any; filterBU: string }) {
  const filtChecklist = useMemo(() => {
    const all: any[] = s.checklistByBusiness ?? [];
    return filterBU === "all" ? all : all.filter((b: any) => b.key === filterBU);
  }, [s, filterBU]);

  const total = s.checklistTotal ?? 0;
  const available = s.checklistAvailable ?? 0;
  const pct = total ? Math.round((available / total) * 100) : 0;

  const statusData = s.checklistByStatus ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Total Items" value={total} icon={CheckSquare} iconBg="bg-blue-50 dark:bg-blue-400/10" iconColor="text-blue-600" border="border-blue-400" />
        <KpiCard title="Available" value={available} sub="production ready" icon={CheckCircle2} iconBg="bg-emerald-50 dark:bg-emerald-400/10" iconColor="text-emerald-600" border="border-emerald-400" progress={pct} progressColor="#16a34a" />
        <KpiCard title="Legacy" value={s.checklistLegacy ?? 0} icon={Clock} iconBg="bg-yellow-50 dark:bg-yellow-400/10" iconColor="text-yellow-600" border="border-yellow-400" />
        <KpiCard title="Not Available" value={s.checklistNotAvailable ?? 0} icon={AlertTriangle} iconBg="bg-red-50 dark:bg-red-400/10" iconColor="text-red-600" border="border-red-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie chart */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4"><CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status Distribution</CardTitle></CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="count" nameKey="key">
                  {statusData.map((e: any, i: number) => <Cell key={i} fill={STATUS_COLORS[e.key] || CHART_COLORS[i]} />)}
                </Pie>
                <Tooltip content={(props: any) => props.active && props.payload?.length ? (
                  <div className="bg-card border rounded p-2 text-xs">
                    <p className="font-semibold">{props.payload[0].name}</p>
                    <p>{props.payload[0].value} items</p>
                  </div>
                ) : null} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: "10px" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By BU bars */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4">
            <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              By Business Unit {filterBU !== "all" ? `(${filterBU})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={filtChecklist} layout="vertical" margin={{ left: 0, right: 8 }}>
                <XAxis type="number" fontSize={9} tickLine={false} axisLine={false} stroke="#9ca3af" />
                <YAxis dataKey="key" type="category" fontSize={9} tickLine={false} axisLine={false} width={100} stroke="#9ca3af" />
                <Tooltip content={(props: any) => props.active && props.payload?.length ? (
                  <div className="bg-card border rounded p-2 text-xs">
                    <p className="font-semibold">{props.label}</p>
                    <p>{props.payload[0].value} items</p>
                  </div>
                ) : null} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="count" fill="#16a34a" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Security ───────────────────────────────────────────────────────────
function SecurityTab({ s, format }: { s: any; format: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Total SBOM Entries" value={s.sbomTotal ?? 0} icon={ShieldAlert} iconBg="bg-slate-50 dark:bg-slate-400/10" iconColor="text-slate-600" border="border-slate-400" />
        <KpiCard title="Critical CVEs" value={s.sbomCriticalCves ?? 0} icon={ShieldAlert} iconBg="bg-red-50 dark:bg-red-400/10" iconColor="text-red-600" border="border-red-500" />
        <KpiCard title="High Severity" value={s.sbomHighCves ?? 0} icon={AlertTriangle} iconBg="bg-orange-50 dark:bg-orange-400/10" iconColor="text-orange-600" border="border-orange-400" />
        <KpiCard title="AI Components" value={s.aibomTotal ?? 0} icon={BrainCircuit} iconBg="bg-purple-50 dark:bg-purple-400/10" iconColor="text-purple-600" border="border-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SBOM by risk */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4"><CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">SBOM Risk Distribution</CardTitle></CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={s.sbomByRisk ?? []} margin={{ left: 0, right: 4 }}>
                <XAxis dataKey="key" fontSize={9} tickLine={false} axisLine={false} stroke="#9ca3af" />
                <YAxis fontSize={9} tickLine={false} axisLine={false} stroke="#9ca3af" width={28} />
                <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="count" name="Components" radius={[3, 3, 0, 0]}>
                  {(s.sbomByRisk ?? []).map((e: any, i: number) => <Cell key={i} fill={STATUS_COLORS[e.key] || CHART_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* AIBOM by category */}
        <Card>
          <CardHeader className="pb-0 pt-3 px-4"><CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">AI Components by Category</CardTitle></CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={s.aibomByCategory ?? []} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="count" nameKey="key">
                  {(s.aibomByCategory ?? []).map((e: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip format={format} />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: "10px" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Risk summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {[
          { label: "Total Vulnerabilities", value: (s.sbomCriticalCves ?? 0) + (s.sbomHighCves ?? 0), color: "#dc2626", sub: "Critical + High" },
          { label: "SBOM Coverage", value: `${s.sbomTotal ?? 0}`, color: "#2563eb", sub: "packages tracked" },
          { label: "AI Risk Index", value: `${s.aibomTotal ?? 0}`, color: "#9333ea", sub: "AI components monitored" },
        ].map(item => (
          <Card key={item.label}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${item.color}15` }}>
                <span className="text-lg font-bold" style={{ color: item.color }}>{item.value}</span>
              </div>
              <div>
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="text-[10px] text-muted-foreground">{item.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { format, unit } = useCurrency();

  const [filterBU, setFilterBU] = useState("all");
  const [activeTab, setActiveTab] = useState<DashTab>("overview");

  const s = summary as any;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-5 gap-3">
          {[1,2,3,4,5].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => <Card key={i}><CardContent className="h-48 pt-4"><Skeleton className="h-full w-full" /></CardContent></Card>)}
        </div>
      </div>
    );
  }

  if (!s) return <div className="text-destructive p-4">Failed to load dashboard data.</div>;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* ── Header + Filter + Tabs ─────────────────────── */}
      <div className="flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Executive Dashboard</h1>
            <p className="text-[10px] text-muted-foreground">Ashika Group IT Transformation · Live Programme Overview</p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Business Unit:</span>
            <Select value={filterBU} onValueChange={setFilterBU}>
              <SelectTrigger className="h-7 text-xs w-44 bg-card">
                <SelectValue placeholder="All Business Units" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Business Units</SelectItem>
                {(s?.businessUnits ?? []).map((bu: string) => <SelectItem key={bu} value={bu}>{bu}</SelectItem>)}
              </SelectContent>
            </Select>
            {filterBU !== "all" && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setFilterBU("all")}>
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all -mb-px",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
          {filterBU !== "all" && (
            <Badge variant="secondary" className="ml-auto text-[10px] px-2">
              Filtered: {filterBU}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === "overview" && <OverviewTab s={s} filterBU={filterBU} format={format} unit={unit} />}
        {activeTab === "applications" && <ApplicationsTab filterBU={filterBU} format={format} />}
        {activeTab === "roadmap" && <RoadmapTab s={s} filterBU={filterBU} format={format} unit={unit} />}
        {activeTab === "checklist" && <ChecklistTab s={s} filterBU={filterBU} />}
        {activeTab === "security" && <SecurityTab s={s} format={format} />}
      </div>
    </div>
  );
}
