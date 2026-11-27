/** 2.11 — advanced change management: risk score, implementation window + clash check, freeze windows,
 *  review after go-live, and the change approval board (CAB). */
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { reasonDialog } from "@/components/confirm-dialog";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, Gauge, Snowflake, XCircle, Plus, ShieldAlert } from "lucide-react";

export function useAdvMeta() {
  return useQuery<any>({ queryKey: ["itsm-adv-meta"], queryFn: () => apiFetch("/itsm-advanced/meta"), staleTime: 3600_000 });
}
const ENV_POINTS: Record<string, number> = { prod: 2, production: 2, uat: 1, dr: 2 };
export function scoreOf(meta: any, answers: Record<string, string> | undefined, env?: string | null) {
  if (!meta) return null;
  const qs = meta.riskQuestions as any[]; let pts = 0; let max = 2;
  for (const q of qs) {
    max += Math.max(...q.options.map((o: any) => o.points));
    const o = q.options.find((o: any) => o.label === answers?.[q.key]); if (!o) return null; pts += o.points;
  }
  pts += ENV_POINTS[String(env || "").toLowerCase()] ?? 0;
  const score = Math.round((100 * pts) / max);
  return { score, level: score >= 60 ? "High" : score >= 30 ? "Medium" : "Low" };
}
const LEVEL_CLS: Record<string, string> = { High: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", Medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", Low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
export function RiskScoreBadge({ score, level }: { score?: number | null; level?: string | null }) {
  if (score == null || !level) return <span className="text-xs text-muted-foreground italic">Not assessed</span>;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL_CLS[level] || ""}`} data-testid="risk-score"><Gauge className="w-3 h-3" />{level} · {score}/100</span>;
}

/** Six questions → score 0–100 → Low / Medium / High (environment adds points). */
export function RiskAssessment({ answers, environment, onChange, disabled }: { answers: Record<string, string> | undefined; environment?: string | null; onChange: (a: Record<string, string>) => void; disabled?: boolean }) {
  const { data: meta } = useAdvMeta();
  const r = scoreOf(meta, answers, environment);
  const done = Object.keys(answers || {}).length;
  if (!meta) return null;
  return (
    <div className="sm:col-span-2 space-y-2" data-testid="risk-assessment">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label>Risk assessment *</Label>
        {r ? <RiskScoreBadge score={r.score} level={r.level} /> : <span className="text-xs text-muted-foreground">{done}/{meta.riskQuestions.length} answered — the score sets the risk level</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {meta.riskQuestions.map((q: any) => (
          <div key={q.key} className="space-y-1">
            <div className="text-[11px] text-muted-foreground">{q.label}</div>
            <Select disabled={disabled} value={answers?.[q.key] || ""} onValueChange={v => onChange({ ...(answers || {}), [q.key]: v })}>
              <SelectTrigger className="h-9 text-xs" data-testid={`risk-${q.key}`}><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{q.options.map((o: any) => <SelectItem key={o.label} value={o.label} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-muted-foreground">Low under 30 · Medium 30–59 · High 60+. Production adds to the score.</div>
    </div>
  );
}

/* ── implementation window ── */
export const toLocalInput = (v?: string | null) => { if (!v) return ""; const d = new Date(v); if (isNaN(+d)) return ""; const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
export const fmtWhen = (v?: string | null) => v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";
export const fmtWindow = (a?: string | null, b?: string | null) => {
  if (!a || !b) return "Not planned";
  const s = new Date(a), e = new Date(b);
  const same = s.toDateString() === e.toDateString();
  return `${fmtWhen(a)} – ${same ? e.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : fmtWhen(b)}`;
};

export function ChangeWindowFields({ start, end, onChange, id, environment, apps, teamId, type }: { start?: string | null; end?: string | null; onChange: (s: string | null, e: string | null) => void; id?: number; environment?: string | null; apps?: string[]; teamId?: number | null; type?: string }) {
  return <>
    <div><Label>Window start{type !== "Standard" ? " *" : ""}</Label><Input type="datetime-local" data-testid="window-start" value={toLocalInput(start)} onChange={e => { const s = fromLocal(e.target.value); let en = end || null; if (s && (!en || +new Date(en) <= +new Date(s))) en = new Date(+new Date(s) + 2 * 3600_000).toISOString(); onChange(s, en); }} /></div>
    <div><Label>Window end{type !== "Standard" ? " *" : ""}</Label><Input type="datetime-local" data-testid="window-end" value={toLocalInput(end)} onChange={e => onChange(start || null, fromLocal(e.target.value))} /></div>
    <div className="sm:col-span-2"><ClashCheck start={start} end={end} id={id} environment={environment} apps={apps} teamId={teamId} type={type} /></div>
  </>;
}

export function ClashCheck({ start, end, id, environment, apps, teamId, type }: { start?: string | null; end?: string | null; id?: number; environment?: string | null; apps?: string[]; teamId?: number | null; type?: string }) {
  const ok = !!start && !!end && +new Date(end) > +new Date(start);
  const qs = ok ? new URLSearchParams({ start: start!, end: end!, ...(id ? { id: String(id) } : {}), ...(environment ? { environment } : {}), ...(apps?.length ? { apps: apps.join("|") } : {}), ...(teamId ? { teamId: String(teamId) } : {}) }).toString() : "";
  const { data, isFetching } = useQuery<any>({ queryKey: ["chg-clash", qs], queryFn: () => apiFetch(`/itsm-change-clashes?${qs}`), enabled: ok });
  if (!start || !end) return <div className="text-[11px] text-muted-foreground">Set the window to check it against other changes and freeze windows.</div>;
  if (!ok) return <div className="text-xs text-red-600">The window must end after it starts.</div>;
  if (isFetching && !data) return <div className="text-[11px] text-muted-foreground">Checking the window…</div>;
  const ch = data?.changes || [], fr = data?.freezes || [];
  if (!ch.length && !fr.length) return <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400" data-testid="clash-none"><CheckCircle2 className="w-3.5 h-3.5" />No clash — no other change on the same application, environment or team, and no freeze window.</div>;
  return (
    <div className="space-y-1.5" data-testid="clash-list">
      {fr.map((f: any) => <div key={`f${f.id}`} className={`flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${type === "Emergency" ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/10" : "border-red-300 bg-red-50 text-red-700 dark:bg-red-900/10"}`}>
        <Snowflake className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span><b>Change freeze: {f.name}</b> ({fmtWindow(f.startsAt, f.endsAt)}{f.environment ? `, ${f.environment}` : ""}){f.reason ? ` — ${f.reason}` : ""}. {type === "Emergency" ? "Allowed for an Emergency change." : "Pick another window, or raise it as an Emergency change."}</span></div>)}
      {ch.map((c: any) => <div key={c.id} className={`flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${c.level === "Conflict" ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-900/10" : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/10"}`}>
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span><b>{c.level}: {c.changeNo}</b> {c.title} · {fmtWindow(c.plannedStart, c.plannedEnd)} · {c.status} — {c.reasons.join("; ")}</span></div>)}
    </div>
  );
}

