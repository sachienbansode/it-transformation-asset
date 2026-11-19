import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmHeader } from "@/components/confirm-dialog";
import { fmtDateTime } from "@/lib/date";
import { AssetRegisterUpload } from "@/components/asset-register-upload";
import { CatalogUploadDialog } from "@/components/itsm-catalog-upload";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, DatabaseZap, History } from "lucide-react";

/* ITH-119 — Admin › Data import: template → upload → checked preview → import. One place for every master and key data set. */
type Obj = { key: string; label: string; group: string; keyNote: string; records: number; external?: boolean; columns?: { header: string; required: boolean }[] };
type Result = { total: number; create: number; update: number; errorRows: number; errorCount: number; errors: { row: number; column: string; message: string }[]; preview?: { row: number; action: string; label: string }[]; imported?: boolean };

const iso = (d: Date) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString(); return x.slice(0, 10) + (x.slice(11, 16) !== "00:00" ? " " + x.slice(11, 16) : ""); };

async function readRows(file: File) {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets["Data"] || wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "", raw: true });
  return json.map((r, i) => { const o: any = { __row: i + 2 }; for (const [k, v] of Object.entries(r)) o[k] = v instanceof Date ? iso(v) : typeof v === "number" ? String(v) : v; return o; })
    .filter(r => Object.entries(r).some(([k, v]) => k !== "__row" && String(v).trim() !== ""));
}

