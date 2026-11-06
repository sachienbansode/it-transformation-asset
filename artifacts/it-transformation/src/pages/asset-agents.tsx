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
import { Activity, AlertTriangle, CheckCircle2, WifiOff, Link2, Search, KeyRound, Download, Copy, Trash2, Server, Laptop, Loader2, RefreshCw } from "lucide-react";

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
  const [view, setView] = useState<any>(null); const [link, setLink] = useState<any>(null); const [enrol, setEnrol] = useState(false);
  const count = (t: string) => agents.filter(a => match(a, t)).length;
  function match(a: any, t: string) {
    if (t === "Removed") return a.status === "Revoked";
    if (a.status === "Revoked") return false;
    if (t === "All") return true; if (t === "Not linked") return !a.assetId;
    return a.healthState === t;
  }
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return agents.filter(a => match(a, tab) && (!kind || a.platform === kind) &&
    (!s || [a.hostname, a.assetTag, a.serialNumber, a.lastUser, a.ownerName, a.model, a.alertText, a.department, a.location].some((v: string) => v?.toLowerCase().includes(s)))); }, [agents, tab, q, kind]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["asset-agents"] }); qc.invalidateQueries({ queryKey: ["asset-health"] }); };
  async function remove(a: any) {
    if (!await confirmDialog(`Remove ${a.hostname} from IT Hub? The agent on the device stops reporting at its next check-in. History is kept.`, { title: "Remove device", confirmText: "Remove" })) return;
    try { await apiFetch(`/asset-agents/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: "Revoked" }) }); toast({ title: `${a.hostname} removed` }); refresh(); }
    catch (e: any) { toast({ title: "Could not remove", description: e.message, variant: "destructive" }); }
  }
  function exportCsv() {
    const cols: [string, string][] = [["Computer", "hostname"], ["Asset Tag", "assetTag"], ["Serial", "serialNumber"], ["Type", "platform"], ["Model", "model"], ["OS", "osName"], ["User", "lastUser"], ["Owner", "ownerName"], ["Health", "healthState"], ["Issues", "alertText"],
      ["CPU %", "cpu"], ["Memory %", "mem"], ["Lowest disk free %", "diskFreePct"], ["Battery health %", "batteryHealthPct"], ["Active minutes (7 days)", "active7d"], ["Last used", "lastActiveDay"], ["Last report", "lastSeenAt"], ["Agent", "agentVersion"]];
    const e = (v: any) => { const x = String(fmtCell(v) ?? "").replace(/"/g, '""'); return /[,"\n]/.test(x) ? `"${x}"` : x; };
    const csv = [cols.map(c => c[0]).join(","), ...list.map(r => cols.map(c => e(r[c[1]])).join(","))].join("\n");
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
          <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search computer, asset tag, serial, user, issue…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="py-2 pr-3 font-semibold">Device</th><th className="py-2 pr-3 font-semibold">Asset</th><th className="py-2 pr-3 font-semibold">Health</th><th className="py-2 pr-3 font-semibold">CPU / Mem / Disk / Battery</th><th className="py-2 pr-3 font-semibold">Usage (7 days)</th><th className="py-2 pr-3 font-semibold">Last report</th><th className="py-2 font-semibold text-right">Actions</th>
            </tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && !list.length && <tr><td colSpan={7} className="py-12 text-center text-muted-foreground"><Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />{agents.length ? "No devices match." : "No devices yet — use Install agent / keys to roll out the agent."}</td></tr>}
              {list.slice((page - 1) * PAGE, page * PAGE).map(a => (
                <tr key={a.id} className={cn("border-b last:border-0 hover:bg-muted/40", a.status === "Revoked" && "opacity-60")}>
                  <td className="py-2.5 pr-3"><div className="font-semibold flex items-center gap-1.5">{a.platform === "Server" ? <Server className="w-3.5 h-3.5 text-muted-foreground" /> : <Laptop className="w-3.5 h-3.5 text-muted-foreground" />}{a.hostname}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[220px]">{[a.model, a.osName].filter(Boolean).join(" · ")}</div><div className="text-[11px] text-muted-foreground">{a.lastUser || "—"}</div></td>
                  <td className="py-2.5 pr-3">{a.assetId ? <><div className="font-medium">{a.assetTag}</div><div className="text-xs text-muted-foreground">{a.ownerName || a.assetName}</div></>
                    : <div><span className="text-xs text-amber-700 dark:text-amber-300">Not linked</span><div className="text-[11px] text-muted-foreground max-w-[200px]">{a.matchNote}</div></div>}</td>
                  <td className="py-2.5 pr-3"><HealthBadge state={a.status === "Revoked" ? "Removed" : a.healthState} />{a.alertText && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[260px] line-clamp-2" title={a.alertText}>{a.alertText}</div>}</td>
                  <td className="py-2.5 pr-3 text-xs whitespace-nowrap">{[a.cpu, a.mem].map(v => v == null ? "—" : `${Math.round(v)}%`).join(" / ")} / <span className={cn(a.diskFreePct != null && a.diskFreePct < 10 && "text-red-600 font-semibold")}>{a.diskFreePct == null ? "—" : `${Math.round(a.diskFreePct)}% free`}</span>{a.batteryHealthPct != null && <> / <span className={cn(a.batteryHealthPct < 60 && "text-amber-600 font-semibold")}>{Math.round(a.batteryHealthPct)}%</span></>}</td>
                  <td className="py-2.5 pr-3 text-xs"><div className="font-medium">{hm(a.active7d)} active</div><div className="text-muted-foreground">last used {a.lastActiveDay ? fmtDate(a.lastActiveDay) : "—"}</div></td>
                  <td className="py-2.5 pr-3 text-xs whitespace-nowrap" title={fmtDateTime(a.lastSeenAt)}>{ago(a.lastSeenAt)}<div className="text-muted-foreground">v{a.agentVersion || "?"}</div></td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    {a.assetId && <Button size="sm" variant="ghost" className="h-8" onClick={() => setView(a)}>Health</Button>}
                    {canEdit && a.status !== "Revoked" && <Button size="sm" variant="ghost" className="h-8" title="Link to a register asset" onClick={() => setLink(a)}><Link2 className="w-4 h-4" /></Button>}
                    {canEdit && a.status !== "Revoked" && <Button size="sm" variant="ghost" className="h-8 text-red-600" title="Remove device" onClick={() => remove(a)}><Trash2 className="w-4 h-4" /></Button>}
                    {canEdit && a.status === "Revoked" && <Button size="sm" variant="ghost" className="h-8" onClick={async () => { await apiFetch(`/asset-agents/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: "Active" }) }); refresh(); }}>Re-enable</Button>}
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={Math.ceil(list.length / PAGE) || 1} totalItems={list.length} pageSize={PAGE} onPageChange={setPage} />
      </CardContent></Card>

      {view && <Sheet open onOpenChange={o => !o && setView(null)}><SheetContent className="w-full sm:max-w-[600px] overflow-y-auto">
        <SheetHeader><SheetTitle>{view.assetTag} — device health</SheetTitle><SheetDescription>{view.assetName} · {view.ownerName || "not issued"}</SheetDescription></SheetHeader>
        <div className="mt-4"><AssetHealthPanel assetId={view.assetId} /></div></SheetContent></Sheet>}
      {link && <LinkDialog agent={link} onClose={() => setLink(null)} onDone={refresh} />}
      {enrol && <EnrolDialog onClose={() => setEnrol(false)} />}
    </div>
  );
}

