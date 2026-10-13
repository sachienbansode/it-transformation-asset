import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { ClipboardCheck, Plus, Loader2, MapPin, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

export const AUDIT_STATUS_STYLE: Record<string, string> = {
  Planned: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
  "In Progress": "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
  Completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  Cancelled: "bg-zinc-100 text-zinc-500 dark:bg-zinc-400/10 dark:text-zinc-400",
};
const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function AssetAudits() {
  const { data: audits = [], isLoading } = useQuery({ queryKey: ["asset-audits"], queryFn: () => apiFetch<any[]>("/asset-audits") });
  const { isAdmin } = useAuth();
  const [planOpen, setPlanOpen] = useState(false);
  const active = audits.filter(a => a.status === "In Progress" || a.status === "Planned");
  const past = audits.filter(a => a.status === "Completed" || a.status === "Cancelled");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Physical Audit</h1>
          <p className="text-sm text-muted-foreground">Plan a stock verification, scan QR stickers on the floor, and close it with a found / missing / mismatch report.</p>
        </div>
        {isAdmin && <Button className="gap-2" onClick={() => setPlanOpen(true)}><Plus className="w-4 h-4" />Plan audit</Button>}
      </div>

      {isLoading && <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && !audits.length && (
        <Card><CardContent className="py-14 text-center text-muted-foreground"><ClipboardCheck className="w-9 h-9 mx-auto mb-2 opacity-40" />No audits yet. Plan one for a location to start verifying assets.</CardContent></Card>
      )}

      {active.length > 0 && <section className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Open</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{active.map(a => <AuditCard key={a.id} a={a} />)}</div>
      </section>}
      {past.length > 0 && <section className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Closed</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{past.map(a => <AuditCard key={a.id} a={a} />)}</div>
      </section>}

      {planOpen && <PlanAudit onClose={() => setPlanOpen(false)} />}
    </div>
  );
}

function AuditCard({ a }: { a: any }) {
  const c = a.counts || {};
  const overdue = a.status !== "Completed" && a.status !== "Cancelled" && a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10);
  return (
    <Link href={`/asset-audits/${a.id}`}>
      <div className="rounded-[14px] border bg-card p-4 hover:shadow-md hover:-translate-y-px transition-all cursor-pointer space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><div className="font-mono text-xs text-primary font-semibold">{a.auditNo}</div><div className="font-semibold text-foreground truncate">{a.name}</div></div>
          <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap", AUDIT_STATUS_STYLE[a.status])}>{a.status}</span>
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{a.scopeLocations || "All locations"}</span>
          {a.dueDate && <span className={cn("inline-flex items-center gap-1", overdue && "text-red-600 font-semibold")}><CalendarClock className="w-3.5 h-3.5" />due {fmt(a.dueDate)}</span>}
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">{c.verified ?? 0} of {c.expected ?? 0} verified</span><span className="font-semibold text-foreground">{c.progress ?? 0}%</span></div>
          <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${c.progress ?? 0}%` }} /></div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {c["Location mismatch"] > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300 font-semibold">{c["Location mismatch"]} mismatch</span>}
          {c["Missing"] > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300 font-semibold">{c["Missing"]} missing</span>}
          {(c["Not in scope"] || 0) + (c["Unknown tag"] || 0) > 0 && <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{(c["Not in scope"] || 0) + (c["Unknown tag"] || 0)} extra</span>}
        </div>
      </div>
    </Link>
  );
}

function Chips({ options, value, onChange }: { options: { value: string; count: number }[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => toggle(o.value)}
          className={cn("px-2.5 py-1 rounded-full border text-xs transition-colors", value.includes(o.value) ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent text-foreground")}>
          {o.value} <span className={cn("ml-0.5", value.includes(o.value) ? "text-primary-foreground/80" : "text-muted-foreground")}>{o.count}</span>
        </button>
      ))}
      {!options.length && <span className="text-xs text-muted-foreground">None recorded</span>}
    </div>
  );
}

function PlanAudit({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: opt } = useQuery({ queryKey: ["asset-audit-options"], queryFn: () => apiFetch<any>("/asset-audits/options") });
  const [f, setF] = useState<any>({ name: "", locations: [], departments: [], types: [] });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  // rough count preview from option aggregates (exact count comes back from the server)
  const preview = useMemo(() => {
    if (!opt) return 0;
    const sum = (arr: any[], sel: string[]) => sel.length ? arr.filter((o: any) => sel.includes(o.value)).reduce((s: number, o: any) => s + o.count, 0) : arr.reduce((s: number, o: any) => s + o.count, 0);
    return Math.min(sum(opt.locations, f.locations), sum(opt.departments, f.departments) || Infinity, sum(opt.types, f.types) || Infinity);
  }, [opt, f]);

  async function submit() {
    if (!f.name.trim()) { toast({ title: "Give the audit a name", variant: "destructive" }); return; }
    const scope = [f.locations.length ? f.locations.join(", ") : "all locations", f.departments.length ? f.departments.join(", ") : null, f.types.length ? f.types.join(", ") : null].filter(Boolean).join(" · ");
    if (!await confirmDialog(`Plan audit "${f.name}" for ${scope}?\n\nThe list of assets expected in this scope is fixed now; assets added later will show as "not in scope" if scanned.`, { title: "Plan audit", confirmText: "Plan audit" })) return;
    setBusy(true);
    try {
      const r: any = await apiFetch("/asset-audits", { method: "POST", body: JSON.stringify(f) });
      qc.invalidateQueries({ queryKey: ["asset-audits"] });
      toast({ title: `Audit ${r.auditNo} planned`, description: `${r.expected} assets to verify` });
      onClose(); navigate(`/asset-audits/${r.id}`);
    } catch (e: any) { toast({ title: "Could not plan audit", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Plan a physical audit</DialogTitle>
          <DialogDescription>Choose what to verify. Leave a group empty to include everything.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label className="text-xs font-medium">Audit name *</Label><Input value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Q3 FY26 — Worli office verification" /></div>
            <div><Label className="text-xs font-medium">Due date</Label><Input type="date" value={f.dueDate || ""} onChange={e => set("dueDate", e.target.value)} /></div>
            <div><Label className="text-xs font-medium">Auditors</Label><Input value={f.auditors || ""} onChange={e => set("auditors", e.target.value)} placeholder="Names of the team doing the count" /></div>
          </div>
          <div><Label className="text-xs font-medium">Locations</Label><Chips options={opt?.locations || []} value={f.locations} onChange={v => set("locations", v)} /></div>
          <div><Label className="text-xs font-medium">Departments</Label><Chips options={opt?.departments || []} value={f.departments} onChange={v => set("departments", v)} /></div>
          <div><Label className="text-xs font-medium">Asset types</Label><Chips options={opt?.types || []} value={f.types} onChange={v => set("types", v)} /></div>
          <div><Label className="text-xs font-medium">Instructions for auditors</Label><Textarea rows={2} value={f.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="e.g. Check every desk and the IT store; note damage in remarks" /></div>
          <div className="rounded-[10px] bg-accent/60 px-3 py-2 text-sm text-foreground">About <b>{Number.isFinite(preview) ? preview : 0}</b> assets in this scope.</div>
        </div>
        <div className="flex justify-start gap-2 pt-3 border-t">
          <Button onClick={submit} disabled={busy} className="gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Plan audit</Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
