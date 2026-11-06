import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtCell } from "@/lib/date";
import { cn } from "@/lib/utils";
import { inrShort } from "@/components/asset-finance";
import { Boxes, UserCheck, PackageCheck, Wrench, Hammer, Archive, AlertOctagon, Trash2, X, Download, Users, LogIn, UserX, Shuffle, Layers, Lightbulb, LayoutGrid, Briefcase, List, Activity, CalendarClock, Gauge } from "lucide-react";

/*
 * IT Assets dashboard. Stock tiles on top, then tabs (no long scrolling):
 *  Stock breakdown (drill-down, total row) · Asset list · Insights · People & sign-ins · Finance, warranty & contracts (children)
 */

export const BUCKETS = [
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
const LABEL: Record<string, string> = Object.fromEntries(BUCKETS.map(b => [b.key, b.label]));
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
const TABS = [["stock", "Stock breakdown", LayoutGrid], ["list", "Asset list", List], ["insights", "Insights", Lightbulb], ["people", "People & sign-ins", Users], ["ops", "Finance, warranty & contracts", Briefcase]] as const;

export function AssetAnalytics({ children }: { children?: React.ReactNode }) {
  const { data, isLoading } = useQuery({ queryKey: ["asset-analytics"], queryFn: () => apiFetch<any>("/asset-analytics"), refetchInterval: 5 * 60_000 });
  const [tab, setTab] = useState<string>(() => { try { return sessionStorage.getItem("assetDashTab") || "stock"; } catch { return "stock"; } });
  const go = (t: string) => { setTab(t); try { sessionStorage.setItem("assetDashTab", t); } catch { /* ignore */ } };
  const [bucket, setBucket] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dim, setDim] = useState("type");
  const all: any[] = data?.assets || [];
  const match = (a: any) => Object.entries(filters).every(([k, v]) => String(a[k] ?? "Not set") === v);
  const scope = useMemo(() => all.filter(a => (bucket ? a.bucket === bucket : a.bucket !== "Disposed") && match(a)), [all, bucket, filters]);
  const counts = useMemo(() => { const base = all.filter(match); const c: Record<string, number> = {}; for (const a of base) c[a.bucket] = (c[a.bucket] || 0) + 1; c.total = base.filter(a => a.bucket !== "Disposed").length; return c; }, [all, filters]);
  if (isLoading || !data) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading stock analytics…</CardContent></Card>;
  const pickBucket = (k: string | null) => { setBucket(bucket === k ? null : k); };
  const filterChips = (
    <>{Object.entries(filters).map(([k, v]) => <button key={k} onClick={() => { const f = { ...filters }; delete f[k]; setFilters(f); }} className="inline-flex items-center gap-1 text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">{DIMS.find(d => d[0] === k)?.[1]}: {v}<X className="w-3 h-3" /></button>)}
      {(bucket || Object.keys(filters).length > 0) && <button className="text-xs text-muted-foreground underline" onClick={() => { setBucket(null); setFilters({}); }}>Reset</button>}</>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        <Tile label="Total stock" hint="on the books" value={counts.total || 0} icon={Boxes} color="#0f172a" active={bucket === null} onClick={() => setBucket(null)} />
        {BUCKETS.map(b => <Tile key={b.key} label={b.label} hint={b.hint} value={counts[b.key] || 0} icon={b.icon} color={b.color} active={bucket === b.key} onClick={() => pickBucket(b.key)} />)}
      </div>
      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map(([k, l, I]) => <button key={k} onClick={() => go(k)} className={cn("px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5", tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}><I className="w-4 h-4" />{l}</button>)}
      </div>
      {tab === "stock" && <StockTab scope={scope} bucket={bucket} filters={filters} setFilters={setFilters} dim={dim} setDim={setDim} chips={filterChips} onList={() => go("list")} />}
      {tab === "list" && <ListTab list={scope} bucket={bucket} chips={filterChips} />}
      {tab === "insights" && <InsightsTab all={all.filter(match)} />}
      {tab === "people" && <PeopleTab p={data.people} all={all} />}
      {tab === "ops" && children}
    </div>
  );
}

