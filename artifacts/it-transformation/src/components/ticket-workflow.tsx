import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { reasonDialog, confirmHeader } from "@/components/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { WorkflowCanvas } from "@/components/workflow-canvas";
import { Workflow, CheckCircle2, XCircle, Clock, Map as MapIcon, ArrowRight } from "lucide-react";

/* ITH-101 — the workflow a ticket follows: current step, the actions it allows, approvals and its path. */
type Kind = "incident" | "request" | "problem" | "change";
const PATCH: Record<Kind, string> = { incident: "/incidents", request: "/service-requests", problem: "/problems", change: "/changes" };
const NOTES: Record<string, { field: string; label: string }> = { "incident:Resolved": { field: "resolutionNotes", label: "Resolution notes" }, "request:Completed": { field: "fulfillmentNotes", label: "Fulfilment notes" } };

export function TicketWorkflow({ kind, id, ticketNo, onChanged }: { kind: Kind; id: number; ticketNo?: string; onChanged?: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast(); const [map, setMap] = useState(false); const [busy, setBusy] = useState(false);
  const { data: wf, refetch } = useQuery({ queryKey: ["ticket-wf", kind, id], queryFn: () => apiFetch<any>(`/itsm-workflow/${kind}/${id}`) });
  if (!wf) return null;
  const done = () => { refetch(); qc.invalidateQueries(); onChanged?.(); };
  async function move(n: { label: string; status: string | null }) {
    if (!n.status) return;
    const need = NOTES[`${kind}:${n.status}`]; let extra: any = {};
    if (need) { const t = await reasonDialog(`${n.label}: ${ticketNo || "ticket"} → ${n.status}`, { title: n.label, label: need.label, minLength: 5, confirmText: n.label }); if (t === null) return; extra[need.field] = t; }
    setBusy(true);
    try { await apiFetch(`${PATCH[kind]}/${id}`, { method: "PATCH", body: JSON.stringify({ status: n.status, ...extra }), headers: confirmHeader(`${n.label}: move ${ticketNo || "the ticket"} from “${wf.current?.label}” to “${n.status}” (workflow “${wf.workflow}”)?`) }); toast({ title: `${n.label} — ${n.status}` }); done(); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Not moved", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  async function decide(t: any, decision: "Approved" | "Rejected") {
    const notes = await reasonDialog(`${decision === "Approved" ? "Approve" : "Reject"} “${t.title}” for ${ticketNo || "this ticket"}?${t.mine ? "" : ` You are deciding as ITSM Admin on behalf of ${t.approvers}.`}`,
      { title: decision === "Approved" ? "Approve" : "Reject", label: decision === "Rejected" || !t.mine ? "Reason" : "Comment (optional)", minLength: decision === "Rejected" || !t.mine ? 5 : 0, confirmText: decision === "Approved" ? "Approve" : "Reject", destructive: decision === "Rejected" });
    if (notes === null) return; setBusy(true);
    try { await apiFetch(`/itsm-workflow-tasks/${t.id}/decide`, { method: "POST", body: JSON.stringify({ decision, notes }), headers: { "X-No-Confirm": "1" } }); toast({ title: decision }); done(); }
    catch (e: any) { toast({ title: "Not saved", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  const pending = wf.tasks.filter((t: any) => t.status === "Pending");
  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm" data-testid="ticket-workflow">
      <div className="flex items-center gap-2 flex-wrap"><Workflow className="w-4 h-4 text-primary" /><span className="font-semibold">Workflow: {wf.workflow}</span><span className="text-xs text-muted-foreground">v{wf.version}</span>
        <span className={cn("text-[11px] rounded-full px-2 py-0.5 font-semibold", wf.state === "Finished" ? "bg-emerald-100 text-emerald-700" : wf.state === "Stopped" ? "bg-slate-200 text-slate-700" : wf.state === "Waiting approval" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")}>{wf.state}</span>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setMap(!map)}><MapIcon className="w-3.5 h-3.5 mr-1" />{map ? "Hide map" : "Show map"}</Button></div>
      {wf.current && wf.state !== "Finished" && <div className="text-xs">Now at <b>{wf.current.label}</b> since {fmtDateTime(wf.enteredAt)}{wf.timeoutAt && <span className="text-amber-600"> · <Clock className="w-3 h-3 inline" /> time limit {fmtDateTime(wf.timeoutAt)}</span>}</div>}
      {wf.next.length > 0 && <div className="flex flex-wrap gap-1.5 items-center"><span className="text-xs text-muted-foreground">Next:</span>{wf.next.map((n: any) =>
        <Button key={n.label + n.status} size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !n.status} onClick={() => move(n)}><ArrowRight className="w-3 h-3 mr-1" />{n.label}{n.status && n.status !== n.label ? ` (${n.status})` : ""}</Button>)}</div>}
      {pending.map((t: any) => <div key={t.id} className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-2 text-xs flex items-center gap-2 flex-wrap">
        <span className="flex-1"><b>{t.title}</b> — waiting for {t.approvers} since {fmtDateTime(t.createdAt)}</span>
        {t.canDecide && <><Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => decide(t, "Approved")}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Approve</Button><Button size="sm" variant="outline" className="h-7 text-xs text-red-600" disabled={busy} onClick={() => decide(t, "Rejected")}><XCircle className="w-3.5 h-3.5 mr-1" />Reject</Button></>}</div>)}
      {map && <WorkflowCanvas def={wf.definition} readOnly current={wf.state === "Finished" ? null : wf.current?.id} visited={wf.visited} compact />}
      <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Workflow history ({wf.events.length})</summary>
        <div className="mt-1 space-y-0.5">{wf.events.map((e: any, i: number) => <div key={i} className="flex gap-2"><span className="text-muted-foreground whitespace-nowrap">{fmtDateTime(e.at)}</span><span><b>{e.label || "Workflow"}</b> · {e.event}{e.detail ? ` — ${e.detail}` : ""} <span className="text-muted-foreground">({e.by})</span></span></div>)}
          {wf.tasks.filter((t: any) => t.status !== "Pending").map((t: any) => <div key={"t" + t.id} className="flex gap-2"><span className="text-muted-foreground whitespace-nowrap">{fmtDateTime(t.decidedAt)}</span><span>{t.title}: <b>{t.status}</b> by {t.decidedBy}{t.notes ? ` — ${t.notes}` : ""}</span></div>)}</div></details>
    </div>
  );
}

/* For My Approvals: workflow approvals waiting for me */
export function MyWorkflowApprovals() {
  const { data = [] } = useQuery({ queryKey: ["wf-my-tasks"], queryFn: () => apiFetch<any[]>("/itsm-workflow-tasks/mine") });
  const [open, setOpen] = useState<any>(null);
  if (!data.length) return null;
  return <div className="rounded-lg border p-3 space-y-2" data-testid="my-wf-approvals"><div className="text-sm font-semibold flex items-center gap-1.5"><Workflow className="w-4 h-4 text-primary" />Workflow approvals waiting for you ({data.length})</div>
    {data.map((t: any) => <div key={t.id} className="text-xs border rounded-md">
      <button className="w-full text-left px-2.5 py-2 flex gap-2 hover:bg-muted/40" onClick={() => setOpen(open?.id === t.id ? null : t)}><b>{t.ticketNo}</b><span className="flex-1 truncate">{t.ticketTitle} — {t.title}</span><span className="text-muted-foreground">{t.workflow} · {fmtDateTime(t.createdAt)}</span></button>
      {open?.id === t.id && <div className="p-2 border-t"><TicketWorkflow kind={t.ticketType} id={t.ticketId} ticketNo={t.ticketNo} /></div>}</div>)}</div>;
}
