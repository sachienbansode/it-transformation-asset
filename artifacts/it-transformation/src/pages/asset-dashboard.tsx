import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch, API } from "@/lib/api";
import { Monitor, Package, HardDrive, TrendingUp, AlertTriangle, Wrench, Archive, Box, FileText, Server, DollarSign, ShieldCheck, AlertCircle, CalendarClock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useLocation } from "wouter";

const COLORS = ["#d4a843", "#0f766e", "#2563eb", "#dc2626", "#8b5cf6", "#ea580c", "#059669", "#6366f1"];
const STATUS_COLORS: Record<string, string> = { "In Stock": "#2563eb", "Allocated": "#059669", "In Use": "#0f766e", "Under Maintenance": "#d4a843", "Retired": "#9ca3af", "Disposed": "#dc2626" };

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function urgencyClass(days: number) {
  if (days <= 14) return "border-red-500/40 bg-red-50/60 dark:bg-red-900/15 text-red-700 dark:text-red-400";
  if (days <= 30) return "border-orange-500/40 bg-orange-50/60 dark:bg-orange-900/15 text-orange-700 dark:text-orange-400";
  return "border-amber-400/30 bg-amber-50/40 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400";
}

function depreciationPct(purchaseDate?: string, usefulLifeYears = 5): number | null {
  if (!purchaseDate) return null;
  const age = (Date.now() - new Date(purchaseDate).getTime()) / (365.25 * 86400000);
  return Math.min(100, Math.round((age / usefulLifeYears) * 100));
}

