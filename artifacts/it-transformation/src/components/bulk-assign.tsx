import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { toIsoDate } from "@/components/asset-register-upload";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Bulk assignment by Excel: download the current assignments (with the User Master list), change the Employee Code
 * against each asset, upload. Assets already with that person are left alone; others are returned from the current
 * holder and issued to the new one, each with a handover record and history entry.
 */

const COLS: { header: string; key: string; width: number; rule: string; ref?: boolean }[] = [
  { header: "Asset Tag", key: "assetTag", width: 13, rule: "Required. Do not change." },
  { header: "Asset Name", key: "name", width: 26, rule: "Reference only.", ref: true },
  { header: "Serial Number", key: "serialNumber", width: 18, rule: "Reference only.", ref: true },
  { header: "Status Now", key: "status", width: 12, rule: "Reference only.", ref: true },
  { header: "Current Holder", key: "ownerName", width: 22, rule: "Reference only.", ref: true },
  { header: "Current Emp Code", key: "ownerEmployeeCode", width: 14, rule: "Reference only.", ref: true },
  { header: "Employee Code", key: "employeeCode", width: 14, rule: "Required. The person who should hold the asset — must exist in User Master (see 'People' sheet). Leave the row out to make no change." },
  { header: "Allocation Type", key: "allocationType", width: 13, rule: "Permanent (default), Temporary or Loaner." },
  { header: "Issue Date", key: "startDate", width: 12, rule: "YYYY-MM-DD. Default today." },
  { header: "Expected Return", key: "expectedReturnDate", width: 14, rule: "YYYY-MM-DD. Required for Temporary / Loaner." },
  { header: "Condition", key: "condition", width: 11, rule: "New, Good (default), Fair, Damaged, Not working." },
  { header: "Accessories", key: "accessories", width: 20, rule: "Optional, e.g. Charger, bag." },
  { header: "Location", key: "location", width: 14, rule: "Optional. Default: asset's location." },
  { header: "Remarks", key: "remarks", width: 24, rule: "Optional." },
];
const nk = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const MAP: Record<string, string> = Object.fromEntries(COLS.map(c => [nk(c.header), c.key]));
Object.assign(MAP, { empcode: "employeeCode", newemployeecode: "employeeCode", tag: "assetTag", expectedreturndate: "expectedReturnDate", issuedate: "startDate" });
const DATES = new Set(["startDate", "expectedReturnDate"]);

export async function downloadAssignmentSheet() {
  const [assets, people] = await Promise.all([apiFetch<any[]>("/assets"), apiFetch<any[]>("/asset-people")]);
  const list = assets.filter(a => ["In Stock", "In Use", "Allocated"].includes(a.status)).sort((a, b) => a.assetTag.localeCompare(b.assetTag));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([COLS.map(c => c.header), ...list.map(a => COLS.map(c => c.key === "employeeCode" ? (a.ownerEmployeeCode || "") : c.key === "allocationType" ? "Permanent" : c.key === "condition" ? "Good" : a[c.key] ?? ""))]);
  ws["!cols"] = COLS.map(c => ({ wch: c.width }));
  XLSX.utils.book_append_sheet(wb, ws, "Assignments");
  const ps = XLSX.utils.aoa_to_sheet([["Employee Code", "Name", "Login Email", "Internal / External", "Department", "Designation"],
    ...people.filter(p => p.employeeCode).map(p => [p.employeeCode, p.name, p.email, p.userType === "external" ? "External" : "Internal", p.department || "", p.designation || ""])]);
  ps["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ps, "People (User Master)");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Column", "How to fill"], ...COLS.map(c => [c.header, c.rule]), [],
    ["Note", "Only rows whose Employee Code differs from the current holder are changed. Delete rows you do not want to touch."],
    ["Note", "A person not in the 'People' sheet must first be added in Admin › User Master (as Internal or External) with an Employee Code."]]), "Instructions");
  XLSX.writeFile(wb, `Asset_Assignments_${new Date().toISOString().slice(0, 10)}.xlsx`);
  return list.length;
}

type Result = { total: number; issue: number; reassign: number; unchanged: number; errors: { row: number; field: string; message: string }[]; preview: { assetTag: string; action: string; from?: string; to: string }[]; applied: number };

