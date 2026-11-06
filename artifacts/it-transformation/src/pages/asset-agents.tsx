import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { StatCard } from "@/components/stat-card";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtCell } from "@/lib/date";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/components/confirm-dialog";
import { AssetHealthPanel, HealthBadge, ago, hm } from "@/components/asset-health";
import { StartChatDialog, ChatThread, ChatStatus } from "@/components/device-chat";
import { MessageSquare, Activity, AlertTriangle, CheckCircle2, WifiOff, Link2, Search, KeyRound, Download, Copy, Trash2, Server, Laptop, Loader2, RefreshCw } from "lucide-react";

/* IT Assets › Device Agents — devices running the IT Hub agent: health, last report, usage; enrolment codes and installers. */

const PAGE = 15;
const TABS = ["All", "Critical", "Warning", "Offline", "Healthy", "Not linked", "Removed"] as const;
const FILES = ["install.cmd", "Install-ITHubAgent.ps1", "ITHubAgent.ps1", "Uninstall-ITHubAgent.ps1", "README.txt"];

async function download(file: string) {
  const r = await fetch(`/api/asset-agents/package/${file}`, { credentials: "include" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Download failed (${r.status})`);
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await r.blob()), download: file }); a.click(); URL.revokeObjectURL(a.href);
}

export default function AssetAgents() {
  const qc = useQueryClient(); const { toast } = useToast(); const [, navigate] = useLocation();
  const { canAccess } = useAuth(); const canEdit = canAccess("asset_registry", "write");
  const { data, isLoading } = useQuery({ queryKey: ["asset-agents"], queryFn: () => apiFetch<any>("/asset-agents"), refetchInterval: 60_000 });
  const agents: any[] = data?.agents || []; const sum = data?.summary || {};
  const [tab, setTab] = useState<typeof TABS[number]>("All"); const [q, setQ] = useState(""); const [kind, setKind] = useState(""); const [page, setPage] = useState(1);
  const [view, setView] = useState<any>(null); const [link, setLink] = useState<any>(null); const [enrol, setEnrol] = useState(false); const [person, setPerson] = useState<number | null>(null); const [chatFor, setChatFor] = useState<any>(null); const [openChat, setOpenChat] = useState<number | null>(null);
  const count = (t: string) => agents.filter(a => match(a, t)).length;
  function match(a: any, t: string) {
    if (t === "Removed") return a.status === "Revoked";
    if (a.status === "Revoked") return false;
    if (t === "All") return true; if (t === "Not linked") return !a.assetId;
    return a.healthState === t;
  }
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return agents.filter(a => match(a, tab) && (!kind || a.platform === kind) &&
    (!s || [a.hostname, a.assetTag, a.serialNumber, a.lastUser, a.ownerName, a.ownerEmployeeCode, a.keyUserName, a.keyEmployeeCode, a.model, a.alertText, a.department, a.location, a.keyDepartment].some((v: string) => v?.toLowerCase().includes(s)))); }, [agents, tab, q, kind]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["asset-agents"] }); qc.invalidateQueries({ queryKey: ["asset-health"] }); };
  async function remove(a: any) {
    if (!await confirmDialog(`Remove ${a.hostname} from IT Hub? The agent on the device stops reporting at its next check-in. History is kept.`, { title: "Remove device", confirmText: "Remove" })) return;
    try { await apiFetch(`/asset-agents/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: "Revoked" }) }); toast({ title: `${a.hostname} removed` }); refresh(); }
    catch (e: any) { toast({ title: "Could not remove", description: e.message, variant: "destructive" }); }
  }
  function exportCsv() {
    const cols: [string, string][] = [["Employee Code", "empCode"], ["Employee", "empName"], ["Computer", "hostname"], ["Asset Tag", "assetTag"], ["Serial", "serialNumber"], ["Type", "platform"], ["Model", "model"], ["OS", "osName"], ["User", "lastUser"], ["Owner", "ownerName"], ["Health", "healthState"], ["Issues", "alertText"],
      ["CPU %", "cpu"], ["Memory %", "mem"], ["Lowest disk free %", "diskFreePct"], ["Battery health %", "batteryHealthPct"], ["Active minutes (7 days)", "active7d"], ["Last used", "lastActiveAt"], ["Last report", "lastSeenAt"], ["Agent", "agentVersion"]];
    const e = (v: any) => { const x = String(fmtCell(v) ?? "").replace(/"/g, '""'); return /[,"\n]/.test(x) ? `"${x}"` : x; };
    const csv = [cols.map(c => c[0]).join(","), ...list.map(r => { const m = empOf(r); return { ...r, empCode: m?.code, empName: m?.name }; }).map(r => cols.map(c => e((r as any)[c[1]])).join(","))].join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `device_health_${new Date().toISOString().slice(0, 10)}.csv` }); a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><img src={`${import.meta.env.BASE_URL}niytri-agent.png`} alt="" className="w-7 h-7 rounded-md" />Device Health</h1>
          <p className="text-sm text-muted-foreground">Live health and daily usage reported by the IT Hub agent on laptops, desktops and servers. Devices are matched to the register by serial number.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}><Download className="w-4 h-4" />Export CSV</Button>
          {canEdit && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/asset-agents/chats")}><MessageSquare className="w-4 h-4" />IT chats</Button>}
          {canEdit && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/asset-agents/keys")}><KeyRound className="w-4 h-4" />Installation keys</Button>}
          {canEdit && <Button className="gap-2" onClick={() => setEnrol(true)}><KeyRound className="w-4 h-4" />Install agent / keys</Button>}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Activity} label="Devices reporting" value={sum.total ?? 0} sub={`${sum.servers ?? 0} servers`} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={CheckCircle2} label="Healthy" value={sum.healthy ?? 0} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={AlertTriangle} label="Warning" value={sum.warning ?? 0} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={AlertTriangle} label="Critical" value={sum.critical ?? 0} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" valueColor={sum.critical ? "text-red-600" : undefined} />
        <StatCard icon={WifiOff} label="Offline" value={sum.offline ?? 0} sub={`not reported for ${data?.settings?.thresholds?.offlineDays ?? 7}+ days`} iconBg="bg-slate-100 dark:bg-slate-800" iconColor="text-slate-500" borderColor="border-l-slate-400" />
      </div>
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px] flex-wrap">
            {TABS.map(t => <button key={t} onClick={() => { setTab(t); setPage(1); }} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", tab === t ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>{t} <span className="ml-1 text-[11px] text-muted-foreground">{count(t)}</span></button>)}
          </div>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={kind} onChange={e => { setKind(e.target.value); setPage(1); }}><option value="">Laptops, desktops &amp; servers</option><option value="Workstation">Laptops / desktops</option><option value="Server">Servers</option></select>
          <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search employee, emp code, asset tag, computer, serial, issue…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="py-2 pr-3 font-semibold">Employee</th><th className="py-2 pr-3 font-semibold">Device</th><th className="py-2 pr-3 font-semibold">Asset</th><th className="py-2 pr-3 font-semibold">Health</th><th className="py-2 pr-3 font-semibold">CPU / Mem / Disk / Battery</th><th className="py-2 pr-3 font-semibold">Usage (7 days)</th><th className="py-2 pr-3 font-semibold">Last report</th><th className="py-2 font-semibold text-right">Actions</th>
            </tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && !list.length && <tr><td colSpan={8} className="py-12 text-center text-muted-foreground"><Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />{agents.length ? "No devices match." : "No devices yet — use Install agent / keys to roll out the agent."}</td></tr>}
              {list.slice((page - 1) * PAGE, page * PAGE).map(a => (
                <tr key={a.id} className={cn("border-b last:border-0 hover:bg-muted/40 cursor-pointer", a.status === "Revoked" && "opacity-60")} onClick={() => setView(a)}>
                  <td className="py-2.5 pr-3" onClick={e => { const m = empOf(a); if (m?.id) { e.stopPropagation(); setPerson(m.id); } }}>{(() => { const m = empOf(a); return m ? <>
                    <div className="font-semibold text-primary hover:underline">{m.code || "—"}</div><div className="text-xs">{m.name}</div>
                    <div className="text-[11px] text-muted-foreground">{[m.dept, m.src].filter(Boolean).join(" · ")}</div>
                    {m.mismatch && <div className="text-[11px] text-amber-700 dark:text-amber-300">Key was for {a.keyUserName}</div>}</> : <span className="text-xs text-amber-700 dark:text-amber-300">No employee</span>; })()}</td>
                  <td className="py-2.5 pr-3"><div className="font-semibold flex items-center gap-1.5">{a.platform === "Server" ? <Server className="w-3.5 h-3.5 text-muted-foreground" /> : <Laptop className="w-3.5 h-3.5 text-muted-foreground" />}{a.hostname}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[220px]">{[a.model, a.osName].filter(Boolean).join(" · ")}</div><div className="text-[11px] text-muted-foreground">{a.lastUser || "—"}</div></td>
                  <td className="py-2.5 pr-3">{a.assetId ? <><div className="font-medium">{a.assetTag}</div><div className="text-xs text-muted-foreground">{a.ownerName || a.assetName}</div></>
                    : <div><span className="text-xs text-amber-700 dark:text-amber-300">Not linked</span><div className="text-[11px] text-muted-foreground max-w-[200px]">{a.matchNote}</div></div>}</td>
                  <td className="py-2.5 pr-3"><HealthBadge state={a.status === "Revoked" ? "Removed" : a.healthState} />{a.alertText && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[260px] line-clamp-2" title={a.alertText}>{a.alertText}</div>}
                    {(a.ignoredAlerts > 0 || a.tickets || a.openChats > 0) && <div className="text-[11px] mt-0.5 flex gap-2 flex-wrap">{a.tickets && <span className="text-primary">{a.tickets}</span>}{a.ignoredAlerts > 0 && <span className="text-muted-foreground">{a.ignoredAlerts} ignored</span>}{a.openChats > 0 && <span className="text-amber-700">{a.openChats} chat open</span>}</div>}</td>
                  <td className="py-2.5 pr-3 text-xs whitespace-nowrap">{[a.cpu, a.mem].map(v => v == null ? "—" : `${Math.round(v)}%`).join(" / ")} / <span className={cn(a.diskFreePct != null && a.diskFreePct < 10 && "text-red-600 font-semibold")}>{a.diskFreePct == null ? "—" : `${Math.round(a.diskFreePct)}% free`}</span>{a.batteryHealthPct != null && <> / <span className={cn(a.batteryHealthPct < 60 && "text-amber-600 font-semibold")}>{Math.round(a.batteryHealthPct)}%</span></>}</td>
                  <td className="py-2.5 pr-3 text-xs"><div className="font-medium">{hm(a.active7d)} active</div><div className="text-muted-foreground">last used {a.lastActiveAt ? fmtDateTime(a.lastActiveAt) : a.lastActiveDay ? fmtDate(a.lastActiveDay) : "—"}</div></td>
                  <td className="py-2.5 pr-3 text-xs whitespace-nowrap"><div className="font-medium">{a.lastSeenAt ? fmtDateTime(a.lastSeenAt) : "never"}</div><div className="text-muted-foreground">{ago(a.lastSeenAt)} · v{a.agentVersion || "?"}</div></td>
                  <td className="py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    {canEdit && a.status !== "Revoked" && <Button size="sm" variant="ghost" className="h-8 gap-1" title="Link employee and asset (updates the register)" onClick={() => setLink(a)}><Link2 className="w-4 h-4" />{!a.assetId || a.assetStatus !== "Allocated" ? "Assign" : ""}</Button>}
                    {canEdit && a.status !== "Revoked" && <Button size="sm" variant="ghost" className="h-8 text-red-600" title="Remove device" onClick={() => remove(a)}><Trash2 className="w-4 h-4" /></Button>}
                    {canEdit && a.status === "Revoked" && <Button size="sm" variant="ghost" className="h-8" onClick={async () => { await apiFetch(`/asset-agents/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: "Active" }) }); refresh(); }}>Re-enable</Button>}
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={Math.ceil(list.length / PAGE) || 1} totalItems={list.length} pageSize={PAGE} onPageChange={setPage} />
      </CardContent></Card>

      {view && <Sheet open onOpenChange={o => !o && setView(null)}><SheetContent className="w-full sm:max-w-[640px] overflow-y-auto">
        <SheetHeader><SheetTitle>{view.hostname}{view.assetTag ? ` · ${view.assetTag}` : ""}</SheetTitle>
          <SheetDescription>{[view.model, view.serialNumber && `SN ${view.serialNumber}`].filter(Boolean).join(" · ")}</SheetDescription></SheetHeader>
        {(() => { const m = empOf(view); return <div className="mt-3 rounded-lg border p-3 flex flex-wrap items-center gap-3 text-sm">
          <div className="flex-1 min-w-[200px]"><div className="text-[11px] text-muted-foreground">Employee</div>{m ? <button className="font-medium text-primary hover:underline text-left" onClick={() => m.id && setPerson(m.id)}>{m.code} · {m.name}</button> : <span className="text-amber-700">Not assigned</span>}
            <div className="text-[11px] text-muted-foreground">{m?.src}{view.lastUser ? ` · signed in as ${view.lastUser}` : ""}</div></div>
          <div className="flex-1 min-w-[160px]"><div className="text-[11px] text-muted-foreground">Register asset</div>{view.assetTag ? <><div className="font-medium">{view.assetTag}</div><div className="text-[11px] text-muted-foreground">{view.assetStatus}{view.ownerName ? ` · ${view.ownerName}` : ""}</div></> : <span className="text-amber-700">Not linked</span>}</div>
          {canEdit && view.status !== "Revoked" && <div className="flex flex-col gap-1"><Button size="sm" variant="outline" className="gap-1" onClick={() => setLink(view)}><Link2 className="w-3.5 h-3.5" />Assign / change</Button>
            {m && <Button size="sm" variant="outline" className="gap-1" onClick={() => setChatFor({ agent: view, employee: m.name })}><MessageSquare className="w-3.5 h-3.5" />Chat with employee</Button>}</div>}
        </div>; })()}
        {canEdit && <DeviceChats agentId={view.id} onOpen={setOpenChat} />}
        <div className="mt-4"><AssetHealthPanel agentId={view.id} canAct={canEdit} onChat={(al: any) => { const m = empOf(view); if (!m) { toast({ title: "Assign an employee to this device first", variant: "destructive" }); return; } setChatFor({ agent: view, alert: al, employee: m.name }); }} /></div></SheetContent></Sheet>}
      {chatFor && <StartChatDialog agent={chatFor.agent} alert={chatFor.alert} employee={chatFor.employee} onClose={() => setChatFor(null)} onStarted={(id: number) => { setChatFor(null); refresh(); qc.invalidateQueries({ queryKey: ["device-chats"] }); setOpenChat(id); }} />}
      {openChat && <Dialog open onOpenChange={o => !o && setOpenChat(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>IT chat</DialogTitle></DialogHeader><ChatThread chatId={openChat} mode="it" onChanged={refresh} /></DialogContent></Dialog>}
      {link && <AssignDialog agent={link} onClose={() => setLink(null)} onDone={() => { refresh(); setView(null); }} />}
      {person && <EmployeeSheet userId={person} onClose={() => setPerson(null)} onDevice={(d: any) => { setPerson(null); const a = agents.find(x => x.id === d.id); if (a) setView(a); }} />}
      {enrol && <EnrolDialog onClose={() => setEnrol(false)} />}
    </div>
  );
}

/** Who the device belongs to: register holder first, else the employee whose installer key was used. */
function empOf(a: any) {
  if (a.ownerId && a.assetStatus === "Allocated") return { id: a.ownerId, name: a.ownerName, code: a.ownerEmployeeCode, dept: a.ownerDepartment || a.department, src: `Holds ${a.assetTag}`, mismatch: !!(a.keyUserId && a.keyUserId !== a.ownerId) };
  if (a.keyUserId) return { id: a.keyUserId, name: a.keyUserName, code: a.keyEmployeeCode, dept: a.keyDepartment, src: a.assetId ? "Installer key · not issued in register" : "Installer key", mismatch: false };
  return null;
}

/** Link the device to an employee and a register asset; optionally issue the asset to the employee (handover in the register). */
function AssignDialog({ agent, onClose, onDone }: { agent: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });
  const { data: people = [] } = useQuery({ queryKey: ["asset-people"], queryFn: () => apiFetch<any[]>("/asset-people") });
  const cur = empOf(agent);
  const [userId, setUserId] = useState<number | null>(cur?.id ?? null); const [uq, setUq] = useState("");
  const bySerial = useMemo(() => assets.filter((a: any) => agent.serialNumber && a.serialNumber && a.serialNumber.toLowerCase() === String(agent.serialNumber).toLowerCase()), [assets, agent]);
  const [mode, setMode] = useState<"existing" | "new">(agent.assetId || bySerial.length ? "existing" : "new");
  const [assetId, setAssetId] = useState<number | null>(agent.assetId || bySerial[0]?.id || null); const [aq, setAq] = useState("");
  const guessType = agent.platform === "Server" ? "Server" : /book|laptop|notebook/i.test(agent.model || "") ? "Laptop" : "Desktop";
  const [type, setType] = useState(guessType); const [name, setName] = useState([agent.manufacturer, agent.model].filter(Boolean).join(" ") || agent.hostname);
  const [issue, setIssue] = useState(true); const [reassign, setReassign] = useState(false); const [busy, setBusy] = useState(false);
  const user = people.find((p: any) => p.id === userId);
  const asset = assets.find((a: any) => a.id === assetId);
  const pMatches = people.filter((p: any) => uq.trim().length > 1 && [p.name, p.email, p.employeeCode].some((v: string) => v?.toLowerCase().includes(uq.trim().toLowerCase()))).slice(0, 8);
  const aMatches = assets.filter((a: any) => aq.trim().length > 1 && [a.assetTag, a.serialNumber, a.name, a.ownerName, a.ownerEmployeeCode].some((v: string) => v?.toLowerCase().includes(aq.trim().toLowerCase()))).slice(0, 8);
  const heldByOther = mode === "existing" && asset?.status === "Allocated" && user && (asset.ownerEmployeeCode || "").toLowerCase() !== (user.employeeCode || "").toLowerCase();
  const sameHolder = mode === "existing" && asset?.status === "Allocated" && user && !heldByOther;
  const canIssueState = mode === "new" || !asset || ["In Stock", "Allocated"].includes(asset.status);
  async function save() {
    setBusy(true);
    try {
      const body: any = { userId: userId || undefined, issue: !!(issue && userId && !sameHolder && canIssueState), reassign };
      if (mode === "existing") body.assetId = assetId; else body.newAsset = { type, name };
      const r = await apiFetch<any>(`/asset-agents/${agent.id}/assign`, { method: "POST", body: JSON.stringify(body) });
      toast({ title: `${agent.hostname} linked${r.assetTag ? ` to ${r.assetTag}` : ""}`, description: [r.created && "New asset added to the register", r.issued?.handoverNo && `${r.issued.action} — handover ${r.issued.handoverNo}; the employee acknowledges it in My Assets`].filter(Boolean).join(". ") || undefined });
      onDone(); onClose();
    } catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  async function unlink() {
    setBusy(true);
    try { await apiFetch(`/asset-agents/${agent.id}/assign`, { method: "POST", body: JSON.stringify({ assetId: null }) }); toast({ title: "Device unlinked from the asset" }); onDone(); onClose(); }
    catch (e: any) { toast({ title: "Could not unlink", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  const Pill = ({ on, children, onClick }: any) => <button type="button" onClick={onClick} className={cn("px-2.5 py-1 rounded-md border text-xs", on ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground")}>{children}</button>;
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Assign {agent.hostname}</DialogTitle><DialogDescription>Reported serial {agent.serialNumber || "—"} · {agent.model || ""}{agent.lastUser ? ` · signed in as ${agent.lastUser}` : ""}. The IT Asset register is updated too.</DialogDescription></DialogHeader>
      <section className="space-y-1.5">
        <div className="text-xs font-semibold">1. Employee</div>
        {user ? <div className="flex items-center gap-2 rounded-lg border p-2 text-sm"><div className="flex-1"><b>{user.employeeCode || "no code"}</b> · {user.name}<div className="text-xs text-muted-foreground">{[user.department, user.email].filter(Boolean).join(" · ")}{cur && cur.id === user.id ? ` · ${cur.src}` : ""}</div></div><Button size="sm" variant="ghost" onClick={() => setUserId(null)}>Change</Button></div>
          : <><Input placeholder="Search name, employee code or email…" value={uq} onChange={e => setUq(e.target.value)} />
            {pMatches.length > 0 && <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">{pMatches.map((p: any) => <button key={p.id} disabled={!p.selectable} onClick={() => { setUserId(p.id); setUq(""); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"><b>{p.employeeCode || "no code"}</b> · {p.name}<span className="text-xs text-muted-foreground"> · {p.department || p.email}</span></button>)}</div>}</>}
        {user && !user.employeeCode && <div className="text-xs text-red-600">This person has no Employee Code in User Master — add it before issuing.</div>}
      </section>
      <section className="space-y-1.5">
        <div className="text-xs font-semibold">2. Register asset</div>
        <div className="flex gap-2"><Pill on={mode === "existing"} onClick={() => setMode("existing")}>Existing asset</Pill><Pill on={mode === "new"} onClick={() => setMode("new")}>Add this computer to the register</Pill></div>
        {mode === "existing" ? <>
          {bySerial.length > 0 && <div className="text-xs text-emerald-700 dark:text-emerald-300">Found in the register by serial number</div>}
          {asset ? <div className="flex items-center gap-2 rounded-lg border p-2 text-sm"><div className="flex-1"><b>{asset.assetTag}</b> · {asset.type} · {asset.name}<div className="text-xs text-muted-foreground">SN {asset.serialNumber || "—"} · {asset.status}{asset.ownerName ? ` · with ${asset.ownerName}${asset.ownerEmployeeCode ? ` (${asset.ownerEmployeeCode})` : ""}` : ""}</div>
            {asset.serialNumber && agent.serialNumber && asset.serialNumber.toLowerCase() !== String(agent.serialNumber).toLowerCase() && <div className="text-xs text-amber-700">Serial differs from what the computer reports ({agent.serialNumber})</div>}</div>
            <Button size="sm" variant="ghost" onClick={() => setAssetId(null)}>Change</Button></div>
            : <><Input placeholder="Search tag, serial, name, holder…" value={aq} onChange={e => setAq(e.target.value)} />
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">{aMatches.map((a: any) => <button key={a.id} onClick={() => { setAssetId(a.id); setAq(""); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50"><b>{a.assetTag}</b> · {a.type} · {a.name}<div className="text-xs text-muted-foreground">SN {a.serialNumber || "—"} · {a.status}{a.ownerName ? ` · ${a.ownerName}` : ""}</div></button>)}
                {aq.trim().length > 1 && !aMatches.length && <div className="px-3 py-2 text-sm text-muted-foreground">No match — use “Add this computer to the register”.</div>}</div></>}
        </> : <div className="grid sm:grid-cols-[140px_1fr] gap-2 rounded-lg border p-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={type} onChange={e => setType(e.target.value)}><option>Laptop</option><option>Desktop</option><option>Server</option></select>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Asset name" />
          <div className="sm:col-span-2 text-xs text-muted-foreground">New tag is created automatically. Serial {agent.serialNumber || "—"}, OS and model come from the device; add cost, vendor and warranty later in Asset Registry.</div>
        </div>}
      </section>
      <section className="space-y-1.5">
        <div className="text-xs font-semibold">3. Register holder</div>
        {sameHolder ? <div className="text-sm text-emerald-700 dark:text-emerald-300">Already issued to {user.name} in the register.</div>
          : !canIssueState ? <div className="text-sm text-amber-700">{asset?.assetTag} is “{asset?.status}” — it can't be issued from here.</div>
          : <>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={issue} disabled={!userId} onChange={e => setIssue(e.target.checked)} /><span>Issue the asset to {user ? user.name : "the employee"} in the register (creates a handover; they acknowledge it in My Assets)</span></label>
            {issue && heldByOther && <label className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300"><input type="checkbox" className="mt-1" checked={reassign} onChange={e => setReassign(e.target.checked)} /><span>{asset.assetTag} is with {asset.ownerName} ({asset.ownerEmployeeCode}) — move it from the current holder</span></label>}
          </>}
      </section>
      <DialogFooter className="gap-2">{agent.assetId && <Button variant="outline" disabled={busy} onClick={unlink}>Unlink asset</Button>}
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy || (mode === "existing" && !assetId) || (mode === "new" && !name.trim()) || (issue && heldByOther && !reassign) || (issue && !!user && !user.employeeCode)}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Save</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

/** One employee: their devices, register assets, usage across devices, apps and issues. */
function EmployeeSheet({ userId, onClose, onDevice }: { userId: number; onClose: () => void; onDevice: (d: any) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["agent-employee", userId], queryFn: () => apiFetch<any>(`/asset-agents/employee/${userId}`) });
  const u = data?.employee; const usage: any[] = data?.usage || [];
  const tot = usage.reduce((a, d) => a + (d.active || 0), 0); const days = usage.filter(d => d.active > 0).length;
  const max = Math.max(60, ...usage.map(d => d.active || 0));
  const tm = (t: any) => t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
  const avgStart = (() => { const v = usage.filter(d => d.firstSeen).map(d => { const x = new Date(d.firstSeen); return Number(x.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })) * 60 + x.getMinutes(); }); if (!v.length) return "—"; const m = Math.round(v.reduce((a, b) => a + b, 0) / v.length); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; })();
  const appMax = Math.max(1, ...(data?.apps || []).map((a: any) => a.mins));
  return (
    <Sheet open onOpenChange={o => !o && onClose()}><SheetContent className="w-full sm:max-w-[680px] overflow-y-auto">
      <SheetHeader><SheetTitle>{u ? `${u.employeeCode || "—"} · ${u.name}` : "Employee"}</SheetTitle><SheetDescription>{u ? [u.designation, u.department, u.email, u.userType === "external" ? "External" : "Internal", u.lastLoginAt && `last IT Hub sign-in ${fmtDateTime(u.lastLoginAt)}`].filter(Boolean).join(" · ") : ""}</SheetDescription></SheetHeader>
      {isLoading ? <div className="py-8 text-sm text-muted-foreground">Loading…</div> : <div className="mt-4 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[["Devices", data.devices.length], ["Assets held", data.assets.length], ["Active (30 days)", hm(tot)], ["Avg per working day", hm(days ? tot / days : 0)], ["Days used", `${days} / 30`], ["Usual start", avgStart], ["Open issues", data.alerts.filter((a: any) => !a.closedAt).length], ["Last report", data.devices[0]?.lastSeenAt ? fmtDateTime(data.devices[0].lastSeenAt) : "—"]].map(([l, v]) =>
            <div key={l as string} className="rounded-lg border p-2"><div className="text-[11px] text-muted-foreground">{l}</div><div className="text-lg font-semibold">{v as any}</div></div>)}
        </div>
        <section><h4 className="text-xs font-semibold mb-1">Daily active time (30 days)</h4>
          <div className="flex items-end gap-[3px] h-24 border-b">{usage.map(d => <div key={d.day} className="flex-1 bg-primary/70 rounded-t" style={{ height: `${Math.max(2, (d.active || 0) / max * 100)}%` }} title={`${fmtDate(d.day)}: ${hm(d.active)} active · ${tm(d.firstSeen)}–${tm(d.lastSeen)}`} />)}
            {!usage.length && <div className="text-xs text-muted-foreground m-auto">No usage reported yet</div>}</div></section>
        <section><h4 className="text-xs font-semibold mb-1">Devices</h4>
          <div className="border rounded-lg divide-y text-sm">{data.devices.map((d: any) => <button key={d.id} onClick={() => onDevice(d)} className="w-full text-left px-3 py-2 hover:bg-muted/50 flex flex-wrap gap-2 items-center"><b>{d.hostname}</b><span className="text-xs text-muted-foreground">{d.assetTag || "not linked"} · {d.model}</span><span className="ml-auto"><HealthBadge state={d.status === "Revoked" ? "Removed" : d.healthState} /></span><span className="text-xs text-muted-foreground w-full">{d.alertText || "No open issues"} · last report {d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : "never"} · v{d.agentVersion}</span></button>)}
            {!data.devices.length && <div className="px-3 py-2 text-sm text-muted-foreground">No device with the agent.</div>}</div></section>
        <section><h4 className="text-xs font-semibold mb-1">Assets in the register</h4>
          <div className="border rounded-lg divide-y text-sm">{data.assets.map((a: any) => <div key={a.id} className="px-3 py-1.5 flex gap-2 flex-wrap"><b>{a.assetTag}</b><span>{a.type} · {a.name}</span><span className="text-xs text-muted-foreground ml-auto">SN {a.serialNumber || "—"} · {a.reportsAs ? `agent: ${a.reportsAs}` : a.type === "Laptop" || a.type === "Desktop" ? "no agent" : ""}</span></div>)}
            {!data.assets.length && <div className="px-3 py-2 text-sm text-muted-foreground">Nothing issued in the register.</div>}</div></section>
        {data.apps.length > 0 && <section><h4 className="text-xs font-semibold mb-1">Top applications (30 days)</h4>
          <div className="space-y-1">{data.apps.map((a: any) => <div key={a.app} className="flex items-center gap-2 text-xs"><span className="w-40 truncate">{a.app}</span><div className="flex-1 h-2 bg-muted rounded"><div className="h-2 bg-primary/70 rounded" style={{ width: `${a.mins / appMax * 100}%` }} /></div><span className="w-14 text-right">{hm(a.mins)}</span></div>)}</div></section>}
        <section><h4 className="text-xs font-semibold mb-1">Device issues</h4>
          <div className="border rounded-lg divide-y text-xs">{data.alerts.map((a: any, i: number) => <div key={i} className="px-3 py-1.5 flex gap-2 flex-wrap"><span className={cn("font-semibold", a.severity === "Critical" ? "text-red-600" : "text-amber-600")}>{a.severity}</span><span className="flex-1">{a.message}</span><span className="text-muted-foreground">{a.hostname} · {fmtDate(a.openedAt)}{a.closedAt ? ` → fixed ${fmtDate(a.closedAt)}` : " · open"}</span></div>)}
            {!data.alerts.length && <div className="px-3 py-2 text-muted-foreground">None.</div>}</div></section>
      </div>}
    </SheetContent></Sheet>
  );
}

export async function downloadKey(k: any) {
  const r = await fetch(`/api/asset-agent-codes/${k.id}/package`, { credentials: "include" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Download failed (${r.status})`);
  const name = (r.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || "ITHubAgent.zip";
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await r.blob()), download: name }); a.click(); URL.revokeObjectURL(a.href);
}
export const KEY_TONE: Record<string, string> = { Ready: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300", Installed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300", Expired: "bg-muted text-muted-foreground", Disabled: "bg-muted text-muted-foreground", "Used up": "bg-muted text-muted-foreground" };

/** Installation keys: personal (one computer, one employee, optional asset) or bulk (admin, Intune / SCCM). */
export function EnrolDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast(); const { isAdmin } = useAuth();
  const { data: codes = [] } = useQuery({ queryKey: ["asset-agent-codes"], queryFn: () => apiFetch<any[]>("/asset-agent-codes") });
  const { data: people = [] } = useQuery({ queryKey: ["asset-people"], queryFn: () => apiFetch<any[]>("/asset-people") });
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });
  const { data: rel } = useQuery({ queryKey: ["agent-release"], queryFn: () => apiFetch<any>("/asset-agents/release") });
  const [mode, setMode] = useState<"user" | "bulk">("user");
  const [uq, setUq] = useState(""); const [userId, setUserId] = useState<number | null>(null); const [assetId, setAssetId] = useState<string>("");
  const [days, setDays] = useState("7"); const [label, setLabel] = useState(""); const [max, setMax] = useState("100");
  const [busy, setBusy] = useState(false); const [made, setMade] = useState<any>(null); const [kq, setKq] = useState("");
  const user = people.find((p: any) => p.id === userId);
  const userAssets = useMemo(() => assets.filter((a: any) => user && (a.ownerEmployeeCode && a.ownerEmployeeCode === user.employeeCode || a.ownerEmail && a.ownerEmail === user.email)), [assets, user]);
  const matches = people.filter((p: any) => uq.trim().length > 1 && [p.name, p.email, p.employeeCode].some((v: string) => v?.toLowerCase().includes(uq.trim().toLowerCase()))).slice(0, 8);
  const refresh = () => qc.invalidateQueries({ queryKey: ["asset-agent-codes"] });
  async function create() {
    setBusy(true);
    try {
      const body = mode === "user" ? { kind: "user", userId, assetId: assetId || undefined, validDays: Number(days) } : { kind: "bulk", label: label.trim(), maxUses: Number(max), validDays: Number(days) };
      const r = await apiFetch<any>("/asset-agent-codes", { method: "POST", body: JSON.stringify(body) }); setMade(r); refresh();
    } catch (e: any) { toast({ title: "Could not create key", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  async function share(k: any) {
    try { const r = await apiFetch<any>(`/asset-agent-codes/${k.id}/share`, { method: "POST" }); refresh();
      toast({ title: r.mailStatus === "Sent" ? `Emailed to ${r.emailedTo}` : `Link created for ${r.emailedTo}`, description: r.mailStatus && r.mailStatus !== "Sent" ? `Email ${String(r.mailStatus).toLowerCase()} — copy the link instead: ${r.link}` : "The employee also sees an in-app notice." });
      if (r.mailStatus !== "Sent") navigator.clipboard?.writeText(r.link); }
    catch (e: any) { toast({ title: "Could not share", description: e.message, variant: "destructive" }); }
  }
  const dl = (k: any) => downloadKey(k).then(refresh).catch(e => toast({ title: "Download failed", description: e.message, variant: "destructive" }));
  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast({ title: "Copied" }); };
  const keyList = codes.filter((c: any) => !kq.trim() || [c.userName, c.label, c.assetTag, c.usedOn, c.codeHint].some((v: string) => v?.toLowerCase().includes(kq.trim().toLowerCase())));
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Install the IT Hub agent</DialogTitle>
        <DialogDescription>Every installation needs a valid key from here. A personal key installs one computer for one employee (and, if you pick an asset, only on that asset's serial number). Latest agent on the server: <b>v{rel?.version || "?"}</b>{rel?.devices ? ` — ${rel.upToDate} of ${rel.devices} devices on it; the rest update themselves at their next check-in` : ""}.</DialogDescription></DialogHeader>
      <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px]">
        {([["user", "Personal key (one computer)"], ...(isAdmin ? [["bulk", "Bulk key (Intune / SCCM)"]] : [])] as [string, string][]).map(([k, l]) => <button key={k} onClick={() => { setMode(k as any); setMade(null); setDays(k === "user" ? "7" : "30"); }} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", mode === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{l}</button>)}
      </div>
      {made ? (
        <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
          <div className="text-xs text-muted-foreground">{made.kind === "user" ? <>Personal key for <b>{made.userName}</b>{made.assetTag ? <> · only on <b>{made.assetTag}</b> (SN {made.assetSerial})</> : " · any one computer"}</> : <>Bulk key <b>{made.label}</b> · up to {made.maxUses} devices</>} · valid till {fmtDate(made.expiresAt)}</div>
          <div className="flex items-center gap-2"><span className="font-mono text-lg font-bold tracking-wider">{made.code}</span><Button size="sm" variant="ghost" onClick={() => copy(made.code)}><Copy className="w-4 h-4" /></Button></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => dl(made)}><Download className="w-4 h-4" />Download installer (zip)</Button>
            {made.kind === "user" && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => share(made)}>Email to {made.userName}</Button>}
            <Button size="sm" variant="ghost" onClick={() => setMade(null)}>Create another</Button>
          </div>
          <div className="text-[11px] text-muted-foreground">{made.kind === "user" ? "The zip has the key inside — the employee (or IT) unzips it and double-clicks “Install IT Hub Agent.cmd”." : "Intune: wrap the unzipped folder (setup file install.cmd); install command install.cmd; detection file C:\\ProgramData\\ITHubAgent\\ITHubAgent.ps1."}</div>
        </div>
      ) : mode === "user" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2 relative">
            <div className="text-[11px] text-muted-foreground">Employee *</div>
            {user ? <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><b>{user.name}</b><span className="text-muted-foreground text-xs">{[user.employeeCode, user.email, user.department].filter(Boolean).join(" · ")}</span><button className="ml-auto text-xs text-primary" onClick={() => { setUserId(null); setAssetId(""); }}>Change</button></div>
              : <><Input placeholder="Search name, email or employee code…" value={uq} onChange={e => setUq(e.target.value)} />
                {matches.length > 0 && <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow divide-y max-h-60 overflow-y-auto">{matches.map((p: any) => <button key={p.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted" onClick={() => { setUserId(p.id); setUq(""); }}>{p.name} <span className="text-xs text-muted-foreground">{[p.employeeCode, p.email].filter(Boolean).join(" · ")}</span></button>)}</div>}</>}
          </div>
          <div className="space-y-1"><div className="text-[11px] text-muted-foreground">Computer (recommended — locks the key to its serial number)</div>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={assetId} disabled={!user} onChange={e => setAssetId(e.target.value)}>
              <option value="">Any one computer</option>{userAssets.map((a: any) => <option key={a.id} value={a.id}>{a.assetTag} · {a.type} · SN {a.serialNumber || "—"}</option>)}
            </select>{user && !userAssets.length && <div className="text-[11px] text-muted-foreground">No assets issued to {user.name} — the device is matched by serial after install.</div>}</div>
          <div className="space-y-1"><div className="text-[11px] text-muted-foreground">Valid for (days, max 30)</div><Input type="number" min={1} max={30} value={days} onChange={e => setDays(e.target.value)} /></div>
          <div className="sm:col-span-2"><Button disabled={busy || !userId} onClick={create}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Create personal key</Button></div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><div className="text-[11px] text-muted-foreground">Name *</div><Input className="w-56" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Intune rollout Nov-2026" /></div>
          <div className="space-y-1"><div className="text-[11px] text-muted-foreground">Devices</div><Input className="w-24" type="number" value={max} onChange={e => setMax(e.target.value)} /></div>
          <div className="space-y-1"><div className="text-[11px] text-muted-foreground">Valid for (days)</div><Input className="w-24" type="number" value={days} onChange={e => setDays(e.target.value)} /></div>
          <Button disabled={busy || !label.trim()} onClick={create}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Create bulk key</Button>
        </div>
      )}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold flex items-center gap-2">Installation keys <Link href="/asset-agents/keys" className="text-xs font-normal text-primary hover:underline">Full register &amp; log →</Link></h4><Input className="h-8 w-56" placeholder="Search employee, asset, computer…" value={kq} onChange={e => setKq(e.target.value)} /></div>
        <div className="border rounded-lg divide-y text-xs max-h-72 overflow-y-auto">{keyList.slice(0, 15).map((c: any) => (
          <div key={c.id} className="px-3 py-2 flex items-center gap-2 flex-wrap">
            <span className={cn("px-1.5 py-0.5 rounded font-semibold", KEY_TONE[c.state])}>{c.state}</span>
            <span className="font-mono text-muted-foreground">…{c.codeHint}</span>
            <span className="font-medium">{c.kind === "user" ? c.userName : `Bulk: ${c.label}`}</span>
            {c.assetTag && <span className="text-muted-foreground">· {c.assetTag}</span>}
            <span className="text-muted-foreground flex-1">{c.state === "Installed" ? `on ${c.usedOn || "a device since removed"} · ${fmtDateTime(c.usedAt)}` : c.kind === "bulk" ? `${c.uses}/${c.maxUses} devices · till ${fmtDate(c.expiresAt)}` : `till ${fmtDate(c.expiresAt)}`}{c.sharedAt ? ` · emailed ${fmtDate(c.sharedAt)}` : ""}{c.downloads ? ` · ${c.downloads} download${c.downloads > 1 ? "s" : ""}` : ""}</span>
            {c.state === "Ready" && <>
              <Button size="sm" variant="ghost" className="h-6 gap-1" onClick={() => dl(c)}><Download className="w-3 h-3" />Zip</Button>
              {c.kind === "user" && <Button size="sm" variant="ghost" className="h-6" onClick={() => share(c)}>{c.sharedAt ? "Resend" : "Email"}</Button>}
              <Button size="sm" variant="ghost" className="h-6 text-red-600" onClick={async () => { await apiFetch(`/asset-agent-codes/${c.id}`, { method: "DELETE" }); refresh(); }}>Disable</Button></>}
          </div>))}
          {!keyList.length && <div className="px-3 py-3 text-muted-foreground">No keys yet.</div>}</div>
      </section>
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Agent files only (no key) — for IT</summary>
        <div className="flex flex-wrap gap-2 mt-2">{FILES.map(f => <Button key={f} size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => download(f).catch(e => toast({ title: "Download failed", description: e.message, variant: "destructive" }))}><Download className="w-3 h-3" />{f}</Button>)}</div></details>
      <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

/** Chats about one device (IT). */
function DeviceChats({ agentId, onOpen }: { agentId: number; onOpen: (id: number) => void }) {
  const { data: list = [] } = useQuery({ queryKey: ["device-chats", agentId], queryFn: () => apiFetch<any[]>(`/asset-agents/chats?agentId=${agentId}`) });
  if (!list.length) return null;
  return <div className="mt-3 rounded-lg border divide-y text-xs">{list.slice(0, 5).map((c: any) => <button key={c.id} onClick={() => onOpen(c.id)} className="w-full text-left px-3 py-1.5 hover:bg-muted/40 flex gap-2 items-center"><MessageSquare className="w-3.5 h-3.5 text-primary" /><span className="font-medium flex-1 truncate">{c.subject}</span>{c.unread > 0 && <span className="rounded-full bg-primary text-primary-foreground px-1.5">{c.unread}</span>}<ChatStatus status={c.status} /><span className="text-muted-foreground">{fmtDateTime(c.lastMsgAt)}</span></button>)}</div>;
}
