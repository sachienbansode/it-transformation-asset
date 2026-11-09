import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { ApprovalMatrix } from "@/components/approval-matrix";
import { MyWorkflowApprovals } from "@/components/ticket-workflow";
import { CheckCircle2, XCircle, Search, Inbox, Loader2, ExternalLink, Clock, UserCheck, BellRing, AlertTriangle, Trash2 } from "lucide-react";
import { UserSearchCombobox } from "@/components/user-search-combobox";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/date";

/* ITSM › My Approvals — every approval step waiting for the signed-in person (in order), with approve / reject. */

const PAGE = 10;
const fmt = (d?: string | null) => d ? fmtDateTime(d) : "—";
export function waited(d?: string | null) {
  if (!d) return "—";
  const h = (Date.now() - new Date(d).getTime()) / 3600000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
}
const PRI: Record<string, string> = { Critical: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300", High: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300", Medium: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300", Low: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" };

export default function ItsmMyApprovals() {
  const { user } = useAuth();
  const qc = useQueryClient(); const { toast } = useToast();
  const [all, setAll] = useState(false);
  const { data: rows = [], isLoading } = useQuery<any[]>({ queryKey: ["my-approvals", all], queryFn: () => apiFetch(`/my-approvals${all ? "?all=1" : ""}`), refetchInterval: 60_000 });
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const [open, setOpen] = useState<any>(null);
  const [decide, setDecide] = useState<{ rows: any[]; action: "Approved" | "Rejected" } | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return rows.filter(r => !s || [r.ticketNo, r.title, r.raisedBy, r.role, r.ticketType].some((v: string) => v?.toLowerCase().includes(s))); }, [rows, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Approvals</h1>
          <p className="text-sm text-muted-foreground">Tickets waiting for your decision — oldest first. Levels are decided in order; a rejection ends the flow and the requester is emailed.</p>
        </div>
        {user?.role === "admin" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={e => { setAll(e.target.checked); setPage(1); }} />Show everyone's pending approvals (admin)</label>}
      </div>
      <MyWorkflowApprovals />
      <Delegation />
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="relative max-w-sm w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search ticket, title, requester…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
          {sel.size > 0 && <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{sel.size} selected</span>
            <Button size="sm" className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDecide({ rows: list.filter(r => sel.has(r.approvalId)), action: "Approved" })}><CheckCircle2 className="w-3.5 h-3.5" />Approve selected</Button>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-red-600" onClick={() => setDecide({ rows: list.filter(r => sel.has(r.approvalId)), action: "Rejected" })}><XCircle className="w-3.5 h-3.5" />Reject selected</Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setSel(new Set())}>Clear</Button>
          </div>}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-8"><input type="checkbox" aria-label="Select all" checked={list.length > 0 && list.every(r => sel.has(r.approvalId))} onChange={e => setSel(e.target.checked ? new Set(list.map(r => r.approvalId)) : new Set())} /></TableHead>
              <TableHead>Ticket</TableHead><TableHead>Raised by</TableHead><TableHead>Your level</TableHead><TableHead>Waiting</TableHead><TableHead className="text-right">Decision</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !list.length && <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground"><Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />Nothing is waiting for your approval.</TableCell></TableRow>}
              {list.slice((page - 1) * PAGE, page * PAGE).map(r => (
                <TableRow key={r.approvalId} className={cn("cursor-pointer", sel.has(r.approvalId) && "bg-primary/5")} onClick={() => setOpen(r)}>
                  <TableCell onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.ticketNo}`} checked={sel.has(r.approvalId)} onChange={() => toggle(r.approvalId)} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2"><span className="font-mono text-xs font-semibold text-primary">{r.ticketNo}</span><span className="text-[11px] text-muted-foreground">{r.ticketType}{r.changeType ? ` · ${r.changeType}` : ""}</span>
                      {r.priority && <span className={cn("px-1.5 py-[1px] rounded-full text-[10px] font-semibold", PRI[r.priority] || "bg-muted")}>{r.priority}</span>}</div>
                    <div className="text-sm font-medium">{r.title}</div>
                    {r.category && <div className="text-[11px] text-muted-foreground">{r.category}</div>}
                    {r.description && <div className="text-[11px] text-muted-foreground line-clamp-1 max-w-[420px]" title={r.description}>{r.description}</div>}
                    {r.onBehalfOf && <div className="text-[11px] text-sky-700 dark:text-sky-300 inline-flex items-center gap-1"><UserCheck className="w-3 h-3" />Covering for {r.onBehalfOf}</div>}
                    {r.previous?.length > 0 && <div className="text-[11px] text-emerald-700 dark:text-emerald-400">Approved so far: {r.previous.join("; ").replace(/ <[^>]*>/g, "")}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{String(r.raisedBy || "—").replace(/ <.*>$/, "")}<div className="text-[11px] text-muted-foreground">{fmt(r.raisedAt)}</div></TableCell>
                  <TableCell className="text-sm"><b>{r.level}</b> · {r.role}<div className="text-[11px] text-muted-foreground">level {r.levelOf}{!r.mine ? " · not yours (admin view)" : ""}</div></TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    <span className={cn("inline-flex items-center gap-1", r.escalated ? "text-red-600 font-semibold" : (Date.now() - new Date(r.waitingSince).getTime()) > 86_400_000 ? "text-amber-600 font-medium" : "")}><Clock className="w-3.5 h-3.5" />{waited(r.waitingSince)}</span>
                    {r.reminders > 0 && <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><BellRing className="w-3 h-3" />{r.reminders} reminder{r.reminders > 1 ? "s" : ""}</div>}
                    {r.escalated && <div className="text-[11px] text-red-600 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Escalated</div>}
                  </TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDecide({ rows: [r], action: "Approved" })}><CheckCircle2 className="w-3.5 h-3.5" />Approve</Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-red-600" onClick={() => setDecide({ rows: [r], action: "Rejected" })}><XCircle className="w-3.5 h-3.5" />Reject</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination page={page} totalPages={Math.ceil(list.length / PAGE) || 1} totalItems={list.length} pageSize={PAGE} onPageChange={setPage} />
      </CardContent></Card>

      {open && (
        <Dialog open onOpenChange={o => !o && setOpen(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{open.ticketNo} — {open.title}</DialogTitle><DialogDescription>{open.ticketType} · raised by {String(open.raisedBy || "—").replace(/ <.*>$/, "")} on {fmt(open.raisedAt)} · status {open.status}</DialogDescription></DialogHeader>
            <ApprovalMatrix ticketId={open.ticketId} ticketType={open.ticketType} />
            <DialogFooter className="sm:justify-between"><Link href={open.page} className="text-sm text-primary inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />Open {open.ticketType} list</Link><Button variant="outline" onClick={() => setOpen(null)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {decide && <DecideDialog d={decide} onClose={() => setDecide(null)} onDone={() => { setSel(new Set()); ["my-approvals", "approvals", "changes", "service-requests", "problems", "incidents"].forEach(k => qc.invalidateQueries({ queryKey: [k] })); }} toast={toast} />}
    </div>
  );
}

function DecideDialog({ d, onClose, onDone, toast }: { d: { rows: any[]; action: "Approved" | "Rejected" }; onClose: () => void; onDone: () => void; toast: any }) {
  const [notes, setNotes] = useState(""); const [busy, setBusy] = useState(false);
  const reject = d.action === "Rejected"; const one = d.rows.length === 1 ? d.rows[0] : null;
  async function go() {
    setBusy(true);
    try {
      if (one) {
        const r = await apiFetch<any>(`/approvals/${one.approvalId}/action`, { method: "POST", body: JSON.stringify({ action: d.action, notes: notes.trim() || undefined }) });
        toast({ title: r.ticketApproval === "Approved" ? `${one.ticketNo} fully approved` : r.ticketApproval === "Rejected" ? `${one.ticketNo} rejected` : `${one.ticketNo}: ${one.level} approved — sent to the next level` });
      } else {
        const r = await apiFetch<any>(`/approvals/bulk-action`, { method: "POST", body: JSON.stringify({ ids: d.rows.map(x => x.approvalId), action: d.action, notes: notes.trim() || undefined }) });
        toast({ title: `${r.done} ${reject ? "rejected" : "approved"}${r.failed.length ? `, ${r.failed.length} not done` : ""}`, description: r.failed.length ? r.failed.map((f: any) => `${d.rows.find(x => x.approvalId === f.id)?.ticketNo || f.id}: ${f.error}`).join("\n") : undefined, variant: r.failed.length ? "destructive" : undefined });
      }
      onDone(); onClose();
    } catch (e: any) { toast({ title: "Could not record decision", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{reject ? "Reject" : "Approve"} {one ? one.ticketNo : `${d.rows.length} tickets`}</DialogTitle>
          <DialogDescription>{one ? `${one.title} — ${one.level} (${one.role})` : d.rows.map(r => r.ticketNo).join(", ")}</DialogDescription></DialogHeader>
        <div className="space-y-1.5"><label className="text-xs font-medium">{reject ? "Reason (sent to the requester) *" : "Comment (optional)"}</label><Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} autoFocus /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button disabled={busy || (reject && notes.trim().length < 5)} className={cn("gap-1.5", reject ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700")} onClick={go}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{reject ? "Reject" : "Approve"}{one ? "" : ` ${d.rows.length}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Out of office: let someone approve for you between two dates. */
function Delegation() {
  const qc = useQueryClient(); const { toast } = useToast(); const { user } = useAuth();
  const { data: rows = [] } = useQuery<any[]>({ queryKey: ["approval-delegates"], queryFn: () => apiFetch("/approval-delegates") });
  const { data: people = [] } = useQuery<any[]>({ queryKey: ["users-for-combobox"], queryFn: () => apiFetch<any[]>("/itsm-people"), staleTime: 120000 });
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const [open, setOpen] = useState(false); const [who, setWho] = useState(""); const [from, setFrom] = useState(today); const [to, setTo] = useState(today); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const mine = rows.filter(r => r.userId === user?.id), covering = rows.filter(r => r.delegateUserId === user?.id);
  async function save() {
    const p = people.find((x: any) => x.name === who);
    if (!p) { toast({ title: "Choose who will approve for you", variant: "destructive" }); return; }
    setBusy(true);
    try { await apiFetch("/approval-delegates", { method: "POST", body: JSON.stringify({ delegateUserId: p.id, startDate: from, endDate: to, reason: reason.trim() || undefined }) });
      toast({ title: `${p.name} will approve for you ${fmtDate(from)} – ${fmtDate(to)}` }); setOpen(false); setWho(""); setReason(""); qc.invalidateQueries({ queryKey: ["approval-delegates"] }); }
    catch (e: any) { toast({ title: "Could not set delegate", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  async function end(id: number) {
    try { await apiFetch(`/approval-delegates/${id}`, { method: "DELETE" }); qc.invalidateQueries({ queryKey: ["approval-delegates"] }); toast({ title: "Delegation ended" }); }
    catch (e: any) { toast({ title: "Could not end delegation", description: e.message, variant: "destructive" }); }
  }
  return (
    <Card><CardContent className="p-3 flex items-center gap-3 flex-wrap text-sm">
      <UserCheck className="w-4 h-4 text-primary" />
      {mine.length ? mine.map(r => <span key={r.id} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
          <b>{r.delegateName}</b> approves for you {fmtDate(r.startDate)} – {fmtDate(r.endDate)}{r.activeNow ? <span className="text-emerald-600">(active)</span> : ""}
          <button className="text-red-600" title="End" onClick={() => end(r.id)}><Trash2 className="w-3 h-3" /></button></span>)
        : <span className="text-muted-foreground">Away? Let someone approve for you while you are out.</span>}
      {covering.map(r => <span key={r.id} className="rounded-md bg-sky-50 dark:bg-sky-900/20 text-sky-800 dark:text-sky-300 px-2 py-1 text-xs">You cover for <b>{r.userName}</b> {fmtDate(r.startDate)} – {fmtDate(r.endDate)}</span>)}
      <Button size="sm" variant="outline" className="h-8 ml-auto" onClick={() => setOpen(true)}>Set delegate</Button>
      {open && <Dialog open onOpenChange={o => !o && !busy && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Delegate my approvals</DialogTitle><DialogDescription>The person can approve or reject your ITSM approval steps between these dates. Decisions are recorded as on your behalf.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><label className="text-xs font-medium">Approve for me *</label><UserSearchCombobox value={who} onChange={setWho} placeholder="Search person…" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><label className="text-xs font-medium">From *</label><Input type="date" min={today} value={from} onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></div>
              <div className="space-y-1"><label className="text-xs font-medium">To *</label><Input type="date" min={from} value={to} onChange={e => setTo(e.target.value)} /></div>
            </div>
            <div className="space-y-1"><label className="text-xs font-medium">Reason</label><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. On leave" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy || !who || !from || !to}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    </CardContent></Card>
  );
}
