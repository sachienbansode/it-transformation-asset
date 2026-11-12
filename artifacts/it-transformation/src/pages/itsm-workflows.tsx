import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PageHero } from "@/components/workspace-ui";
import { confirmHeader, reasonDialog } from "@/components/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { WorkflowCanvas, Palette, remove, typeOf, OUTCOMES, type WDef, type Sel } from "@/components/workflow-canvas";
import { Workflow, Plus, Save, Upload, FlaskConical, ArrowLeft, Trash2, History, Settings2, AlertTriangle, CheckCircle2, Loader2, Copy, ScrollText, BookOpenText } from "lucide-react";
import { Switch } from "@/components/ui/switch";

/* ITH-101 — ITSM › Workflows: list per ticket type and the drag-and-drop designer with versions, checks, test run and publish. */
const KIND_NAME: Record<string, string> = { incident: "Incidents", request: "Service Requests", problem: "Problems", change: "Change Requests" };

export default function ItsmWorkflows() {
  const [loc, nav] = useLocation();
  const search = useSearch(); const id = Number(new URLSearchParams(search).get("id")) || null;
  const { data: meta, error } = useQuery({ queryKey: ["wf-meta"], queryFn: () => apiFetch<any>("/itsm-workflows/meta"), retry: false });
  if (error) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{(error as Error).message}</CardContent></Card>;
  if (!meta) return <div className="text-sm text-muted-foreground">Loading…</div>;
  return id ? <Designer id={id} meta={meta} onBack={() => nav("/itsm-workflows")} key={id} /> : <List meta={meta} open={(i: number) => nav(`/itsm-workflows?id=${i}`)} />;
}

