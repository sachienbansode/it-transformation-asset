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
import { confirmDialog } from "@/components/confirm-dialog";
import { Plus, Send, BellRing, Users, Download, History, Archive, Edit, Loader2 } from "lucide-react";

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
  const refresh = () => qc.invalidateQueries({ queryKey: ["policies"] });
  async function remind(p: any) { try { const r = await apiFetch<any>(`/policies/${p.id}/remind`, { method: "POST" }); toast({ title: `Reminder sent to ${r.notified} people` }); } catch (e: any) { toast({ title: "Could not send", description: e.message, variant: "destructive" }); } }
  async function retire(p: any) {
    if (!await confirmDialog(`Retire "${p.title}"? Users will no longer be asked to accept it. All acceptance records are kept.`, { title: "Retire policy", confirmText: "Retire" })) return;
    try { await apiFetch(`/policies/${p.id}/retire`, { method: "POST" }); refresh(); } catch (e: any) { toast({ title: "Could not retire", description: e.message, variant: "destructive" }); }
  }
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><h1 className="text-2xl font-bold tracking-tight">Policies &amp; Consent</h1>
          <p className="text-sm text-muted-foreground">Publish policies, notices and consents; every acceptance is recorded with the version, text fingerprint, time, IP and browser. Mandatory items lock IT Hub for a person once the days to accept have passed.</p></div>
        <Button className="gap-2" onClick={() => setEdit({ requirement: "Mandatory", category: "Policy", dueDays: 7, audience: { all: true }, allowWithdraw: true, push: true })}><Plus className="w-4 h-4" />New policy / notice</Button>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b"><th className="p-3 font-semibold">Policy</th><th className="p-3 font-semibold">Type</th><th className="p-3 font-semibold">Who</th><th className="p-3 font-semibold">Acceptance</th><th className="p-3 font-semibold">Status</th><th className="p-3 font-semibold text-right">Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {list.map((p: any) => { const st = p.stats; const pct = st?.audience ? Math.round(st.accepted / st.audience * 100) : 0; return (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-3"><div className="font-medium">{p.title}</div><div className="text-xs text-muted-foreground">{p.code}{p.version ? ` · v${p.version} · ${fmtDate(p.publishedAt)}` : " · draft"}{p.systemKey ? " · built-in" : ""}</div>
                  {p.unpublishedChanges && <div className="text-[11px] text-amber-700 dark:text-amber-300">Edited — publish a new version for users to accept</div>}</td>
                <td className="p-3 text-xs"><span className={cn("px-2 py-0.5 rounded-full font-semibold", p.requirement === "Mandatory" ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" : p.requirement === "Optional" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" : "bg-muted")}>{p.requirement}</span><div className="text-muted-foreground mt-0.5">{p.category}{p.requirement === "Mandatory" ? ` · ${p.dueDays} days` : ""}</div></td>
                <td className="p-3 text-xs">{audText(p.audience)}</td>
                <td className="p-3 text-xs min-w-[180px]">{st ? <><div className="flex justify-between"><span>{st.accepted} of {st.audience} accepted</span><span className="font-semibold">{pct}%</span></div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                  <div className="text-muted-foreground mt-0.5">{st.pending} pending{st.declined ? ` · ${st.declined} declined` : ""}{st.overdue ? <span className="text-red-600"> · {st.overdue} locked out</span> : ""}</div></> : <span className="text-muted-foreground">—</span>}</td>
                <td className="p-3 text-xs">{p.status}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {p.status !== "Retired" && <Button size="sm" variant="ghost" title="Edit" onClick={() => setEdit(p)}><Edit className="w-4 h-4" /></Button>}
                  {p.status !== "Retired" && (p.version === 0 || p.unpublishedChanges) && <Button size="sm" variant="outline" className="gap-1" onClick={() => setPublish(p)}><Send className="w-3.5 h-3.5" />Publish</Button>}
                  {p.status === "Published" && <Button size="sm" variant="ghost" title="Who accepted" onClick={() => setReport(p)}><Users className="w-4 h-4" /></Button>}
                  {p.status === "Published" && <Button size="sm" variant="ghost" title="Remind people who have not accepted" onClick={() => remind(p)}><BellRing className="w-4 h-4" /></Button>}
                  {p.status !== "Retired" && !p.systemKey && <Button size="sm" variant="ghost" title="Retire" onClick={() => retire(p)}><Archive className="w-4 h-4 text-muted-foreground" /></Button>}
                </td>
              </tr>); })}
            {!isLoading && !list.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No policies yet.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
      {edit && <EditDialog p={edit} onClose={() => setEdit(null)} onDone={refresh} />}
      {publish && <PublishDialog p={publish} onClose={() => setPublish(null)} onDone={refresh} />}
      {report && <ReportSheet p={report} onClose={() => setReport(null)} />}
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
      const body = { title: f.title, body: f.body, category: f.category, requirement: f.requirement, dueDays: Number(f.dueDays), audience: a, allowWithdraw: f.allowWithdraw, push: f.push };
      if (p.id) { const r = await apiFetch<any>(`/policies/${p.id}`, { method: "PATCH", body: JSON.stringify(body) }); toast({ title: "Saved", description: r.note }); }
      else { await apiFetch("/policies", { method: "POST", body: JSON.stringify(body) }); toast({ title: "Draft saved — publish it when ready" }); }
      onDone(); onClose();
    } catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{p.id ? `Edit ${p.code}` : "New policy / notice"}</DialogTitle>{p.version > 0 && <DialogDescription>Saving keeps users on version {p.version}. Publish a new version when you want everyone to accept the change.</DialogDescription>}</DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1"><div className="text-xs font-medium">Title *</div><Input value={f.title || ""} onChange={e => set("title", e.target.value)} placeholder="e.g. Acceptable Use Policy" /></div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1"><div className="text-xs font-medium">Type</div><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.category} onChange={e => set("category", e.target.value)}><option>Policy</option><option>Notice</option><option>Consent</option></select></div>
          <div className="space-y-1"><div className="text-xs font-medium">Acceptance</div><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.requirement} onChange={e => set("requirement", e.target.value)}><option value="Mandatory">Mandatory (must accept)</option><option value="Optional">Optional (accept / decline)</option><option value="Information">Information (acknowledge)</option></select></div>
          {f.requirement === "Mandatory" && <div className="space-y-1"><div className="text-xs font-medium">Days to accept, then lock</div><Input type="number" min={0} max={90} value={f.dueDays} onChange={e => set("dueDays", e.target.value)} /></div>}
        </div>
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
      <DialogHeader><DialogTitle>Publish {p.title}</DialogTitle><DialogDescription>{p.version ? `Version ${p.version + 1} replaces version ${p.version}; everyone in the audience must accept again.` : "Users in the audience will be asked to accept it."}{p.requirement === "Mandatory" ? ` IT Hub locks for anyone who has not accepted after ${p.dueDays} days.` : ""}</DialogDescription></DialogHeader>
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
