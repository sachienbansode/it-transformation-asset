/** 2.17 — ticket trail for incidents, service requests, problems and changes: who did what and when,
 *  with every edited field shown old → new (long text can be expanded). Read-only. */
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { History, ChevronDown, ChevronRight, MessageSquare, Loader2 } from "lucide-react";

const TYPE: Record<string, string> = { incident: "incident", request: "service_request", problem: "problem", change: "change" };
const who = (s: string) => String(s || "System").replace(/ <.*>$/, "");
const SHORT = 90;

function show(v: any, field: string) {
  if (v == null || v === "") return <span className="italic text-muted-foreground">empty</span>;
  let s = String(v);
  if (/^\[|^\{/.test(s)) { try { const j = JSON.parse(s); s = Array.isArray(j) ? j.join(", ") : Object.entries(j).map(([k, x]) => `${k}: ${Array.isArray(x) ? x.join(" / ") : typeof x === "object" ? JSON.stringify(x) : x}`).join("; "); } catch { /* keep text */ } }
  if (/^(plannedStart|plannedEnd)$/.test(field) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) { const d = new Date(s); if (!isNaN(+d)) s = fmtDateTime(d.toISOString()); }
  return s;
}
function Change({ c }: { c: any }) {
  const [open, setOpen] = useState(false);
  const a = show(c.from, c.field), b = show(c.to, c.field);
  const long = (typeof a === "string" && a.length > SHORT) || (typeof b === "string" && b.length > SHORT);
  if (!long) return <div className="text-xs"><span className="font-medium">{c.label}:</span> <span className="line-through text-muted-foreground">{a}</span> → <span className="text-foreground">{b}</span></div>;
  return (
    <div className="text-xs">
      <button type="button" className="inline-flex items-center gap-0.5 font-medium hover:underline" onClick={() => setOpen(!open)}>{open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{c.label} changed</button>
      {open && <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded border border-red-200 bg-red-50/60 dark:bg-red-900/10 p-2 whitespace-pre-wrap"><div className="text-[10px] uppercase font-semibold text-red-700 mb-0.5">Before</div>{a}</div>
        <div className="rounded border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/10 p-2 whitespace-pre-wrap"><div className="text-[10px] uppercase font-semibold text-emerald-700 mb-0.5">After</div>{b}</div>
      </div>}
    </div>
  );
}

export function TicketHistory({ kind, id, canComment }: { kind: "incident" | "request" | "problem" | "change"; id: number; canComment?: boolean }) {
  const { data = [], refetch } = useQuery<any[]>({ queryKey: ["ticket-history", TYPE[kind], id], queryFn: () => apiFetch(`/ticket-history?ticketId=${id}&ticketType=${TYPE[kind]}`) });
  const [all, setAll] = useState(false); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const { toast } = useToast(); const qc = useQueryClient();
  async function send() {
    setBusy(true);
    try { await apiFetch("/ticket-comments", { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ kind, id, text }) }); setText(""); refetch(); qc.invalidateQueries({ queryKey: ["ticket-history"] }); }
    catch (e: any) { toast({ title: "Comment not added", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  if (!data.length && !canComment) return null;
  const list = all ? data : data.slice(0, 8);
  return (
    <div className="rounded-lg border p-3" data-testid="ticket-history">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2"><History className="w-3 h-3" />Trail — comments and changes, latest first ({data.length})</div>
      {canComment && <div className="mb-3 space-y-1.5" data-testid="comment-box">
        <Textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Add a comment — what was done, what was found, what is next (kept in the trail; cannot be edited)" data-testid="comment-text" />
        <div className="flex justify-end"><Button size="sm" disabled={busy || text.trim().length < 3} onClick={send} data-testid="comment-add">{busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5 mr-1" />}Add comment</Button></div>
      </div>}
      <ol className="space-y-2 border-l pl-3">
        {list.map((h: any) => (
          <li key={h.id} className="relative">
            <span className={`absolute -left-[17px] top-1 h-2 w-2 rounded-full ${h.entryType === "comment" ? "bg-emerald-500" : "bg-[#2D7FF9]"}`} />
            <div className="text-[11px] text-muted-foreground">{fmtDateTime(h.createdAt)} · <span className="font-medium text-foreground">{who(h.updatedBy)}</span>{h.oldStatus && h.newStatus && h.oldStatus !== h.newStatus ? <> · {h.oldStatus} → {h.newStatus}</> : null}</div>
            {h.entryType === "comment" ? <div className="mt-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 px-2.5 py-1.5 text-xs whitespace-pre-wrap" data-testid="trail-comment"><MessageSquare className="w-3 h-3 inline mr-1 text-[#2D7FF9]" />{h.notes}</div>
              : Array.isArray(h.changes) && h.changes.length ? <div className="space-y-0.5 mt-0.5">{h.changes.map((c: any, i: number) => <Change key={i} c={c} />)}</div> : <div className="text-xs">{h.notes}</div>}
          </li>
        ))}
      </ol>
      {data.length > 8 && <button type="button" className="mt-2 text-xs text-[#2D7FF9] hover:underline" onClick={() => setAll(!all)}>{all ? "Show less" : `Show all ${data.length}`}</button>}
    </div>
  );
}
