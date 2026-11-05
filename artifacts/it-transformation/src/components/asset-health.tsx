import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Activity, AlertTriangle, Battery, Cpu, HardDrive, MemoryStick, ShieldCheck, WifiOff, CheckCircle2, Clock, Package } from "lucide-react";

/* Device health and daily usage reported by the IT Hub agent (Asset Registry › view › Health; Device Agents). */

export const STATE_TONE: Record<string, string> = {
  Healthy: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
  Warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
  Critical: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
  Offline: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700",
  Unknown: "bg-muted text-muted-foreground border-border",
};
export function HealthBadge({ state }: { state?: string | null }) {
  const s = state || "Unknown"; const I = s === "Healthy" ? CheckCircle2 : s === "Offline" ? WifiOff : s === "Unknown" ? Clock : AlertTriangle;
  return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap", STATE_TONE[s] || STATE_TONE.Unknown)}><I className="w-3 h-3" />{s}</span>;
}
export const hm = (mins?: number | null) => { const m = Math.max(0, Math.round(Number(mins) || 0)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
export function ago(d?: string | null) {
  if (!d) return "never";
  const m = (Date.now() - new Date(d).getTime()) / 60000;
  return m < 2 ? "just now" : m < 60 ? `${Math.round(m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}
function Meter({ label, value, icon: I, invert = false, suffix = "%", warnAt, badAt }: { label: string; value: number | null | undefined; icon: React.ElementType; invert?: boolean; suffix?: string; warnAt?: number; badAt?: number }) {
  const v = value === null || value === undefined || Number.isNaN(Number(value)) ? null : Number(value);
  const W = warnAt ?? (invert ? 25 : 75), Bd = badAt ?? (invert ? 15 : 90);
  const bad = v === null ? false : invert ? v < Bd : v > Bd, warn = v === null ? false : invert ? v < W : v > W;
  return (
    <div className="rounded-lg border p-2.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><I className="w-3 h-3" />{label}</span><span className="font-semibold text-foreground">{v === null ? "—" : `${Math.round(v)}${suffix}`}</span></div>
      <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", bad ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${v === null ? 0 : Math.min(100, Math.max(2, v))}%` }} /></div>
    </div>
  );
}

