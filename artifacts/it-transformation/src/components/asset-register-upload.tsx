import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";

/* Single source of truth for the asset register file layout.
   Template download, upload parsing and the server-side import all use these columns. */
export const ASSET_TYPES = ["Laptop", "Desktop", "Server", "Network Switch", "Firewall", "Access Point", "Printer", "Tablet", "Mobile", "Storage", "UPS", "Others"];
export const ASSET_STATUSES = ["In Stock", "Allocated", "In Use", "Under Maintenance", "Retired"]; // statuses allowed on upload

const COLUMNS: { header: string; key: string; required?: boolean; width: number; rule: string; sample: string[] }[] = [
  { header: "Asset Tag", key: "assetTag", width: 14, rule: "Optional. Leave blank to auto-generate (e.g. LAP-0001). Must be unique.", sample: ["SAMPLE-001", "SAMPLE-002", "SAMPLE-003"] },
  { header: "Asset Name", key: "name", required: true, width: 26, rule: "Required. Model / description.", sample: ["Dell Latitude 5540", "HP ProLiant DL380 Gen11", "Cisco Catalyst 9300 48P"] },
  { header: "Asset Type", key: "type", required: true, width: 16, rule: `Required. One of: ${ASSET_TYPES.join(", ")}`, sample: ["Laptop", "Server", "Network Switch"] },
  { header: "Serial Number", key: "serialNumber", required: true, width: 18, rule: "Required. Unique per asset type.", sample: ["DL5540-AB12C", "CZ2401XY7Q", "FOC2435L1KM"] },
  { header: "Status", key: "status", width: 16, rule: `Optional (default In Stock, or Allocated when Employee Code is filled). One of: ${ASSET_STATUSES.join(", ")}`, sample: ["Allocated", "In Use", "In Stock"] },
  { header: "Assigned To", key: "ownerName", width: 20, rule: "For your reference only — the holder's name is taken from User Master using the Employee Code.", sample: ["Rohan Mehta", "", ""] },
  { header: "Employee Code", key: "ownerEmployeeCode", width: 14, rule: "Required when Status is Allocated. Must exist in Admin › User Master (internal or external person). Creates a handover pending acknowledgement.", sample: ["EMP1042", "", ""] },
  { header: "Employee Email", key: "ownerEmail", width: 26, rule: "For your reference only — the login email is taken from User Master.", sample: ["rohan.mehta@example.com", "", ""] },
  { header: "Department", key: "department", width: 18, rule: "Optional.", sample: ["Broking IT", "Infrastructure", "Network"] },
  { header: "Location", key: "location", width: 18, rule: "Optional. Office / DC / rack.", sample: ["Mumbai HO - 4th Floor", "Mumbai DC - Rack A3", "Mumbai DC - Rack B1"] },
  { header: "Purchase Date", key: "purchaseDate", width: 14, rule: "Optional. YYYY-MM-DD", sample: ["2025-04-15", "2024-11-02", "2025-01-20"] },
  { header: "PO Number", key: "purchaseOrderNo", width: 16, rule: "Optional.", sample: ["PO/IT/2025/0412", "PO/IT/2024/1187", "PO/IT/2025/0058"] },
  { header: "Cost (INR)", key: "cost", width: 12, rule: "Optional. Number only, no currency symbol.", sample: ["92500", "865000", "412000"] },
  { header: "Vendor", key: "vendorName", required: true, width: 20, rule: "Required. New vendor names are added to the vendor list automatically.", sample: ["Dell Technologies", "HP Enterprise", "Cisco Systems"] },
  { header: "Warranty Expiry", key: "warrantyExpiry", width: 15, rule: "Optional. YYYY-MM-DD", sample: ["2028-04-14", "2027-11-01", "2030-01-19"] },
  { header: "IP Address", key: "ipAddress", width: 15, rule: "Optional.", sample: ["", "10.10.20.15", "10.10.1.2"] },
  { header: "MAC Address", key: "macAddress", width: 18, rule: "Optional.", sample: ["", "3C:A8:2A:1F:00:B4", "70:E4:22:9C:41:0A"] },
  { header: "OS Version", key: "osVersion", width: 18, rule: "Optional.", sample: ["Windows 11 Pro 23H2", "RHEL 9.4", "IOS-XE 17.9"] },
  { header: "Configuration", key: "configuration", width: 26, rule: "Optional. CPU / RAM / storage etc.", sample: ["i7-1365U / 16GB / 512GB SSD", "2x Xeon Gold 6430 / 512GB / 8x1.92TB", "48x1G PoE+ / 4x10G uplink"] },
  { header: "Notes", key: "notes", width: 26, rule: "Optional.", sample: ["", "Production DB node", "Core access switch"] },
];

