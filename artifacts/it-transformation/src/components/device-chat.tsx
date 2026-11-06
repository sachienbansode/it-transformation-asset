import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { reasonDialog } from "@/components/confirm-dialog";
import { CheckCircle2, Loader2, MessageSquare, RotateCcw, Send, XCircle } from "lucide-react";

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
    <div className="flex flex-col h-full min-h-[420px]">
      <div className="border-b pb-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap"><MessageSquare className="w-4 h-4 text-primary" /><span className="font-semibold">{c.subject}</span><ChatStatus status={c.status} /></div>
        <div className="text-xs text-muted-foreground mt-0.5">{[mode === "it" ? `${c.employeeCode || ""} ${c.userName}`.trim() : null, c.hostname && `computer ${c.hostname}`, c.assetTag, c.ticketNo && `ticket ${c.ticketNo}`, `opened by ${c.openedBy} · ${fmtDateTime(c.openedAt)}`].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[50vh]">
        {msgs.map(m => m.side === "System"
          ? <div key={m.id} className="text-center text-[11px] text-muted-foreground">{m.body} · {fmtDateTime(m.at)}</div>
          : <div key={m.id} className={cn("flex", (mode === "it" ? m.side === "IT" : m.side === "Employee") ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", (mode === "it" ? m.side === "IT" : m.side === "Employee") ? "bg-primary text-primary-foreground" : "bg-muted")}>
                <div className="text-[11px] opacity-80 mb-0.5">{m.side === "IT" ? `${m.senderName} · IT` : m.senderName} · {fmtDateTime(m.at)}</div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            </div>)}
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
          {mode === "it" && c.status !== "Closed" && <Button size="sm" variant="ghost" className="gap-1" disabled={busy} onClick={async () => { const r = await reasonDialog("Close this chat? The employee can no longer reply.", { title: "Close chat", confirmText: "Close", label: "Reason", minLength: 5 }); if (r) act("/close", { note: r }, "Chat closed"); }}><XCircle className="w-3.5 h-3.5" />Close</Button>}
          {mode === "me" && c.status === "Resolved" && <>
            <Button size="sm" className="gap-1" disabled={busy} onClick={() => act("/confirm", {}, "Thanks — closed")}><CheckCircle2 className="w-3.5 h-3.5" />Yes, it's fixed</Button>
            <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={async () => { const r = await reasonDialog("What is still not working?", { title: "Re-open", confirmText: "Re-open", label: "Message to IT", minLength: 5 }); if (r) act("/reopen", { message: r }, "Re-opened"); }}><RotateCcw className="w-3.5 h-3.5" />Not fixed — re-open</Button></>}
        </div>
      </div>
    </div>
  );
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
      <DialogHeader><DialogTitle>Chat with {employee || "the employee"}</DialogTitle><DialogDescription>About {agent.hostname}{alert?.ticketNo ? ` · linked to ${alert.ticketNo} (messages are added to the ticket)` : ""}. Only IT can start a chat; the employee replies in IT Hub › My IT Chats.</DialogDescription></DialogHeader>
      <div className="space-y-2"><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" /><Textarea rows={5} value={msg} onChange={e => setMsg(e.target.value)} placeholder="First message" /></div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={go} disabled={busy || !msg.trim() || !subject.trim()} className="gap-1">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Start chat</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

/** List + conversation. mode "it" (Device Health › Chats) or "me" (My IT Chats). */
export function ChatInbox({ mode, agentId }: { mode: "it" | "me"; agentId?: number }) {
  const url = mode === "it" ? `/asset-agents/chats${agentId ? `?agentId=${agentId}` : ""}` : "/my-it-chats";
  const { data: list = [], isLoading } = useQuery({ queryKey: [mode === "it" ? "device-chats" : "my-it-chats", agentId || 0], queryFn: () => apiFetch<any[]>(url), refetchInterval: 20_000 });
  const [sel, setSel] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get("c")) || null);
  const [st, setSt] = useState<"open" | "all">("open");
  const shown = list.filter((c: any) => st === "all" || !["Closed"].includes(c.status));
  useEffect(() => { if (!sel && shown[0]) setSel(shown[0].id); }, [shown.length]);
  return (
    <div className="grid md:grid-cols-[320px_1fr] gap-4">
      <div className="border rounded-lg overflow-hidden self-start">
        <div className="flex gap-1 p-2 border-b bg-muted/30">{(["open", "all"] as const).map(k => <button key={k} onClick={() => setSt(k)} className={cn("px-2 py-1 rounded text-xs", st === k ? "bg-card shadow-sm font-semibold" : "text-muted-foreground")}>{k === "open" ? `Open ${list.filter((c: any) => c.status !== "Closed").length}` : `All ${list.length}`}</button>)}</div>
        <div className="divide-y max-h-[65vh] overflow-y-auto">
          {isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
          {shown.map((c: any) => (
            <button key={c.id} onClick={() => setSel(c.id)} className={cn("w-full text-left px-3 py-2 hover:bg-muted/40", sel === c.id && "bg-primary/5 border-l-2 border-primary")}>
              <div className="flex items-center gap-1.5"><span className="font-medium text-sm truncate flex-1">{c.subject}</span>{c.unread > 0 && <span className="text-[10px] rounded-full bg-primary text-primary-foreground px-1.5">{c.unread}</span>}</div>
              <div className="text-[11px] text-muted-foreground truncate">{mode === "it" ? `${c.employeeCode || ""} ${c.userName} · ` : ""}{c.hostname}{c.ticketNo ? ` · ${c.ticketNo}` : ""}</div>
              <div className="flex items-center gap-2 mt-0.5"><ChatStatus status={c.status} /><span className="text-[11px] text-muted-foreground truncate">{c.lastMessage}</span></div>
            </button>))}
          {!isLoading && !shown.length && <div className="p-4 text-sm text-muted-foreground">{mode === "it" ? "No chats. Start one from a device (Device Health › device › Chat)." : "No messages from IT."}</div>}
        </div>
      </div>
      <div className="border rounded-lg p-3">{sel ? <ChatThread key={sel} chatId={sel} mode={mode} /> : <div className="p-6 text-sm text-muted-foreground">Select a conversation.</div>}</div>
    </div>
  );
}
