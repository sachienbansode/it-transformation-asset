import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { StatCard } from "@/components/stat-card";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtCell } from "@/lib/date";
import { cn } from "@/lib/utils";
import { reasonDialog } from "@/components/confirm-dialog";
import { EnrolDialog, downloadKey, KEY_TONE } from "@/pages/asset-agents";
import { ArrowLeft, Download, KeyRound, Mail, Ban, CheckCircle2, Clock, Send, ShieldX, History, Plus, FileDown } from "lucide-react";

/* IT Assets › Device Health › Installation keys — every key with who created / emailed / downloaded / installed it, and its full activity log. */

const PAGE = 20;
const STATES = ["All", "Ready", "Installed", "Expired", "Disabled", "Used up"] as const;
const ACT: Record<string, { label: string; tone: string }> = {
  created: { label: "Created", tone: "bg-blue-500" }, emailed: { label: "Emailed", tone: "bg-indigo-500" }, downloaded: { label: "Downloaded", tone: "bg-sky-500" },
  "link-opened": { label: "Link opened", tone: "bg-slate-400" }, "notice-accepted": { label: "Notice accepted", tone: "bg-violet-500" },
  installed: { label: "Installed", tone: "bg-emerald-500" }, reinstalled: { label: "Re-installed", tone: "bg-emerald-500" },
  refused: { label: "Install refused", tone: "bg-red-500" }, "link-refused": { label: "Link refused", tone: "bg-amber-500" }, disabled: { label: "Disabled", tone: "bg-slate-500" },
};
const actLabel = (a: string) => ACT[a]?.label || a;
const who = (t: string) => String(t || "").replace(/ <.*>$/, "");
const csv = (rows: any[], cols: [string, string][], name: string) => {
  const e = (v: any) => { const x = String(fmtCell(v) ?? "").replace(/"/g, '""'); return /[,"\n]/.test(x) ? `"${x}"` : x; };
  const t = [cols.map(c => c[0]).join(","), ...rows.map(r => cols.map(c => e(r[c[1]])).join(","))].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([t], { type: "text/csv" })), download: name }); a.click(); URL.revokeObjectURL(a.href);
};

