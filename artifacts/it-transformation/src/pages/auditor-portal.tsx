import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Route, Switch, useLocation, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch, API } from "@/lib/api";
import { ShieldCheck, Loader2, LogOut, Search, FileText, Eye, Download, Paperclip, MessageSquare, Send, ChevronLeft, ChevronRight, ArrowLeft, Table2, KeyRound, Mail, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, Progress, fmtDate, fmtSize, refOf, AUDITOR_STATUSES, CLOSED } from "@/components/compliance-shared";

/* External auditor portal: sign-in (password + emailed code), set password from the invitation, and the audit review screens. */

const afile = (id: number, dl = false) => `${API}/auditor-files/${id}${dl ? "?download=1" : ""}`;

function Shell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center space-y-1"><ShieldCheck className="w-9 h-9 mx-auto text-primary" /><div className="text-xl font-semibold">Auditor portal</div><div className="text-xs text-muted-foreground">{title || "Read-only access to audit evidence"}</div></div>
        <Card className="rounded-[18px] shadow-lg"><CardContent className="p-6 space-y-4">{children}</CardContent></Card>
      </div>
    </div>
  );
}

export function AuditorLogin() {
  const { toast } = useToast(); const { refresh } = useAuth(); const [, nav] = useLocation();
  const [step, setStep] = useState<"pw" | "otp">("pw"); const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [code, setCode] = useState(""); const [sentTo, setSentTo] = useState(""); const [busy, setBusy] = useState(false);
  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { const r = await apiFetch<any>("/auditor-auth/login", { method: "POST", body: JSON.stringify({ email, password: pw }) }); if (r.otpRequired) { setSentTo(r.sentTo); setStep("otp"); } else { await refresh(); nav("/auditor"); } }
    catch (err: any) { toast({ title: "Could not sign in", description: err.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await apiFetch("/auditor-auth/verify", { method: "POST", body: JSON.stringify({ code }) }); await refresh(); nav("/auditor"); }
    catch (err: any) { toast({ title: "Could not verify", description: err.message, variant: "destructive" }); if (/again/i.test(err.message)) { setStep("pw"); setCode(""); } } finally { setBusy(false); }
  }
  return (
    <Shell title={step === "otp" ? "Check your email" : "Sign in with the email your invitation was sent to"}>
      {step === "pw" ? <form onSubmit={login} className="space-y-3">
        <div><Label>Email</Label><Input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div><Label>Password</Label><Input type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} /></div>
        <Button type="submit" className="w-full gap-2" disabled={busy || !email || !pw}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}Continue</Button>
        <p className="text-[11px] text-muted-foreground text-center">Forgot your password? Ask the audit team to resend your invitation.</p>
      </form> : <form onSubmit={verify} className="space-y-3">
        <div className="text-sm flex items-start gap-2"><Mail className="w-4 h-4 mt-0.5 text-primary" />We sent a 6-digit code to {sentTo}. It expires in 10 minutes.</div>
        <div><Label>Code</Label><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} className="text-center tracking-[0.4em] text-lg" autoFocus /></div>
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Sign in</Button>
        <button type="button" className="w-full text-xs text-muted-foreground hover:underline" onClick={() => { setStep("pw"); setCode(""); }}>Back</button>
      </form>}
    </Shell>
  );
}

