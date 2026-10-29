import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { toIsoDate } from "@/components/asset-register-upload";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, X, ShieldCheck, FileText, KeyRound, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCell, fmtDate as fmtD } from "@/lib/date";

/* Shared bits for contracts / warranty / depreciation / licenses. */

export const inr = (v: any, dp = 0) => v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? "—" : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: dp, minimumFractionDigits: dp })}`;
export const inrShort = (v: any) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return inr(n);
};
export { fmtDate } from "@/lib/date";
export const daysText = (d: number | null | undefined) => d === null || d === undefined ? "" : d < 0 ? `${-d} day${d === -1 ? "" : "s"} ago` : d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`;

const PILL: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  Compliant: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  "In warranty": "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  Covered: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  Upcoming: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
  Renewed: "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  Draft: "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  Unknown: "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  Manual: "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  Expiring: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  "Expiring Soon": "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  "Expiring, no AMC": "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  "Over-licensed": "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  Expired: "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300",
  "Not covered": "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300",
  "Under-licensed": "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300",
  "Expired – in use": "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300",
  Terminated: "bg-zinc-100 text-zinc-500 dark:bg-zinc-400/10 dark:text-zinc-400",
  Cancelled: "bg-zinc-100 text-zinc-500 dark:bg-zinc-400/10 dark:text-zinc-400",
};
export function Pill({ v, className }: { v: string; className?: string }) {
  return <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap", PILL[v] || PILL.Unknown, className)}>{v}</span>;
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string; count?: number }[]; value: string; onChange: (k: any) => void }) {
  return (
    <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px] flex-wrap">
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px] transition-colors", value === t.key ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {t.label}{t.count !== undefined && <span className="ml-1 text-[11px] text-muted-foreground">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function downloadCsv(rows: any[], cols: [string, string | ((r: any) => any)][], filename: string) {
  const e = (v: any) => { const s = String(fmtCell(v) ?? "").replace(/"/g, '""'); return /[,"\n]/.test(s) ? `"${s}"` : s; };
  const csv = [cols.map(c => c[0]).join(","), ...rows.map(r => cols.map(([, k]) => e(typeof k === "function" ? k(r) : r[k])).join(","))].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

/* ─── Asset detail: warranty, contracts, licenses, book value ───────────── */

export function AssetCoveragePanel({ assetId }: { assetId: number }) {
  const { data, isLoading } = useQuery({ queryKey: ["asset-coverage", assetId], queryFn: () => apiFetch<any>(`/assets/${assetId}/coverage`) });
  const [sched, setSched] = useState(false);
  if (isLoading || !data) return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
  const d = data.depreciation;
  const Section = ({ icon: Icon, title, children }: any) => (
    <div className="rounded-[10px] border p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground font-semibold tracking-wide"><Icon className="w-3.5 h-3.5" />{title}</div>
      {children}
    </div>
  );
  return (
    <div className="space-y-3 text-sm">
      <Section icon={ShieldCheck} title="Warranty">
        <div className="flex items-center justify-between gap-2">
          <div>{data.warranty.expiry ? <>Until <b>{fmtD(data.warranty.expiry)}</b> <span className="text-muted-foreground">({daysText(data.warranty.warrantyDays)})</span></> : <span className="text-muted-foreground">Warranty expiry not recorded</span>}</div>
          <Pill v={data.warranty.warranty} />
        </div>
      </Section>
      <Section icon={FileText} title="Contracts / AMC">
        {data.contracts.length === 0 && <div className="text-muted-foreground">Not on any contract. Add it from <Link href="/asset-contracts" className="text-primary underline">Contracts & AMC</Link>.</div>}
        {data.contracts.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0"><span className="font-mono text-xs text-primary font-semibold">{c.contractNo}</span> <span className="text-foreground">{c.contractType}</span>
              <div className="text-xs text-muted-foreground truncate">{c.vendorName || "—"} · {fmtD(c.startDate)} – {fmtD(c.endDate)}</div></div>
            <Pill v={c.state} />
          </div>
        ))}
      </Section>
      <Section icon={KeyRound} title="Software licenses on this device">
        {data.licenses.length === 0 ? <div className="text-muted-foreground">None assigned to this device.</div> :
          data.licenses.map((l: any) => <div key={l.id} className="flex justify-between"><span>{l.productName}{l.edition ? ` ${l.edition}` : ""}</span><span className="text-xs text-muted-foreground">{l.expiryDate ? `expires ${fmtD(l.expiryDate)}` : "perpetual"}</span></div>)}
      </Section>
      <Section icon={TrendingDown} title="Depreciation">
        {d.missing ? <div className="text-muted-foreground">Needs {d.missing.join(" and ").toLowerCase()} to calculate. Rule for this type: {d.rule.method} over {Number(d.rule.usefulLifeYears)} years, {Number(d.rule.salvagePct)}% residual.</div> : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div><div className="text-[11px] text-muted-foreground">Cost</div><div className="font-semibold">{inr(d.cost)}</div></div>
              <div><div className="text-[11px] text-muted-foreground">Accumulated</div><div className="font-semibold">{inr(d.accumulated)}</div></div>
              <div><div className="text-[11px] text-muted-foreground">Book value today</div><div className="font-semibold text-primary">{inr(d.bookValue)}</div></div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{d.method === "None" ? "Not depreciated" : `${d.method}, ${d.lifeYears} yrs, residual ${inr(d.salvage)}`} · {d.source === "asset" ? "asset-specific" : "as per rule"}</span>
              {d.method !== "None" && <button className="text-primary font-medium" onClick={() => setSched(true)}>View schedule</button>}
            </div>
          </>
        )}
      </Section>
      {sched && <DepScheduleDialog assetId={assetId} onClose={() => setSched(false)} />}
    </div>
  );
}