export function AssetHealthPanel({ assetId }: { assetId: number }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["asset-health", assetId], queryFn: () => apiFetch<any>(`/assets/${assetId}/health`), refetchInterval: 60_000 });
  const [showSw, setShowSw] = useState(false); const [swQ, setSwQ] = useState("");
  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="py-6 text-sm text-red-600">{(error as Error).message}</div>;
  if (!data?.agent) return (
    <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground space-y-1">
      <Activity className="w-6 h-6 mx-auto opacity-40" />
      <div>No health data — the IT Hub agent is not installed on this device, or it is not linked to this asset.</div>
      <div className="text-xs">Install it from <b>IT Assets › Device Health</b>; devices are matched by serial number.</div>
    </div>
  );
  const a = data.agent, h = a.latest || {};
  const minDisk = (h.disks || []).reduce((m: number | null, d: any) => d.freePct == null ? m : m === null ? d.freePct : Math.min(m, d.freePct), null);
  const open = (data.alerts || []).filter((x: any) => !x.closedAt);
  const maxU = Math.max(60, ...(data.usage || []).map((u: any) => u.active + u.idle));
  const days: any[] = []; for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() + 330 * 60e3 - i * 86400e3).toISOString().slice(0, 10); days.push(data.usage.find((u: any) => u.day === d) || { day: d, active: 0, idle: 0 }); }
  const activeDays = data.usage.filter((u: any) => u.active > 0).length;
  const totalApp = Math.max(1, ...(data.apps || []).map((x: any) => x.mins));
  const sw = (data.software || []).filter((x: any) => !swQ.trim() || `${x.name} ${x.publisher || ""}`.toLowerCase().includes(swQ.trim().toLowerCase()));
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div><div className="font-semibold">{a.hostname} <span className="text-xs font-normal text-muted-foreground">· {a.platform} · {[a.manufacturer, a.model].filter(Boolean).join(" ")}</span></div>
          <div className="text-xs text-muted-foreground">{a.osName} {a.osVersion ? `(${a.osVersion})` : ""} · user {a.lastUser || "—"} · last report {ago(a.lastSeenAt)}</div></div>
        <HealthBadge state={a.healthState} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Meter label="CPU" value={h.cpu?.pct} icon={Cpu} />
        <Meter label={`Memory${h.mem?.totalGb ? ` (${h.mem.totalGb} GB)` : ""}`} value={h.mem?.usedPct} icon={MemoryStick} />
        <Meter label="Lowest disk free" value={minDisk} icon={HardDrive} invert warnAt={(data.settings?.thresholds?.diskFreePct ?? 10) * 1.5} badAt={data.settings?.thresholds?.diskFreePct ?? 10} />
        {h.battery?.present ? <Meter label="Battery health" value={h.battery.healthPct} icon={Battery} invert warnAt={data.settings?.thresholds?.batteryHealthPct ?? 60} badAt={(data.settings?.thresholds?.batteryHealthPct ?? 60) - 20} /> : <div className="rounded-lg border p-2.5 text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />Up {h.uptimeHours != null ? `${Math.floor(h.uptimeHours / 24)}d ${Math.round(h.uptimeHours % 24)}h` : "—"}</div>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {(h.disks || []).map((d: any) => <div key={d.drive} className="flex justify-between"><span className="text-muted-foreground">Drive {d.drive}</span><span>{d.freeGb} GB free of {d.sizeGb} GB</span></div>)}
        <div className="flex justify-between"><span className="text-muted-foreground">Antivirus</span><span>{(h.security?.av || []).map((x: any) => `${x.name} ${x.enabled ? "on" : "OFF"}${x.enabled && x.upToDate === false ? " (old definitions)" : ""}`).join(", ") || "—"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">BitLocker</span><span>{(h.security?.bitlocker || []).map((x: any) => `${x.drive} ${x.status}`).join(", ") || "—"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Last update</span><span>{h.patches?.lastInstalled ? fmtDate(h.patches.lastInstalled) : "—"}{h.patches?.pendingReboot ? " · restart pending" : ""}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Uptime</span><span>{h.uptimeHours != null ? `${Math.floor(h.uptimeHours / 24)}d ${Math.round(h.uptimeHours % 24)}h` : "—"}</span></div>
        {(h.physicalDisks || []).map((p: any) => <div key={p.name} className="flex justify-between"><span className="text-muted-foreground truncate">{p.mediaType || "Disk"} {p.name}</span><span className={cn(!/healthy/i.test(p.health) && "text-red-600 font-semibold")}>{p.health}</span></div>)}
        {h.network?.ip && <div className="flex justify-between"><span className="text-muted-foreground">IP</span><span className="font-mono">{h.network.ip}</span></div>}
      </div>
      {open.length > 0 && <div className="space-y-1">{open.map((x: any) => (
        <div key={x.id} className={cn("rounded-md border px-2.5 py-1.5 text-xs flex items-start gap-1.5", x.severity === "Critical" ? STATE_TONE.Critical : STATE_TONE.Warning)}><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{x.message}<span className="opacity-70"> · since {fmtDateTime(x.openedAt)}</span></span></div>))}</div>}
      {!open.length && <div className={cn("rounded-md border px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5", STATE_TONE.Healthy)}><ShieldCheck className="w-3.5 h-3.5" />No open health issues</div>}

      <section>
        <div className="flex items-center justify-between mb-1.5"><h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Daily usage — last 30 days</h4><span className="text-[11px] text-muted-foreground">used on {activeDays} of 30 days</span></div>
        <div className="flex items-end gap-[3px] h-24 border-b">
          {days.map(u => (
            <div key={u.day} className="flex-1 flex flex-col justify-end h-full" title={`${fmtDate(u.day)}: active ${hm(u.active)}, idle ${hm(u.idle)}${u.users ? ` · ${u.users}` : ""}`}>
              <div className="bg-slate-300 dark:bg-slate-600 rounded-t-sm" style={{ height: `${(u.idle / maxU) * 100}%` }} />
              <div className="bg-primary" style={{ height: `${(u.active / maxU) * 100}%` }} />
            </div>))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5"><span>{fmtDate(days[0].day)}</span><span className="inline-flex gap-2"><span><span className="inline-block w-2 h-2 bg-primary mr-1" />active</span><span><span className="inline-block w-2 h-2 bg-slate-300 mr-1" />idle</span></span><span>today</span></div>
      </section>
      {(data.users || []).length > 0 && <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Who used it (30 days)</h4>
        <div className="divide-y border rounded-lg">{data.users.map((u: any) => <div key={u.user} className="px-2.5 py-1.5 flex justify-between text-xs"><span className="font-medium">{u.user}</span><span className="text-muted-foreground">{u.days} day{u.days === 1 ? "" : "s"} · active {hm(u.active)} · last {fmtDate(u.lastDay)}</span></div>)}</div>
      </section>}
      {data.settings?.trackApps && (data.apps || []).length > 0 && <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Top applications (active time, 30 days)</h4>
        <div className="space-y-1">{data.apps.map((x: any) => (
          <div key={x.app} className="text-xs"><div className="flex justify-between"><span className="font-mono">{x.app}</span><span>{hm(x.mins)}</span></div>
            <div className="h-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary/70" style={{ width: `${(x.mins / totalApp) * 100}%` }} /></div></div>))}</div>
      </section>}
      <section>
        <button className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1" onClick={() => setShowSw(v => !v)}><Package className="w-3 h-3" />Installed software ({(data.software || []).length}) {showSw ? "▲" : "▼"}</button>
        {showSw && <div className="mt-1.5 space-y-1.5">
          <input className="w-full h-8 rounded-md border bg-background px-2 text-xs" placeholder="Search software…" value={swQ} onChange={e => setSwQ(e.target.value)} />
          <div className="max-h-56 overflow-y-auto divide-y border rounded-lg">{sw.map((x: any) => <div key={x.name + x.version} className="px-2.5 py-1 text-xs flex justify-between gap-2"><span className="truncate">{x.name}</span><span className="text-muted-foreground whitespace-nowrap">{x.version}{x.publisher ? ` · ${x.publisher}` : ""}</span></div>)}
            {!sw.length && <div className="px-2.5 py-2 text-xs text-muted-foreground">Nothing listed yet (sent once a day).</div>}</div>
        </div>}
      </section>
      <div className="text-[10px] text-muted-foreground">Agent {a.agentVersion} · enrolled {fmtDate(a.enrolledAt)} · usage records active vs idle minutes and the foreground application only — no keystrokes, screenshots or content.</div>
    </div>
  );
}