function LinkDialog({ agent, onClose, onDone }: { agent: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });
  const [q, setQ] = useState(agent.serialNumber || ""); const [busy, setBusy] = useState(false);
  const list = assets.filter((a: any) => !q.trim() || [a.assetTag, a.serialNumber, a.name, a.ownerName].some((v: string) => v?.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 30);
  async function pick(id: number | null) {
    setBusy(true);
    try { await apiFetch(`/asset-agents/${agent.id}`, { method: "PATCH", body: JSON.stringify({ assetId: id }) }); toast({ title: id ? "Device linked" : "Device unlinked" }); onDone(); onClose(); }
    catch (e: any) { toast({ title: "Could not link", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Link {agent.hostname} to an asset</DialogTitle><DialogDescription>Reported serial {agent.serialNumber || "—"} · {agent.model || ""}. Health and usage history move with the link.</DialogDescription></DialogHeader>
      <Input placeholder="Search tag, serial, name, owner…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
        {list.map((a: any) => <button key={a.id} disabled={busy} onClick={() => pick(a.id)} className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"><b>{a.assetTag}</b> · {a.type} · {a.name}<div className="text-xs text-muted-foreground">SN {a.serialNumber} · {a.ownerName || a.status}</div></button>)}
        {!list.length && <div className="px-3 py-4 text-sm text-muted-foreground">No matching asset — add it to the register first.</div>}
      </div>
      <DialogFooter>{agent.assetId && <Button variant="outline" disabled={busy} onClick={() => pick(null)}>Unlink</Button>}<Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
    </DialogContent></Dialog>
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
