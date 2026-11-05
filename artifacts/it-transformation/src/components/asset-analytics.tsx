import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtCell } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Boxes, UserCheck, PackageCheck, Wrench, Hammer, Archive, AlertOctagon, Trash2, X, Download, Users, LogIn, UserX, Shuffle, Layers } from "lucide-react";

/* IT Assets dashboard — stock analytics with drill-down (bucket → type → location / department / …) and people & login analytics. */

const BUCKETS = [
  { key: "Assigned", label: "Assigned", icon: UserCheck, color: "#2D7FF9", hint: "issued to employees" },
  { key: "Available", label: "Good, unassigned", icon: PackageCheck, color: "#10b981", hint: "in stock, ready to issue" },
  { key: "Needs repair", label: "Damaged, unassigned", icon: Hammer, color: "#f97316", hint: "in stock, damaged / not working" },
  { key: "Under repair", label: "Under repair", icon: Wrench, color: "#f59e0b", hint: "with service / vendor" },
  { key: "Retired", label: "Retired", icon: Archive, color: "#94a3b8", hint: "awaiting disposal" },
  { key: "Lost / Stolen", label: "Lost / stolen", icon: AlertOctagon, color: "#ef4444", hint: "written off" },
  { key: "Disposed", label: "Disposed", icon: Trash2, color: "#cbd5e1", hint: "sold / scrapped" },
] as const;
const DIMS: [string, string][] = [["type", "Asset type"], ["location", "Location"], ["department", "Department"], ["ageBand", "Age"], ["warranty", "Warranty"], ["condition", "Condition"], ["vendor", "Vendor"]];
const COLOR: Record<string, string> = Object.fromEntries(BUCKETS.map(b => [b.key, b.color]));

