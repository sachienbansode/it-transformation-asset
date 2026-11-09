import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtCell } from "@/lib/date";
import { cn } from "@/lib/utils";
import { hm } from "@/components/asset-health";
import { ArrowLeft, Download, Info, Search, UserCog, Loader2 } from "lucide-react";

/* Device Health › Device data — everything the agents report, searchable by employee, computer, asset, app or software. */

const TABS = [["usage", "Daily usage"], ["apps", "Applications"], ["inventory", "Hardware & security"], ["software", "Installed software"], ["tracking", "Tracking rules"]] as const;
type Tab = typeof TABS[number][0];
const TRACK: Record<string, { label: string; tone: string; text: string }> = {
  standard: { label: "Standard", tone: "bg-muted text-muted-foreground", text: "Follows the global setting: active / idle time, and applications if application tracking is on for everyone." },
  usage: { label: "Usage only", tone: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300", text: "Active / idle time and first / last activity only — applications are never recorded." },
  detailed: { label: "Detailed", tone: "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300", text: "Active time and applications, even when application tracking is switched off for everyone." },
  excluded: { label: "Excluded", tone: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300", text: "No usage or application tracking at all. Device health (disk, battery, security, updates) is still reported." },
};
const csv = (rows: any[], cols: [string, string][], name: string) => {
  const e = (v: any) => { const x = String(fmtCell(v) ?? "").replace(/"/g, '""'); return /[,"\n]/.test(x) ? `"${x}"` : x; };
  const t = [cols.map(c => c[0]).join(","), ...rows.map(r => cols.map(c => e(r[c[1]])).join(","))].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([t], { type: "text/csv" })), download: name }); a.click(); URL.revokeObjectURL(a.href);
};
const time = (d?: string) => d ? new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
const today = () => new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 330 * 60e3 - n * 86400e3).toISOString().slice(0, 10);

export default function DeviceData() {
  const { isAdmin } = useAuth();
  const [tab0, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get("tab") as Tab) || "usage");
  const tab: Tab = !isAdmin && (tab0 === "usage" || tab0 === "apps") ? "inventory" : tab0;   // ITH-074: usage is Super Admin only
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get("q") || ""); const [term, setTerm] = useState(q);
  const [from, setFrom] = useState(daysAgo(6)); const [to, setTo] = useState(today());
  const [how, setHow] = useState(false);
  const go = () => setTerm(q.trim());
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/asset-agents" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Device Health</Link>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><img src={`${import.meta.env.BASE_URL}niytri-agent.png`} alt="" className="w-7 h-7 rounded-md" />Device data</h1>
          <p className="text-sm text-muted-foreground">What the IT Hub agent reports from each computer — search by employee, employee code, computer, asset tag, Windows user, application or software.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHow(!how)}><Info className="w-4 h-4" />How usage is calculated</Button>
      </div>
      {how && <Card><CardContent className="p-4 text-sm space-y-1.5">
        <div className="font-semibold">How usage is calculated</div>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          <li>The agent runs in each signed-in Windows user's session and takes one sample <b>every 60 seconds</b>.</li>
          <li>A minute is <b>active</b> when there was keyboard or mouse input in the last <b>5 minutes</b> and the screen is not locked. Otherwise it is <b>idle</b> (locked, away, or no input). Time when the computer is off or asleep is not counted.</li>
          <li><b>Application time</b>: each active minute is given to the application in the foreground at that moment (e.g. EXCEL.EXE). Background apps are not counted, so application minutes add up to the active minutes at most. Only the program name is recorded — never window titles, documents, keystrokes or screenshots.</li>
          <li><b>First / last seen</b> is the first and last sample of the day (IST). Totals are per Windows user per computer per day, sent with every check-in (every 15 minutes); IT Hub keeps the higher running total, so a missed check-in loses nothing.</li>
          <li>Accuracy is ±1 minute per sample. An employee's usage is the sum over their computers; a shared computer shows each Windows user separately.</li>
          <li>What is recorded can be limited per employee under <b>Tracking rules</b> (administrators).</li>
        </ul>
      </CardContent></Card>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px] flex-wrap">
          {TABS.filter(([k]) => isAdmin || (k !== "usage" && k !== "apps")).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", tab === k ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l}</button>)}
        </div>
        {tab !== "tracking" && <>
          <div className="relative flex-1 min-w-[240px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder={tab === "software" ? "Software name, publisher or version…" : "Employee, emp code, computer, asset tag, Windows user…"} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} onBlur={go} /></div>
          {(tab === "usage" || tab === "apps") && <><Input type="date" className="w-40" value={from} max={to} onChange={e => setFrom(e.target.value)} /><span className="text-xs text-muted-foreground">to</span><Input type="date" className="w-40" value={to} min={from} max={today()} onChange={e => setTo(e.target.value)} /></>}
        </>}
      </div>
      {tab === "usage" && <UsageTab q={term} from={from} to={to} />}
      {tab === "apps" && <AppsTab q={term} from={from} to={to} />}
      {tab === "inventory" && <InventoryTab q={term} />}
      {tab === "software" && <SoftwareTab q={term} />}
      {tab === "tracking" && <TrackingTab canEdit={isAdmin} />}
    </div>
  );
}