export function BulkAssignDialog({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const { toast } = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState(""); const [rows, setRows] = useState<any[]>([]);
  const [res, setRes] = useState<Result | null>(null); const [busy, setBusy] = useState(false);
  const reset = () => { setFile(""); setRows([]); setRes(null); if (ref.current) ref.current.value = ""; };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true); setRes(null); setFile(f.name);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames.find(n => nk(n) === "assignments") ?? wb.SheetNames[0]];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: true });
      const keys = (aoa[0] || []).map((h: any) => MAP[nk(h)] ?? null);
      if (!keys.includes("assetTag") || !keys.includes("employeeCode")) throw new Error("Columns 'Asset Tag' and 'Employee Code' are required — use the downloaded sheet.");
      const parsed: any[] = [];
      aoa.slice(1).forEach((line, i) => {
        if (line.every(v => String(v ?? "").trim() === "")) return;
        const r: any = { __row: i + 2 };
        keys.forEach((k, ci) => { if (k && !COLS.find(c => c.key === k)?.ref) r[k] = DATES.has(k) ? (String(line[ci] ?? "").trim() ? toIsoDate(line[ci]) : "") : String(line[ci] ?? "").trim(); });
        if (r.employeeCode) parsed.push(r);
      });
      if (!parsed.length) throw new Error("No rows with an Employee Code found.");
      setRows(parsed);
      setRes(await apiFetch<Result>("/asset-handovers/bulk-assign", { method: "POST", body: JSON.stringify({ rows: parsed, dryRun: true }) }));
    } catch (err: any) { toast({ title: "Could not read file", description: err.message, variant: "destructive" }); reset(); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!res || res.errors.length || !(res.issue + res.reassign)) return;
    if (!await confirmDialog(`Apply "${file}"?\n\n${res.issue} asset(s) will be issued and ${res.reassign} reassigned (returned from the current holder, then issued). ${res.unchanged} unchanged.\nEach creates a handover pending acknowledgement.`, { title: "Bulk assign assets", confirmText: "Apply" })) return;
    setBusy(true);
    try {
      const r = await apiFetch<Result>("/asset-handovers/bulk-assign", { method: "POST", body: JSON.stringify({ rows, dryRun: false, fileName: file }) });
      if (r.errors.length) { setRes(r); return; }
      toast({ title: "Assignments updated", description: `${r.applied} asset(s) issued / reassigned.${(r as any).archiveBatch ? ` Archived as ${(r as any).archiveBatch}.` : ""}` }); onDone?.(); onClose();
    } catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }
  const errRows = res ? new Set(res.errors.map(e => e.row)).size : 0;
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk assign assets (Excel)</DialogTitle>
          <DialogDescription>Download the current assignments, put the right Employee Code against each asset, upload. People must exist in User Master (internal or external).</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="flex items-center justify-between gap-3 rounded-[10px] border bg-accent/60 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0"><FileSpreadsheet className="w-5 h-5 text-primary shrink-0" />
              <div className="text-sm"><div className="font-semibold text-foreground">Current assignments</div><div className="text-xs text-muted-foreground">All issuable assets + a 'People' sheet with every employee code</div></div></div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={async () => { const n = await downloadAssignmentSheet(); toast({ title: `${n} assets downloaded` }); }}><Download className="w-4 h-4" />Download</Button>
          </div>
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="w-full rounded-[12px] border-2 border-dashed border-border hover:border-primary/60 hover:bg-accent/40 transition-colors px-4 py-7 text-center disabled:opacity-60">
            {busy ? <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" /> : <Upload className="w-6 h-6 mx-auto text-primary" />}
            <div className="mt-2 text-sm font-semibold text-foreground">{file || "Choose the filled assignment sheet"}</div>
            <div className="text-xs text-muted-foreground">Checked first — nothing changes until you confirm</div>
          </button>
          {res && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {([["To issue", res.issue, "text-emerald-600"], ["To reassign", res.reassign, "text-blue-600"], ["Unchanged", res.unchanged, ""], ["Rows with errors", errRows, errRows ? "text-red-600" : ""]] as [string, number, string][]).map(([k, v, c]) => (
                  <div key={k} className="rounded-[10px] border px-3 py-2"><div className="text-[11px] text-muted-foreground">{k}</div><div className={cn("text-xl font-semibold", c)}>{v}</div></div>
                ))}
              </div>
              {res.errors.length ? (
                <div className="rounded-[10px] border border-red-500/30 overflow-hidden">
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"><AlertTriangle className="w-4 h-4" />Fix these {res.errors.length} issue(s) and upload again. Nothing has been changed.</div>
                  <div className="max-h-56 overflow-y-auto"><table className="w-full text-xs"><tbody>
                    {res.errors.slice(0, 300).map((e, i) => <tr key={i} className="border-t"><td className="px-3 py-1.5 font-mono w-14">{e.row}</td><td className="px-3 py-1.5 w-32">{e.field}</td><td className="px-3 py-1.5">{e.message}</td></tr>)}
                  </tbody></table></div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2 rounded-[10px] border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-4 h-4 mt-0.5" />All rows are valid.</div>
                  {res.preview.length > 0 && <div className="rounded-[10px] border text-xs divide-y">{res.preview.map(p => (
                    <div key={p.assetTag} className="px-3 py-1.5"><span className="font-mono font-semibold text-primary">{p.assetTag}</span> · {p.action === "Reassign" ? <>from {p.from} → <b>{p.to}</b></> : <>issue to <b>{p.to}</b></>}</div>
                  ))}</div>}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-3 border-t">
          <Button onClick={apply} disabled={busy || !res || !!res.errors.length || !(res.issue + res.reassign)} className="gap-2">{busy && res ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Apply</Button>
          <Button variant="outline" onClick={onClose} disabled={busy}><X className="w-4 h-4" />Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