export function AuditorSetup() {
  const { toast } = useToast(); const [, nav] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const { data, error, isLoading } = useQuery<any>({ queryKey: ["auditor-setup", token], queryFn: () => apiFetch(`/auditor-auth/setup?token=${encodeURIComponent(token)}`), retry: false });
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await apiFetch("/auditor-auth/setup", { method: "POST", body: JSON.stringify({ token, password: pw }) }); setDone(true); }
    catch (err: any) { toast({ title: "Could not set password", description: err.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  const strong = pw.length >= 10 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);
  return (
    <Shell title="Set your password">
      {isLoading ? <div className="text-sm text-muted-foreground">Checking the link…</div>
        : error ? <div className="text-sm text-red-600">{(error as any).message}</div>
        : done ? <div className="space-y-3"><div className="text-sm">Password set. Sign in with {data.email}; a code is emailed each time.</div><Button className="w-full" onClick={() => nav("/auditor/login")}>Go to sign-in</Button></div>
        : <form onSubmit={save} className="space-y-3">
          <div className="text-sm">Welcome {data.name}. Set a password for <b>{data.email}</b>.</div>
          <div><Label>New password</Label><Input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /><div className={cn("text-[11px] mt-0.5", strong ? "text-emerald-600" : "text-muted-foreground")}>{data.rule}</div></div>
          <div><Label>Repeat password</Label><Input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />{pw2 && pw2 !== pw && <div className="text-[11px] text-red-600 mt-0.5">Passwords do not match</div>}</div>
          <Button type="submit" className="w-full" disabled={busy || !strong || pw !== pw2}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Set password</Button>
        </form>}
    </Shell>
  );
}

/* ─── Signed-in auditor ─────────────────────────────────────────────────── */
export function AuditorApp() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card"><div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-primary" /><Link href="/auditor" className="font-semibold">Auditor portal</Link>
        <span className="text-xs text-muted-foreground hidden sm:inline">Read-only · every file view is logged</span>
        <div className="ml-auto flex items-center gap-3 text-sm"><span className="text-muted-foreground hidden sm:inline">{user?.name} · {user?.email}</span>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={async () => { await logout(); window.location.href = "/auditor/login"; }}><LogOut className="w-4 h-4" />Sign out</Button></div>
      </div></header>
      <main className="max-w-7xl mx-auto px-4 py-5">
        <Switch>
          <Route path="/auditor/:id" component={AuditView} />
          <Route component={Home} />
        </Switch>
      </main>
    </div>
  );
}

function Home() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["auditor-me"], queryFn: () => apiFetch("/auditor-me") });
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Your audits</h1>
      {!data?.audits?.length && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No audit is open for you at the moment.</CardContent></Card>}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.audits?.map((a: any) => { const pct = a.checkpoints ? Math.round((a.closed / a.checkpoints) * 100) : 0; return (
          <Link key={a.id} href={`/auditor/${a.id}`}><Card className="cursor-pointer hover:border-primary/50 h-full"><CardContent className="p-4 space-y-3">
            <div><div className="text-xs font-mono text-primary">{a.auditNo}</div><div className="font-semibold">{a.title}</div><div className="text-xs text-muted-foreground">{a.companyName}{a.periodFrom ? ` · period ${fmtDate(a.periodFrom)} – ${fmtDate(a.periodTo)}` : ""}</div></div>
            <div><div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Reviewed &amp; closed</span><span className="font-semibold">{a.closed}/{a.checkpoints} shared</span></div><Progress value={pct} /></div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-[8px] border px-2 py-1.5"><div className="text-muted-foreground">To review</div><div className="font-semibold text-indigo-600">{a.toReview}</div></div>
              <div className="rounded-[8px] border px-2 py-1.5"><div className="text-muted-foreground">Under review</div><div className="font-semibold text-amber-600">{a.underReview}</div></div>
              <div className="rounded-[8px] border px-2 py-1.5"><div className="text-muted-foreground">Info requested</div><div className="font-semibold">{a.infoRequested}</div></div>
            </div>
            <div className="text-[11px] text-muted-foreground">Access until {fmtDate(a.validUntil)} · {a.canDownload ? "downloads allowed" : "view only"}</div>
          </CardContent></Card></Link>); })}
      </div>
    </div>
  );
}

