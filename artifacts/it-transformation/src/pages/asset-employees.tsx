import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api";
import { AckPill, printHandoverNote, HolderTag } from "@/components/asset-lifecycle";
import { Search, Users, Printer, AlertTriangle, History, Laptop, Download } from "lucide-react";
import { fmtCell } from "@/lib/date";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/date";

const fmt = (d?: string | null) => d ? fmtDate(d) : "—";
/** 400 → "1 yr 1 mo", 75 → "2 mo 15 d", 9 → "9 days" */
export function dur(days?: number | null) {
  const d = Math.max(0, Math.round(Number(days) || 0));
  if (d < 31) return `${d} day${d === 1 ? "" : "s"}`;
  const y = Math.floor(d / 365), m = Math.floor((d % 365) / 30), r = d % 365 % 30;
  return y ? `${y} yr${m ? ` ${m} mo` : ""}` : `${m} mo${r ? ` ${r} d` : ""}`;
}

export default function AssetEmployees() {
  const { data: holders = [], isLoading } = useQuery({ queryKey: ["asset-holders"], queryFn: () => apiFetch<any[]>("/asset-holders") });
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [onlyActive, setOnlyActive] = useState(true);
  const [open, setOpen] = useState<any>(null);
  const [view, setView] = useState<"employee" | "asset">(() => new URLSearchParams(window.location.search).get("view") === "asset" ? "asset" : "employee");
  const [usageOf, setUsageOf] = useState<number | null>(null);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return holders.filter(h => (!onlyActive || h.activeCount > 0) && (!t || [h.userName, h.email, h.employeeCode, h.department].some((v: string) => v?.toLowerCase().includes(t))));
  }, [holders, q, onlyActive]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employee Assets</h1>
        <p className="text-sm text-muted-foreground">Who holds what — current assets, pending acknowledgements and full history per employee (exit clearance), and for each asset which employees used it and for how long.</p>
      </div>
      <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px]">
        {([["employee", "By employee", Users], ["asset", "By asset — usage history", Laptop]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => setView(k)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px] inline-flex items-center gap-1.5", view === k ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground")}><I className="w-3.5 h-3.5" />{l}</button>
        ))}
      </div>
      {view === "asset" ? <AssetUsageList onOpen={setUsageOf} /> : <>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search employee, email, code, department…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px]">
              {[["Holding assets", true], ["Everyone", false]].map(([l, v]) => (
                <button key={String(l)} onClick={() => setOnlyActive(v as boolean)}
                  className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", onlyActive === v ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground")}>{l as string}</button>
              ))}
            </div>
          </div>
          {isLoading && <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && list.length === 0 && <div className="py-12 text-center text-muted-foreground text-sm"><Users className="w-8 h-8 mx-auto mb-2 opacity-40" />No employees found.</div>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map(h => (
              <button key={h.key} onClick={() => setOpen(h)} className="text-left rounded-[14px] border bg-card p-4 hover:shadow-md hover:-translate-y-px transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4D93FA] to-[#1B63D6] text-white grid place-items-center font-semibold text-sm shrink-0">{h.userName?.[0]?.toUpperCase()}</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground truncate flex items-center gap-1.5">{h.userName}<HolderTag type={h.userType} /></div>
                    <div className="text-xs text-muted-foreground truncate"><span className="font-mono">{h.employeeCode || "no emp code"}</span>{[h.email, h.department].filter(Boolean).map(x => ` · ${x}`).join("")}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 text-[11.5px]">
                  <span className="px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-semibold">{h.activeCount} holding</span>
                  {h.pendingAck > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300 font-semibold">{h.pendingAck} ack pending</span>}
                  {h.overdue > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300 font-semibold">{h.overdue} overdue</span>}
                  <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{h.totalCount} total</span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      </>}
      {open && <HolderSheet holder={open} onClose={() => setOpen(null)} onUsage={setUsageOf} />}
      {usageOf && <AssetUsageSheet assetId={usageOf} onClose={() => setUsageOf(null)} />}
    </div>
  );
}

function HolderSheet({ holder, onClose, onUsage }: { holder: any; onClose: () => void; onUsage: (assetId: number) => void }) {
  const { data: rows = [] } = useQuery({ queryKey: ["asset-holder-assets", holder.key], queryFn: () => apiFetch<any[]>(`/asset-holders/assets?key=${encodeURIComponent(holder.key)}`) });
  const active = rows.filter(r => r.status === "Active");
  const past = rows.filter(r => r.status !== "Active");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">{holder.userName}<HolderTag type={holder.userType} /></SheetTitle>
          <SheetDescription>{[holder.employeeCode, holder.designation, holder.department, holder.email].filter(Boolean).join(" · ")}</SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-5">
          <div className={cn("rounded-[10px] border px-3 py-2.5 text-sm", active.length ? "bg-amber-50 border-amber-500/30 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300" : "bg-emerald-50 border-emerald-500/30 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300")}>
            {active.length ? <><AlertTriangle className="inline w-4 h-4 mr-1 -mt-0.5" />Exit clearance: {active.length} asset(s) still to be returned.</> : "Exit clearance: no IT assets outstanding."}
          </div>
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Currently holding ({active.length})</h4>
              {active.length > 0 && <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => printHandoverNote(active)}><Printer className="w-3.5 h-3.5" />Print all</Button>}
            </div>
            <div className="space-y-2">
              {active.map(r => (
                <div key={r.id} className="rounded-[10px] border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="font-semibold text-foreground">{r.assetTag} <span className="font-normal text-muted-foreground">· {r.assetType}</span></div>
                      <div className="text-xs text-muted-foreground truncate">{r.assetName} · SN {r.serialNumber}</div></div>
                    <AckPill status={r.ackStatus} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">{r.handoverNo} · issued {fmt(r.startDate)} · {r.allocationType}
                    {r.expectedReturnDate && <span className={cn(r.expectedReturnDate < today && "text-red-600 font-semibold")}> · due {fmt(r.expectedReturnDate)}</span>}</div>
                  {r.accessories && <div className="text-xs text-muted-foreground">Accessories: {r.accessories}</div>}
                  <Button size="sm" variant="link" className="h-6 px-0 text-xs gap-1" onClick={() => onUsage(r.assetId)}><History className="w-3 h-3" />Who else used this asset</Button>
                </div>
              ))}
              {!active.length && <div className="text-sm text-muted-foreground">Nothing at the moment.</div>}
            </div>
          </section>
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">History ({past.length})</h4>
            <div className="divide-y border rounded-[10px]">
              {past.map(r => (
                <div key={r.id} className="px-3 py-2 text-sm flex justify-between gap-2">
                  <div className="min-w-0"><div className="font-medium text-foreground">{r.assetTag} · {r.assetName}</div>
                    <div className="text-xs text-muted-foreground">{fmt(r.startDate)} → {fmt(r.endDate)} · {r.status}{r.returnCondition ? ` · ${r.returnCondition}` : ""}</div></div>
                  <div className="flex shrink-0"><Button size="sm" variant="ghost" title="Usage history of this asset" onClick={() => onUsage(r.assetId)}><History className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" title="Print return note" onClick={() => printHandoverNote([r], "return")}><Printer className="w-3.5 h-3.5" /></Button></div>
                </div>
              ))}
              {!past.length && <div className="px-3 py-3 text-sm text-muted-foreground">No past handovers.</div>}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Every asset that has been issued at least once: how many employees used it, total time in use, current holder. */
function AssetUsageList({ onOpen }: { onOpen: (id: number) => void }) {
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["asset-usage"], queryFn: () => apiFetch<any[]>("/asset-usage") });
  const [q, setQ] = useState(""); const [type, setType] = useState(""); const [shared, setShared] = useState(false);
  const types = useMemo(() => [...new Set(rows.map((r: any) => r.assetType).filter(Boolean))].sort() as string[], [rows]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r: any) => (!type || r.assetType === type) && (!shared || r.users > 1) &&
      (!t || [r.assetTag, r.assetName, r.serialNumber, r.currentHolder, r.location].some((v: string) => v?.toLowerCase().includes(t))));
  }, [rows, q, type, shared]);
  function exportCsv() {
    const cols: [string, string][] = [["Asset Tag", "assetTag"], ["Asset", "assetName"], ["Type", "assetType"], ["Serial", "serialNumber"], ["Status", "assetStatus"], ["Employees used", "users"], ["Handovers", "handovers"], ["Days in use", "daysUsed"], ["First issued", "firstIssued"], ["Current holder", "currentHolder"], ["Holding since", "currentSince"]];
    const e = (v: any) => { const x = String(fmtCell(v) ?? "").replace(/"/g, '""'); return /[,"\n]/.test(x) ? `"${x}"` : x; };
    const csv = [cols.map(c => c[0]).join(","), ...list.map((r: any) => cols.map(c => e(r[c[1]])).join(","))].join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `asset_usage_${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  }
  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search asset tag, name, serial, current holder…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={type} onChange={e => setType(e.target.value)}><option value="">All types</option>{types.map(t => <option key={t}>{t}</option>)}</select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />Used by more than one employee</label>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv}><Download className="w-4 h-4" />Export CSV</Button>
      </div>
      {isLoading && <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>}
      {!isLoading && !list.length && <div className="py-12 text-center text-muted-foreground text-sm"><Laptop className="w-8 h-8 mx-auto mb-2 opacity-40" />No issued assets found.</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b">
            <th className="py-2 pr-3 font-semibold">Asset</th><th className="py-2 pr-3 font-semibold">Employees used</th><th className="py-2 pr-3 font-semibold">Total time in use</th><th className="py-2 pr-3 font-semibold">Current holder</th><th className="py-2 font-semibold">First issued</th>
          </tr></thead>
          <tbody>
            {list.map((r: any) => (
              <tr key={r.assetId} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer" onClick={() => onOpen(r.assetId)}>
                <td className="py-2.5 pr-3"><div className="font-semibold">{r.assetTag} <span className="font-normal text-xs text-muted-foreground">· {r.assetType}</span></div><div className="text-xs text-muted-foreground truncate max-w-[280px]">{r.assetName} · SN {r.serialNumber}{r.assetStatus ? ` · ${r.assetStatus}` : ""}</div></td>
                <td className="py-2.5 pr-3"><span className="font-semibold">{r.users}</span> <span className="text-xs text-muted-foreground">({r.handovers} handover{r.handovers === 1 ? "" : "s"})</span></td>
                <td className="py-2.5 pr-3 font-medium">{dur(r.daysUsed)}</td>
                <td className="py-2.5 pr-3">{r.currentHolder ? <><div className="font-medium">{r.currentHolder}</div><div className="text-xs text-muted-foreground">since {fmt(r.currentSince)}{r.currentDepartment ? ` · ${r.currentDepartment}` : ""}</div></> : <span className="text-xs text-muted-foreground">Not issued now</span>}</td>
                <td className="py-2.5 text-xs text-muted-foreground">{fmt(r.firstIssued)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent></Card>
  );
}

/** One asset: per-employee totals (how long each person had it) and the full handover timeline. */
export function AssetUsageSheet({ assetId, onClose }: { assetId: number; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["asset-usage", assetId], queryFn: () => apiFetch<any>(`/asset-usage/${assetId}`) });
  const max = Math.max(1, ...((data?.employees || []).map((e: any) => e.days)));
  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><History className="w-4 h-4 text-primary" />{data?.asset ? `${data.asset.assetTag} — usage history` : "Usage history"}</SheetTitle>
          <SheetDescription>{data?.asset ? `${data.asset.name} · ${data.asset.type} · SN ${data.asset.serialNumber} · ${data.asset.status}` : ""}</SheetDescription>
        </SheetHeader>
        {isLoading && <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>}
        {error && <div className="py-6 text-sm text-red-600">{(error as Error).message}</div>}
        {data && <div className="mt-5 space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {[["Employees", data.summary.users], ["Handovers", data.summary.handovers], ["Total in use", dur(data.summary.totalDays)]].map(([l, v]) => (
              <div key={l as string} className="rounded-[10px] border p-2.5"><div className="text-[11px] text-muted-foreground">{l}</div><div className="text-lg font-bold">{v}</div></div>))}
          </div>
          <div className={cn("rounded-[10px] border px-3 py-2 text-sm", data.summary.currentHolder ? "bg-blue-50 border-blue-500/30 text-blue-800 dark:bg-blue-400/10 dark:text-blue-300" : "bg-muted text-muted-foreground")}>
            {data.summary.currentHolder ? <>Currently with <b>{data.summary.currentHolder}</b></> : "Not issued to anyone now"}
          </div>
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Who used it and for how long</h4>
            <div className="space-y-2">
              {data.employees.map((e: any) => (
                <div key={e.holderKey} className="rounded-[10px] border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0"><div className="font-medium truncate flex items-center gap-1.5">{e.userName}<HolderTag type={e.holderType} />{e.current && <span className="text-[10px] px-1.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300 font-semibold">current</span>}</div>
                      <div className="text-xs text-muted-foreground">{[e.employeeCode, e.department, `${fmt(e.from)} → ${e.current ? "today" : fmt(e.to)}`, e.times > 1 ? `${e.times} times` : null].filter(Boolean).join(" · ")}</div></div>
                    <div className="text-sm font-semibold whitespace-nowrap">{dur(e.days)}</div>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", e.current ? "bg-blue-500" : "bg-slate-400")} style={{ width: `${Math.max(3, Math.round(e.days / max * 100))}%` }} /></div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Handover timeline</h4>
            <div className="border rounded-[10px] divide-y">
              {data.periods.map((p: any) => (
                <div key={p.id} className="px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2"><span className="font-medium">{p.userName}</span><span className="text-xs text-muted-foreground whitespace-nowrap">{dur(p.days)}</span></div>
                  <div className="text-xs text-muted-foreground">{p.handoverNo} · {fmt(p.startDate)} → {p.status === "Active" ? "now" : fmt(p.endDate)} · {p.allocationType}{p.status !== "Active" ? ` · ${p.status}${p.returnCondition ? ` (${p.returnCondition})` : ""}` : ""}</div>
                </div>
              ))}
            </div>
          </section>
        </div>}
      </SheetContent>
    </Sheet>
  );
}
