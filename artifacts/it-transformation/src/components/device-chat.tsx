import { confirmHeader } from "@/components/confirm-dialog";
import { usePresence, PresenceDot, PresenceLabel, useMyPresence } from "@/lib/presence";
import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Link } from "wouter";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { reasonDialog } from "@/components/confirm-dialog";
import { Video, Download, CheckCircle2, Loader2, MessageSquare, RotateCcw, Send, XCircle, Paperclip, Plus, ShieldAlert, FileText, Eye } from "lucide-react";
import { ScreenShare } from "@/components/screen-share";

/*
 * Chats
 *  - Direct: person ↔ person; only the two of them (Super Admin can open it read-only, audited).
 *  - IT support: IT staff ↔ employee about a computer / ticket; employee + all IT staff (+ Super Admin).
 */
export const CHAT_TONE: Record<string, string> = {
  Active: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  "Waiting on employee": "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  "Waiting on IT": "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  Resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  Closed: "bg-muted text-muted-foreground",
};
export function ChatStatus({ status }: { status: string }) { return <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap", CHAT_TONE[status])}>{status === "Active" ? "Open" : status}</span>; }
const KindTag = ({ kind }: { kind: string }) => <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", kind === "support" ? "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300" : "bg-muted text-muted-foreground")}>{kind === "support" ? "IT support" : "Direct"}</span>;
const dayOf = (d: string) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
function Avatar({ name, it }: { name: string; it?: boolean }) {
  const ini = String(name || "?").split(/\s+/).map(x => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return <div className={cn("w-7 h-7 rounded-full grid place-items-center text-[10px] font-semibold shrink-0", it ? "bg-primary/15 text-primary" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300")} title={name}>{ini}</div>;
}
function Info({ l, v, sub }: { l: string; v: any; sub?: any }) {
  return <div className="rounded-md border px-2 py-1.5 min-w-0"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div><div className="font-medium truncate">{v || "—"}</div>{sub && <div className="text-muted-foreground truncate" title={String(sub)}>{sub}</div>}</div>;
}
const kb = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
async function downloadFile(chatId: number, f: any) {
  const r = await fetch(`/api/chats/${chatId}/attachments/${f.id}`, { credentials: "include" }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Download failed");
  const u = URL.createObjectURL(await r.blob()); Object.assign(document.createElement("a"), { href: u, download: f.name }).click(); URL.revokeObjectURL(u);
}
const toB64 = (file: File) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => bad(r.error); r.readAsDataURL(file); });

/** One conversation (any kind). What you can do depends on your role in it. */
export function ChatThread({ chatId, onChanged, compact = false }: { chatId: number; mode?: string; onChanged?: () => void; compact?: boolean }) {
  const qc = useQueryClient(); const { toast } = useToast(); const { user } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ["chat", chatId], queryFn: () => apiFetch<any>(`/chats/${chatId}`), refetchInterval: 10_000 });
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [share, setShare] = useState(false); const [log, setLog] = useState(false);
  const end = useRef<HTMLDivElement>(null); const fileIn = useRef<HTMLInputElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [data?.messages?.length]);
  const c = data?.chat; const msgs: any[] = data?.messages || []; const role: string = data?.role;
  const presFor = usePresence([data?.chat?.with?.id, data?.chat?.assignedToId, data?.chat?.userId]);   // ITH-077
  const refresh = () => { qc.invalidateQueries({ queryKey: ["chat", chatId] }); qc.invalidateQueries({ queryKey: ["chats"] }); qc.invalidateQueries({ queryKey: ["device-chats"] }); qc.invalidateQueries({ queryKey: ["chats-unread"] }); onChanged?.(); };
  async function act(path: string, body: any, ok?: string) {
    setBusy(true);
    try { await apiFetch(`/chats/${chatId}${path}`, { method: "POST", body: JSON.stringify(body), headers: { "X-No-Confirm": path === "/messages" ? "1" : "" } }); if (ok) toast({ title: ok }); refresh(); return true; }
    catch (e: any) { if (!e.cancelled) toast({ title: "Could not do that", description: e.message, variant: "destructive" }); return false; } finally { setBusy(false); }
  }
  async function send() { if (!msg.trim()) return; if (await act("/messages", { message: msg.trim() })) setMsg(""); }
  async function attach(file?: File | null) {
    if (!file) return; const lim = data?.attach; const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (lim && !lim.extensions.includes(ext)) { toast({ title: "This file type is not allowed", description: `Allowed: ${lim.extensions.join(", ")}`, variant: "destructive" }); return; }
    if (lim && file.size > lim.maxMB * 1048576) { toast({ title: `Files can be at most ${lim.maxMB} MB`, variant: "destructive" }); return; }
    setBusy(true);
    try { await apiFetch(`/chats/${chatId}/attachments`, { method: "POST", body: JSON.stringify({ fileName: file.name, dataBase64: await toB64(file), message: msg.trim() || undefined }),
      headers: confirmHeader(`Send ${file.name} (${(file.size / 1048576).toFixed(1)} MB) in this chat${msg.trim() ? ` with the message “${msg.trim().slice(0, 120)}”` : ""}?`) }); setMsg(""); toast({ title: `Sent ${file.name}` }); refresh(); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Could not send the file", description: e.message, variant: "destructive" }); } finally { setBusy(false); if (fileIn.current) fileIn.current.value = ""; }
  }
  if (error) return <div className="p-6 text-sm text-red-600">{(error as Error).message}</div>;
  if (isLoading || !c) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  const support = c.kind === "support";
  const pres = presFor;
  const mine = (m: any) => role === "member" ? m.senderId === user?.id : role === "employee" ? m.side === "Employee" : role === "it" ? m.side === "IT" && m.senderId === user?.id || (role === "it" && m.side === "IT") : false;
  const canWrite = role === "member" || role === "it" || (role === "employee" && (c.status === "Waiting on employee" || c.status === "Waiting on IT"));
  return (
    <div className={cn("flex flex-col h-full", compact ? "" : "min-h-[460px]")}>
      {(() => { const otherId = c.kind === "direct" ? c.with?.id : role === "employee" ? c.assignedToId : c.userId; const st = pres(otherId); const nm = c.kind === "direct" ? c.with?.name : role === "employee" ? c.assignedTo : c.userName;
        return otherId && st ? <div className={cn("mb-2 text-[11px] flex items-center gap-1.5", st === "dnd" ? "rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 px-2 py-1 text-red-700 dark:text-red-300" : "text-muted-foreground")}><PresenceDot status={st} ring={false} />{nm}: {st === "dnd" ? "Do not disturb — they will see your message later" : st === "online" ? "Online" : st === "away" ? "Away" : "Offline"}</div> : null; })()}
      {support && role === "it" && c.status !== "Closed" && <QueueBar c={c} meId={user?.id} onDone={refresh} />}
      {support && role === "employee" && c.status !== "Closed" && <div className="mb-2 text-[11px] text-muted-foreground">{c.assignedTo ? <>Handled by <b>{c.assignedTo}</b>{c.teamName ? ` · ${c.teamName}` : ""}</> : c.teamName ? <>Waiting for someone in <b>{c.teamName}</b> to pick it up</> : null}</div>}
      {role === "admin" && <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 text-xs flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-amber-600" />Super Admin view — read-only. Opening this chat is recorded in the audit log.</div>}
      {compact ? <div className="text-[11px] text-muted-foreground border-b pb-1.5 mb-1.5 flex gap-2 flex-wrap items-center"><KindTag kind={c.kind} /><ChatStatus status={c.status} /><span>{support ? [role !== "employee" ? `${c.employeeCode || ""} ${c.userName}`.trim() : null, c.hostname, c.ticketNo].filter(Boolean).join(" · ") : c.title}</span></div> :
      <div className="border-b pb-3 mb-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap"><MessageSquare className="w-4 h-4 text-primary" /><span className="font-semibold text-base">{c.title}</span><KindTag kind={c.kind} /><ChatStatus status={c.status} /><span className="text-xs text-muted-foreground ml-auto">#{c.id}</span></div>
        {support ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {role !== "employee" && <Info l="Employee" v={`${c.employeeCode ? `${c.employeeCode} · ` : ""}${c.userName}`} sub={c.department} />}
          <Info l="Computer" v={c.hostname || "—"} sub={c.assetTag} />
          <Info l="Ticket" v={c.ticketNo ? (role === "it" ? <Link href={`/itsm-incidents?q=${c.ticketNo}`} className="text-primary underline">{c.ticketNo}</Link> : c.ticketNo) : "—"} sub={c.alertMessage} />
          <Info l="Opened" v={c.openedBy} sub={fmtDateTime(c.openedAt)} />
        </div> : <div className="text-xs text-muted-foreground">Between {(c.members || []).map((x: any) => `${x.name}${x.employeeCode ? ` (${x.employeeCode})` : ""}`).join(" and ")} · private to the two of you · started {fmtDateTime(c.openedAt)}</div>}
      </div>}
      <div className={cn("flex-1 overflow-y-auto space-y-2 pr-1", compact ? "min-h-[200px] max-h-[300px]" : "min-h-[260px] max-h-[calc(100vh-400px)]")}>
        {msgs.map((m, i) => { const day = dayOf(m.at); const showDay = i === 0 || dayOf(msgs[i - 1].at) !== day; const me = mine(m);
          return <React.Fragment key={m.id}>
            {showDay && <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1"><div className="flex-1 border-t" />{day}<div className="flex-1 border-t" /></div>}
            {m.side === "System" ? <div className="text-center text-[11px] text-muted-foreground italic">{m.body} · {fmtDateTime(m.at)}</div>
              : <div className={cn("flex gap-2 items-end", me ? "justify-end" : "justify-start")}>
                {!me && <Avatar name={m.senderName} it={m.side === "IT"} />}
                <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm", me ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm")}>
                  <div className="text-[11px] opacity-80 mb-0.5 font-medium">{m.side === "IT" ? `${m.senderName} · IT` : m.senderName}</div>
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  {(m.files || []).map((f: any) => <button key={f.id} onClick={() => downloadFile(c.id, f).catch(e => toast({ title: e.message, variant: "destructive" }))} className={cn("mt-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs w-full text-left", me ? "bg-white/15" : "bg-background border")}><FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate flex-1">{f.name}</span><span className="opacity-70">{kb(f.size)}</span><Download className="w-3 h-3" /></button>)}
                  <div className="text-[10px] opacity-70 mt-0.5 text-right">{fmtDateTime(m.at)}{me ? (m.readAt ? ` · seen ${fmtDateTime(m.readAt)}` : " · sent") : ""}</div>
                </div>
                {me && <Avatar name={m.senderName} it={m.side === "IT"} />}
              </div>}
          </React.Fragment>; })}
        <div ref={end} />
      </div>
      {log && <SessionLog chatId={c.id} onClose={() => setLog(false)} />}
      {share && <ScreenShare chatId={c.id} role={role} onClose={() => { setShare(false); refresh(); }} />}
      <div className="border-t pt-2 mt-2 space-y-2">
        {canWrite ? <div className="flex gap-2 items-end">
          <input ref={fileIn} type="file" className="hidden" onChange={e => attach(e.target.files?.[0])} accept={(data?.attach?.extensions || []).map((x: string) => "." + x).join(",")} />
          <Button size="icon" variant="outline" title={`Attach a file (max ${data?.attach?.maxMB ?? 10} MB)`} disabled={busy} onClick={() => fileIn.current?.click()}><Paperclip className="w-4 h-4" /></Button>
          <Textarea rows={2} className="flex-1" placeholder={role === "employee" ? "Reply to IT…" : role === "it" ? "Message to the employee…" : "Write a message…"} value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }} />
          <Button onClick={send} disabled={busy || !msg.trim()} className="gap-1">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send</Button>
        </div> : role === "admin" ? null : c.status === "Resolved" ? <div className="text-sm text-muted-foreground">{c.resolvedBy} marked this resolved: {c.resolution}</div>
          : <div className="text-sm text-muted-foreground">This chat is closed{c.closeNote ? ` — ${c.closeNote}` : ""}.</div>}
        <div className="flex gap-2 flex-wrap">
          {support && role !== "admin" && c.status !== "Closed" && <Button size="sm" variant="outline" className="gap-1" onClick={() => {
            // ITH-082: IT watches in its own window (full screen, take control, end); the employee shares from the chat
            if (role === "it") { const w = window.open(`/screen-session/${c.id}`, `ithub-screen-${c.id}`, "popup=yes,width=1366,height=860"); if (w) { w.focus(); return; } }
            setShare(true);
          }}><Eye className="w-3.5 h-3.5" />Screen share / remote help</Button>}
          {role === "it" && !["Resolved", "Closed"].includes(c.status) && <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={async () => { const r = await reasonDialog("How was it resolved? The employee is asked to confirm, or can re-open it.", { title: "Mark resolved", confirmText: "Mark resolved", label: "Resolution", minLength: 5 }); if (r) act("/resolve", { resolution: r }, "Marked resolved"); }}><CheckCircle2 className="w-3.5 h-3.5" />Mark resolved</Button>}
          {support && (role === "it" || role === "admin") && <Button size="sm" variant="ghost" className="gap-1" onClick={() => setLog(true)}><Video className="w-3.5 h-3.5" />Sessions & recordings</Button>}
          {role === "it" && <Button size="sm" variant="ghost" className="gap-1" onClick={async () => { const r = await fetch(`/api/asset-agents/chats/${chatId}/transcript`, { credentials: "include" }); if (!r.ok) return; const u = URL.createObjectURL(await r.blob()); Object.assign(document.createElement("a"), { href: u, download: `chat_${chatId}.csv` }).click(); URL.revokeObjectURL(u); }}><Download className="w-3.5 h-3.5" />Transcript</Button>}
          {((role === "it" && c.status !== "Closed") || (role === "member" && c.status !== "Closed")) && <Button size="sm" variant="ghost" className="gap-1" disabled={busy} onClick={async () => { const r = role === "member" ? "closed" : await reasonDialog("Close this chat? The employee can no longer reply.", { title: "Close chat", confirmText: "Close", label: "Reason", minLength: 5 }); if (r) act("/close", { note: r }, "Chat closed"); }}><XCircle className="w-3.5 h-3.5" />Close</Button>}
          {role === "employee" && c.status === "Resolved" && <>
            <Button size="sm" className="gap-1" disabled={busy} onClick={() => act("/confirm", {}, "Thanks — closed")}><CheckCircle2 className="w-3.5 h-3.5" />Yes, it's fixed</Button>
            <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={async () => { const r = await reasonDialog("What is still not working?", { title: "Re-open", confirmText: "Re-open", label: "Message to IT", minLength: 5 }); if (r) act("/reopen", { message: r }, "Re-opened"); }}><RotateCcw className="w-3.5 h-3.5" />Not fixed — re-open</Button></>}
        </div>
      </div>
    </div>
  );
}

/** IT starts a support chat from a device / health item. */
export function StartChatDialog({ agent, alert, employee, onClose, onStarted }: { agent: any; alert?: any; employee?: string | null; onClose: () => void; onStarted: (id: number) => void }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(alert ? alert.message : `Your computer ${agent.hostname}`);
  const [msg, setMsg] = useState(alert ? `Hi, our monitoring shows an issue on your computer ${agent.hostname}: ${alert.message}. ` : ""); const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { const r = await apiFetch<any>(`/asset-agents/${agent.id}/chats`, { method: "POST", body: JSON.stringify({ subject, message: msg, alertId: alert?.id }),
      headers: confirmHeader(`Start an IT support chat with ${employee || "the employee"} about ${agent.hostname} (“${subject}”), starting with the message:\n“${msg.trim().length > 160 ? msg.trim().slice(0, 157) + "…" : msg.trim()}”`) }); toast({ title: "Chat started", description: "The employee is notified (in-app and push)." }); onStarted(r.id); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Could not start chat", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>IT support chat with {employee || "the employee"}</DialogTitle><DialogDescription>About {agent.hostname}{alert?.ticketNo ? ` · linked to ${alert.ticketNo}` : ""}. Visible to the employee and the IT team; the employee replies in Chats.</DialogDescription></DialogHeader>
      <div className="space-y-2"><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" /><Textarea rows={5} value={msg} onChange={e => setMsg(e.target.value)} placeholder="First message" /></div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={go} disabled={busy || !msg.trim() || !subject.trim()} className="gap-1">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Start chat</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

/** New chat: anyone → direct chat with a person; IT staff can also start an IT support chat with an employee. */
export function NewChatDialog({ staff, onClose, onStarted }: { staff: boolean; onClose: () => void; onStarted: (id: number) => void }) {
  /* ITH-079 — choose the kind of chat first, then the details:
     colleague = a private chat with one person · help = an IT support request to the mapped support team (no person to pick)
     employee = IT staff start an IT support chat with an employee */
  const { toast } = useToast();
  const [kind, setKind] = useState<"direct" | "help" | "support" | null>(null); const [q, setQ] = useState(""); const [who, setWho] = useState<any>(null);
  const [subject, setSubject] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const { data: people = [] } = useQuery({ queryKey: ["chat-people", q], queryFn: () => apiFetch<any[]>(`/chats/people?q=${encodeURIComponent(q.trim())}`), enabled: (kind === "direct" || kind === "support") && q.trim().length > 1 });
  const { data: team } = useQuery({ queryKey: ["chat-support-team"], queryFn: () => apiFetch<any>("/chats-support-team") });
  const peoplePres = usePresence(people.map((p: any) => p.id));
  const short = (t: string) => (t.length > 160 ? t.slice(0, 157) + "…" : t);
  async function go() {
    setBusy(true);
    try {
      const body = kind === "help" ? { kind: "support-request", subject: subject.trim() || undefined, message: msg.trim() } : { kind, userId: who.id, message: msg.trim(), subject: subject.trim() || undefined };
      const say = kind === "help" ? `Send an IT support request to ${team?.team?.name || "the IT support team"}${subject.trim() ? ` about “${subject.trim()}”` : ""}, starting with the message:\n“${short(msg.trim())}”`
        : `${kind === "support" ? "Start an IT support chat with" : "Start a chat with"} ${who.name}${subject.trim() ? ` about “${subject.trim()}”` : ""}, starting with the message:\n“${short(msg.trim())}”`;
      const r = await apiFetch<any>("/chats", { method: "POST", body: JSON.stringify(body), headers: confirmHeader(say) });
      toast({ title: kind === "help" ? `Sent to ${r.team || "IT support"}` : r.existing ? `Added to your chat with ${who.name}` : "Chat started" }); onStarted(r.id);
    } catch (e: any) { if (!e.cancelled) toast({ title: "Could not start chat", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  const Choice = ({ k, icon: I, title, text }: { k: "direct" | "help" | "support"; icon: any; title: string; text: string }) => (
    <button onClick={() => { setKind(k); setWho(null); setQ(""); }} className="w-full text-left rounded-xl border p-3 hover:bg-muted/50 hover:border-primary/40 flex gap-3 items-start">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><I className="w-4 h-4" /></div>
      <div><div className="font-semibold text-sm">{title}</div><div className="text-xs text-muted-foreground">{text}</div></div></button>);
  const noTeam = kind === "help" && team && !team.configured;
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{!kind ? "New chat" : kind === "direct" ? "Message a colleague" : kind === "help" ? "Get IT support" : "IT support chat with an employee"}</DialogTitle>
        <DialogDescription>{!kind ? "What would you like to do?" : kind === "direct" ? "A private chat between you and one person. Only the two of you can read it." : kind === "help" ? `Your request goes to ${team?.team?.name || "the IT support team"}. Anyone in the team can pick it up and reply.` : "Visible to the employee and the IT support team."}</DialogDescription></DialogHeader>
      {!kind ? <div className="space-y-2">
        <Choice k="help" icon={ShieldAlert} title="Get IT support" text="Ask the IT support team for help — no need to pick a person." />
        <Choice k="direct" icon={MessageSquare} title="Message a colleague" text="A private chat with one person." />
        {staff && <Choice k="support" icon={Plus} title="IT support chat with an employee" text="For IT staff: contact an employee about their computer or request." />}
      </div> : <div className="space-y-3">
        {noTeam && <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-200">IT support chat is not set up yet: {team.team ? `the support team “${team.team.name}” has no members.` : "no IT support team is mapped."} Please ask your ITSM Admin to {team.team ? "add people to it" : "map one in ITSM Setup › Teams"}.</div>}
        {(kind === "direct" || kind === "support") && (who ? <div className="flex items-center gap-2 rounded-lg border p-2 text-sm"><Avatar name={who.name} /><div className="flex-1"><b>{who.name}</b>{who.employeeCode ? ` · ${who.employeeCode}` : ""}<div className="text-xs text-muted-foreground">{[who.designation, who.department].filter(Boolean).join(" · ")}</div></div><Button size="sm" variant="ghost" onClick={() => setWho(null)}>Change</Button></div>
          : <><Input autoFocus placeholder="Search name, employee code or email…" value={q} onChange={e => setQ(e.target.value)} />
            {people.length > 0 && <div className="border rounded-lg divide-y max-h-52 overflow-y-auto">{people.map((p: any) => <button key={p.id} onClick={() => { setWho(p); setQ(""); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 flex gap-2 items-center"><Avatar name={p.name} /><PresenceDot status={peoplePres(p.id)} ring={false} /><span className="flex-1">{p.name}<span className="text-xs text-muted-foreground"> · {[p.employeeCode, p.department].filter(Boolean).join(" · ")}</span></span></button>)}</div>}</>)}
        {(kind === "help" || kind === "support") && !noTeam && <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject, e.g. Outlook keeps asking for password" />}
        {!noTeam && <Textarea rows={4} value={msg} onChange={e => setMsg(e.target.value)} placeholder={kind === "help" ? "Describe the problem" : "First message"} />}
      </div>}
      <DialogFooter>
        {kind && <Button variant="ghost" className="mr-auto" onClick={() => setKind(null)} disabled={busy}>Back</Button>}
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        {kind && <Button onClick={go} disabled={busy || !!noTeam || !msg.trim() || ((kind === "direct" || kind === "support") && !who)} className="gap-1">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{kind === "help" ? "Send to IT support" : "Start chat"}</Button>}
      </DialogFooter>
    </DialogContent></Dialog>
  );
}

/** Chats list: box mine / support / all, search, status filter, 10 a page; a row opens the conversation. */
export function ChatTable({ box, onMe }: { box: "mine" | "support" | "all"; onMe?: (m: any) => void }) {
  const [q, setQ] = useState(""); const [term, setTerm] = useState(""); const [st, setSt] = useState("Open"); const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<"" | "unassigned" | "me">("");
  const [sel, setSel0] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get("c")) || null);
  const setSel = (v: number | null) => { setSel0(v); const u = new URL(window.location.href); if (v) u.searchParams.set("c", String(v)); else u.searchParams.delete("c"); window.history.replaceState(null, "", u.pathname + u.search); };
  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, isLoading, error } = useQuery({ queryKey: ["chats", box, term, st, page, queue], queryFn: () => apiFetch<any>(`/chats?${new URLSearchParams({ box, q: term, status: st, page: String(page), pageSize: "10", queue: box === "support" ? queue : "" })}`), refetchInterval: 20_000 });
  useEffect(() => { if (data?.me) onMe?.(data.me); }, [data?.me?.staff, data?.me?.superAdmin]);
  const rows: any[] = data?.rows || []; const total = data?.total || 0;
  const rowPres = usePresence(rows.map((c: any) => c.kind === "direct" ? c.with?.id : c.userId)); const pages = Math.max(1, Math.ceil(total / 10));
  const filters = box === "mine" ? ["Open", "Resolved", "Closed", "All"] : ["Open", "Waiting on IT", "Waiting on employee", "Resolved", "Closed", "All"];
  if (error) return <div className="p-6 text-sm text-red-600">{(error as Error).message}</div>;
  return (
    <div className="space-y-3">
      {box === "support" && <div className="flex gap-2 flex-wrap">{([["", "All my team's chats", null], ["unassigned", "In queue", data?.queue?.unassigned], ["me", "Assigned to me", data?.queue?.me]] as const).map(([k, l, n]) =>
        <button key={k} onClick={() => { setQueue(k as any); setPage(1); }} className={cn("px-3 py-1.5 rounded-full border text-xs", queue === k ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted/50")}>{l}{n != null ? <span className={cn("ml-1.5 font-semibold", queue !== k && k === "unassigned" && n > 0 && "text-amber-700")}>{n}</span> : null}</button>)}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="flex-1 min-w-[240px]" placeholder="Search name, emp code, subject, computer, ticket, #id…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px] flex-wrap">{filters.map(k => <button key={k} onClick={() => { setSt(k); setPage(1); }} className={cn("px-2.5 py-1 rounded-[8px] text-[12px]", st === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{k} <span className="text-[11px] text-muted-foreground">{data?.counts?.[k] ?? ""}</span></button>)}</div>
      </div>
      <div className="border rounded-lg overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b bg-muted/30">
            <th className="p-2.5 font-semibold">#</th><th className="p-2.5 font-semibold">Chat</th><th className="p-2.5 font-semibold">Type</th><th className="p-2.5 font-semibold">With / employee</th><th className="p-2.5 font-semibold">Computer · ticket</th><th className="p-2.5 font-semibold">Status</th><th className="p-2.5 font-semibold">Last message</th><th className="p-2.5 font-semibold">Last activity</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground"><MessageSquare className="w-7 h-7 mx-auto mb-1 opacity-40" />No chats here. Use “New chat” to start one.</td></tr>}
            {rows.map(c => <tr key={c.id} onClick={() => setSel(c.id)} className={cn("border-b last:border-0 cursor-pointer hover:bg-muted/40", sel === c.id && "bg-primary/5", c.unread > 0 && "font-semibold")}>
              <td className="p-2.5 text-xs text-muted-foreground">#{c.id}</td>
              <td className="p-2.5"><div className="flex items-center gap-1.5">{c.title}{c.unread > 0 && <span className="text-[10px] rounded-full bg-primary text-primary-foreground px-1.5">{c.unread} new</span>}</div></td>
              <td className="p-2.5"><KindTag kind={c.kind} /></td>
              <td className="p-2.5 text-xs">{c.kind === "direct" ? (box === "all" ? (c.members || []).map((x: any) => x.name).join(" ↔ ") : <><span className="inline-flex items-center gap-1.5"><PresenceDot status={rowPres(c.with?.id)} ring={false} />{c.with?.name}</span><div className="text-muted-foreground font-normal">{c.with?.employeeCode} {c.with?.department}</div></>) : <>{c.employeeCode || "—"} · {c.userName}<div className="text-muted-foreground font-normal">{c.department}</div></>}</td>
              <td className="p-2.5 text-xs font-normal">{c.hostname || "—"}<div className="text-muted-foreground">{[c.assetTag, c.ticketNo].filter(Boolean).join(" · ")}</div>
                {c.sessions > 0 && <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold rounded bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 px-1.5 py-0.5" title="Screen sessions / recordings (IT and Super Admin only)"><Video className="w-3 h-3" />{c.sessions} session{c.sessions > 1 ? "s" : ""}{c.recordings ? ` · ${c.recordings} rec.` : ""}</div>}</td>
              <td className="p-2.5"><ChatStatus status={c.status} />
                {c.kind === "support" && box !== "mine" && <div className="mt-0.5 text-[11px]">{c.assignedTo ? <span className="text-muted-foreground">→ {c.assignedTo}</span> : c.teamId && c.status !== "Closed" && c.status !== "Resolved" ? <span className="font-semibold text-amber-700 dark:text-amber-400">In queue{c.teamName ? ` · ${c.teamName}` : ""}</span> : null}</div>}</td>
              <td className="p-2.5 text-xs font-normal text-muted-foreground max-w-[240px] truncate">{c.lastMessage}</td>
              <td className="p-2.5 text-xs font-normal whitespace-nowrap">{fmtDateTime(c.lastMsgAt)}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, total)} of ${total}` : "0 chats"}</span>
        <div className="flex gap-1 items-center"><Button size="sm" variant="outline" className="h-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="px-2">Page {page} of {pages}</span><Button size="sm" variant="outline" className="h-7" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></div>
      </div>
      {sel && <Dialog open onOpenChange={o => !o && setSel(null)}><DialogContent className="max-w-3xl max-h-[94vh] overflow-y-auto"><DialogHeader><DialogTitle className="sr-only">Chat</DialogTitle></DialogHeader><ChatThread chatId={sel} /></DialogContent></Dialog>}
    </div>
  );
}

/** Floating chat window: opens by itself when a new message arrives for me. */
export function ChatPopup() {
  const [open, setOpen] = useState<{ id: number; title: string } | null>(null); const [min, setMin] = useState(false);
  const seen = useRef<Record<string, string>>({});
  const { data } = useQuery({ queryKey: ["chats-unread"], queryFn: () => apiFetch<any[]>("/chats-unread"), refetchInterval: 15_000, refetchIntervalInBackground: false, retry: false });
  const { data: myPres } = useMyPresence();
  useEffect(() => {
    if (!data || myPres?.status === "dnd") return;   // ITH-077: Do not disturb — no chat windows pop up
    const items = [...data].sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));
    for (const x of items) {
      const k = String(x.id); if (seen.current[k] === x.lastAt) continue; seen.current[k] = x.lastAt;
      if (open?.id === x.id) { setMin(false); continue; }
      if (window.location.pathname.startsWith("/chats") && new URLSearchParams(window.location.search).get("c") === String(x.id)) continue;
      setOpen({ id: x.id, title: x.kind === "direct" ? (x.fromName || "New message") : `IT support · ${x.subject}` }); setMin(false); break;
    }
  }, [data]);
  if (!open) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border bg-card shadow-2xl" style={{ pointerEvents: "auto" }} onPointerDownCapture={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-primary text-primary-foreground rounded-t-xl">
        <MessageSquare className="w-4 h-4" /><span className="text-sm font-semibold truncate flex-1">{open.title}</span>
        <a href={`/chats?c=${open.id}`} className="text-[11px] underline opacity-90">Open</a>
        <button className="px-1 opacity-90" title={min ? "Expand" : "Minimise"} onClick={() => setMin(!min)}>{min ? "▴" : "▾"}</button>
        <button className="px-1 opacity-90" title="Close" onClick={() => setOpen(null)}>✕</button>
      </div>
      {!min && <div className="p-3"><ChatThread key={open.id} chatId={open.id} compact /></div>}
    </div>
  );
}
export { Plus };


/** ITH-083 — screen sessions of a chat: timeline and recording. IT support team and Super Admin only; viewing is audited. */
function SessionLog({ chatId, onClose }: { chatId: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data = [], isLoading, error } = useQuery({ queryKey: ["chat-session-log", chatId], queryFn: () => apiFetch<any[]>(`/chats/${chatId}/session-log`) });
  const [play, setPlay] = useState<{ id: number; url: string } | null>(null); const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => () => { if (play) URL.revokeObjectURL(play.url); }, [play]);
  async function get(id: number, save = false, name = "recording.webm") {
    setBusy(id);
    try { const r = await fetch(`/api/chats/${chatId}/attachments/${id}`, { credentials: "include" }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Could not open the recording");
      const u = URL.createObjectURL(await r.blob());
      if (save) { const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000); } else setPlay({ id, url: u });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  const mins = (a?: string, b?: string) => a && b ? Math.max(1, Math.round((+new Date(b) - +new Date(a)) / 60000)) : null;
  return (
    <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Video className="w-4 h-4" />Screen sessions & recordings</DialogTitle>
        <DialogDescription>Visible to the IT support team and Super Admin only. Opening this log and every recording is recorded in the audit trail.</DialogDescription></DialogHeader>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {error && <div className="text-sm text-red-600">{(error as Error).message}</div>}
      {!isLoading && !data.length && !error && <div className="text-sm text-muted-foreground">No screen sessions in this chat.</div>}
      <div className="space-y-3">{data.map((x: any) => (
        <div key={x.id} className="border rounded-lg p-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 flex-wrap"><b>Session #{x.id}</b>
            <span className={cn("text-[11px] font-semibold rounded-full px-2 py-0.5", x.status === "live" ? "bg-red-50 text-red-700" : x.status === "declined" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700")}>{x.status === "live" ? "Live now" : x.status === "declined" ? "Declined" : x.status === "requested" ? "Waiting for consent" : "Ended"}</span>
            {x.controlGrantedAt && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">Remote control used</span>}
            <span className="ml-auto text-xs text-muted-foreground">{mins(x.startedAt, x.endedAt) ? `${mins(x.startedAt, x.endedAt)} min` : ""}</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div><div className="text-muted-foreground">Asked by</div>{x.requestedBy}<div className="text-muted-foreground">{fmtDateTime(x.requestedAt)}</div></div>
            <div><div className="text-muted-foreground">Employee agreed</div>{x.consentAt ? fmtDateTime(x.consentAt) : "—"}</div>
            <div><div className="text-muted-foreground">Remote control</div>{x.controlGrantedAt ? `${fmtDateTime(x.controlGrantedAt)}${x.controlEndedAt ? ` → ${fmtDateTime(x.controlEndedAt)}` : ""}` : x.control === "denied" ? "Not allowed" : "Not used"}</div>
            <div><div className="text-muted-foreground">Ended</div>{x.endedAt ? `${fmtDateTime(x.endedAt)}${x.endedBy ? ` · ${x.endedBy}` : ""}` : "—"}</div>
          </div>
          {x.recordingId ? <div className="flex items-center gap-2 flex-wrap text-xs"><Video className="w-3.5 h-3.5 text-red-600" />{x.recordingName} · {(x.recordingBytes / 1048576).toFixed(1)} MB
            <span className="text-muted-foreground font-mono" title="SHA-256 of the recording">{String(x.recordingSha256 || "").slice(0, 12)}…</span>
            <Button size="sm" variant="outline" className="h-7 ml-auto" disabled={busy === x.recordingId} onClick={() => get(x.recordingId)}>Play</Button>
            <Button size="sm" variant="outline" className="h-7" disabled={busy === x.recordingId} onClick={() => get(x.recordingId, true, x.recordingName)}>Download</Button></div>
            : x.status === "ended" && <div className="text-xs text-muted-foreground">No recording was uploaded for this session.</div>}
          {play?.id === x.recordingId && <video src={play!.url} controls autoPlay className="w-full rounded border bg-black max-h-[50vh]" />}
          {(x.events || []).length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Activity log ({x.events.length})</summary>
            <div className="mt-1 border rounded divide-y">{x.events.map((e: any, i: number) => <div key={i} className="px-2 py-1 flex gap-2"><span className="text-muted-foreground whitespace-nowrap">{fmtDateTime(e.at)}</span><span className="flex-1">{e.summary}</span><span className="text-muted-foreground">{String(e.by || "").replace(/ <.*>$/, "")}</span></div>)}</div></details>}
        </div>))}</div>
    </DialogContent></Dialog>
  );
}


/** ITH-079 — who is handling an IT support chat; pick up / take over, put back in the queue, assign to a team member. */
function QueueBar({ c, meId, onDone }: { c: any; meId?: number; onDone: () => void }) {
  const { toast } = useToast(); const [busy, setBusy] = useState(false); const [assign, setAssign] = useState(false);
  const { data: team } = useQuery({ queryKey: ["chat-support-team"], queryFn: () => apiFetch<any>("/chats-support-team"), enabled: assign });
  const mine = Number(c.assignedToId) === Number(meId);
  const memberPres = usePresence((team?.memberList || []).map((u: any) => u.id));
  async function op(path: string, body: any, say: string) {
    setBusy(true);
    try { await apiFetch(`/chats/${c.id}/queue/${path}`, { method: "POST", body: JSON.stringify(body), headers: confirmHeader(say) }); toast({ title: "Done" }); setAssign(false); onDone(); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Could not do that", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <div className={cn("mb-2 rounded-lg border px-3 py-2 text-xs flex items-center gap-2 flex-wrap", c.assignedToId ? "bg-muted/30" : "bg-amber-50 border-amber-300 dark:bg-amber-900/20")}>
      {c.assignedToId ? <span>Handled by <b>{mine ? "you" : c.assignedTo}</b>{c.pickedAt ? ` since ${fmtDateTime(c.pickedAt)}` : ""}{c.teamName ? ` · ${c.teamName}` : ""}</span>
        : <span className="font-semibold text-amber-800 dark:text-amber-300">In the {c.teamName || "IT support"} queue — nobody has picked it up yet</span>}
      <div className="ml-auto flex gap-1.5">
        {!c.assignedToId && <Button size="sm" className="h-7" disabled={busy} onClick={() => op("pickup", {}, `Pick up “${c.subject || "this chat"}” from ${c.userName}? You will handle it.`)}>Pick up</Button>}
        {c.assignedToId && !mine && <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => op("pickup", { takeOver: true }, `Take over “${c.subject || "this chat"}” from ${c.assignedTo}? They will be told.`)}>Take over</Button>}
        {c.assignedToId && <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => op("release", {}, `Put “${c.subject || "this chat"}” back in the ${c.teamName || "support"} queue for anyone in the team to pick up?`)}>Back to queue</Button>}
        <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setAssign(true)}>Assign…</Button>
      </div>
      {assign && <Dialog open onOpenChange={o => !o && setAssign(false)}><DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Assign to a team member</DialogTitle><DialogDescription>{team?.team?.name || "IT support team"}</DialogDescription></DialogHeader>
        <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">{(team?.memberList || []).filter((u: any) => u.id !== c.userId).map((u: any) => (
          <button key={u.id} disabled={busy} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex gap-2 items-center" onClick={() => op("assign", { userId: u.id }, `Assign “${c.subject || "this chat"}” to ${u.name}? They will be notified.`)}>
            <Avatar name={u.name} /><PresenceDot status={memberPres(u.id)} ring={false} /><span className="flex-1">{u.name}{u.employeeCode ? <span className="text-xs text-muted-foreground"> · {u.employeeCode}</span> : null}</span>{Number(c.assignedToId) === u.id && <span className="text-[10px] text-muted-foreground">current</span>}</button>))}
          {team && !(team.memberList || []).length && <div className="p-3 text-xs text-muted-foreground">No members to choose from.</div>}</div>
      </DialogContent></Dialog>}
    </div>
  );
}
