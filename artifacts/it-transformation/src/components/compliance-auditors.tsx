import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { UserPlus, Loader2, Copy, Mail, ShieldOff, ShieldCheck, Pencil, Info, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, d10, Pager } from "@/components/compliance-shared";

/* Audit › Auditors & access log: invite external auditors (audit-scoped, time-bound), revoke, and see every access. */

const ACTION_LABEL: Record<string, string> = { invite: "Invited", resend_invite: "Invitation resent", access_change: "Access changed", revoke: "Access revoked", login: "Signed in", login_failed: "Sign-in failed", login_refused: "Sign-in refused",
  otp_failed: "Wrong code", password_set: "Password set", view: "Viewed file", download: "Downloaded file", file_refused: "File refused" };

export function AuditorsTab({ audit, canEdit }: { audit: any; canEdit: boolean }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: list = [], isLoading } = useQuery<any[]>({ queryKey: ["compliance-auditors", audit.id], queryFn: () => apiFetch(`/compliance-audits/${audit.id}/auditors`) });
  const { data: logRows = [] } = useQuery<any[]>({ queryKey: ["compliance-access-log", audit.id], queryFn: () => apiFetch(`/compliance-audits/${audit.id}/access-log`) });
  const [invite, setInvite] = useState<any>(null); const [link, setLink] = useState<string | null>(null); const [lp, setLp] = useState(0);
  const refresh = () => ["compliance-auditors", "compliance-access-log"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  async function patch(x: any, body: any, msg: string) {
    try { await apiFetch(`/compliance-auditor-access/${x.id}`, { method: "PATCH", body: JSON.stringify(body) }); refresh(); toast({ title: msg }); } catch (e: any) { toast({ title: "Could not update", description: e.message, variant: "destructive" }); }
  }
  async function resend(x: any) {
    try { const r = await apiFetch<any>(`/compliance-auditor-access/${x.id}/resend`, { method: "POST", body: "{}" }); setLink(r.setupLink); refresh(); } catch (e: any) { toast({ title: "Could not resend", description: e.message, variant: "destructive" }); }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3"><CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap"><div className="font-semibold text-sm">External auditors <span className="text-xs font-normal text-muted-foreground">· {list.filter(x => x.live).length} active of {list.length}</span></div>
          {canEdit && list.some(x => x.isActive) && <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-red-600 ml-auto" onClick={async () => { const act = list.filter(x => x.isActive); if (!(await confirmDialog(`Revoke access for all ${act.length} auditor(s) on ${audit.auditNo}? Open sessions stop at once.`, { title: "Revoke all", confirmText: "Revoke all", destructive: true }))) return; for (const x of act) await apiFetch(`/compliance-auditor-access/${x.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) }).catch(() => {}); refresh(); toast({ title: `${act.length} access(es) revoked` }); }}><ShieldOff className="w-3.5 h-3.5" />Revoke all</Button>}
          {canEdit && <Button size="sm" className="gap-1.5" onClick={() => setInvite({ people: [{ email: "", name: "" }], firm: audit.auditFirm || "", validUntil: d10(audit.targetDate) || "", canDownload: false })}><UserPlus className="w-4 h-4" />Invite auditors</Button>}</div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />Only invited auditors with active access can sign in, at <span className="font-mono">/auditor/login</span>: password plus a one-time code emailed at every sign-in (MFA, always on). Revoking access ends any open session at once. They see only checkpoints and schedules you have shared, the current version of the linked evidence, and comments sent to them. Access ends automatically on the end date.</div>
        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        <div className="divide-y rounded-[10px] border">
          {list.map(x => (
            <div key={x.id} className={cn("px-3 py-2.5 flex flex-wrap items-center gap-3", !x.live && "opacity-60")}>
              <div className="flex-1 min-w-[200px]"><div className="font-medium text-sm">{x.name} <span className="text-muted-foreground font-normal">· {x.email}</span></div>
                <div className="text-xs text-muted-foreground">{x.firm || "—"} · until {fmtDate(x.validUntil)} · {x.canDownload ? "can download" : "view only"} · {x.hasPassword ? (x.lastAccessAt ? `last active ${new Date(x.lastAccessAt).toLocaleString("en-IN")}` : "not signed in yet") : "invitation not accepted"}</div></div>
              <span className={cn("text-[11px] rounded-full px-2 py-0.5", x.live ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15")}>{x.live ? "Active" : x.isActive ? "Outside dates" : "Revoked"}</span>
              {canEdit && <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => setInvite({ ...x, validUntil: d10(x.validUntil), edit: true })}><Pencil className="w-3.5 h-3.5" /></Button>
                {x.isActive && <Button size="icon" variant="ghost" className="h-7 w-7" title="Resend invitation / reset password" onClick={() => resend(x)}><Mail className="w-3.5 h-3.5" /></Button>}
                {x.isActive ? <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10" title="Revoke access now" onClick={async () => { if (await confirmDialog(`Revoke ${x.name}'s access to ${audit.auditNo} now? Any open session stops working immediately.`, { title: "Revoke access", confirmText: "Revoke", destructive: true })) patch(x, { isActive: false }, "Access revoked"); }}><ShieldOff className="w-3.5 h-3.5" />Revoke</Button>
                  : <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-emerald-700" title="Restore access" onClick={() => patch(x, { isActive: true }, "Access restored")}><ShieldCheck className="w-3.5 h-3.5" />Restore</Button>}
              </div>}
            </div>))}
          {!isLoading && !list.length && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No auditors invited yet.</div>}
        </div>
      </CardContent></Card>
      <Card className="lg:col-span-2"><CardContent className="p-0">
        <div className="px-4 py-3 font-semibold text-sm border-b">Access log <span className="text-xs font-normal text-muted-foreground">(latest 500)</span></div>
        <div className="divide-y">
          {logRows.slice(lp * 10, lp * 10 + 10).map(r => (
            <div key={r.id} className="px-4 py-2 text-xs">
              <div className="flex justify-between gap-2"><span className={cn("font-medium", /failed|refused|revoke/.test(r.action) && "text-red-600")}>{ACTION_LABEL[r.action] || r.action}</span><span className="text-muted-foreground whitespace-nowrap">{new Date(r.at).toLocaleString("en-IN")}</span></div>
              <div className="text-muted-foreground truncate">{r.userName || "—"}{r.userType === "external" ? " (auditor)" : ""}{r.documentTitle ? ` · ${r.documentTitle}` : ""}{r.detail && !r.documentTitle ? ` · ${r.detail}` : ""}{r.ip ? ` · ${r.ip}` : ""}</div>
            </div>))}
          {!logRows.length && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing yet.</div>}
        </div>
        <div className="px-4 py-2 border-t"><Pager page={lp} total={logRows.length} size={10} onPage={setLp} /></div>
      </CardContent></Card>
      {invite && <InviteDialog audit={audit} init={invite} onClose={() => setInvite(null)} onDone={(l) => { refresh(); if (l) setLink(l); }} />}
      {link && <LinkDialog link={link} onClose={() => setLink(null)} />}
    </div>
  );
}

function InviteDialog({ audit, init, onClose, onDone }: { audit: any; init: any; onClose: () => void; onDone: (link?: string) => void }) {
  const { toast } = useToast(); const [f, setF] = useState<any>(init); const [busy, setBusy] = useState(false); const [result, setResult] = useState<{ email: string; ok: boolean; msg: string }[]>([]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const people: { email: string; name: string }[] = f.people || [];
  const setP = (i: number, k: string, v: string) => set("people", people.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const okRow = (p: { email: string; name: string }) => /^\S+@\S+\.\S+$/.test(p.email.trim()) && p.name.trim().length >= 2;
  const filled = people.filter(p => p.email.trim() || p.name.trim());
  const dupes = new Set(filled.map(p => p.email.trim().toLowerCase()).filter((e, i, a) => a.indexOf(e) !== i));
  const valid = filled.length > 0 && filled.every(okRow) && !dupes.size;
  // paste "Name <email>" or "email, name" lines into the first box to fill several rows at once
  function paste(text: string) {
    const rows = text.split(/[\n;]+/).map(l => l.trim()).filter(Boolean).map(l => { const em = l.match(/[^\s<>,;]+@[^\s<>,;]+/)?.[0] || ""; const nm = l.replace(em, "").replace(/[<>,"]/g, " ").replace(/\s+/g, " ").trim(); return { email: em, name: nm || (em.split("@")[0] || "").replace(/[._-]+/g, " ") }; }).filter(r => r.email);
    if (rows.length > 1) { set("people", [...people.filter(p => p.email.trim() || p.name.trim()), ...rows]); return true; }
    return false;
  }
  async function save() {
    setBusy(true);
    try {
      if (f.edit) { await apiFetch(`/compliance-auditor-access/${f.id}`, { method: "PATCH", body: JSON.stringify({ validUntil: f.validUntil, canDownload: !!f.canDownload, firm: f.firm || null }) }); toast({ title: "Access updated" }); onDone(); onClose(); return; }
      const out: { email: string; ok: boolean; msg: string }[] = []; let last: string | undefined;
      for (const p of filled) {
        try { const r = await apiFetch<any>(`/compliance-audits/${audit.id}/auditors`, { method: "POST", body: JSON.stringify({ email: p.email.trim(), name: p.name.trim(), firm: f.firm || null, validUntil: f.validUntil, canDownload: !!f.canDownload }) }); last = r.setupLink; out.push({ email: p.email, ok: true, msg: "invitation sent" }); }
        catch (e: any) { out.push({ email: p.email, ok: false, msg: e.message }); }
      }
      const okN = out.filter(x => x.ok).length;
      toast({ title: `${okN} of ${out.length} invitation(s) sent`, variant: okN === out.length ? undefined : "destructive" });
      onDone(out.length === 1 && okN === 1 ? last : undefined);
      if (okN === out.length) onClose(); else { setResult(out); set("people", filled.filter(p => !out.find(x => x.email === p.email && x.ok))); }
    } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>{f.edit ? `Edit access — ${f.name}` : "Invite auditors"}</DialogTitle><DialogDescription>Access to {audit.auditNo} only, read-only, until the end date. Each person gets their own email to set a password; every sign-in needs an emailed one-time code.</DialogDescription></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          {!f.edit && <div className="space-y-1.5">
            <div className="flex items-center justify-between"><Label>People *</Label><Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => set("people", [...people, { email: "", name: "" }])}><UserPlus className="w-3.5 h-3.5" />Add person</Button></div>
            {people.map((p, i) => (
              <div key={i} className="grid grid-cols-[1.2fr_1fr_auto] gap-2">
                <Input type="email" className={cn("h-9", p.email && (!/^\S+@\S+\.\S+$/.test(p.email.trim()) || dupes.has(p.email.trim().toLowerCase())) && "border-red-500")} value={p.email} placeholder="auditor@firm.com" onChange={e => setP(i, "email", e.target.value)} onPaste={e => { if (paste(e.clipboardData.getData("text"))) e.preventDefault(); }} />
                <Input className="h-9" value={p.name} placeholder="Full name" onChange={e => setP(i, "name", e.target.value)} />
                <Button type="button" size="icon" variant="ghost" className="h-9 w-9" disabled={people.length === 1} onClick={() => set("people", people.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
              </div>))}
            <div className="text-[11px] text-muted-foreground">Tip: paste a list of addresses (one per line, "Name &lt;email&gt;" or "email, Name") into an email box to add them all.{dupes.size ? <span className="text-red-600"> Duplicate email in the list.</span> : null}</div>
          </div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Audit firm</Label><Input value={f.firm ?? ""} onChange={e => set("firm", e.target.value)} /></div>
            <div><Label>Access until *</Label><Input type="date" value={f.validUntil} onChange={e => set("validUntil", e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={!!f.canDownload} onChange={e => set("canDownload", e.target.checked)} />Allow downloads</label>
            <div className="col-span-2 text-[11px] text-muted-foreground">Without downloads the auditor can only open files in the browser. Every view and download is logged.</div>
          </div>
          {result.some(r => !r.ok) && <div className="rounded-[8px] border border-red-200 bg-red-50 dark:bg-red-500/10 p-2 text-xs space-y-0.5">{result.filter(r => !r.ok).map(r => <div key={r.email}><b>{r.email}</b>: {r.msg}</div>)}</div>}
        </div>
        <div className="flex gap-2 pt-3 border-t"><Button onClick={save} disabled={busy || !f.validUntil || (!f.edit && !valid)} className="gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{f.edit ? "Save" : `Send ${filled.length > 1 ? filled.length + " invitations" : "invitation"}`}</Button><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({ link, onClose }: { link: string; onClose: () => void }) {
  const { toast } = useToast(); const full = link.startsWith("http") ? link : window.location.origin + link;
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Invitation link</DialogTitle><DialogDescription>Emailed to the auditor. If the email does not arrive, share this link with them securely. It works once and expires in 72 hours.</DialogDescription></DialogHeader>
        <div className="flex gap-2"><Input readOnly value={full} className="font-mono text-xs" /><Button variant="outline" className="gap-1.5" onClick={() => { navigator.clipboard?.writeText(full).then(() => toast({ title: "Copied" })).catch(() => {}); }}><Copy className="w-4 h-4" />Copy</Button></div>
        <div className="flex pt-2"><Button variant="outline" onClick={onClose}>Close</Button></div>
      </DialogContent>
    </Dialog>
  );
}
