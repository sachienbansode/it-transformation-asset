import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/pagination";
import { StatCard } from "@/components/stat-card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { Pill, Tabs, inr, inrShort, fmtDate, daysText, downloadCsv, AssetPicker } from "@/components/asset-finance";
import { KeyRound, Plus, Search, Download, Edit, Trash2, Loader2, Users, Laptop, ShieldCheck, ShieldAlert, IndianRupee, Recycle, UserMinus, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE = 12;
const LICENSE_TYPES = ["Subscription", "Per User", "Per Device", "Concurrent", "Perpetual", "Volume", "OEM", "Site License", "Enterprise Agreement"];
const today = () => new Date().toISOString().slice(0, 10);
const refreshKeys = ["asset-licenses", "asset-license-compliance", "asset-license-assignments", "asset-dashboard", "asset-coverage"];

export default function AssetLicenses() {
  const initial = new URLSearchParams(window.location.search).get("tab");
  const [tab, setTab] = useState<"licenses" | "compliance">(initial === "compliance" ? "compliance" : "licenses");
  const { canAccess } = useAuth(); const isAdmin = canAccess("asset_licenses", "write");
  const [edit, setEdit] = useState<any>(null);
  const [view, setView] = useState<number | null>(null);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Software Licenses</h1>
          <p className="text-sm text-muted-foreground">Entitlements, seat assignments to users and devices, renewals, and compliance — shortfalls, idle seats and seats to reclaim.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Tabs tabs={[{ key: "licenses", label: "Licenses" }, { key: "compliance", label: "Compliance" }]} value={tab} onChange={setTab} />
          {isAdmin && <Button className="gap-2" onClick={() => setEdit({})}><Plus className="w-4 h-4" />Add license</Button>}
        </div>
      </div>
      {tab === "licenses" ? <LicenseList onOpen={setView} /> : <Compliance onOpen={setView} />}
      {edit && <LicenseForm initial={edit} onClose={() => setEdit(null)} onSaved={id => { setEdit(null); setView(id); }} />}
      {view !== null && <LicenseDetail id={view} onClose={() => setView(null)} onEdit={l => { setView(null); setEdit(l); }} />}
    </div>
  );
}

function SeatBar({ l }: { l: any }) {
  if (l.entitled === null) return <span className="text-xs text-muted-foreground">{l.consumed} in use · unlimited</span>;
  const pct = l.entitled ? Math.min(100, (l.consumed / l.entitled) * 100) : l.consumed ? 100 : 0;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="w-20 h-2 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", l.shortfall ? "bg-red-500" : pct >= 90 ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
      <span className={cn("text-xs tabular-nums", l.shortfall ? "text-red-600 font-semibold" : "text-muted-foreground")}>{l.consumed}/{l.entitled}</span>
    </div>
  );
}

