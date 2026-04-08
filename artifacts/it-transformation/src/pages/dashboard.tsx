import React, { useState, useMemo } from "react";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, AreaChart, Area, CartesianGrid,
} from "recharts";
import {
  Server, Archive, CheckSquare, IndianRupee, ShieldAlert, BrainCircuit,
  ChevronDown, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  Filter, X, ArrowUpRight, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

// ─── Constants ─────────────────────────────────────────────────────────────
const CHART_COLORS = ["#d97706", "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2", "#db2777"];
const STATUS_COLORS: Record<string, string> = {
  Available: "#16a34a", "Not Available": "#dc2626", Legacy: "#d97706", Partial: "#ea580c",
  Completed: "#16a34a", "In Progress": "#2563eb", Planned: "#9333ea", "On Hold": "#ea580c",
  Critical: "#dc2626", High: "#ea580c", Medium: "#d97706", Low: "#16a34a", None: "#9ca3af",
};
const PAGE_SIZE = 8;

function useBusinessUnits() {
  return useQuery({
    queryKey: ["business-units"],
    queryFn: () => apiFetch<{ id: number; name: string; code: string }[]>("/business-units"),
  });
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricCard({
  title, value, sub, icon: Icon, iconBg, iconColor, border, progress, progressColor,
}: {
  title: string; value: string | number; sub?: string; icon: React.ElementType;
  iconBg?: string; iconColor?: string; border?: string; progress?: number; progressColor?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden", border ? `border-l-4 ${border}` : "")}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{title}</p>
            <p className="text-3xl font-bold text-foreground leading-none">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
          </div>
          <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0", iconBg || "bg-muted")}>
            <Icon className={cn("h-5 w-5", iconColor || "text-muted-foreground")} />
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
              <span>Completion</span><span className="font-semibold">{progress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: progressColor || "#16a34a" }} />
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
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs">
      {label && <p className="font-semibold text-foreground mb-1.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">
            {p.name?.toLowerCase().includes("budget") ? format(p.value, 1) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-2 py-3 border-t border-border">
      <span className="text-xs text-muted-foreground">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
          const p = page <= 3 ? i + 1 : page + i - 2;
          if (p < 1 || p > pages) return null;
          return (
            <Button key={p} variant={p === page ? "default" : "ghost"} size="icon" className="h-7 w-7 text-xs" onClick={() => onChange(p)}>
              {p}
            </Button>
          );
        })}
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === pages} onClick={() => onChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium"
      style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}30` }}
    >
      {status}
    </span>
  );
}

// ─── Chart View Tabs ─────────────────────────────────────────────────────────
type ChartView = "checklist" | "roadmap" | "security";

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: businessUnits } = useBusinessUnits();
  const { format, unit } = useCurrency();

  const [filterBUs, setFilterBUs] = useState<string[]>([]);
  const [filterPhase, setFilterPhase] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [chartView, setChartView] = useState<ChartView>("checklist");
  const [tablePage, setTablePage] = useState(1);

  const s = summary as any;
  const hasFilters = filterBUs.length > 0 || filterPhase !== "all" || filterStatus !== "all";

  const toggleBU = (code: string) => {
    setFilterBUs(prev => prev.includes(code) ? prev.filter(b => b !== code) : [...prev, code]);
    setTablePage(1);
  };
  const clearFilters = () => { setFilterBUs([]); setFilterPhase("all"); setFilterStatus("all"); setTablePage(1); };

  // Filtered roadmap items for the table
  const filteredItems = useMemo(() => {
    if (!s) return [];
    return (s.roadmapItems ?? []).filter((r: any) =>
      (filterPhase === "all" || r.phase === filterPhase) &&
      (filterStatus === "all" || r.status === filterStatus)
    );
  }, [s, filterPhase, filterStatus]);

  // Filtered checklist by business
  const filteredChecklist = useMemo(() => {
    if (!s) return [];
    if (filterBUs.length === 0) return s.checklistByBusiness ?? [];
    return (s.checklistByBusiness ?? []).filter((b: any) => filterBUs.includes(b.key));
  }, [s, filterBUs]);

  const pagedItems = filteredItems.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[1,2,3,4,5].map(i => <Card key={i}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>)}
        </div>
        <div className="grid grid-cols-3 gap-6">
          {[1,2,3].map(i => <Card key={i}><CardContent className="h-64 pt-6"><Skeleton className="h-full w-full" /></CardContent></Card>)}
        </div>
      </div>
    );
  }

  if (!s) return <div className="text-destructive">Failed to load dashboard.</div>;

  // Budget formatter for YAxis
  const budgetTick = (v: number) =>
    unit === "crores" ? `${(v / 100).toFixed(0)}Cr`
    : unit === "millions" ? `${(v / 10).toFixed(0)}M`
    : `${v}L`;

  return (
    <div className="space-y-5">

      {/* ─── Page Header ─────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Executive Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Ashika Group IT Transformation Programme — Live Overview</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-medium text-muted-foreground mr-1">Business Unit:</span>
          {(businessUnits ?? []).map(bu => (
            <button
              key={bu.code}
              onClick={() => toggleBU(bu.code)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium border transition-all",
                filterBUs.includes(bu.code)
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              )}
            >
              {bu.name}
            </button>
          ))}
          <div className="h-4 w-px bg-border mx-1" />
          <Select value={filterPhase} onValueChange={v => { setFilterPhase(v); setTablePage(1); }}>
            <SelectTrigger className="h-7 text-xs w-32 bg-background">
              <SelectValue placeholder="Phase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Phases</SelectItem>
              {(s.phases ?? []).map((p: string) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setTablePage(1); }}>
            <SelectTrigger className="h-7 text-xs w-32 bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["Planned", "In Progress", "Completed", "On Hold"].map(st =>
                <SelectItem key={st} value={st}>{st}</SelectItem>
              )}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs ml-auto gap-1" onClick={clearFilters}>
              <X className="h-3 w-3" /> Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* ─── KPI Metrics ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Checklist Items" value={s.checklistTotal}
          sub={`${s.checklistAvailable} available · ${s.checklistLegacy} legacy`}
          icon={CheckSquare} iconBg="bg-emerald-50 dark:bg-emerald-400/10" iconColor="text-emerald-600 dark:text-emerald-400"
          border="border-emerald-400"
          progress={s.checklistCompletionPct} progressColor="#16a34a"
        />
        <MetricCard
          title="Total Budget" value={format(s.roadmapBudgetLakhs, 0)}
          sub={`${s.roadmapTotal} initiatives · ${s.roadmapCompletedItems} completed`}
          icon={IndianRupee} iconBg="bg-yellow-50 dark:bg-yellow-400/10" iconColor="text-yellow-600 dark:text-yellow-500"
          border="border-yellow-400"
        />
        <MetricCard
          title="Applications" value={s.totalApplications}
          sub="In application inventory"
          icon={Server} iconBg="bg-blue-50 dark:bg-blue-400/10" iconColor="text-blue-600 dark:text-blue-400"
          border="border-blue-400"
        />
        <MetricCard
          title="Pending Retirements" value={s.appsToRetire}
          sub={`${s.appsRetired ?? 0} already retired`}
          icon={Archive} iconBg="bg-orange-50 dark:bg-orange-400/10" iconColor="text-orange-600 dark:text-orange-400"
          border="border-orange-400"
        />
        <MetricCard
          title="Critical CVEs" value={s.sbomCriticalCves}
          sub={`${s.sbomHighCves} high severity · ${s.sbomTotal} total entries`}
          icon={ShieldAlert} iconBg="bg-red-50 dark:bg-red-400/10" iconColor="text-red-600 dark:text-red-400"
          border="border-red-500"
        />
      </div>

      {/* ─── Chart Section with Tabs ──────────────────────── */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Analytics</CardTitle>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["checklist", "roadmap", "security"] as ChartView[]).map(v => (
                <button
                  key={v}
                  onClick={() => setChartView(v)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    chartView === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {chartView === "checklist" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">Status Distribution</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={s.checklistByStatus ?? []} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="count" nameKey="key">
                      {(s.checklistByStatus ?? []).map((e: any, i: number) => <Cell key={i} fill={STATUS_COLORS[e.key] || CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip format={format} />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">
                  By Business Unit {filterBUs.length > 0 ? `(filtered: ${filterBUs.join(", ")})` : ""}
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={filteredChecklist} layout="vertical" margin={{ left: 0, right: 12 }}>
                    <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af" />
                    <YAxis dataKey="key" type="category" fontSize={10} tickLine={false} axisLine={false} width={80} stroke="#9ca3af" />
                    <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="count" fill="#16a34a" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {chartView === "roadmap" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">Budget by Phase ({unit === "crores" ? "₹ Cr" : unit === "millions" ? "₹ M" : "₹ L"})</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={s.roadmapByPhase ?? []} margin={{ left: 0 }}>
                    <XAxis dataKey="key" fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af" />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af" tickFormatter={budgetTick} />
                    <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="budgetLakhs" name="Budget" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">Status Breakdown</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={s.roadmapByStatus ?? []} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="count" nameKey="key">
                      {(s.roadmapByStatus ?? []).map((e: any, i: number) => <Cell key={i} fill={STATUS_COLORS[e.key] || CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip format={format} />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {chartView === "security" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <p className="text-xs font-semibold text-muted-foreground mb-3">Risk Level Distribution</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={s.sbomByRisk ?? []} margin={{ left: 0 }}>
                    <XAxis dataKey="key" fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af" />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af" />
                    <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="count" name="CVEs" fill="#dc2626" radius={[4, 4, 0, 0]}>
                      {(s.sbomByRisk ?? []).map((e: any, i: number) => <Cell key={i} fill={STATUS_COLORS[e.key] || CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">Security Summary</p>
                {[
                  { label: "Critical CVEs", value: s.sbomCriticalCves, color: "#dc2626" },
                  { label: "High Severity", value: s.sbomHighCves, color: "#ea580c" },
                  { label: "Total SBOM Entries", value: s.sbomTotal, color: "#6b7280" },
                  { label: "AI Components", value: s.aibomTotal, color: "#9333ea" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className="text-xl font-bold" style={{ color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Roadmap Initiatives Table ──────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Roadmap Initiatives
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {filteredItems.length} {hasFilters ? "filtered" : "total"}
              </span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border bg-muted/40">
                  {["Initiative", "Phase", "Status", "Priority", "Budget", "Owner"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedItems.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No initiatives found. Try adjusting filters.</td></tr>
                ) : pagedItems.map((r: any) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium max-w-56 truncate">{r.title}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.phase || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status || "—"} /></td>
                    <td className="px-4 py-3"><StatusBadge status={r.priority || "—"} /></td>
                    <td className="px-4 py-3 font-semibold text-primary">{r.budgetLakhs ? format(r.budgetLakhs, 1) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-28 truncate">{r.owner || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={tablePage} total={filteredItems.length} pageSize={PAGE_SIZE} onChange={setTablePage} />
        </CardContent>
      </Card>
    </div>
  );
}