/* ── Stock breakdown: grouped by a dimension, stacked by stock bucket, with a total row; click a row to drill down ── */
function StockTab({ scope, bucket, filters, setFilters, dim, setDim, chips, onList }: any) {
  const groups = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const a of scope) { const k = String(a[dim] ?? "Not set") || "Not set"; const g = m.get(k) || {}; g[a.bucket] = (g[a.bucket] || 0) + 1; g.__t = (g.__t || 0) + 1; g.__v = (g.__v || 0) + (Number(a.cost) || 0); m.set(k, g); }
    return [...m.entries()].sort((x, y) => y[1].__t - x[1].__t);
  }, [scope, dim]);
  const shown = BUCKETS.filter(b => groups.some(([, g]) => g[b.key]));
  const total: Record<string, number> = {}; for (const [, g] of groups) for (const k of [...shown.map(b => b.key), "__t", "__v"]) total[k] = (total[k] || 0) + (g[k] || 0);
  const max = Math.max(1, ...groups.map(([, g]) => g.__t));
  const drill = (k: string) => { setFilters((f: any) => ({ ...f, [dim]: k })); const next = DIMS.find(([d]) => d !== dim && !(d in filters) && d !== "condition"); if (next) setDim(next[0]); };
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-semibold">{bucket ? LABEL[bucket] : "Total stock"} — {scope.length} assets</span>{chips}
        <div className="ml-auto inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px] flex-wrap">
          {DIMS.filter(([d]) => !(d in filters)).map(([d, l]) => <button key={d} onClick={() => setDim(d)} className={cn("px-2.5 py-1 rounded-[8px] text-[12px]", dim === d ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{l}</button>)}
        </div>
      </div>
      <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card z-[1]"><tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b">
            <th className="text-left py-1.5 pr-2 font-semibold">{DIMS.find(d => d[0] === dim)?.[1]}</th><th className="py-1.5 w-[30%]"></th>
            {shown.map(b => <th key={b.key} className="text-right py-1.5 px-2 font-semibold whitespace-nowrap">{b.label}</th>)}
            <th className="text-right py-1.5 px-2 font-semibold">Total</th><th className="text-right py-1.5 px-2 font-semibold">Share</th><th className="text-right py-1.5 pl-2 font-semibold whitespace-nowrap">Cost</th></tr></thead>
          <tbody>{groups.map(([k, g]) => (
            <tr key={k} className="border-b hover:bg-muted/40 cursor-pointer" title="Click to drill down" onClick={() => drill(k)}>
              <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{k}</td>
              <td className="py-1.5"><div className="flex h-3 rounded overflow-hidden bg-muted" style={{ width: `${Math.max(4, g.__t / max * 100)}%` }}>{shown.map(b => g[b.key] ? <div key={b.key} style={{ width: `${g[b.key] / g.__t * 100}%`, background: b.color }} /> : null)}</div></td>
              {shown.map(b => <td key={b.key} className="text-right py-1.5 px-2 tabular-nums">{g[b.key] || <span className="text-muted-foreground/40">·</span>}</td>)}
              <td className="text-right py-1.5 px-2 font-semibold tabular-nums">{g.__t}</td>
              <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">{pct(g.__t, total.__t)}%</td>
              <td className="text-right py-1.5 pl-2 tabular-nums text-muted-foreground whitespace-nowrap">{g.__v ? inrShort(g.__v) : "—"}</td>
            </tr>))}
            {!groups.length && <tr><td colSpan={12} className="py-6 text-center text-muted-foreground">No assets here.</td></tr>}</tbody>
          {groups.length > 0 && <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur"><tr className="font-bold border-t-2">
            <td className="py-2 pr-2">Total ({groups.length})</td><td></td>
            {shown.map(b => <td key={b.key} className="text-right py-2 px-2 tabular-nums">{total[b.key] || 0}</td>)}
            <td className="text-right py-2 px-2 tabular-nums">{total.__t}</td><td className="text-right py-2 px-2">100%</td><td className="text-right py-2 pl-2 tabular-nums whitespace-nowrap">{total.__v ? inrShort(total.__v) : "—"}</td>
          </tr></tfoot>}
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Click a row to drill down (e.g. Laptop → Location). Pick a tile above to filter by stock status.</span><Button size="sm" variant="outline" className="h-7 gap-1" onClick={onList}><List className="w-3.5 h-3.5" />See these {scope.length} assets</Button></div>
    </CardContent></Card>
  );
}

