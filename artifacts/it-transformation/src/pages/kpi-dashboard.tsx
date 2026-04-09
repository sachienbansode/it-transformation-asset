import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target, CheckCircle2, XCircle, Clock, TrendingUp, Users, FileText,
  AlertTriangle, BarChart3, ClipboardList, ChevronRight, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface KpiSet {
  id: number; personId: number; yearId: number; status: string;
  notes?: string; submittedAt?: string; approvedAt?: string; itemCount?: number;
  createdAt: string; updatedAt: string;
}
interface KpiPerson {
  id: number; name: string; designation: string; department?: string;
  email?: string; employeeCode?: string; isActive: boolean;
}
interface KpiYear { id: number; label: string; isCurrent: boolean; }

// ─── Status helpers ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  "Draft":           { label: "Draft",           color: "text-gray-500",         bg: "bg-gray-500/10",         icon: <FileText className="h-4 w-4" /> },
  "Pending":         { label: "Pending Review",  color: "text-yellow-600",       bg: "bg-yellow-500/10",       icon: <Clock className="h-4 w-4" /> },
  "Approved":        { label: "Approved",         color: "text-green-600",        bg: "bg-green-500/10",        icon: <CheckCircle2 className="h-4 w-4" /> },
  "Approved - Partial": { label: "Part. Approved", color: "text-blue-600",        bg: "bg-blue-500/10",         icon: <CheckCircle2 className="h-4 w-4" /> },
  "Rejected - All":  { label: "Rejected",         color: "text-red-600",          bg: "bg-red-500/10",          icon: <XCircle className="h-4 w-4" /> },
  "Archived":        { label: "Archived",         color: "text-muted-foreground", bg: "bg-muted/30",            icon: <FileText className="h-4 w-4" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: "text-muted-foreground", bg: "bg-muted/20", icon: null };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium", cfg.color, cfg.bg)}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ title, value, sub, icon, color = "text-primary" }: {
  title: string; value: number | string; sub?: string;
  icon: React.ReactNode; color?: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            <p className={cn("text-3xl font-bold mt-1", color)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={cn("p-2.5 rounded-xl", color.replace("text-", "bg-").replace("-600", "-100").replace("-500", "-100").replace("text-primary", "bg-primary/10"))}>
            <span className={color}>{icon}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Department Summary Row ────────────────────────────────────────────────────
function DeptSummaryRow({ dept, sets, persons }: {
  dept: string; sets: KpiSet[]; persons: KpiPerson[];
}) {
  const total = sets.length;
  const approved = sets.filter(s => s.status === "Approved" || s.status === "Approved - Partial").length;
  const pending = sets.filter(s => s.status === "Pending").length;
  const draft = sets.filter(s => s.status === "Draft").length;
  const rejected = sets.filter(s => s.status === "Rejected - All").length;
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  return (
    <tr className="border-b border-border/50 hover:bg-muted/20">
      <td className="px-4 py-2.5 font-medium text-sm">{dept}</td>
      <td className="px-4 py-2.5 text-center text-sm">{total}</td>
      <td className="px-4 py-2.5 text-center"><span className="text-green-600 font-semibold">{approved}</span></td>
      <td className="px-4 py-2.5 text-center"><span className="text-yellow-600 font-semibold">{pending}</span></td>
      <td className="px-4 py-2.5 text-center"><span className="text-gray-500 font-semibold">{draft}</span></td>
      <td className="px-4 py-2.5 text-center"><span className="text-red-600 font-semibold">{rejected}</span></td>
      <td className="px-4 py-2.5 text-center">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
        </div>
      </td>
    </tr>
  );
}

// ─── Employee Own Set View ────────────────────────────────────────────────────
function MyKpiView({ sets, persons, years }: { sets: KpiSet[]; persons: KpiPerson[]; years: KpiYear[] }) {
  const [, navigate] = useLocation();
  if (!sets.length) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="py-12 text-center">
          <Target className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No KPI sets assigned yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Contact your HR or manager to set up your KPI framework.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {sets.map(s => {
        const year = years.find(y => y.id === s.yearId);
        return (
          <Card key={s.id} className="border-border/60 hover:border-primary/30 transition-colors cursor-pointer"
            onClick={() => navigate("/kpis")}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{year?.label || "—"}</span>
                    {year?.isCurrent && <Badge variant="outline" className="text-[10px] h-4 px-1 border-primary/40 text-primary">Current Year</Badge>}
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-3">
                    <span><span className="font-medium">{s.itemCount ?? 0}</span> KPIs</span>
                    {s.submittedAt && <span>Submitted {new Date(s.submittedAt).toLocaleDateString("en-IN")}</span>}
                    {s.approvedAt && <span>Approved {new Date(s.approvedAt).toLocaleDateString("en-IN")}</span>}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mt-1" />
              </div>
              {/* Progress bar for actuals */}
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all",
                    s.status === "Approved" ? "bg-green-500 w-full" :
                    s.status === "Approved - Partial" ? "bg-blue-500 w-3/4" :
                    s.status === "Pending" ? "bg-yellow-500 w-1/2" :
                    s.status === "Draft" ? "bg-gray-400 w-1/4" : "bg-red-500 w-full"
                  )} />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {s.status === "Approved" ? "Complete" : s.status === "Draft" ? "Draft" : "In Progress"}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/kpis")}>
        <ClipboardList className="h-3.5 w-3.5 mr-1.5" />Open KPI Management
      </Button>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function KpiDashboard() {
  const { user, isCxo, isEmployee, isHR } = useAuth();
  const [, navigate] = useLocation();

  const { data: sets = [], isLoading: setsLoading } = useQuery({
    queryKey: ["kpi-sets-dashboard"],
    queryFn: () => apiFetch<KpiSet[]>("/kpi-sets"),
  });
  const { data: persons = [] } = useQuery({
    queryKey: ["kpi-persons"],
    queryFn: () => apiFetch<KpiPerson[]>("/kpi-persons"),
  });
  const { data: years = [] } = useQuery({
    queryKey: ["kpi-years"],
    queryFn: () => apiFetch<KpiYear[]>("/kpi-years"),
  });

  // Stats
  const totalSets = sets.length;
  const approvedSets = sets.filter(s => s.status === "Approved" || s.status === "Approved - Partial").length;
  const pendingSets = sets.filter(s => s.status === "Pending").length;
  const draftSets = sets.filter(s => s.status === "Draft").length;
  const rejectedSets = sets.filter(s => s.status === "Rejected - All").length;

  // Group by department for CXO/HR view
  const byDept = useMemo(() => {
    const map = new Map<string, KpiSet[]>();
    for (const s of sets) {
      const person = persons.find(p => p.id === s.personId);
      const dept = person?.department || "Unknown";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sets, persons]);

  const completionRate = totalSets > 0 ? Math.round((approvedSets / totalSets) * 100) : 0;

  const isKpiView = isCxo || isHR;
  const roleLabel = isCxo ? "CXO View" : isHR ? "HR View" : "My KPIs";

  if (setsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">KPI Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isCxo && `Department performance overview — ${user?.department || "your department"}`}
            {isHR && "Organisation-wide KPI tracking"}
            {isEmployee && "Your KPI sets and performance"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{roleLabel}</Badge>
          <Button size="sm" variant="outline" onClick={() => navigate("/kpis")}>
            <ClipboardList className="h-3.5 w-3.5 mr-1.5" />KPI Management
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      {(isKpiView) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Sets" value={totalSets} sub="Across all personnel"
            icon={<Target className="h-5 w-5" />} color="text-primary" />
          <StatCard title="Approved" value={approvedSets} sub={`${completionRate}% completion rate`}
            icon={<CheckCircle2 className="h-5 w-5" />} color="text-green-600" />
          <StatCard title="Pending Review" value={pendingSets} sub="Awaiting approval"
            icon={<Clock className="h-5 w-5" />} color="text-yellow-600" />
          <StatCard title="Draft / Rejected" value={draftSets + rejectedSets} sub="Need attention"
            icon={<AlertTriangle className="h-5 w-5" />} color="text-red-600" />
        </div>
      )}

      {isEmployee && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard title="My KPI Sets" value={totalSets} icon={<Target className="h-5 w-5" />} />
          <StatCard title="Approved" value={approvedSets} icon={<CheckCircle2 className="h-5 w-5" />} color="text-green-600" />
          <StatCard title="In Progress" value={pendingSets + draftSets} icon={<Activity className="h-5 w-5" />} color="text-yellow-600" />
        </div>
      )}

      {/* Status Distribution (CXO/HR) */}
      {isKpiView && totalSets > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Status bar chart */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />Status Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Approved", count: approvedSets, color: "bg-green-500", total: totalSets },
                { label: "Pending Review", count: pendingSets, color: "bg-yellow-500", total: totalSets },
                { label: "Draft", count: draftSets, color: "bg-gray-400", total: totalSets },
                { label: "Rejected", count: rejectedSets, color: "bg-red-500", total: totalSets },
              ].map(({ label, count, color, total }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{label}</span>
                    <span className="font-medium text-foreground">{count} <span className="text-muted-foreground">/ {total}</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", color)}
                      style={{ width: total > 0 ? `${(count / total) * 100}%` : "0%" }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Overall completion */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />Overall Completion
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-4">
              <div className="relative h-28 w-28">
                <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/40" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10"
                    className="text-primary transition-all"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - completionRate / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold">{completionRate}%</span>
                  <span className="text-[10px] text-muted-foreground">Complete</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">{approvedSets} of {totalSets} sets approved</p>
                <p className="text-xs text-muted-foreground">{persons.length} employees tracked</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Department Breakdown (CXO/HR) */}
      {isKpiView && byDept.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />Department-wise KPI Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["Department","Total","Approved","Pending","Draft","Rejected","Progress"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byDept.map(([dept, deptSets]) => (
                    <DeptSummaryRow key={dept} dept={dept} sets={deptSets} persons={persons} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employee own sets */}
      {isEmployee && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />My KPI Sets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MyKpiView sets={sets} persons={persons} years={years} />
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card className="border-border/60 bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Go to KPI Management</p>
              <p className="text-xs text-muted-foreground">View, upload, and manage KPI sets in detail</p>
            </div>
            <Button onClick={() => navigate("/kpis")} size="sm">
              <Target className="h-3.5 w-3.5 mr-1.5" />Open KPIs
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
