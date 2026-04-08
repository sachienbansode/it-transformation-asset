import React, { useState, useMemo } from "react";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid,
} from "recharts";
import {
  Server, Archive, CheckSquare, IndianRupee, ShieldAlert, BrainCircuit,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Filter, X,
  Map, Circle,
} from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const CHART_COLORS = ["#eab308", "#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#f97316", "#06b6d4", "#ec4899"];

const STATUS_COLORS: Record<string, string> = {
  Available: "#22c55e",
  "Not Available": "#ef4444",
  Legacy: "#eab308",
  Completed: "#22c55e",
  "In Progress": "#3b82f6",
  Planned: "#a855f7",
  "On Hold": "#f97316",
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#22c55e",
  None: "#6b7280",
};

type DetailKey = null | "checklist" | "roadmap" | "apps" | "retirements" | "sbom" | "aibom";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  subtext2?: string;
  icon: React.ElementType;
  iconColor?: string;
  bgColor?: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  progressPct?: number;
  progressColor?: string;
  expandKey: DetailKey;
  expanded: boolean;
  onToggle: () => void;
  danger?: boolean;
}

function KpiCard({ title, value, subtext, subtext2, icon: Icon, iconColor, bgColor, progressPct, progressColor, expandKey, expanded, onToggle, danger }: KpiCardProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 border",
        expanded ? "ring-2 ring-primary/40 border-primary/30 shadow-md" : "hover:border-border/80",
        danger && !expanded ? "border-destructive/20 bg-destructive/5" : ""
      )}
      onClick={onToggle}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
            <p className={cn("text-2xl font-bold", danger ? "text-destructive" : "text-foreground")}>{value}</p>
            {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
            {subtext2 && <p className="text-xs text-muted-foreground">{subtext2}</p>}
          </div>
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", bgColor || "bg-muted/60")}>
            <Icon className={cn("h-4.5 w-4.5", iconColor || "text-muted-foreground")} />
          </div>
        </div>
        {progressPct !== undefined && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Progress</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, backgroundColor: progressColor || "hsl(var(--primary))" }}
              />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-muted-foreground/60">{expanded ? "Click to collapse" : "Click to drill down"}</span>
          {expanded ? <ChevronUp className="h-3 w-3 text-primary" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/40" />}
        </div>
      </CardContent>
    </Card>
  );
}

function CustomTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {typeof p.value === "number" && p.name?.toLowerCase().includes("budget")
            ? currency(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { format, unit } = useCurrency();
  const [expanded, setExpanded] = useState<DetailKey>(null);
  const [filterBusiness, setFilterBusiness] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const toggle = (key: DetailKey) => setExpanded(prev => (prev === key ? null : key));

  const hasFilters = filterBusiness !== "all" || filterPhase !== "all" || filterStatus !== "all";
  const clearFilters = () => { setFilterBusiness("all"); setFilterPhase("all"); setFilterStatus("all"); };

  const filteredChecklist = useMemo(() => {
    if (!summary) return [];
    return (summary.checklistByBusiness ?? [])
      .filter(b => filterBusiness === "all" || b.key === filterBusiness);
  }, [summary, filterBusiness]);

  const filteredRoadmap = useMemo(() => {
    if (!summary) return [];
    return (summary.roadmapByPhase ?? [])
      .filter(p => filterPhase === "all" || p.key === filterPhase);
  }, [summary, filterPhase]);

  const filteredRoadmapItems = useMemo(() => {
    if (!summary) return [];
    const items = (summary as any).roadmapItems ?? [];
    return items.filter((r: any) =>
      (filterPhase === "all" || r.phase === filterPhase) &&
      (filterStatus === "all" || r.status === filterStatus)
    );
  }, [summary, filterPhase, filterStatus]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <Card key={i}><CardContent className="h-72 pt-6"><Skeleton className="h-full w-full" /></CardContent></Card>)}
        </div>
      </div>
    );
  }

  if (!summary) return <div className="text-destructive p-6">Failed to load dashboard summary.</div>;

  const s = summary as any;

  return (
    <div className="space-y-6">

      {/* ─── Page Title + Filters ───────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Executive Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Live overview of Ashika Group IT transformation programme</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

          <Select value={filterBusiness} onValueChange={setFilterBusiness}>
            <SelectTrigger className="h-8 text-xs w-40 bg-card">
              <SelectValue placeholder="Business Unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Business Units</SelectItem>
              {((s as any).businessUnits || []).map((b: string) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterPhase} onValueChange={setFilterPhase}>
            <SelectTrigger className="h-8 text-xs w-36 bg-card">
              <SelectValue placeholder="Phase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Phases</SelectItem>
              {((s as any).phases || []).map((p: string) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-xs w-36 bg-card">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["Planned","In Progress","Completed","On Hold"].map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* ─── KPI Cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          expandKey="checklist" expanded={expanded === "checklist"} onToggle={() => toggle("checklist")}
          title="Checklist Items" value={s.checklistTotal}
          subtext={`${s.checklistAvailable} Available · ${s.checklistLegacy} Legacy`}
          icon={CheckSquare} iconColor="text-emerald-400" bgColor="bg-emerald-400/10"
          progressPct={s.checklistCompletionPct} progressColor="#22c55e"
        />
        <KpiCard
          expandKey="roadmap" expanded={expanded === "roadmap"} onToggle={() => toggle("roadmap")}
          title="Transformation Budget" value={format(s.roadmapBudgetLakhs, 0)}
          subtext={`${s.roadmapTotal} initiatives`}
          subtext2={`${s.roadmapCompletedItems} completed`}
          icon={IndianRupee} iconColor="text-primary" bgColor="bg-primary/10"
        />
        <KpiCard
          expandKey="apps" expanded={expanded === "apps"} onToggle={() => toggle("apps")}
          title="Application Inventory" value={s.totalApplications}
          subtext="Active applications tracked"
          icon={Server} iconColor="text-blue-400" bgColor="bg-blue-400/10"
        />
        <KpiCard
          expandKey="retirements" expanded={expanded === "retirements"} onToggle={() => toggle("retirements")}
          title="App Retirements" value={s.appsToRetire}
          subtext={`${s.appsRetired ?? 0} already retired`}
          icon={Archive} iconColor="text-orange-400" bgColor="bg-orange-400/10"
        />
        <KpiCard
          expandKey="sbom" expanded={expanded === "sbom"} onToggle={() => toggle("sbom")}
          title="Critical CVEs" value={s.sbomCriticalCves}
          subtext={`${s.sbomHighCves} High severity`}
          subtext2={`${s.sbomTotal} total SBOM entries`}
          icon={ShieldAlert} iconColor="text-destructive" bgColor="bg-destructive/10"
          danger={s.sbomCriticalCves > 0}
        />
        <KpiCard
          expandKey="aibom" expanded={expanded === "aibom"} onToggle={() => toggle("aibom")}
          title="AI Components" value={s.aibomTotal}
          subtext="AI Bill of Materials"
          icon={BrainCircuit} iconColor="text-purple-400" bgColor="bg-purple-400/10"
        />
      </div>

      {/* ─── Drill-Down Panels ──────────────────────── */}
      {expanded === "checklist" && (
        <Card className="border-primary/20 shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><CheckSquare className="h-4 w-4 text-emerald-400" />Checklist Drill-Down</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(null)}><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">Status Distribution</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={s.checklistByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="count" nameKey="key">
                      {s.checklistByStatus.map((entry: any, i: number) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.key] || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip currency={format} />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">By Business Unit {filterBusiness !== "all" && `— ${filterBusiness}`}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={filteredChecklist} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="#888" />
                    <YAxis dataKey="key" type="category" fontSize={10} tickLine={false} axisLine={false} width={90} stroke="#888" />
                    <Tooltip content={<CustomTooltip currency={format} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="count" fill="#22c55e" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {expanded === "roadmap" && (
        <Card className="border-primary/20 shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Map className="h-4 w-4 text-primary" />Roadmap Drill-Down</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(null)}><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">Budget by Phase ({unit === "crores" ? "₹ Cr" : unit === "millions" ? "₹ M" : "₹ L"})</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={filteredRoadmap} margin={{ left: 0, right: 8 }}>
                    <XAxis dataKey="key" fontSize={10} tickLine={false} axisLine={false} stroke="#888" />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#888"
                      tickFormatter={v => unit === "crores" ? `₹${(v/100).toFixed(0)}Cr` : unit === "millions" ? `₹${(v/10).toFixed(0)}M` : `₹${v}L`}
                    />
                    <Tooltip content={<CustomTooltip currency={(v: number) => format(v, 1)} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="budgetLakhs" name="Budget" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">Status Distribution</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={s.roadmapByStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} dataKey="count" nameKey="key">
                      {s.roadmapByStatus.map((entry: any, i: number) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.key] || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip currency={format} />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            {filteredRoadmapItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  Initiatives {filterPhase !== "all" || filterStatus !== "all" ? `(filtered: ${filteredRoadmapItems.length})` : `(all ${filteredRoadmapItems.length})`}
                </p>
                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>{["Initiative", "Phase", "Status", "Priority", "Budget", "Owner"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-muted-foreground font-medium">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {filteredRoadmapItems.slice(0, 10).map((r: any) => (
                        <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium max-w-48 truncate">{r.title}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.phase}</td>
                          <td className="px-3 py-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: (STATUS_COLORS[r.status] || "#888") + "20", color: STATUS_COLORS[r.status] || "#888" }}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{r.priority || "-"}</td>
                          <td className="px-3 py-2 font-medium text-primary">{r.budgetLakhs ? format(r.budgetLakhs, 1) : "-"}</td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-32">{r.owner || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredRoadmapItems.length > 10 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/20">
                      Showing 10 of {filteredRoadmapItems.length}. Use the Roadmap module for the full view.
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {expanded === "apps" && (
        <Card className="border-primary/20 shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Server className="h-4 w-4 text-blue-400" />Application Inventory Drill-Down</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(null)}><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-semibold text-muted-foreground mb-3">By Lifecycle Stage</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={s.appsByLifecycle} margin={{ left: 8 }}>
                <XAxis dataKey="key" fontSize={10} tickLine={false} axisLine={false} stroke="#888" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#888" />
                <Tooltip content={<CustomTooltip currency={format} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {expanded === "retirements" && (
        <Card className="border-primary/20 shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Archive className="h-4 w-4 text-orange-400" />Retirement Plan Drill-Down</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(null)}><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">Retirement Status Breakdown</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={s.retirementsByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="count" nameKey="key">
                      {s.retirementsByStatus.map((entry: any, i: number) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.key] || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip currency={format} />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">Upcoming Retirements</p>
                <div className="space-y-2">
                  {((s as any).retirementItems ?? []).filter((r: any) => r.status !== "Completed").slice(0, 8).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                      <div>
                        <p className="text-xs font-medium">{r.appName}</p>
                        {r.reason && <p className="text-[10px] text-muted-foreground">{r.reason}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {r.retirementDate && <span className="text-[10px] text-muted-foreground">{new Date(r.retirementDate).toLocaleDateString("en-IN")}</span>}
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: (STATUS_COLORS[r.status] || "#888") + "20", color: STATUS_COLORS[r.status] || "#888" }}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {expanded === "sbom" && (
        <Card className="border-destructive/20 shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-destructive" />Security Vulnerabilities Drill-Down</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(null)}><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">CVE Risk Distribution</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={s.sbomByRisk} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="count" nameKey="key">
                      {s.sbomByRisk.map((entry: any, i: number) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.key] || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip currency={format} />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">Summary</p>
                {[
                  { label: "Critical CVEs", value: s.sbomCriticalCves, color: "#ef4444" },
                  { label: "High Severity", value: s.sbomHighCves, color: "#f97316" },
                  { label: "Total SBOM Entries", value: s.sbomTotal, color: "#6b7280" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className="text-lg font-bold" style={{ color: item.color }}>{item.value}</span>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">Refer to Software BOM module for full CVE list and remediation plan.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {expanded === "aibom" && (
        <Card className="border-purple-500/20 shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-purple-400" />AI Components Drill-Down</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(null)}><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-semibold text-muted-foreground mb-3">AI Components by Category</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={s.aibomByCategory} margin={{ left: 8 }}>
                <XAxis dataKey="key" fontSize={10} tickLine={false} axisLine={false} stroke="#888" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#888" />
                <Tooltip content={<CustomTooltip currency={format} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" fill="#a855f7" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ─── Always-visible Charts ──────────────────── */}
      {expanded === null && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Checklist Status Donut */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Checklist Status</CardTitle>
            </CardHeader>
            <CardContent className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={s.checklistByStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} dataKey="count" nameKey="key">
                    {s.checklistByStatus.map((entry: any, i: number) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.key] || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip currency={format} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Budget by Phase */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Budget by Phase {unit === "crores" ? "(₹ Cr)" : unit === "millions" ? "(₹ M)" : "(₹ L)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredRoadmap} margin={{ left: 0 }}>
                  <XAxis dataKey="key" fontSize={10} tickLine={false} axisLine={false} stroke="#888" />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#888"
                    tickFormatter={v => unit === "crores" ? `${(v/100).toFixed(0)}Cr` : unit === "millions" ? `${(v/10).toFixed(0)}M` : `${v}L`}
                  />
                  <Tooltip content={<CustomTooltip currency={(v: number) => format(v, 1)} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="budgetLakhs" name="Budget" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Roadmap Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Roadmap Status</CardTitle>
            </CardHeader>
            <CardContent className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={s.roadmapByStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} dataKey="count" nameKey="key">
                    {s.roadmapByStatus.map((entry: any, i: number) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.key] || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip currency={format} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Checklist by Business Unit */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Checklist by Business Unit</CardTitle>
            </CardHeader>
            <CardContent className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredChecklist} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="#888" />
                  <YAxis dataKey="key" type="category" fontSize={10} tickLine={false} axisLine={false} width={95} stroke="#888" />
                  <Tooltip content={<CustomTooltip currency={format} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Security Risk */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Security Risk Levels</CardTitle>
            </CardHeader>
            <CardContent className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={s.sbomByRisk} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} dataKey="count" nameKey="key">
                    {s.sbomByRisk.map((entry: any, i: number) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.key] || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip currency={format} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
