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
import { UserPlus, Loader2, Copy, Mail, ShieldOff, ShieldCheck, Pencil, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, d10 } from "@/components/compliance-shared";

/* Audit › Auditors & access log: invite external auditors (audit-scoped, time-bound), revoke, and see every access. */

const ACTION_LABEL: Record<string, string> = { invite: "Invited", resend_invite: "Invitation resent", access_change: "Access changed", revoke: "Access revoked", login: "Signed in", login_failed: "Sign-in failed", login_refused: "Sign-in refused",
  otp_failed: "Wrong code", password_set: "Password set", view: "Viewed file", download: "Downloaded file", file_refused: "File refused" };

export function AuditorsTab({ audit, canEdit }: { audit: any; canEdit: boolean }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: list = [], isLoading } = useQuery<any[]>({ queryKey: ["compliance-auditors", audit.id], queryFn: () => apiFetch(`/compliance-audits/${audit.id}/auditors`) });
  const { data: logRows = [] } = useQuery<any[]>({ queryKey: ["compliance-access-log", audit.id], queryFn: () => apiFetch(`/compliance-audits/${audit.id}/access-log`) });
  const [invite, setInvite] = useState<any>(null); const [link, setLink] = useState<string | null>(null);
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
        <div className="flex items-center justify-between gap-3"><div className="font-semibold text-sm">External auditors</div>
          {canEdit && <Button size="sm" className="gap-1.5" onClick={() => setInvite({ email: "", name: "", firm: audit.auditFirm || "", validUntil: d10(audit.targetDate) || "", canDownload: false })}><UserPlus className="w-4 h-4" />Invite auditor</Button>}</div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />Auditors sign in at <span className="font-mono">/auditor/login</span> with their password and a code emailed each time. They see only checkpoints and schedules you have shared, the current version of the linked evidence, and comments sent to them. Access ends automatically on the end date.</div>
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
                {x.isActive ? <Button size="icon" variant="ghost" className="h-7 w-7" title="Revoke access now" onClick={async () => { if (await confirmDialog(`Revoke ${x.name}'s access to ${audit.auditNo} now? Any open session stops working immediately.`, { title: "Revoke access", confirmText: "Revoke", destructive: true })) patch(x, { isActive: false }, "Access revoked"); }}><ShieldOff className="w-3.5 h-3.5 text-red-500" /></Button>
                  : <Button size="icon" variant="ghost" className="h-7 w-7" title="Restore access" onClick={() => patch(x, { isActive: true }, "Access restored")}><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /></Button>}
              </div>}
            </div>))}
          {!isLoading && !list.length && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No auditors invited yet.</div>}
        </div>
      </CardContent></Card>
      <Card className="lg:col-span-2"><CardContent className="p-0">
        <div className="px-4 py-3 font-semibold text-sm border-b">Access log <span className="text-xs font-normal text-muted-foreground">(latest 500)</span></div>
        <div className="max-h-[520px] overflow-y-auto divide-y">
          {logRows.map(r => (
            <div key={r.id} className="px-4 py-2 text-xs">
              <div className="flex justify-between gap-2"><span className={cn("font-medium", /failed|refused|revoke/.test(r.action) && "text-red-600")}>{ACTION_LABEL[r.action] || r.action}</span><span className="text-muted-foreground whitespace-nowrap">{new Date(r.at).toLocaleString("en-IN")}</span></div>
              <div className="text-muted-foreground truncate">{r.userName || "—"}{r.userType === "external" ? " (auditor)" : ""}{r.documentTitle ? ` · ${r.documentTitle}` : ""}{r.detail && !r.documentTitle ? ` · ${r.detail}` : ""}{r.ip ? ` · ${r.ip}` : ""}</div>
            </div>))}
          {!logRows.length && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing yet.</div>}
        </div>
      </CardContent></Card>
      {invite && <InviteDialog audit={audit} init={invite} onClose={() => setInvite(null)} onDone={(l) => { refresh(); if (l) setLink(l); }} />}
      {link && <LinkDialog link={link} onClose={() => setLink(null)} />}
    </div>
  );
}

function InviteDialog({ audit, init, onClose, onDone }: { audit: any; init: any; onClose: () => void; onDone: (link?: string) => void }) {
  const { toast } = useToast(); const [f, setF] = useState<any>(init); const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function save() {
    setBusy(true);
    try {
      if (f.edit) { await apiFetch(`/compliance-auditor-access/${f.id}`, { method: "PATCH", body: JSON.stringify({ validUntil: f.validUntil, canDownload: !!f.canDownload, firm: f.firm || null }) }); toast({ title: "Access updated" }); onDone(); }
      else { const r = await apiFetch<any>(`/compliance-audits/${audit.id}/auditors`, { method: "POST", body: JSON.stringify({ email: f.email, name: f.name, firm: f.firm || null, validUntil: f.validUntil, canDownload: !!f.canDownload }) }); toast({ title: "Invitation sent", description: `${f.email} gets an email to set a password` }); onDone(r.setupLink); }
      onClose();
    } catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>{f.edit ? `Edit access — ${f.name}` : "Invite auditor"}</DialogTitle><DialogDescription>Access to {audit.auditNo} only, read-only, until the end date.</DialogDescription></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 gap-3">
          {!f.edit && <><div className="col-span-2"><Label>Email *</Label><Input type="email" value={f.email} onChange={e => set("email", e.target.value)} placeholder="auditor@firm.com" /></div>
            <div className="col-span-2"><Label>Name *</Label><Input value={f.name} onChange={e => set("name", e.target.value)} /></div></>}
          <div className="col-span-2"><Label>Audit firm</Label><Input value={f.firm ?? ""} onChange={e => set("firm", e.target.value)} /></div>
          <div><Label>Access until *</Label><Input type="date" value={f.validUntil} onChange={e => set("validUntil", e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={!!f.canDownload} onChange={e => set("canDownload", e.target.checked)} />Allow downloads</label>
          <div className="col-span-2 text-[11px] text-muted-foreground">Without downloads the auditor can only open files in the browser. Every view and download is logged.</div>
        </div>
        <div className="flex gap-2 pt-3 border-t"><Button onClick={save} disabled={busy || !f.validUntil || (!f.edit && (!/^\S+@\S+\.\S+$/.test(f.email) || (f.name || "").trim().length < 2))} className="gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{f.edit ? "Save" : "Send invitation"}</Button><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button></div>
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
