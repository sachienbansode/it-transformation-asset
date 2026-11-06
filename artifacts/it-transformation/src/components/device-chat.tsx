import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { Link } from "wouter";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { reasonDialog } from "@/components/confirm-dialog";
import { Download, CheckCircle2, Loader2, MessageSquare, RotateCcw, Send, XCircle } from "lucide-react";

/* IT ↔ employee support chat about a device. Only IT starts a chat; the employee replies, confirms or re-opens. */

export const CHAT_TONE: Record<string, string> = {
  "Waiting on employee": "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  "Waiting on IT": "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  Resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  Closed: "bg-muted text-muted-foreground",
};
export function ChatStatus({ status }: { status: string }) { return <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap", CHAT_TONE[status])}>{status}</span>; }

/** One conversation. mode "it" = IT Hub staff view, "me" = the employee's view. */
export function ChatThread({ chatId, mode, onChanged }: { chatId: number; mode: "it" | "me"; onChanged?: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const base = mode === "it" ? `/asset-agents/chats/${chatId}` : `/my-it-chats/${chatId}`;
  const { data, isLoading } = useQuery({ queryKey: ["device-chat", mode, chatId], queryFn: () => apiFetch<any>(base), refetchInterval: 15_000 });
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [data?.messages?.length]);
  const c = data?.chat; const msgs: any[] = data?.messages || [];
  const refresh = () => { qc.invalidateQueries({ queryKey: ["device-chat", mode, chatId] }); qc.invalidateQueries({ queryKey: ["device-chats"] }); qc.invalidateQueries({ queryKey: ["my-it-chats"] }); onChanged?.(); };
  async function act(path: string, body: any, ok?: string) {
    setBusy(true);
    try { await apiFetch(`${base}${path}`, { method: "POST", body: JSON.stringify(body) }); if (ok) toast({ title: ok }); refresh(); return true; }
    catch (e: any) { toast({ title: "Could not do that", description: e.message, variant: "destructive" }); return false; } finally { setBusy(false); }
  }
  async function send() { if (!msg.trim()) return; if (await act("/messages", { message: msg.trim() })) setMsg(""); }
  if (isLoading || !c) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  const canWrite = mode === "it" ? true : c.status === "Waiting on employee" || c.status === "Waiting on IT";
  return (
    <div className="flex flex-col h-full min-h-[460px]">
      <div className="border-b pb-3 mb-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap"><MessageSquare className="w-4 h-4 text-primary" /><span className="font-semibold text-base">{c.subject}</span><ChatStatus status={c.status} /><span className="text-xs text-muted-foreground ml-auto">#{c.id}</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {mode === "it" && <Info l="Employee" v={`${c.employeeCode ? `${c.employeeCode} · ` : ""}${c.userName}`} sub={c.department} />}
          <Info l="Computer" v={c.hostname} sub={c.assetTag} />
          <Info l="Ticket" v={c.ticketNo ? (mode === "it" ? <Link href={`/itsm-incidents?q=${c.ticketNo}`} className="text-primary underline">{c.ticketNo}</Link> : c.ticketNo) : "—"} sub={c.alertMessage} />
          <Info l="Opened" v={c.openedBy} sub={fmtDateTime(c.openedAt)} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[260px] max-h-[calc(100vh-430px)]">
        {msgs.map((m, i) => { const day = dayOf(m.at); const showDay = i === 0 || dayOf(msgs[i - 1].at) !== day; const mine = mode === "it" ? m.side === "IT" : m.side === "Employee";
          return <React.Fragment key={m.id}>
            {showDay && <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1"><div className="flex-1 border-t" />{day}<div className="flex-1 border-t" /></div>}
            {m.side === "System" ? <div className="text-center text-[11px] text-muted-foreground italic">{m.body} · {fmtDateTime(m.at)}</div>
              : <div className={cn("flex gap-2 items-end", mine ? "justify-end" : "justify-start")}>
                {!mine && <Avatar name={m.senderName} it={m.side === "IT"} />}
                <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm", mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm")}>
                  <div className="text-[11px] opacity-80 mb-0.5 font-medium">{m.side === "IT" ? `${m.senderName} · IT` : m.senderName}</div>
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className="text-[10px] opacity-70 mt-0.5 text-right" title={fmtDateTime(m.at)}>{fmtDateTime(m.at)}{mine ? (m.readAt ? ` · seen ${fmtDateTime(m.readAt)}` : " · sent") : ""}</div>
                </div>
                {mine && <Avatar name={m.senderName} it={m.side === "IT"} />}
              </div>}
          </React.Fragment>; })}
        <div ref={end} />
      </div>
      <div className="border-t pt-2 mt-2 space-y-2">
        {canWrite ? <div className="flex gap-2 items-end">
          <Textarea rows={2} className="flex-1" placeholder={mode === "it" ? "Message to the employee…" : "Reply to IT…"} value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }} />
          <Button onClick={send} disabled={busy || !msg.trim()} className="gap-1">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send</Button>
        </div> : c.status === "Resolved" ? <div className="text-sm text-muted-foreground">{c.resolvedBy} marked this resolved: {c.resolution}</div>
          : <div className="text-sm text-muted-foreground">This chat is closed{c.closeNote ? ` — ${c.closeNote}` : ""}. IT will contact you here if anything else is needed.</div>}
        <div className="flex gap-2 flex-wrap">
          {mode === "it" && !["Resolved", "Closed"].includes(c.status) && <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={async () => { const r = await reasonDialog("How was it resolved? The employee is asked to confirm, or can re-open it.", { title: "Mark resolved", confirmText: "Mark resolved", label: "Resolution", minLength: 5 }); if (r) act("/resolve", { resolution: r }, "Marked resolved"); }}><CheckCircle2 className="w-3.5 h-3.5" />Mark resolved</Button>}
          {mode === "it" && <Button size="sm" variant="ghost" className="gap-1" onClick={async () => { const r = await fetch(`/api/asset-agents/chats/${chatId}/transcript`, { credentials: "include" }); if (!r.ok) return; const u = URL.createObjectURL(await r.blob()); Object.assign(document.createElement("a"), { href: u, download: `it_chat_${chatId}.csv` }).click(); URL.revokeObjectURL(u); }}><Download className="w-3.5 h-3.5" />Transcript</Button>}
          {mode === "it" && c.status !== "Closed" && <Button size="sm" variant="ghost" className="gap-1" disabled={busy} onClick={async () => { const r = await reasonDialog("Close this chat? The employee can no longer reply.", { title: "Close chat", confirmText: "Close", label: "Reason", minLength: 5 }); if (r) act("/close", { note: r }, "Chat closed"); }}><XCircle className="w-3.5 h-3.5" />Close</Button>}
          {mode === "me" && c.status === "Resolved" && <>
            <Button size="sm" className="gap-1" disabled={busy} onClick={() => act("/confirm", {}, "Thanks — closed")}><CheckCircle2 className="w-3.5 h-3.5" />Yes, it's fixed</Button>
            <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={async () => { const r = await reasonDialog("What is still not working?", { title: "Re-open", confirmText: "Re-open", label: "Message to IT", minLength: 5 }); if (r) act("/reopen", { message: r }, "Re-opened"); }}><RotateCcw className="w-3.5 h-3.5" />Not fixed — re-open</Button></>}
        </div>
      </div>
    </div>
  );
}

