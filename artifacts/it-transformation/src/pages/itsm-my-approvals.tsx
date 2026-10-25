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
import { CheckCircle2, XCircle, Search, Inbox, Loader2, ExternalLink, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/* ITSM › My Approvals — every approval step waiting for the signed-in person (in order), with approve / reject. */

const PAGE = 10;
const fmt = (d?: string | null) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
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
  const [decide, setDecide] = useState<{ row: any; action: "Approved" | "Rejected" } | null>(null);
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
      <Card><CardContent className="p-4 space-y-3">
        <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search ticket, title, requester…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ticket</TableHead><TableHead>Raised by</TableHead><TableHead>Your level</TableHead><TableHead>Waiting</TableHead><TableHead className="text-right">Decision</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !list.length && <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground"><Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />Nothing is waiting for your approval.</TableCell></TableRow>}
              {list.slice((page - 1) * PAGE, page * PAGE).map(r => (
                <TableRow key={r.approvalId} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <TableCell>
                    <div className="flex items-center gap-2"><span className="font-mono text-xs font-semibold text-primary">{r.ticketNo}</span><span className="text-[11px] text-muted-foreground">{r.ticketType}{r.changeType ? ` · ${r.changeType}` : ""}</span>
                      {r.priority && <span className={cn("px-1.5 py-[1px] rounded-full text-[10px] font-semibold", PRI[r.priority] || "bg-muted")}>{r.priority}</span>}</div>
                    <div className="text-sm font-medium">{r.title}</div>
                    {r.previous?.length > 0 && <div className="text-[11px] text-emerald-700 dark:text-emerald-400">Approved so far: {r.previous.join("; ").replace(/ <[^>]*>/g, "")}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{String(r.raisedBy || "—").replace(/ <.*>$/, "")}<div className="text-[11px] text-muted-foreground">{fmt(r.raisedAt)}</div></TableCell>
                  <TableCell className="text-sm"><b>{r.level}</b> · {r.role}<div className="text-[11px] text-muted-foreground">level {r.levelOf}{!r.mine ? " · not yours (admin view)" : ""}</div></TableCell>
                  <TableCell className="text-sm whitespace-nowrap"><Clock className="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-muted-foreground" />{waited(r.waitingSince)}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDecide({ row: r, action: "Approved" })}><CheckCircle2 className="w-3.5 h-3.5" />Approve</Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-red-600" onClick={() => setDecide({ row: r, action: "Rejected" })}><XCircle className="w-3.5 h-3.5" />Reject</Button>
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
      {decide && <DecideDialog d={decide} onClose={() => setDecide(null)} onDone={() => { ["my-approvals", "approvals", "changes", "service-requests", "problems", "incidents"].forEach(k => qc.invalidateQueries({ queryKey: [k] })); }} toast={toast} />}
    </div>
  );
}

function DecideDialog({ d, onClose, onDone, toast }: { d: { row: any; action: "Approved" | "Rejected" }; onClose: () => void; onDone: () => void; toast: any }) {
  const [notes, setNotes] = useState(""); const [busy, setBusy] = useState(false);
  const reject = d.action === "Rejected";
  async function go() {
    setBusy(true);
    try {
      const r = await apiFetch<any>(`/approvals/${d.row.approvalId}/action`, { method: "POST", body: JSON.stringify({ action: d.action, notes: notes.trim() || undefined }) });
      toast({ title: r.ticketApproval === "Approved" ? `${d.row.ticketNo} fully approved` : r.ticketApproval === "Rejected" ? `${d.row.ticketNo} rejected` : `${d.row.ticketNo}: ${d.row.level} approved — sent to the next level` });
      onDone(); onClose();
    } catch (e: any) { toast({ title: "Could not record decision", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{reject ? "Reject" : "Approve"} {d.row.ticketNo}</DialogTitle><DialogDescription>{d.row.title} — {d.row.level} ({d.row.role})</DialogDescription></DialogHeader>
        <div className="space-y-1.5"><label className="text-xs font-medium">{reject ? "Reason (sent to the requester) *" : "Comment (optional)"}</label><Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} autoFocus /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button disabled={busy || (reject && notes.trim().length < 5)} className={cn("gap-1.5", reject ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700")} onClick={go}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{reject ? "Reject" : "Approve"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
