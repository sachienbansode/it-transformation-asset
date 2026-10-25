import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ITSM Setup › Categories: download the catalog as Excel, edit it, upload it (checked first, then applied, archived and emailed). */

const COLS = [
  { key: "ticketType", header: "Ticket Type", width: 16, rule: "Service Request or Incident." },
  { key: "category", header: "Category", width: 26, rule: "Category name. Every category needs its own row with Sub-category blank." },
  { key: "subcategory", header: "Sub-category", width: 30, rule: "Blank = the category row. Filled = a sub-category under that category." },
  { key: "team", header: "Assigned Group", width: 24, rule: "Team name exactly as on the Teams sheet. Required on a category row; blank on a sub-category = same as its category." },
  { key: "days", header: "Days to Close", width: 14, rule: "Working days (Sat/Sun skipped) for the expected closure date. Blank = same as category, or T+2 if the category is blank too." },
  { key: "active", header: "Active", width: 9, rule: "Yes = add / keep. No = remove (No on a category also removes all its sub-categories). Existing tickets are not changed." },
];
const MAP: Record<string, string> = { tickettype: "ticketType", type: "ticketType", category: "category", subcategory: "subcategory", assignedgroup: "team", team: "team", assignmentgroup: "team", daystoclose: "days", days: "days", resolutiondays: "days", active: "active" };
const nk = (s: any) => String(s ?? "").toLowerCase().replace(/\(.*?\)|\*/g, "").replace(/[^a-z0-9]/g, "");

export async function downloadCatalogSheet() {
  const [rows, teams] = await Promise.all([apiFetch<any[]>("/itsm-catalog"), apiFetch<any[]>("/itsm-teams")]);
  const order = ["Service Request", "Incident"];
  const sorted: any[] = [];
  for (const t of order) {
    const of = rows.filter(r => r.ticketType === t);
    for (const c of of.filter(r => !r.subcategory)) { sorted.push(c); sorted.push(...of.filter(r => r.subcategory && r.category.toLowerCase() === c.category.toLowerCase())); }
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([COLS.map(c => c.header), ...sorted.map(r => [r.ticketType, r.category, r.subcategory ?? "", r.teamName ?? "", r.resolutionDays ?? "", "Yes"])]);
  ws["!cols"] = COLS.map(c => ({ wch: c.width }));
  XLSX.utils.book_append_sheet(wb, ws, "Categories");
  const tw = XLSX.utils.aoa_to_sheet([["Team (Assigned Group)", "Description", "Email"], ...teams.map(t => [t.name, t.description ?? "", t.email ?? ""])]);
  tw["!cols"] = [{ wch: 26 }, { wch: 50 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, tw, "Teams");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Column", "How to fill"], ...COLS.map(c => [c.header, c.rule]), [],
    ["Rows not in the file", "Left unchanged. To remove a row, keep it and set Active = No."],
    ["New team", "Create it first in ITSM Setup › Teams & members, then use its name here."],
    ["Upload", "ITSM Setup › Categories & routing › Upload. The file is checked first; nothing is saved until you confirm."]]), "Instructions");
  XLSX.writeFile(wb, `ITSM_Categories_${new Date().toISOString().slice(0, 10)}.xlsx`);
  return sorted.length;
}

type Res = { total: number; added: number; modified: number; removed: number; unchanged: number; errors: { row: number; field: string; message: string }[]; changes: any[]; applied: boolean; archiveBatch?: string | null };

