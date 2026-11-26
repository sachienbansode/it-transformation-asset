import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Mail, Eye, Send, Save, Loader2, ChevronDown, ChevronRight } from "lucide-react";

/* r101 (ITH-164) — ITSM Setup › Email alerts: for every ticket event, who receives the email and what it says. */
const WHO: [string, string][] = [["to_requester", "Person who raised it"], ["to_assignee", "Assigned person"], ["to_team", "Whole team"], ["to_lead", "Team lead"],
  ["to_escalation1", "Escalation level 1"], ["to_escalation2", "Escalation level 2"], ["to_admins", "Super Admins"]];
const FIELDS = ["no", "title", "type", "priority", "status", "team", "assignee", "requester", "category", "expectedClosure", "resolution", "reason", "slaLeft", "link", "details"];

function RuleCard({ rule, canEdit }: { rule: any; canEdit: boolean }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [open, setOpen] = useState(false); const [d, setD] = useState<any>(rule); const [busy, setBusy] = useState<string | null>(null);
  const [prev, setPrev] = useState<any>(null); const [ticketNo, setTicketNo] = useState("");
  useEffect(() => setD(rule), [rule]);
  const dirty = JSON.stringify(d) !== JSON.stringify(rule);
  const body = () => ({ enabled: d.enabled, ...Object.fromEntries(WHO.map(([k]) => [k, !!d[k]])), skip_actor: d.skip_actor, extra: d.extra || "", subject: d.subject, body: d.body });
  async function save() {
    setBusy("save");
    try { const r = await apiFetch<any>(`/itsm-email-rules/${rule.event_key}`, { method: "PUT", headers: { "X-No-Confirm": "1" }, body: JSON.stringify(body()) }); toast({ title: "Email alert saved", description: r.changes?.slice(0, 3).join("; ") || "No change" }); qc.invalidateQueries({ queryKey: ["itsm-email-rules"] }); }
    catch (e: any) { toast({ title: "Not saved", description: e.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  async function preview() {
    setBusy("prev");
    try { setPrev(await apiFetch(`/itsm-email-rules/${rule.event_key}/preview`, { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ ticketNo, draft: body() }) })); }
    catch (e: any) { toast({ title: "No preview", description: e.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  async function test() {
    setBusy("test");
    try { const r = await apiFetch<any>(`/itsm-email-rules/${rule.event_key}/test`, { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ draft: body() }) });
      toast({ title: r.ok ? `Test email sent to ${r.to}` : "Test email not sent", description: r.ok ? "Only you received it (subject starts with [TEST])." : (r.error || r.status), variant: r.ok ? undefined : "destructive" }); }
    catch (e: any) { toast({ title: "Test failed", description: e.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  const who = WHO.filter(([k]) => d[k]).map(([, l]) => l);
  return (
    <Card data-testid={`rule-${rule.event_key}`} className={cn(!d.enabled && "opacity-70")}><CardContent className="p-4 space-y-3">
      <div className="flex items-start gap-3 flex-wrap">
        <button type="button" className="flex-1 min-w-[260px] text-left" onClick={() => setOpen(o => !o)}>
          <div className="font-semibold text-sm flex items-center gap-1.5">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}<Mail className="w-4 h-4 text-primary" />{rule.label}</div>
          <div className="text-xs text-muted-foreground ml-[38px]">{rule.description} · To: <b>{who.length ? who.join(", ") : "nobody"}</b>{d.extra ? ` + ${d.extra}` : ""}</div>
        </button>
        <label className="flex items-center gap-2 text-xs"><Switch checked={!!d.enabled} disabled={!canEdit} onCheckedChange={v => setD({ ...d, enabled: v })} data-testid="rule-enabled" />{d.enabled ? "On" : "Off"}</label>
      </div>
      {open && <div className="space-y-3 border-t pt-3">
        <div><div className="text-xs font-medium mb-1.5">Who receives it</div>
          <div className="flex flex-wrap gap-1.5">{WHO.map(([k, l]) => <button key={k} type="button" disabled={!canEdit} onClick={() => setD({ ...d, [k]: !d[k] })} data-testid={`who-${k}`}
            className={d[k] ? "rounded-full border border-primary bg-primary/10 text-primary px-3 py-1 text-xs font-medium" : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"}>{d[k] ? "✓ " : ""}{l}</button>)}</div>
          <div className="grid md:grid-cols-[1fr_auto] gap-3 mt-2 items-end">
            <div className="space-y-1"><div className="text-xs">Always copy (other addresses, comma separated)</div><Input className="h-8" disabled={!canEdit} value={d.extra || ""} onChange={e => setD({ ...d, extra: e.target.value })} placeholder="it.manager@company.com" /></div>
            <label className="flex items-center gap-2 text-xs pb-1.5"><Switch checked={d.skip_actor !== false} disabled={!canEdit} onCheckedChange={v => setD({ ...d, skip_actor: v })} />Don't email the person who made the change</label>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Escalation levels and the team lead are set per team in Teams &amp; members. Each person gets their own email — nobody sees the other addresses.</p></div>
        <div className="space-y-1"><div className="text-xs font-medium">Subject</div><Input className="h-8" disabled={!canEdit} value={d.subject} onChange={e => setD({ ...d, subject: e.target.value })} data-testid="rule-subject" /></div>
        <div className="space-y-1"><div className="text-xs font-medium">Email text (HTML allowed)</div><Textarea rows={6} disabled={!canEdit} className="font-mono text-xs" value={d.body} onChange={e => setD({ ...d, body: e.target.value })} />
          <div className="text-[11px] text-muted-foreground">Fields: {FIELDS.map(f => <code key={f} className="mr-1.5">{`{{${f}}}`}</code>)} — <code>{"{{details}}"}</code> adds the ticket summary table.</div></div>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-8 w-44" placeholder="Ticket no. (optional)" value={ticketNo} onChange={e => setTicketNo(e.target.value)} />
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={preview} data-testid="rule-preview">{busy === "prev" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}Preview &amp; recipients</Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={test}>{busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send test to me</Button>
          {canEdit && <Button size="sm" className="gap-1.5 ml-auto" disabled={!dirty || !!busy} onClick={save} data-testid="rule-save">{busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save</Button>}
        </div>
        {prev && <div className="rounded-md border p-3 space-y-2 bg-muted/20" data-testid="rule-preview-box">
          <div className="text-xs"><b>For ticket {prev.ticket}</b> — would go to: {prev.recipients.length ? prev.recipients.map((r: any) => <span key={r.email} className="inline-block mr-2">{r.email} <span className="text-muted-foreground">({r.why})</span></span>) : <span className="text-amber-700">nobody (no matching person on this ticket / team)</span>}</div>
          <div className="text-sm font-medium">Subject: {prev.subject}</div>
          <div className="rounded border bg-white text-black p-3 text-sm" dangerouslySetInnerHTML={{ __html: prev.html }} />
        </div>}
      </div>}
      {!open && dirty && <div className="text-[11px] text-amber-700">Unsaved changes — open to save.</div>}
    </CardContent></Card>
  );
}

export function ItsmEmailAlerts() {
  const { canAccess } = useAuth(); const canEdit = canAccess("itsm_setup", "write");
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ["itsm-email-rules"], queryFn: () => apiFetch("/itsm-email-rules") });
  return (
    <div className="space-y-3" data-testid="itsm-email-alerts">
      <Card><CardContent className="p-4 text-sm text-muted-foreground">Emails go only to the people ticked for each event, through the delivery set in Admin › Email, Alerts &amp; Archive. Open an alert to change who receives it, edit the template, preview it for a real ticket, or send a test to yourself. Every change is in the audit trail.</CardContent></Card>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : data.map(r => <RuleCard key={r.event_key} rule={r} canEdit={canEdit} />)}
    </div>
  );
}
