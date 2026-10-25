import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";
import { MasterField } from "@/components/master-field";
import {
  UserPlus, Undo2, Wrench, Server, Archive, Trash2, AlertOctagon, PackageCheck, Loader2, Search,
  ArrowRightLeft, Activity, PencilLine, ScanLine, ShieldCheck, MessageSquare, FileCheck2, ArrowRight, MapPin, Lock, Download,
} from "lucide-react";

/* ─── Lifecycle model (served by the API so the rules live in one place) ─── */

export type LifecycleModel = {
  states: string[];
  transitions: Record<string, string[]>;
  actions: Record<string, string>;
  disposalMethods: string[];
  conditions: string[];
  allocationTypes: string[];
};

export function useLifecycleModel() {
  return useQuery({ queryKey: ["asset-lifecycle-model"], queryFn: () => apiFetch<LifecycleModel>("/asset-lifecycle/model"), staleTime: Infinity });
}

export const STATUS_STYLE: Record<string, string> = {
  "In Stock": "border-blue-500/30 text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-400/10",
  "Allocated": "border-emerald-500/30 text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-400/10",
  "In Use": "border-teal-500/30 text-teal-700 bg-teal-50 dark:text-teal-300 dark:bg-teal-400/10",
  "Under Maintenance": "border-amber-500/30 text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-400/10",
  "Retired": "border-slate-400/30 text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-400/10",
  "Lost / Stolen": "border-red-500/30 text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-400/10",
  "Disposed": "border-zinc-400/30 text-zinc-500 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-400/10",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11.5px] font-semibold whitespace-nowrap", STATUS_STYLE[status] || "border-border text-muted-foreground")}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />{status}
    </span>
  );
}

export function AckPill({ status }: { status?: string | null }) {
  const ok = status === "Acknowledged";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold",
      ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300")}>
      {ok ? "Acknowledged" : "Ack pending"}
    </span>
  );
}

/* ─── Which buttons an asset gets ─────────────────────────────────────────── */

type ActionKey = "issue" | "return" | "deploy" | "repair" | "repairDone" | "repairBack" | "retire" | "dispose" | "lost" | "found" | "restock";
const ACTION_META: Record<ActionKey, { label: string; icon: React.ElementType; to?: string; danger?: boolean }> = {
  issue: { label: "Issue to employee", icon: UserPlus, to: "Allocated" },
  return: { label: "Return", icon: Undo2 },
  deploy: { label: "Deploy (shared / infra)", icon: Server, to: "In Use" },
  repair: { label: "Send for repair", icon: Wrench, to: "Under Maintenance" },
  repairDone: { label: "Repair done — back to store", icon: PackageCheck, to: "In Stock" },
  repairBack: { label: "Repair done — back to employee", icon: PackageCheck, to: "Allocated" },
  retire: { label: "Retire", icon: Archive, to: "Retired" },
  dispose: { label: "Dispose", icon: Trash2, to: "Disposed", danger: true },
  lost: { label: "Report lost / stolen", icon: AlertOctagon, to: "Lost / Stolen", danger: true },
  found: { label: "Mark found — back to store", icon: PackageCheck, to: "In Stock" },
  restock: { label: "Back to store", icon: PackageCheck, to: "In Stock" },
};

export function availableActions(asset: any, model?: LifecycleModel): ActionKey[] {
  if (!model || !asset) return [];
  const st = asset.status as string;
  const holder = !!asset.ownerName && (st === "Allocated" || st === "Under Maintenance");
  if (st === "Allocated") return ["return", "lost"];
  if (st === "Under Maintenance" && holder) return ["repairBack", "return", "lost"];
  const nexts = model.transitions[st] || [];
  const out: ActionKey[] = [];
  for (const to of nexts) {
    if (to === "Allocated") out.push("issue");
    else if (to === "In Use") out.push("deploy");
    else if (to === "Under Maintenance") out.push("repair");
    else if (to === "Retired") out.push("retire");
    else if (to === "Disposed") out.push("dispose");
    else if (to === "Lost / Stolen") out.push("lost");
    else if (to === "In Stock") out.push(st === "Under Maintenance" ? "repairDone" : st === "Lost / Stolen" ? "found" : "restock");
  }
  return out;
}

