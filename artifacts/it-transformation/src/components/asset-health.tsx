import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmHeader } from "@/components/confirm-dialog";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Ticket, EyeOff, Eye, MessageSquare, Activity, AlertTriangle, Battery, Cpu, HardDrive, MemoryStick, ShieldCheck, WifiOff, CheckCircle2, Clock, Package, RefreshCw, Lightbulb, Loader2, XCircle } from "lucide-react";

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

/** What the employee can do about each kind of item (My Device). */
export const TIP: Record<string, string> = {
  "pending-reboot": "Save your work and restart the computer to finish installing updates.",
  reboot: "Restart the computer (Start › Power › Restart) — it has not been restarted for a long time.",
  disk: "Empty the Recycle Bin and Downloads folder, or move large files to OneDrive.",
  battery: "The battery is wearing out. IT will plan a replacement; keep the charger connected.",
  antivirus: "Keep Windows Security on. If it was switched off, IT will contact you.",
  "antivirus-defs": "Connect to the internet and leave the computer on so Windows Security can update.",
  bitlocker: "IT will turn on drive encryption; keep the computer connected to the office network or VPN.",
  firewall: "Do not switch off Windows Firewall. IT will switch it back on.",
  patches: "Open Settings › Windows Update › Check for updates, then restart when asked.",
  memory: "Close programs and browser tabs you are not using.",
  cpu: "Close programs you are not using; if it stays slow, chat with IT.",
};
const tipFor = (kind: string) => TIP[kind] || TIP[kind.split(":")[0]];