function Table({ head, children, empty, loading }: { head: string[]; children: React.ReactNode; empty: boolean; loading: boolean }) {
  return <Card><CardContent className="p-0 overflow-x-auto max-h-[calc(100vh-330px)] overflow-y-auto">
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-card z-10"><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b">{head.map(h => <th key={h} className="p-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
      <tbody>{loading ? <tr><td colSpan={head.length} className="p-6 text-center text-muted-foreground">Loading…</td></tr> : empty ? <tr><td colSpan={head.length} className="p-6 text-center text-muted-foreground">Nothing found.</td></tr> : children}</tbody>
    </table>
  </CardContent></Card>;
}
const Emp = ({ r }: { r: any }) => r.employee ? <><div className="font-medium">{r.employeeCode || "—"} · {r.employee}</div><div className="text-muted-foreground">{r.department}</div></> : <span className="text-amber-700">Not assigned</span>;
const Track = ({ l }: { l: string }) => l && l !== "standard" ? <span className={cn("px-1.5 rounded text-[10px] font-semibold", TRACK[l]?.tone)}>{TRACK[l]?.label}</span> : null;

function UsageTab({ q, from, to }: { q: string; from: string; to: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["dd-usage", q, from, to], queryFn: () => apiFetch<any>(`/asset-agents/data/usage?${new URLSearchParams({ q, from, to })}`) });
  const rows: any[] = data?.rows || [];
  const people = useMemo(() => { const m = new Map<string, any>(); for (const r of rows) { const k = r.employeeId || r.windowsUser; const x = m.get(k) || { name: r.employee || r.windowsUser, code: r.employeeCode, active: 0, idle: 0, days: new Set() }; x.active += r.active; x.idle += r.idle; if (r.active > 0) x.days.add(r.day); m.set(k, x); } return [...m.values()].sort((a, b) => b.active - a.active); }, [rows]);
  const tot = rows.reduce((a, r) => a + r.active, 0);
  return <div className="space-y-3">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {[["People", people.length], ["Active time", hm(tot)], ["Average per person-day", hm(people.reduce((a, p) => a + p.days.size, 0) ? tot / people.reduce((a, p) => a + p.days.size, 0) : 0)], ["Rows", rows.length]].map(([l, v]) => <Card key={l as string}><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">{l}</div><div className="text-lg font-semibold">{v as any}</div></CardContent></Card>)}
    </div>
    <div className="flex justify-end"><Button size="sm" variant="outline" className="gap-1" onClick={() => csv(rows.map(r => ({ ...r, activeHm: hm(r.active), idleHm: hm(r.idle) })), [["Day", "day"], ["Employee Code", "employeeCode"], ["Employee", "employee"], ["Department", "department"], ["Computer", "hostname"], ["Asset", "assetTag"], ["Windows user", "windowsUser"], ["First seen", "firstSeen"], ["Last seen", "lastSeen"], ["Active minutes", "active"], ["Active", "activeHm"], ["Idle minutes", "idle"], ["Top application", "topApp"], ["Tracking", "tracking"]], `device_usage_${from}_${to}.csv`)}><Download className="w-3.5 h-3.5" />CSV</Button></div>
    <Table loading={isLoading} empty={!rows.length} head={["Day", "Employee", "Computer", "Windows user", "First seen", "Last seen", "Active", "Idle", "Top application"]}>
      {rows.map((r, i) => <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
        <td className="p-2.5 whitespace-nowrap">{fmtDate(r.day)}</td><td className="p-2.5"><Emp r={r} /> <Track l={r.tracking} /></td>
        <td className="p-2.5"><div className="font-medium">{r.hostname}</div><div className="text-muted-foreground">{r.assetTag || "not linked"}</div></td>
        <td className="p-2.5">{r.windowsUser}</td><td className="p-2.5 whitespace-nowrap">{time(r.firstSeen)}</td><td className="p-2.5 whitespace-nowrap">{time(r.lastSeen)}</td>
        <td className="p-2.5 font-semibold whitespace-nowrap">{hm(r.active)}</td><td className="p-2.5 text-muted-foreground whitespace-nowrap">{hm(r.idle)}</td><td className="p-2.5">{r.topApp || "—"}</td></tr>)}
    </Table>
  </div>;
}

function AppsTab({ q, from, to }: { q: string; from: string; to: string }) {
  const [app, setApp] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["dd-apps", q, from, to, app], queryFn: () => apiFetch<any>(`/asset-agents/data/apps?${new URLSearchParams({ q, from, to, app })}`) });
  const rows: any[] = data?.rows || []; const max = Math.max(1, ...rows.map(r => r.mins));
  return <div className="space-y-3">
    <div className="flex gap-2 items-center flex-wrap"><Input className="w-64" placeholder="Filter application, e.g. excel" value={app} onChange={e => setApp(e.target.value)} />
      <span className="text-xs text-muted-foreground">{q ? `For “${q}” · ` : ""}{hm(data?.totalActive)} active in total · application share is of that active time</span>
      <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={() => csv(rows.map(r => ({ ...r, hours: (r.mins / 60).toFixed(1), share: data?.totalActive ? `${Math.round(r.mins / data.totalActive * 100)}%` : "" })), [["Application", "app"], ["Active minutes", "mins"], ["Hours", "hours"], ["Share of active time", "share"], ["People", "users"], ["Computers", "devices"], ["Days used", "days"], ["Who", "people"]], `applications_${from}_${to}.csv`)}><Download className="w-3.5 h-3.5" />CSV</Button></div>
    <Table loading={isLoading} empty={!rows.length} head={["Application", "Active time", "Share", "People", "Computers", "Days", "Who"]}>
      {rows.map(r => <tr key={r.app} className="border-b last:border-0 hover:bg-muted/30">
        <td className="p-2.5 font-medium">{r.app}</td>
        <td className="p-2.5 min-w-[180px]"><div className="flex items-center gap-2"><div className="flex-1 h-2 bg-muted rounded"><div className="h-2 bg-primary/70 rounded" style={{ width: `${r.mins / max * 100}%` }} /></div><span className="w-14 text-right">{hm(r.mins)}</span></div></td>
        <td className="p-2.5">{data?.totalActive ? `${Math.round(r.mins / data.totalActive * 100)}%` : "—"}</td><td className="p-2.5">{r.users}</td><td className="p-2.5">{r.devices}</td><td className="p-2.5">{r.days}</td>
        <td className="p-2.5 text-muted-foreground max-w-[320px] truncate" title={r.people}>{r.people}</td></tr>)}
    </Table>
  </div>;
}

function InventoryTab({ q }: { q: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["dd-inv", q], queryFn: () => apiFetch<any>(`/asset-agents/data/inventory?${new URLSearchParams({ q })}`) });
  const rows: any[] = data?.rows || [];
  return <div className="space-y-3">
    <div className="flex justify-end"><Button size="sm" variant="outline" className="gap-1" onClick={() => csv(rows, [["Employee Code", "employeeCode"], ["Employee", "employee"], ["Computer", "hostname"], ["Asset", "assetTag"], ["Serial", "serial"], ["Make", "manufacturer"], ["Model", "model"], ["Type", "platform"], ["OS", "os"], ["OS version", "osVersion"], ["CPU", "cpu"], ["Memory GB", "memGb"], ["Disks", "disks"], ["Battery health %", "batteryPct"], ["Antivirus", "antivirus"], ["BitLocker", "bitlocker"], ["Last update", "lastPatch"], ["Uptime hours", "uptimeHours"], ["Last user", "lastUser"], ["IP", "ip"], ["Health", "health"], ["Last report", "lastSeenAt"], ["Agent", "agentVersion"], ["Tracking", "tracking"]], "device_inventory.csv")}><Download className="w-3.5 h-3.5" />CSV</Button></div>
    <Table loading={isLoading} empty={!rows.length} head={["Employee", "Computer", "Model / OS", "CPU · RAM", "Disks", "Battery", "Antivirus · BitLocker", "Last update", "Last report"]}>
      {rows.map(r => <tr key={r.agentId} className={cn("border-b last:border-0 hover:bg-muted/30", r.status === "Revoked" && "opacity-50")}>
        <td className="p-2.5"><Emp r={r} /> <Track l={r.tracking} /></td>
        <td className="p-2.5"><div className="font-medium">{r.hostname}</div><div className="text-muted-foreground">{r.assetTag || "not linked"} · SN {r.serial || "—"}</div><div className="text-muted-foreground">{r.lastUser} · {r.ip}</div></td>
        <td className="p-2.5"><div>{[r.manufacturer, r.model].filter(Boolean).join(" ")}</div><div className="text-muted-foreground">{r.os} {r.osVersion}</div></td>
        <td className="p-2.5"><div className="max-w-[180px] truncate" title={r.cpu}>{r.cpu || "—"}</div><div className="text-muted-foreground">{r.memGb ? `${r.memGb} GB` : ""}</div></td>
        <td className="p-2.5">{r.disks || "—"}</td><td className="p-2.5">{r.batteryPct && Number(r.batteryPct) > 0 ? `${Math.round(r.batteryPct)}%` : "—"}</td>
        <td className="p-2.5"><div>{r.antivirus || "—"}</div><div className="text-muted-foreground">{r.bitlocker || ""}</div></td>
        <td className="p-2.5 whitespace-nowrap">{r.lastPatch ? fmtDate(r.lastPatch) : "—"}</td><td className="p-2.5 whitespace-nowrap">{r.lastSeenAt ? fmtDateTime(r.lastSeenAt) : "never"}<div className="text-muted-foreground">{r.health} · v{r.agentVersion}</div></td></tr>)}
    </Table>
  </div>;
}