export function LifecycleButtons({ asset, onDone, size = "sm" }: { asset: any; onDone?: () => void; size?: "sm" | "default" }) {
  const { data: model } = useLifecycleModel();
  const [open, setOpen] = useState<ActionKey | null>(null);
  const actions = availableActions(asset, model);
  if (!actions.length) return <p className="text-xs text-muted-foreground">No further lifecycle actions — this asset is {asset.status.toLowerCase()}.</p>;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map(k => {
          const m = ACTION_META[k]; const Icon = m.icon;
          return (
            <Button key={k} size={size} variant={k === "issue" ? "default" : "outline"} onClick={() => setOpen(k)}
              className={cn("gap-1.5", m.danger && "text-red-600 border-red-500/30 hover:text-red-700")}>
              <Icon className="w-4 h-4" />{m.label}
            </Button>
          );
        })}
      </div>
      {open === "issue" && <IssueDialog assets={[asset]} onClose={() => setOpen(null)} onDone={onDone} />}
      {open === "return" && <ReturnDialog asset={asset} onClose={() => setOpen(null)} onDone={onDone} />}
      {open && open !== "issue" && open !== "return" && <TransitionDialog asset={asset} action={open} onClose={() => setOpen(null)} onDone={onDone} />}
    </>
  );
}

function useInvalidateAssets() {
  const qc = useQueryClient();
  return () => ["assets", "assets-stats", "asset-transactions", "asset-handovers", "asset-holders", "asset-holder-assets", "my-assets", "maintenance-records"]
    .forEach(k => qc.invalidateQueries({ queryKey: [k] }));
}

const field = "text-xs font-medium";

/* ─── Employee picker (system users, or free text for contractors) ────────── */

type Person = { id: number; name: string; email?: string; employeeCode: string; userType: "internal" | "external"; department?: string; designation?: string };

/** Internal / External tag — from User Master */
export function HolderTag({ type, className }: { type?: string | null; className?: string }) {
  if (!type) return null;
  const ext = type === "external";
  return <span className={cn("inline-flex px-1.5 py-[1px] rounded-full text-[10px] font-semibold uppercase tracking-wide border", ext ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-400/10 dark:text-purple-300 dark:border-purple-400/30" : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-400/10 dark:text-blue-300 dark:border-blue-400/30", className)}>{ext ? "External" : "Internal"}</span>;
}

/**
 * Pick the holder from User Master. Shown as "login email – EMP CODE" with an Internal / External tag; the backend
 * links the asset by Employee Code. People without an employee code are listed but cannot be selected.
 */