export default function AdminDataImport() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["data-import"], queryFn: () => apiFetch<{ objects: Obj[]; history: any[] }>("/data-import/objects") });
  const [cur, setCur] = useState<Obj | null>(null); const [file, setFile] = useState<File | null>(null); const [rows, setRows] = useState<any[]>([]);
  const [res, setRes] = useState<Result | null>(null); const [busy, setBusy] = useState(false); const [ext, setExt] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function template(o: Obj) {
    const r = await fetch(`/api/data-import/template/${o.key}`, { credentials: "include" });
    if (!r.ok) { toast({ title: "Template not available", variant: "destructive" }); return; }
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await r.blob()), download: `IT_Hub_Template_${o.key}.xlsx` }); a.click(); URL.revokeObjectURL(a.href);
  }
  function pickFile(o: Obj) { if (o.external) { setExt(o.key); return; } setCur(o); setRes(null); setFile(null); setRows([]); setTimeout(() => input.current?.click(), 0); }
  async function onFile(f: File | undefined) {
    if (!f || !cur) return; setFile(f); setBusy(true); setRes(null);
    try { const rs = await readRows(f); setRows(rs);
      const r = await apiFetch<Result>(`/data-import/${cur.key}`, { method: "POST", body: JSON.stringify({ rows: rs, dryRun: true, fileName: f.name }) }); setRes(r); }
    catch (e: any) { toast({ title: "Could not check the file", description: e.message, variant: "destructive" }); setCur(null); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function doImport() {
    if (!cur || !res) return; setBusy(true);
    try {
      const r = await apiFetch<Result>(`/data-import/${cur.key}`, { method: "POST", body: JSON.stringify({ rows, dryRun: false, fileName: file?.name }),
        headers: confirmHeader(`Import ${cur.label} from ${file?.name}: add ${res.create} and update ${res.update} record(s)?`) });
      setRes(r); toast({ title: "Imported", description: `${r.create} added, ${r.update} updated` }); qc.invalidateQueries();
    } catch (e: any) { if (!e.cancelled) toast({ title: "Not imported", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }
  const groups = [...new Set((data?.objects || []).map(o => o.group))];

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><DatabaseZap className="w-6 h-6 text-primary" />Data import</h1>
        <p className="text-sm text-muted-foreground">Bring master and key data from spreadsheets or the previous tool: download the template, fill it, upload. Every row is checked first — nothing is saved until you press Import. Suggested order: Users → Departments / Locations → Vendors → Assets / Licences → Service catalog → Tickets.</p>
      </div>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      {groups.map(g => (
        <Card key={g}><CardContent className="p-4">
          <div className="text-sm font-semibold mb-2">{g}</div>
          <div className="divide-y">
            {data!.objects.filter(o => o.group === g).map(o => (
              <div key={o.key} className="flex items-center gap-3 py-2.5 flex-wrap" data-testid={`imp-${o.key}`}>
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <div className="flex-1 min-w-[220px]"><div className="text-sm font-medium">{o.label} <span className="text-xs text-muted-foreground font-normal">· {o.records} in IT Hub</span></div><div className="text-xs text-muted-foreground">{o.keyNote}</div></div>
                {!o.external && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => template(o)}><Download className="w-3.5 h-3.5" />Template</Button>}
                <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => pickFile(o)}><Upload className="w-3.5 h-3.5" />{o.external ? "Open upload" : "Upload"}</Button>
              </div>))}
          </div>
        </CardContent></Card>))}
      {!!data?.history?.length && <Card><CardContent className="p-4">
        <div className="text-sm font-semibold mb-2 flex items-center gap-1.5"><History className="w-4 h-4" />Upload history</div>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground border-b"><th className="py-1.5">When</th><th>Data</th><th className="pl-3">File</th><th className="text-right">Rows</th><th className="text-right">Added</th><th className="text-right">Updated</th><th className="pl-4">Result</th><th>By</th></tr></thead>
          <tbody>{data.history.map(h => <tr key={h.id} className="border-b last:border-0"><td className="py-1.5">{fmtDateTime(h.at)}</td><td>{data.objects.find(o => o.key === h.object)?.label || h.object}</td><td className="pl-3 truncate max-w-[220px]">{h.fileName}</td>
            <td className="text-right">{h.total}</td><td className="text-right">{h.created}</td><td className="text-right">{h.updated}</td><td className={`pl-4 ${h.status === "Imported" ? "text-emerald-600" : "text-red-600"}`}>{h.status}{h.failed ? ` (${h.failed} rows)` : ""}</td><td>{h.by}</td></tr>)}</tbody></table></div>
      </CardContent></Card>}

      <Dialog open={!!cur && (busy || !!res)} onOpenChange={o => { if (!o && !busy) { setCur(null); setRes(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{cur?.label} — {file?.name}</DialogTitle><DialogDescription>{res?.imported ? "Import finished." : "Checked — nothing has been saved yet."}</DialogDescription></DialogHeader>
          {busy && !res && <div className="flex items-center gap-2 text-sm py-6"><Loader2 className="w-4 h-4 animate-spin" />Checking {rows.length || ""} rows…</div>}
          {res && <div className="space-y-3" data-testid="import-result">
            <div className="grid grid-cols-4 gap-2 text-center">{[["Rows", res.total, ""], ["To add", res.create, "text-emerald-600"], ["To update", res.update, "text-blue-600"], ["Rows with problems", res.errorRows, res.errorRows ? "text-red-600" : "text-emerald-600"]].map(([l, v, c]) =>
              <div key={l as string} className="rounded-lg border py-2"><div className={`text-xl font-bold ${c}`}>{v as any}</div><div className="text-[11px] text-muted-foreground">{res.imported && l === "To add" ? "Added" : res.imported && l === "To update" ? "Updated" : l}</div></div>)}</div>
            {res.imported ? <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" />Imported and recorded in the audit trail.</div>
              : res.errorRows ? <>
                <div className="flex items-center gap-2 text-sm text-red-700"><AlertTriangle className="w-4 h-4" />Fix these in the file and upload it again — the whole file is imported only when every row is correct.</div>
                <div className="max-h-72 overflow-y-auto border rounded"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr className="text-left"><th className="p-1.5">Row</th><th>Column</th><th>Problem</th></tr></thead>
                  <tbody>{res.errors.map((e, i) => <tr key={i} className="border-t"><td className="p-1.5">{e.row}</td><td>{e.column}</td><td>{e.message}</td></tr>)}</tbody></table></div>
                {res.errorCount > res.errors.length && <div className="text-xs text-muted-foreground">Showing the first {res.errors.length} of {res.errorCount} problems.</div>}
              </> : <>
                <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" />All rows are correct.</div>
                {!!res.preview?.length && <div className="text-xs space-y-0.5">{res.preview.map(p => <div key={p.row}><span className={p.action === "create" ? "text-emerald-600" : "text-blue-600"}>{p.action === "create" ? "Add" : "Update"}</span> · row {p.row} · {p.label}</div>)}{res.total > res.preview.length && <div className="text-muted-foreground">… and {res.total - res.preview.length} more</div>}</div>}
                <Button onClick={doImport} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Import {res.total} rows</Button>
              </>}
          </div>}
        </DialogContent>
      </Dialog>
      <AssetRegisterUpload open={ext === "assets"} onClose={() => { setExt(null); qc.invalidateQueries({ queryKey: ["data-import"] }); }} />
      <CatalogUploadDialog open={ext === "itsm_catalog"} onClose={() => { setExt(null); qc.invalidateQueries({ queryKey: ["data-import"] }); }} />
    </div>
  );
}