function LicenseList({ onOpen }: { onOpen: (id: number) => void }) {
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["asset-licenses"], queryFn: () => apiFetch<any[]>("/asset-licenses") });
  const [f, setF] = useState<string>("all"); const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const counts: Record<string, number> = {
    all: rows.length, issues: rows.filter(r => r.compliance === "Under-licensed" || r.compliance === "Expired – in use").length,
    expiring: rows.filter(r => r.status === "Expiring Soon").length, expired: rows.filter(r => r.status === "Expired").length, idle: rows.filter(r => r.compliance === "Over-licensed").length,
  };
  const list = useMemo(() => {
    let l = rows;
    if (f === "issues") l = l.filter(r => r.compliance === "Under-licensed" || r.compliance === "Expired – in use");
    if (f === "expiring") l = l.filter(r => r.status === "Expiring Soon");
    if (f === "expired") l = l.filter(r => r.status === "Expired");
    if (f === "idle") l = l.filter(r => r.compliance === "Over-licensed");
    const t = q.trim().toLowerCase();
    if (t) l = l.filter(r => [r.productName, r.edition, r.vendorName, r.licenseKey, r.poNumber, r.ownerName].some((v: string) => v?.toLowerCase().includes(t)));
    return l;
  }, [rows, f, q]);
  const ent = rows.filter(r => r.entitled !== null);
  const seats = ent.reduce((t, r) => t + r.entitled, 0), used = ent.reduce((t, r) => t + Math.min(r.consumed, r.entitled), 0);
  const spend = rows.filter(r => r.status !== "Cancelled").reduce((t, r) => t + Number(r.renewalCost || r.cost || 0), 0);
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={KeyRound} label="Licenses" value={rows.length} sub={`${counts.expiring} expiring soon`} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Gauge} label="Seat utilisation" value={seats ? `${Math.round((used / seats) * 100)}%` : "—"} sub={`${used} of ${seats} seats`} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={ShieldAlert} label="Out of compliance" value={counts.issues} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" valueColor={counts.issues ? "text-red-600" : undefined} />
        <StatCard icon={IndianRupee} label="Licence spend (renewal)" value={inrShort(spend)} iconBg="bg-[#2D7FF9]/20" iconColor="text-[#2D7FF9]" borderColor="border-l-[#2D7FF9]" />
      </div>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs tabs={[{ key: "all", label: "All", count: counts.all }, { key: "issues", label: "Non-compliant", count: counts.issues }, { key: "expiring", label: "Expiring", count: counts.expiring }, { key: "expired", label: "Expired", count: counts.expired }, { key: "idle", label: "Idle seats", count: counts.idle }]}
              value={f} onChange={k => { setF(k); setPage(1); }} />
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search product, vendor, key, PO…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadCsv(list, [["Product", "productName"], ["Edition", "edition"], ["Vendor", "vendorName"], ["Type", "licenseType"], ["Entitled", (r: any) => r.entitled ?? "Unlimited"], ["In use", "consumed"], ["Available", "available"], ["Tracking", "tracking"], ["Start", "startDate"], ["Expiry", "expiryDate"], ["Status", "status"], ["Compliance", "compliance"], ["Cost (INR)", "cost"], ["Renewal (INR)", "renewalCost"], ["PO", "poNumber"], ["Owner", "ownerName"]], `licenses_${today()}.csv`)}><Download className="w-4 h-4" />Export</Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead>Seats</TableHead><TableHead>Expiry</TableHead><TableHead className="text-right">Cost</TableHead><TableHead>Compliance</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !list.length && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{rows.length ? "No licenses match." : "No licenses yet. Add your Microsoft 365, antivirus, Adobe and other subscriptions to track seats and renewals."}</TableCell></TableRow>}
              {list.slice((page - 1) * PAGE, page * PAGE).map(l => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => onOpen(l.id)}>
                  <TableCell><div className="font-medium text-foreground">{l.productName}{l.edition ? <span className="text-muted-foreground font-normal"> · {l.edition}</span> : null}</div><div className="text-xs text-muted-foreground">{l.vendorName || "—"}</div></TableCell>
                  <TableCell className="text-sm">{l.licenseType}<div className="text-[10px] text-muted-foreground">{l.tracking === "Assignments" ? "tracked by assignment" : "manual count"}</div></TableCell>
                  <TableCell><SeatBar l={l} /></TableCell>
                  <TableCell className="text-sm">{l.expiryDate ? fmtDate(l.expiryDate) : "Perpetual"}{l.daysLeft !== null && <div className={cn("text-[11px]", l.status === "Expired" ? "text-red-600 font-semibold" : l.status === "Expiring Soon" ? "text-amber-600 font-semibold" : "text-muted-foreground")}>{daysText(l.daysLeft)}</div>}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(l.cost)}{l.unitCost !== null && <div className="text-[10px] text-muted-foreground">{inr(l.unitCost)}/seat</div>}</TableCell>
                  <TableCell><Pill v={l.compliance} />{l.status !== "Active" && <div className="mt-1"><Pill v={l.status} /></div>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={Math.ceil(list.length / PAGE) || 1} totalItems={list.length} pageSize={PAGE} onPageChange={setPage} />
        </CardContent>
      </Card>
    </>
  );
}