export function AssetAnalytics() {
  const { data, isLoading } = useQuery({ queryKey: ["asset-analytics"], queryFn: () => apiFetch<any>("/asset-analytics"), refetchInterval: 5 * 60_000 });
  const [bucket, setBucket] = useState<string | null>(null);        // null = total stock (on the books, excl. disposed)
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dim, setDim] = useState("type");
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const all: any[] = data?.assets || [];
  const scope = useMemo(() => all.filter(a => (bucket ? a.bucket === bucket : a.bucket !== "Disposed") && Object.entries(filters).every(([k, v]) => String(a[k] ?? "Not set") === v)), [all, bucket, filters]);
  const counts = useMemo(() => { const base = all.filter(a => Object.entries(filters).every(([k, v]) => String(a[k] ?? "Not set") === v)); const c: Record<string, number> = {}; for (const a of base) c[a.bucket] = (c[a.bucket] || 0) + 1; c.total = base.filter(a => a.bucket !== "Disposed").length; return c; }, [all, filters]);
  const groups = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const a of scope) { const k = String(a[dim] ?? "Not set") || "Not set"; const g = m.get(k) || {}; g[a.bucket] = (g[a.bucket] || 0) + 1; g.__t = (g.__t || 0) + 1; m.set(k, g); }
    return [...m.entries()].sort((x, y) => y[1].__t - x[1].__t);
  }, [scope, dim]);
  const max = Math.max(1, ...groups.map(g => g[1].__t));
  const shownBuckets = BUCKETS.filter(b => groups.some(g => g[1][b.key]));
  const list = scope.filter(a => !q.trim() || [a.assetTag, a.name, a.serialNumber, a.ownerName, a.location, a.department, a.type].some((v: string) => v?.toLowerCase().includes(q.trim().toLowerCase())));
  const PAGE = 12;
  const drill = (k: string) => { setFilters(f => ({ ...f, [dim]: k })); setPage(1); const next = DIMS.find(([d]) => d !== dim && !(d in filters) && d !== "condition"); if (next) setDim(next[0]); };
  function exportCsv() {
    const cols: [string, string][] = [["Asset Tag", "assetTag"], ["Name", "name"], ["Type", "type"], ["Serial", "serialNumber"], ["Stock", "bucket"], ["Condition", "condition"], ["Status", "status"], ["Holder", "ownerName"], ["Department", "department"], ["Location", "location"], ["Age (yrs)", "ageYears"], ["Warranty", "warranty"], ["Warranty expiry", "warrantyExpiry"], ["Device health", "deviceHealth"], ["Device signed-in user", "deviceUser"], ["Last used", "lastActiveDay"]];
    const e = (v: any) => { const x = String(fmtCell(v) ?? "").replace(/"/g, '""'); return /[,"\n]/.test(x) ? `"${x}"` : x; };
    const t = [cols.map(c => c[0]).join(","), ...list.map(r => cols.map(c => e(r[c[1]])).join(","))].join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([t], { type: "text/csv" })), download: `asset_stock_${bucket || "all"}_${new Date().toISOString().slice(0, 10)}.csv` }); a.click(); URL.revokeObjectURL(a.href);
  }
  if (isLoading || !data) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading stock analytics…</CardContent></Card>;
  const p = data.people;
  return (
    <div className="space-y-4">
      {/* stock tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        <Tile label="Total stock" hint="on the books" value={counts.total || 0} icon={Boxes} color="#0f172a" active={bucket === null} onClick={() => { setBucket(null); setPage(1); }} />
        {BUCKETS.map(b => <Tile key={b.key} label={b.label} hint={b.hint} value={counts[b.key] || 0} icon={b.icon} color={b.color} active={bucket === b.key} onClick={() => { setBucket(bucket === b.key ? null : b.key); setPage(1); }} />)}
      </div>

      <Card><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{bucket ? BUCKETS.find(b => b.key === bucket)?.label : "Total stock"} — {scope.length} assets</span>
          {Object.entries(filters).map(([k, v]) => <button key={k} onClick={() => { const f = { ...filters }; delete f[k]; setFilters(f); setPage(1); }} className="inline-flex items-center gap-1 text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">{DIMS.find(d => d[0] === k)?.[1]}: {v}<X className="w-3 h-3" /></button>)}
          {(bucket || Object.keys(filters).length > 0) && <button className="text-xs text-muted-foreground underline" onClick={() => { setBucket(null); setFilters({}); setPage(1); }}>Reset</button>}
          <div className="ml-auto inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px] flex-wrap">
            {DIMS.filter(([d]) => !(d in filters)).map(([d, l]) => <button key={d} onClick={() => setDim(d)} className={cn("px-2.5 py-1 rounded-[8px] text-[12px]", dim === d ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{l}</button>)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left py-1.5 pr-2 font-semibold">{DIMS.find(d => d[0] === dim)?.[1]}</th><th className="text-left py-1.5 font-semibold w-[38%]"></th>
              {shownBuckets.map(b => <th key={b.key} className="text-right py-1.5 px-2 font-semibold whitespace-nowrap">{b.label}</th>)}<th className="text-right py-1.5 pl-2 font-semibold">Total</th></tr></thead>
            <tbody>{groups.map(([k, g]) => (
              <tr key={k} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer" title="Click to drill down" onClick={() => drill(k)}>
                <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{k}</td>
                <td className="py-1.5"><div className="flex h-3 rounded overflow-hidden bg-muted" style={{ width: `${Math.max(4, g.__t / max * 100)}%` }}>{shownBuckets.map(b => g[b.key] ? <div key={b.key} style={{ width: `${g[b.key] / g.__t * 100}%`, background: b.color }} /> : null)}</div></td>
                {shownBuckets.map(b => <td key={b.key} className="text-right py-1.5 px-2 tabular-nums">{g[b.key] || <span className="text-muted-foreground/40">·</span>}</td>)}
                <td className="text-right py-1.5 pl-2 font-semibold tabular-nums">{g.__t}</td>
              </tr>))}
              {!groups.length && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No assets here.</td></tr>}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Input className="h-8 w-64" placeholder="Search these assets…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
          <span className="text-xs text-muted-foreground">{list.length} assets</span>
          <Button size="sm" variant="outline" className="h-8 gap-1 ml-auto" onClick={exportCsv}><Download className="w-3.5 h-3.5" />Export CSV</Button>
        </div>
        <div className="border rounded-lg divide-y text-xs">
          {list.slice((page - 1) * PAGE, page * PAGE).map(a => (
            <Link key={a.id} href={`/asset-registry?q=${encodeURIComponent(a.assetTag)}`}><div className="px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5 items-center hover:bg-muted/40 cursor-pointer">
              <span className="font-mono font-semibold text-primary w-20">{a.assetTag}</span><span className="w-20 text-muted-foreground">{a.type}</span>
              <span className="flex-1 min-w-[140px] truncate">{a.name}</span>
              <span className="px-1.5 rounded text-white text-[10px] font-semibold" style={{ background: COLOR[a.bucket] || "#64748b" }}>{BUCKETS.find(b => b.key === a.bucket)?.label || a.bucket}</span>
              {a.condition !== "Good" && <span className="text-orange-600">{a.condition}</span>}
              <span className="w-36 truncate">{a.ownerName || "—"}</span><span className="w-28 truncate text-muted-foreground">{a.location}</span>
              {a.mismatch && <span className="text-red-600" title={`Signed in on the device: ${a.deviceUser}`}>other user signed in</span>}
              {a.idleDays != null && a.idleDays > 14 && a.bucket === "Assigned" && <span className="text-amber-600">idle {a.idleDays}d</span>}
            </div></Link>))}
          {!list.length && <div className="px-3 py-3 text-muted-foreground">Nothing to show.</div>}
        </div>
        {list.length > PAGE && <div className="flex items-center justify-end gap-2 text-xs"><Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>{page} / {Math.ceil(list.length / PAGE)}<Button size="sm" variant="ghost" disabled={page * PAGE >= list.length} onClick={() => setPage(page + 1)}>Next</Button></div>}
      </CardContent></Card>

      {/* people, logins and assignment */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-1.5"><LogIn className="w-4 h-4 text-primary" />IT Hub users &amp; sign-ins</div>
          <div className="grid grid-cols-2 gap-2 text-center">
            {[["Active users", p.active], ["Signed in (7 days)", p.login7d], ["Signed in (30 days)", p.login30d], ["Never signed in", p.neverLoggedIn]].map(([l, v]) => <div key={l as string} className="rounded-lg border p-2"><div className="text-lg font-bold">{v}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>)}
          </div>
          {p.loginTrend?.length > 0 && <div><div className="text-[11px] text-muted-foreground mb-1">People signing in per day (30 days)</div>
            <div className="flex items-end gap-[2px] h-14 border-b">{p.loginTrend.map((d: any) => { const mx = Math.max(1, ...p.loginTrend.map((x: any) => x.users)); return <div key={d.day} title={`${fmtDate(d.day)}: ${d.users}`} className="flex-1 bg-primary/70 rounded-t-sm" style={{ height: `${d.users / mx * 100}%`, minHeight: d.users ? 2 : 0 }} />; })}</div></div>}
          <div className="text-[11px] text-muted-foreground">{p.external} external users · {p.inactive} disabled</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" />Assignment</div>
          <div className="text-xs text-muted-foreground">{p.holders} people hold assets · {p.multiAssetHolders} hold more than one</div>
          <div className="border rounded-lg divide-y text-xs max-h-48 overflow-y-auto">{p.multi.map((h: any) => <div key={h.k} className="px-2.5 py-1.5"><div className="flex justify-between"><span className="font-medium">{h.name}</span><span className="font-semibold">{h.n}</span></div><div className="text-muted-foreground truncate" title={h.assets}>{h.assets}</div></div>)}
            {!p.multi.length && <div className="px-2.5 py-2 text-muted-foreground">Nobody holds more than one asset.</div>}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-1.5"><UserX className="w-4 h-4 text-red-600" />Needs checking</div>
          <div className="text-xs"><b>{p.inactiveHolders.length}</b> assets still with disabled users (leavers)</div>
          {p.inactiveHolders.slice(0, 6).map((a: any) => <Link key={a.assetTag} href={`/asset-registry?q=${a.assetTag}`}><div className="text-xs pl-2 hover:underline cursor-pointer">{a.assetTag} · {a.type} · {a.ownerName}</div></Link>)}
          <div className="text-xs pt-1 flex items-center gap-1"><Shuffle className="w-3.5 h-3.5" /><b>{p.mismatches.length}</b> devices where someone else is signed in (device agent)</div>
          {p.mismatches.slice(0, 6).map((a: any) => <Link key={a.assetTag} href={`/asset-registry?q=${a.assetTag}`}><div className="text-xs pl-2 hover:underline cursor-pointer">{a.assetTag} · assigned {a.ownerName || "—"} · signed in <span className="font-mono">{a.deviceUser}</span></div></Link>)}
          <div className="text-xs pt-1"><b>{all.filter(a => a.bucket === "Assigned" && a.idleDays != null && a.idleDays > 14).length}</b> assigned devices not used for 14+ days</div>
        </CardContent></Card>
      </div>
    </div>
  );
}

function Tile({ label, hint, value, icon: I, color, active, onClick }: { label: string; hint: string; value: number; icon: React.ElementType; color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("text-left rounded-[12px] border bg-card p-3 transition-all hover:shadow-sm", active && "ring-2 ring-primary border-primary")}>
      <div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">{label}</span><I className="w-4 h-4" style={{ color }} /></div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </button>
  );
}
