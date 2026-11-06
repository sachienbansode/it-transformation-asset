import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtCell } from "@/lib/date";
import { cn } from "@/lib/utils";
import { confirmDialog, reasonDialog } from "@/components/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Send, BellRing, Users, Download, History, Archive, Edit, Loader2, MoreHorizontal, PauseCircle, PlayCircle, Undo2, Copy, Trash2, ArchiveRestore, RotateCcw } from "lucide-react";

/* Admin › Policies & Consent — write, publish (versioned) and track acceptance of policies, notices and consents. */

const csv = (rows: any[], cols: [string, string][], name: string) => {
  const e = (v: any) => { const x = String(fmtCell(v) ?? "").replace(/"/g, '""'); return /[,"\n]/.test(x) ? `"${x}"` : x; };
  const t = [cols.map(c => c[0]).join(","), ...rows.map(r => cols.map(c => e(r[c[1]])).join(","))].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([t], { type: "text/csv" })), download: name }); a.click(); URL.revokeObjectURL(a.href);
};
const audText = (a: any) => a?.all ? "Everyone" : [a?.agentUsers && "Employees with the device agent", a?.roles?.length && `${a.roles.length} role(s)`, a?.departments?.length && a.departments.join(", "), a?.userTypes?.length && a.userTypes.join(" / ")].filter(Boolean).join(" · ") || "—";