function Compliance({ onOpen }: { onOpen: (id: number) => void }) {
  const qc = useQueryClient(); const { toast } = useToast(); const { canAccess } = useAuth(); const isAdmin = canAccess("asset_licenses", "write");
  const { data } = useQuery({ queryKey: ["asset-license-compliance"], queryFn: () => apiFetch<any>("/asset-license-compliance") });
  const [revoke, setRevoke] = useState<any>(null);
  const s = data?.summary || {};
  const order: Record<string, number> = { "Expired – in use": 0, "Under-licensed": 1, "Over-licensed": 2, Compliant: 3 };
  const rows = [...(data?.rows || [])].sort((a, b) => order[a.compliance] - order[b.compliance] || (b.exposure || 0) - (a.exposure || 0));
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={ShieldCheck} label="Compliance score" value={`${s.score ?? 100}%`} sub={`${s.underLicensed ?? 0} under-licensed · ${s.expiredInUse ?? 0} expired in use`} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" valueColor={(s.score ?? 100) < 100 ? "text-amber-600" : undefined} />
        <StatCard icon={ShieldAlert} label="True-up exposure" value={inrShort(s.exposure)} sub={`${s.shortfallSeats ?? 0} seats short`} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" valueColor={s.exposure ? "text-red-600" : undefined} />
        <StatCard icon={IndianRupee} label="Unused spend" value={inrShort(s.unusedSpend)} sub={`${s.unusedSeats ?? 0} idle seats`} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={Recycle} label="Seats to reclaim" value={s.reclaimSeats ?? 0} sub={`worth ${inrShort(s.reclaimValue)}`} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
      </div>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Entitlement vs. consumption</div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadCsv(rows, [["Product", "productName"], ["Edition", "edition"], ["Type", "licenseType"], ["Entitled", (r: any) => r.entitled ?? "Unlimited"], ["In use", "consumed"], ["Shortfall", "shortfall"], ["Idle", (r: any) => Math.max(0, r.available ?? 0)], ["Unit cost", "unitCost"], ["Exposure (INR)", "exposure"], ["Unused spend (INR)", "unusedSpend"], ["Status", "status"], ["Compliance", "compliance"]], `license_compliance_${today()}.csv`)}><Download className="w-4 h-4" />Export report</Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Entitled</TableHead><TableHead className="text-right">In use</TableHead><TableHead className="text-right">Short / idle</TableHead><TableHead className="text-right">Exposure</TableHead><TableHead className="text-right">Unused spend</TableHead><TableHead>Finding</TableHead></TableRow></TableHeader>
            <TableBody>
              {!rows.length && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No licenses recorded yet.</TableCell></TableRow>}
              {rows.map(r => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r.id)}>
                  <TableCell><div className="font-medium">{r.productName}{r.edition ? ` · ${r.edition}` : ""}</div><div className="text-xs text-muted-foreground">{r.licenseType}{r.expiryDate ? ` · expires ${fmtDate(r.expiryDate)}` : ""}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{r.entitled ?? "∞"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.consumed}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.shortfall && "text-red-600 font-semibold")}>{r.shortfall ? `−${r.shortfall}` : r.available !== null ? `${Math.max(0, r.available)} idle` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.exposure ? inr(r.exposure) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.unusedSpend ? inr(r.unusedSpend) : "—"}</TableCell>
                  <TableCell><Pill v={r.compliance} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">Under-licensed: more seats in use than purchased (exposure = shortfall × cost per seat). Expired – in use: seats still assigned after expiry. Over-licensed: 30% or more seats idle. Site licences / enterprise agreements are unlimited.</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reclaim candidates ({data?.reclaim?.length ?? 0})</div>
          {!data?.reclaim?.length ? <div className="text-sm text-muted-foreground py-4 text-center">No seats held by disposed / retired devices or deactivated users.</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>License</TableHead><TableHead>Held by</TableHead><TableHead>Why</TableHead><TableHead>Assigned</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{data.reclaim.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.productName}</TableCell>
                  <TableCell className="text-sm">{r.assigneeType === "Device" ? <><span className="font-mono text-xs">{r.assetTag}</span> <span className="text-muted-foreground">{r.userName}</span></> : <>{r.userName}<div className="text-xs text-muted-foreground">{r.userEmail}</div></>}</TableCell>
                  <TableCell className="text-sm text-amber-700 dark:text-amber-300">{r.reason}</TableCell>
                  <TableCell className="text-sm">{fmtDate(r.assignedAt)}</TableCell>
                  <TableCell className="text-right">{isAdmin && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRevoke({ ...r, reason: r.reason })}><UserMinus className="w-3.5 h-3.5" />Reclaim</Button>}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {revoke && <RevokeDialog a={revoke} onClose={() => setRevoke(null)} onDone={() => { refreshKeys.forEach(k => qc.invalidateQueries({ queryKey: [k] })); toast({ title: "Seat reclaimed" }); setRevoke(null); }} />}
    </>
  );
}