/* ── review after go-live ── */
export function ChangeReview({ change, canWork, onSaved }: { change: any; canWork: boolean; onSaved?: () => void }) {
  const { data: meta } = useAdvMeta(); const { toast } = useToast(); const qc = useQueryClient();
  const [f, setF] = useState<any>({ outcome: change.status === "Rolled Back" ? "Rolled back" : change.status === "Failed" ? "Failed" : "Successful" });
  const [busy, setBusy] = useState(false);
  const due = ["Completed", "Failed", "Rolled Back"].includes(change.status);
  if (!change.pirAt && !due) return null;
  if (change.pirAt) return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/10 p-3 space-y-1 text-sm" data-testid="pir-view">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-400"><ClipboardCheck className="w-3 h-3" />Review after go-live · {change.pirOutcome}</div>
      <div>{change.pirNotes}</div>
      {change.pirLessons && <div><span className="text-muted-foreground">Learnt: </span>{change.pirLessons}</div>}
      {change.pirIncidents && <div><span className="text-muted-foreground">Incidents caused: </span>{change.pirIncidents}</div>}
      <div className="text-[11px] text-muted-foreground">{String(change.pirBy || "").replace(/ <.*>$/, "")} · {fmtWhen(change.pirAt)}</div>
    </div>
  );
  if (change.type === "Standard" && change.status === "Completed") return null;
  if (!canWork) return <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-3 text-xs text-amber-800">Review after go-live is due — the assigned team records it before the change is closed.</div>;
  async function save() {
    setBusy(true);
    try { await apiFetch(`/itsm-changes/${change.id}/review`, { method: "POST", body: JSON.stringify(f) }); toast({ title: "Review recorded", description: "The change can now be closed." }); qc.invalidateQueries({ queryKey: ["/api/changes"] }); qc.invalidateQueries(); onSaved?.(); }
    catch (e: any) { toast({ title: "Could not save the review", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/50 dark:bg-amber-900/10 p-3 space-y-2" data-testid="pir-form">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-amber-700"><ClipboardCheck className="w-3 h-3" />Review after go-live (needed before closing)</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><Label className="text-xs">Outcome</Label><Select value={f.outcome} onValueChange={v => setF({ ...f, outcome: v })}><SelectTrigger className="h-9" data-testid="pir-outcome"><SelectValue /></SelectTrigger><SelectContent>{(meta?.pirOutcomes || []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs">Incidents caused (if any)</Label><Input value={f.incidents || ""} onChange={e => setF({ ...f, incidents: e.target.value })} placeholder="e.g. INC-00123 or none" /></div>
        <div className="sm:col-span-2"><Label className="text-xs">How did it go? *</Label><Textarea rows={2} data-testid="pir-notes" value={f.notes || ""} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Done in the window? Tests passed? Any user impact?" /></div>
        <div className="sm:col-span-2"><Label className="text-xs">What was learnt{f.outcome !== "Successful" ? " *" : ""}</Label><Textarea rows={2} data-testid="pir-lessons" value={f.lessons || ""} onChange={e => setF({ ...f, lessons: e.target.value })} placeholder="What to do differently next time" /></div>
      </div>
      <div className="flex justify-end"><Button size="sm" disabled={busy || (f.notes || "").trim().length < 10 || (f.outcome !== "Successful" && (f.lessons || "").trim().length < 10)} onClick={save} data-testid="pir-save">{busy ? "Saving…" : "Record review"}</Button></div>
    </div>
  );
}

/* ── approval board ── */
function BoardCard({ c, children }: { c: any; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-1.5" data-testid={`board-${c.changeNo}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <a className="font-mono text-xs font-semibold text-[#2D7FF9] hover:underline" href={`/itsm-changes?open=${c.id}`}>{c.changeNo}</a>
        <span className="text-[11px] rounded px-1.5 py-0.5 bg-muted">{c.type}</span>
        <RiskScoreBadge score={c.riskScore} level={c.riskScore != null ? c.riskLevel : null} />
        {c.riskScore == null && <span className="text-[11px] text-muted-foreground">risk {c.riskLevel} (hand-picked)</span>}
        {c.conflicts > 0 ? <span className="text-[11px] font-semibold text-red-600 inline-flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />{c.conflicts} conflict{c.conflicts > 1 ? "s" : ""}</span>
          : c.clashes > 0 ? <span className="text-[11px] font-semibold text-amber-600 inline-flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />{c.clashes} overlap{c.clashes > 1 ? "s" : ""}</span> : null}
        {c.inFreeze && <span className="text-[11px] font-semibold text-red-600 inline-flex items-center gap-0.5"><Snowflake className="w-3 h-3" />in freeze</span>}
      </div>
      <div className="text-sm font-medium">{c.title}</div>
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
        <span><CalendarClock className="w-3 h-3 inline mr-0.5" />{fmtWindow(c.plannedStart, c.plannedEnd)}</span>
        {c.environment && <span>{c.environment}</span>}{(c.affectedApps || []).length > 0 && <span>{c.affectedApps.join(", ")}</span>}
        <span>{c.assignedGroup}{c.assignedTo ? ` · ${c.assignedTo}` : ""}</span><span>by {c.requestedBy}</span>
      </div>
      {children}
    </div>
  );
}
export function ChangeBoard({ isItsmAdmin }: { isItsmAdmin: boolean }) {
  const [days, setDays] = useState(14); const { toast } = useToast();
  const { data, refetch, isLoading, error } = useQuery<any>({ queryKey: ["chg-board", days], queryFn: () => apiFetch(`/itsm-change-board?days=${days}`) });
  const [freezeOpen, setFreezeOpen] = useState(false);
  async function decide(taskId: number, decision: "Approved" | "Rejected") {
    const notes = decision === "Rejected" ? await reasonDialog("Why is the change rejected? The requester sees this.", { title: "Reject change", confirmText: "Reject", destructive: true, label: "Reason", minLength: 5 }) : "";
    if (notes === null) return;
    try { await apiFetch(`/itsm-workflow-tasks/${taskId}/decide`, { method: "POST", body: JSON.stringify({ decision, notes }) }); toast({ title: decision === "Approved" ? "Approved" : "Rejected" }); refetch(); }
    catch (e: any) { toast({ title: "Could not record the decision", description: e.message, variant: "destructive" }); }
  }
  if (error) return <div className="rounded-lg border p-6 text-sm text-muted-foreground">{(error as any).message}</div>;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading the board…</div>;
  const byDay: Record<string, any[]> = {};
  for (const c of data.upcoming) { const k = new Date(c.plannedStart).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }); (byDay[k] ||= []).push(c); }
  return (
    <div className="space-y-5" data-testid="change-board">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm text-muted-foreground flex-1 min-w-[200px]">Changes waiting for approval, the schedule, freeze windows and reviews due after go-live.</div>
        <Select value={String(days)} onValueChange={v => setDays(Number(v))}><SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger><SelectContent>{[7, 14, 30, 60].map(d => <SelectItem key={d} value={String(d)}>Next {d} days</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFreezeOpen(true)} data-testid="open-freezes"><Snowflake className="w-3.5 h-3.5" />Freeze windows ({data.freezes.length})</Button>
      </div>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-amber-600" />Waiting for approval ({data.awaiting.length})</h3>
        {!data.awaiting.length && <div className="text-xs text-muted-foreground">Nothing waiting.</div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {data.awaiting.map((c: any) => <BoardCard key={c.id} c={c}>
            {c.rollbackPlan ? <div className="text-[11px]"><span className="text-muted-foreground">Rollback: </span>{c.rollbackPlan}</div> : <div className="text-[11px] text-red-600">No rollback plan</div>}
            {(c.tasks || []).length ? (c.tasks || []).map((t: any) => <div key={t.id} className="flex items-center gap-2 flex-wrap pt-1 border-t">
              <span className="text-[11px] text-muted-foreground flex-1 min-w-[160px]">{t.title} — {t.approvers}</span>
              {t.mine && <><Button size="sm" className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => decide(t.id, "Approved")} data-testid={`approve-${c.changeNo}`}><CheckCircle2 className="w-3.5 h-3.5" />Approve</Button>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-red-600" onClick={() => decide(t.id, "Rejected")}><XCircle className="w-3.5 h-3.5" />Reject</Button></>}
            </div>) : <div className="text-[11px] text-muted-foreground pt-1 border-t">{c.status === "Draft" ? "Draft — not yet submitted for approval" : "Approval through the approval matrix"}</div>}
          </BoardCard>)}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-[#2D7FF9]" />Schedule — next {days} days ({data.upcoming.length})</h3>
        {!data.upcoming.length && <div className="text-xs text-muted-foreground">No approved change planned.</div>}
        {Object.entries(byDay).map(([d, list]) => <div key={d} className="space-y-1.5"><div className="text-xs font-semibold text-muted-foreground">{d}</div><div className="grid grid-cols-1 lg:grid-cols-2 gap-2">{list.map(c => <BoardCard key={c.id} c={c} />)}</div></div>)}
        {data.unscheduled.length > 0 && <div className="text-xs text-amber-700">Approved but no window yet: {data.unscheduled.map((c: any) => c.changeNo).join(", ")}</div>}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><ClipboardCheck className="w-4 h-4 text-emerald-600" />Reviews after go-live due ({data.reviews.length})</h3>
        {!data.reviews.length && <div className="text-xs text-muted-foreground">None due.</div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">{data.reviews.map((c: any) => <BoardCard key={c.id} c={c}><div className="text-[11px] text-amber-700">{c.status} · open the change to record the review</div></BoardCard>)}</div>
      </section>
      <FreezeWindows open={freezeOpen} onOpenChange={setFreezeOpen} canEdit={isItsmAdmin} onChanged={refetch} />
    </div>
  );
}

export function FreezeWindows({ open, onOpenChange, canEdit, onChanged }: { open: boolean; onOpenChange: (v: boolean) => void; canEdit: boolean; onChanged?: () => void }) {
  const { toast } = useToast();
  const { data = [], refetch } = useQuery<any[]>({ queryKey: ["chg-freezes"], queryFn: () => apiFetch("/itsm-change-freezes"), enabled: open });
  const [f, setF] = useState<any>(null);
  async function save() {
    try { await apiFetch(f.id ? `/itsm-change-freezes/${f.id}` : "/itsm-change-freezes", { method: f.id ? "PATCH" : "POST", body: JSON.stringify(f) }); toast({ title: "Freeze window saved" }); setF(null); refetch(); onChanged?.(); }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); }
  }
  async function end(x: any) {
    const reason = await reasonDialog(`End the freeze window "${x.name}"? Changes can be planned in it again.`, { title: "End freeze window", confirmText: "End it", label: "Reason", minLength: 5 });
    if (!reason) return;
    try { await apiFetch(`/itsm-change-freezes/${x.id}`, { method: "PATCH", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ isActive: false, reason }) }); refetch(); onChanged?.(); }
    catch (e: any) { toast({ title: "Could not end it", description: e.message, variant: "destructive" }); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Snowflake className="w-4 h-4" />Change freeze windows</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">No Normal or Standard change can be planned inside a freeze window (e.g. quarter-end NAV, audits, festive trading). Emergency changes are still allowed.</p>
        <div className="space-y-1.5">
          {!data.length && <div className="text-xs text-muted-foreground">No current or upcoming freeze window.</div>}
          {data.map((x: any) => <div key={x.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
            <div className="flex-1"><div className="font-medium">{x.name}{x.environment ? <span className="text-xs text-muted-foreground"> · {x.environment}</span> : <span className="text-xs text-muted-foreground"> · all environments</span>}</div>
              <div className="text-xs text-muted-foreground">{fmtWindow(x.startsAt, x.endsAt)}{x.reason ? ` — ${x.reason}` : ""}</div></div>
            {canEdit && <><Button size="sm" variant="ghost" className="h-7" onClick={() => setF({ ...x })}>Edit</Button><Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => end(x)}>End</Button></>}
          </div>)}
        </div>
        {canEdit && !f && <Button size="sm" variant="outline" className="gap-1.5 w-fit" onClick={() => setF({ name: "", startsAt: null, endsAt: null, environment: "", reason: "" })} data-testid="freeze-add"><Plus className="w-3.5 h-3.5" />Add freeze window</Button>}
        {!canEdit && <div className="text-[11px] text-muted-foreground">Only an ITSM Admin can add or change freeze windows.</div>}
        {f && <div className="rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="sm:col-span-2"><Label className="text-xs">Name *</Label><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Quarter-end NAV freeze" data-testid="freeze-name" /></div>
          <div><Label className="text-xs">Starts *</Label><Input type="datetime-local" value={toLocalInput(f.startsAt)} onChange={e => setF({ ...f, startsAt: fromLocal(e.target.value) })} data-testid="freeze-start" /></div>
          <div><Label className="text-xs">Ends *</Label><Input type="datetime-local" value={toLocalInput(f.endsAt)} onChange={e => setF({ ...f, endsAt: fromLocal(e.target.value) })} data-testid="freeze-end" /></div>
          <div><Label className="text-xs">Environment</Label><Select value={f.environment || "all"} onValueChange={v => setF({ ...f, environment: v === "all" ? "" : v })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All environments</SelectItem>{["PROD", "UAT", "Dev"].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Reason</Label><Input value={f.reason || ""} onChange={e => setF({ ...f, reason: e.target.value })} /></div>
          <div className="sm:col-span-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setF(null)}>Cancel</Button><Button size="sm" disabled={(f.name || "").trim().length < 3 || !f.startsAt || !f.endsAt} onClick={save} data-testid="freeze-save">Save</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