export function EmployeePicker({ value, onChange }: { value: Person | null; onChange: (p: Person | null) => void }) {
  const { data: people = [] } = useQuery({ queryKey: ["asset-people"], queryFn: () => apiFetch<any[]>("/asset-people") });
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [kind, setKind] = useState<"all" | "internal" | "external">("all");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people.filter(p => (kind === "all" || p.userType === kind) && (!t || [p.name, p.email, p.employeeCode, p.department].some((v: string) => v?.toLowerCase().includes(t)))).slice(0, 30);
  }, [people, q, kind]);
  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-[10px] border px-3 py-2 bg-accent/40">
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-foreground truncate flex items-center gap-2">{value.email} – <span className="font-mono">{value.employeeCode}</span><HolderTag type={value.userType} /></div>
          <div className="text-xs text-muted-foreground truncate">{[value.name, value.designation, value.department].filter(Boolean).join(" · ")}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name, login email or employee code…" value={q}
          onChange={e => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} />
        {focus && (
          <div className="absolute z-50 mt-1 w-full rounded-[10px] border bg-popover shadow-lg max-h-72 overflow-y-auto">
            <div className="flex gap-1 p-1.5 border-b sticky top-0 bg-popover">
              {(["all", "internal", "external"] as const).map(k => (
                <button key={k} type="button" onMouseDown={e => { e.preventDefault(); setKind(k); }}
                  className={cn("px-2 py-0.5 rounded-full text-[11px] border", kind === k ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground")}>{k === "all" ? "All" : k === "internal" ? "Internal" : "External"}</button>
              ))}
            </div>
            {list.map(p => (
              <button key={p.id} type="button" disabled={!p.selectable} title={p.selectable ? "" : "No employee code in User Master"}
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                onMouseDown={() => p.selectable && onChange({ id: p.id, name: p.name, email: p.email, employeeCode: p.employeeCode, userType: p.userType, department: p.department, designation: p.designation })}>
                <div className="font-medium text-foreground flex items-center gap-2 flex-wrap">
                  <span>{p.email} – <span className="font-mono">{p.employeeCode || "no emp code"}</span></span><HolderTag type={p.userType} />
                </div>
                <div className="text-xs text-muted-foreground">{[p.name, p.designation, p.department].filter(Boolean).join(" · ")}{!p.selectable && " — add an employee code in User Master to select"}</div>
              </button>
            ))}
            {!list.length && <div className="px-3 py-3 text-xs text-muted-foreground">No one matches. Add the person (internal or external) in Admin › User Master first.</div>}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">People come from User Master. External associates are added there as External users.</p>
    </div>
  );
}

/* ─── Issue dialog (single or bulk) ──────────────────────────────────────── */

export function IssueDialog({ assets, onClose, onDone }: { assets: any[]; onClose: () => void; onDone?: () => void }) {
  const { data: model } = useLifecycleModel();
  const { data: depts = [] } = useQuery({ queryKey: ["dept-masters"], queryFn: () => apiFetch<any[]>("/masters?category=department&active=true") });
  const { toast } = useToast();
  const invalidate = useInvalidateAssets();
  const [person, setPerson] = useState<Person | null>(null);
  const [f, setF] = useState<any>({ allocationType: "Permanent", condition: "Good", startDate: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const temp = f.allocationType && f.allocationType !== "Permanent";
  const deptLabel = (k?: string) => (k && depts.find((d: any) => d.key === k)?.label) || k || "";

  async function submit() {
    if (!person) { toast({ title: "Select the employee", variant: "destructive" }); return; }
    if (temp && !f.expectedReturnDate) { toast({ title: "Expected return date is required for temporary / loaner issues", variant: "destructive" }); return; }
    const body = {
      userId: person.id, employeeCode: person.employeeCode,   // the server takes name / email / type from User Master
      department: f.department || deptLabel(person.department) || null, location: f.location,
      allocationType: f.allocationType, expectedReturnDate: temp ? f.expectedReturnDate : null, condition: f.condition,
      accessories: f.accessories, startDate: f.startDate, notes: f.notes,
    };
    const what = assets.length === 1 ? `${assets[0].assetTag} — ${assets[0].name}` : `${assets.length} assets`;
    if (!await confirmDialog(`Issue ${what} to ${person.name} (${person.employeeCode}, ${person.userType === "external" ? "External" : "Internal"})?\n\nA handover note will be created and the employee will be asked to acknowledge it.`, { title: "Issue asset", confirmText: "Issue" })) return;
    setBusy(true);
    try {
      const r: any = assets.length === 1
        ? await apiFetch(`/assets/${assets[0].id}/issue`, { method: "POST", body: JSON.stringify(body) })
        : await apiFetch(`/assets/bulk-issue`, { method: "POST", body: JSON.stringify({ ...body, assetIds: assets.map(a => a.id) }) });
      invalidate();
      const nos = r.handoverNo ? [r.handoverNo] : (r.handovers || []).map((h: any) => h.handoverNo);
      toast({ title: "Asset issued", description: `Handover ${nos.join(", ")}` });
      onDone?.(); onClose();
      const hs = await apiFetch<any[]>("/asset-handovers");
      const mine = hs.filter(h => nos.includes(h.handoverNo));
      if (mine.length && await confirmDialog("Print the handover note for signature now?", { title: "Handover note", confirmText: "Print" })) printHandoverNote(mine);
    } catch (e: any) { toast({ title: "Could not issue", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Issue {assets.length === 1 ? "asset" : `${assets.length} assets`}</DialogTitle>
          <DialogDescription>{assets.map(a => a.assetTag).join(", ")}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="col-span-2"><Label className={field}>Employee *</Label><EmployeePicker value={person} onChange={setPerson} /></div>
          <div>
            <Label className={field}>Department</Label>
            <Select value={f.department || deptLabel(person?.department)} onValueChange={v => set("department", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{depts.map((d: any) => <SelectItem key={d.key} value={d.label}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className={field}>Location</Label><MasterField category="asset_location" value={f.location ?? assets[0]?.location} onChange={v => set("location", v)} placeholder="Select location" /></div>
          <div>
            <Label className={field}>Allocation type *</Label>
            <Select value={f.allocationType} onValueChange={v => set("allocationType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(model?.allocationTypes || []).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className={field}>Issue date *</Label><Input type="date" value={f.startDate} onChange={e => set("startDate", e.target.value)} /></div>
          {temp && <div><Label className={field}>Expected return date *</Label><Input type="date" value={f.expectedReturnDate || ""} onChange={e => set("expectedReturnDate", e.target.value)} /></div>}
          <div>
            <Label className={field}>Condition at issue *</Label>
            <Select value={f.condition} onValueChange={v => set("condition", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(model?.conditions || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label className={field}>Accessories handed over</Label><Input value={f.accessories || ""} onChange={e => set("accessories", e.target.value)} placeholder="e.g. Charger, laptop bag, mouse, docking station" /></div>
          <div className="col-span-2"><Label className={field}>Remarks</Label><Textarea rows={2} value={f.notes || ""} onChange={e => set("notes", e.target.value)} /></div>
        </div>
        <div className="flex justify-start gap-2 pt-3 border-t">
          <Button onClick={submit} disabled={busy} className="gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}Issue</Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Return dialog ──────────────────────────────────────────────────────── */

export function ReturnDialog({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone?: () => void }) {
  const { data: model } = useLifecycleModel();
  const { toast } = useToast();
  const invalidate = useInvalidateAssets();
  const [f, setF] = useState<any>({ nextStatus: "In Stock", returnDate: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  async function submit() {
    if (!f.condition) { toast({ title: "Select the condition the asset was returned in", variant: "destructive" }); return; }
    if (!await confirmDialog(`Receive ${asset.assetTag} back from ${asset.ownerName}?\n\nThe asset will move to "${f.nextStatus}" and the handover will be closed.`, { title: "Return asset", confirmText: "Receive" })) return;
    setBusy(true);
    try {
      await apiFetch(`/assets/${asset.id}/return`, { method: "POST", body: JSON.stringify(f) });
      invalidate(); toast({ title: "Asset returned", description: `${asset.assetTag} → ${f.nextStatus}` }); onDone?.(); onClose();
    } catch (e: any) { toast({ title: "Could not return", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Return {asset.assetTag}</DialogTitle>
          <DialogDescription>From {asset.ownerName}{asset.ownerEmployeeCode ? ` (${asset.ownerEmployeeCode})` : ""}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div><Label className={field}>Return date *</Label><Input type="date" value={f.returnDate} onChange={e => set("returnDate", e.target.value)} /></div>
          <div>
            <Label className={field}>Condition *</Label>
            <Select value={f.condition || ""} onValueChange={v => set("condition", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{(model?.conditions || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className={field}>Move asset to *</Label>
            <Select value={f.nextStatus} onValueChange={v => set("nextStatus", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["In Stock", "Under Maintenance", "Retired"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label className={field}>Accessories received</Label><Input value={f.accessoriesReturned || ""} onChange={e => set("accessoriesReturned", e.target.value)} placeholder="List what came back — note anything missing in remarks" /></div>
          <div className="col-span-2"><Label className={field}>Store location</Label><Input value={f.location || ""} onChange={e => set("location", e.target.value)} placeholder={asset.location || "IT store"} /></div>
          <div className="col-span-2"><Label className={field}>Remarks</Label><Textarea rows={2} value={f.remarks || ""} onChange={e => set("remarks", e.target.value)} placeholder="Damage, missing items, data wiped, etc." /></div>
        </div>
        <div className="flex justify-start gap-2 pt-3 border-t">
          <Button onClick={submit} disabled={busy} className="gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}Receive asset</Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Other transitions ─────────────────────────────────────────────────── */

function TransitionDialog({ asset, action, onClose, onDone }: { asset: any; action: ActionKey; onClose: () => void; onDone?: () => void }) {
  const { data: model } = useLifecycleModel();
  const { toast } = useToast();
  const invalidate = useInvalidateAssets();
  const meta = ACTION_META[action];
  const to = meta.to!;
  const [f, setF] = useState<any>({ disposalDate: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const needsReason = ["Under Maintenance", "Retired", "Lost / Stolen"].includes(to);

  async function submit() {
    if (needsReason && !f.reason?.trim()) { toast({ title: "Reason is required", variant: "destructive" }); return; }
    if (to === "In Use" && !f.location?.trim() && !asset.location) { toast({ title: "Location is required", variant: "destructive" }); return; }
    if (to === "Disposed" && (!f.disposalMethod || !f.disposalReference?.trim())) { toast({ title: "Disposal method and certificate / reference are required", variant: "destructive" }); return; }
    const irreversible = to === "Disposed";
    if (!await confirmDialog(`${meta.label}: ${asset.assetTag} — ${asset.name}?\n\n${asset.status} → ${to}${irreversible ? "\n\nDisposal is final; the asset cannot be brought back." : ""}`,
      { title: meta.label, confirmText: meta.label.split(" — ")[0], destructive: !!meta.danger })) return;
    setBusy(true);
    try {
      await apiFetch(`/assets/${asset.id}/transition`, { method: "POST", body: JSON.stringify({ ...f, toStatus: to }) });
      invalidate(); toast({ title: "Status updated", description: `${asset.assetTag}: ${asset.status} → ${to}` }); onDone?.(); onClose();
    } catch (e: any) { toast({ title: "Could not update", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{meta.label}</DialogTitle>
          <DialogDescription>{asset.assetTag} — {asset.name} · {asset.status} → {to}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {to === "In Use" && <div className="col-span-2"><Label className={field}>Deployed at (location / rack) *</Label><Input value={f.location || ""} onChange={e => set("location", e.target.value)} placeholder={asset.location || "e.g. Mumbai DC – Rack A3"} /></div>}
          {to === "Under Maintenance" && <>
            <div><Label className={field}>Repair vendor</Label><Input value={f.vendor || ""} onChange={e => set("vendor", e.target.value)} placeholder={asset.vendorName || ""} /></div>
            <div><Label className={field}>Ticket / RMA no.</Label><Input value={f.reference || ""} onChange={e => set("reference", e.target.value)} /></div>
          </>}
          {to === "Lost / Stolen" && <div className="col-span-2"><Label className={field}>Police complaint / FIR no.</Label><Input value={f.reference || ""} onChange={e => set("reference", e.target.value)} /></div>}
          {to === "Disposed" && <>
            <div>
              <Label className={field}>Disposal method *</Label>
              <Select value={f.disposalMethod || ""} onValueChange={v => set("disposalMethod", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(model?.disposalMethods || []).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className={field}>Disposal date *</Label><Input type="date" value={f.disposalDate} onChange={e => set("disposalDate", e.target.value)} /></div>
            <div><Label className={field}>Certificate / reference no. *</Label><Input value={f.disposalReference || ""} onChange={e => set("disposalReference", e.target.value)} placeholder="e.g. e-waste certificate no." /></div>
            <div><Label className={field}>Value realised (₹)</Label><Input type="number" min="0" value={f.disposalValue || ""} onChange={e => set("disposalValue", e.target.value)} /></div>
          </>}
          <div className="col-span-2"><Label className={field}>{needsReason ? "Reason *" : "Remarks"}</Label><Textarea rows={2} value={f.reason || ""} onChange={e => set("reason", e.target.value)} /></div>
          {(to === "Disposed" || to === "Lost / Stolen") && <DisposalValuePanel assetId={asset.id} date={to === "Disposed" ? f.disposalDate : new Date().toISOString().slice(0, 10)} value={to === "Disposed" ? f.disposalValue : "0"} writeOff={to === "Lost / Stolen"} />}
        </div>
        <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-2 flex justify-start gap-2 border-t bg-background px-6 py-3 sm:rounded-b-lg">
          <Button onClick={submit} disabled={busy} className={cn("gap-2", meta.danger && "bg-red-600 hover:bg-red-700")}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{meta.label.split(" — ")[0]}</Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Book value on the disposal date and the profit / loss against the value realised (from the depreciation schedule). */
function DisposalValuePanel({ assetId, date, value, writeOff }: { assetId: number; date: string; value: string; writeOff: boolean }) {
  const v = value && Number(value) >= 0 ? Number(value) : 0;
  const { data, isFetching, error } = useQuery({ queryKey: ["asset-disposal-preview", assetId, date, v], queryFn: () => apiFetch<any>(`/asset-depreciation/asset/${assetId}?on=${date}&value=${v}`), enabled: !!date, retry: false });
  const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  if (error) return null;
  const locked = data?.lock && date && date <= data.lock.lockDate;
  return (
    <div className="col-span-2 rounded-[10px] border bg-muted/30 p-3 text-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{writeOff ? "Write-off (finance)" : "Profit / loss on disposal"}{isFetching && " …"}</div>
      {locked && <div className="text-red-600 text-xs font-semibold mb-1">{date} is in {data.lock.label}, which is closed — use a later date.</div>}
      {data?.missing ? <div className="text-amber-700 dark:text-amber-300 text-xs">Cost / purchase date missing ({data.missing.join(", ")}) — the profit / loss cannot be calculated. Fill them in via Depreciation › Update purchase & cost.</div>
        : data && <div className="grid grid-cols-3 gap-2">
          <div><div className="text-[11px] text-muted-foreground">Book value on {date}</div><div className="font-semibold tabular-nums">{inr(data.bookValue)}</div><div className="text-[10px] text-muted-foreground">cost {inr(data.input?.cost)} − dep {inr(data.accumulated)}</div></div>
          <div><div className="text-[11px] text-muted-foreground">{writeOff ? "Recovered" : "Value realised"}</div><div className="font-semibold tabular-nums">{inr(v)}</div></div>
          <div><div className="text-[11px] text-muted-foreground">{(data.disposal?.gainLoss ?? 0) >= 0 ? "Profit" : "Loss"}</div><div className={cn("font-bold tabular-nums", (data.disposal?.gainLoss ?? 0) >= 0 ? "text-emerald-600" : "text-red-600")}>{inr(Math.abs(data.disposal?.gainLoss ?? 0))}</div></div>
        </div>}
    </div>
  );
}

/* ─── Acknowledge (IT records the signed copy) ──────────────────────────── */

export async function markAcknowledged(h: any, toast: ReturnType<typeof useToast>["toast"], after?: () => void) {
  if (!await confirmDialog(`Record that ${h.userName} has signed handover ${h.handoverNo}?`, { title: "Signed copy received", confirmText: "Mark acknowledged" })) return;
  try {
    await apiFetch(`/asset-allocations/${h.id}/acknowledge`, { method: "POST", body: JSON.stringify({ method: "Signed copy received" }) });
    toast({ title: "Handover acknowledged", description: h.handoverNo }); after?.();
  } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
}

/* ─── Printable handover / return note ───────────────────────────────────── */

const esc = (v: any) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export async function printHandoverNote(handovers: any[], kind: "issue" | "return" = "issue") {
  if (!handovers.length) return;
  let cfg: any = {};
  try { cfg = await apiFetch("/config"); } catch { /* use defaults */ }
  const h = handovers[0];
  const isReturn = kind === "return";
  const rows = handovers.map((x, i) => `<tr><td>${i + 1}</td><td><b>${esc(x.assetTag)}</b></td><td>${esc(x.assetName)}<div class="m">${esc(x.assetType)}${x.configuration ? " · " + esc(x.configuration) : ""}</div></td><td>${esc(x.serialNumber)}</td>
    <td>${esc(isReturn ? x.returnCondition : x.issueCondition)}</td><td>${esc(isReturn ? x.returnAccessories : x.accessories) || "—"}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${isReturn ? "Asset Return Note" : "Asset Handover Note"} ${esc(h.handoverNo)}</title>
<style>body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#3A4756;margin:32px;font-size:12.5px}h1{color:#0F2A4A;font-size:20px;margin:0}
.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2D7FF9;padding-bottom:12px;margin-bottom:16px}.hd img{height:44px}
.m{color:#8592A0;font-size:11px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:12px 0 18px}.grid b{color:#0F2A4A}
table{width:100%;border-collapse:collapse;margin:8px 0 18px}th{background:#F1F4F8;color:#5E6B7A;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;text-align:left;padding:8px}
td{padding:8px;border-bottom:1px solid #EBEFF4;vertical-align:top}ol{padding-left:18px;line-height:1.6}.sig{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:48px}
.sig>div{border-top:1px solid #3A4756;padding-top:6px}@media print{body{margin:14mm}}</style></head><body>
<div class="hd"><div><h1>${isReturn ? "Asset Return Note" : "Asset Handover Note"}</h1><div class="m">${esc(cfg.appName || "IT Asset Management")} · ${esc(cfg.appTagline || "")}</div></div>
<div style="text-align:right">${cfg.logoUrl ? `<img src="${esc(cfg.logoUrl)}">` : ""}<div><b>${esc(h.handoverNo)}</b></div><div class="m">${isReturn ? "Returned " + fmt(h.endDate || h.returnedAt) : "Issued " + fmt(h.startDate)}</div></div></div>
<div class="grid"><div>Employee: <b>${esc(h.userName)}</b></div><div>Employee code: <b>${esc(h.employeeCode) || "—"}</b></div>
<div>Email: <b>${esc(h.email) || "—"}</b></div><div>Designation: <b>${esc(h.designation) || "—"}</b></div>
<div>Department: <b>${esc(h.department) || "—"}</b></div><div>Location: <b>${esc(h.location) || "—"}</b></div>
<div>Allocation type: <b>${esc(h.allocationType)}</b></div><div>${h.expectedReturnDate ? `Expected return: <b>${fmt(h.expectedReturnDate)}</b>` : ""}</div></div>
<table><thead><tr><th>#</th><th>Asset tag</th><th>Asset</th><th>Serial no.</th><th>Condition</th><th>Accessories</th></tr></thead><tbody>${rows}</tbody></table>
${isReturn ? `<p><b>Remarks:</b> ${esc(h.returnRemarks) || "—"}</p>` : `<b>Terms of use</b><ol>
<li>The asset is company property, issued for official use only, and remains in my custody until returned to IT.</li>
<li>I will not install unauthorised software, remove security controls or lend the asset to anyone.</li>
<li>I will report loss, theft or damage to IT immediately; loss due to negligence may be recovered as per company policy.</li>
<li>I will return the asset with all accessories on exit, transfer or when asked by IT. Clearance is subject to its return.</li>
<li>Company data on the asset is confidential and subject to the Information Security and Acceptable Use policies.</li></ol>`}
<div class="sig"><div>${isReturn ? "Returned by (employee)" : "Received by (employee)"}<div class="m">${esc(h.userName)} · Date:</div></div>
<div>${isReturn ? "Received by (IT)" : "Issued by (IT)"}<div class="m">${esc(isReturn ? h.receivedBy : h.issuedBy) || ""} · Date:</div></div></div>
<script>window.onload=()=>{window.print()}</script></body></html>`;
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}


/* ─── History & comments trail ───────────────────────────────────────────── */

const who = (u?: string | null) => (u || "System").replace(/\s*<[^>]+>$/, "");

/* History categories — each entry is placed in one, with its own icon and colour */
type Cat = "movement" | "status" | "edit" | "audit" | "coverage" | "comment" | "ack";
function catOf(t: any): Cat {
  const a = String(t.action || "");
  if (a === "Comment") return "comment";
  if (a === "Acknowledged") return "ack";
  if (a.startsWith("Audit")) return "audit";
  if (a === "Contract" || a === "License") return "coverage";
  if (a === "Issued" || a === "Returned" || a === "Returned to Store" || (Array.isArray(t.changes) && t.changes.some((c: any) => c.field === "holder" || c.field === "location"))) return "movement";
  if (a === "Registered" || a === "Imported" || a === "Updated") return "edit";
  return "status";
}
const CAT: Record<Cat, { label: string; icon: any; cls: string }> = {
  movement: { label: "Movement", icon: ArrowRightLeft, cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30" },
  status:   { label: "Status",   icon: Activity,       cls: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30" },
  edit:     { label: "Change",   icon: PencilLine,     cls: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/30" },
  audit:    { label: "Audit",    icon: ScanLine,       cls: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/30" },
  coverage: { label: "Contract / license", icon: ShieldCheck, cls: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/30" },
  comment:  { label: "Comment",  icon: MessageSquare,  cls: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/30" },
  ack:      { label: "Acknowledgement", icon: FileCheck2, cls: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/30" },
};
const FILTERS: { key: "all" | Cat | "changes"; label: string }[] = [
  { key: "all", label: "All" }, { key: "movement", label: "Movements" }, { key: "status", label: "Status" }, { key: "changes", label: "Field changes" },
  { key: "audit", label: "Audit" }, { key: "coverage", label: "Contracts / licenses" }, { key: "comment", label: "Comments" },
];
const dayLabel = (d: Date) => {
  const t = new Date(); t.setHours(0, 0, 0, 0); const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((t.getTime() - x.getTime()) / 86400000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Asset history — read-only, newest first. Every edit, movement (holder / location), status change, audit result,
 * contract / license change and comment is listed with who and when. Entries can't be edited or deleted
 * (enforced in the database); comments are added as new entries.
 */
export function AssetTrail({ assetId, assetTag }: { assetId: number; assetTag: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["asset-transactions", assetId], queryFn: () => apiFetch<any[]>(`/asset-transactions?assetId=${assetId}`) });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/asset-comments/${assetId}`, { method: "POST", body: JSON.stringify({ comment: text.trim() }) });
      setText(""); qc.invalidateQueries({ queryKey: ["asset-transactions", assetId] });
    } catch (e: any) { toast({ title: "Could not add comment", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  const sorted = useMemo(() => [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id), [rows]);
  const counts = useMemo(() => { const c: Record<string, number> = { all: sorted.length, changes: sorted.filter(t => t.changes?.length).length }; for (const t of sorted) c[catOf(t)] = (c[catOf(t)] || 0) + 1; return c; }, [sorted]);
  const list = sorted.filter(t => filter === "all" || (filter === "changes" ? t.changes?.length > 0 : catOf(t) === filter));
  const groups: { day: string; items: any[] }[] = [];
  for (const t of list) { const d = dayLabel(new Date(t.createdAt)); if (!groups.length || groups[groups.length - 1].day !== d) groups.push({ day: d, items: [] }); groups[groups.length - 1].items.push(t); }
  const holders = sorted.filter(t => catOf(t) === "movement" && t.action === "Issued").length;

  function exportCsv() {
    const e = (v: any) => { const x = String(v ?? "").replace(/"/g, '""'); return /[,"\n]/.test(x) ? `"${x}"` : x; };
    const lines = [["When", "Action", "Type", "By", "Status from", "Status to", "Field", "From", "To", "Comment", "Details"].join(",")];
    for (const t of sorted) {
      const base = [new Date(t.createdAt).toLocaleString("en-IN"), t.action, CAT[catOf(t)].label, who(t.userName), t.oldStatus, t.newStatus];
      const ch = Array.isArray(t.changes) && t.changes.length ? t.changes : [null];
      for (const c of ch) lines.push([...base, c?.label, c?.from, c?.to, t.comment, t.notes].map(e).join(","));
    }
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" })), download: `${assetTag}_history.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-[10px] bg-muted/50 px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground"><Lock className="w-3.5 h-3.5" />Read-only history · {sorted.length} entries · {holders} handover{holders === 1 ? "" : "s"}{sorted.length ? ` · since ${new Date(sorted[sorted.length - 1].createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}</span>
        <button className="text-primary font-medium flex items-center gap-1" onClick={exportCsv}><Download className="w-3.5 h-3.5" />Export</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.filter(f => f.key === "all" || counts[f.key]).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={cn("px-2.5 py-1 rounded-full text-[11.5px] border transition-colors", filter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:text-foreground")}>
            {f.label} <span className="opacity-70">{counts[f.key] || 0}</span>
          </button>
        ))}
      </div>
      {isLoading && <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && !list.length && <div className="py-6 text-center text-sm text-muted-foreground">Nothing recorded{filter !== "all" ? " in this view" : " yet"}.</div>}
      <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3">
        {groups.map(g => (
          <div key={g.day}>
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.day}</div>
            {g.items.map((t, i) => {
              const c = CAT[catOf(t)]; const Icon = c.icon;
              const moves = (t.changes || []).filter((x: any) => x.field === "holder" || x.field === "location");
              const fields = (t.changes || []).filter((x: any) => x.field !== "holder" && x.field !== "location");
              return (
                <div key={t.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn("w-7 h-7 rounded-full grid place-items-center ring-1 shrink-0", c.cls)}><Icon className="w-3.5 h-3.5" /></div>
                    {i < g.items.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
                  </div>
                  <div className="pb-3 flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{t.action}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{new Date(t.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{c.label} · by {who(t.userName)}</div>
                    {(t.oldStatus || t.newStatus) && t.oldStatus !== t.newStatus && (
                      <div className="flex items-center gap-1.5 mt-1.5">{t.oldStatus && <StatusPill status={t.oldStatus} />}{t.oldStatus && t.newStatus && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}{t.newStatus && <StatusPill status={t.newStatus} />}</div>
                    )}
                    {moves.map((m: any) => (
                      <div key={m.field} className="mt-1.5 flex items-center gap-2 flex-wrap rounded-[8px] border border-emerald-200 dark:border-emerald-400/30 bg-emerald-50/50 dark:bg-emerald-400/5 px-2.5 py-1.5 text-xs">
                        {m.field === "holder" ? <UserPlus className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" /> : <MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />}
                        <span className="text-muted-foreground">{m.label}</span>
                        <span className="text-foreground">{m.from || "—"}</span><ArrowRight className="w-3 h-3 text-muted-foreground" /><span className="font-semibold text-foreground">{m.to || "—"}</span>
                      </div>
                    ))}
                    {fields.length > 0 && (
                      <div className="mt-1.5 rounded-[8px] border overflow-hidden text-xs">
                        <div className="grid grid-cols-[120px_1fr_1fr] gap-2 px-2.5 py-1 bg-muted/60 text-[10.5px] uppercase tracking-wide text-muted-foreground"><span>Field</span><span>Before</span><span>After</span></div>
                        {fields.map((x: any) => (
                          <div key={x.field} className="grid grid-cols-[120px_1fr_1fr] gap-2 px-2.5 py-1 border-t">
                            <span className="text-muted-foreground">{x.label}</span>
                            <span className="break-words text-red-700/80 dark:text-red-400/80 line-through decoration-red-300">{x.from ?? "—"}</span>
                            <span className="break-words text-emerald-700 dark:text-emerald-400 font-medium">{x.to ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {t.comment && <div className="mt-1.5 rounded-[8px] bg-accent/60 border-l-2 border-primary px-2.5 py-1.5 text-sm text-foreground whitespace-pre-line">{t.comment}</div>}
                    {t.notes && <div className="text-[11.5px] text-muted-foreground mt-1">{t.notes}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="rounded-[10px] border p-2.5 space-y-2">
        <Textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder={`Add a comment to ${assetTag}'s history — e.g. physical check done, user reported an issue, PO reference…`} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">Comments become part of the history and can't be edited later.</span>
          <Button size="sm" onClick={add} disabled={busy || !text.trim()}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Add comment</Button>
        </div>
      </div>
    </div>
  );
}