function List({ meta, open }: { meta: any; open: (id: number) => void }) {
  const [kind, setKind] = useState("incident"); const [create, setCreate] = useState(false); const [audit, setAudit] = useState(false);
  const qc = useQueryClient(); const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["wf-list"], queryFn: () => apiFetch<any>("/itsm-workflows") });
  async function toggle(r: any, on: boolean) {
    const reason = on ? "" : await reasonDialog(`Disable “${r.name}”? New ${KIND_NAME[r.ticketType].toLowerCase()} will no longer use it; tickets already running on it continue to the end.`, { title: "Disable workflow", label: "Reason (kept in the audit log)", confirmText: "Disable", destructive: true });
    if (reason === null) return;
    try {
      await apiFetch(`/itsm-workflows/${r.id}`, { method: "PATCH", body: JSON.stringify({ isActive: on, reason }), headers: on ? confirmHeader(`Enable “${r.name}” (v${r.published?.version}) for ${KIND_NAME[r.ticketType].toLowerCase()} — applies to ${matchText(r.match)}? New matching tickets will follow it.`) : { "X-No-Confirm": "1" } });
      toast({ title: on ? `“${r.name}” enabled` : `“${r.name}” disabled` }); qc.invalidateQueries({ queryKey: ["wf-list"] });
    } catch (e: any) { if (!e.cancelled) toast({ title: "Not changed", description: e.message, variant: "destructive" }); }
  }
  const rows = (data?.rows || []).filter((r: any) => r.ticketType === kind);
  return (
    <div className="space-y-4 max-w-7xl">
      <PageHero icon={Workflow} tone="blue" title="ITSM Workflows" subtitle="Draw how each kind of ticket moves: stages, approvals, conditions, assignment, notices and time limits. Publish a version to use it; tickets keep the version they started on."
        right={<div className="flex gap-1.5"><Button size="sm" variant="outline" onClick={() => setAudit(true)}><History className="w-4 h-4 mr-1" />Audit log</Button>{meta.canEdit && <Button size="sm" onClick={() => setCreate(true)}><Plus className="w-4 h-4 mr-1" />New workflow</Button>}</div>} />
      <div className="flex gap-1 border-b">{Object.entries(KIND_NAME).map(([k, l]) =>
        <button key={k} onClick={() => setKind(k)} className={cn("px-3 py-2 text-sm border-b-2 -mb-px", kind === k ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}>{l} <span className="text-xs">({(data?.rows || []).filter((r: any) => r.ticketType === k).length})</span></button>)}</div>
      <Card><CardContent className="p-0">
        {!rows.length ? <div className="p-8 text-center text-sm text-muted-foreground">No workflow for {KIND_NAME[kind].toLowerCase()} yet — tickets follow the standard statuses and the approval matrix.{meta.canEdit && " Click New workflow to draw one."}</div> :
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="p-3">Workflow</th><th className="p-3">Applies to</th><th className="p-3">Order</th><th className="p-3">Published</th><th className="p-3">Draft</th><th className="p-3">Tickets</th><th className="p-3">Enabled</th><th className="p-3" /></tr></thead>
            <tbody>{rows.map((r: any) => (
              <tr key={r.id} className={cn("border-b hover:bg-muted/30 cursor-pointer", !r.isActive && "text-muted-foreground")} onClick={() => open(r.id)} data-wf={r.name}>
                <td className="p-3"><div className="font-medium flex items-center gap-1.5 flex-wrap">{r.name}{r.createdBy === "System (preconfigured)" && <span className="rounded-full border px-1.5 text-[10px] font-normal">Preconfigured</span>}{r.managerApproval && <span className="rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-1.5 text-[10px] font-semibold">Manager approves first</span>}</div><div className="text-xs text-muted-foreground">{r.description || ""}</div>
                  {r.explain?.length > 0 && <details className="mt-1 text-xs" onClick={e => e.stopPropagation()}><summary className="cursor-pointer text-primary">How it works</summary><ol className="list-decimal pl-5 mt-1 space-y-0.5 text-foreground" data-testid="wf-explain">{r.explain.map((l: string, k: number) => <li key={k}>{l}</li>)}</ol></details>}</td>
                <td className="p-3 text-xs">{matchText(r.match)}</td><td className="p-3 text-xs">{r.rank}</td>
                <td className="p-3 text-xs">{r.published ? <><span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 font-semibold">v{r.published.version}</span><div className="text-muted-foreground mt-0.5">{fmtDateTime(r.published.publishedAt)}</div></> : <span className="text-muted-foreground">Not published</span>}</td>
                <td className="p-3 text-xs">{r.draft ? <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5">v{r.draft.version} draft</span> : "—"}</td>
                <td className="p-3 text-xs">{r.running} running · {r.tickets} total</td>
                <td className="p-3" onClick={e => e.stopPropagation()}><div className="flex items-center gap-2"><Switch aria-label={`Enable ${r.name}`} checked={r.isActive} disabled={!meta.canEdit || (!r.isActive && !r.published)} onCheckedChange={v => toggle(r, v)} />
                  <span className={cn("text-xs", r.isActive ? "text-emerald-600 font-semibold" : "text-muted-foreground")}>{r.isActive ? "On" : r.published ? "Off" : "Publish first"}</span></div></td>
                <td className="p-3 text-right"><Button size="sm" variant="outline">Open</Button></td>
              </tr>))}</tbody></table>}
      </CardContent></Card>
      <div className="text-xs text-muted-foreground">Preconfigured workflows are published but switched off — review one, change it if needed (Edit as new draft → Publish), then switch it on. The first enabled workflow (lowest order) whose “applies to” matches a new ticket runs it. A ticket with a workflow uses the workflow's approvals instead of the approval matrix.</div>
      {create && <CreateDialog meta={meta} kind={kind} onClose={() => setCreate(false)} onDone={open} />}
      <Dialog open={audit} onOpenChange={setAudit}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Workflow audit log</DialogTitle><DialogDescription>Every create, save, publish, enable / disable, settings change and approval decision.</DialogDescription></DialogHeader>{audit && <AuditLog />}</DialogContent></Dialog>
    </div>
  );
}
const matchText = (m: any) => { const p = Object.entries(m || {}).filter(([, v]) => Array.isArray(v) && (v as any[]).length).map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`); return p.length ? p.join(" · ") : "All tickets"; };

function CreateDialog({ meta, kind, onClose, onDone }: { meta: any; kind: string; onClose: () => void; onDone: (id: number) => void }) {
  const { toast } = useToast(); const [f, setF] = useState({ ticketType: kind, name: "", description: "", blank: false, managerApproval: false }); const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { const r = await apiFetch<any>("/itsm-workflows", { method: "POST", body: JSON.stringify(f), headers: confirmHeader(`Create the workflow “${f.name}” for ${KIND_NAME[f.ticketType].toLowerCase()} as a draft${f.blank ? " (empty canvas)" : " (from the standard template)"}?`) }); onDone(r.id); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Not created", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>New workflow</DialogTitle><DialogDescription>It starts as a draft; nothing changes for tickets until you publish it.</DialogDescription></DialogHeader>
    <div className="space-y-3 text-sm">
      <label className="block">Ticket type<select value={f.ticketType} onChange={e => setF({ ...f, ticketType: e.target.value })} className="w-full h-9 rounded-md border bg-background px-2">{meta.kinds.map((k: any) => <option key={k.key} value={k.key}>{k.name}</option>)}</select></label>
      <label className="block">Name<Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Critical incident escalation" /></label>
      <label className="block">Description<Input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.managerApproval} onChange={e => setF({ ...f, managerApproval: e.target.checked })} />Reporting manager approves first (skipped and recorded when no manager is assigned)</label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.blank} onChange={e => setF({ ...f, blank: e.target.checked })} />Start from an empty canvas (otherwise the standard stages are drawn for you)</label>
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || f.name.trim().length < 3} onClick={go}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Create</Button></DialogFooter></DialogContent></Dialog>;
}

function Designer({ id, meta, onBack }: { id: number; meta: any; onBack: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [ver, setVer] = useState<number | null>(null);
  const { data: w, refetch } = useQuery({ queryKey: ["wf", id, ver], queryFn: () => apiFetch<any>(`/itsm-workflows/${id}${ver ? `?version=${ver}` : ""}`) });
  const [def, setDef] = useState<WDef>({ nodes: [], edges: [] }); const [dirty, setDirty] = useState(false); const [sel, setSel] = useState<Sel>(null);
  const [problems, setProblems] = useState<string[]>([]); const [busy, setBusy] = useState(""); const [panel, setPanel] = useState<"props" | "test" | "versions" | "explain" | "audit" | "settings">("props");
  const [hl, setHl] = useState<string[] | undefined>();
  useEffect(() => { if (w?.current) { setDef(w.current.definition); setProblems(w.current.problems || []); setDirty(false); setSel(null); setHl(undefined); } }, [w?.current?.id, w?.current?.definition && JSON.stringify(w.current.definition)]);
  if (!w) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const kind = meta.kinds.find((k: any) => k.key === w.ticketType);
  const isDraft = w.current?.status === "Draft"; const editable = w.canEdit && isDraft; const draft = w.versions.find((v: any) => v.status === "Draft");
  const change = (d: WDef) => { setDef(d); setDirty(true); setHl(undefined); };
  const refresh = () => { qc.invalidateQueries({ queryKey: ["wf-list"] }); return refetch(); };
  async function call(label: string, fn: () => Promise<any>, ok?: (r: any) => string) {
    setBusy(label); try { const r = await fn(); if (ok) toast({ title: ok(r) }); return r; } catch (e: any) { if (!e.cancelled) toast({ title: `${label} failed`, description: e.message, variant: "destructive" }); } finally { setBusy(""); }
  }
  const save = () => call("Save", () => apiFetch<any>(`/itsm-workflows/${id}/draft`, { method: "PUT", body: JSON.stringify({ definition: def }), headers: { "X-No-Confirm": "1" } }), r => `Draft v${r.version} saved${r.problems.length ? ` — ${r.problems.length} thing(s) to fix before publishing` : " — ready to publish"}`)
    .then(r => { if (r) { setProblems(r.problems); setDirty(false); refresh(); } return r; });
  async function publish() {
    if (dirty) { const r = await save(); if (!r) return; }
    const notes = await reasonDialog(`Publish “${w.name}” v${draft?.version}? New ${kind.name.toLowerCase()} matching it will follow this version${w.versions.find((v: any) => v.status === "Published") ? `; tickets already running stay on v${w.versions.find((v: any) => v.status === "Published").version}` : ""}.`, { title: "Publish workflow", label: "What changed (for the version history)", minLength: 0, confirmText: "Publish" });
    if (notes === null) return;
    const r = await call("Publish", () => apiFetch<any>(`/itsm-workflows/${id}/publish`, { method: "POST", body: JSON.stringify({ notes }), headers: { "X-No-Confirm": "1" } }), r => `v${r.version} published`);
    if (r) { setVer(null); refresh(); }
  }
  const S = sel?.kind === "node" ? def.nodes.find(n => n.id === sel.id) : null; const E = sel?.kind === "edge" ? def.edges.find(e => e.id === sel.id) : null;
  const setNode = (patch: any) => change({ ...def, nodes: def.nodes.map(n => n.id === S!.id ? { ...n, ...patch } : n) });
  const setCfg = (patch: any) => setNode({ config: { ...(S!.config || {}), ...patch } });
  const setEdge = (patch: any) => change({ ...def, edges: def.edges.map(e => e.id === E!.id ? { ...e, ...patch } : e) });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" onClick={() => { if (!dirty || window.confirm("Leave without saving the drawing?")) onBack(); }}><ArrowLeft className="w-4 h-4 mr-1" />Workflows</Button>
        <div><div className="font-semibold">{w.name} <span className="text-xs font-normal text-muted-foreground">· {kind?.name} · {matchText(w.match)}</span></div>
          <div className="text-xs text-muted-foreground">Viewing v{w.current?.version} <span className={cn("rounded-full px-1.5 font-semibold", isDraft ? "bg-amber-100 text-amber-700" : w.current?.status === "Published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>{w.current?.status}</span>{dirty && <span className="ml-2 text-amber-600">unsaved changes</span>}{w.isActive ? <span className="ml-2 text-emerald-600 font-semibold">· enabled</span> : <span className="ml-2">· disabled</span>}</div></div>
        <div className="ml-auto flex gap-1.5 flex-wrap">
          {w.canEdit && !isDraft && !draft && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call("Edit", () => apiFetch<any>(`/itsm-workflows/${id}/versions/${w.current.id}/copy`, { method: "POST", headers: { "X-No-Confirm": "1" } }), r => `Draft v${r.version} started`).then(r => { if (r) { setVer(r.versionId); refresh(); } })}><Copy className="w-4 h-4 mr-1" />Edit as new draft</Button>}
          {w.canEdit && !isDraft && draft && <Button size="sm" variant="outline" onClick={() => setVer(draft.id)}>Open draft v{draft.version}</Button>}
          {editable && <Button size="sm" variant="outline" disabled={!!busy || !dirty} onClick={save}>{busy === "Save" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}Save draft</Button>}
          {editable && <Button size="sm" disabled={!!busy} onClick={publish}><Upload className="w-4 h-4 mr-1" />Publish</Button>}
        </div>
      </div>
      {editable && problems.length > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs"><div className="font-semibold flex items-center gap-1 text-amber-800 dark:text-amber-200"><AlertTriangle className="w-3.5 h-3.5" />To fix before publishing ({problems.length})</div><ul className="list-disc pl-5 mt-1">{problems.slice(0, 8).map(p => <li key={p}>{p}</li>)}</ul></div>}
      {editable && !problems.length && !dirty && <div className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Checks passed — ready to publish</div>}
      <div className="grid grid-cols-[180px_1fr_300px] gap-3">
        <div className="space-y-2"><div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Steps</div><Palette disabled={!editable} hasStart={def.nodes.some(n => n.type === "start")} />
          {editable && <div className="text-[10px] text-muted-foreground leading-relaxed">Drag a step onto the canvas. Drag from a step's right-hand dot to another step to connect. Click to edit; Delete removes.</div>}</div>
        <WorkflowCanvas def={def} onChange={editable ? change : undefined} sel={sel} onSel={s => { setSel(s); if (s) setPanel("props"); }} readOnly={!editable} highlight={hl} />
        <Card className="h-[calc(100vh-260px)] min-h-[480px] overflow-hidden flex flex-col"><div className="flex border-b text-xs">
          {([["props", "Properties", Settings2], ["test", "Test run", FlaskConical], ["versions", "Versions", History], ["explain", "How it works", BookOpenText], ["audit", "Audit", ScrollText], ["settings", "Settings", Workflow]] as const).map(([k, l, I]) =>
            <button key={k} onClick={() => setPanel(k)} className={cn("flex-1 py-2 flex flex-col items-center gap-0.5", panel === k ? "text-primary border-b-2 border-primary font-semibold" : "text-muted-foreground")}><I className="w-3.5 h-3.5" />{l}</button>)}</div>
          <div className="p-3 overflow-y-auto flex-1 text-sm space-y-3">
            {panel === "props" && (S ? <NodeProps n={S} meta={meta} kind={kind} editable={editable} setNode={setNode} setCfg={setCfg} del={() => { remove(def, sel, change); setSel(null); }} />
              : E ? <EdgeProps e={E} def={def} editable={editable} setEdge={setEdge} del={() => { remove(def, sel, change); setSel(null); }} />
              : <div className="text-xs text-muted-foreground space-y-2"><p>Select a step or connection to edit it.</p><p><b>Stage</b> = a ticket status. The connections leaving a stage are the actions people can take (e.g. “Resolve”). A stage may have a time limit that follows the dashed “timeout” connection by itself.</p><p><b>Approval</b> waits for an approver and follows “approved” or “rejected”. <b>Condition</b> follows “yes” or “no”. <b>Assign</b> and <b>Notify</b> run straight away.</p></div>)}
            {panel === "test" && <TestRun id={id} def={def} kind={kind} onPath={setHl} />}
            {panel === "versions" && <div className="space-y-2">{w.versions.map((v: any) => (
              <div key={v.id} className={cn("rounded-md border p-2 text-xs", v.id === w.current?.id && "border-primary")}>
                <div className="flex items-center gap-1.5"><b>v{v.version}</b><span className={cn("rounded-full px-1.5", v.status === "Published" ? "bg-emerald-100 text-emerald-700" : v.status === "Draft" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>{v.status}</span><span className="ml-auto text-muted-foreground">{v.tickets} ticket(s)</span></div>
                <div className="text-muted-foreground mt-0.5">{v.publishedAt ? `Published by ${v.publishedBy} · ${fmtDateTime(v.publishedAt)}` : `Saved by ${v.updatedBy || v.createdBy} · ${fmtDateTime(v.updatedAt)}`}</div>
                {v.notes && <div className="mt-0.5">{v.notes}</div>}
                <div className="flex gap-1 mt-1">{v.id !== w.current?.id && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setVer(v.id)}>View</Button>}
                  {w.canEdit && !draft && v.status !== "Draft" && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => call("Copy", () => apiFetch<any>(`/itsm-workflows/${id}/versions/${v.id}/copy`, { method: "POST", headers: confirmHeader(`Start a new draft of “${w.name}” from v${v.version}?`) }), r => `Draft v${r.version} started from v${v.version}`).then(r => { if (r) { setVer(r.versionId); refresh(); } })}>Restore as draft</Button>}
                  {w.canEdit && v.status === "Draft" && w.versions.length > 1 && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-600" onClick={() => call("Discard", () => apiFetch<any>(`/itsm-workflows/${id}/draft/discard`, { method: "POST", headers: confirmHeader(`Discard draft v${v.version} of “${w.name}”? It is kept in the history as Retired.`) }), () => "Draft discarded").then(r => { if (r) { setVer(null); refresh(); } })}>Discard</Button>}</div>
              </div>))}</div>}
            {panel === "audit" && <AuditLog id={id} compact />}
            {panel === "explain" && <div className="text-xs space-y-2" data-testid="wf-explain-panel">{w.description && <p className="text-muted-foreground">{w.description}</p>}
              <ol className="list-decimal pl-5 space-y-1">{(w.current?.explain || []).map((l: string, k: number) => <li key={k}>{l}</li>)}</ol>
              {dirty && <p className="text-amber-600">Save the draft to refresh this explanation.</p>}</div>}
            {panel === "settings" && <SettingsPanel w={w} meta={meta} kind={kind} onSaved={refresh} />}
          </div></Card>
      </div>
    </div>
  );
}

function AuditLog({ id, compact }: { id?: number; compact?: boolean }) {
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ["wf-audit", id, page], queryFn: () => apiFetch<any>(`${id ? `/itsm-workflows/${id}/audit` : "/itsm-workflows-audit"}?page=${page}`) });
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 25));
  if (!data) return <div className="text-xs text-muted-foreground">Loading…</div>;
  if (!data.rows.length) return <div className="text-xs text-muted-foreground">Nothing recorded yet.</div>;
  return <div className="space-y-2" data-testid="wf-audit"><div className={cn("space-y-1.5", !compact && "max-h-[60vh] overflow-auto")}>{data.rows.map((a: any) => (
    <div key={a.id} className="rounded-md border px-2.5 py-1.5 text-xs"><div className="flex gap-2 flex-wrap"><span className={cn("rounded-full px-1.5 font-semibold", a.action === "enable" ? "bg-emerald-100 text-emerald-700" : a.action === "disable" ? "bg-red-100 text-red-700" : a.action === "publish" ? "bg-blue-100 text-blue-700" : "bg-muted")}>{a.action}</span>
      {!compact && a.workflow && <b>{a.workflow}</b>}<span className="text-muted-foreground ml-auto">{a.by} · {fmtDateTime(a.at)}</span></div><div className="mt-0.5">{a.summary}</div></div>))}</div>
    {pages > 1 && <div className="flex items-center gap-2 text-xs justify-end"><Button size="sm" variant="outline" className="h-6 px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>{page} / {pages}<Button size="sm" variant="outline" className="h-6 px-2" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}</div>;
}
const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => <label className="block text-xs"><span className="font-medium">{label}</span><div className="mt-0.5">{children}</div>{hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}</label>;
const Sel_ = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn("w-full h-8 rounded-md border bg-background px-2 text-xs", p.className)} />;

function NodeProps({ n, meta, kind, editable, setNode, setCfg, del }: any) {
  const c = n.config || {}; const T = typeOf(n.type); const field = kind.fields.find((f: any) => f.key === c.field);
  const [q, setQ] = useState(""); const { data: people = [] } = useQuery({ queryKey: ["wf-people", q], enabled: q.trim().length > 1, queryFn: () => apiFetch<any[]>(`/chats/people?q=${encodeURIComponent(q.trim())}`) });
  const dis = !editable;
  return <div className="space-y-3">
    <div className="text-xs font-semibold flex items-center gap-1.5"><T.icon className="w-4 h-4" />{T.label}</div>
    <Field label="Name on the canvas"><Input disabled={dis} className="h-8 text-xs" value={n.label || ""} onChange={e => setNode({ label: e.target.value })} /></Field>
    {n.type === "stage" && <><Field label="Ticket status"><Sel_ disabled={dis} value={c.status || ""} onChange={e => setCfg({ status: e.target.value })}><option value="">Choose…</option>{kind.statuses.map((s: string) => <option key={s}>{s}</option>)}</Sel_></Field>
      <Field label="Time limit (hours, optional)" hint="After this long at this stage the dashed “timeout” connection is followed by itself — e.g. escalate."><Input disabled={dis} type="number" min={0} className="h-8 text-xs" value={c.timeoutHours || ""} onChange={e => setCfg({ timeoutHours: Number(e.target.value) || undefined })} /></Field></>}
    {n.type === "approval" && <><Field label="Task title"><Input disabled={dis} className="h-8 text-xs" value={c.title || ""} onChange={e => setCfg({ title: e.target.value })} placeholder="e.g. Manager approval for {no}" /></Field>
      <Field label="Who approves"><Sel_ disabled={dis} value={c.approverType || "team"} onChange={e => setCfg({ approverType: e.target.value })}><option value="reporting_manager">Requester's reporting manager</option><option value="team">Any member of a team</option><option value="assigned_team">The team the ticket is with</option><option value="role">Anyone with a role</option><option value="users">Named people</option><option value="itsm_admins">ITSM Admins</option><option value="asset_admins">IT Asset Admins</option></Sel_></Field>
      {c.approverType === "reporting_manager" && <><Field label="Level" hint="Managers are set per user in Admin › Users (Reporting manager)."><Sel_ disabled={dis} value={c.level || 1} onChange={e => setCfg({ level: Number(e.target.value) })}><option value={1}>Reporting manager</option><option value={2}>Manager's manager (2nd level)</option></Sel_></Field>
        <Field label="If no manager is set" hint="The task goes to them instead, and the task says no manager was set."><Sel_ disabled={dis} value={c.fallback || "itsm_admins"} onChange={e => setCfg({ fallback: e.target.value })}><option value="itsm_admins">ITSM Admins</option><option value="asset_admins">IT Asset Admins</option></Sel_></Field></>}
      {["reporting_manager", "assigned_team", "itsm_admins", "asset_admins"].includes(c.approverType) ? null : c.approverType === "role" ? <Field label="Role"><Sel_ disabled={dis} value={c.roleId || ""} onChange={e => setCfg({ roleId: Number(e.target.value) || undefined, roleName: meta.roles.find((r: any) => String(r.id) === e.target.value)?.name })}><option value="">Choose…</option>{meta.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</Sel_></Field>
        : c.approverType === "users" ? <Field label="People" hint="One approval is enough. ITSM Admin can decide on their behalf with a reason.">
          <div className="space-y-1">{(c.userIds || []).map((u: number, i: number) => <div key={u} className="flex items-center gap-1 text-xs rounded border px-2 py-1"><span className="flex-1">{(c.userNames || [])[i] || `User ${u}`}</span>{!dis && <button className="text-red-600" onClick={() => setCfg({ userIds: c.userIds.filter((x: number) => x !== u), userNames: (c.userNames || []).filter((_: any, j: number) => j !== i) })}>×</button>}</div>)}
            {!dis && <><Input className="h-8 text-xs" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code…" />{people.slice(0, 6).map((p: any) => <button key={p.id} className="block w-full text-left text-xs px-2 py-1 hover:bg-muted rounded" onClick={() => { if (!(c.userIds || []).includes(p.id)) setCfg({ userIds: [...(c.userIds || []), p.id], userNames: [...(c.userNames || []), p.name] }); setQ(""); }}>{p.name} <span className="text-muted-foreground">{p.employeeCode}</span></button>)}</>}</div></Field>
        : <Field label="Team"><Sel_ disabled={dis} value={c.team || ""} onChange={e => setCfg({ team: e.target.value })}><option value="">Choose…</option>{meta.teams.map((t: any) => <option key={t.id}>{t.name}</option>)}</Sel_></Field>}</>}
    {n.type === "condition" && <><Field label="Field"><Sel_ disabled={dis} value={c.field || ""} onChange={e => setCfg({ field: e.target.value, value: "" })}><option value="">Choose…</option>{kind.fields.map((f: any) => <option key={f.key} value={f.key}>{f.label}</option>)}</Sel_></Field>
      <Field label="Check"><Sel_ disabled={dis} value={c.op || "eq"} onChange={e => setCfg({ op: e.target.value })}><option value="eq">is one of</option><option value="neq">is not one of</option><option value="contains">contains</option><option value="empty">is empty</option></Sel_></Field>
      {c.op !== "empty" && <Field label="Value(s)" hint="Separate several with commas.">{field?.values ? <div className="flex flex-wrap gap-1">{field.values.map((v: string) => { const on = String(c.value || "").split(",").map((x: string) => x.trim()).includes(v);
        return <button key={v} disabled={dis} onClick={() => { const cur = String(c.value || "").split(",").map((x: string) => x.trim()).filter(Boolean); setCfg({ value: (on ? cur.filter((x: string) => x !== v) : [...cur, v]).join(", ") }); }} className={cn("rounded-full border px-2 py-0.5 text-xs", on && "bg-primary text-primary-foreground border-primary")}>{v}</button>; })}</div>
        : <Input disabled={dis} className="h-8 text-xs" value={c.value || ""} onChange={e => setCfg({ value: e.target.value })} />}</Field>}</>}
    {n.type === "assign" && <><Field label="Team"><Sel_ disabled={dis} value={c.team || ""} onChange={e => setCfg({ team: e.target.value })}><option value="">Keep current</option>{meta.teams.map((t: any) => <option key={t.id}>{t.name}</option>)}</Sel_></Field>
      <Field label="Person (optional)" hint="Must be a member of the team."><Input disabled={dis} className="h-8 text-xs" value={c.user || ""} onChange={e => setCfg({ user: e.target.value })} placeholder="Name or email" /></Field></>}
    {n.type === "notify" && <><Field label="Tell">{["requester", "assignee", "team"].map(t => <label key={t} className="flex items-center gap-1.5 text-xs"><input type="checkbox" disabled={dis} checked={(c.to || []).includes(t)} onChange={e => setCfg({ to: e.target.checked ? [...(c.to || []), t] : (c.to || []).filter((x: string) => x !== t) })} />{t === "requester" ? "Requester" : t === "assignee" ? "Assigned person" : "Assigned team"}</label>)}</Field>
      <Field label="Title"><Input disabled={dis} className="h-8 text-xs" value={c.title || ""} onChange={e => setCfg({ title: e.target.value })} placeholder="{no} update" /></Field>
      <Field label="Message" hint="{no} ticket number, {title}, {status}, {priority}, {assignedTo}"><Textarea disabled={dis} rows={3} className="text-xs" value={c.message || ""} onChange={e => setCfg({ message: e.target.value })} placeholder="{no}: {title} is now at “{status}”." /></Field></>}
    {n.type === "end" && <Field label="Final status (optional)"><Sel_ disabled={dis} value={c.status || ""} onChange={e => setCfg({ status: e.target.value })}><option value="">Keep the current status</option>{kind.statuses.map((s: string) => <option key={s}>{s}</option>)}</Sel_></Field>}
    {editable && <Button size="sm" variant="outline" className="text-red-600 w-full" onClick={del}><Trash2 className="w-3.5 h-3.5 mr-1" />Remove step</Button>}
  </div>;
}
function EdgeProps({ e, def, editable, setEdge, del }: any) {
  const from = def.nodes.find((n: any) => n.id === e.from), to = def.nodes.find((n: any) => n.id === e.to); const opts = OUTCOMES[from?.type] || ["next"];
  return <div className="space-y-3"><div className="text-xs font-semibold">Connection</div><div className="text-xs text-muted-foreground">{from?.label} → {to?.label}</div>
    {opts.length > 1 && <Field label="When"><Sel_ disabled={!editable} value={e.outcome || "next"} onChange={ev => setEdge({ outcome: ev.target.value })}>{opts.map((o: string) => <option key={o} value={o}>{o === "next" ? "Action by a person" : o === "timeout" ? "Time limit reached" : o}</option>)}</Sel_></Field>}
    {(e.outcome || "next") === "next" && from?.type === "stage" && <Field label="Action name (button on the ticket)"><Input disabled={!editable} className="h-8 text-xs" value={e.label || ""} onChange={ev => setEdge({ label: ev.target.value })} placeholder="e.g. Resolve" /></Field>}
    {from?.type !== "stage" && <Field label="Label (optional)"><Input disabled={!editable} className="h-8 text-xs" value={e.label || ""} onChange={ev => setEdge({ label: ev.target.value })} /></Field>}
    {editable && <Button size="sm" variant="outline" className="text-red-600 w-full" onClick={del}><Trash2 className="w-3.5 h-3.5 mr-1" />Remove connection</Button>}</div>;
}
function TestRun({ id, def, kind, onPath }: any) {
  const [facts, setFacts] = useState<any>({}); const [res, setRes] = useState<any>(null); const [reject, setReject] = useState(false); const [noMgr, setNoMgr] = useState(false);
  async function run() { const r = await apiFetch<any>(`/itsm-workflows/${id}/simulate`, { method: "POST", body: JSON.stringify({ definition: def, facts, noManager: noMgr, choices: reject ? Array(20).fill("rejected") : [] }), headers: { "X-No-Confirm": "1" } }); setRes(r); onPath(r.path.map((p: any) => p.id)); }
  return <div className="space-y-2"><div className="text-xs text-muted-foreground">Enter sample ticket values and see the path it would take. Nothing is saved and no ticket is touched.</div>
    {kind.fields.map((f: any) => <Field key={f.key} label={f.label}>{f.values ? <Sel_ value={facts[f.key] || ""} onChange={e => setFacts({ ...facts, [f.key]: e.target.value })}><option value="">—</option>{f.values.map((v: string) => <option key={v}>{v}</option>)}</Sel_> : <Input className="h-8 text-xs" value={facts[f.key] || ""} onChange={e => setFacts({ ...facts, [f.key]: e.target.value })} />}</Field>)}
    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={reject} onChange={e => setReject(e.target.checked)} />Approvers reject</label>
    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={noMgr} onChange={e => setNoMgr(e.target.checked)} />Requester has no reporting manager</label>
    <div className="flex gap-1"><Button size="sm" className="flex-1" onClick={run}><FlaskConical className="w-3.5 h-3.5 mr-1" />Run test</Button>{res && <Button size="sm" variant="ghost" onClick={() => { setRes(null); onPath(undefined); }}>Clear</Button>}</div>
    {res && <div className="rounded-md border p-2 text-xs space-y-1" data-testid="wf-test-path">{res.path.map((p: any, i: number) => <div key={i} className="flex gap-1.5"><span className="text-muted-foreground w-4">{i + 1}.</span><span className="font-medium">{p.label}</span>{p.note && <span className="text-muted-foreground">— {p.note}</span>}</div>)}
      <div className={cn("font-semibold pt-1", res.stop === "Finished" ? "text-emerald-600" : "text-amber-600")}>{res.stop}</div></div>}
  </div>;
}
function SettingsPanel({ w, meta, kind, onSaved }: any) {
  const { toast } = useToast(); const [f, setF] = useState({ name: w.name, description: w.description || "", rank: w.rank, category: (w.match?.category || []).join(", "), priority: w.match?.priority || [] as string[], severity: w.match?.severity || [] as string[], type: w.match?.type || [] as string[], managerApproval: !!w.managerApproval, managerLevel: w.managerLevel || 1 });
  const cats = meta.categories.filter((c: any) => c.type === { incident: "Incident", request: "Service Request" }[w.ticketType as string]).map((c: any) => c.category);
  const split = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);
  async function save() {
    try { await apiFetch(`/itsm-workflows/${w.id}`, { method: "PATCH", body: JSON.stringify({ name: f.name, description: f.description, rank: f.rank, match: { category: split(f.category), priority: f.priority, severity: f.severity, type: f.type }, managerApproval: f.managerApproval, managerLevel: f.managerLevel }) }); toast({ title: "Settings saved" }); onSaved(); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Not saved", description: e.message, variant: "destructive" }); }
  }
  async function toggle() {
    const reason = w.isActive ? await reasonDialog(`Why is “${w.name}” being deactivated? New tickets will no longer use it; running tickets continue.`, { title: "Disable workflow", confirmText: "Disable" }) : "";
    if (w.isActive && reason === null) return;
    try { await apiFetch(`/itsm-workflows/${w.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !w.isActive, reason }) }); toast({ title: w.isActive ? "Disabled" : "Enabled" }); onSaved(); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Not changed", description: e.message, variant: "destructive" }); }
  }
  const dis = !w.canEdit;
  return <div className="space-y-3">
    <Field label="Name"><Input disabled={dis} className="h-8 text-xs" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
    <div className="rounded-md border border-violet-300 bg-violet-50 dark:bg-violet-950/30 p-2 text-xs space-y-1.5">
      <label className="flex items-center gap-2 font-semibold"><input type="checkbox" data-testid="mgr-approval" disabled={dis} checked={f.managerApproval} onChange={e => setF({ ...f, managerApproval: e.target.checked })} />Reporting manager approves first</label>
      <p className="text-muted-foreground">When ticked, the requester's manager must approve before the first step. If no manager is assigned, the step is skipped and the ticket history, the requester and the audit log record that.</p>
      {f.managerApproval && <select disabled={dis} value={f.managerLevel} onChange={e => setF({ ...f, managerLevel: Number(e.target.value) })} className="h-7 rounded border bg-background px-1"><option value={1}>Reporting manager</option><option value={2}>Manager's manager</option></select>}</div>
    <Field label="Description"><Input disabled={dis} className="h-8 text-xs" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
    <Field label="Order" hint="Lower is checked first when several workflows match."><Input disabled={dis} type="number" className="h-8 text-xs" value={f.rank} onChange={e => setF({ ...f, rank: Number(e.target.value) })} /></Field>
    {kind.fields.some((x: any) => x.key === "category") && <Field label="Applies to categories" hint={cats.length ? `Known: ${cats.slice(0, 12).join(", ")}` : "Empty = every category"}><Input disabled={dis} className="h-8 text-xs" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} placeholder="All categories" /></Field>}
    {kind.fields.some((x: any) => x.key === "priority") && <Field label="Applies to priorities" hint="None ticked = every priority"><div className="flex flex-wrap gap-1">{["Critical", "High", "Medium", "Low"].map(p => <button key={p} disabled={dis} onClick={() => setF({ ...f, priority: f.priority.includes(p) ? f.priority.filter((x: string) => x !== p) : [...f.priority, p] })} className={cn("rounded-full border px-2 py-0.5 text-xs", f.priority.includes(p) && "bg-primary text-primary-foreground border-primary")}>{p}</button>)}</div></Field>}
    {kind.fields.some((x: any) => x.key === "severity") && <Field label="Applies to severities" hint="None ticked = every severity"><div className="flex flex-wrap gap-1">{["S1", "S2", "S3", "S4"].map(p => <button key={p} disabled={dis} onClick={() => setF({ ...f, severity: f.severity.includes(p) ? f.severity.filter((x: string) => x !== p) : [...f.severity, p] })} className={cn("rounded-full border px-2 py-0.5 text-xs", f.severity.includes(p) && "bg-primary text-primary-foreground border-primary")}>{p}</button>)}</div></Field>}
    {kind.fields.some((x: any) => x.key === "type") && <Field label="Applies to change types" hint="None ticked = every type"><div className="flex flex-wrap gap-1">{["Standard", "Normal", "Emergency", "Major"].map(p => <button key={p} disabled={dis} onClick={() => setF({ ...f, type: f.type.includes(p) ? f.type.filter((x: string) => x !== p) : [...f.type, p] })} className={cn("rounded-full border px-2 py-0.5 text-xs", f.type.includes(p) && "bg-primary text-primary-foreground border-primary")}>{p}</button>)}</div></Field>}
    {w.canEdit && <div className="flex gap-1.5"><Button size="sm" className="flex-1" onClick={save}>Save settings</Button><Button size="sm" variant="outline" onClick={toggle}>{w.isActive ? "Disable" : "Enable"}</Button></div>}
  </div>;
}