function SoftwareTab({ q }: { q: string }) {
  const [who, setWho] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["dd-sw", q, who], queryFn: () => apiFetch<any>(`/asset-agents/data/software?${new URLSearchParams({ q, who })}`) });
  const rows: any[] = data?.rows || [];
  return <div className="space-y-3">
    <div className="flex gap-2 flex-wrap"><Input className="w-72" placeholder="Only on: employee, computer or asset…" value={who} onChange={e => setWho(e.target.value)} />
      <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={() => csv(rows, [["Software", "name"], ["Version", "version"], ["Publisher", "publisher"], ["Computers", "devices"], ["Installed on", "computers"]], "installed_software.csv")}><Download className="w-3.5 h-3.5" />CSV</Button></div>
    <Table loading={isLoading} empty={!rows.length} head={["Software", "Version", "Publisher", "Computers", "Installed on"]}>
      {rows.map((r, i) => <tr key={i} className="border-b last:border-0 hover:bg-muted/30"><td className="p-2.5 font-medium">{r.name}</td><td className="p-2.5">{r.version || "—"}</td><td className="p-2.5 text-muted-foreground">{r.publisher || "—"}</td><td className="p-2.5 font-semibold">{r.devices}</td><td className="p-2.5 text-muted-foreground max-w-[420px] truncate" title={r.computers}>{r.computers}</td></tr>)}
    </Table>
  </div>;
}