const dayOf = (d: string) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const timeOf = (d: string) => new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
function Avatar({ name, it }: { name: string; it?: boolean }) {
  const ini = String(name || "?").split(/\s+/).map(x => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return <div className={cn("w-7 h-7 rounded-full grid place-items-center text-[10px] font-semibold shrink-0", it ? "bg-primary/15 text-primary" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300")} title={name}>{ini}</div>;
}
function Info({ l, v, sub }: { l: string; v: any; sub?: any }) {
  return <div className="rounded-md border px-2 py-1.5 min-w-0"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div><div className="font-medium truncate">{v || "—"}</div>{sub && <div className="text-muted-foreground truncate" title={String(sub)}>{sub}</div>}</div>;
}

/** IT starts a chat with the device's employee. */
export function StartChatDialog({ agent, alert, employee, onClose, onStarted }: { agent: any; alert?: any; employee?: string | null; onClose: () => void; onStarted: (id: number) => void }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(alert ? alert.message : `Your computer ${agent.hostname}`);
  const [msg, setMsg] = useState(alert ? `Hi, our monitoring shows an issue on your computer ${agent.hostname}: ${alert.message}. ` : ""); const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { const r = await apiFetch<any>(`/asset-agents/${agent.id}/chats`, { method: "POST", body: JSON.stringify({ subject, message: msg, alertId: alert?.id }) }); toast({ title: "Chat started", description: "The employee is notified (in-app and push)." }); onStarted(r.id); }
    catch (e: any) { toast({ title: "Could not start chat", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Chat with {employee || "the employee"}</DialogTitle><DialogDescription>About {agent.hostname}{alert?.ticketNo ? ` · linked to ${alert.ticketNo} (the ticket records each message; the text stays encrypted in the chat)` : ""}. Only IT can start a chat; the employee replies in IT Hub › My IT Chats.</DialogDescription></DialogHeader>
      <div className="space-y-2"><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" /><Textarea rows={5} value={msg} onChange={e => setMsg(e.target.value)} placeholder="First message" /></div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={go} disabled={busy || !msg.trim() || !subject.trim()} className="gap-1">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Start chat</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

/** List + conversation. mode "it" (Device Health › IT chats) or "me" (My IT Chats). */
const FILTERS = ["Open", "Waiting on IT", "Waiting on employee", "Resolved", "Closed", "All"] as const;
export function ChatInbox({ mode, agentId }: { mode: "it" | "me"; agentId?: number }) {
  const url = mode === "it" ? `/asset-agents/chats${agentId ? `?agentId=${agentId}` : ""}` : "/my-it-chats";
  const { data: list = [], isLoading } = useQuery({ queryKey: [mode === "it" ? "device-chats" : "my-it-chats", agentId || 0], queryFn: () => apiFetch<any[]>(url), refetchInterval: 20_000 });
  const [sel, setSel] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get("c")) || null);
  const [f, setF] = useState<typeof FILTERS[number]>("Open"); const [q, setQ] = useState("");
  const match = (c: any, k: string) => k === "All" || (k === "Open" ? c.status !== "Closed" && c.status !== "Resolved" : c.status === k);
  const shown = list.filter((c: any) => match(c, f) && (!q.trim() || [c.subject, c.userName, c.employeeCode, c.hostname, c.assetTag, c.ticketNo, c.lastMessage].some((v: string) => v?.toLowerCase().includes(q.trim().toLowerCase()))));
  useEffect(() => { if (!sel && shown[0]) setSel(shown[0].id); }, [shown.length]);
  const filters = mode === "it" ? FILTERS : (["Open", "Resolved", "Closed", "All"] as const);
  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-4">
      <div className="border rounded-lg overflow-hidden self-start bg-card">
        <div className="p-2 border-b space-y-2 bg-muted/30">
          <Input className="h-8" placeholder={mode === "it" ? "Search employee, code, computer, ticket…" : "Search…"} value={q} onChange={e => setQ(e.target.value)} />
          <div className="flex gap-1 flex-wrap">{filters.map(k => { const n = list.filter((c: any) => match(c, k)).length; return <button key={k} onClick={() => setF(k)} className={cn("px-2 py-0.5 rounded text-[11px] border", f === k ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground bg-background")}>{k} {n}</button>; })}</div>
        </div>
        <div className="divide-y max-h-[calc(100vh-330px)] overflow-y-auto">
          {isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
          {shown.map((c: any) => (
            <button key={c.id} onClick={() => setSel(c.id)} className={cn("w-full text-left px-3 py-2.5 hover:bg-muted/40 flex gap-2", sel === c.id && "bg-primary/5 border-l-[3px] border-primary")}>
              <Avatar name={mode === "it" ? c.userName : c.openedBy} it={mode !== "it"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><span className={cn("text-sm truncate flex-1", c.unread > 0 ? "font-bold" : "font-medium")}>{mode === "it" ? `${c.employeeCode ? `${c.employeeCode} · ` : ""}${c.userName}` : c.subject}</span><span className="text-[10px] text-muted-foreground shrink-0">{c.lastMsgAt ? fmtDateTime(c.lastMsgAt) : ""}</span></div>
                {mode === "it" && <div className="text-xs truncate">{c.subject}</div>}
                <div className="text-[11px] text-muted-foreground truncate">{[c.hostname, c.ticketNo].filter(Boolean).join(" · ")}</div>
                <div className="flex items-center gap-2 mt-0.5"><ChatStatus status={c.status} /><span className={cn("text-[11px] truncate flex-1", c.unread > 0 ? "text-foreground" : "text-muted-foreground")}>{c.lastMessage}</span>{c.unread > 0 && <span className="text-[10px] rounded-full bg-primary text-primary-foreground px-1.5">{c.unread}</span>}</div>
              </div>
            </button>))}
          {!isLoading && !shown.length && <div className="p-4 text-sm text-muted-foreground">{list.length ? "No chats match." : mode === "it" ? "No chats yet. Start one from a device or a health item in Device Health." : "No messages from IT."}</div>}
        </div>
      </div>
      <div className="border rounded-lg p-4 bg-card">{sel ? <ChatThread key={sel} chatId={sel} mode={mode} /> : <div className="p-10 text-center text-sm text-muted-foreground"><MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />Select a conversation on the left.</div>}</div>
    </div>
  );
}