export default function AdminPolicies() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: list = [], isLoading } = useQuery({ queryKey: ["policies"], queryFn: () => apiFetch<any[]>("/policies") });
  const [edit, setEdit] = useState<any>(null); const [report, setReport] = useState<any>(null); const [publish, setPublish] = useState<any>(null);
  const [resend, setResend] = useState<any>(null); const [history, setHistory] = useState<any>(null); const [activate, setActivate] = useState<any>(null);
  const [show, setShow] = useState<"current" | "all">("current");
  const refresh = () => qc.invalidateQueries({ queryKey: ["policies"] });
  async function act(p: any, path: string, body: any, ok: string) {
    try { await apiFetch(`/policies/${p.id}/${path}`, { method: "POST", body: JSON.stringify(body || {}) }); toast({ title: ok }); refresh(); }
    catch (e: any) { toast({ title: "Could not do that", description: e.message, variant: "destructive" }); }
  }
  async function retire(p: any) {
    const r = await reasonDialog(`Retire "${p.title}"? It disappears from users' lists for good (you can restore it later). All versions and acceptance records are kept.`, { title: "Retire policy", confirmText: "Retire", label: "Reason (optional)", minLength: 0, destructive: true });
    if (r !== null) act(p, "retire", { reason: r }, "Retired");
  }
  async function deactivate(p: any) {
    const r = await reasonDialog(`Deactivate "${p.title}"? Nobody will be asked to accept it and nobody's access is halted by it until you activate it again. Versions and acceptance records are kept.${p.systemKey === "device_agent" ? " While inactive, agent installer links work without showing the notice." : ""}`, { title: "Deactivate policy", confirmText: "Deactivate", label: "Reason (optional)", minLength: 0 });
    if (r !== null) act(p, "deactivate", { reason: r }, "Deactivated");
  }
  async function discard(p: any) {
    const draft = p.version === 0;
    if (!await confirmDialog(draft ? `Cancel the draft "${p.title}"? It has never been published and will be deleted.` : `Discard unpublished changes to "${p.title}"? The text goes back to version ${p.version}.`, { title: draft ? "Cancel draft" : "Discard changes", confirmText: draft ? "Delete draft" : "Discard", destructive: true })) return;
    act(p, "discard", {}, draft ? "Draft cancelled" : "Changes discarded");
  }
  const visible = show === "all" ? list : list.filter((p: any) => p.status !== "Retired");
  const retiredCount = list.filter((p: any) => p.status === "Retired").length;
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><h1 className="text-2xl font-bold tracking-tight">Policies &amp; Consent</h1>
          <p className="text-sm text-muted-foreground">Publish policies, notices and consents; every acceptance is recorded with the version, text fingerprint, time, IP and browser. Mandatory items lock IT Hub for a person once the days to accept have passed.</p></div>
        <div className="flex gap-2 items-center">{retiredCount > 0 && <select className="h-9 rounded-md border bg-background px-2 text-sm" value={show} onChange={e => setShow(e.target.value as any)}><option value="current">Hide retired ({retiredCount})</option><option value="all">Show retired</option></select>}
        <Button className="gap-2" onClick={() => setEdit({ requirement: "Mandatory", category: "Policy", dueDays: 7, audience: { all: true }, allowWithdraw: true, push: true, blockAccess: true })}><Plus className="w-4 h-4" />New policy / notice</Button></div>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b"><th className="p-3 font-semibold">Policy</th><th className="p-3 font-semibold">Type</th><th className="p-3 font-semibold">Who</th><th className="p-3 font-semibold">Acceptance</th><th className="p-3 font-semibold">Status</th><th className="p-3 font-semibold text-right">Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {visible.map((p: any) => { const st = p.stats; const pct = st?.audience ? Math.round(st.accepted / st.audience * 100) : 0; return (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-3"><div className="font-medium">{p.title}</div><div className="text-xs text-muted-foreground">{p.code}{p.version ? ` · v${p.version} · ${fmtDate(p.publishedAt)}` : " · draft"}{p.systemKey ? " · built-in" : ""}</div>
                  {p.unpublishedChanges && <div className="text-[11px] text-amber-700 dark:text-amber-300">Edited — publish a new version for users to accept</div>}</td>
                <td className="p-3 text-xs"><span className={cn("px-2 py-0.5 rounded-full font-semibold", p.requirement === "Mandatory" ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" : p.requirement === "Optional" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" : "bg-muted")}>{p.requirement}</span><div className="text-muted-foreground mt-0.5">{p.category}{p.requirement === "Mandatory" ? (p.blockAccess ? ` · access halted ${p.dueDays ? `after ${p.dueDays} days` : "immediately"}` : ` · ${p.dueDays} days, reminders only`) : ""}</div></td>
                <td className="p-3 text-xs">{audText(p.audience)}</td>
                <td className="p-3 text-xs min-w-[180px]">{st ? <><div className="flex justify-between"><span>{st.accepted} of {st.audience} accepted</span><span className="font-semibold">{pct}%</span></div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                  <div className="text-muted-foreground mt-0.5">{st.pending} pending{st.declined ? ` · ${st.declined} declined` : ""}{st.overdue ? <span className="text-red-600"> · {st.overdue} access halted</span> : ""}</div></> : <span className="text-muted-foreground">—</span>}</td>
                <td className="p-3 text-xs"><StatusBadge p={p} />{p.statusNote && <div className="text-muted-foreground mt-0.5 max-w-[180px] truncate" title={p.statusNote}>{p.statusNote}</div>}
                  {p.status === "Published" && p.requirement === "Mandatory" && p.dueAt && <div className="text-muted-foreground mt-0.5">accept by {fmtDate(p.dueAt)}</div>}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {p.status !== "Retired" && <Button size="sm" variant="ghost" title="Edit" onClick={() => setEdit(p)}><Edit className="w-4 h-4" /></Button>}
                  {p.status !== "Retired" && (p.version === 0 || p.unpublishedChanges) && <Button size="sm" variant="outline" className="gap-1" onClick={() => setPublish(p)}><Send className="w-3.5 h-3.5" />Publish</Button>}
                  {p.version > 0 && <Button size="sm" variant="ghost" title="Who accepted" onClick={() => setReport(p)}><Users className="w-4 h-4" /></Button>}
                  {p.status === "Published" && <Button size="sm" variant="ghost" title="Resend / remind" onClick={() => setResend(p)}><BellRing className="w-4 h-4" /></Button>}
                  {p.version > 0 && <Button size="sm" variant="ghost" title="Version history" onClick={() => setHistory(p)}><History className="w-4 h-4" /></Button>}
                  <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" title="More actions" aria-label="More actions"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      {p.status === "Published" && <DropdownMenuItem onClick={() => deactivate(p)}><PauseCircle className="w-4 h-4 mr-2" />Deactivate (pause)</DropdownMenuItem>}
                      {p.status === "Inactive" && <DropdownMenuItem onClick={() => setActivate(p)}><PlayCircle className="w-4 h-4 mr-2" />Activate again</DropdownMenuItem>}
                      {p.status === "Published" && <DropdownMenuItem onClick={() => setResend({ ...p, preset: "reaccept" })}><RotateCcw className="w-4 h-4 mr-2" />Ask everyone to accept again</DropdownMenuItem>}
                      {p.unpublishedChanges && <DropdownMenuItem onClick={() => discard(p)}><Undo2 className="w-4 h-4 mr-2" />Discard unpublished changes</DropdownMenuItem>}
                      {p.version === 0 && !p.systemKey && <DropdownMenuItem className="text-red-600" onClick={() => discard(p)}><Trash2 className="w-4 h-4 mr-2" />Cancel draft (delete)</DropdownMenuItem>}
                      <DropdownMenuItem onClick={() => act(p, "duplicate", {}, "Copied as a new draft")}><Copy className="w-4 h-4 mr-2" />Duplicate as new draft</DropdownMenuItem>
                      {p.status === "Retired" && <DropdownMenuItem onClick={() => act(p, "unretire", {}, "Restored")}><ArchiveRestore className="w-4 h-4 mr-2" />Restore from retired</DropdownMenuItem>}
                      {p.status !== "Retired" && !p.systemKey && p.version > 0 && <><DropdownMenuSeparator /><DropdownMenuItem className="text-red-600" onClick={() => retire(p)}><Archive className="w-4 h-4 mr-2" />Retire</DropdownMenuItem></>}
                    </DropdownMenuContent></DropdownMenu>
                </td>
              </tr>); })}
            {!isLoading && !visible.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No policies yet.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
      {edit && <EditDialog p={edit} onClose={() => setEdit(null)} onDone={refresh} />}
      {publish && <PublishDialog p={publish} onClose={() => setPublish(null)} onDone={refresh} />}
      {report && <ReportSheet p={report} onClose={() => setReport(null)} />}
      {resend && <ResendDialog p={resend} onClose={() => setResend(null)} onDone={refresh} />}
      {activate && <ActivateDialog p={activate} onClose={() => setActivate(null)} onDone={refresh} />}
      {history && <HistorySheet p={history} onClose={() => setHistory(null)} onDone={refresh} />}
    </div>
  );
}