export function CatalogUploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState(""); const [rows, setRows] = useState<any[]>([]); const [res, setRes] = useState<Res | null>(null); const [busy, setBusy] = useState(false);
  const reset = () => { setFileName(""); setRows([]); setRes(null); if (ref.current) ref.current.value = ""; };
  const close = () => { reset(); onClose(); };
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true); setRes(null); setFileName(f.name);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames.find(n => nk(n) === "categories") ?? wb.SheetNames[0]];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: true });
      const keys = (aoa[0] || []).map((h: any) => MAP[nk(h)] ?? null);
      if (!keys.includes("ticketType") || !keys.includes("category")) throw new Error("Header row not recognised — use the downloaded category sheet.");
      const parsed: any[] = [];
      aoa.slice(1).forEach((line, i) => {
        if (line.every(v => String(v ?? "").trim() === "")) return;
        const r: any = { __row: i + 2 }; keys.forEach((k, ci) => { if (k) r[k] = String(line[ci] ?? "").trim(); }); parsed.push(r);
      });
      if (!parsed.length) throw new Error("No rows found in the file.");
      setRows(parsed);
      setRes(await apiFetch<Res>("/itsm-catalog/import", { method: "POST", body: JSON.stringify({ rows: parsed, dryRun: true }) }));
    } catch (err: any) { toast({ title: "Could not read file", description: err.message, variant: "destructive" }); reset(); }
    finally { setBusy(false); }
  }
  const nChanges = res ? res.added + res.modified + res.removed : 0;
  async function apply() {
    if (!res || res.errors.length || !nChanges) return;
    if (!await confirmDialog(`Apply "${fileName}"?\n\n${res.added} added · ${res.modified} changed · ${res.removed} removed.\nNew tickets use the new routing; existing tickets are not changed. The old and new catalog are archived and emailed.`, { title: "Apply category upload", confirmText: "Apply" })) return;
    setBusy(true);
    try {
      const r = await apiFetch<Res>("/itsm-catalog/import", { method: "POST", body: JSON.stringify({ rows, dryRun: false, fileName }) });
      if (r.errors.length || !r.applied) { setRes(r); return; }
      ["itsm-catalog", "itsm-route", "itsm-teams"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: "Categories updated", description: `${r.added} added, ${r.modified} changed, ${r.removed} removed${r.archiveBatch ? ` — archive ${r.archiveBatch}` : ""}` });
      close();
    } catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }
  const errRows = res ? new Set(res.errors.map(e => e.row)).size : 0;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) close(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Upload categories & sub-categories</DialogTitle>
          <DialogDescription>Download the sheet (current catalog for both ticket types), edit it in Excel, then upload it. Rows not in the file are left unchanged.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border bg-accent/60 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0"><FileSpreadsheet className="w-5 h-5 text-primary shrink-0" />
              <div className="text-sm"><div className="font-semibold text-foreground">Category sheet</div><div className="text-xs text-muted-foreground">Categories, Teams and Instructions sheets</div></div></div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => { try { const n = await downloadCatalogSheet(); toast({ title: `${n} rows downloaded` }); } catch (e: any) { toast({ title: "Download failed", description: e.message, variant: "destructive" }); } }}><Download className="w-4 h-4" />Download sheet</Button>
          </div>
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="w-full rounded-[12px] border-2 border-dashed border-border hover:border-primary/60 hover:bg-accent/40 transition-colors px-4 py-7 text-center disabled:opacity-60">
            {busy ? <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" /> : <Upload className="w-6 h-6 mx-auto text-primary" />}
            <div className="mt-2 text-sm font-semibold text-foreground">{fileName || "Choose the filled category sheet (.xlsx)"}</div>
            <div className="text-xs text-muted-foreground">Checked first — nothing is saved until you confirm</div>
          </button>
          {res && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                {([["Added", res.added, "text-emerald-600"], ["Changed", res.modified, "text-blue-600"], ["Removed", res.removed, "text-amber-600"], ["Rows with errors", errRows, errRows ? "text-red-600" : ""]] as const).map(([l, v, c]) =>
                  <div key={l} className="rounded-[10px] border px-3 py-2"><div className="text-xs text-muted-foreground">{l}</div><div className={cn("text-xl font-semibold", c)}>{v}</div></div>)}
              </div>
              {res.errors.length === 0 ? (
                <div className="flex items-start gap-2 rounded-[10px] border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{nChanges ? `${nChanges} change(s) ready. ${res.unchanged} row(s) unchanged.` : "Nothing to change — the file matches the catalog."}</span>
                </div>
              ) : (
                <div className="rounded-[10px] border border-red-500/30 overflow-hidden">
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"><AlertTriangle className="w-4 h-4" />Fix these {res.errors.length} issue(s) and upload again. Nothing has been saved.</div>
                  <div className="max-h-56 overflow-y-auto"><table className="w-full text-xs"><tbody>
                    {res.errors.slice(0, 300).map((e, i) => <tr key={i} className="border-t"><td className="px-3 py-1.5 font-mono w-14">Row {e.row}</td><td className="px-3 py-1.5 w-32">{e.field}</td><td className="px-3 py-1.5">{e.message}</td></tr>)}
                  </tbody></table></div>
                </div>
              )}
              {!!res.changes.length && !res.errors.length && (
                <div className="rounded-[10px] border text-xs divide-y max-h-64 overflow-y-auto">
                  {res.changes.map((c, i) => <div key={i} className="px-3 py-1.5"><span className={cn("font-semibold", c.Change === "Added" ? "text-emerald-600" : c.Change === "Removed" ? "text-amber-600" : "text-blue-600")}>{c.Change}</span> {c["Ticket Type"]} · {c.Category}{c["Sub-category"] ? ` › ${c["Sub-category"]}` : ""}{c.Change === "Modified" ? ` — ${c.Before}` : c.Change === "Added" ? ` — group: ${c["Assigned Group"]}, days: ${c["Days to Close"]}` : ""}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-start gap-2 pt-3 border-t">
          <Button onClick={apply} disabled={busy || !res || !!res.errors.length || !nChanges} className="gap-2">{busy && res ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Apply changes</Button>
          <Button variant="outline" onClick={close} disabled={busy}><X className="w-4 h-4" />Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