/* ── Asset list for the current tile / drill-down ── */
function ListTab({ list: base, bucket, chips }: { list: any[]; bucket: string | null; chips: React.ReactNode }) {
  const [q, setQ] = useState(""); const [page, setPage] = useState(1); const PAGE = 12;
  const list = base.filter(a => !q.trim() || [a.assetTag, a.name, a.serialNumber, a.ownerName, a.location, a.department, a.type].some((v: string) => v?.toLowerCase().includes(q.trim().toLowerCase())));
  function exportCsv() {
    const cols: [string, string][] = [["Asset Tag", "assetTag"], ["Name", "name"], ["Type", "type"], ["Serial", "serialNumber"], ["Stock", "bucket"], ["Condition", "condition"], ["Status", "status"], ["Holder", "ownerName"], ["Department", "department"], ["Location", "location"], ["Age (yrs)", "ageYears"], ["Cost", "cost"], ["Warranty", "warranty"], ["Warranty expiry", "warrantyExpiry"], ["Device health", "deviceHealth"], ["Device signed-in user", "deviceUser"], ["Last used", "lastActiveDay"]];
    const e = (v: any) => { const x = String(fmtCell(v) ?? "").replace(/"/g, '""'); return /[,"\n]/.test(x) ? `"${x}"` : x; };
    const t = [cols.map(c => c[0]).join(","), ...list.map(r => cols.map(c => e(r[c[1]])).join(","))].join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([t], { type: "text/csv" })), download: `asset_stock_${bucket || "all"}_${new Date().toISOString().slice(0, 10)}.csv` }); a.click(); URL.revokeObjectURL(a.href);
  }
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{bucket ? LABEL[bucket] : "Total stock"}</span>{chips}
        <Input className="h-8 w-64 ml-auto" placeholder="Search these assets…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
        <span className="text-xs text-muted-foreground">{list.length} assets</span>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={exportCsv}><Download className="w-3.5 h-3.5" />Export CSV</Button>
      </div>
      <div className="border rounded-lg divide-y text-xs">
        {list.slice((page - 1) * PAGE, page * PAGE).map(a => (
          <Link key={a.id} href={`/asset-registry?q=${encodeURIComponent(a.assetTag)}`}><div className="px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5 items-center hover:bg-muted/40 cursor-pointer">
            <span className="font-mono font-semibold text-primary w-20">{a.assetTag}</span><span className="w-20 text-muted-foreground">{a.type}</span>
            <span className="flex-1 min-w-[140px] truncate">{a.name}</span>
            <span className="px-1.5 rounded text-white text-[10px] font-semibold" style={{ background: COLOR[a.bucket] || "#64748b" }}>{LABEL[a.bucket] || a.bucket}</span>
            {a.condition !== "Good" && <span className="text-orange-600">{a.condition}</span>}
            <span className="w-36 truncate">{a.ownerName || "—"}</span><span className="w-28 truncate text-muted-foreground">{a.location}</span>
            {a.mismatch && <span className="text-red-600" title={`Signed in on the device: ${a.deviceUser}`}>other user signed in</span>}
            {a.idleDays != null && a.idleDays > 14 && a.bucket === "Assigned" && <span className="text-amber-600">idle {a.idleDays}d</span>}
          </div></Link>))}
        {!list.length && <div className="px-3 py-3 text-muted-foreground">Nothing to show.</div>}
      </div>
      {list.length > PAGE && <div className="flex items-center justify-end gap-2 text-xs"><Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>{page} / {Math.ceil(list.length / PAGE)}<Button size="sm" variant="ghost" disabled={page * PAGE >= list.length} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </CardContent></Card>
  );
}