/** Online status + "Refresh now" (ITH-070). After a refresh request it watches for the new report and reloads the panel. */
export function LiveBar({ agentId, onFresh, staff }: { agentId: number; onFresh: () => void; staff: boolean }) {
  const { toast } = useToast(); const [busy, setBusy] = useState(false); const [watch, setWatch] = useState<number | null>(null);
  const { data: lv, refetch } = useQuery({ queryKey: ["device-live", agentId], queryFn: () => apiFetch<any>(`/asset-agents/${agentId}/live`), refetchInterval: watch ? 5000 : 30_000 });
  React.useEffect(() => {
    if (!watch || !lv) return;
    if (lv.fulfilled) { setWatch(null); onFresh(); toast({ title: "Latest data received", description: `Report of ${fmtDateTime(lv.lastSeenAt)}` }); }
    else if (Date.now() - watch > 4 * 60_000) { setWatch(null); toast({ title: "No new report yet", description: lv.online ? "The computer is busy — it will report shortly." : "The computer is offline; it will report when it is back.", variant: "destructive" }); }
  }, [lv, watch]);
  async function refresh() {
    setBusy(true);
    try { await apiFetch(`/asset-agents/${agentId}/refresh`, { method: "POST", body: "{}", headers: { "X-No-Confirm": "1" } }); setWatch(Date.now()); refetch(); }
    catch (e: any) { toast({ title: "Could not ask for an update", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  if (!lv) return null;
  const pending = !!watch || lv.refreshPending;
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border font-medium", lv.online ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800" : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700")}>
        <span className={cn("w-2 h-2 rounded-full", lv.online ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />{lv.online ? "Online" : "Offline"}</span>
      <span className="text-muted-foreground">last contact {lv.lastContactAt ? ago(lv.lastContactAt) : "never"}</span>
      <Button size="sm" variant="outline" className="h-7 gap-1 ml-auto" disabled={busy || pending} onClick={refresh}>
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{pending ? "Waiting for the computer…" : "Refresh now"}</Button>
      {pending && <span className="w-full text-[11px] text-muted-foreground">{lv.fastRefresh ? (lv.online ? "Asked for fresh data — usually within a minute." : "Asked for fresh data — it will be sent as soon as the computer is online.") : `Agent ${lv.agentVersion} sends it at its next check-in (every 15 min); agent 1.1.7 updates within a minute and is installed automatically.`}</span>}
      {staff && <Suggestions list={lv.suggestions || []} onDone={() => { refetch(); onFresh(); }} />}
    </div>
  );
}

/** "Looks fixed — close the ticket?" — built from the latest device report; IT accepts or keeps it open with a reason. */
function Suggestions({ list, onDone }: { list: any[]; onDone: () => void }) {
  const { toast } = useToast(); const [keep, setKeep] = useState<any>(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState<number | null>(null);
  async function go(x: any, action: "accept" | "dismiss", note = "") {
    setBusy(x.id);
    try { await apiFetch(`/ticket-suggestions/${x.id}/${action}`, { method: "POST", body: JSON.stringify({ note }) }); toast({ title: action === "accept" ? `${x.ticketNo} resolved` : `${x.ticketNo} kept open` }); setKeep(null); setReason(""); onDone(); }
    catch (e: any) { toast({ title: "Could not do that", description: e.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  if (!list.length) return null;
  return (
    <div className="w-full rounded-lg border border-sky-200 bg-sky-50/70 dark:bg-sky-900/20 dark:border-sky-800 p-2.5 space-y-2">
      <div className="font-semibold flex items-center gap-1.5 text-sky-800 dark:text-sky-200"><Lightbulb className="w-3.5 h-3.5" />Tickets that look fixed ({list.length})</div>
      {list.map(x => (
        <div key={x.id} className="rounded-md bg-background border p-2 space-y-1">
          <div className="flex items-center gap-2 flex-wrap"><Link href={`/itsm-incidents?q=${x.ticketNo}`} className="font-semibold underline">{x.ticketNo}</Link><span className="truncate">{x.title}</span><span className="text-muted-foreground">· {x.ticketStatus}{x.assignedTo ? ` · ${x.assignedTo}` : ""}</span></div>
          <div className="text-muted-foreground">{x.reason}. <span className="text-foreground">{x.evidence}</span></div>
          <div className="flex gap-1 justify-end">
            <Button size="sm" className="h-6 px-2 text-[11px] gap-1" disabled={busy === x.id} onClick={() => go(x, "accept")}><CheckCircle2 className="w-3 h-3" />Resolve ticket</Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] gap-1" disabled={busy === x.id} onClick={() => setKeep(x)}><XCircle className="w-3 h-3" />Keep open</Button>
          </div>
        </div>))}
      {keep && <Dialog open onOpenChange={o => !o && setKeep(null)}><DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Keep {keep.ticketNo} open</DialogTitle><DialogDescription>The device report looked fixed ({keep.evidence}). Say why the ticket stays open — it is added to the ticket history.</DialogDescription></DialogHeader>
        <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. User still reports the problem after restart" />
        <DialogFooter><Button variant="outline" onClick={() => setKeep(null)}>Cancel</Button><Button disabled={reason.trim().length < 5 || busy === keep.id} onClick={() => go(keep, "dismiss", reason.trim())}>Keep open</Button></DialogFooter>
      </DialogContent></Dialog>}
    </div>
  );
}

export function AssetHealthPanel({ assetId, agentId, canAct = false, onChat, src, hideHeader = false }: { assetId?: number | null; agentId?: number | null; canAct?: boolean; onChat?: (alert: any) => void; src?: string; hideHeader?: boolean }) {
  const employee = !!src?.startsWith("/my-devices");
  const qc = useQueryClient(); const { toast } = useToast(); const [ign, setIgn] = useState<any>(null); const [busyA, setBusyA] = useState<number | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["asset-health", src || (agentId ? `g${agentId}` : assetId)], queryFn: () => apiFetch<any>(src || (agentId ? `/asset-agents/${agentId}/health` : `/assets/${assetId}/health`)), refetchInterval: 60_000 });
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
  const reload = () => { qc.invalidateQueries({ queryKey: ["asset-health"] }); qc.invalidateQueries({ queryKey: ["asset-agents"] }); };
  async function act(x: any, path: string, body: any = {}, ok?: (r: any) => string) {
    setBusyA(x.id);
    const say = path === "ticket" ? `Raise an ITSM ticket for the health item “${x.message}” on ${a.hostname}?` : path === "unignore" ? `Stop ignoring the health item “${x.message}” on ${a.hostname}? It will count towards the device's health again.` : `${path} “${x.message}” on ${a.hostname}?`;
    try { const r = await apiFetch<any>(`/asset-agents/alerts/${x.id}/${path}`, { method: "POST", body: JSON.stringify(body), headers: confirmHeader(say) }); if (ok) toast({ title: ok(r) }); reload(); return true; }
    catch (e: any) { toast({ title: "Could not do that", description: e.message, variant: "destructive" }); return false; } finally { setBusyA(null); }
  }
  const maxU = Math.max(60, ...(data.usage || []).map((u: any) => u.active + u.idle));
  const days: any[] = []; for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() + 330 * 60e3 - i * 86400e3).toISOString().slice(0, 10); days.push(data.usage.find((u: any) => u.day === d) || { day: d, active: 0, idle: 0 }); }
  const activeDays = data.usage.filter((u: any) => u.active > 0).length;
  const totalApp = Math.max(1, ...(data.apps || []).map((x: any) => x.mins));
  const sw = (data.software || []).filter((x: any) => !swQ.trim() || `${x.name} ${x.publisher || ""}`.toLowerCase().includes(swQ.trim().toLowerCase()));
  return (
    <div className="space-y-4 text-sm">
      {!hideHeader && <div className="flex items-start justify-between gap-2 flex-wrap">
        <div><div className="font-semibold">{a.hostname} <span className="text-xs font-normal text-muted-foreground">· {a.platform} · {[a.manufacturer, a.model].filter(Boolean).join(" ")}</span></div>
          <div className="text-xs text-muted-foreground">{a.osName} {a.osVersion ? `(${a.osVersion})` : ""} · user {a.lastUser || "—"} · last report {a.lastSeenAt ? `${fmtDateTime(a.lastSeenAt)} (${ago(a.lastSeenAt)})` : "never"}</div></div>
        <HealthBadge state={a.healthState} />
      </div>}
      {a.status === "Active" && <LiveBar agentId={a.id} staff={!employee && canAct} onFresh={reload} />}
      <PolicyCompliance c={a.compliance} state={a.complianceState} employee={!!employee} />
      <DeviceDetails h={h} a={a} thresholds={data.settings?.thresholds} latest={data.agentLatest} minDisk={minDisk} />
      {open.length > 0 && <div className="space-y-1">{open.map((x: any) => (
        <div key={x.id} className={cn("rounded-md border px-2.5 py-1.5 text-xs", x.ignored ? "bg-muted/40 text-muted-foreground" : x.severity === "Critical" ? STATE_TONE.Critical : STATE_TONE.Warning)}>
          <div className="flex items-start gap-1.5">{x.ignored ? <EyeOff className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            <span className="flex-1">{x.message}<span className="opacity-70"> · since {fmtDateTime(x.openedAt)}</span>
              {x.ticketNo && <> · <Link href={`/itsm-incidents?q=${x.ticketNo}`} className="underline font-semibold">{x.ticketNo}</Link>{x.ticketStatus ? ` (${x.ticketStatus}${x.ticketAuto ? ", auto" : ""})` : ""}</>}
              {employee && !x.ignored && tipFor(x.kind) && <div className="mt-0.5 flex items-start gap-1 text-foreground/80"><Lightbulb className="w-3 h-3 mt-0.5 shrink-0" />{tipFor(x.kind)}</div>}
              {x.ignored && <div className="mt-0.5">{employee || !x.ignoredBy ? <>Marked by IT as not needing action{x.ignoreUntil ? ` until ${fmtDate(x.ignoreUntil)}` : ""}</> : <>Ignored by {String(x.ignoredBy || "").replace(/ <.*>$/, "")} · {fmtDateTime(x.ignoredAt)}{x.ignoreUntil ? ` · until ${fmtDate(x.ignoreUntil)}` : ""}{x.ignoreReason ? ` — ${x.ignoreReason}` : ""}</>}</div>}</span></div>
          {canAct && <div className="flex gap-1 mt-1 justify-end flex-wrap">
            {!x.ticketNo && <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] gap-1 bg-background" disabled={busyA === x.id} onClick={() => act(x, "ticket", {}, r => `Ticket ${r.ticketNo} raised`)}><Ticket className="w-3 h-3" />Raise ticket</Button>}
            {onChat && <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] gap-1 bg-background" onClick={() => onChat({ ...x, agentId: data.agent.id })}><MessageSquare className="w-3 h-3" />Chat with employee</Button>}
            {x.ignored ? <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] gap-1 bg-background" disabled={busyA === x.id} onClick={() => act(x, "unignore", {}, () => "No longer ignored")}><Eye className="w-3 h-3" />Stop ignoring</Button>
              : <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] gap-1 bg-background" onClick={() => setIgn(x)}><EyeOff className="w-3 h-3" />Ignore</Button>}
          </div>}
        </div>))}</div>}
      {(() => { const fixed = (data.alerts || []).filter((x: any) => x.closedAt && x.closedNote && Date.now() - +new Date(x.closedAt) < 30 * 86400e3); return fixed.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Fixed in the last 30 days ({fixed.length})</summary>
        <div className="mt-1 space-y-1">{fixed.map((x: any) => <div key={x.id} className="rounded-md border px-2.5 py-1.5 flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" /><span>{x.closedNote}{x.ticketNo ? ` · ${x.ticketNo} resolved` : ""}</span></div>)}</div></details>; })()}
      {ign && <IgnoreDialog alert={ign} host={a.hostname} onClose={() => setIgn(null)} onDone={reload} />}
      {!open.length && <div className={cn("rounded-md border px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5", STATE_TONE.Healthy)}><ShieldCheck className="w-3.5 h-3.5" />No open health issues</div>}

      {data.usageHidden ? (!employee && <div className="text-[11px] text-muted-foreground">Daily usage and applications are visible to Super Admin only.</div>) : <>
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
      </>}
      <section>
        <button className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1" onClick={() => setShowSw(v => !v)}><Package className="w-3 h-3" />Installed software ({(data.software || []).length}) {showSw ? "▲" : "▼"}</button>
        {showSw && <div className="mt-1.5 space-y-1.5">
          <input className="w-full h-8 rounded-md border bg-background px-2 text-xs" placeholder="Search software…" value={swQ} onChange={e => setSwQ(e.target.value)} />
          <div className="max-h-56 overflow-y-auto divide-y border rounded-lg">{sw.map((x: any) => <div key={x.name + x.version} className="px-2.5 py-1 text-xs flex justify-between gap-2"><span className="truncate">{x.name}</span><span className="text-muted-foreground whitespace-nowrap">{x.version}{x.publisher ? ` · ${x.publisher}` : ""}</span></div>)}
            {!sw.length && <div className="px-2.5 py-2 text-xs text-muted-foreground">Nothing listed yet (sent once a day).</div>}</div>
        </div>}
      </section>
      <div className="text-[10px] text-muted-foreground">Agent {a.agentVersion || "not reported yet"} · enrolled {fmtDate(a.enrolledAt)}{employee ? " · the agent reports computer health only — no keystrokes, screenshots, files or content." : " · usage records active vs idle minutes and the foreground application only — no keystrokes, screenshots or content."}</div>
    </div>
  );
}

/* ── ITH-093…097: device information grouped — Performance, Storage, Battery, Security, OS & updates, Ports & access, NIYTRI Agent ── */
type Tone = "good" | "warn" | "bad" | undefined;
const toneCls = (t: Tone) => t === "good" ? "text-emerald-700 dark:text-emerald-400" : t === "warn" ? "text-amber-700 dark:text-amber-400" : t === "bad" ? "text-red-600 font-semibold" : "";
function Row({ k, v, tone, title, mono }: { k: string; v: React.ReactNode; tone?: Tone; title?: string; mono?: boolean }) {
  return <div className="flex justify-between gap-3 py-0.5"><span className="text-muted-foreground shrink-0">{k}</span><span className={cn("text-right min-w-0 break-words", toneCls(tone), mono && "font-mono")} title={title}>{v ?? "—"}</span></div>;
}
/* ITH-098 — how this device stands against the company end-user device policy (failed rules with what to do). */
function PolicyCompliance({ c, state, employee }: { c: any; state?: string | null; employee: boolean }) {
  if (!c || state === "not_applicable") return null;
  const failed: any[] = c.failed || []; const ok = state === "compliant";
  return (
    <section className={cn("rounded-lg border p-3", ok ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20" : failed.length ? "border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20" : "")}>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />Device policy
        <span className="ml-auto normal-case tracking-normal font-normal">{c.name ? `${c.name} v${c.version} · ` : ""}{c.passed} of {c.total} rules met</span></h4>
      {ok ? <div className="text-xs text-emerald-700 dark:text-emerald-300">This device meets the company device policy.</div>
        : failed.length ? <div className="space-y-1 text-xs">{failed.map((f: any) => (
          <div key={f.key} className="flex gap-2"><span className={f.severity === "Critical" ? "text-red-600" : "text-amber-600"}>●</span>
            <div><span className="font-medium">{f.label}</span>{f.detail && <span className="text-muted-foreground"> — {f.detail}</span>}{f.hint && <div className="text-muted-foreground">{employee ? "What happens next: " : "Fix: "}{f.hint}</div>}</div></div>))}</div>
        : <div className="text-xs text-muted-foreground">Not checked yet — the next agent report is checked against the policy.</div>}
      {!!c.unknown?.length && <div className="text-[11px] text-muted-foreground mt-1">Not reported by this agent yet: {c.unknown.map((u: any) => u.label).join(", ")}</div>}
    </section>
  );
}
function Group({ title, icon: I, children, badge }: { title: string; icon: React.ElementType; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><I className="w-3.5 h-3.5" />{title}{badge && <span className="ml-auto normal-case tracking-normal">{badge}</span>}</h4>
      <div className="text-xs">{children}</div>
    </section>
  );
}
const yn = (v: any, good = true): [string, Tone] => v === null || v === undefined ? ["Not reported", undefined] : v ? ["Yes", good ? "good" : "bad"] : ["No", good ? "bad" : "good"];
const onOff = (v: any, goodWhenOn = true): [string, Tone] => v === null || v === undefined ? ["Not reported", undefined] : v ? ["On", goodWhenOn ? "good" : "bad"] : ["Off", goodWhenOn ? "bad" : "good"];
const upt = (hrs?: number | null) => hrs == null ? "—" : `${Math.floor(hrs / 24)}d ${Math.round(hrs % 24)}h`;
const verLt = (a?: string, b?: string) => { if (!a || !b) return false; const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };

function DeviceDetails({ h, a, thresholds, latest, minDisk }: { h: any; a: any; thresholds?: any; latest?: string | null; minDisk: number | null }) {
  const t = thresholds || {}; const bat = h.battery; const sec = h.security || {}; const acc = h.access || {}; const os = h.os || {}; const pt = h.patches || {}; const ag = h.agent || {};
  const fw = sec.firewall || {}; const fwAll = [fw.domain, fw.private, fw.public];
  const patchDays = pt.lastInstalled ? Math.floor((Date.now() - +new Date(pt.lastInstalled)) / 86400e3) : null;
  const sys = (sec.bitlocker || []).find((b: any) => /^c/i.test(b.drive || "")) || (sec.bitlocker || [])[0];
  const tasks = Object.entries(ag.tasks || {}) as [string, string][];
  const tasksOk = tasks.length > 0 && tasks.every(([, v]) => /Ready|Running/i.test(v));
  const old = verLt(a.agentVersion, latest || undefined);
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Group title="Performance" icon={Activity}>
        <div className="grid grid-cols-2 gap-2 mb-2"><Meter label="CPU" value={h.cpu?.pct} icon={Cpu} /><Meter label={`Memory${h.mem?.totalGb ? ` (${h.mem.totalGb} GB)` : ""}`} value={h.mem?.usedPct} icon={MemoryStick} /></div>
        <Row k="Processor" v={h.cpu?.name ? `${h.cpu.name}${h.cpu.cores ? ` · ${h.cpu.cores} cores` : ""}` : "—"} />
        <Row k="Up for" v={upt(h.uptimeHours)} tone={h.uptimeHours / 24 > (t.rebootDays ?? 14) ? "warn" : undefined} />
        {h.network?.ip && <Row k="IP address" v={h.network.ip} mono />}
      </Group>
      <Group title="Storage" icon={HardDrive}>
        <div className="mb-2"><Meter label="Lowest disk free" value={minDisk} icon={HardDrive} invert warnAt={(t.diskFreePct ?? 10) * 1.5} badAt={t.diskFreePct ?? 10} /></div>
        {(h.disks || []).filter((d: any) => Number(d.sizeGb) >= 1).map((d: any) => <Row key={d.drive} k={`Drive ${d.drive}`} v={`${d.freeGb} GB free of ${d.sizeGb} GB (${Math.round(d.freePct)}%)`} tone={d.freePct < (t.diskFreePct ?? 10) ? "bad" : undefined} />)}
        {(h.physicalDisks || []).map((p: any) => <Row key={p.name} k={`${p.mediaType && p.mediaType !== "Unspecified" ? p.mediaType : "Disk"} ${p.name}`} v={p.health || "—"} tone={/healthy/i.test(p.health) ? "good" : "bad"} />)}
      </Group>
      {bat?.present ? <Group title="Battery" icon={Battery}>
        {bat.healthPct ? <div className="mb-2"><Meter label="Battery health (capacity left)" value={bat.healthPct} icon={Battery} invert warnAt={t.batteryHealthPct ?? 60} badAt={(t.batteryHealthPct ?? 60) - 20} /></div>
          : <div className="mb-2 text-[11px] text-muted-foreground">Health not reported by this laptop yet — agent 1.1.9 reads it from the Windows battery report.</div>}
        <Row k="Charge" v={bat.chargePct != null ? `${bat.chargePct}%${bat.onPower ? " · on power" : " · on battery"}` : "—"} />
        {bat.fullMwh ? <Row k="Capacity" v={`${Math.round(bat.fullMwh / 1000)} of ${Math.round((bat.designMwh || 0) / 1000)} Wh (new)`} /> : null}
        {bat.cycleCount ? <Row k="Charge cycles" v={bat.cycleCount} /> : null}
        {(bat.maker || bat.chemistry) ? <Row k="Battery" v={[bat.maker, bat.chemistry].filter(Boolean).join(" · ")} /> : null}
      </Group> : <Group title="Battery" icon={Battery}><div className="text-muted-foreground">No battery (desktop or server).</div></Group>}
      <Group title="Security" icon={ShieldCheck}>
        <Row k="Antivirus" v={(sec.av || []).map((x: any) => `${x.name} ${x.enabled ? "on" : "OFF"}${x.enabled && x.upToDate === false ? " (old definitions)" : ""}`).join(", ") || "Not reported"} tone={(sec.av || []).some((x: any) => x.enabled && x.upToDate !== false) ? "good" : "bad"} />
        <Row k="Firewall" v={fwAll.some(v => v === undefined) ? "Not reported" : fwAll.every(Boolean) ? "On (domain, private, public)" : `Off for ${[["domain", fw.domain], ["private", fw.private], ["public", fw.public]].filter(([, v]) => !v).map(([k]) => k).join(", ")}`} tone={fwAll.every(Boolean) ? "good" : "bad"} />
        <Row k="Drive encryption (BitLocker)" v={(sec.bitlocker || []).map((x: any) => `${x.drive} ${x.status}`).join(", ") || "Not reported"} tone={sys ? (/on|encrypt/i.test(sys.status) && !/decrypt/i.test(sys.status) ? "good" : "bad") : undefined} />
        <Row k="Secure Boot" v={onOff(acc.secureBoot)[0]} tone={onOff(acc.secureBoot)[1]} />
        <Row k="TPM security chip" v={acc.tpm ? (acc.tpm.present ? (acc.tpm.ready ? "Present and ready" : "Present, not ready") : "Not present") : "Not reported"} tone={acc.tpm ? (acc.tpm.ready ? "good" : "bad") : undefined} />
        <Row k="User Account Control" v={onOff(acc.uac)[0]} tone={onOff(acc.uac)[1]} />
        <Row k="SMB1 (old file sharing)" v={acc.smb1 == null ? "Not reported" : acc.smb1 ? "On — should be off" : "Off"} tone={acc.smb1 == null ? undefined : acc.smb1 ? "bad" : "good"} />
      </Group>
      <Group title="OS & updates" icon={Package}>
        <Row k="Windows" v={[os.name, os.displayVersion].filter(Boolean).join(" ") || "—"} />
        <Row k="Build" v={os.build ? `${os.build}${os.ubr ? `.${os.ubr}` : ""}${os.arch ? ` · ${os.arch}` : ""}` : "—"} />
        <Row k="Licence / activation" v={os.activation ? `${os.activation.status}${os.activation.channel ? ` · ${os.activation.channel}` : ""}` : "Not reported yet"} tone={os.activation ? (os.activation.status === "Licensed" ? "good" : "bad") : undefined} title={os.activation?.description} />
        <Row k="Installed on" v={os.installDate ? fmtDate(os.installDate) : "—"} />
        <Row k="Last restart" v={os.lastBoot ? fmtDateTime(os.lastBoot) : "—"} />
        <Row k="Last Windows update" v={pt.lastInstalled ? `${fmtDate(pt.lastInstalled)}${patchDays != null ? ` (${patchDays} days ago)` : ""}` : "—"} tone={patchDays != null && patchDays > (t.patchDays ?? 30) ? "bad" : patchDays != null ? "good" : undefined} title={pt.lastTitle || ""} />
        <Row k="Restart pending" v={pt.pendingReboot ? "Yes — restart to finish updates" : "No"} tone={pt.pendingReboot ? "warn" : "good"} />
        {pt.lastSearch && <Row k="Last check for updates" v={fmtDateTime(pt.lastSearch)} />}
        {pt.service && <Row k="Windows Update service" v={pt.service} tone={/Disabled/i.test(pt.service) ? "bad" : undefined} />}
        {(pt.history || []).length > 0 && <details className="mt-1"><summary className="cursor-pointer text-muted-foreground">Recent updates ({pt.history.length})</summary>
          <div className="mt-1 border rounded divide-y">{pt.history.map((u: any, i: number) => <div key={i} className="px-2 py-1 flex gap-2"><span className="flex-1">{u.title}</span><span className={cn("whitespace-nowrap", /Failed|Aborted/.test(u.result) && "text-red-600")}>{u.result}</span><span className="text-muted-foreground whitespace-nowrap">{fmtDate(u.date)}</span></div>)}</div></details>}
      </Group>
      <Group title="Ports & access" icon={EyeOff}>
        <Row k="USB storage" v={acc.usbStorage || "Not reported"} tone={acc.usbStorage === "Blocked" ? "good" : acc.usbStorage === "Read only" ? "warn" : acc.usbStorage === "Allowed" ? "bad" : undefined} />
        <Row k="USB disks connected" v={(acc.usbDisks || []).length ? acc.usbDisks.map((d: any) => `${d.model}${d.sizeGb ? ` (${d.sizeGb} GB)` : ""}`).join(", ") : acc.usbDisks ? "None" : "Not reported"} tone={(acc.usbDisks || []).length ? "warn" : undefined} />
        <Row k="Removable drives" v={(acc.removableDrives || []).length ? acc.removableDrives.join(", ") : acc.removableDrives ? "None" : "Not reported"} />
        <Row k="CD / DVD drive" v={acc.cdDrives == null ? "Not reported" : acc.cdDrives ? "Yes" : "No"} />
        <Row k="Bluetooth" v={acc.bluetooth == null ? "Not reported" : acc.bluetooth ? "On" : "Off / none"} />
        <Row k="Remote Desktop (RDP)" v={acc.rdpEnabled == null ? "Not reported" : acc.rdpEnabled ? "Allowed" : "Off"} tone={acc.rdpEnabled == null ? undefined : acc.rdpEnabled ? "warn" : "good"} />
        <Row k="Guest account" v={acc.guestEnabled == null ? "Not reported" : acc.guestEnabled ? "Enabled" : "Disabled"} tone={acc.guestEnabled == null ? undefined : acc.guestEnabled ? "bad" : "good"} />
        <Row k="Local administrators" v={(acc.localAdmins || []).length ? `${acc.localAdmins.slice(0, 5).join(", ")}${acc.localAdmins.length > 5 ? ` +${acc.localAdmins.length - 5} more` : ""}` : "Not reported"} title={(acc.localAdmins || []).join("\n")} tone={(acc.localAdmins || []).length > 3 ? "warn" : undefined} />
        <Row k="Shared folders" v={(acc.shares || []).length ? acc.shares.join(", ") : acc.shares ? "None" : "Not reported"} tone={(acc.shares || []).length ? "warn" : undefined} />
        <Row k="Autorun (USB / CD)" v={acc.autorunOff == null ? "Not reported" : acc.autorunOff ? "Off" : "On"} tone={acc.autorunOff == null ? undefined : acc.autorunOff ? "good" : "warn"} />
        <Row k="Screen lock" v={acc.screenLockSecs ? `After ${Math.round(acc.screenLockSecs / 60)} min` : h.access ? "Not set by policy" : "Not reported"} tone={acc.screenLockSecs ? (acc.screenLockSecs <= 900 ? "good" : "warn") : h.access ? "warn" : undefined} />
      </Group>
      <Group title="NIYTRI Agent" icon={Clock} badge={<span className={cn("text-[11px] font-semibold rounded-full px-2 py-0.5", !ag.version ? "bg-slate-100 text-slate-600" : tasksOk && !old ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{!ag.version ? (a.agentVersion ? `Agent ${a.agentVersion}` : "Not reported yet") : tasksOk ? (old ? "Update pending" : "Running") : "Needs attention"}</span>}>
        <Row k="Version" v={!a.agentVersion ? "Not reported yet" : `${a.agentVersion}${latest ? (old ? ` — ${latest} available (updates itself)` : " — latest") : ""}`} tone={!a.agentVersion ? undefined : old ? "warn" : "good"} />
        <Row k="Last full report" v={a.lastSeenAt ? `${fmtDateTime(a.lastSeenAt)} (${ago(a.lastSeenAt)})` : "never"} />
        {a.lastPulseAt && <Row k="Last online signal" v={`${fmtDateTime(a.lastPulseAt)} (${ago(a.lastPulseAt)})`} />}
        {tasks.map(([k, v]) => <Row key={k} k={({ "IT Hub Agent": "Health report task", "IT Hub Agent Usage": "Tray & usage task", "IT Hub Agent Pulse": "Online signal task" } as Record<string, string>)[k] || k} v={v} tone={/Ready|Running/i.test(v) ? "good" : "bad"} />)}
        {ag.trayRunning != null && <Row k="Tray icon / usage monitor" v={ag.trayRunning ? "Running" : "Not running (restarts by itself)"} tone={ag.trayRunning ? "good" : "warn"} />}
        {ag.errors24h != null && <Row k="Errors in the last 24 h" v={ag.errors24h} tone={ag.errors24h ? "warn" : "good"} title={ag.lastError || ""} />}
        <Row k="Enrolled" v={fmtDate(a.enrolledAt)} />
        {!ag.version && <div className="text-[11px] text-muted-foreground mt-1">Detailed agent status arrives with agent 1.1.9 (installed automatically).</div>}
      </Group>
    </div>
  );
}

/** Ignore a health item — reason is mandatory; ignored items do not count towards the device's health. */
function IgnoreDialog({ alert, host, onClose, onDone }: { alert: any; host?: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast(); const [reason, setReason] = useState(""); const [until, setUntil] = useState(""); const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { await apiFetch(`/asset-agents/alerts/${alert.id}/ignore`, { method: "POST", body: JSON.stringify({ reason: reason.trim(), until: until || undefined }),
      headers: confirmHeader(`Ignore the health item “${alert.message}”${host ? ` on ${host}` : ""}${until ? ` until ${new Date(until).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : " until it is fixed"}?\nReason: “${reason.trim()}”\nIt stays on record, is shown as ignored and does not count towards the device's health.${alert.ticketNo ? `\nThe reason is added to ${alert.ticketNo}.` : ""}`) }); toast({ title: "Ignored", description: "It no longer counts towards this device's health." }); onDone(); onClose(); }
    catch (e: any) { toast({ title: "Could not ignore", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Ignore health item</DialogTitle><DialogDescription>{alert.message}. It stays on record, is shown as ignored and does not make the device Critical or Warning.{alert.ticketNo ? ` The reason is added to ${alert.ticketNo}.` : ""}</DialogDescription></DialogHeader>
      <div className="space-y-2">
        <div className="space-y-1"><div className="text-xs font-medium">Reason *</div><Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. G: is the card reader — not a real drive" /></div>
        <div className="space-y-1"><div className="text-xs font-medium">Ignore until (optional — blank = until it is fixed)</div><Input type="date" value={until} onChange={e => setUntil(e.target.value)} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={go} disabled={busy || reason.trim().length < 10}>Ignore</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}