function AuditView() {
  const { id } = useParams<{ id: string }>();
  const { data: a, isLoading, error } = useQuery<any>({ queryKey: ["auditor-audit", id], queryFn: () => apiFetch(`/auditor-audits/${id}`), retry: false });
  const { data: items = [] } = useQuery<any[]>({ queryKey: ["auditor-items", id], queryFn: () => apiFetch(`/auditor-audits/${id}/items`), enabled: !!a });
  const [tab, setTab] = useState<"checklist" | "policy" | "schedules">("checklist");
  if (error) return <div className="text-sm text-red-600">{(error as any).message}</div>;
  if (isLoading || !a) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const s = a.stats; const pct = s.checkpoints ? Math.round((s.closed / s.checkpoints) * 100) : 0;
  return (
    <div className="space-y-4">
      <div><Link href="/auditor" className="text-xs text-muted-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />Your audits</Link>
        <h1 className="text-xl font-bold leading-tight">{a.title}</h1><div className="text-sm text-muted-foreground">{a.auditNo} · {a.companyName}{a.periodFrom ? ` · period ${fmtDate(a.periodFrom)} – ${fmtDate(a.periodTo)}` : ""} · access until {fmtDate(a.validUntil)}</div></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="rounded-[10px] border bg-card px-3 py-2 md:col-span-2"><div className="text-[11px] text-muted-foreground">Closed</div><div className="text-xl font-semibold">{pct}% <span className="text-xs text-muted-foreground font-normal">{s.closed}/{s.checkpoints} shared · {s.totalInAudit} in audit</span></div><Progress value={pct} className="mt-1.5" /></div>
        <div className="rounded-[10px] border bg-card px-3 py-2"><div className="text-[11px] text-muted-foreground">To review</div><div className="text-xl font-semibold text-indigo-600">{s.toReview}</div></div>
        <div className="rounded-[10px] border bg-card px-3 py-2"><div className="text-[11px] text-muted-foreground">Under review</div><div className="text-xl font-semibold text-amber-600">{s.underReview}</div></div>
        <div className="rounded-[10px] border bg-card px-3 py-2"><div className="text-[11px] text-muted-foreground">Info requested</div><div className="text-xl font-semibold">{s.infoRequested}</div></div>
      </div>
      <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px]">
        {([["checklist", `Checklist (${s.checkpoints})`], ["policy", `Policies (${s.policies})`], ["schedules", "Schedules"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", tab === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{l}</button>)}
      </div>
      {tab === "schedules" ? <Schedules auditId={a.id} canDownload={a.canDownload} /> : <Items audit={a} items={items.filter(i => i.kind === (tab === "policy" ? "policy" : "checklist"))} kind={tab} />}
    </div>
  );
}

const PAGE = 50;
function Items({ audit, items, kind }: { audit: any; items: any[]; kind: string }) {
  const [term, setTerm] = useState(""); const [status, setStatus] = useState("todo"); const [area, setArea] = useState("all"); const [page, setPage] = useState(0); const [open, setOpen] = useState<number | null>(null);
  const areas = useMemo(() => [...new Set(items.map(i => i.area).filter(Boolean))], [items]);
  const list = useMemo(() => { const t = term.toLowerCase(); return items.filter(i => (area === "all" || i.area === area) && (status === "all" || (status === "todo" ? !CLOSED.includes(i.status) : i.status === status)) &&
    (!t || [i.refNo, i.checkpoint, i.managementReply, i.subArea].some(x => x && String(x).toLowerCase().includes(t)))); }, [items, term, status, area]);
  useEffect(() => setPage(0), [term, status, area]);
  const shown = list.slice(page * PAGE, page * PAGE + PAGE); const pages = Math.max(1, Math.ceil(list.length / PAGE));
  return (
    <Card><CardContent className="p-3 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative w-60"><Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" /><Input className="pl-8 h-9" placeholder="Search…" value={term} onChange={e => setTerm(e.target.value)} /></div>
        {kind === "checklist" && <Select value={area} onValueChange={setArea}><SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All areas</SelectItem>{areas.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>}
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todo">Open (not closed)</SelectItem><SelectItem value="all">All</SelectItem>{["Submitted", "In Progress", ...AUDITOR_STATUSES].map(x => <SelectItem key={x} value={x}>{x === "Submitted" ? "To review (Submitted)" : x === "In Progress" ? "Info requested" : x}</SelectItem>)}</SelectContent></Select>
        <span className="text-xs text-muted-foreground ml-auto">{list.length} of {items.length}</span>
      </div>
      <div className="rounded-[10px] border overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40"><th className="text-left px-2 py-2 w-16">Ref</th><th className="text-left px-2">{kind === "policy" ? "Particulars" : "Checkpoint"}</th><th className="text-left px-2 w-36">Owner</th><th className="text-left px-2 w-32">Status</th><th className="w-14"></th></tr></thead>
        <tbody>{shown.map(i => (
          <tr key={i.id} className="border-t hover:bg-accent/40 cursor-pointer align-top" onClick={() => setOpen(i.id)}>
            <td className="px-2 py-2 font-mono text-xs text-primary whitespace-nowrap">{refOf(i)}</td>
            <td className="px-2 py-2"><div className="line-clamp-2 whitespace-pre-line">{kind === "policy" ? `${i.docType}: ${i.checkpoint}` : i.checkpoint}</div>{i.area && <div className="text-[11px] text-muted-foreground truncate">{[i.area, i.subArea].filter(Boolean).join(" › ")}</div>}</td>
            <td className="px-2 py-2 text-xs">{i.ownerName || "—"}</td>
            <td className="px-2 py-2"><StatusBadge s={i.status === "Submitted" ? "Submitted" : i.status} />{i.status === "In Progress" && <div className="text-[10px] text-muted-foreground">info requested</div>}</td>
            <td className="px-2 py-2 text-[11px] text-muted-foreground whitespace-nowrap">{i.evidenceCount > 0 && <span className="inline-flex items-center gap-0.5 mr-1.5"><Paperclip className="w-3 h-3" />{i.evidenceCount}</span>}{i.commentCount > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{i.commentCount}</span>}</td>
          </tr>))}
          {!shown.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">{items.length ? "Nothing matches the filters." : "Nothing has been shared with you yet."}</td></tr>}
        </tbody></table></div>
      {pages > 1 && <div className="flex items-center justify-end gap-2 text-xs"><Button size="sm" variant="outline" className="h-7" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button><span>Page {page + 1} of {pages}</span><Button size="sm" variant="outline" className="h-7" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="w-3.5 h-3.5" /></Button></div>}
      {open && <Review itemId={open} audit={audit} order={list.map(i => i.id)} onNav={setOpen} onClose={() => setOpen(null)} />}
    </CardContent></Card>
  );
}

function Review({ itemId, audit, order, onNav, onClose }: { itemId: number; audit: any; order: number[]; onNav: (id: number) => void; onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: it, refetch } = useQuery<any>({ queryKey: ["auditor-item", itemId], queryFn: () => apiFetch(`/auditor-items/${itemId}`) });
  const [status, setStatus] = useState(""); const [remarks, setRemarks] = useState(""); const [comment, setComment] = useState(""); const [busy, setBusy] = useState(false); const [loadedFor, setLoadedFor] = useState<number | null>(null);
  useEffect(() => { if (it && it.id === itemId && loadedFor !== itemId) { setStatus(it.status); setRemarks(it.auditorRemarks ?? ""); setComment(""); setLoadedFor(itemId); } }, [it, itemId]);
  const dirty = it && loadedFor === itemId && (status !== it.status || remarks !== (it.auditorRemarks ?? "") || comment.trim());
  const pos = order.indexOf(itemId);
  async function save(next?: number) {
    if (dirty) {
      setBusy(true);
      try { await apiFetch(`/auditor-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ status: status !== it.status ? status : undefined, auditorRemarks: remarks !== (it.auditorRemarks ?? "") ? remarks : undefined, comment: comment.trim() || undefined }) });
        await refetch(); setComment(""); ["auditor-items", "auditor-audit", "auditor-me"].forEach(k => qc.invalidateQueries({ queryKey: [k] })); toast({ title: `${refOf(it)} saved`, description: "The checkpoint owner is notified" }); }
      catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); setBusy(false); return; }
      setBusy(false);
    }
    if (next) onNav(next);
  }
  const opts = [...(it && !AUDITOR_STATUSES.includes(it.status) && it.status !== "In Progress" ? [it.status] : []), ...AUDITOR_STATUSES, "In Progress"];
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{it ? <><span className="font-mono text-primary">{refOf(it)}</span><span className="truncate">{it.kind === "policy" ? `${it.docType}: ${it.checkpoint}` : it.subArea || it.area}</span><StatusBadge s={it.status} /></> : "Loading…"}</DialogTitle>
          {it && <DialogDescription>{it.kind === "policy" ? "Policy & procedure register" : it.area}{it.ownerName ? ` · owner ${it.ownerName}` : ""}{it.spocName ? ` · SPOC ${it.spocName}` : ""}</DialogDescription>}</DialogHeader>
        {it && <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {it.kind === "checklist" && <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-[10px] border bg-muted/30 p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Checkpoint</div><div className="text-sm whitespace-pre-line">{it.checkpoint}</div></div>
            <div className="rounded-[10px] border bg-muted/30 p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Evidence required</div><div className="text-sm whitespace-pre-line">{it.evidenceRequired || "—"}</div></div>
          </div>}
          <div className="rounded-[10px] border p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Management reply</div><div className="text-sm whitespace-pre-line">{it.managementReply || <span className="text-muted-foreground">—</span>}</div></div>
          <div><div className="text-sm font-semibold mb-1.5 flex items-center gap-1.5"><Paperclip className="w-4 h-4" />Evidence ({it.documents.length})</div>
            <div className="divide-y rounded-[10px] border">{it.documents.map((d: any) => (
              <div key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm"><FileText className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0"><div className="truncate font-medium">{d.title}</div><div className="text-[11px] text-muted-foreground truncate">{d.category} · {d.fileName} · v{d.version} · {fmtSize(d.fileSize)}{d.approvedBy ? ` · approved by ${d.approvedBy}${d.approvedOn ? " on " + fmtDate(d.approvedOn) : ""}` : ""}</div></div>
                {d.fileId && <a href={afile(d.fileId)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="h-7 gap-1"><Eye className="w-3.5 h-3.5" />View</Button></a>}
                {d.fileId && audit.canDownload && <a href={afile(d.fileId, true)}><Button size="icon" variant="ghost" className="h-7 w-7"><Download className="w-3.5 h-3.5" /></Button></a>}
              </div>))}
              {!it.documents.length && <div className="px-3 py-3 text-xs text-muted-foreground">No evidence attached.</div>}</div></div>
          <div className="grid md:grid-cols-3 gap-3 rounded-[10px] border border-primary/30 bg-accent/30 p-3">
            <div><Label>Your review status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{opts.map(s => <SelectItem key={s} value={s}>{s === "In Progress" ? "Request information" : s === "Submitted" ? "Submitted (to review)" : s}</SelectItem>)}</SelectContent></Select>
              {status === "In Progress" && status !== it.status && <div className="text-[11px] text-amber-700 mt-1">Say what is needed in the comment below</div>}</div>
            <div className="md:col-span-2"><Label>Auditor remarks</Label><Textarea rows={4} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder={"Walkthrough:\n\nEvidence:"} /></div>
          </div>
          <div><div className="text-sm font-semibold mb-1.5 flex items-center gap-1.5"><MessageSquare className="w-4 h-4" />Comments with the audit team</div>
            <div className="space-y-2">{it.comments.map((c: any) => <div key={c.id} className={cn("rounded-[10px] px-3 py-2 text-sm", c.system ? "bg-muted/40 text-muted-foreground text-xs" : c.isExternal ? "bg-amber-50 dark:bg-amber-500/10 border border-amber-500/30" : "bg-accent/50")}>
              <div className="text-[11px] text-muted-foreground mb-0.5">{c.author}{c.isExternal ? " (you / auditor)" : " (audit team)"} · {new Date(c.createdAt).toLocaleString("en-IN")}</div><div className="whitespace-pre-line">{c.body}</div></div>)}
              {!it.comments.length && <div className="text-xs text-muted-foreground">No comments yet.</div>}
              <Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Comment or question for the audit team (sent with Save)…" /></div></div>
        </div>}
        <div className="flex items-center gap-2 pt-3 border-t">
          <Button onClick={() => save()} disabled={busy || !dirty} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Save</Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">{pos >= 0 && <span>{pos + 1} of {order.length}</span>}
            <Button size="sm" variant="outline" disabled={busy || pos <= 0} onClick={() => save(order[pos - 1])}><ChevronLeft className="w-4 h-4" />Previous</Button>
            <Button size="sm" variant="outline" disabled={busy || pos < 0 || pos >= order.length - 1} onClick={() => save(order[pos + 1])}>{dirty ? "Save & next" : "Next"}<ChevronRight className="w-4 h-4" /></Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Schedules({ auditId, canDownload }: { auditId: number; canDownload: boolean }) {
  const { data: grids = [], isLoading } = useQuery<any[]>({ queryKey: ["auditor-grids", auditId], queryFn: () => apiFetch(`/auditor-audits/${auditId}/grids`) });
  const [open, setOpen] = useState<any>(null);
  return (
    <Card><CardContent className="p-3 space-y-2">
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="divide-y rounded-[10px] border">{grids.map(g => (
        <button key={g.id} type="button" onClick={() => setOpen(g)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40"><Table2 className="w-4 h-4 text-primary" /><div className="flex-1"><div className="font-medium text-sm">{g.sheet}</div><div className="text-xs text-muted-foreground">{g.grid.length} rows{g.documents.length ? ` · ${g.documents.length} file(s)` : ""} · updated {fmtDate(g.updatedAt)}</div></div></button>))}
        {!isLoading && !grids.length && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No schedules shared yet.</div>}</div>
      {open && <Dialog open onOpenChange={o => { if (!o) setOpen(null); }}><DialogContent className="max-w-[95vw] w-[1200px] max-h-[92vh] flex flex-col">
        <DialogHeader><DialogTitle>{open.sheet}</DialogTitle><DialogDescription>Read-only.</DialogDescription></DialogHeader>
        <div className="flex-1 overflow-auto rounded-[10px] border"><table className="text-xs border-collapse"><tbody>{open.grid.map((row: string[], r: number) => <tr key={r}>{row.map((c, ci) => <td key={ci} className={cn("border px-2 py-1 min-w-[120px] max-w-[320px] whitespace-pre-line align-top", open.templateGrid[r]?.[ci] && "bg-muted/60 font-medium")}>{c}</td>)}</tr>)}</tbody></table></div>
        {!!open.documents.length && <div className="divide-y rounded-[10px] border">{open.documents.map((d: any) => <div key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm"><FileText className="w-4 h-4 text-primary" /><div className="flex-1 truncate">{d.title} <span className="text-[11px] text-muted-foreground">{d.fileName} v{d.version}</span></div>
          {d.fileId && <a href={afile(d.fileId)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="h-7 gap-1"><Eye className="w-3.5 h-3.5" />View</Button></a>}{d.fileId && canDownload && <a href={afile(d.fileId, true)}><Button size="icon" variant="ghost" className="h-7 w-7"><Download className="w-3.5 h-3.5" /></Button></a>}</div>)}</div>}
      </DialogContent></Dialog>}
    </CardContent></Card>
  );
}
