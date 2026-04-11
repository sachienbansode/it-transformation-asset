import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch, API } from "@/lib/api";
import { AlertTriangle, Bug, GitBranch, CheckCircle2, Clock, BookOpen, FileText, Shield, Headphones, TrendingDown, Timer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, RadialBarChart, RadialBar } from "recharts";
import { useLocation } from "wouter";

const COLORS = ["#dc2626", "#ea580c", "#d4a843", "#059669", "#2563eb", "#8b5cf6", "#0f766e"];
const PRIORITY_COLORS: Record<string, string> = { Critical: "#dc2626", High: "#ea580c", Medium: "#d4a843", Low: "#2563eb" };

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

  const openIncidents = incidents.filter((i: any) => i.status === "Open").length;
  const inProgressIncidents = incidents.filter((i: any) => i.status === "In Progress").length;
  const resolvedIncidents = incidents.filter((i: any) => i.status === "Resolved" || i.status === "Closed").length;
  const criticalIncidents = incidents.filter((i: any) => i.priority === "Critical" && i.status !== "Closed" && i.status !== "Resolved").length;
  const pendingChanges = changes.filter((c: any) => c.approvalStatus === "Pending").length;
  const activeProblems = problems.filter((p: any) => p.status !== "Closed").length;

  const statusData = incidentStats?.byStatus?.map((s: any) => ({ name: s.status, value: s.count })) || [];
  const priorityData = incidentStats?.byPriority?.map((p: any) => ({ name: p.priority, value: p.count, fill: PRIORITY_COLORS[p.priority] || "#999" })) || [];

  const recentIncidents = [...incidents].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ITSM Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome, {user?.name || "User"} — IT Service Management Overview</p>
        </div>
        <Button variant="outline" onClick={() => window.open(`${API}/export/itsm-doc`, "_blank")} className="gap-2">
          <FileText className="w-4 h-4" />Export Report
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={AlertTriangle} label="Open Incidents" value={openIncidents} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" sub={criticalIncidents > 0 ? `${criticalIncidents} critical` : undefined} />
        <StatCard icon={Timer} label="In Progress" value={inProgressIncidents} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={CheckCircle2} label="Resolved" value={resolvedIncidents} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={Bug} label="Active Problems" value={activeProblems} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600" borderColor="border-l-violet-500" />
        <StatCard icon={GitBranch} label="Pending Changes" value={pendingChanges} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Headphones} label="Service Requests" value={serviceRequests.filter((s: any) => s.status !== "Completed").length} iconBg="bg-teal-100 dark:bg-teal-900/30" iconColor="text-teal-600" borderColor="border-l-teal-500" sub={`${serviceRequests.length} total`} />
      </div>

      {criticalIncidents > 0 && (
        <Card className="border-red-500/50 bg-red-50/50 dark:bg-red-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-5 h-5 text-red-600" />
              <span className="font-semibold text-red-800 dark:text-red-400">Critical Incidents Requiring Attention</span>
            </div>
            <div className="space-y-2">
              {incidents.filter((i: any) => i.priority === "Critical" && i.status !== "Closed" && i.status !== "Resolved").map((i: any) => (
                <div key={i.id} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg px-3 py-2 border border-red-200 dark:border-red-800">
                  <div>
                    <span className="font-mono text-xs text-red-600 mr-2">{i.ticketNo}</span>
                    <span className="text-sm font-medium">{i.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-600">{i.severity}</Badge>
                    <span className="text-xs text-muted-foreground">{i.assignedTo || "Unassigned"}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Incidents by Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" paddingAngle={2} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {statusData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {statusData.map((s: any, i: number) => (
                <div key={s.name} className="flex items-center gap-1.5 text-[10px]">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span>{s.name} ({s.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Incidents by Priority</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={priorityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {priorityData.map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">SLA Targets</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {slas.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <Badge variant="outline" className="text-[10px]" style={{ borderColor: PRIORITY_COLORS[s.priority], color: PRIORITY_COLORS[s.priority] }}>{s.priority}</Badge>
                    <span className="text-xs ml-2">{s.name}</span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>Response: <span className="font-semibold text-foreground">{s.responseTimeHours}h</span></div>
                    <div>Resolution: <span className="font-semibold text-foreground">{s.resolutionTimeHours}h</span></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Recent Incidents</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentIncidents.map((i: any) => (
                <div key={i.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition cursor-pointer" onClick={() => navigate("/itsm-incidents")}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[10px] text-muted-foreground w-[70px] flex-shrink-0">{i.ticketNo}</span>
                    <span className="text-sm truncate">{i.title}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="text-[10px]" style={{ borderColor: PRIORITY_COLORS[i.priority], color: PRIORITY_COLORS[i.priority] }}>{i.priority}</Badge>
                    <Badge variant="outline" className="text-[10px]">{i.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Quick Navigation</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Incidents", desc: `${incidents.length} tickets`, href: "/itsm-incidents", icon: AlertTriangle, color: "bg-red-500" },
                { label: "Problems", desc: `${problems.length} tracked`, href: "/itsm-problems", icon: Bug, color: "bg-violet-500" },
                { label: "Changes", desc: `${changes.length} requests`, href: "/itsm-changes", icon: GitBranch, color: "bg-blue-500" },
                { label: "Knowledge Base", desc: `${kb.length} articles`, href: "/itsm-kb", icon: BookOpen, color: "bg-emerald-500" },
                { label: "SLA Policies", desc: `${slas.length} policies`, href: "/itsm-sla", icon: Shield, color: "bg-amber-500" },
                { label: "Service Requests", desc: `${serviceRequests.length} requests`, href: "/itsm-requests", icon: Headphones, color: "bg-teal-500" },
              ].map(item => (
                <button key={item.href} onClick={() => navigate(item.href)} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition text-left">
                  <div className={`w-9 h-9 rounded-lg ${item.color} flex items-center justify-center`}>
                    <item.icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-[10px] text-muted-foreground">{item.desc}</div>
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
