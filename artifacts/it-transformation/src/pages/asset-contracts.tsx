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
import { useMasters } from "@/hooks/use-masters";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { Pill, Tabs, inr, inrShort, fmtDate, daysText, downloadCsv, AssetPicker, FinanceUploadDialog } from "@/components/asset-finance";
import { FileText, Plus, Search, RefreshCw, Trash2, Edit, Loader2, ShieldCheck, ShieldAlert, CalendarClock, Download, X, Upload, IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE = 12;
const today = () => new Date().toISOString().slice(0, 10);
const addYears = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCFullYear(x.getUTCFullYear() + n); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
const nextDay = (d: string) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

export default function AssetContracts() {
  const initial = (new URLSearchParams(window.location.search).get("tab") as any) || "contracts";
  const [tab, setTab] = useState<"contracts" | "warranty">(initial === "warranty" ? "warranty" : "contracts");
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contracts, AMC & Warranty</h1>
          <p className="text-sm text-muted-foreground">AMCs, extended warranties, support, lease and insurance contracts — which assets they cover, when they end, and what is left uncovered.</p>
        </div>
        <Tabs tabs={[{ key: "contracts", label: "Contracts" }, { key: "warranty", label: "Warranty coverage" }]} value={tab} onChange={setTab} />
      </div>
      {tab === "contracts" ? <ContractsTab /> : <WarrantyTab />}
    </div>
  );
}

/* ─── Contracts ─────────────────────────────────────────────────────────── */

function ContractsTab() {
  const { canAccess } = useAuth(); const isAdmin = canAccess("asset_contracts", "write");
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["asset-contracts"], queryFn: () => apiFetch<any[]>("/asset-contracts") });
  const [f, setF] = useState<"all" | "Active" | "Expiring" | "Expired" | "Upcoming" | "closed">("all");
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<any>(null); const [view, setView] = useState<number | null>(null);
  const counts = useMemo(() => ({
    all: rows.length, Active: rows.filter(r => r.state === "Active").length, Expiring: rows.filter(r => r.state === "Expiring").length,
    Expired: rows.filter(r => r.state === "Expired").length, Upcoming: rows.filter(r => r.state === "Upcoming").length, closed: rows.filter(r => ["Renewed", "Terminated", "Draft"].includes(r.state)).length,
  }), [rows]);
  const list = useMemo(() => {
    let l = rows;
    if (f === "closed") l = l.filter(r => ["Renewed", "Terminated", "Draft"].includes(r.state)); else if (f !== "all") l = l.filter(r => r.state === f);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter(r => [r.contractNo, r.title, r.vendorName, r.contractType, r.poNumber].some((v: string) => v?.toLowerCase().includes(t)));
    return l;
  }, [rows, f, q]);
  const live = rows.filter(r => r.state === "Active" || r.state === "Expiring");
  const value = live.reduce((t, r) => t + Number(r.value || 0), 0);
  const covered = live.reduce((t, r) => t + r.assetCount, 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={FileText} label="Active contracts" value={live.length} sub={`${covered} asset links`} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={CalendarClock} label="Due for renewal" value={counts.Expiring} sub="within notice period" iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" valueColor={counts.Expiring ? "text-amber-600" : undefined} />
        <StatCard icon={ShieldAlert} label="Expired, not renewed" value={counts.Expired} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" valueColor={counts.Expired ? "text-red-600" : undefined} />
        <StatCard icon={IndianRupee} label="Active contract value" value={inrShort(value)} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
      </div>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs tabs={[{ key: "all", label: "All", count: counts.all }, { key: "Active", label: "Active", count: counts.Active }, { key: "Expiring", label: "Renewal due", count: counts.Expiring },
              { key: "Expired", label: "Expired", count: counts.Expired }, { key: "Upcoming", label: "Upcoming", count: counts.Upcoming }, { key: "closed", label: "Renewed / closed", count: counts.closed }] as any}
              value={f} onChange={(k: any) => { setF(k); setPage(1); }} />
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search contract no, title, vendor, PO…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadCsv(list, [["Contract No", "contractNo"], ["Title", "title"], ["Type", "contractType"], ["Vendor", "vendorName"], ["Start", "startDate"], ["End", "endDate"], ["Status", "state"], ["Days left", "daysLeft"], ["Value (INR)", "value"], ["Billing", "billingCycle"], ["Assets", "assetCount"], ["PO", "poNumber"], ["Owner", "ownerName"]], `contracts_${today()}.csv`)}><Download className="w-4 h-4" />Export</Button>
            {isAdmin && <Button className="gap-2" onClick={() => setEdit({})}><Plus className="w-4 h-4" />New contract</Button>}
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Contract</TableHead><TableHead>Type / vendor</TableHead><TableHead>Period</TableHead><TableHead className="text-right">Value</TableHead><TableHead className="text-center">Assets</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !list.length && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{rows.length ? "No contracts match." : "No contracts yet. Add your AMCs, extended warranties and support contracts to track renewals and coverage."}</TableCell></TableRow>}
              {list.slice((page - 1) * PAGE, page * PAGE).map(r => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setView(r.id)}>
                  <TableCell><div className="font-mono text-xs text-primary font-semibold">{r.contractNo}</div><div className="font-medium text-foreground">{r.title}</div></TableCell>
                  <TableCell><div className="text-sm">{r.contractType}</div><div className="text-xs text-muted-foreground">{r.vendorName || "—"}</div></TableCell>
                  <TableCell className="text-sm">{fmtDate(r.startDate)} – {fmtDate(r.endDate)}<div className={cn("text-[11px]", r.state === "Expiring" ? "text-amber-600 font-semibold" : r.state === "Expired" ? "text-red-600 font-semibold" : "text-muted-foreground")}>{r.state === "Upcoming" ? `starts ${fmtDate(r.startDate)}` : `ends ${daysText(r.daysLeft)}`}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.value)}<div className="text-[11px] text-muted-foreground">{r.billingCycle || ""}</div></TableCell>
                  <TableCell className="text-center font-semibold">{r.assetCount}</TableCell>
                  <TableCell><Pill v={r.state} />{r.autoRenew && <div className="text-[10px] text-muted-foreground mt-0.5">auto-renew</div>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={Math.ceil(list.length / PAGE) || 1} totalItems={list.length} pageSize={PAGE} onPageChange={setPage} />
        </CardContent>
      </Card>
      {edit && <ContractForm initial={edit} onClose={() => setEdit(null)} onSaved={id => { setEdit(null); setView(id); }} />}
      {view !== null && <ContractDetail id={view} onClose={() => setView(null)} onEdit={c => { setView(null); setEdit(c); }} />}
    </>
  );
}

function ContractForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: (id: number) => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const isEdit = !!initial.id;
  const { data: types = [] } = useMasters("asset_contract_type");
  const { data: vendors = [] } = useQuery({ queryKey: ["asset-vendors"], queryFn: () => apiFetch<any[]>("/asset-vendors") });
  const [f, setF] = useState<any>(() => isEdit ? { ...initial } : { contractType: "Comprehensive AMC", billingCycle: "Annual", renewalNoticeDays: 30, autoRenew: false, startDate: today(), endDate: addYears(today(), 1), status: "Active", assetIds: [] });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => { setF((p: any) => ({ ...p, [k]: v })); setErr(e => { const n = { ...e }; delete n[k]; return n; }); };
  const typeOptions = types.length ? types.map(t => t.label) : ["Comprehensive AMC", "Non-comprehensive AMC", "Extended Warranty", "Support & Subscription", "Lease / Rental", "Insurance"];

  async function save() {
    const e: Record<string, string> = {};
    if (!f.title?.trim()) e.title = "Required";
    if (!f.startDate) e.startDate = "Required";
    if (!f.endDate) e.endDate = "Required";
    if (f.startDate && f.endDate && f.endDate < f.startDate) e.endDate = "Before the start date";
    setErr(e); if (Object.keys(e).length) return;
    const msg = isEdit ? `Save changes to ${initial.contractNo}?` : `Create ${f.contractType} "${f.title}"${f.assetIds?.length ? ` covering ${f.assetIds.length} asset(s)` : ""}?`;
    if (!await confirmDialog(msg, { title: isEdit ? "Update contract" : "Create contract", confirmText: isEdit ? "Save" : "Create" })) return;
    setBusy(true);
    try {
      const { assetIds, assets, renewedFrom, renewedTo, state, daysLeft, assetCount, ...body } = f;
      const r: any = isEdit ? await apiFetch(`/asset-contracts/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiFetch("/asset-contracts", { method: "POST", body: JSON.stringify({ ...body, assetIds }) });
      ["asset-contracts", "asset-contract", "asset-warranty", "asset-dashboard", "asset-coverage"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: isEdit ? "Contract updated" : `Contract ${r.contractNo} created`, description: !isEdit && r.added ? `${r.added} assets covered` : undefined });
      onSaved(r.id);
    } catch (x: any) { toast({ title: "Could not save", description: x.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>{isEdit ? `Edit ${initial.contractNo}` : "New contract"}</DialogTitle><DialogDescription>AMC, extended warranty, support, lease or insurance. Renewal reminders start {f.renewalNoticeDays || 30} days before the end date.</DialogDescription></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Fld error={err.title} label="Title *" span><Input value={f.title || ""} onChange={e => set("title", e.target.value)} placeholder="e.g. Dell ProSupport — Worli laptops FY26-27" className={err.title ? "border-red-500" : ""} /></Fld>
            <Fld error={err.contractType} label="Contract type *">
              <Select value={f.contractType} onValueChange={v => set("contractType", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{typeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
            </Fld>
            <Fld error={err.vendorName} label="Vendor">
              <Input list="contract-vendors" value={f.vendorName || ""} onChange={e => set("vendorName", e.target.value)} placeholder="Choose or type" />
              <datalist id="contract-vendors">{vendors.map((v: any) => <option key={v.id} value={v.name} />)}</datalist>
            </Fld>
            <Fld error={err.startDate} label="Start date *"><Input type="date" value={f.startDate || ""} onChange={e => set("startDate", e.target.value)} className={err.startDate ? "border-red-500" : ""} /></Fld>
            <Fld error={err.endDate} label="End date *"><Input type="date" value={f.endDate || ""} onChange={e => set("endDate", e.target.value)} className={err.endDate ? "border-red-500" : ""} /></Fld>
            <Fld error={err.value} label="Contract value (₹)"><Input type="number" min={0} value={f.value ?? ""} onChange={e => set("value", e.target.value)} /></Fld>
            <Fld error={err.billingCycle} label="Billing">
              <Select value={f.billingCycle || "Annual"} onValueChange={v => set("billingCycle", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["One-time", "Monthly", "Quarterly", "Half-yearly", "Annual", "Multi-year"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
            </Fld>
            <Fld error={err.poNumber} label="PO number"><Input value={f.poNumber || ""} onChange={e => set("poNumber", e.target.value)} /></Fld>
            <Fld error={err.renewalNoticeDays} label="Renewal reminder (days before end)"><Input type="number" min={0} value={f.renewalNoticeDays ?? 30} onChange={e => set("renewalNoticeDays", e.target.value)} /></Fld>
            <Fld error={err.ownerName} label="Contract owner (internal)"><Input value={f.ownerName || ""} onChange={e => set("ownerName", e.target.value)} /></Fld>
            <div className="flex items-center gap-3 pt-5"><Switch checked={!!f.autoRenew} onCheckedChange={v => set("autoRenew", v)} /><span className="text-sm">Auto-renews</span></div>
            <Fld error={err.coverage} label="Coverage (what is included)" span><Textarea rows={2} value={f.coverage || ""} onChange={e => set("coverage", e.target.value)} placeholder="e.g. Parts + labour, on-site next business day, accidental damage, battery excluded" /></Fld>
            <Fld error={err.slaTerms} label="SLA terms" span><Input value={f.slaTerms || ""} onChange={e => set("slaTerms", e.target.value)} placeholder="e.g. Response 4 hrs, resolution NBD, 99.5% uptime" /></Fld>
            <Fld error={err.vendorContact} label="Vendor contact"><Input value={f.vendorContact || ""} onChange={e => set("vendorContact", e.target.value)} /></Fld>
            <Fld error={err.vendorEmail} label="Vendor email / support"><Input value={f.vendorEmail || ""} onChange={e => set("vendorEmail", e.target.value)} /></Fld>
            <Fld error={err.vendorPhone} label="Vendor phone"><Input value={f.vendorPhone || ""} onChange={e => set("vendorPhone", e.target.value)} /></Fld>
            {isEdit && <Fld error={err.status} label="Status">
              <Select value={["Draft", "Terminated"].includes(f.status) ? f.status : "Active"} onValueChange={v => set("status", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Active">Active (by dates)</SelectItem><SelectItem value="Draft">Draft</SelectItem><SelectItem value="Terminated">Terminated</SelectItem></SelectContent></Select>
            </Fld>}
            <Fld error={err.notes} label="Notes" span><Textarea rows={2} value={f.notes || ""} onChange={e => set("notes", e.target.value)} /></Fld>
          </div>
          {!isEdit && <div className="space-y-1.5"><Label className="text-xs font-medium">Covered assets</Label><AssetPicker value={f.assetIds} onChange={v => set("assetIds", v)} /></div>}
        </div>
        <div className="flex gap-2 pt-3 border-t">
          <Button onClick={save} disabled={busy} className="gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{isEdit ? "Save changes" : "Create contract"}</Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fld({ label, error, span, children }: { label: string; error?: string; span?: boolean; children: React.ReactNode }) {
  return <div className={span ? "col-span-2" : ""}><Label className="text-xs font-medium">{label}</Label>{children}{error && <p className="text-xs text-red-500 mt-1">{error}</p>}</div>;
}

function ContractDetail({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (c: any) => void }) {
  const qc = useQueryClient(); const { toast } = useToast(); const { canAccess } = useAuth(); const isAdmin = canAccess("asset_contracts", "write");
  const { data: c } = useQuery({ queryKey: ["asset-contract", id], queryFn: () => apiFetch<any>(`/asset-contracts/${id}`) });
  const [adding, setAdding] = useState<number[] | null>(null);
  const [renew, setRenew] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => ["asset-contracts", "asset-contract", "asset-warranty", "asset-dashboard", "asset-coverage"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); refresh(); toast({ title: ok }); } catch (x: any) { toast({ title: "Failed", description: x.message, variant: "destructive" }); } finally { setBusy(false); } };

  if (!c) return null;
  const canRenew = isAdmin && !["Renewed", "Terminated"].includes(c.status);
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap"><span className="font-mono text-primary">{c.contractNo}</span><span className="font-normal text-muted-foreground">{c.title}</span><Pill v={c.state} /></DialogTitle>
          <DialogDescription>{c.contractType} · {c.vendorName || "no vendor"} · {fmtDate(c.startDate)} – {fmtDate(c.endDate)} ({c.state === "Upcoming" ? `starts ${fmtDate(c.startDate)}` : `ends ${daysText(c.daysLeft)}`})</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {([["Value", inr(c.value)], ["Billing", c.billingCycle], ["PO", c.poNumber], ["Owner", c.ownerName], ["Reminder", `${c.renewalNoticeDays} days before end`], ["Auto-renew", c.autoRenew ? "Yes" : "No"],
            ["Vendor contact", [c.vendorContact, c.vendorPhone].filter(Boolean).join(" · ")], ["Vendor email", c.vendorEmail]] as [string, any][]).map(([l, v]) => (
            <div key={l}><div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">{l}</div><div className="font-medium break-words">{v || "—"}</div></div>
          ))}
        </div>
        {(c.coverage || c.slaTerms || c.notes) && <div className="rounded-[10px] border bg-muted/30 p-3 text-sm space-y-1">
          {c.coverage && <div><span className="text-muted-foreground">Coverage:</span> {c.coverage}</div>}
          {c.slaTerms && <div><span className="text-muted-foreground">SLA:</span> {c.slaTerms}</div>}
          {c.notes && <div><span className="text-muted-foreground">Notes:</span> {c.notes}</div>}
        </div>}
        {(c.renewedFrom || c.renewedTo) && <div className="text-xs text-muted-foreground">
          {c.renewedFrom && <>Renewal of <b className="font-mono">{c.renewedFrom.contractNo}</b> ({fmtDate(c.renewedFrom.startDate)} – {fmtDate(c.renewedFrom.endDate)}). </>}
          {c.renewedTo && <>Renewed as <b className="font-mono">{c.renewedTo.contractNo}</b> ({fmtDate(c.renewedTo.startDate)} – {fmtDate(c.renewedTo.endDate)}).</>}
        </div>}
        {isAdmin && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(c)}><Edit className="w-3.5 h-3.5" />Edit</Button>
          {canRenew && <Button size="sm" className="gap-1.5" onClick={() => setRenew({ startDate: nextDay(c.endDate), endDate: addYears(nextDay(c.endDate), 1), value: c.value ?? "" })}><RefreshCw className="w-3.5 h-3.5" />Renew</Button>}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding([])}><Plus className="w-3.5 h-3.5" />Add assets</Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-red-600 ml-auto" disabled={busy} onClick={async () => {
            if (!await confirmDialog(`Delete contract ${c.contractNo}? Its ${c.assets.length} asset(s) will lose this coverage. Each asset's history keeps a record.`, { title: "Delete contract", confirmText: "Delete", destructive: true })) return;
            await run(() => apiFetch(`/asset-contracts/${id}`, { method: "DELETE" }), "Contract deleted"); onClose();
          }}><Trash2 className="w-3.5 h-3.5" />Delete</Button>
        </div>}

        {renew && <div className="rounded-[12px] border border-primary/40 bg-accent/40 p-3 space-y-3">
          <div className="text-sm font-semibold">Renew {c.contractNo}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label className="text-xs">New start</Label><Input type="date" value={renew.startDate} onChange={e => setRenew({ ...renew, startDate: e.target.value })} /></div>
            <div><Label className="text-xs">New end</Label><Input type="date" value={renew.endDate} onChange={e => setRenew({ ...renew, endDate: e.target.value })} /></div>
            <div><Label className="text-xs">Value (₹)</Label><Input type="number" value={renew.value} onChange={e => setRenew({ ...renew, value: e.target.value })} /></div>
            <div><Label className="text-xs">New PO</Label><Input value={renew.poNumber || ""} onChange={e => setRenew({ ...renew, poNumber: e.target.value })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">A new contract is created with the same terms; active assets carry over. This one stays valid until {fmtDate(c.endDate)} and is marked Renewed.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={async () => {
              if (!await confirmDialog(`Renew ${c.contractNo} for ${fmtDate(renew.startDate)} – ${fmtDate(renew.endDate)}${renew.value ? ` at ${inr(renew.value)}` : ""}?`, { title: "Renew contract", confirmText: "Renew" })) return;
              setBusy(true);
              try { const r: any = await apiFetch(`/asset-contracts/${id}/renew`, { method: "POST", body: JSON.stringify(renew) }); refresh(); toast({ title: `Renewed as ${r.contractNo}`, description: `${r.carried} assets carried over` }); setRenew(null); }
              catch (x: any) { toast({ title: "Renewal failed", description: x.message, variant: "destructive" }); } finally { setBusy(false); }
            }}>Confirm renewal</Button>
            <Button size="sm" variant="outline" onClick={() => setRenew(null)}>Cancel</Button>
          </div>
        </div>}

        {adding && <div className="rounded-[12px] border p-3 space-y-2">
          <div className="text-sm font-semibold">Add assets to {c.contractNo}</div>
          <AssetPicker value={adding} onChange={setAdding} exclude={c.assets.map((a: any) => a.id)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !adding.length} onClick={async () => {
              if (!await confirmDialog(`Add ${adding.length} asset(s) to ${c.contractNo}?`, { title: "Add coverage", confirmText: "Add" })) return;
              await run(() => apiFetch(`/asset-contracts/${id}/assets`, { method: "POST", body: JSON.stringify({ assetIds: adding }) }), `${adding.length} asset(s) added`); setAdding(null);
            }}>Add {adding.length || ""} asset(s)</Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(null)}>Cancel</Button>
          </div>
        </div>}

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Covered assets ({c.assets.length})</div>
          <div className="rounded-[10px] border max-h-72 overflow-y-auto divide-y">
            {!c.assets.length && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No assets on this contract yet.</div>}
            {c.assets.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono text-xs text-primary font-semibold w-20 shrink-0">{a.assetTag}</span>
                <div className="min-w-0 flex-1"><div className="truncate">{a.name}</div><div className="text-xs text-muted-foreground truncate">{[a.serialNumber, a.location, a.ownerName].filter(Boolean).join(" · ")}</div></div>
                <span className="text-xs text-muted-foreground hidden md:block">{a.warrantyExpiry ? `warranty ${fmtDate(a.warrantyExpiry)}` : ""}</span>
                {isAdmin && <button title="Remove from contract" className="p-1 rounded hover:bg-muted" disabled={busy} onClick={async () => {
                  if (!await confirmDialog(`Remove ${a.assetTag} from ${c.contractNo}?`, { title: "Remove coverage", confirmText: "Remove", destructive: true })) return;
                  await run(() => apiFetch(`/asset-contracts/${id}/assets/${a.id}`, { method: "DELETE" }), `${a.assetTag} removed`);
                }}><X className="w-4 h-4 text-muted-foreground" /></button>}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Warranty coverage ─────────────────────────────────────────────────── */

function WarrantyTab() {
  const { canAccess } = useAuth(); const isAdmin = canAccess("asset_registry", "write");
  const { data, isLoading } = useQuery({ queryKey: ["asset-warranty"], queryFn: () => apiFetch<any>("/asset-warranty") });
  const [f, setF] = useState<"risk" | "expiring" | "expired" | "covered" | "unknown" | "all">("risk");
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const [upload, setUpload] = useState(false);
  const rows: any[] = data?.rows || [];
  const sm = data?.summary || {};
  const match: Record<string, (r: any) => boolean> = {
    risk: r => r.risk === "Not covered" || r.risk === "Expiring, no AMC", expiring: r => r.warranty === "Expiring", expired: r => r.warranty === "Expired",
    covered: r => r.covered, unknown: r => r.warranty === "Unknown", all: () => true,
  };
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter(match[f]).filter(r => !t || [r.assetTag, r.name, r.serialNumber, r.ownerName, r.location, r.vendorName].some((v: string) => v?.toLowerCase().includes(t)))
      .sort((a, b) => (a.warrantyDays ?? 1e9) - (b.warrantyDays ?? 1e9));
  }, [rows, f, q]);
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={ShieldCheck} label="In warranty" value={sm.inWarranty ?? 0} sub={`${sm.expiring90 ?? 0} more expiring ≤ 90 days`} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={FileText} label="Under AMC / contract" value={sm.underAmc ?? 0} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={ShieldAlert} label="Out of warranty, no AMC" value={(sm.notCovered ?? 0) + (sm.expiringNoAmc ?? 0)} sub={`${sm.expiringNoAmc ?? 0} about to lapse`} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" valueColor={sm.notCovered ? "text-red-600" : undefined} />
        <StatCard icon={CalendarClock} label="Warranty not recorded" value={sm.unknown ?? 0} sub="add via finance upload" iconBg="bg-slate-100 dark:bg-slate-900/30" iconColor="text-slate-500" borderColor="border-l-slate-400" />
      </div>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs tabs={[{ key: "risk", label: "At risk", count: rows.filter(match.risk).length }, { key: "expiring", label: "Expiring ≤ 90 d", count: sm.expiring90 }, { key: "expired", label: "Expired", count: sm.expired },
              { key: "covered", label: "Covered", count: rows.filter(match.covered).length }, { key: "unknown", label: "Not recorded", count: sm.unknown }, { key: "all", label: "All", count: rows.length }] as any}
              value={f} onChange={(k: any) => { setF(k); setPage(1); }} />
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search tag, model, serial, user…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadCsv(list, [["Asset Tag", "assetTag"], ["Asset", "name"], ["Serial", "serialNumber"], ["User", "ownerName"], ["Location", "location"], ["Vendor", "vendorName"], ["Purchase", "purchaseDate"], ["Warranty Expiry", "warrantyExpiry"], ["Warranty", "warranty"], ["Days left", "warrantyDays"], ["Contracts", (r: any) => r.contracts.map((c: any) => c.contractNo).join(" ")], ["Coverage", "risk"]], `warranty_${today()}.csv`)}><Download className="w-4 h-4" />Export</Button>
            {isAdmin && <Button size="sm" className="gap-1.5" onClick={() => setUpload(true)}><Upload className="w-4 h-4" />Update warranty / purchase data</Button>}
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>User / location</TableHead><TableHead>Warranty</TableHead><TableHead>AMC / contract</TableHead><TableHead>Coverage</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !list.length && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nothing in this view.</TableCell></TableRow>}
              {list.slice((page - 1) * PAGE, page * PAGE).map(r => (
                <TableRow key={r.id}>
                  <TableCell><div className="font-mono text-xs text-primary font-semibold">{r.assetTag}</div><div className="text-sm">{r.name}</div><div className="text-[11px] text-muted-foreground">{r.serialNumber}</div></TableCell>
                  <TableCell className="text-sm">{r.ownerName || "—"}<div className="text-xs text-muted-foreground">{r.location || ""}</div></TableCell>
                  <TableCell className="text-sm">{r.warrantyExpiry ? fmtDate(r.warrantyExpiry) : "—"}<div className={cn("text-[11px]", r.warranty === "Expired" ? "text-red-600" : r.warranty === "Expiring" ? "text-amber-600 font-semibold" : "text-muted-foreground")}>{r.warrantyExpiry ? daysText(r.warrantyDays) : "not recorded"}</div></TableCell>
                  <TableCell className="text-sm">{r.contracts.length ? r.contracts.map((c: any) => <div key={c.id}><span className="font-mono text-xs">{c.contractNo}</span> <span className="text-xs text-muted-foreground">to {fmtDate(c.endDate)}</span></div>) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><Pill v={r.risk} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={Math.ceil(list.length / PAGE) || 1} totalItems={list.length} pageSize={PAGE} onPageChange={setPage} />
        </CardContent>
      </Card>
      <FinanceUploadDialog open={upload} onClose={() => setUpload(false)} />
    </>
  );
}