export default function AgentKeys() {
  const qc = useQueryClient(); const { toast } = useToast();
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const { data: keys = [], isLoading } = useQuery({ queryKey: ["agent-key-register", from, to], queryFn: () => apiFetch<any[]>(`/asset-agent-codes/register${qs ? `?${qs}` : ""}`) });
  const [st, setSt] = useState<typeof STATES[number]>("All"); const [kind, setKind] = useState(""); const [q, setQ] = useState(""); const [creator, setCreator] = useState("");
  const [page, setPage] = useState(1); const [open, setOpen] = useState<any>(null); const [enrol, setEnrol] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["agent-key-register"] }); qc.invalidateQueries({ queryKey: ["agent-key-events"] }); qc.invalidateQueries({ queryKey: ["asset-agent-codes"] }); };
  const creators = useMemo(() => [...new Set(keys.map((k: any) => who(k.createdBy)).filter(Boolean))].sort(), [keys]);
  const list = useMemo(() => keys.filter((k: any) => (st === "All" || k.state === st) && (!kind || k.kind === kind) && (!creator || who(k.createdBy) === creator)
    && (!q.trim() || [k.userName, k.userEmail, k.employeeCode, k.department, k.label, k.assetTag, k.assetSerial, k.usedOn, k.usedSerial, k.codeHint, k.createdBy, k.sharedBy].some((v: string) => v?.toLowerCase().includes(q.trim().toLowerCase())))), [keys, st, kind, q, creator]);
  const cnt = (s: string) => s === "All" ? keys.length : keys.filter((k: any) => k.state === s).length;
  const emailedNotInstalled = keys.filter((k: any) => k.sharedAt && k.state === "Ready").length;
  const refusals = keys.reduce((a: number, k: any) => a + (k.refusals || 0), 0);
  const rows = list.slice((page - 1) * PAGE, page * PAGE);

  async function disable(k: any) {
    const r = await reasonDialog(`Disable key …${k.codeHint} (${k.kind === "user" ? k.userName : k.label})? It can no longer install the agent and any emailed link stops working. Devices already installed keep reporting.`, { title: "Disable installation key", confirmText: "Disable", label: "Reason (optional)", minLength: 0, destructive: true });
    if (r === null) return;
    try { await apiFetch(`/asset-agent-codes/${k.id}`, { method: "DELETE", body: JSON.stringify({ reason: r }) }); toast({ title: "Key disabled" }); refresh(); }
    catch (e: any) { toast({ title: "Could not disable", description: e.message, variant: "destructive" }); }
  }
  async function share(k: any) {
    try { const r = await apiFetch<any>(`/asset-agent-codes/${k.id}/share`, { method: "POST" }); refresh();
      toast({ title: r.mailStatus === "Sent" ? `Emailed to ${r.emailedTo}` : `Link created for ${r.emailedTo}`, description: r.mailStatus && r.mailStatus !== "Sent" ? `Email ${String(r.mailStatus).toLowerCase()} — link copied: ${r.link}` : undefined });
      if (r.mailStatus !== "Sent") navigator.clipboard?.writeText(r.link); }
    catch (e: any) { toast({ title: "Could not email", description: e.message, variant: "destructive" }); }
  }
  const dl = (k: any) => downloadKey(k).then(refresh).catch(e => toast({ title: "Download failed", description: e.message, variant: "destructive" }));
  async function exportLog() {
    try { const ev = await apiFetch<any[]>(`/asset-agent-code-events${qs ? `?${qs}` : ""}`);
      csv(ev, [["When", "at"], ["Action", "action"], ["By", "actor"], ["Detail", "detail"], ["Key", "codeHint"], ["Type", "kind"], ["Employee", "userName"], ["Employee Code", "employeeCode"], ["Key name", "label"], ["IP", "ip"], ["Browser / device", "userAgent"]], "agent_key_activity_log.csv"); }
    catch (e: any) { toast({ title: "Export failed", description: e.message, variant: "destructive" }); }
  }
  const exportKeys = () => csv(list.map((k: any) => ({ ...k, key: `…${k.codeHint}`, type: k.kind === "user" ? "Personal" : "Bulk", devices: k.kind === "bulk" ? `${k.uses}/${k.maxUses}` : k.usedOn ? "1/1" : "0/1" })), [["Key", "key"], ["Type", "type"], ["Status", "state"], ["Employee", "userName"], ["Employee Code", "employeeCode"], ["Department", "department"], ["Email", "userEmail"], ["Key name", "label"], ["Asset", "assetTag"], ["Asset serial", "assetSerial"], ["Created by", "createdBy"], ["Created at", "createdAt"], ["Valid till", "expiresAt"], ["Emailed by", "sharedBy"], ["Emailed at", "sharedAt"], ["Downloads", "downloads"], ["Last download", "lastDownloadAt"], ["Devices", "devices"], ["Installed on", "usedOn"], ["Device serial", "usedSerial"], ["Installed at", "usedAt"], ["Install refusals", "refusals"], ["Disabled by", "disabledBy"], ["Disabled at", "disabledAt"], ["Disable reason", "disableReason"], ["Last activity", "lastActivityAt"]], "agent_installation_keys.csv");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/asset-agents" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Device Health</Link>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><img src={`${import.meta.env.BASE_URL}niytri-agent.png`} alt="" className="w-7 h-7 rounded-md" />Installation keys</h1>
          <p className="text-sm text-muted-foreground">Every agent installation key: who created it, who it was emailed to, each download, notice acceptance, install (or refused attempt) and who disabled it.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportKeys}><Download className="w-4 h-4" />Keys CSV</Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportLog}><FileDown className="w-4 h-4" />Activity log CSV</Button>
          <Button className="gap-2" onClick={() => setEnrol(true)}><Plus className="w-4 h-4" />New key</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={KeyRound} label="Keys" value={keys.length} sub={`${keys.filter((k: any) => k.kind === "bulk").length} bulk`} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Clock} label="Ready (not installed)" value={cnt("Ready")} sub={`${emailedNotInstalled} emailed, waiting`} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={CheckCircle2} label="Installed" value={cnt("Installed")} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={Ban} label="Expired / disabled" value={cnt("Expired") + cnt("Disabled") + cnt("Used up")} iconBg="bg-slate-100 dark:bg-slate-800" iconColor="text-slate-500" borderColor="border-l-slate-400" />
        <StatCard icon={ShieldX} label="Refused installs" value={refusals} sub="wrong computer, expired, reused…" iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" valueColor={refusals ? "text-red-600" : undefined} />
      </div>
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {STATES.map(s => <button key={s} onClick={() => { setSt(s); setPage(1); }} className={cn("px-2.5 py-1 rounded-md text-xs border", st === s ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground")}>{s} {cnt(s)}</button>)}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input className="h-8 w-64" placeholder="Search employee, asset, computer, key…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
          <select className="h-8 rounded-md border bg-background px-2 text-xs" value={kind} onChange={e => { setKind(e.target.value); setPage(1); }}><option value="">Personal + bulk</option><option value="user">Personal</option><option value="bulk">Bulk</option></select>
          <select className="h-8 rounded-md border bg-background px-2 text-xs" value={creator} onChange={e => { setCreator(e.target.value); setPage(1); }}><option value="">Created by anyone</option>{creators.map(c => <option key={c}>{c}</option>)}</select>
          <span className="text-xs text-muted-foreground ml-2">Created</span>
          <Input type="date" className="h-8 w-36" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /><span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-36" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} />
          {(q || kind || creator || from || to || st !== "All") && <Button size="sm" variant="ghost" className="h-8" onClick={() => { setQ(""); setKind(""); setCreator(""); setFrom(""); setTo(""); setSt("All"); setPage(1); }}>Clear</Button>}
          <span className="ml-auto text-xs text-muted-foreground">{list.length} key{list.length === 1 ? "" : "s"}</span>
        </div>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b bg-muted/30">
              <th className="p-2.5 font-semibold">Key</th><th className="p-2.5 font-semibold">For</th><th className="p-2.5 font-semibold">Created</th><th className="p-2.5 font-semibold">Valid till</th>
              <th className="p-2.5 font-semibold">Emailed</th><th className="p-2.5 font-semibold">Downloads</th><th className="p-2.5 font-semibold">Installed on</th><th className="p-2.5 font-semibold">Status</th><th className="p-2.5 font-semibold text-right">Actions</th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {rows.map((k: any) => (
                <tr key={k.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setOpen(k)}>
                  <td className="p-2.5"><div className="font-mono">…{k.codeHint}</div><div className="text-muted-foreground">{k.kind === "user" ? "Personal" : "Bulk"}</div></td>
                  <td className="p-2.5">{k.kind === "user" ? <><div className="font-medium">{k.userName || "—"}</div><div className="text-muted-foreground">{[k.employeeCode, k.department].filter(Boolean).join(" · ")}{k.assetTag ? ` · ${k.assetTag}` : " · any computer"}</div></>
                    : <><div className="font-medium">{k.label}</div><div className="text-muted-foreground">{k.uses}/{k.maxUses} devices</div></>}</td>
                  <td className="p-2.5"><div>{fmtDateTime(k.createdAt)}</div><div className="text-muted-foreground">{who(k.createdBy)}</div></td>
                  <td className="p-2.5 whitespace-nowrap">{fmtDate(k.expiresAt)}</td>
                  <td className="p-2.5">{k.sharedAt ? <><div>{fmtDateTime(k.sharedAt)}</div><div className="text-muted-foreground">{who(k.sharedBy)}</div></> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2.5">{k.downloads || 0}{k.lastDownloadAt && <div className="text-muted-foreground">last {fmtDate(k.lastDownloadAt)}</div>}</td>
                  <td className="p-2.5">{k.usedOn ? <><div className="font-medium">{k.usedOn}</div><div className="text-muted-foreground">{fmtDateTime(k.usedAt)}</div></> : k.usedAt ? <span className="text-muted-foreground">device since removed</span> : <span className="text-muted-foreground">—</span>}
                    {k.refusals > 0 && <div className="text-red-600">{k.refusals} refused attempt{k.refusals > 1 ? "s" : ""}</div>}</td>
                  <td className="p-2.5"><span className={cn("px-1.5 py-0.5 rounded font-semibold whitespace-nowrap", KEY_TONE[k.state])}>{k.state}</span>
                    {k.disabledAt && <div className="text-muted-foreground mt-0.5 max-w-[160px] truncate" title={k.disableReason || ""}>{who(k.disabledBy)} · {fmtDate(k.disabledAt)}{k.disableReason ? ` · ${k.disableReason}` : ""}</div>}</td>
                  <td className="p-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="h-7 px-2" title="Activity log" onClick={() => setOpen(k)}><History className="w-3.5 h-3.5" /></Button>
                    {k.state === "Ready" && <>
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Download installer zip" onClick={() => dl(k)}><Download className="w-3.5 h-3.5" /></Button>
                      {k.kind === "user" && <Button size="sm" variant="ghost" className="h-7 px-2" title={k.sharedAt ? "Email again" : "Email to employee"} onClick={() => share(k)}><Mail className="w-3.5 h-3.5" /></Button>}
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" title="Disable" onClick={() => disable(k)}><Ban className="w-3.5 h-3.5" /></Button></>}
                  </td>
                </tr>))}
              {!isLoading && !rows.length && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No keys match.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE} totalItems={list.length} totalPages={Math.max(1, Math.ceil(list.length / PAGE))} onPageChange={setPage} />
      </CardContent></Card>
      {open && <KeyLog k={keys.find((x: any) => x.id === open.id) || open} onClose={() => setOpen(null)} onShare={share} onDl={dl} onDisable={disable} />}
      {enrol && <EnrolDialog onClose={() => { setEnrol(false); refresh(); }} />}
    </div>
  );
}

function KeyLog({ k, onClose, onShare, onDl, onDisable }: { k: any; onClose: () => void; onShare: (k: any) => void; onDl: (k: any) => void; onDisable: (k: any) => void }) {
  const { data: ev = [], isLoading } = useQuery({ queryKey: ["agent-key-events", k.id], queryFn: () => apiFetch<any[]>(`/asset-agent-codes/${k.id}/events`) });
  const F = ({ l, v }: { l: string; v: any }) => <div><div className="text-[11px] text-muted-foreground">{l}</div><div className="text-sm">{v || "—"}</div></div>;
  return (
    <Sheet open onOpenChange={o => !o && onClose()}><SheetContent className="w-full sm:max-w-[640px] overflow-y-auto">
      <SheetHeader><SheetTitle className="flex items-center gap-2">Key …{k.codeHint} <span className={cn("px-1.5 py-0.5 rounded text-xs font-semibold", KEY_TONE[k.state])}>{k.state}</span></SheetTitle>
        <SheetDescription>{k.kind === "user" ? `Personal key for ${k.userName}${k.assetTag ? ` · ${k.assetTag}` : " · any one computer"}` : `Bulk key "${k.label}" · ${k.uses}/${k.maxUses} devices`}</SheetDescription></SheetHeader>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border p-3">
        <F l="Created" v={`${fmtDateTime(k.createdAt)} · ${who(k.createdBy)}`} /><F l="Valid till" v={fmtDate(k.expiresAt)} />
        {k.kind === "user" && <><F l="Employee" v={[k.userName, k.employeeCode, k.department].filter(Boolean).join(" · ")} /><F l="Email" v={k.userEmail} /></>}
        {k.assetTag && <F l="Asset" v={`${k.assetTag}${k.assetSerial ? ` (serial ${k.assetSerial})` : ""}`} />}
        <F l="Emailed" v={k.sharedAt ? `${fmtDateTime(k.sharedAt)} · ${who(k.sharedBy)}` : null} />
        <F l="Downloads" v={`${k.downloads || 0}${k.lastDownloadAt ? ` · last ${fmtDateTime(k.lastDownloadAt)}` : ""}`} />
        <F l="Installed on" v={k.usedOn ? `${k.usedOn}${k.usedSerial ? ` (serial ${k.usedSerial})` : ""} · ${fmtDateTime(k.usedAt)}` : k.usedAt ? `Device since removed · ${fmtDateTime(k.usedAt)}` : null} />
        {k.disabledAt && <F l="Disabled" v={`${fmtDateTime(k.disabledAt)} · ${who(k.disabledBy)}${k.disableReason ? ` · ${k.disableReason}` : ""}`} />}
      </div>
      {k.state === "Ready" && <div className="flex gap-2 mt-3">
        <Button size="sm" variant="outline" className="gap-1" onClick={() => onDl(k)}><Download className="w-3.5 h-3.5" />Download zip</Button>
        {k.kind === "user" && <Button size="sm" variant="outline" className="gap-1" onClick={() => onShare(k)}><Send className="w-3.5 h-3.5" />{k.sharedAt ? "Email again" : "Email to employee"}</Button>}
        <Button size="sm" variant="outline" className="gap-1 text-red-600" onClick={() => onDisable(k)}><Ban className="w-3.5 h-3.5" />Disable</Button></div>}
      <h4 className="text-sm font-semibold mt-5 mb-2 flex items-center gap-1.5"><History className="w-4 h-4" />Activity log</h4>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : <ol className="relative border-l ml-2 space-y-3">
        {ev.map((e: any) => (
          <li key={e.id} className="ml-4">
            <span className={cn("absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full", ACT[e.action]?.tone || "bg-slate-400")} />
            <div className="flex flex-wrap gap-x-2 items-baseline"><span className={cn("text-sm font-semibold", e.action === "refused" && "text-red-600")}>{actLabel(e.action)}</span><span className="text-xs text-muted-foreground">{fmtDateTime(e.at)} · {who(e.actor) || "—"}</span></div>
            {e.detail && <div className="text-xs">{e.detail}</div>}
            {(e.ip || e.userAgent) && <div className="text-[11px] text-muted-foreground truncate" title={e.userAgent || ""}>{[e.ip && `IP ${e.ip}`, e.userAgent && e.userAgent.replace(/^Mozilla\/5\.0 /, "")].filter(Boolean).join(" · ")}</div>}
          </li>))}
        {!ev.length && <li className="ml-4 text-sm text-muted-foreground">No activity recorded.</li>}
      </ol>}
    </SheetContent></Sheet>
  );
}
