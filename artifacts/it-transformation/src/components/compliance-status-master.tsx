import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { Plus, Pencil, Trash2, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, applyStatusRows, GROUP_LABEL, GROUP_ORDER, STATUS_COLORS, DOT, type StatusRow } from "@/components/compliance-shared";

/* Admin › Master Data › Audit & Compliance › Checkpoint Status — one list used by every audit screen and the auditor portal. */

const STAGE_LABEL = { team: "Team (internal)", auditor: "Auditor decision" };
export function ComplianceStatusMaster() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data, isLoading } = useQuery<{ statuses: StatusRow[]; autoShareOnSubmit: boolean }>({ queryKey: ["compliance-statuses"], queryFn: () => apiFetch("/compliance-statuses") });
  const [edit, setEdit] = useState<any>(null);
  const rows = data?.statuses || [];
  if (rows.length) applyStatusRows(rows);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["compliance-statuses"] }); qc.invalidateQueries({ queryKey: ["auditor-statuses"] }); };
  async function call(path: string, method: string, body?: any, msg?: string) {
    try { await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined }); refresh(); if (msg) toast({ title: msg }); return true; }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); return false; }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-sm font-semibold"><span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mr-1.5">Audit & Compliance /</span>Checkpoint Status <span className="text-muted-foreground font-normal ml-1">({rows.length} items)</span></h3>
          <p className="text-xs text-muted-foreground mt-0.5">One list for checkpoints, policies and schedules, the dashboards and the auditor portal. Each status sits in one dashboard bucket; "Closed / N.A." counts towards closure. Built-in statuses <Lock className="inline w-3 h-3" /> drive the workflow and keep their bucket.</p></div>
        <Button size="sm" onClick={() => setEdit({ name: "", stage: "team", grp: "inprog", color: "blue", sortOrder: (rows.at(-1)?.sortOrder ?? 80) + 10, isActive: true, description: "", isNew: true })}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
        <div><div className="text-sm font-medium">Share with the auditor automatically when Submitted</div><div className="text-xs text-muted-foreground">On (default): a checkpoint becomes visible to the auditor as soon as it is set to Submitted. Off: a second reviewer shares it (maker-checker).</div></div>
        <Switch checked={data?.autoShareOnSubmit ?? true} onCheckedChange={v => call("/compliance-config", "PUT", { autoShareOnSubmit: v }, v ? "Auto-share on" : "Auto-share off — reviewer shares manually")} />
      </div>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr>{["Status", "Set by", "Dashboard bucket", "Sort", "Active", ""].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground text-xs">Loading…</td></tr>}
            {rows.map(r => (
              <tr key={r.name} className={cn("border-t border-border hover:bg-muted/30", !r.isActive && "opacity-60")}>
                <td className="px-3 py-2"><div className="flex items-center gap-2"><StatusBadge s={r.name} />{r.isSystem && <Lock className="w-3 h-3 text-muted-foreground" />}</div>{r.description && <div className="text-[11px] text-muted-foreground mt-0.5">{r.description}</div>}</td>
                <td className="px-3 py-2 text-xs">{STAGE_LABEL[r.stage]}</td>
                <td className="px-3 py-2 text-xs">{GROUP_LABEL[r.grp]}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.sortOrder}</td>
                <td className="px-3 py-2 text-xs">{r.isActive ? <span className="text-green-600">Active</span> : <span className="text-red-500">Inactive</span>}</td>
                <td className="px-3 py-2"><div className="flex gap-1 justify-end">
                  {!(r.isSystem && ["Pending", "Submitted", "Under Review", "Closed"].includes(r.name)) && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => call(`/compliance-statuses/${encodeURIComponent(r.name)}`, "PATCH", { isActive: !r.isActive }, r.isActive ? "Deactivated" : "Reactivated")}>{r.isActive ? "Deactivate" : "Reactivate"}</Button>}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEdit({ ...r, description: r.description ?? "" })}><Pencil className="h-3 w-3" /></Button>
                  {!r.isSystem && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={async () => { if (await confirmDialog(`Remove status "${r.name}"? Only possible if nothing uses it.`, { title: "Remove status", confirmText: "Remove", destructive: true })) call(`/compliance-statuses/${encodeURIComponent(r.name)}`, "DELETE", undefined, "Removed"); }}><Trash2 className="h-3 w-3" /></Button>}
                </div></td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {edit && <EditDialog init={edit} onClose={() => setEdit(null)} onSave={async v => { const ok = v.isNew ? await call("/compliance-statuses", "POST", { name: v.name, stage: v.stage, grp: v.grp, color: v.color, sortOrder: Number(v.sortOrder), isActive: v.isActive, description: v.description || null }, "Status added")
        : await call(`/compliance-statuses/${encodeURIComponent(v.name)}`, "PATCH", { ...(v.isSystem ? {} : { stage: v.stage, grp: v.grp }), color: v.color, sortOrder: Number(v.sortOrder), description: v.description || null }, "Status updated"); if (ok) setEdit(null); }} />}
    </div>
  );
}

function EditDialog({ init, onClose, onSave }: { init: any; onClose: () => void; onSave: (v: any) => Promise<void> }) {
  const [f, setF] = useState<any>(init); const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const fixed = !!f.isSystem;
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{f.isNew ? "Add checkpoint status" : `Edit "${f.name}"`}</DialogTitle><DialogDescription>{fixed ? "Built-in status: colour, order and description can change." : "Who sets it decides where it appears: team screens or the auditor portal."}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name *</Label><Input disabled={!f.isNew} value={f.name} maxLength={40} onChange={e => set("name", e.target.value)} placeholder="e.g. Evidence Awaited" /></div>
          <div><Label>Set by</Label><Select disabled={fixed} value={f.stage} onValueChange={v => set("stage", v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="team">Team (internal)</SelectItem><SelectItem value="auditor">Auditor decision</SelectItem></SelectContent></Select></div>
          <div><Label>Dashboard bucket</Label><Select disabled={fixed} value={f.grp} onValueChange={v => set("grp", v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{GROUP_ORDER.map(g => <SelectItem key={g} value={g}>{GROUP_LABEL[g]}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Colour</Label><Select value={f.color} onValueChange={v => set("color", v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(STATUS_COLORS).map(c => <SelectItem key={c} value={c}><span className="inline-flex items-center gap-2"><span className={cn("w-2.5 h-2.5 rounded-full", DOT[c])} />{c}</span></SelectItem>)}</SelectContent></Select></div>
          <div><Label>Sort order</Label><Input type="number" value={f.sortOrder} onChange={e => set("sortOrder", e.target.value)} /></div>
          <div className="col-span-2"><Label>Description</Label><Input value={f.description ?? ""} maxLength={300} onChange={e => set("description", e.target.value)} /></div>
          <div className="col-span-2 text-xs"><span className="text-muted-foreground mr-2">Preview</span><span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_COLORS[f.color])}>{f.name || "Status"}</span></div>
        </div>
        <div className="flex gap-2 pt-2"><Button disabled={busy || f.name.trim().length < 2} onClick={async () => { setBusy(true); await onSave({ ...f, name: f.name.trim() }); setBusy(false); }} className="gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save</Button><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button></div>
      </DialogContent>
    </Dialog>
  );
}