export function DepScheduleDialog({ assetId, onClose }: { assetId: number; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["asset-dep", assetId], queryFn: () => apiFetch<any>(`/asset-depreciation/asset/${assetId}`) });
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Depreciation schedule {data?.asset ? `— ${data.asset.assetTag}` : ""}</DialogTitle>
          <DialogDescription>{data?.input ? `${data.asset.name} · cost ${inr(data.input.cost)} from ${fmtD(data.input.purchaseDate)} · ${data.input.method} over ${data.input.lifeYears} years · residual ${inr(data.input.salvage)}` : "Indian financial year (April–March), pro-rata by days."}</DialogDescription>
        </DialogHeader>
        {!data ? <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div> : data.missing ? <div className="text-sm text-muted-foreground py-6 text-center">Needs {data.missing.join(" and ").toLowerCase()} to calculate.</div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase text-muted-foreground"><th className="text-left py-2">Year</th><th className="text-left">Period</th><th className="text-right">Opening</th><th className="text-right">Depreciation</th><th className="text-right">Closing</th></tr></thead>
            <tbody>
              {data.schedule.map((r: any) => {
                const current = r.from <= data.asOf && r.to >= data.asOf;
                return (
                  <tr key={r.fy} className={cn("border-t", current && "bg-accent/60 font-semibold")}>
                    <td className="py-1.5">{r.fy}</td><td className="text-xs text-muted-foreground">{fmtD(r.from)} – {fmtD(r.to)}{r.days < 365 ? ` (${r.days} d)` : ""}</td>
                    <td className="text-right tabular-nums">{inr(r.opening)}</td><td className="text-right tabular-nums">{inr(r.depreciation)}</td><td className="text-right tabular-nums">{inr(r.closing)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Finance data upload (purchase date / cost / PO / invoice / warranty) for existing assets ─── */

const FIN_COLS: { header: string; key: string; width: number; rule: string }[] = [
  { header: "Asset Tag", key: "assetTag", width: 14, rule: "Required (or Serial Number). Identifies the asset — do not change." },
  { header: "Serial Number", key: "serialNumber", width: 18, rule: "Used when Asset Tag is blank." },
  { header: "Asset Name", key: "name", width: 26, rule: "For reference only — not updated." },
  { header: "Assigned To", key: "ownerName", width: 20, rule: "For reference only — not updated." },
  { header: "Purchase Date", key: "purchaseDate", width: 14, rule: "dd-MMM-yyyy, e.g. 05-Nov-2026. Depreciation starts from this date." },
  { header: "PO Number", key: "purchaseOrderNo", width: 16, rule: "Optional." },
  { header: "Invoice No", key: "invoiceNo", width: 16, rule: "Optional." },
  { header: "Cost (INR)", key: "cost", width: 12, rule: "Number only. Capitalised cost incl. non-refundable taxes." },
  { header: "Warranty Start", key: "warrantyStart", width: 14, rule: "dd-MMM-yyyy, e.g. 05-Nov-2026. Optional (defaults to purchase date)." },
  { header: "Warranty Expiry", key: "warrantyExpiry", width: 15, rule: "dd-MMM-yyyy, e.g. 05-Nov-2026." },
  { header: "Depreciation Method", key: "depreciationMethod", width: 12, rule: "Optional: SLM, WDV or None. Blank = rule for the asset type." },
  { header: "Useful Life (Years)", key: "usefulLifeYears", width: 12, rule: "Optional. Blank = rule for the asset type." },
  { header: "Residual Value (INR)", key: "salvageValue", width: 12, rule: "Optional. Blank = rule's residual %." },
];
const nk = (s: string) => String(s).toLowerCase().replace(/\(.*?\)|\*/g, "").replace(/[^a-z0-9]/g, "");
const FIN_MAP: Record<string, string> = Object.fromEntries(FIN_COLS.flatMap(c => [[nk(c.header), c.key], [nk(c.key), c.key]]));
Object.assign(FIN_MAP, { tag: "assetTag", serial: "serialNumber", serialno: "serialNumber", ponumber: "purchaseOrderNo", pono: "purchaseOrderNo", invoice: "invoiceNo", invoicenumber: "invoiceNo", cost: "cost", warranty: "warrantyExpiry", method: "depreciationMethod", usefullife: "usefulLifeYears", residualvalue: "salvageValue", salvagevalue: "salvageValue" });
const FIN_DATES = new Set(["purchaseDate", "warrantyStart", "warrantyExpiry"]);

export async function downloadFinanceSheet(onlyMissing: boolean) {
  const assets = await apiFetch<any[]>("/assets");
  const list = assets.filter((a: any) => !["Disposed", "Lost / Stolen"].includes(a.status) && (!onlyMissing || !a.purchaseDate || !a.cost || !a.warrantyExpiry));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([FIN_COLS.map(c => c.header), ...list.map((a: any) => FIN_COLS.map(c => c.key === "cost" || c.key === "salvageValue" || c.key === "usefulLifeYears" ? (a[c.key] ? Number(a[c.key]) : "") : fmtCell(a[c.key] ?? "")))]);
  ws["!cols"] = FIN_COLS.map(c => ({ wch: c.width }));
  ws["!freeze"] = { xSplit: 1, ySplit: 1 } as any;
  XLSX.utils.book_append_sheet(wb, ws, "Finance Data");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Column", "How to fill"], ...FIN_COLS.map(c => [c.header, c.rule]),
    [], ["Note", "Only filled cells are applied. Blank cells leave the current value unchanged. Every change is written to the asset's history."]]), "Instructions");
  XLSX.writeFile(wb, `Asset_Finance_Data_${onlyMissing ? "missing_" : ""}${new Date().toISOString().slice(0, 10)}.xlsx`);
  return list.length;
}

type FinResult = { total: number; matched: number; toUpdate: number; unchanged: number; fieldsChanged: number; errors: { row: number; field: string; message: string }[]; updated: number; preview?: any[] };

export function FinanceUploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [result, setResult] = useState<FinResult | null>(null);
  const [busy, setBusy] = useState(false);
  const reset = () => { setFileName(""); setRows([]); setResult(null); if (ref.current) ref.current.value = ""; };
  const close = () => { reset(); onClose(); };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true); setResult(null); setFileName(f.name);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames.find(n => nk(n) === "financedata") ?? wb.SheetNames[0]];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: true });
      const keys = (aoa[0] || []).map((h: any) => FIN_MAP[nk(h)] ?? null);
      if (!keys.includes("assetTag") && !keys.includes("serialNumber")) throw new Error("Header row not recognised — use the downloaded finance sheet.");
      const parsed: any[] = [];
      aoa.slice(1).forEach((line, i) => {
        if (line.every(v => String(v ?? "").trim() === "")) return;
        const r: any = { __row: i + 2 };
        keys.forEach((k, ci) => { if (k) r[k] = FIN_DATES.has(k) ? (String(line[ci] ?? "").trim() === "" ? "" : toIsoDate(line[ci])) : String(line[ci] ?? "").trim(); });
        parsed.push(r);
      });
      if (!parsed.length) throw new Error("No rows found in the file.");
      setRows(parsed);
      setResult(await apiFetch<FinResult>("/assets/finance-update", { method: "POST", body: JSON.stringify({ rows: parsed, dryRun: true }) }));
    } catch (err: any) { toast({ title: "Could not read file", description: err.message, variant: "destructive" }); reset(); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!result || result.errors.length || !result.toUpdate) return;
    if (!await confirmDialog(`Submit ${result.toUpdate} asset(s) — ${result.fieldsChanged} field change(s) — from "${fileName}" for approval?\n\nFinance (a different person) approves it in Depreciation › Approvals; the changes are applied, archived and emailed then.`, { title: "Submit for approval", confirmText: "Submit for approval" })) return;
    setBusy(true);
    try {
      const r = await apiFetch<FinResult>("/assets/finance-update", { method: "POST", body: JSON.stringify({ rows, dryRun: false, fileName }) });
      if (r.errors.length) { setResult(r); return; }
      ["assets", "asset-dashboard", "asset-depreciation", "asset-warranty", "asset-coverage", "asset-fin-requests"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: `Submitted for approval — ${(r as any).requestNo}`, description: `${result.toUpdate} asset(s). Changes apply when Finance approves them in Depreciation › Approvals.` });
      close();
    } catch (err: any) { toast({ title: "Update failed", description: err.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }
  const errorRows = result ? new Set(result.errors.map(e => e.row)).size : 0;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) close(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Update purchase, cost & warranty</DialogTitle>
          <DialogDescription>Download the sheet for existing assets, fill purchase date, cost, PO / invoice and warranty, then upload it. Blank cells are left unchanged.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border bg-accent/60 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0"><FileSpreadsheet className="w-5 h-5 text-primary shrink-0" />
              <div className="text-sm"><div className="font-semibold text-foreground">Asset finance sheet</div><div className="text-xs text-muted-foreground">Pre-filled with your assets and their current values</div></div></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => { const n = await downloadFinanceSheet(true); toast({ title: `${n} assets with missing data downloaded` }); }}><Download className="w-4 h-4" />Missing only</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => { const n = await downloadFinanceSheet(false); toast({ title: `${n} assets downloaded` }); }}><Download className="w-4 h-4" />All assets</Button>
            </div>
          </div>
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="w-full rounded-[12px] border-2 border-dashed border-border hover:border-primary/60 hover:bg-accent/40 transition-colors px-4 py-7 text-center disabled:opacity-60">
            {busy ? <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" /> : <Upload className="w-6 h-6 mx-auto text-primary" />}
            <div className="mt-2 text-sm font-semibold text-foreground">{fileName || "Choose the filled finance sheet (.xlsx)"}</div>
            <div className="text-xs text-muted-foreground">Checked first — nothing is saved until you confirm</div>
          </button>
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-[10px] border px-3 py-2"><div className="text-xs text-muted-foreground">Rows matched</div><div className="text-xl font-semibold">{result.matched}/{result.total}</div></div>
                <div className="rounded-[10px] border px-3 py-2"><div className="text-xs text-muted-foreground">Assets to update</div><div className="text-xl font-semibold text-emerald-600">{result.toUpdate}</div></div>
                <div className="rounded-[10px] border px-3 py-2"><div className="text-xs text-muted-foreground">Rows with errors</div><div className={cn("text-xl font-semibold", errorRows && "text-red-600")}>{errorRows}</div></div>
              </div>
              {result.errors.length === 0 ? (
                <div className="flex items-start gap-2 rounded-[10px] border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{result.toUpdate ? `${result.fieldsChanged} change(s) ready. ${result.unchanged} row(s) have nothing new.` : "Nothing to change — the file matches the register."}</span>
                </div>
              ) : (
                <div className="rounded-[10px] border border-red-500/30 overflow-hidden">
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"><AlertTriangle className="w-4 h-4" />Fix these {result.errors.length} issue(s) and upload again. Nothing has been saved.</div>
                  <div className="max-h-56 overflow-y-auto"><table className="w-full text-xs"><tbody>
                    {result.errors.slice(0, 300).map((e, i) => <tr key={i} className="border-t"><td className="px-3 py-1.5 font-mono w-14">{e.row}</td><td className="px-3 py-1.5 w-36">{e.field}</td><td className="px-3 py-1.5">{e.message}</td></tr>)}
                  </tbody></table></div>
                </div>
              )}
              {!!result.preview?.length && !result.errors.length && (
                <div className="rounded-[10px] border text-xs divide-y">
                  {result.preview.map((p: any) => <div key={p.assetTag} className="px-3 py-1.5"><span className="font-mono font-semibold text-primary">{p.assetTag}</span> {p.changes.map((c: any) => `${c.label}: ${c.from ?? "—"} → ${c.to}`).join(" · ")}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-start gap-2 pt-3 border-t">
          <Button onClick={apply} disabled={busy || !result || !!result.errors.length || !result.toUpdate} className="gap-2">{busy && result ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Submit for approval</Button>
          <Button variant="outline" onClick={close} disabled={busy}><X className="w-4 h-4" />Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Asset multi-picker (search + checkboxes), used by contracts and license assignment ─── */

export function AssetPicker({ value, onChange, exclude = [] }: { value: number[]; onChange: (ids: number[]) => void; exclude?: number[] }) {
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });
  const [q, setQ] = useState(""); const [loc, setLoc] = useState(""); const [type, setType] = useState("");
  const ex = new Set(exclude);
  const pool = assets.filter((a: any) => !ex.has(a.id) && !["Disposed", "Lost / Stolen"].includes(a.status));
  const locs = [...new Set(pool.map((a: any) => a.location).filter(Boolean))].sort() as string[];
  const types = [...new Set(pool.map((a: any) => a.type).filter(Boolean))].sort() as string[];
  const t = q.trim().toLowerCase();
  const list = pool.filter((a: any) => (!loc || a.location === loc) && (!type || a.type === type) && (!t || [a.assetTag, a.name, a.serialNumber, a.ownerName, a.location].some((v: string) => v?.toLowerCase().includes(t))));
  const sel = new Set(value);
  const allOn = list.length > 0 && list.every((a: any) => sel.has(a.id));
  const toggleAll = () => { const n = new Set(sel); list.forEach((a: any) => allOn ? n.delete(a.id) : n.add(a.id)); onChange([...n]); };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input className="flex-1 min-w-[180px] h-9 rounded-md border bg-background px-3 text-sm" placeholder="Search tag, model, serial, user…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={type} onChange={e => setType(e.target.value)}><option value="">All types</option>{types.map(x => <option key={x}>{x}</option>)}</select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={loc} onChange={e => setLoc(e.target.value)}><option value="">All locations</option>{locs.map(x => <option key={x}>{x}</option>)}</select>
      </div>
      <div className="rounded-[10px] border max-h-64 overflow-y-auto">
        <label className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 text-xs font-semibold sticky top-0 cursor-pointer">
          <input type="checkbox" checked={allOn} onChange={toggleAll} /> Select all {list.length} shown <span className="ml-auto font-normal text-muted-foreground">{value.length} selected</span>
        </label>
        {list.slice(0, 500).map((a: any) => (
          <label key={a.id} className="flex items-center gap-2 px-3 py-1.5 border-b last:border-0 text-sm cursor-pointer hover:bg-accent/40">
            <input type="checkbox" checked={sel.has(a.id)} onChange={() => { const n = new Set(sel); n.has(a.id) ? n.delete(a.id) : n.add(a.id); onChange([...n]); }} />
            <span className="font-mono text-xs text-primary font-semibold w-20 shrink-0">{a.assetTag}</span>
            <span className="truncate">{a.name}</span>
            <span className="ml-auto text-xs text-muted-foreground truncate max-w-[40%]">{[a.serialNumber, a.location].filter(Boolean).join(" · ")}</span>
          </label>
        ))}
        {!list.length && <div className="px-3 py-6 text-center text-xs text-muted-foreground">No assets match.</div>}
      </div>
    </div>
  );
}
