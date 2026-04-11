import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch, API } from "@/lib/api";
import { Monitor, Package, HardDrive, TrendingUp, AlertTriangle, Wrench, Archive, Box, FileText, Server, Wifi, DollarSign, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, CartesianGrid } from "recharts";
import { useLocation } from "wouter";

const COLORS = ["#d4a843", "#0f766e", "#2563eb", "#dc2626", "#8b5cf6", "#ea580c", "#059669", "#6366f1"];
const STATUS_COLORS: Record<string, string> = { "In Stock": "#2563eb", "Allocated": "#059669", "In Use": "#0f766e", "Under Maintenance": "#d4a843", "Retired": "#9ca3af", "Disposed": "#dc2626" };

export default function AssetDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });
  const { data: stats } = useQuery({ queryKey: ["assets-stats"], queryFn: () => apiFetch<any>("/assets/stats") });
  const { data: vendors = [] } = useQuery({ queryKey: ["asset-vendors"], queryFn: () => apiFetch<any[]>("/asset-vendors") });
  const { data: licenses = [] } = useQuery({ queryKey: ["asset-licenses"], queryFn: () => apiFetch<any[]>("/asset-licenses") });
  const { data: allocations = [] } = useQuery({ queryKey: ["asset-allocations"], queryFn: () => apiFetch<any[]>("/asset-allocations") });

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
  });

  const warrantyExpiring = assets.filter((a: any) => {
    if (!a.warrantyExpiry) return false;
    const diff = new Date(a.warrantyExpiry).getTime() - Date.now();
    return diff > 0 && diff < 90 * 86400000;
  });

  const deptData = Object.entries(
    assets.reduce((acc: any, a: any) => { const d = a.department || "Unknown"; acc[d] = (acc[d] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value })).sort((a: any, b: any) => b.value - a.value);

  const totalSeats = licenses.reduce((s: number, l: any) => s + (l.seatsTotal || 0), 0);
  const usedSeats = licenses.reduce((s: number, l: any) => s + (l.seatsUsed || 0), 0);
  const licenseUtil = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0;

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
        <StatCard icon={Wrench} label="Maintenance" value={maintenanceAssets} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={Archive} label="Retired / Disposed" value={retiredAssets} iconBg="bg-gray-100 dark:bg-gray-900/30" iconColor="text-gray-500" borderColor="border-l-gray-400" />
        <StatCard icon={Package} label="Active Vendors" value={vendors.filter((v: any) => v.status === "Active").length} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600" borderColor="border-l-violet-500" />
        <StatCard icon={DollarSign} label="Total Value" value={`₹${(totalValue / 100000).toFixed(1)}L`} iconBg="bg-[#d4a843]/20" iconColor="text-[#d4a843]" borderColor="border-l-[#d4a843]" />
      </div>

      {(expiringLicenses.length > 0 || warrantyExpiring.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {expiringLicenses.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-900/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800 dark:text-amber-400">Licenses Expiring Soon ({expiringLicenses.length})</span>
                </div>
                <div className="space-y-1">
                  {expiringLicenses.map((l: any) => (
                    <div key={l.id} className="flex justify-between text-xs">
                      <span>{l.productName}</span>
                      <span className="text-amber-600">{l.expiryDate}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {warrantyExpiring.length > 0 && (
            <Card className="border-red-500/30 bg-red-50/50 dark:bg-red-900/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-800 dark:text-red-400">Warranty Expiring ({warrantyExpiring.length})</span>
                </div>
                <div className="space-y-1">
                  {warrantyExpiring.map((a: any) => (
                    <div key={a.id} className="flex justify-between text-xs">
                      <span>{a.name}</span>
                      <span className="text-red-600">{a.warrantyExpiry}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
                return (
                  <div key={lic.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium truncate max-w-[60%]">{lic.productName}</span>
                      <span className="text-muted-foreground">{lic.seatsUsed}/{lic.seatsTotal} seats</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct > 90 ? "#dc2626" : pct > 70 ? "#d4a843" : "#059669" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Quick Navigation</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Asset Registry", desc: `${assets.length} assets`, href: "/asset-registry", icon: Monitor, color: "bg-blue-500" },
                { label: "Vendors", desc: `${vendors.length} vendors`, href: "/asset-vendors", icon: Package, color: "bg-violet-500" },
                { label: "Licenses", desc: `${licenses.length} licenses`, href: "/asset-licenses", icon: HardDrive, color: "bg-emerald-500" },
                { label: "Allocations", desc: `${allocations.length} records`, href: "/asset-allocations", icon: Server, color: "bg-amber-500" },
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