function TrackingTab({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ["dd-tracking"], queryFn: () => apiFetch<any>("/asset-agents/tracking") });
  const [edit, setEdit] = useState<any>(null);
  const rules: any[] = data?.rules || [];
  return <div className="space-y-3">
    <Card><CardContent className="p-4 text-sm space-y-2">
      <div>Everyone is <b>Standard</b> unless listed here. Application tracking for everyone is currently <b>{data?.globalApps === false ? "off" : "on"}</b>. A rule applies to all computers of the employee (register holder, else the employee of the installer key); the agent stops collecting within 10 minutes of the next check-in, and IT Hub ignores anything it is not allowed to keep.</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">{Object.entries(TRACK).map(([k, v]) => <div key={k} className="rounded-lg border p-2"><span className={cn("px-1.5 rounded font-semibold", v.tone)}>{v.label}</span><div className="text-muted-foreground mt-1">{v.text}</div></div>)}</div>
      {canEdit ? <Button size="sm" className="gap-1" onClick={() => setEdit({})}><UserCog className="w-4 h-4" />Set tracking for an employee</Button> : <div className="text-xs text-muted-foreground">Only an administrator can change tracking rules.</div>}
    </CardContent></Card>
    <Table loading={isLoading} empty={!rules.length} head={["Employee", "Tracking", "Reason", "Set by", "Computers", ""]}>
      {rules.map(r => <tr key={r.userId} className="border-b last:border-0"><td className="p-2.5"><div className="font-medium">{r.employeeCode || "—"} · {r.name}</div><div className="text-muted-foreground">{r.department}</div></td>
        <td className="p-2.5"><span className={cn("px-1.5 rounded font-semibold", TRACK[r.level]?.tone)}>{TRACK[r.level]?.label}</span></td><td className="p-2.5 max-w-[320px]">{r.reason}</td>
        <td className="p-2.5 whitespace-nowrap">{String(r.setBy || "").replace(/ <.*>$/, "")}<div className="text-muted-foreground">{fmtDateTime(r.setAt)}</div></td><td className="p-2.5">{r.devices}</td>
        <td className="p-2.5 text-right">{canEdit && <Button size="sm" variant="ghost" onClick={() => setEdit({ userId: r.userId, name: r.name, employeeCode: r.employeeCode, level: r.level })}>Change</Button>}</td></tr>)}
    </Table>
    {edit && <TrackingDialog init={edit} onClose={() => setEdit(null)} />}
  </div>;
}

