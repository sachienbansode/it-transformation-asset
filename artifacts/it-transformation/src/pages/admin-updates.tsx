import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmHeader } from "@/components/confirm-dialog";
import { fmtDateTime, fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { RefreshCcw, CheckCircle2, Clock, XCircle, AlertTriangle, Rocket } from "lucide-react";

/* ITH-120 — Admin › Updates: NIYTRI asks before updating IT Hub; the Super Admin approves, defers or rejects. */
const TONE: Record<string, string> = { Pending: "bg-amber-100 text-amber-800", Approved: "bg-emerald-100 text-emerald-800", Deferred: "bg-blue-100 text-blue-800", Rejected: "bg-red-100 text-red-800", Deployed: "bg-slate-200 text-slate-800", Withdrawn: "bg-muted text-muted-foreground" };

function Decide({ r, done }: { r: any; done: () => void }) {
  const { toast } = useToast(); const [mode, setMode] = useState<"" | "Deferred" | "Rejected">(""); const [note, setNote] = useState(""); const [until, setUntil] = useState(""); const [busy, setBusy] = useState(false);
  async function send(decision: string) {
    setBusy(true);
    try {
      await apiFetch(`/updates/${r.id}/decision`, { method: "POST", body: JSON.stringify({ decision, note, deferUntil: until }),
        headers: confirmHeader(decision === "Approved" ? `Approve the update to version ${r.version}? NIYTRI may then install it${r.plannedAt ? ` (planned ${fmtDateTime(r.plannedAt)})` : ""}.` : decision === "Deferred" ? `Defer version ${r.version} until ${until}?` : `Reject version ${r.version}? Reason: ${note}`) });
      toast({ title: `Update ${decision.toLowerCase()}` }); setMode(""); done();
    } catch (e: any) { if (!e.cancelled) toast({ title: "Not saved", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => send("Approved")}><CheckCircle2 className="w-4 h-4" />Approve</Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => setMode(mode === "Deferred" ? "" : "Deferred")}><Clock className="w-4 h-4" />Defer</Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-red-600" disabled={busy} onClick={() => setMode(mode === "Rejected" ? "" : "Rejected")}><XCircle className="w-4 h-4" />Reject</Button>
      </div>
      {mode && <div className="flex gap-2 flex-wrap items-start">
        {mode === "Deferred" && <Input type="date" className="h-8 w-44" value={until} onChange={e => setUntil(e.target.value)} />}
        <Textarea rows={2} className="text-sm flex-1 min-w-[240px]" value={note} onChange={e => setNote(e.target.value)} placeholder={mode === "Rejected" ? "Reason (needed)" : "Note (optional), e.g. month-end freeze"} />
        <Button size="sm" disabled={busy || (mode === "Rejected" && !note.trim()) || (mode === "Deferred" && !until)} onClick={() => send(mode)}>{mode === "Deferred" ? "Defer" : "Reject"}</Button>
      </div>}
    </div>
  );
}

export default function AdminUpdates() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["updates"], queryFn: () => apiFetch<any>("/updates") });
  if (!data) return null;
  const open = data.requests.filter((r: any) => ["Pending", "Deferred"].includes(r.status));
  return (
    <div className="space-y-5 max-w-5xl" data-testid="admin-updates">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><RefreshCcw className="w-6 h-6 text-primary" />Updates</h1>
        <p className="text-sm text-muted-foreground">IT Hub version <b>{data.current || "—"}</b>. {data.consentRequired ? "NIYTRI installs a new version only after a Super Admin approves it here (or, in an emergency, with a reason recorded below)." : "Updates on this instance do not need approval."}</p>
      </div>
      {!open.length && <Card><CardContent className="p-4 text-sm text-muted-foreground">No update is waiting for a decision.</CardContent></Card>}
      {data.requests.map((r: any) => (
        <Card key={r.id} className={cn(["Pending", "Deferred"].includes(r.status) && "border-amber-300")}><CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Rocket className="w-4 h-4 text-primary" /><span className="font-semibold">Version {r.version}</span><span className="text-sm text-muted-foreground">{r.title && r.title !== r.ref ? r.title : ""}</span>
            <span className={cn("text-xs rounded-full px-2 py-0.5", TONE[r.status])}>{r.status}{r.status === "Deferred" && r.deferUntil ? ` until ${fmtDate(r.deferUntil)}` : ""}</span>
            <span className="ml-auto text-xs text-muted-foreground">Asked {fmtDateTime(r.requestedAt)} by {r.requestedBy}{r.plannedAt ? ` · planned ${fmtDateTime(r.plannedAt)}` : ""}</span>
          </div>
          {r.emergency && <div className="flex gap-2 text-sm rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 px-3 py-2"><AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" /><div><b>Emergency update</b> — installed without waiting for approval. Reason given by NIYTRI: {r.emergency}</div></div>}
          {r.notes && <div className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-3 max-h-64 overflow-y-auto">{r.notes}</div>}
          {r.decidedBy && <div className="text-xs text-muted-foreground">{r.status === "Deployed" ? "Approved" : r.status} by {r.decidedBy} on {fmtDateTime(r.decidedAt)}{r.note ? ` — “${r.note}”` : ""}{r.deployedAt ? ` · installed ${fmtDateTime(r.deployedAt)}` : ""}</div>}
          {!r.decidedBy && r.deployedAt && <div className="text-xs text-muted-foreground">Installed {fmtDateTime(r.deployedAt)}</div>}
          {["Pending", "Deferred"].includes(r.status) && <Decide r={r} done={() => qc.invalidateQueries({ queryKey: ["updates"] })} />}
        </CardContent></Card>))}
      {!!data.deployments?.length && <Card><CardContent className="p-4">
        <div className="text-sm font-semibold mb-2">Installed versions</div>
        <div className="divide-y" data-testid="installed-versions">
          {data.deployments.map((d: any, i: number) => {
            const label = d.status === "Done" ? (d.version === data.current ? "Installed · in use" : "Installed") : d.status === "Running" ? "Installing…" : d.status === "Interrupted" ? "Interrupted" : d.status;
            const tone = d.status === "Done" ? (d.version === data.current ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-muted text-muted-foreground")
              : d.status === "Failed" ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" : d.status === "Running" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
            return <div key={i} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-mono font-semibold w-16">{d.version}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(d.at)}</span>
                <span className="text-[11px] font-mono text-muted-foreground">{d.commit}</span>
                {d.attempts > 1 && <span className="text-[11px] text-muted-foreground">({d.attempts} install runs)</span>}
              </div>
              {d.changes?.length ? <ul className="mt-1 ml-[76px] max-sm:ml-0 list-disc pl-4 text-xs text-muted-foreground space-y-0.5">{d.changes.map((c: string, j: number) => <li key={j}>{c}</li>)}</ul>
                : <div className="mt-1 ml-[76px] max-sm:ml-0 text-xs text-muted-foreground italic">No change notes for this version.</div>}
            </div>;
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">Interrupted = an install that was stopped before it finished (for example the session closed); the next install of that version replaces it.</p>
      </CardContent></Card>}
    </div>
  );
}