function EditDialog({ p, onClose, onDone }: { p: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const { data: roles = [] } = useQuery({ queryKey: ["roles"], queryFn: () => apiFetch<any[]>("/roles") });
  const [f, setF] = useState<any>({ ...p, audience: p.audience || { all: true } }); const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v })); const setA = (k: string, v: any) => setF((x: any) => ({ ...x, audience: { ...x.audience, [k]: v } }));
  const a = f.audience;
  async function save() {
    setBusy(true);
    try {
      const body = { title: f.title, body: f.body, category: f.category, requirement: f.requirement, dueDays: Number(f.dueDays), audience: a, allowWithdraw: f.allowWithdraw, push: f.push, blockAccess: f.blockAccess !== false };
      if (p.id) { const r = await apiFetch<any>(`/policies/${p.id}`, { method: "PATCH", body: JSON.stringify(body) }); toast({ title: "Saved", description: r.note }); }
      else { await apiFetch("/policies", { method: "POST", body: JSON.stringify(body) }); toast({ title: "Draft saved — publish it when ready" }); }
      onDone(); onClose();
    } catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{p.id ? `Edit ${p.code}` : "New policy / notice"}</DialogTitle>{p.version > 0 && <DialogDescription>Text and title changes are kept as unpublished changes — users stay on version {p.version} until you publish. Audience, days and halt-access settings apply as soon as you save.</DialogDescription>}</DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1"><div className="text-xs font-medium">Title *</div><Input value={f.title || ""} onChange={e => set("title", e.target.value)} placeholder="e.g. Acceptable Use Policy" /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><div className="text-xs font-medium">Type</div><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.category} onChange={e => set("category", e.target.value)}><option>Policy</option><option>Notice</option><option>Consent</option></select></div>
          <div className="space-y-1"><div className="text-xs font-medium">Acceptance</div><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.requirement} onChange={e => set("requirement", e.target.value)}><option value="Mandatory">Mandatory (must accept)</option><option value="Optional">Optional (accept / decline)</option><option value="Information">Information (acknowledge)</option></select></div>
        </div>
        {f.requirement === "Mandatory" && <div className={cn("rounded-lg border p-3 space-y-2", f.blockAccess !== false ? "border-red-200 bg-red-50/50 dark:bg-red-900/10 dark:border-red-900" : "")}>
          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={f.blockAccess !== false} onCheckedChange={v => set("blockAccess", v)} />Halt IT Hub access if not accepted</label>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-muted-foreground">{f.blockAccess !== false ? "Halt access" : "Remind to accept within"}</span>
            <Input type="number" min={0} max={90} className="w-20 h-8" value={f.dueDays} onChange={e => set("dueDays", e.target.value)} />
            <span className="text-muted-foreground">{f.blockAccess !== false ? (Number(f.dueDays) === 0 ? "days after publishing — i.e. immediately: nobody can use IT Hub until they accept" : "days after publishing for anyone who has not accepted (only My Policies stays open)") : "days (reminders only — access is never halted)"}</span>
          </div>
        </div>}
        <div className="space-y-1"><div className="text-xs font-medium">Text *</div><Textarea rows={10} value={f.body || ""} onChange={e => set("body", e.target.value)} placeholder="The full text users read before accepting." /></div>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="text-xs font-medium">Who must accept</div>
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!!a.all} onChange={() => set("audience", { all: true })} />Everyone using IT Hub</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!a.all} onChange={() => set("audience", { all: false, roles: [], departments: [], userTypes: [], ...(p.systemKey === "device_agent" ? { agentUsers: true } : {}) })} />Selected groups</label>
          {!a.all && <div className="pl-6 space-y-2">
            <div className="flex flex-wrap gap-1">{roles.map((r: any) => { const on = (a.roles || []).includes(r.id); return <button key={r.id} type="button" onClick={() => setA("roles", on ? a.roles.filter((x: number) => x !== r.id) : [...(a.roles || []), r.id])} className={cn("px-2 py-1 rounded border text-xs", on ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground")}>{r.name}</button>; })}</div>
            <Input placeholder="Departments (comma separated), e.g. IT, Finance" value={(a.departments || []).join(", ")} onChange={e => setA("departments", e.target.value.split(",").map(x => x.trim()).filter(Boolean))} />
            <div className="flex gap-3 text-sm">{["internal", "external"].map(t => <label key={t} className="flex items-center gap-1.5"><input type="checkbox" checked={(a.userTypes || []).includes(t)} onChange={e => setA("userTypes", e.target.checked ? [...(a.userTypes || []), t] : a.userTypes.filter((x: string) => x !== t))} />{t === "internal" ? "All internal staff" : "All external users"}</label>)}</div>
            {p.systemKey === "device_agent" && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!!a.agentUsers} onChange={e => setA("agentUsers", e.target.checked)} />Employees given a device agent key</label>}
          </div>}
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          {f.requirement === "Optional" && <label className="flex items-center gap-2"><Switch checked={!!f.allowWithdraw} onCheckedChange={v => set("allowWithdraw", v)} />Users can withdraw consent</label>}
          <label className="flex items-center gap-2"><Switch checked={!!f.push} onCheckedChange={v => set("push", v)} />Notify on publish (in-app, email, push)</label>
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Save</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

function PublishDialog({ p, onClose, onDone }: { p: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast(); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { const r = await apiFetch<any>(`/policies/${p.id}/publish`, { method: "POST", body: JSON.stringify({ changeNote: note.trim() || undefined }) }); toast({ title: `Published version ${r.version}`, description: r.notified ? `${r.notified} people notified` : undefined }); onDone(); onClose(); }
    catch (e: any) { toast({ title: "Could not publish", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Publish {p.title}</DialogTitle><DialogDescription>{p.version ? `Version ${p.version + 1} replaces version ${p.version}; everyone in the audience must accept again.` : "Users in the audience will be asked to accept it."}{p.requirement === "Mandatory" && p.blockAccess ? ` IT Hub access is halted for anyone who has not accepted ${p.dueDays ? `after ${p.dueDays} days` : "— immediately"}.` : ""}</DialogDescription></DialogHeader>
      <div className="space-y-1"><div className="text-xs font-medium">{p.version ? "What changed (shown to users) *" : "Note (optional)"}</div><Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} /></div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={go} disabled={busy || (p.version > 0 && note.trim().length < 3)}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Publish</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

function ReportSheet({ p, onClose }: { p: any; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["policy-report", p.id], queryFn: () => apiFetch<any>(`/policies/${p.id}/report`) });
  const { data: log = [] } = useQuery({ queryKey: ["policy-log", p.id], queryFn: () => apiFetch<any[]>(`/policies/${p.id}/log`) });
  const [tab, setTab] = useState<"all" | "Accepted" | "pending" | "Declined">("all"); const [q, setQ] = useState("");
  const users: any[] = data?.users || [];
  const list = useMemo(() => users.filter(u => (tab === "all" || (tab === "pending" ? !u.decision || u.decision === "Withdrawn" : u.decision === tab)) && (!q.trim() || [u.name, u.email, u.employeeCode, u.department].some((v: string) => v?.toLowerCase().includes(q.trim().toLowerCase())))), [users, tab, q]);
  const cnt = (t: string) => users.filter(u => t === "pending" ? !u.decision || u.decision === "Withdrawn" : u.decision === t).length;
  return (
    <Sheet open onOpenChange={o => !o && onClose()}><SheetContent className="w-full sm:max-w-[720px] overflow-y-auto">
      <SheetHeader><SheetTitle>{p.title} — acceptance register</SheetTitle><SheetDescription>{p.code} · current version {p.version} · {p.requirement}{data?.policy?.dueAt && p.requirement === "Mandatory" ? ` · accept by ${fmtDate(data.policy.dueAt)}` : ""}</SheetDescription></SheetHeader>
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {([["all", `All ${users.length}`], ["Accepted", `Accepted ${cnt("Accepted")}`], ["pending", `Pending ${cnt("pending")}`], ["Declined", `Declined ${cnt("Declined")}`]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k as any)} className={cn("px-2.5 py-1 rounded-md text-xs border", tab === k ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground")}>{l}</button>)}
          <Input className="h-8 w-48 ml-auto" placeholder="Search person…" value={q} onChange={e => setQ(e.target.value)} />
          <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => csv(list.map(u => ({ ...u, status: u.decision || "Pending", version: p.version })), [["Name", "name"], ["Email", "email"], ["Employee Code", "employeeCode"], ["Department", "department"], ["Version", "version"], ["Status", "status"], ["Decided at", "at"], ["Method", "method"], ["IP", "ip"], ["Last accepted version", "lastAcceptedVersion"]], `${p.code}_v${p.version}_acceptance.csv`)}><Download className="w-3.5 h-3.5" />CSV</Button>
        </div>
        <div className="border rounded-lg divide-y text-xs max-h-[45vh] overflow-y-auto">{list.map(u => (
          <div key={u.userId} className="px-3 py-1.5 flex gap-2 flex-wrap items-center"><span className="font-medium">{u.name}</span><span className="text-muted-foreground">{[u.employeeCode, u.department].filter(Boolean).join(" · ")}</span>
            <span className={cn("ml-auto px-1.5 rounded font-semibold", u.decision === "Accepted" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : u.decision === "Declined" ? "bg-muted" : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300")}>{u.decision || (u.lastAcceptedVersion ? `Pending (accepted v${u.lastAcceptedVersion})` : "Pending")}</span>
            {u.at && <span className="text-muted-foreground">{fmtDateTime(u.at)} · {u.method === "agent-link" ? "installer link" : u.method}</span>}</div>))}
          {!list.length && <div className="px-3 py-3 text-muted-foreground">Nobody here.</div>}</div>
        <section><h4 className="text-xs font-semibold mb-1 flex items-center gap-1"><History className="w-3.5 h-3.5" />Versions</h4>
          <div className="border rounded-lg divide-y text-xs">{(data?.versions || []).map((v: any) => <div key={v.version} className="px-3 py-1.5 flex gap-2 flex-wrap"><b>v{v.version}</b><span>{v.changeNote}</span><span className="ml-auto text-muted-foreground">{fmtDate(v.publishedAt)} · {String(v.publishedBy || "").replace(/ <.*>$/, "")} · {v.accepted} accepted · <span className="font-mono" title={v.sha256}>#{String(v.sha256).slice(0, 10)}</span></span></div>)}</div></section>
        <section><div className="flex items-center justify-between"><h4 className="text-xs font-semibold">Full decision log (all versions)</h4>
          <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => csv(log, [["Name", "name"], ["Email", "email"], ["Employee Code", "employeeCode"], ["Version", "version"], ["Decision", "decision"], ["At", "at"], ["Method", "method"], ["IP", "ip"], ["Browser", "userAgent"], ["Text SHA-256", "sha256"], ["Note", "note"]], `${p.code}_decision_log.csv`)}><Download className="w-3 h-3" />CSV</Button></div>
          <div className="text-[11px] text-muted-foreground">{log.length} records — kept permanently, never edited.</div></section>
      </div>
    </SheetContent></Sheet>
  );
}

function StatusBadge({ p }: { p: any }) {
  const st = p.status === "Published" && p.unpublishedChanges ? "Published · edited" : p.status;
  const c = p.status === "Published" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : p.status === "Inactive" ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" : p.status === "Draft" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" : "bg-muted text-muted-foreground";
  return <span className={cn("px-2 py-0.5 rounded-full font-semibold whitespace-nowrap", c)}>{st}</span>;
}

function ResendDialog({ p, onClose, onDone }: { p: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast(); const st = p.stats || {};
  const [mode, setMode] = useState<"pending" | "all" | "reaccept">(p.preset || "pending");
  const [msg, setMsg] = useState(""); const [note, setNote] = useState(""); const [restart, setRestart] = useState(false); const [busy, setBusy] = useState(false);
  const halts = p.requirement === "Mandatory" && p.blockAccess;
  async function go() {
    setBusy(true);
    try {
      const r = await apiFetch<any>(`/policies/${p.id}/resend`, { method: "POST", body: JSON.stringify({ scope: mode === "pending" ? "pending" : "all", reaccept: mode === "reaccept", changeNote: note.trim() || undefined, message: msg.trim() || undefined, restartClock: mode !== "reaccept" && restart }) });
      toast({ title: mode === "reaccept" ? `Version ${r.version} published — everyone must accept again` : `Sent to ${r.notified} people`, description: mode === "reaccept" ? `${r.notified} people notified` : undefined }); onDone(); onClose();
    } catch (e: any) { toast({ title: "Could not send", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  const opt = (k: typeof mode, t: string, d: string) => <label className={cn("flex gap-2 rounded-lg border p-2.5 cursor-pointer text-sm", mode === k && "border-primary bg-primary/5")}><input type="radio" className="mt-1" checked={mode === k} onChange={() => setMode(k)} /><div><div className="font-medium">{t}</div><div className="text-xs text-muted-foreground">{d}</div></div></label>;
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Resend — {p.title}</DialogTitle><DialogDescription>{p.code} · version {p.version} · {st.accepted ?? 0} of {st.audience ?? 0} accepted</DialogDescription></DialogHeader>
      <div className="space-y-2">
        {opt("pending", `Remind people who have not accepted (${st.pending ?? 0})`, "In-app, email and push to everyone still pending.")}
        {opt("all", `Send to everyone (${st.audience ?? 0})`, "Everyone in the audience, including those who already accepted, is asked to read it again. Their acceptance stays valid.")}
        {opt("reaccept", "Ask everyone to accept again", `Publishes the same text as version ${p.version + 1}. Every acceptance must be given again${halts ? `; access is halted ${p.dueDays ? `after ${p.dueDays} days` : "immediately"} for anyone who has not` : ""}.`)}
        {mode === "reaccept" && <div className="space-y-1"><div className="text-xs font-medium">Reason (shown to users as “What changed”)</div><Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Annual re-acceptance 2026" /></div>}
        <div className="space-y-1"><div className="text-xs font-medium">Message to add (optional)</div><Input value={msg} onChange={e => setMsg(e.target.value)} placeholder="e.g. Please complete this by Friday." /></div>
        {mode !== "reaccept" && halts && <label className="flex items-center gap-2 text-sm"><Switch checked={restart} onCheckedChange={setRestart} />Restart the {p.dueDays}-day deadline from today{p.dueAt ? ` (now ${fmtDate(p.dueAt)})` : ""}</label>}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={go} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}{mode === "reaccept" ? "Publish & send" : "Send"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

function ActivateDialog({ p, onClose, onDone }: { p: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast(); const [restart, setRestart] = useState(true); const [notify, setNotify] = useState(true); const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { const r = await apiFetch<any>(`/policies/${p.id}/activate`, { method: "POST", body: JSON.stringify({ restartClock: restart, notify }) }); toast({ title: "Activated", description: notify ? `${r.notified} people reminded` : undefined }); onDone(); onClose(); }
    catch (e: any) { toast({ title: "Could not activate", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Activate {p.title}</DialogTitle><DialogDescription>Version {p.version} applies again to its audience. Earlier acceptances of this version still count.</DialogDescription></DialogHeader>
      <div className="space-y-3 text-sm">
        {p.requirement === "Mandatory" && <label className="flex items-center gap-2"><Switch checked={restart} onCheckedChange={setRestart} />Give people {p.dueDays} days from today{p.blockAccess ? " before access is halted" : ""}</label>}
        <label className="flex items-center gap-2"><Switch checked={notify} onCheckedChange={setNotify} />Remind people who have not accepted</label>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={go} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Activate</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

/** Line diff (LCS) — small texts only. */
function diffLines(a: string, b: string) {
  const x = (a || "").split("\n"), y = (b || "").split("\n"); const n = x.length, m = y.length;
  if (n * m > 400_000) return [...x.map(t => ({ t, k: "-" })), ...y.map(t => ({ t, k: "+" }))];
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { t: string; k: string }[] = []; let i = 0, j = 0;
  while (i < n && j < m) { if (x[i] === y[j]) { out.push({ t: x[i], k: " " }); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: x[i++], k: "-" }); else out.push({ t: y[j++], k: "+" }); }
  while (i < n) out.push({ t: x[i++], k: "-" }); while (j < m) out.push({ t: y[j++], k: "+" });
  return out;
}

function HistorySheet({ p, onClose, onDone }: { p: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["policy-history", p.id], queryFn: () => apiFetch<any>(`/policies/${p.id}/history`) });
  const versions: any[] = data?.versions || [];
  const items = useMemo(() => [...(p.unpublishedChanges && data ? [{ version: "draft", title: data.policy.title, body: data.policy.body, requirement: data.policy.requirement, changeNote: "Unpublished changes (working copy)" }] : []), ...versions], [versions, data, p.unpublishedChanges]);
  const [sel, setSel] = useState<any>(null); const [cmp, setCmp] = useState<string>("prev");
  const cur = sel ?? items[0]?.version;
  const vi = items.findIndex(v => v.version === cur); const v = items[vi];
  const other = cmp === "none" ? null : cmp === "prev" ? items[vi + 1] : items.find(x => String(x.version) === cmp);
  const diff = useMemo(() => v && other ? diffLines(other.body, v.body) : null, [v, other]);
  async function restore(ver: number) {
    if (!await confirmDialog(`Copy the text of version ${ver} into the working copy? Users stay on version ${p.version} until you publish it as version ${p.version + 1}.`, { title: "Restore version", confirmText: "Copy as changes" })) return;
    try { const r = await apiFetch<any>(`/policies/${p.id}/restore/${ver}`, { method: "POST" }); toast({ title: "Restored as unpublished changes", description: r.note }); onDone(); qc.invalidateQueries({ queryKey: ["policy-history", p.id] }); onClose(); }
    catch (e: any) { toast({ title: "Could not restore", description: e.message, variant: "destructive" }); }
  }
  return (
    <Sheet open onOpenChange={o => !o && onClose()}><SheetContent className="w-full sm:max-w-[900px] overflow-y-auto">
      <SheetHeader><SheetTitle>{p.title} — version history</SheetTitle><SheetDescription>{p.code} · users are on version {p.version} · every published version is kept unchanged with its text fingerprint</SheetDescription></SheetHeader>
      <div className="mt-4 grid md:grid-cols-[230px_1fr] gap-4">
        <div className="border rounded-lg divide-y text-xs self-start">{items.map(x => (
          <button key={x.version} onClick={() => { setSel(x.version); setCmp("prev"); }} className={cn("w-full text-left px-3 py-2 hover:bg-muted/50", cur === x.version && "bg-primary/5 border-l-2 border-primary")}>
            <div className="flex gap-1.5 items-center"><b>{x.version === "draft" ? "Working copy" : `v${x.version}`}</b>{x.version === p.version && <span className="px-1 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 text-[10px] font-semibold">current</span>}<span className="ml-auto text-muted-foreground">{x.publishedAt ? fmtDate(x.publishedAt) : ""}</span></div>
            <div className="text-muted-foreground truncate">{x.changeNote}</div>
            {x.version !== "draft" && <div className="text-muted-foreground">{x.accepted} accepted · {String(x.publishedBy || "").replace(/ <.*>$/, "")}</div>}
          </button>))}
          {!items.length && <div className="px-3 py-3 text-muted-foreground">Loading…</div>}</div>
        {v && <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold text-sm">{v.title}</div><span className="text-xs text-muted-foreground">{v.requirement}{v.sha256 ? ` · #${String(v.sha256).slice(0, 10)}` : ""}</span>
            <select className="h-8 ml-auto rounded-md border bg-background px-2 text-xs" value={cmp} onChange={e => setCmp(e.target.value)}>
              <option value="none">Show text only</option><option value="prev">Compare with previous</option>
              {items.filter(x => x.version !== v.version).map(x => <option key={x.version} value={String(x.version)}>Compare with {x.version === "draft" ? "working copy" : `v${x.version}`}</option>)}
            </select>
            {v.version !== "draft" && p.status !== "Retired" && <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => restore(v.version)}><Undo2 className="w-3.5 h-3.5" />Restore this text</Button>}
          </div>
          {other && other.title !== v.title && <div className="text-xs">Title: <span className="line-through text-red-600">{other.title}</span> → <span className="text-emerald-700">{v.title}</span></div>}
          {other && other.requirement !== v.requirement && <div className="text-xs">Acceptance: <span className="line-through text-red-600">{other.requirement}</span> → <span className="text-emerald-700">{v.requirement}</span></div>}
          {diff ? <><div className="text-[11px] text-muted-foreground">Changes from {other.version === "draft" ? "working copy" : `v${other.version}`}: <span className="text-emerald-700">+{diff.filter(d => d.k === "+").length}</span> / <span className="text-red-600">−{diff.filter(d => d.k === "-").length}</span> lines{!diff.some(d => d.k !== " ") ? " — text identical" : ""}</div>
            <div className="border rounded-lg text-sm leading-relaxed max-h-[55vh] overflow-y-auto font-[inherit]">{diff.map((d, i) => <div key={i} className={cn("px-3 whitespace-pre-wrap", d.k === "+" ? "bg-emerald-50 dark:bg-emerald-900/20" : d.k === "-" ? "bg-red-50 dark:bg-red-900/20 line-through text-red-700 dark:text-red-300" : "")}>{d.t || " "}</div>)}</div></>
            : <div className="whitespace-pre-wrap text-sm leading-relaxed border rounded-lg p-3 bg-muted/30 max-h-[55vh] overflow-y-auto">{v.body}</div>}
        </div>}
      </div>
      <section className="mt-5"><h4 className="text-xs font-semibold mb-1">Admin activity</h4>
        <div className="border rounded-lg divide-y text-xs max-h-[30vh] overflow-y-auto">{(data?.events || []).map((e: any, i: number) => <div key={i} className="px-3 py-1.5 flex gap-2 flex-wrap"><span className="font-medium capitalize">{String(e.action).replace(/-/g, " ")}</span><span className="text-muted-foreground flex-1 min-w-[200px]">{e.summary}</span><span className="text-muted-foreground">{fmtDateTime(e.at)} · {String(e.by || "").replace(/ <.*>$/, "")}</span></div>)}
          {data && !data.events?.length && <div className="px-3 py-2 text-muted-foreground">No activity recorded.</div>}</div></section>
    </SheetContent></Sheet>
  );
}