export function TrackingDialog({ init, onClose }: { init: any; onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: people = [] } = useQuery({ queryKey: ["asset-people"], queryFn: () => apiFetch<any[]>("/asset-people") });
  const [user, setUser] = useState<any>(init.userId ? { id: init.userId, name: init.name, employeeCode: init.employeeCode } : null); const [uq, setUq] = useState("");
  const [level, setLevel] = useState(init.level || "excluded"); const [reason, setReason] = useState(""); const [purge, setPurge] = useState(false); const [busy, setBusy] = useState(false);
  const matches = people.filter((p: any) => uq.trim().length > 1 && [p.name, p.email, p.employeeCode].some((v: string) => v?.toLowerCase().includes(uq.trim().toLowerCase()))).slice(0, 8);
  async function save() {
    setBusy(true);
    try { const r = await apiFetch<any>(`/asset-agents/tracking/${user.id}`, { method: "PUT", body: JSON.stringify({ level, reason: reason.trim(), purge }) }); toast({ title: `Tracking for ${user.name}: ${TRACK[level].label}`, description: r.purged ? `${r.purged} day(s) of collected data ${level === "excluded" ? "deleted" : "stripped of applications"}` : undefined }); qc.invalidateQueries({ queryKey: ["dd-tracking"] }); onClose(); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-lg">
    <DialogHeader><DialogTitle>Tracking for an employee</DialogTitle><DialogDescription>Choose what the agent may record on this employee's computers. The change and its reason are kept in the audit log.</DialogDescription></DialogHeader>
    <div className="space-y-3">
      {user ? <div className="flex items-center gap-2 rounded-lg border p-2 text-sm"><div className="flex-1"><b>{user.employeeCode || "—"}</b> · {user.name}</div>{!init.userId && <Button size="sm" variant="ghost" onClick={() => setUser(null)}>Change</Button>}</div>
        : <><Input placeholder="Search name, employee code or email…" value={uq} onChange={e => setUq(e.target.value)} />
          {matches.length > 0 && <div className="border rounded-lg divide-y max-h-44 overflow-y-auto">{matches.map((p: any) => <button key={p.id} onClick={() => { setUser(p); setUq(""); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50"><b>{p.employeeCode || "—"}</b> · {p.name}<span className="text-xs text-muted-foreground"> · {p.department || p.email}</span></button>)}</div>}</>}
      <div className="grid gap-1.5">{Object.entries(TRACK).map(([k, v]) => <label key={k} className={cn("flex gap-2 rounded-lg border p-2 cursor-pointer text-sm", level === k && "border-primary bg-primary/5")}><input type="radio" className="mt-1" checked={level === k} onChange={() => setLevel(k)} /><div><div className="font-medium">{v.label}</div><div className="text-xs text-muted-foreground">{v.text}</div></div></label>)}</div>
      <div className="space-y-1"><div className="text-xs font-medium">Reason *</div><Textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Board member — usage tracking not required as per HR" /></div>
      {(level === "excluded" || level === "usage") && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={purge} onChange={e => setPurge(e.target.checked)} /><span>{level === "excluded" ? "Also delete the usage already collected for this employee" : "Also remove the application data already collected for this employee"} (cannot be undone)</span></label>}
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy || !user || reason.trim().length < 10}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Save</Button></DialogFooter>
  </DialogContent></Dialog>;
}