/* ── Insights: utilisation, stock cover, ageing / refresh, warranty, value, device health ── */
function InsightsTab({ all }: { all: any[] }) {
  const live = all.filter(a => !["Disposed", "Lost / Stolen"].includes(a.bucket));
  const serving = live.filter(a => a.bucket !== "Retired");
  const types = [...new Set(serving.map(a => a.type))].sort();
  const byType = types.map(t => {
    const l = serving.filter(a => a.type === t);
    const assigned = l.filter(a => a.bucket === "Assigned").length, spare = l.filter(a => a.bucket === "Available").length;
    return { t, n: l.length, assigned, spare, util: pct(assigned, l.length), cover: assigned ? Math.round(spare / assigned * 100) : null, old: l.filter(a => (a.ageYears ?? 0) >= 4).length,
      expired: l.filter(a => a.warranty === "Expired").length, expiring: l.filter(a => a.warranty === "Expiring").length, value: l.reduce((s, a) => s + (Number(a.cost) || 0), 0) };
  }).sort((a, b) => b.n - a.n);
  const tot = { n: serving.length, assigned: serving.filter(a => a.bucket === "Assigned").length, spare: serving.filter(a => a.bucket === "Available").length };
  const refresh = serving.filter(a => (a.ageYears ?? 0) >= 4 && ["Laptop", "Desktop"].includes(a.type));
  const expSoon = serving.filter(a => a.warranty === "Expiring").sort((a, b) => String(a.warrantyExpiry).localeCompare(String(b.warrantyExpiry)));
  const endpoints = serving.filter(a => ["Laptop", "Desktop", "Server"].includes(a.type));
  const reporting = endpoints.filter(a => a.deviceHealth);
  const hs = (s: string) => reporting.filter(a => a.deviceHealth === s).length;
  const idle = serving.filter(a => a.bucket === "Assigned" && a.idleDays != null && a.idleDays > 14);
  const ages = ["< 1 yr", "1–3 yrs", "3–5 yrs", "5+ yrs", "Unknown"];
  const ageCount = (b: string) => serving.filter(a => a.ageBand === b).length;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardContent className="p-4">
        <div className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Gauge className="w-4 h-4 text-primary" />Utilisation &amp; spare stock by type</div>
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground border-b text-left"><th className="py-1 font-semibold">Type</th><th className="font-semibold text-right">In service</th><th className="font-semibold text-right">Assigned</th><th className="font-semibold w-[22%] pl-3">Utilisation</th><th className="font-semibold text-right pl-3">Spare</th><th className="font-semibold text-right" title="Spare ÷ assigned">Spare cover</th><th className="font-semibold text-right">4+ yrs old</th><th className="font-semibold text-right">Warranty expired / ≤90d</th><th className="font-semibold text-right pl-4">Cost</th></tr></thead>
          <tbody>{byType.map(r => <tr key={r.t} className="border-b last:border-0">
            <td className="py-1.5 font-medium">{r.t}</td><td className="text-right tabular-nums">{r.n}</td><td className="text-right tabular-nums">{r.assigned}</td>
            <td className="pl-3"><div className="flex items-center gap-1.5"><div className="h-1.5 flex-1 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${r.util}%` }} /></div><span className="tabular-nums w-8 text-right">{r.util}%</span></div></td>
            <td className="text-right tabular-nums">{r.spare}</td>
            <td className={cn("text-right tabular-nums", r.cover !== null && r.cover < 5 && r.assigned >= 10 && "text-red-600 font-semibold")}>{r.cover === null ? "—" : `${r.cover}%`}</td>
            <td className={cn("text-right tabular-nums", r.old && "text-amber-600")}>{r.old || "·"}</td>
            <td className="text-right tabular-nums">{r.expired || "·"} / {r.expiring || "·"}</td>
            <td className="text-right tabular-nums whitespace-nowrap pl-4">{r.value ? inrShort(r.value) : "—"}</td></tr>)}</tbody>
          <tfoot><tr className="font-bold border-t-2"><td className="py-1.5">Total</td><td className="text-right">{tot.n}</td><td className="text-right">{tot.assigned}</td><td className="pl-3">{pct(tot.assigned, tot.n)}%</td><td className="text-right">{tot.spare}</td><td className="text-right">{tot.assigned ? `${Math.round(tot.spare / tot.assigned * 100)}%` : "—"}</td>
            <td className="text-right">{byType.reduce((s, r) => s + r.old, 0)}</td><td className="text-right">{byType.reduce((s, r) => s + r.expired, 0)} / {byType.reduce((s, r) => s + r.expiring, 0)}</td><td className="text-right whitespace-nowrap pl-4">{inrShort(byType.reduce((s, r) => s + r.value, 0))}</td></tr></tfoot>
        </table>
        <div className="text-[11px] text-muted-foreground mt-2">Spare cover in red = fewer than 5 spares per 100 assigned — consider buying stock.</div>
      </CardContent></Card>
      <Card><CardContent className="p-4 space-y-2">
        <div className="text-sm font-semibold flex items-center gap-1.5"><Activity className="w-4 h-4 text-primary" />Device health (agent)</div>
        <div className="text-xs text-muted-foreground">{reporting.length} of {endpoints.length} laptops / desktops / servers report ({pct(reporting.length, endpoints.length)}% coverage)</div>
        <div className="h-2 rounded bg-muted overflow-hidden flex">{[["Healthy", "#10b981"], ["Warning", "#f59e0b"], ["Critical", "#ef4444"], ["Offline", "#94a3b8"]].map(([s, c]) => hs(s) ? <div key={s} style={{ width: `${hs(s) / Math.max(1, endpoints.length) * 100}%`, background: c }} /> : null)}</div>
        <div className="grid grid-cols-2 gap-1 text-xs">{["Healthy", "Warning", "Critical", "Offline"].map(s => <div key={s} className="flex justify-between"><span className="text-muted-foreground">{s}</span><b>{hs(s)}</b></div>)}<div className="flex justify-between"><span className="text-muted-foreground">No agent</span><b>{endpoints.length - reporting.length}</b></div><div className="flex justify-between"><span className="text-muted-foreground">Idle 14+ days</span><b>{idle.length}</b></div></div>
        <Link href="/asset-agents"><span className="text-xs text-primary hover:underline cursor-pointer">Open Device Health →</span></Link>
      </CardContent></Card>
      <Card><CardContent className="p-4 space-y-2">
        <div className="text-sm font-semibold flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-primary" />Age profile</div>
        {ages.map(b => { const n = ageCount(b); return <div key={b} className="text-xs"><div className="flex justify-between"><span>{b}</span><b className="tabular-nums">{n}</b></div><div className="h-1.5 rounded bg-muted overflow-hidden"><div className={cn("h-full", b === "5+ yrs" ? "bg-red-500" : b === "3–5 yrs" ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct(n, serving.length)}%` }} /></div></div>; })}
        <div className="text-xs pt-1"><b>{refresh.length}</b> laptops / desktops are 4+ years old — refresh candidates</div>
      </CardContent></Card>
      <Card><CardContent className="p-4 space-y-1.5">
        <div className="text-sm font-semibold">Warranty ending in 90 days ({expSoon.length})</div>
        {expSoon.slice(0, 7).map(a => <Link key={a.id} href={`/asset-registry?q=${a.assetTag}`}><div className="text-xs flex justify-between hover:underline cursor-pointer"><span><span className="font-mono">{a.assetTag}</span> · {a.type}</span><span className="text-muted-foreground">{fmtDate(a.warrantyExpiry)}</span></div></Link>)}
        {expSoon.length > 7 && <Link href="/asset-contracts?tab=warranty"><span className="text-xs text-primary cursor-pointer">+{expSoon.length - 7} more →</span></Link>}
        {!expSoon.length && <div className="text-xs text-muted-foreground">None.</div>}
      </CardContent></Card>
      <Card><CardContent className="p-4 space-y-1.5">
        <div className="text-sm font-semibold">Refresh candidates (4+ yrs)</div>
        {refresh.sort((a, b) => (b.ageYears || 0) - (a.ageYears || 0)).slice(0, 7).map(a => <Link key={a.id} href={`/asset-registry?q=${a.assetTag}`}><div className="text-xs flex justify-between hover:underline cursor-pointer"><span><span className="font-mono">{a.assetTag}</span> · {a.ownerName || LABEL[a.bucket]}</span><span className="text-muted-foreground">{a.ageYears} yrs</span></div></Link>)}
        {!refresh.length && <div className="text-xs text-muted-foreground">None — fleet is younger than 4 years (or purchase dates are missing).</div>}
      </CardContent></Card>
    </div>
  );
}

/* ── People, sign-ins and assignment checks ── */
function PeopleTab({ p, all }: { p: any; all: any[] }) {
  const idle = all.filter(a => a.bucket === "Assigned" && a.idleDays != null && a.idleDays > 14);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><CardContent className="p-4 space-y-3">
        <div className="text-sm font-semibold flex items-center gap-1.5"><LogIn className="w-4 h-4 text-primary" />IT Hub users &amp; sign-ins</div>
        <div className="grid grid-cols-2 gap-2 text-center">
          {[["Active users", p.active], ["Signed in (7 days)", p.login7d], ["Signed in (30 days)", p.login30d], ["Never signed in", p.neverLoggedIn]].map(([l, v]) => <div key={l as string} className="rounded-lg border p-2"><div className="text-lg font-bold">{v}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>)}
        </div>
        {p.loginTrend?.length > 0 && <div><div className="text-[11px] text-muted-foreground mb-1">People signing in per day (30 days)</div>
          <div className="flex items-end gap-[2px] h-14 border-b">{p.loginTrend.map((d: any) => { const mx = Math.max(1, ...p.loginTrend.map((x: any) => x.users)); return <div key={d.day} title={`${fmtDate(d.day)}: ${d.users}`} className="flex-1 bg-primary/70 rounded-t-sm" style={{ height: `${d.users / mx * 100}%`, minHeight: d.users ? 2 : 0 }} />; })}</div></div>}
        <div className="text-[11px] text-muted-foreground">{p.external} external users · {p.inactive} disabled · adoption {pct(p.login30d, p.active)}% (30 days)</div>
      </CardContent></Card>
      <Card><CardContent className="p-4 space-y-2">
        <div className="text-sm font-semibold flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" />Assignment</div>
        <div className="text-xs text-muted-foreground">{p.holders} people hold assets · {p.multiAssetHolders} hold more than one</div>
        <div className="border rounded-lg divide-y text-xs max-h-56 overflow-y-auto">{p.multi.map((h: any) => <div key={h.k} className="px-2.5 py-1.5"><div className="flex justify-between"><span className="font-medium">{h.name}</span><span className="font-semibold">{h.n}</span></div><div className="text-muted-foreground truncate" title={h.assets}>{h.assets}</div></div>)}
          {!p.multi.length && <div className="px-2.5 py-2 text-muted-foreground">Nobody holds more than one asset.</div>}</div>
      </CardContent></Card>
      <Card><CardContent className="p-4 space-y-2">
        <div className="text-sm font-semibold flex items-center gap-1.5"><UserX className="w-4 h-4 text-red-600" />Needs checking</div>
        <div className="text-xs"><b>{p.inactiveHolders.length}</b> assets still with disabled users (leavers)</div>
        {p.inactiveHolders.slice(0, 5).map((a: any) => <Link key={a.assetTag} href={`/asset-registry?q=${a.assetTag}`}><div className="text-xs pl-2 hover:underline cursor-pointer">{a.assetTag} · {a.type} · {a.ownerName}</div></Link>)}
        <div className="text-xs pt-1 flex items-center gap-1"><Shuffle className="w-3.5 h-3.5" /><b>{p.mismatches.length}</b> devices where someone else is signed in</div>
        {p.mismatches.slice(0, 5).map((a: any) => <Link key={a.assetTag} href={`/asset-registry?q=${a.assetTag}`}><div className="text-xs pl-2 hover:underline cursor-pointer">{a.assetTag} · assigned {a.ownerName || "—"} · signed in <span className="font-mono">{a.deviceUser}</span></div></Link>)}
        <div className="text-xs pt-1"><b>{idle.length}</b> assigned devices not used for 14+ days</div>
        {idle.slice(0, 5).map(a => <Link key={a.id} href={`/asset-registry?q=${a.assetTag}`}><div className="text-xs pl-2 hover:underline cursor-pointer">{a.assetTag} · {a.ownerName} · idle {a.idleDays}d</div></Link>)}
      </CardContent></Card>
    </div>
  );
}

function Tile({ label, hint, value, icon: I, color, active, onClick }: { label: string; hint: string; value: number; icon: React.ElementType; color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("text-left rounded-[12px] border bg-card p-3 transition-all hover:shadow-sm", active && "ring-2 ring-primary border-primary")}>
      <div className="flex items-center justify-between gap-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">{label}</span><I className="w-4 h-4 shrink-0" style={{ color }} /></div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </button>
  );
}