export default function AssetDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });
  const { data: stats } = useQuery({ queryKey: ["assets-stats"], queryFn: () => apiFetch<any>("/assets/stats") });
  const { data: vendors = [] } = useQuery({ queryKey: ["asset-vendors"], queryFn: () => apiFetch<any[]>("/asset-vendors") });
  const { data: licenses = [] } = useQuery({ queryKey: ["asset-licenses"], queryFn: () => apiFetch<any[]>("/asset-licenses") });
  const { data: allocations = [] } = useQuery({ queryKey: ["asset-allocations"], queryFn: () => apiFetch<any[]>("/asset-allocations") });
  const { data: maintenanceRecords = [] } = useQuery({ queryKey: ["maintenance-records"], queryFn: () => apiFetch<any[]>("/maintenance-records") });

  const statusData = stats?.byStatus?.map((s: any) => ({ name: s.status, value: s.count, fill: STATUS_COLORS[s.status] || "#999" })) || [];
  const typeData = stats?.byType?.map((t: any) => ({ name: t.type, value: t.count })) || [];
  const totalValue = Number(stats?.totalCost || 0);
  const activeAssets = assets.filter((a: any) => a.status === "Allocated" || a.status === "In Use").length;
  const maintenanceAssets = assets.filter((a: any) => a.status === "Under Maintenance").length;
  const retiredAssets = assets.filter((a: any) => a.status === "Retired" || a.status === "Disposed").length;

  const expiringLicenses = licenses.filter((l: any) => {
    if (!l.expiryDate) return false;
    const diff = new Date(l.expiryDate).getTime() - Date.now();
    return diff > 0 && diff < 90 * 86400000;
  }).sort((a: any, b: any) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

  // Warranty expiry — with days remaining
  const warrantyExpiring = assets.filter((a: any) => {
    if (!a.warrantyExpiry) return false;
    const days = daysUntil(a.warrantyExpiry);
    return days > 0 && days <= 90;
  }).sort((a: any, b: any) => daysUntil(a.warrantyExpiry) - daysUntil(b.warrantyExpiry));

  // Warranty already expired
  const warrantyExpired = assets.filter((a: any) => {
    if (!a.warrantyExpiry) return false;
    return daysUntil(a.warrantyExpiry) <= 0;
  });

  const deptData = Object.entries(
    assets.reduce((acc: any, a: any) => { const d = a.department || "Unknown"; acc[d] = (acc[d] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value })).sort((a: any, b: any) => (b.value as number) - (a.value as number));

  const totalSeats = licenses.reduce((s: number, l: any) => s + (l.seatsTotal || 0), 0);
  const usedSeats = licenses.reduce((s: number, l: any) => s + (l.seatsUsed || 0), 0);
  const licenseUtil = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0;

  // Over-allocated licenses
  const overAllocatedLicenses = licenses.filter((l: any) => l.seatsUsed > l.seatsTotal);

  // Assets with high depreciation (>80%)
  const highDepreciation = assets.filter((a: any) => {
    const pct = depreciationPct(a.purchaseDate);
    return pct !== null && pct >= 80 && a.status !== "Retired" && a.status !== "Disposed";
  }).slice(0, 5);

  const pendingMaintenance = maintenanceRecords.filter((r: any) => r.status === "Scheduled" || r.status === "In Progress").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">IT Asset Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome, {user?.name || "User"} — Overview of {assets.length} registered IT assets
          </p>
        </div>
        <Button variant="outline" onClick={() => window.open(`${API}/export/asset-management-doc`, "_blank")} className="gap-2">
          <FileText className="w-4 h-4" />Export Report
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Box} label="Total Assets" value={stats?.total || 0} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Monitor} label="Active / In Use" value={activeAssets} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" sub={`${assets.length > 0 ? Math.round((activeAssets / assets.length) * 100) : 0}% utilization`} />
        <StatCard icon={Wrench} label="Maintenance" value={maintenanceAssets} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" sub={`${pendingMaintenance} pending`} />
        <StatCard icon={Archive} label="Retired / Disposed" value={retiredAssets} iconBg="bg-gray-100 dark:bg-gray-900/30" iconColor="text-gray-500" borderColor="border-l-gray-400" />
        <StatCard icon={Package} label="Active Vendors" value={vendors.filter((v: any) => v.status === "Active").length} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600" borderColor="border-l-violet-500" />
        <StatCard icon={DollarSign} label="Total Value" value={`₹${(totalValue / 100000).toFixed(1)}L`} iconBg="bg-[#d4a843]/20" iconColor="text-[#d4a843]" borderColor="border-l-[#d4a843]" />
      </div>

      {/* ── Alert Banner Area ──────────────────────────────────────────────── */}
      {(warrantyExpired.length > 0 || overAllocatedLicenses.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {warrantyExpired.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{warrantyExpired.length} asset{warrantyExpired.length > 1 ? "s have" : " has"} expired warranty — review &amp; plan replacement</span>
            </div>
          )}
          {overAllocatedLicenses.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-orange-500/40 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 text-sm font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{overAllocatedLicenses.length} license{overAllocatedLicenses.length > 1 ? "s are" : " is"} over seat limit — update license counts</span>
            </div>
          )}
        </div>
      )}

      {/* ── Expiry Alert Cards ─────────────────────────────────────────────── */}
      {(expiringLicenses.length > 0 || warrantyExpiring.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {warrantyExpiring.length > 0 && (
            <Card className="border-red-400/30 bg-red-50/30 dark:bg-red-900/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-semibold text-red-800 dark:text-red-400">Warranty Expiring Within 90 Days ({warrantyExpiring.length})</span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => navigate("/asset-registry")}>View All <ArrowRight className="w-3 h-3 ml-1" /></Button>
                </div>
                <div className="space-y-2">
                  {warrantyExpiring.slice(0, 5).map((a: any) => {
                    const days = daysUntil(a.warrantyExpiry);
                    return (
                      <div key={a.id} className={`flex justify-between items-center text-xs px-3 py-1.5 rounded-md border ${urgencyClass(days)}`}>
                        <div className="font-medium truncate max-w-[60%]">{a.assetTag} — {a.name}</div>
                        <div className="flex items-center gap-1.5 shrink-0 font-semibold">
                          <CalendarClock className="w-3 h-3" />
                          {days <= 7 ? `${days}d left` : days <= 30 ? `${days}d left` : a.warrantyExpiry}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          {expiringLicenses.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-50/30 dark:bg-amber-900/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-400">Licenses Expiring Soon ({expiringLicenses.length})</span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => navigate("/asset-licenses")}>View All <ArrowRight className="w-3 h-3 ml-1" /></Button>
                </div>
                <div className="space-y-2">
                  {expiringLicenses.slice(0, 5).map((l: any) => {
                    const days = daysUntil(l.expiryDate);
                    return (
                      <div key={l.id} className={`flex justify-between items-center text-xs px-3 py-1.5 rounded-md border ${urgencyClass(days)}`}>
                        <div className="font-medium truncate max-w-[60%]">{l.productName}</div>
                        <div className="flex items-center gap-1.5 shrink-0 font-semibold">
                          <CalendarClock className="w-3 h-3" />
                          {days <= 7 ? `${days}d left` : l.expiryDate}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Assets by Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" paddingAngle={2} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {statusData.map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {statusData.map((s: any) => (
                <div key={s.name} className="flex items-center gap-1.5 text-[10px]">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.fill }} />
                  <span>{s.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Assets by Type</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={typeData} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" fontSize={10} width={80} />
                <Tooltip />
                <Bar dataKey="value" fill="#d4a843" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Assets by Department</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={deptData} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" fontSize={10} width={100} />
                <Tooltip />
                <Bar dataKey="value" fill="#0f766e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* License Utilization */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">License Utilization</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-3xl font-bold text-[#d4a843]">{licenseUtil}%</div>
              <div className="text-xs text-muted-foreground">
                {usedSeats} of {totalSeats} total seats used<br />
                across {licenses.length} licenses
              </div>
            </div>
            <div className="space-y-3">
              {licenses.map((lic: any) => {
                const pct = lic.seatsTotal > 0 ? (lic.seatsUsed / lic.seatsTotal) * 100 : 0;
                const isOver = lic.seatsUsed > lic.seatsTotal;
                return (
                  <div key={lic.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium truncate max-w-[60%]">{lic.productName}</span>
                      <span className={isOver ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                        {lic.seatsUsed}/{lic.seatsTotal} seats {isOver && "⚠ over"}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: isOver ? "#dc2626" : pct > 90 ? "#dc2626" : pct > 70 ? "#d4a843" : "#059669" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Depreciation Tracker */}
        {highDepreciation.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Aging Assets (≥80% Depreciated)</CardTitle>
                <Badge variant="outline" className="border-orange-400/40 text-orange-600 bg-orange-50 dark:bg-orange-400/10 text-[10px]">{highDepreciation.length} assets</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {highDepreciation.map((a: any) => {
                  const pct = depreciationPct(a.purchaseDate) || 0;
                  return (
                    <div key={a.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-mono font-semibold text-[#b8922e]">{a.assetTag}</span>
                        <span className="text-muted-foreground truncate max-w-[40%] mx-2">{a.name}</span>
                        <span className={pct >= 100 ? "text-red-600 font-semibold" : "text-orange-600 font-semibold"}>{pct}% consumed</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? "#dc2626" : "#f97316" }} />
                      </div>
                    </div>
                  );
                })}
                <p className="text-[11px] text-muted-foreground mt-2">Based on 5-year straight-line depreciation model</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Quick Navigation</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Asset Registry", desc: `${assets.length} assets`, href: "/asset-registry", icon: Monitor, color: "bg-blue-500" },
                  { label: "Vendors", desc: `${vendors.length} vendors`, href: "/asset-vendors", icon: Package, color: "bg-violet-500" },
                  { label: "Licenses", desc: `${licenses.length} licenses`, href: "/asset-licenses", icon: HardDrive, color: "bg-emerald-500" },
                  { label: "Allocations", desc: `${allocations.length} records`, href: "/asset-allocations", icon: Server, color: "bg-amber-500" },
                  { label: "Maintenance", desc: `${maintenanceRecords.length} records`, href: "/maintenance-records", icon: Wrench, color: "bg-teal-500" },
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
        )}
      </div>

      {/* ── Quick Navigation (when depreciation card is shown) ─────────────── */}
      {highDepreciation.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Quick Navigation</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {[
                { label: "Asset Registry", desc: `${assets.length} assets`, href: "/asset-registry", icon: Monitor, color: "bg-blue-500" },
                { label: "Vendors", desc: `${vendors.length} vendors`, href: "/asset-vendors", icon: Package, color: "bg-violet-500" },
                { label: "Licenses", desc: `${licenses.length} licenses`, href: "/asset-licenses", icon: HardDrive, color: "bg-emerald-500" },
                { label: "Allocations", desc: `${allocations.length} records`, href: "/asset-allocations", icon: Server, color: "bg-amber-500" },
                { label: "Maintenance", desc: `${maintenanceRecords.length} records`, href: "/maintenance-records", icon: Wrench, color: "bg-teal-500" },
              ].map(item => (
                <button key={item.href} onClick={() => navigate(item.href)} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition text-left">
                  <div className={`w-9 h-9 rounded-lg ${item.color} flex items-center justify-center shrink-0`}>
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
      )}
    </div>
  );
}
