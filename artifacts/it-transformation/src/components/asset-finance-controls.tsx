import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { inr, fmtDate, downloadCsv } from "@/components/asset-finance";
import { Check, X, Ban, Lock, LockOpen, Download, Send, Loader2, ChevronDown, ChevronRight, FileSpreadsheet, AlertTriangle, BookOpen, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const fmtTs = (d?: string | null) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const refresh = (qc: ReturnType<typeof useQueryClient>) => ["asset-fin-requests", "asset-depreciation", "asset-dep-rules", "asset-close", "asset-disposals", "asset-journal", "asset-ledgers", "assets", "asset-dashboard", "asset-coverage", "asset-dep"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
const STATUS_CLS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-300",
  Rejected: "bg-red-50 text-red-700 border-red-300 dark:bg-red-500/10 dark:text-red-300",
  Cancelled: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-500/10 dark:text-slate-300",
};
const Badge = ({ s }: { s: string }) => <span className={cn("inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold", STATUS_CLS[s] || STATUS_CLS.Cancelled)}>{s}</span>;

/** Small in-app dialog that asks for a note / reason (no browser prompt). */
function NoteDialog({ open, title, description, label, confirmText, required, destructive, onClose, onSubmit }: { open: boolean; title: string; description?: string; label: string; confirmText: string; required?: boolean; destructive?: boolean; onClose: () => void; onSubmit: (note: string) => Promise<void> }) {
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setNote(""); }, [open]);
  const ok = !required || note.trim().length >= 5;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
        <div className="space-y-1.5"><Label>{label}{required && " *"}</Label><Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} autoFocus />{required && <p className="text-[11px] text-muted-foreground">At least 5 characters.</p>}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button disabled={!ok || busy} className={cn("gap-2", destructive && "bg-red-600 hover:bg-red-700")} onClick={async () => { setBusy(true); try { await onSubmit(note.trim()); onClose(); } finally { setBusy(false); } }}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{confirmText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══ APPROVALS ════════════════════════════════════════════════════════════ */

export function useFinanceRequests(status = "Pending") {
  return useQuery({ queryKey: ["asset-fin-requests", status], queryFn: () => apiFetch<any>(`/asset-finance-requests?status=${status}`), refetchInterval: 60_000 });
}

export function Approvals() {
  const [status, setStatus] = useState("Pending");
  const { data, isLoading } = useFinanceRequests(status);
  const qc = useQueryClient(); const { toast } = useToast();
  const [open, setOpen] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<any>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const list: any[] = data?.requests || [];

  async function approve(r: any) {
    if (!await confirmDialog(`Approve ${r.requestNo} — ${r.title}?\n\nRaised by ${r.requestedBy}. The change is applied immediately${r.kind === "finance_upload" ? ", archived as a batch and emailed" : ""} and recorded in the audit log.`, { title: "Approve finance change", confirmText: "Approve & apply" })) return;
    setBusy(r.id);
    try { const x = await apiFetch<any>(`/asset-finance-requests/${r.id}/approve`, { method: "POST", body: JSON.stringify({}) }); refresh(qc); toast({ title: `${r.requestNo} approved and applied`, description: x.result?.archiveBatch ? `Archived as ${x.result.archiveBatch}` : undefined }); }
    catch (e: any) { toast({ title: "Could not approve", description: e.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  async function cancel(r: any) {
    if (!await confirmDialog(`Withdraw ${r.requestNo} — ${r.title}?`, { title: "Cancel request", confirmText: "Withdraw request", destructive: true })) return;
    try { await apiFetch(`/asset-finance-requests/${r.id}/cancel`, { method: "POST", body: "{}" }); refresh(qc); toast({ title: `${r.requestNo} withdrawn` }); }
    catch (e: any) { toast({ title: "Could not cancel", description: e.message, variant: "destructive" }); }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground max-w-3xl">Maker-checker: rule changes, purchase / cost uploads, cost edits on an asset and GL ledgers wait here. Finance (edit access to Depreciation) approves; the person who raised a change cannot approve it.</p>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
            {["Pending", "Approved", "Rejected", "Cancelled", "all"].map(s => <option key={s} value={s}>{s === "all" ? "All requests" : s}</option>)}
          </select>
        </div>
        {!data?.canApprove && status === "Pending" && list.length > 0 && <div className="text-xs text-muted-foreground">You can view these requests; approval needs edit access to Depreciation.</div>}
        <Table>
          <TableHeader><TableRow><TableHead className="w-8" /><TableHead>Request</TableHead><TableHead>Change</TableHead><TableHead>Raised by</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && !list.length && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{status === "Pending" ? "Nothing waiting for approval." : "No requests."}</TableCell></TableRow>}
            {list.map(r => (
              <React.Fragment key={r.id}>
                <TableRow className="cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <TableCell>{open === r.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</TableCell>
                  <TableCell><div className="font-mono text-xs font-semibold text-primary">{r.requestNo}</div><div className="text-[11px] text-muted-foreground">{r.kindLabel}</div></TableCell>
                  <TableCell className="text-sm max-w-[380px]"><div className="truncate">{r.title}</div>{r.requestNote && <div className="text-[11px] text-muted-foreground truncate">“{r.requestNote}”</div>}</TableCell>
                  <TableCell className="text-sm">{r.requestedBy}<div className="text-[11px] text-muted-foreground">{fmtTs(r.requestedAt)}</div></TableCell>
                  <TableCell><Badge s={r.status} />{r.decidedBy && r.status !== "Pending" && <div className="text-[11px] text-muted-foreground mt-0.5">{r.decidedBy} · {fmtTs(r.decidedAt)}</div>}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    {r.status === "Pending" && <div className="flex justify-end gap-1.5">
                      {r.canDecide && <Button size="sm" className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700" disabled={busy === r.id} onClick={() => approve(r)}>{busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Approve</Button>}
                      {r.canDecide && <Button size="sm" variant="outline" className="h-8 gap-1 text-red-600" onClick={() => setRejecting(r)}><X className="w-3.5 h-3.5" />Reject</Button>}
                      {r.mine && <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => cancel(r)}><Ban className="w-3.5 h-3.5" />Withdraw</Button>}
                      {r.mine && !r.canDecide && <span className="text-[11px] text-muted-foreground self-center">needs another approver</span>}
                    </div>}
                  </TableCell>
                </TableRow>
                {open === r.id && <TableRow className="bg-muted/30 hover:bg-muted/30"><TableCell /><TableCell colSpan={5}><RequestDetail r={r} /></TableCell></TableRow>}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
        <NoteDialog open={!!rejecting} title={`Reject ${rejecting?.requestNo || ""}`} description={rejecting?.title} label="Reason (sent to the requester)" confirmText="Reject" required destructive onClose={() => setRejecting(null)}
          onSubmit={async note => { try { await apiFetch(`/asset-finance-requests/${rejecting.id}/reject`, { method: "POST", body: JSON.stringify({ note }) }); refresh(qc); toast({ title: `${rejecting.requestNo} rejected` }); } catch (e: any) { toast({ title: "Could not reject", description: e.message, variant: "destructive" }); throw e; } }} />
      </CardContent>
    </Card>
  );
}

function RequestDetail({ r }: { r: any }) {
  const ch: any[] = r.preview?.changes || [];
  const perAsset = ch.length && ch[0].assetTag;
  return (
    <div className="space-y-2 py-1">
      {r.preview?.effectiveFrom && <div className="text-xs text-amber-700 dark:text-amber-300">Closed years are frozen — this applies from {r.preview.effectiveFrom}.</div>}
      {perAsset ? <div className="max-h-72 overflow-auto rounded-md border bg-background">
        <table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="text-left p-2">Asset</th><th className="text-left p-2">Field</th><th className="text-left p-2">Current</th><th className="text-left p-2">New</th></tr></thead>
          <tbody>{ch.flatMap((a: any) => a.changes.map((c: any, i: number) => <tr key={a.assetTag + c.field} className="border-t"><td className="p-2 font-mono">{i === 0 ? a.assetTag : ""}</td><td className="p-2">{c.label}</td><td className="p-2 text-muted-foreground">{c.from ?? "—"}</td><td className="p-2 font-semibold">{c.to ?? "—"}</td></tr>))}</tbody></table>
      </div> : <div className="rounded-md border bg-background">
        <table className="w-full text-xs"><thead className="bg-muted"><tr><th className="text-left p-2">Item</th><th className="text-left p-2">Current</th><th className="text-left p-2">New</th></tr></thead>
          <tbody>{ch.map((c: any, i: number) => <tr key={i} className="border-t"><td className="p-2">{c.label}</td><td className="p-2 text-muted-foreground">{c.from ?? "—"}</td><td className="p-2 font-semibold">{c.to ?? "—"}</td></tr>)}</tbody></table>
      </div>}
      {r.preview?.assets > ch.length && <div className="text-[11px] text-muted-foreground">Showing {ch.length} of {r.preview.assets} assets.</div>}
      {r.decisionNote && r.status !== "Pending" && <div className="text-xs"><b>Decision note:</b> {r.decisionNote}</div>}
      {r.result?.archiveBatch && <div className="text-xs">Archived as <b>{r.result.archiveBatch}</b></div>}
    </div>
  );
}

/* ═══ YEAR-END CLOSE ═══════════════════════════════════════════════════════ */

export function YearClose() {
  const qc = useQueryClient(); const { toast } = useToast(); const { canAccess, user } = useAuth() as any;
  const canClose = canAccess("asset_depreciation", "write");
  const canReopen = user?.role === "admin" || canAccess("asset_depreciation", "admin");
  const { data, isLoading } = useQuery({ queryKey: ["asset-close"], queryFn: () => apiFetch<any>("/asset-depreciation/close-status") });
  const [closing, setClosing] = useState(false); const [reopen, setReopen] = useState(false);
  const n = data?.next; const t = n?.totals || {};
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 flex flex-wrap items-center gap-4">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", data?.lock ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15")}>{data?.lock ? <Lock className="w-5 h-5" /> : <LockOpen className="w-5 h-5" />}</div>
        <div className="flex-1 min-w-[240px]">
          <div className="font-semibold">{isLoading ? "Loading…" : data?.lock ? `Books locked up to ${fmtDate(data.lock.lockDate)} (${data.lock.label} closed)` : "No financial year is closed yet"}</div>
          <div className="text-sm text-muted-foreground">{data?.lock ? `Closed by ${data.lock.closedBy} on ${fmtTs(data.lock.closedAt)}. Nothing can be back-dated into a closed year; rule changes apply from the next year.` : "Close a year after the statutory audit to freeze its fixed asset register."}</div>
        </div>
        {data?.lock && canReopen && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReopen(true)}><LockOpen className="w-4 h-4" />Reopen {data.lock.label}</Button>}
      </CardContent></Card>

      {n && <Card><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Next year to close</div><div className="text-lg font-bold">{n.label}</div><div className="text-sm text-muted-foreground">{fmtDate(n.from)} – {fmtDate(n.to)} · {n.assets} assets in the register</div></div>
          {canClose && <Button className="gap-1.5" disabled={n.pendingRequests > 0} onClick={() => setClosing(true)}><Lock className="w-4 h-4" />Close {n.label}</Button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[["Gross block", t.grossClosing], ["Depreciation for the year", t.depreciation], ["Accumulated depreciation", t.accClosing], ["Net block", t.netClosing]].map(([l, v]) => <div key={l as string} className="rounded-[10px] border p-3"><div className="text-[11px] text-muted-foreground">{l}</div><div className="font-semibold tabular-nums">{inr(v)}</div></div>)}
        </div>
        {n.pendingRequests > 0 && <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4 mt-0.5" />{n.pendingRequests} finance change(s) are waiting in Approvals — decide them before closing.</div>}
        {n.missing > 0 && <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4 mt-0.5" />{n.missing} asset(s) have no cost / purchase date. After closing, they cannot be capitalised with a date in {n.label}.</div>}
      </CardContent></Card>}
      {!n && data && <div className="text-sm text-muted-foreground">The next year can be closed after it ends ({data.lock ? `${fmtDate(data.lock.lockDate)} + 1 year` : `31 Mar`}).</div>}

      <Card><CardContent className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">History</div>
        <Table>
          <TableHeader><TableRow><TableHead>Year</TableHead><TableHead>Status</TableHead><TableHead>Closed</TableHead><TableHead className="text-right">Depreciation</TableHead><TableHead className="text-right">Net block</TableHead><TableHead>Reopened</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {!data?.closes?.length && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No year closed yet.</TableCell></TableRow>}
            {(data?.closes || []).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.label}</TableCell>
                <TableCell><span className={cn("inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold", c.status === "Closed" ? STATUS_CLS.Approved : STATUS_CLS.Pending)}>{c.status}</span></TableCell>
                <TableCell className="text-sm">{c.closedBy}<div className="text-[11px] text-muted-foreground">{fmtTs(c.closedAt)}{c.closeNote ? ` · ${c.closeNote}` : ""}</div></TableCell>
                <TableCell className="text-right tabular-nums">{inr(c.totals?.depreciation)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(c.totals?.netClosing)}</TableCell>
                <TableCell className="text-sm">{c.reopenedBy ? <>{c.reopenedBy}<div className="text-[11px] text-muted-foreground">{fmtTs(c.reopenedAt)} · {c.reopenReason}</div></> : "—"}</TableCell>
                <TableCell>{c.batchId && <a className="text-xs text-primary inline-flex items-center gap-1" href={`/api/data-archive/${c.batchId}/excel`}><FileSpreadsheet className="w-3.5 h-3.5" />{c.batchNo}</a>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <NoteDialog open={closing} title={`Close ${n?.label || ""}`} description={`Freezes the fixed asset register for ${n?.label} and locks it: no purchase, cost or disposal can be dated on or before ${n ? fmtDate(n.to) : ""}. The register is archived and emailed.`} label="Note (e.g. audited by …)" confirmText={`Close ${n?.label || ""}`}
        onClose={() => setClosing(false)} onSubmit={async note => { try { const r = await apiFetch<any>("/asset-depreciation/close", { method: "POST", body: JSON.stringify({ fy: n.fy, note }) }); refresh(qc); toast({ title: `${r.label} closed`, description: `Locked up to ${fmtDate(r.lockDate)} · archived as ${r.batchNo}` }); } catch (e: any) { toast({ title: "Could not close", description: e.message, variant: "destructive" }); throw e; } }} />
      <NoteDialog open={reopen} title={`Reopen ${data?.lock?.label || ""}`} description="Its figures can change again until it is closed again. Finance is notified by email." label="Reason" confirmText="Reopen year" required destructive
        onClose={() => setReopen(false)} onSubmit={async reason => { try { await apiFetch("/asset-depreciation/reopen", { method: "POST", body: JSON.stringify({ fy: data.lock.fy, reason }) }); refresh(qc); toast({ title: `${data.lock.label} reopened` }); } catch (e: any) { toast({ title: "Could not reopen", description: e.message, variant: "destructive" }); throw e; } }} />
    </div>
  );
}

/* ═══ DISPOSALS — profit / loss ═════════════════════════════════════════════ */

export function Disposals() {
  const [fy, setFy] = useState<number | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["asset-disposals", fy], queryFn: () => apiFetch<any>(`/asset-depreciation/disposals${fy ? `?fy=${fy}` : ""}`) });
  const t = data?.totals || {}; const rows: any[] = data?.rows || [];
  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="h-9 rounded-md border bg-background px-3 text-sm font-medium" value={fy ?? data?.fy ?? ""} onChange={e => setFy(Number(e.target.value))}>{(data?.years || []).map((y: any) => <option key={y.fy} value={y.fy}>{y.label}{y.closed ? " (closed)" : ""}</option>)}</select>
        <span className="text-sm text-muted-foreground flex-1">Assets disposed of, sold or written off (lost / stolen) in the year, valued at book value on the disposal date.</span>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!rows.length} onClick={() => downloadCsv(rows, [["Asset Tag", "assetTag"], ["Asset", "name"], ["Type", "type"], ["Department", "department"], ["Purchase Date", "purchaseDate"], ["Disposal Date", "disposalDate"], ["Method", "method"], ["Cost", "cost"], ["Accumulated Depreciation", "accumulated"], ["Book Value", "bookValue"], ["Sale Value", "saleValue"], ["Gain / (Loss)", "gainLoss"]], `asset_disposals_${(data?.label || "").replace(/\s+/g, "_")}.csv`)}><Download className="w-4 h-4" />Export</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        {[["Assets", t.count, false], ["Cost written off", t.cost, true], ["Book value", t.bookValue, true], ["Sale value", t.saleValue, true], [Number(t.net) >= 0 ? "Net profit" : "Net loss", Math.abs(t.net || 0), true]].map(([l, v, money]) =>
          <div key={l as string} className="rounded-[10px] border p-3"><div className="text-[11px] text-muted-foreground">{l}</div><div className={cn("font-semibold tabular-nums", l === "Net loss" && "text-red-600", l === "Net profit" && "text-emerald-600")}>{money ? inr(v) : v ?? 0}</div></div>)}
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Disposed</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Acc. dep.</TableHead><TableHead className="text-right">Book value</TableHead><TableHead className="text-right">Sale value</TableHead><TableHead className="text-right">Profit / (loss)</TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Calculating…</TableCell></TableRow>}
          {!isLoading && !rows.length && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No disposals in this year.</TableCell></TableRow>}
          {rows.map(r => <TableRow key={r.id}>
            <TableCell><div className="font-mono text-xs font-semibold text-primary">{r.assetTag}</div><div className="text-sm">{r.name}</div></TableCell>
            <TableCell className="text-sm">{fmtDate(r.disposalDate)}<div className="text-[11px] text-muted-foreground">{r.method || "—"}</div></TableCell>
            <TableCell className="text-right tabular-nums">{inr(r.cost)}</TableCell><TableCell className="text-right tabular-nums">{inr(r.accumulated)}</TableCell>
            <TableCell className="text-right tabular-nums">{inr(r.bookValue)}</TableCell><TableCell className="text-right tabular-nums">{inr(r.saleValue)}</TableCell>
            <TableCell className={cn("text-right tabular-nums font-semibold", r.gainLoss < 0 ? "text-red-600" : "text-emerald-600")}>{r.gainLoss === null ? "—" : r.gainLoss < 0 ? `(${inr(-r.gainLoss)})` : inr(r.gainLoss)}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      {data?.unvalued?.length > 0 && <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{data.unvalued.length} disposed asset(s) have no cost / purchase date and cannot be valued: {data.unvalued.slice(0, 6).map((u: any) => u.assetTag).join(", ")}{data.unvalued.length > 6 ? "…" : ""}</div>}
    </CardContent></Card>
  );
}

/* ═══ MONTHLY JOURNAL ══════════════════════════════════════════════════════ */

const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };

export function Journal() {
  const [month, setMonth] = useState(prevMonth());
  const qc = useQueryClient(); const { toast } = useToast(); const { canAccess } = useAuth();
  const canWrite = canAccess("asset_depreciation", "write");
  const { data, isLoading, error } = useQuery({ queryKey: ["asset-journal", month], queryFn: () => apiFetch<any>(`/asset-depreciation/journal?month=${month}`), retry: false });
  const [busy, setBusy] = useState(false); const [ledgers, setLedgers] = useState(false);
  const thisMonth = new Date().toISOString().slice(0, 7);
  async function exportIt() {
    const again = data?.exports?.length > 0;
    if (!await confirmDialog(`Export the ${data.label} journal (${data.voucherNo}) — Dr = Cr ${inr(data.totals.debit, 2)}?\n\nIt is archived as a batch and emailed as a Tally-ready Excel.${again ? `\n\nAlready exported as ${data.exports[0].batchNo} — this will be marked as a re-export.` : ""}`, { title: again ? "Re-export journal" : "Export journal", confirmText: again ? "Re-export" : "Export & email" })) return;
    setBusy(true);
    try { const r = await apiFetch<any>("/asset-depreciation/journal/export", { method: "POST", body: JSON.stringify({ month }) }); qc.invalidateQueries({ queryKey: ["asset-journal"] }); toast({ title: `Journal exported — ${r.batchNo}`, description: "Archived and emailed to the configured recipients." }); window.location.href = `/api/data-archive/${r.batchId}/excel`; }
    catch (e: any) { toast({ title: "Could not export", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  const lines: any[] = data?.lines || [];
  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input type="month" className="w-44" value={month} max={thisMonth} onChange={e => e.target.value && setMonth(e.target.value)} />
        <span className="text-sm text-muted-foreground flex-1">Depreciation and disposal entries for the month, one line per ledger and cost centre (department) — import into Tally / ERP.</span>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLedgers(true)}><BookOpen className="w-4 h-4" />GL ledgers</Button>
        {canWrite && <Button size="sm" className="gap-1.5" disabled={busy || !lines.length || month >= thisMonth} onClick={exportIt}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Export & email</Button>}
      </div>
      {error && <div className="text-sm text-red-600">{(error as any).message}</div>}
      {data && <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border px-2.5 py-1">Voucher <b>{data.voucherNo}</b> dated {fmtDate(data.to)}</span>
        <span className="rounded-full border px-2.5 py-1">Depreciation <b>{inr(data.totals.depreciation, 2)}</b> on {data.totals.assets} assets</span>
        <span className="rounded-full border px-2.5 py-1">Disposals <b>{data.totals.disposals}</b></span>
        <span className={cn("rounded-full border px-2.5 py-1 font-semibold", data.totals.balanced ? "text-emerald-700 border-emerald-300" : "text-red-700 border-red-300")}>{data.totals.balanced ? "Balanced" : "Not balanced"} · Dr {inr(data.totals.debit, 2)} = Cr {inr(data.totals.credit, 2)}</span>
        {data.partial && <span className="rounded-full border px-2.5 py-1 text-amber-700 border-amber-300">Month in progress — export after it ends</span>}
        {data.locked && <span className="rounded-full border px-2.5 py-1 text-emerald-700 border-emerald-300"><Lock className="w-3 h-3 inline -mt-0.5" /> closed year</span>}
        {data.exports?.length > 0 && <span className="rounded-full border px-2.5 py-1">Exported {data.exports.length}× · last <a className="text-primary font-semibold" href={`/api/data-archive/${data.exports[0].id}/excel`}>{data.exports[0].batchNo}</a> by {data.exports[0].createdBy}</span>}
      </div>}
      <Table>
        <TableHeader><TableRow><TableHead>Ledger</TableHead><TableHead>Cost centre</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead>Narration</TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Preparing…</TableCell></TableRow>}
          {!isLoading && data && !lines.length && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No depreciation or disposals in {data.label}.</TableCell></TableRow>}
          {lines.map((l, i) => <TableRow key={i}>
            <TableCell className={cn("text-sm", !l.Debit && "pl-8")}>{l.Ledger}</TableCell><TableCell className="text-sm">{l["Cost Centre"]}</TableCell>
            <TableCell className="text-right tabular-nums">{l.Debit ? inr(l.Debit, 2) : ""}</TableCell><TableCell className="text-right tabular-nums">{l.Credit ? inr(l.Credit, 2) : ""}</TableCell>
            <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate">{l.Narration}</TableCell>
          </TableRow>)}
          {lines.length > 0 && <TableRow className="bg-muted/40 font-semibold"><TableCell colSpan={2}>Total</TableCell><TableCell className="text-right tabular-nums">{inr(data.totals.debit, 2)}</TableCell><TableCell className="text-right tabular-nums">{inr(data.totals.credit, 2)}</TableCell><TableCell /></TableRow>}
        </TableBody>
      </Table>
      {ledgers && <LedgersDialog onClose={() => setLedgers(false)} />}
    </CardContent></Card>
  );
}

function LedgersDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast(); const { canAccess } = useAuth();
  const canWrite = canAccess("asset_depreciation", "write") || canAccess("asset_registry", "write");
  const { data } = useQuery({ queryKey: ["asset-ledgers"], queryFn: () => apiFetch<any>("/asset-depreciation/ledgers") });
  const [types, setTypes] = useState<any[]>([]); const [st, setSt] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setTypes(data.types.map((t: any) => ({ ...t }))); setSt({ ...data.settings }); } }, [data]);
  const setT = (i: number, k: string, v: string) => setTypes(p => p.map((t, j) => j === i ? { ...t, [k]: v } : t));
  async function save() {
    setBusy(true);
    try { const r = await apiFetch<any>("/asset-depreciation/ledgers", { method: "PUT", body: JSON.stringify({ types, settings: st }) }); refresh(qc); toast({ title: `Sent for approval — ${r.requestNo}`, description: "Ledger names change when Finance approves them." }); onClose(); }
    catch (e: any) { toast({ title: "Could not submit", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>GL ledgers for the journal</DialogTitle><DialogDescription>Use the exact ledger names from Tally / your ERP. Changes go through approval.{data?.pendingRequest && ` A change is already pending (${data.pendingRequest}).`}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[["ledger_disposal_proceeds", "Sale proceeds (Dr)"], ["ledger_gain", "Profit on sale (Cr)"], ["ledger_loss", "Loss on sale / write-off (Dr)"], ["voucher_type", "Voucher type"]].map(([k, l]) =>
            <div key={k} className="space-y-1"><Label className="text-xs">{l}</Label><Input disabled={!canWrite} value={st[k] || ""} onChange={e => setSt(p => ({ ...p, [k]: e.target.value }))} /></div>)}
        </div>
        <div className="rounded-[10px] border overflow-auto">
          <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr><th className="text-left p-2">Asset type</th><th className="text-left p-2">Fixed asset ledger</th><th className="text-left p-2">Accumulated depreciation ledger</th><th className="text-left p-2">Depreciation expense ledger</th></tr></thead>
            <tbody>{types.map((t, i) => <tr key={t.id} className="border-t"><td className="p-2 font-medium whitespace-nowrap">{t.assetType}</td>
              {["assetLedger", "accDepLedger", "expenseLedger"].map(k => <td key={k} className="p-1.5"><Input disabled={!canWrite} className="h-8" value={t[k]} onChange={e => setT(i, k, e.target.value)} /></td>)}</tr>)}</tbody></table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          {canWrite && <Button className="gap-1.5" disabled={busy || !!data?.pendingRequest} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Submit for approval</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