const norm = (s: string) => String(s).toLowerCase().replace(/\(.*?\)|\*/g, "").replace(/[^a-z0-9]/g, "");
const HEADER_MAP: Record<string, string> = Object.fromEntries(COLUMNS.flatMap(c => [[norm(c.header), c.key], [norm(c.key), c.key]]));
Object.assign(HEADER_MAP, { employeecode: "ownerEmployeeCode", empcode: "ownerEmployeeCode", employeeemail: "ownerEmail", email: "ownerEmail", tag: "assetTag", name: "name", type: "type", serial: "serialNumber", serialno: "serialNumber", owner: "ownerName", ownername: "ownerName", cost: "cost", vendorname: "vendorName", ponumber: "purchaseOrderNo", pono: "purchaseOrderNo", warranty: "warrantyExpiry" });

export function toIsoDate(v: any): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const p = XLSX.SSF.parse_date_code(v);
    if (p) return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // DD-MM-YYYY → YYYY-MM-DD
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s;
}

export function downloadAssetTemplate() {
  const wb = XLSX.utils.book_new();
  const header = COLUMNS.map(c => (c.required ? `${c.header} *` : c.header));
  const samples = [0, 1, 2].map(i => COLUMNS.map(c => c.sample[i] ?? ""));
  const ws = XLSX.utils.aoa_to_sheet([header, ...samples]);
  ws["!cols"] = COLUMNS.map(c => ({ wch: c.width }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as any;
  XLSX.utils.book_append_sheet(wb, ws, "Asset Register");

  const info = XLSX.utils.aoa_to_sheet([
    ["Asset Register Upload — Instructions"],
    [""],
    ["1. Fill one asset per row on the 'Asset Register' sheet. Keep the header row as it is."],
    ["2. Delete the three SAMPLE rows before uploading — rows with a SAMPLE- asset tag are rejected."],
    ["3. Columns marked * are required. Dates must be YYYY-MM-DD (DD-MM-YYYY is also accepted)."],
    ["4. The upload is validated first; nothing is saved until every row passes and you confirm."],
    [""],
    ["Column", "Required", "Rule / allowed values", "Example"],
    ...COLUMNS.map(c => [c.header, c.required ? "Yes" : "No", c.rule, c.sample[0] || c.sample[1] || ""]),
  ]);
  info["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 90 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, info, "Instructions");

  const lists = XLSX.utils.aoa_to_sheet([["Asset Type", "Status"], ...Array.from({ length: Math.max(ASSET_TYPES.length, ASSET_STATUSES.length) }, (_, i) => [ASSET_TYPES[i] ?? "", ASSET_STATUSES[i] ?? ""])]);
  lists["!cols"] = [{ wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, lists, "Allowed Values");

  XLSX.writeFile(wb, "Asset_Register_Template.xlsx");
}

type ImportResult = { total: number; valid: number; errors: { row: number; field: string; message: string }[]; generatedTags: number; inserted: number; dryRun: boolean; newMasters?: { departments: string[]; locations: string[] }; archiveBatch?: string | null };

async function parseFile(file: File): Promise<any[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find(n => norm(n) === "assetregister") ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: true });
  if (aoa.length < 2) return [];
  const keys = aoa[0].map((h: any) => HEADER_MAP[norm(h)] ?? null);
  if (!keys.includes("name") || !keys.includes("type")) throw new Error("Header row not recognised. Please use the downloaded template.");
  const rows: any[] = [];
  aoa.slice(1).forEach((line, i) => {
    if (line.every(v => String(v ?? "").trim() === "")) return;
    const r: any = { __row: i + 2 };
    keys.forEach((k, ci) => {
      if (!k) return;
      const v = line[ci];
      r[k] = k === "purchaseDate" || k === "warrantyExpiry" ? toIsoDate(v) : v instanceof Date ? toIsoDate(v) : String(v ?? "").trim();
    });
    rows.push(r);
  });
  return rows;
}

export function AssetRegisterUpload({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setFileName(""); setRows([]); setResult(null); if (fileRef.current) fileRef.current.value = ""; };
  const close = () => { reset(); onClose(); };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { toast({ title: "Please choose an .xlsx or .csv file", variant: "destructive" }); return; }
    setBusy(true); setResult(null); setFileName(f.name);
    try {
      const parsed = await parseFile(f);
      if (!parsed.length) throw new Error("No asset rows found in the file.");
      setRows(parsed);
      const r = await apiFetch<ImportResult>("/assets/import", { method: "POST", body: JSON.stringify({ rows: parsed, dryRun: true, fileName: f.name }) });
      setResult(r);
    } catch (err: any) {
      toast({ title: "Could not read file", description: err.message, variant: "destructive" });
      reset();
    } finally { setBusy(false); }
  }

  async function doImport() {
    if (!result || result.errors.length) return;
    const ok = await confirmDialog(
      `Import ${rows.length} asset${rows.length === 1 ? "" : "s"} from "${fileName}" into the asset register?` +
      (result.generatedTags ? `\n\n${result.generatedTags} asset tag(s) will be generated automatically.` : "") +
      `\nNew vendor names will be added to the vendor list.`,
      { title: "Upload asset register", confirmText: "Import assets" });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await apiFetch<ImportResult>("/assets/import", { method: "POST", body: JSON.stringify({ rows, dryRun: false, fileName }) });
      if (r.errors?.length) { setResult(r); toast({ title: "Upload rejected", description: "Some rows failed validation — nothing was saved.", variant: "destructive" }); return; }
      ["assets", "assets-stats", "asset-vendors", "asset-transactions"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      ["masters", "masters-admin-all"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: "Asset register uploaded", description: `${r.inserted} assets imported.${r.archiveBatch ? ` Archived as ${r.archiveBatch}; change summary emailed to the configured recipients.` : ""}` });
      close();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  const errorRows = result ? new Set(result.errors.map(e => e.row)).size : 0;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) close(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Upload Asset Register</DialogTitle>
          <DialogDescription>Download the template, fill in your assets, then upload the file. Every row is checked before anything is saved.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="flex items-center justify-between gap-3 rounded-[10px] border bg-accent/60 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <FileSpreadsheet className="w-5 h-5 text-primary shrink-0" />
              <div className="text-sm min-w-0">
                <div className="font-semibold text-foreground">Asset_Register_Template.xlsx</div>
                <div className="text-xs text-muted-foreground">{COLUMNS.length} columns, 3 sample rows, instructions and allowed values</div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={downloadAssetTemplate}><Download className="w-4 h-4" />Template</Button>
          </div>

          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
            className="w-full rounded-[12px] border-2 border-dashed border-border hover:border-primary/60 hover:bg-accent/40 transition-colors px-4 py-7 text-center disabled:opacity-60">
            {busy ? <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" /> : <Upload className="w-6 h-6 mx-auto text-primary" />}
            <div className="mt-2 text-sm font-semibold text-foreground">{fileName || "Choose the filled asset register (.xlsx or .csv)"}</div>
            <div className="text-xs text-muted-foreground">{fileName ? "Click to choose a different file" : "Validated before import — nothing is saved until you confirm"}</div>
          </button>

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-[10px] border px-3 py-2"><div className="text-xs text-muted-foreground">Rows in file</div><div className="text-xl font-semibold text-foreground">{result.total}</div></div>
                <div className="rounded-[10px] border px-3 py-2"><div className="text-xs text-muted-foreground">Ready to import</div><div className="text-xl font-semibold text-emerald-600">{result.valid}</div></div>
                <div className="rounded-[10px] border px-3 py-2"><div className="text-xs text-muted-foreground">Rows with errors</div><div className={`text-xl font-semibold ${errorRows ? "text-red-600" : "text-foreground"}`}>{errorRows}</div></div>
              </div>

              {result.errors.length === 0 ? (
                <div className="flex items-start gap-2 rounded-[10px] border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>All rows passed validation.{result.generatedTags ? ` ${result.generatedTags} asset tag(s) will be auto-generated.` : ""}
                    {!!result.newMasters?.departments.length && <><br />New departments added to Master Data: <b>{result.newMasters.departments.join(", ")}</b></>}
                    {!!result.newMasters?.locations.length && <><br />New locations added to Master Data: <b>{result.newMasters.locations.join(", ")}</b></>}
                    <br />A copy is kept in the Archive and the change summary is emailed.</span>
                </div>
              ) : (
                <div className="rounded-[10px] border border-red-500/30 overflow-hidden">
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Fix these {result.errors.length} issue(s) in the file and upload again. Nothing has been saved.
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead><tr><th className="text-left px-3 py-2 w-16">Row</th><th className="text-left px-3 py-2 w-36">Column</th><th className="text-left px-3 py-2">Problem</th></tr></thead>
                      <tbody>
                        {result.errors.slice(0, 300).map((e, i) => (
                          <tr key={i} className="border-t"><td className="px-3 py-1.5 font-mono">{e.row}</td><td className="px-3 py-1.5">{e.field}</td><td className="px-3 py-1.5">{e.message}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-start gap-2 pt-3 border-t">
          <Button onClick={doImport} disabled={busy || !result || result.errors.length > 0} className="gap-2">
            {busy && result ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {result && !result.errors.length ? `Import ${result.valid} assets` : "Import assets"}
          </Button>
          <Button variant="outline" onClick={close} disabled={busy}><X className="w-4 h-4" />Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
