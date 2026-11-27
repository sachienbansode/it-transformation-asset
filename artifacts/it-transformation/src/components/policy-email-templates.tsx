import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Mail, Eye, Send, Save, Loader2, ChevronDown, ChevronRight } from "lucide-react";

/* 2.08 (ITH-189) — Policy Register › Email templates: on / off, subject and HTML per policy email; preview and test. */
function Tpl({ t, fields, canEdit }: { t: any; fields: string[]; canEdit: boolean }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [open, setOpen] = useState(false); const [d, setD] = useState<any>(t); const [busy, setBusy] = useState<string | null>(null); const [prev, setPrev] = useState<any>(null);
  useEffect(() => setD(t), [t]);
  const dirty = d.enabled !== t.enabled || d.subject !== t.subject || d.body !== t.body;
  const draft = () => ({ enabled: d.enabled, subject: d.subject, body: d.body });
  const call = async (k: string, fn: () => Promise<void>) => { setBusy(k); try { await fn(); } catch (e: any) { toast({ title: "Not done", description: e.message, variant: "destructive" }); } finally { setBusy(null); } };
  return (
    <div className={cn("rounded-[10px] border p-3 space-y-3", !d.enabled && "opacity-70")} data-testid={`pet-${t.key}`}>
      <div className="flex items-start gap-3">
        <button type="button" className="flex-1 text-left" onClick={() => setOpen(o => !o)}>
          <div className="text-sm font-semibold flex items-center gap-1.5">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}<Mail className="w-4 h-4 text-primary" />{t.label}</div>
          <div className="text-xs text-muted-foreground ml-[38px]">{t.description}{t.updatedBy ? ` · last changed by ${String(t.updatedBy).replace(/ <.*>$/, "")}` : ""}</div>
        </button>
        <label className="flex items-center gap-2 text-xs"><Switch checked={!!d.enabled} disabled={!canEdit} onCheckedChange={v => setD({ ...d, enabled: v })} />{d.enabled ? "On" : "Off"}</label>
      </div>
      {open && <div className="space-y-3 border-t pt-3">
        <div className="space-y-1"><div className="text-xs font-medium">Subject</div><Input className="h-8" disabled={!canEdit} value={d.subject} onChange={e => setD({ ...d, subject: e.target.value })} /></div>
        <div className="space-y-1"><div className="text-xs font-medium">Email text (HTML)</div><Textarea rows={7} disabled={!canEdit} className="font-mono text-xs" value={d.body} onChange={e => setD({ ...d, body: e.target.value })} data-testid="pet-body" />
          <div className="text-[11px] text-muted-foreground">Fields: {fields.map(f => <code key={f} className="mr-1.5">{`{{${f}}}`}</code>)} — a link written as <code>{'<a href="{{link}}">Open …</a>'}</code> becomes a button.</div></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => call("prev", async () => setPrev(await apiFetch(`/policy-email-templates/${t.key}/preview`, { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ draft: draft() }) })))}>{busy === "prev" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}Preview</Button>
          {canEdit && <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => call("test", async () => { const r: any = await apiFetch(`/policy-email-templates/${t.key}/test`, { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ draft: draft() }) }); toast({ title: r.ok ? `Test sent to ${r.to}` : "Test not sent", description: r.ok ? "Subject starts with [TEST]" : r.error || r.status, variant: r.ok ? undefined : "destructive" }); })}>{busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send test to me</Button>}
          {canEdit && <Button size="sm" className="gap-1.5 ml-auto" disabled={!dirty || !!busy} onClick={() => call("save", async () => { const r: any = await apiFetch(`/policy-email-templates/${t.key}`, { method: "PUT", headers: { "X-No-Confirm": "1" }, body: JSON.stringify(draft()) }); toast({ title: "Saved", description: r.changes?.join(", ") }); qc.invalidateQueries({ queryKey: ["policy-email-templates"] }); })} data-testid="pet-save">{busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save</Button>}
        </div>
        {prev && <div className="rounded-md border p-3 space-y-2 bg-muted/20"><div className="text-xs text-muted-foreground">Example for {prev.policy}</div><div className="text-sm font-medium">Subject: {prev.subject}</div><div className="rounded border bg-white text-black p-3 text-sm" dangerouslySetInnerHTML={{ __html: prev.html }} /></div>}
      </div>}
      {!open && dirty && <div className="text-[11px] text-amber-700">Unsaved changes — open to save.</div>}
    </div>
  );
}
export function PolicyEmailTemplates({ open, onClose, canEdit }: { open: boolean; onClose: () => void; canEdit: boolean }) {
  const { data } = useQuery<any>({ queryKey: ["policy-email-templates"], queryFn: () => apiFetch("/policy-email-templates"), enabled: open });
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto" data-testid="policy-email-templates">
        <DialogHeader><DialogTitle>Policy email templates</DialogTitle>
          <DialogDescription>Emails go only to the people a policy applies to who still have to act; each person gets their own email. A policy's “Notify” setting decides whether it is emailed at all. Changes are in the audit trail.</DialogDescription></DialogHeader>
        <div className="space-y-2">{(data?.templates || []).map((t: any) => <Tpl key={t.key} t={t} fields={data.fields} canEdit={canEdit} />)}</div>
      </DialogContent>
    </Dialog>
  );
}