function RevokeDialog({ a, onClose, onDone }: { a: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState(a.reason || ""); const [busy, setBusy] = useState(false);
  const who = a.assigneeType === "Device" ? `${a.assetTag}${a.userName ? ` (${a.userName})` : ""}` : a.userName;
  async function go() {
    if (!reason.trim()) { toast({ title: "Give a reason", variant: "destructive" }); return; }
    setBusy(true);
    try { await apiFetch(`/asset-license-assignments/${a.id}/revoke`, { method: "POST", body: JSON.stringify({ reason }) }); onDone(); }
    catch (x: any) { toast({ title: "Could not revoke", description: x.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Revoke seat</DialogTitle><DialogDescription>Free the {a.productName || "license"} seat held by {who}. Remember to also remove it in the vendor's admin portal.</DialogDescription></DialogHeader>
        <div><Label className="text-xs">Reason *</Label><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Employee left, device disposed, no longer needed" autoFocus /></div>
        <div className="flex gap-2"><Button onClick={go} disabled={busy} variant="destructive" className="gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Revoke seat</Button><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function Fld({ label, error, span, children }: { label: string; error?: string; span?: boolean; children: React.ReactNode }) {
  return <div className={span ? "col-span-2" : ""}><Label className="text-xs font-medium">{label}</Label>{children}{error && <p className="text-xs text-red-500 mt-1">{error}</p>}</div>;
}

function LicenseForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: (id: number) => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const isEdit = !!initial.id;
  const { data: vendors = [] } = useQuery({ queryKey: ["asset-vendors"], queryFn: () => apiFetch<any[]>("/asset-vendors") });
  const [f, setF] = useState<any>(() => isEdit ? { ...initial, status: initial.storedStatus === "Cancelled" ? "Cancelled" : "Active" } : { licenseType: "Subscription", seatsTotal: 1, seatsUsed: 0, reminderDays: 30, autoRenew: false, billingCycle: "Annual", status: "Active", startDate: today() });
  const [err, setErr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => { setF((p: any) => ({ ...p, [k]: v })); setErr(e => { const n = { ...e }; delete n[k]; return n; }); };
  const manual = !isEdit || initial.tracking !== "Assignments";
  const unlimited = ["Site License", "Enterprise Agreement"].includes(f.licenseType);
  async function save() {
    const e: Record<string, string> = {};
    if (!f.productName?.trim()) e.productName = "Required";
    if (f.startDate && f.expiryDate && f.expiryDate < f.startDate) e.expiryDate = "Before the start date";
    setErr(e); if (Object.keys(e).length) return;
    const over = manual && !unlimited && Number(f.seatsUsed) > Number(f.seatsTotal);
    if (!await confirmDialog((isEdit ? `Save changes to "${f.productName}"?` : `Add license "${f.productName}" with ${unlimited ? "unlimited" : f.seatsTotal} seat(s)?`) + (over ? `\n\nSeats in use (${f.seatsUsed}) exceed seats purchased (${f.seatsTotal}) — it will show as Under-licensed.` : ""), { title: isEdit ? "Update license" : "Add license", confirmText: isEdit ? "Save" : "Add" })) return;
    setBusy(true);
    try {
      const body: any = {};
      for (const k of ["productName", "edition", "vendorName", "licenseKey", "licenseType", "startDate", "expiryDate", "seatsTotal", "seatsUsed", "cost", "renewalCost", "billingCycle", "poNumber", "autoRenew", "ownerName", "reminderDays", "status", "notes"]) if (f[k] !== undefined) body[k] = f[k] === "" ? null : f[k];
      if (!manual) delete body.seatsUsed;
      const r: any = isEdit ? await apiFetch(`/asset-licenses/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) }) : await apiFetch("/asset-licenses", { method: "POST", body: JSON.stringify(body) });
      refreshKeys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: isEdit ? "License updated" : "License added" });
      onSaved(r.id);
    } catch (x: any) { toast({ title: "Could not save", description: x.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>{isEdit ? `Edit ${initial.productName}` : "Add license"}</DialogTitle><DialogDescription>Seats purchased are the entitlement. Seats in use come from assignments once you assign the first user or device.</DialogDescription></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 gap-3">
          <Fld label="Product *" error={err.productName}><Input value={f.productName || ""} onChange={e => set("productName", e.target.value)} placeholder="e.g. Microsoft 365" className={err.productName ? "border-red-500" : ""} /></Fld>
          <Fld label="Edition / plan"><Input value={f.edition || ""} onChange={e => set("edition", e.target.value)} placeholder="e.g. Business Premium" /></Fld>
          <Fld label="Publisher / vendor">
            <Input list="lic-vendors" value={f.vendorName || ""} onChange={e => set("vendorName", e.target.value)} />
            <datalist id="lic-vendors">{vendors.map((v: any) => <option key={v.id} value={v.name} />)}</datalist>
          </Fld>
          <Fld label="License model">
            <Select value={f.licenseType} onValueChange={v => set("licenseType", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LICENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          </Fld>
          <Fld label={unlimited ? "Seats purchased (unlimited)" : "Seats purchased"}><Input type="number" min={0} disabled={unlimited} value={f.seatsTotal ?? ""} onChange={e => set("seatsTotal", e.target.value)} /></Fld>
          <Fld label={manual ? "Seats in use (manual count)" : "Seats in use"}>{manual ? <Input type="number" min={0} value={f.seatsUsed ?? 0} onChange={e => set("seatsUsed", e.target.value)} /> : <div className="h-9 flex items-center text-sm text-muted-foreground">{initial.consumed} — from assignments</div>}</Fld>
          <Fld label="Start date"><Input type="date" value={f.startDate || ""} onChange={e => set("startDate", e.target.value)} /></Fld>
          <Fld label="Expiry / renewal date" error={err.expiryDate}><Input type="date" value={f.expiryDate || ""} onChange={e => set("expiryDate", e.target.value)} /></Fld>
          <Fld label="Cost paid (₹)"><Input type="number" min={0} value={f.cost ?? ""} onChange={e => set("cost", e.target.value)} /></Fld>
          <Fld label="Renewal cost (₹)"><Input type="number" min={0} value={f.renewalCost ?? ""} onChange={e => set("renewalCost", e.target.value)} /></Fld>
          <Fld label="Billing">
            <Select value={f.billingCycle || "Annual"} onValueChange={v => set("billingCycle", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Monthly", "Quarterly", "Annual", "Multi-year", "One-time"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          </Fld>
          <Fld label="Reminder (days before expiry)"><Input type="number" min={0} value={f.reminderDays ?? 30} onChange={e => set("reminderDays", e.target.value)} /></Fld>
          <Fld label="PO number"><Input value={f.poNumber || ""} onChange={e => set("poNumber", e.target.value)} /></Fld>
          <Fld label="License owner (internal)"><Input value={f.ownerName || ""} onChange={e => set("ownerName", e.target.value)} /></Fld>
          <Fld label="License key / agreement no." span><Input value={f.licenseKey || ""} onChange={e => set("licenseKey", e.target.value)} className="font-mono text-sm" /></Fld>
          <div className="flex items-center gap-3"><Switch checked={!!f.autoRenew} onCheckedChange={v => set("autoRenew", v)} /><span className="text-sm">Auto-renews</span></div>
          {isEdit && <div className="flex items-center gap-3"><Switch checked={f.status === "Cancelled"} onCheckedChange={v => set("status", v ? "Cancelled" : "Active")} /><span className="text-sm">Cancelled (not renewing)</span></div>}
          <Fld label="Notes" span><Textarea rows={2} value={f.notes || ""} onChange={e => set("notes", e.target.value)} /></Fld>
        </div>
        <div className="flex gap-2 pt-3 border-t">
          <Button onClick={save} disabled={busy} className="gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{isEdit ? "Save changes" : "Add license"}</Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LicenseDetail({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (l: any) => void }) {
  const qc = useQueryClient(); const { toast } = useToast(); const { canAccess } = useAuth(); const isAdmin = canAccess("asset_licenses", "write");
  const { data: all = [] } = useQuery({ queryKey: ["asset-licenses"], queryFn: () => apiFetch<any[]>("/asset-licenses") });
  const { data: assigns = [] } = useQuery({ queryKey: ["asset-license-assignments", id], queryFn: () => apiFetch<any[]>(`/asset-licenses/${id}/assignments`) });
  const [mode, setMode] = useState<null | "user" | "device">(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [revoke, setRevoke] = useState<any>(null);
  const l = all.find(x => x.id === id);
  if (!l) return null;
  const active = assigns.filter(a => a.status === "Active");
  const shown = showRevoked ? assigns : active;
  const refresh = () => refreshKeys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">{l.productName}{l.edition && <span className="font-normal text-muted-foreground">{l.edition}</span>}<Pill v={l.compliance} />{l.status !== "Active" && <Pill v={l.status} />}</DialogTitle>
          <DialogDescription>{l.licenseType} · {l.vendorName || "no vendor"} · {l.expiryDate ? `expires ${fmtDate(l.expiryDate)} (${daysText(l.daysLeft)})` : "no expiry"}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([["Purchased", l.entitled ?? "Unlimited"], ["In use", l.consumed], [l.shortfall ? "Short by" : "Available", l.shortfall ? l.shortfall : l.available ?? "—"], ["Cost / seat", inr(l.unitCost)]] as [string, any][]).map(([k, v]) => (
            <div key={k} className="rounded-[10px] border px-3 py-2"><div className="text-xs text-muted-foreground">{k}</div><div className={cn("text-xl font-semibold", k === "Short by" && "text-red-600")}>{v}</div></div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {([["Cost paid", inr(l.cost)], ["Renewal", inr(l.renewalCost)], ["Billing", l.billingCycle], ["Auto-renew", l.autoRenew ? "Yes" : "No"], ["PO", l.poNumber], ["Owner", l.ownerName], ["Start", fmtDate(l.startDate)], ["Key / agreement", l.licenseKey]] as [string, any][]).map(([k, v]) => (
            <div key={k}><div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">{k}</div><div className="font-medium break-all">{v || "—"}</div></div>
          ))}
        </div>
        {l.notes && <div className="text-sm rounded-[10px] bg-muted/40 p-3">{l.notes}</div>}
        {isAdmin && <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => setMode("user")}><Users className="w-3.5 h-3.5" />Assign to users</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMode("device")}><Laptop className="w-3.5 h-3.5" />Assign to devices</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(l)}><Edit className="w-3.5 h-3.5" />Edit</Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-red-600 ml-auto" onClick={async () => {
            if (active.length) { toast({ title: "Revoke the assigned seats first", description: `${active.length} seat(s) are still assigned.`, variant: "destructive" }); return; }
            if (!await confirmDialog(`Delete license "${l.productName}"?`, { title: "Delete license", confirmText: "Delete", destructive: true })) return;
            try { await apiFetch(`/asset-licenses/${id}`, { method: "DELETE" }); refresh(); toast({ title: "License deleted" }); onClose(); } catch (x: any) { toast({ title: "Could not delete", description: x.message, variant: "destructive" }); }
          }}><Trash2 className="w-3.5 h-3.5" />Delete</Button>
        </div>}
        {mode && <AssignPanel lic={l} mode={mode} assignedAssetIds={active.filter(a => a.assetId).map(a => a.assetId)} onClose={() => setMode(null)} onDone={() => { refresh(); setMode(null); }} />}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Assigned seats ({active.length})</div>
            {assigns.length > active.length && <button className="text-xs text-primary" onClick={() => setShowRevoked(v => !v)}>{showRevoked ? "Hide" : "Show"} revoked ({assigns.length - active.length})</button>}
          </div>
          <div className="rounded-[10px] border max-h-80 overflow-y-auto divide-y">
            {!shown.length && <div className="px-3 py-6 text-center text-sm text-muted-foreground">{l.tracking === "Manual" ? `No assignments — using the manual count of ${l.consumed}. Assign users or devices to track seats individually.` : "No active seats."}</div>}
            {shown.map(a => (
              <div key={a.id} className={cn("flex items-center gap-3 px-3 py-2 text-sm", a.status !== "Active" && "opacity-60")}>
                {a.assigneeType === "Device" ? <Laptop className="w-4 h-4 text-muted-foreground shrink-0" /> : <Users className="w-4 h-4 text-muted-foreground shrink-0" />}
                <div className="min-w-0 flex-1">
                  {a.assigneeType === "Device" ? <div><span className="font-mono text-xs text-primary font-semibold">{a.assetTag}</span> {a.assetName}</div> : <div>{a.userName}</div>}
                  <div className="text-xs text-muted-foreground truncate">{a.assigneeType === "Device" ? [a.assetHolder, a.assetStatus].filter(Boolean).join(" · ") : [a.userEmail, a.employeeCode, a.department].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="text-xs text-muted-foreground text-right shrink-0">{a.status === "Active" ? `since ${fmtDate(a.assignedAt)}` : <>revoked {fmtDate(a.revokedAt)}<div>{a.revokeReason}</div></>}</div>
                {isAdmin && a.status === "Active" && <Button size="sm" variant="ghost" title="Revoke" onClick={() => setRevoke({ ...a, productName: l.productName, reason: "" })}><UserMinus className="w-4 h-4" /></Button>}
              </div>
            ))}
          </div>
        </div>
        {revoke && <RevokeDialog a={revoke} onClose={() => setRevoke(null)} onDone={() => { refresh(); toast({ title: "Seat revoked" }); setRevoke(null); }} />}
      </DialogContent>
    </Dialog>
  );
}

function AssignPanel({ lic, mode, assignedAssetIds, onClose, onDone }: { lic: any; mode: "user" | "device"; assignedAssetIds: number[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const { data: people = [] } = useQuery({ queryKey: ["asset-people"], queryFn: () => apiFetch<any[]>("/asset-people"), enabled: mode === "user" });
  const [assetIds, setAssetIds] = useState<number[]>([]);
  const [picked, setPicked] = useState<any[]>([]);
  const [q, setQ] = useState(""); const [paste, setPaste] = useState(""); const [busy, setBusy] = useState(false);
  const t = q.trim().toLowerCase();
  const matches = t ? people.filter((p: any) => [p.name, p.email, p.employeeCode].some((v: string) => v?.toLowerCase().includes(t)) && !picked.some(x => x.userId === p.id)).slice(0, 8) : [];
  const parsed = paste.split(/\n/).map(line => line.split(/[,\t;]/).map(s => s.trim())).filter(p => p[0])
    .map(([a, b, c]) => /@/.test(a) ? { userName: b || a.split("@")[0], userEmail: a, employeeCode: c } : { userName: a, userEmail: b || null, employeeCode: c || null });
  const users = [...picked, ...parsed];
  const count = mode === "device" ? assetIds.length : users.length;
  const over = lic.entitled !== null && lic.consumed + count > lic.entitled;
  async function go() {
    if (!count) return;
    if (!await confirmDialog(`Assign ${count} ${lic.productName} seat(s) to ${mode === "device" ? "devices" : "users"}?` + (over ? `\n\nThis takes usage to ${lic.consumed + count} of ${lic.entitled} purchased — the license will be flagged Under-licensed until more seats are bought.` : ""), { title: "Assign seats", confirmText: "Assign", destructive: over })) return;
    setBusy(true);
    try {
      const r: any = await apiFetch(`/asset-licenses/${lic.id}/assignments`, { method: "POST", body: JSON.stringify(mode === "device" ? { assigneeType: "Device", assetIds } : { assigneeType: "User", users }) });
      toast({ title: `${r.added} seat(s) assigned`, description: r.skipped?.length ? `Skipped: ${r.skipped.slice(0, 5).join(", ")}${r.skipped.length > 5 ? "…" : ""}` : undefined });
      onDone();
    } catch (x: any) { toast({ title: "Could not assign", description: x.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <div className="rounded-[12px] border border-primary/40 bg-accent/30 p-3 space-y-3">
      <div className="text-sm font-semibold">{mode === "device" ? "Assign to devices" : "Assign to users"}</div>
      {mode === "device" ? <AssetPicker value={assetIds} onChange={setAssetIds} exclude={assignedAssetIds} /> : (
        <div className="space-y-3">
          <div className="relative">
            <Input placeholder="Search system users by name, email or employee code…" value={q} onChange={e => setQ(e.target.value)} />
            {matches.length > 0 && <div className="absolute z-10 mt-1 w-full rounded-[10px] border bg-popover shadow-md max-h-56 overflow-y-auto">
              {matches.map((p: any) => <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-accent" onClick={() => { setPicked(x => [...x, { userId: p.id, userName: p.name, userEmail: p.email, employeeCode: p.employeeCode, department: p.department }]); setQ(""); }}>
                {p.name} <span className="text-xs text-muted-foreground">{[p.email, p.employeeCode].filter(Boolean).join(" · ")}</span></button>)}
            </div>}
          </div>
          {picked.length > 0 && <div className="flex flex-wrap gap-1.5">{picked.map((p, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs">{p.userName}<button onClick={() => setPicked(x => x.filter((_, j) => j !== i))}>×</button></span>)}</div>}
          <div>
            <Label className="text-xs">Or paste employees not in the system — one per line: <span className="font-mono">Name, email, employee code</span></Label>
            <Textarea rows={3} value={paste} onChange={e => setPaste(e.target.value)} placeholder={"Asha Rao, asha.rao@example.com, E1021\nvikram.n@example.com"} className="font-mono text-xs" />
            {parsed.length > 0 && <div className="text-xs text-muted-foreground mt-1">{parsed.length} from the pasted list</div>}
          </div>
        </div>
      )}
      {over && <div className="text-xs text-red-600">Only {Math.max(0, lic.available ?? 0)} seat(s) left — assigning {count} will exceed the entitlement.</div>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !count} onClick={go} className="gap-1.5">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Assign {count || ""} seat(s)</Button>
        <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}
