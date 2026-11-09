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
import { Download, CheckCircle2, Loader2, MessageSquare, RotateCcw, Send, XCircle, Paperclip, Plus, ShieldAlert, FileText, Eye } from "lucide-react";
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
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [share, setShare] = useState(false);
  const end = useRef<HTMLDivElement>(null); const fileIn = useRef<HTMLInputElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [data?.messages?.length]);
  const c = data?.chat; const msgs: any[] = data?.messages || []; const role: string = data?.role;
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
    try { await apiFetch(`/chats/${chatId}/attachments`, { method: "POST", body: JSON.stringify({ fileName: file.name, dataBase64: await toB64(file), message: msg.trim() || undefined }) }); setMsg(""); toast({ title: `Sent ${file.name}` }); refresh(); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Could not send the file", description: e.message, variant: "destructive" }); } finally { setBusy(false); if (fileIn.current) fileIn.current.value = ""; }
  }
  if (error) return <div className="p-6 text-sm text-red-600">{(error as Error).message}</div>;
  if (isLoading || !c) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  const support = c.kind === "support";
  const mine = (m: any) => role === "member" ? m.senderId === user?.id : role === "employee" ? m.side === "Employee" : role === "it" ? m.side === "IT" && m.senderId === user?.id || (role === "it" && m.side === "IT") : false;
  const canWrite = role === "member" || role === "it" || (role === "employee" && (c.status === "Waiting on employee" || c.status === "Waiting on IT"));
  return (
    <div className={cn("flex flex-col h-full", compact ? "" : "min-h-[460px]")}>
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
          {support && role !== "admin" && c.status !== "Closed" && <Button size="sm" variant="outline" className="gap-1" onClick={() => setShare(true)}><Eye className="w-3.5 h-3.5" />Screen share / remote help</Button>}
          {role === "it" && !["Resolved", "Closed"].includes(c.status) && <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={async () => { const r = await reasonDialog("How was it resolved? The employee is asked to confirm, or can re-open it.", { title: "Mark resolved", confirmText: "Mark resolved", label: "Resolution", minLength: 5 }); if (r) act("/resolve", { resolution: r }, "Marked resolved"); }}><CheckCircle2 className="w-3.5 h-3.5" />Mark resolved</Button>}
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
    try { const r = await apiFetch<any>(`/asset-agents/${agent.id}/chats`, { method: "POST", body: JSON.stringify({ subject, message: msg, alertId: alert?.id }) }); toast({ title: "Chat started", description: "The employee is notified (in-app and push)." }); onStarted(r.id); }
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
  const { toast } = useToast();
  const [kind, setKind] = useState<"direct" | "support">("direct"); const [q, setQ] = useState(""); const [who, setWho] = useState<any>(null);
  const [subject, setSubject] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const { data: people = [] } = useQuery({ queryKey: ["chat-people", q], queryFn: () => apiFetch<any[]>(`/chats/people?q=${encodeURIComponent(q.trim())}`), enabled: q.trim().length > 1 });
  async function go() {
    setBusy(true);
    try { const r = await apiFetch<any>("/chats", { method: "POST", body: JSON.stringify({ kind, userId: who.id, message: msg.trim(), subject: subject.trim() || undefined }) }); toast({ title: r.existing ? `Added to your chat with ${who.name}` : "Chat started" }); onStarted(r.id); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Could not start chat", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>New chat</DialogTitle><DialogDescription>{kind === "direct" ? "A private chat between you and one person. Only the two of you can read it." : "An IT support chat with an employee — visible to the employee and the IT team."}</DialogDescription></DialogHeader>
      <div className="space-y-3">
        {staff && <div className="flex gap-2">{(["direct", "support"] as const).map(k => <button key={k} onClick={() => setKind(k)} className={cn("px-2.5 py-1 rounded-md border text-xs", kind === k ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground")}>{k === "direct" ? "Direct message" : "IT support chat"}</button>)}</div>}
        {who ? <div className="flex items-center gap-2 rounded-lg border p-2 text-sm"><Avatar name={who.name} /><div className="flex-1"><b>{who.name}</b>{who.employeeCode ? ` · ${who.employeeCode}` : ""}<div className="text-xs text-muted-foreground">{[who.designation, who.department].filter(Boolean).join(" · ")}</div></div><Button size="sm" variant="ghost" onClick={() => setWho(null)}>Change</Button></div>
          : <><Input autoFocus placeholder="Search name, employee code or email…" value={q} onChange={e => setQ(e.target.value)} />
            {people.length > 0 && <div className="border rounded-lg divide-y max-h-52 overflow-y-auto">{people.map((p: any) => <button key={p.id} onClick={() => { setWho(p); setQ(""); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 flex gap-2 items-center"><Avatar name={p.name} /><span><b>{p.name}</b>{p.employeeCode ? ` · ${p.employeeCode}` : ""}<span className="text-xs text-muted-foreground"> · {p.department || p.designation || ""}</span></span></button>)}</div>}</>}
        {kind === "support" && <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject, e.g. Outlook keeps asking for password" />}
        <Textarea rows={4} value={msg} onChange={e => setMsg(e.target.value)} placeholder="First message" />
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={go} disabled={busy || !who || !msg.trim()} className="gap-1">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Start chat</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

/** Chats list: box mine / support / all, search, status filter, 10 a page; a row opens the conversation. */
export function ChatTable({ box, onMe }: { box: "mine" | "support" | "all"; onMe?: (m: any) => void }) {
  const [q, setQ] = useState(""); const [term, setTerm] = useState(""); const [st, setSt] = useState("Open"); const [page, setPage] = useState(1);
  const [sel, setSel0] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get("c")) || null);
  const setSel = (v: number | null) => { setSel0(v); const u = new URL(window.location.href); if (v) u.searchParams.set("c", String(v)); else u.searchParams.delete("c"); window.history.replaceState(null, "", u.pathname + u.search); };
  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, isLoading, error } = useQuery({ queryKey: ["chats", box, term, st, page], queryFn: () => apiFetch<any>(`/chats?${new URLSearchParams({ box, q: term, status: st, page: String(page), pageSize: "10" })}`), refetchInterval: 20_000 });
  useEffect(() => { if (data?.me) onMe?.(data.me); }, [data?.me?.staff, data?.me?.superAdmin]);
  const rows: any[] = data?.rows || []; const total = data?.total || 0; const pages = Math.max(1, Math.ceil(total / 10));
  const filters = box === "mine" ? ["Open", "Resolved", "Closed", "All"] : ["Open", "Waiting on IT", "Waiting on employee", "Resolved", "Closed", "All"];
  if (error) return <div className="p-6 text-sm text-red-600">{(error as Error).message}</div>;
  return (
    <div className="space-y-3">
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
              <td className="p-2.5 text-xs">{c.kind === "direct" ? (box === "all" ? (c.members || []).map((x: any) => x.name).join(" ↔ ") : <>{c.with?.name}<div className="text-muted-foreground font-normal">{c.with?.employeeCode} {c.with?.department}</div></>) : <>{c.employeeCode || "—"} · {c.userName}<div className="text-muted-foreground font-normal">{c.department}</div></>}</td>
              <td className="p-2.5 text-xs font-normal">{c.hostname || "—"}<div className="text-muted-foreground">{[c.assetTag, c.ticketNo].filter(Boolean).join(" · ")}</div></td>
              <td className="p-2.5"><ChatStatus status={c.status} /></td>
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
  useEffect(() => {
    if (!data) return;
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
