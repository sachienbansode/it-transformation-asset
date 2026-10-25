import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { notify, htmlTable, esc } from "./mailer";

/*
 * Data archive: every upload (and every "Clear all") is stored as one batch in data_archive_batches / _items, with
 * the uploaded rows, the register before and after, and a field-level change summary. The same content is mailed as
 * an Excel workbook (Change Summary · New Register · Old Register) to the recipients set for the event.
 */

export const ASSET_TABLES = ["assets", "asset_vendors", "asset_allocations", "asset_transactions", "maintenance_records", "asset_licenses",
  "asset_license_assignments", "asset_contracts", "asset_contract_assets", "asset_audits", "asset_audit_items"] as const;

const REGISTER_COLS: [string, string][] = [
  ["Asset Tag", "asset_tag"], ["Asset Name", "name"], ["Asset Type", "type"], ["Serial Number", "serial_number"], ["Status", "status"],
  ["Employee Code", "owner_employee_code"], ["Assigned To", "owner_name"], ["Employee Email", "owner_email"], ["Department", "department"], ["Location", "location"],
  ["Purchase Date", "purchase_date"], ["PO Number", "purchase_order_no"], ["Invoice No", "invoice_no"], ["Cost (INR)", "cost"], ["Vendor", "vendor_name"],
  ["Warranty Start", "warranty_start"], ["Warranty Expiry", "warranty_expiry"], ["OS Version", "os_version"], ["Configuration", "configuration"],
  ["IP Address", "ip_address"], ["MAC Address", "mac_address"], ["Notes", "notes"],
];

const rowsOf = (r: any) => (r.rows ?? r) as any[];

/** The active asset register as readable rows (Excel column names). */
export async function snapshotRegister(): Promise<Record<string, any>[]> {
  const rows = rowsOf(await db.execute(sql`SELECT * FROM assets WHERE is_active = true ORDER BY asset_tag`));
  return rows.map(r => Object.fromEntries(REGISTER_COLS.map(([h, c]) => [h, r[c] === null || r[c] === undefined ? "" : c === "cost" ? Number(r[c]) : r[c]])));
}

/** Field-level differences between two registers keyed by a column (default Asset Tag). */
export function diffRows(before: Record<string, any>[], after: Record<string, any>[], key = "Asset Tag", nameCol = "Asset Name") {
  const b = new Map(before.map(r => [String(r[key]).toLowerCase(), r])), a = new Map(after.map(r => [String(r[key]).toLowerCase(), r]));
  const out: Record<string, any>[] = [];
  for (const [k, r] of a) {
    const o = b.get(k);
    if (!o) { out.push({ Change: "Added", [key]: r[key], Item: r[nameCol], Field: "", "Old Value": "", "New Value": "" }); continue; }
    for (const f of Object.keys(r)) {
      if (f === key) continue;
      const ov = String(o[f] ?? ""), nv = String(r[f] ?? "");
      if (ov !== nv) out.push({ Change: "Modified", [key]: r[key], Item: r[nameCol], Field: f, "Old Value": ov, "New Value": nv });
    }
  }
  for (const [k, o] of b) if (!a.has(k)) out.push({ Change: "Removed", [key]: o[key], Item: o[nameCol], Field: "", "Old Value": "", "New Value": "" });
  const order: Record<string, number> = { Added: 0, Modified: 1, Removed: 2 };
  return out.sort((x, y) => order[x.Change] - order[y.Change] || String(x[key]).localeCompare(String(y[key])));
}

export function workbook(sheets: { name: string; rows: Record<string, any>[]; note?: string }[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const rows = s.rows.length ? s.rows : [{ Info: s.note || "No rows" }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const cols = Object.keys(rows[0]);
    ws["!cols"] = cols.map(c => ({ wch: Math.min(48, Math.max(10, c.length + 2, ...rows.slice(0, 200).map(r => String(r[c] ?? "").length + 1))) }));
    ws["!autofilter"] = { ref: ws["!ref"]! };
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function createBatch(b: { kind: string; module: string; title: string; fileName?: string | null; rowCount: number; summary: any; by: string; sections: Record<string, any[]> }) {
  const r = rowsOf(await db.execute(sql`INSERT INTO data_archive_batches (batch_no, kind, module, title, file_name, row_count, summary, created_by)
    VALUES (${"TMP-" + Date.now() + Math.random()}, ${b.kind}, ${b.module}, ${b.title}, ${b.fileName ?? null}, ${b.rowCount}, ${JSON.stringify(b.summary)}::jsonb, ${b.by}) RETURNING id, created_at`))[0];
  const batchNo = `ARC-${new Date().getFullYear()}-${String(r.id).padStart(5, "0")}`;
  await db.execute(sql`UPDATE data_archive_batches SET batch_no = ${batchNo} WHERE id = ${r.id}`);
  for (const [section, payload] of Object.entries(b.sections)) {
    await db.execute(sql`INSERT INTO data_archive_items (batch_id, section, row_count, payload) VALUES (${r.id}, ${section}, ${payload.length}, ${JSON.stringify(payload)}::jsonb)`);
  }
  return { id: r.id as number, batchNo };
}

export async function batchSections(id: number) {
  const items = rowsOf(await db.execute(sql`SELECT section, payload FROM data_archive_items WHERE batch_id = ${id} ORDER BY id`));
  return Object.fromEntries(items.map(i => [i.section, i.payload as any[]]));
}

const KIND_SHEETS: Record<string, { label: string; sheets: [string, string][] }> = {
  asset_register_upload: { label: "Asset register upload", sheets: [["Change Summary", "changes"], ["New Asset Register", "after"], ["Old Asset Register", "before"], ["Uploaded Rows", "uploaded"]] },
  asset_bulk_assign: { label: "Bulk assignment upload", sheets: [["Change Summary", "changes"], ["New Asset Register", "after"], ["Old Asset Register", "before"], ["Uploaded Rows", "uploaded"]] },
  asset_finance_upload: { label: "Purchase / cost / warranty upload", sheets: [["Change Summary", "changes"], ["New Asset Register", "after"], ["Old Asset Register", "before"], ["Uploaded Rows", "uploaded"]] },
  kpi_upload: { label: "KPI upload", sheets: [["Change Summary", "changes"], ["New KPI Set", "after"], ["Old KPI Set", "before"]] },
};

/** Excel for any batch (download from the Archive page, and the email attachment). */
export async function batchWorkbook(id: number) {
  const [b] = rowsOf(await db.execute(sql`SELECT * FROM data_archive_batches WHERE id = ${id}`));
  if (!b) throw new Error("Archive batch not found");
  const s = await batchSections(id);
  const info = [{ Item: "Batch", Value: b.batch_no }, { Item: "Type", Value: KIND_SHEETS[b.kind]?.label || (b.kind === "asset_clear" ? "Asset data cleared (archived)" : b.kind) },
    { Item: "Title", Value: b.title }, { Item: "File", Value: b.file_name || "—" }, { Item: "By", Value: b.created_by }, { Item: "At", Value: new Date(b.created_at).toLocaleString("en-IN") },
    ...Object.entries(b.summary || {}).filter(([, v]) => typeof v !== "object").map(([k, v]) => ({ Item: k, Value: v }))];
  let sheets: { name: string; rows: any[]; note?: string }[];
  if (b.kind === "asset_clear") {
    sheets = [{ name: "Summary", rows: info }, { name: "Archived Asset Register", rows: s.register || [] },
      ...ASSET_TABLES.filter(t => t !== "assets").map(t => ({ name: t.replace(/^asset_/, "").slice(0, 31), rows: (s[`table:${t}`] || []).map(flatten), note: "No rows" }))];
  } else {
    const k = KIND_SHEETS[b.kind] || { sheets: Object.keys(s).map(x => [x, x]) as [string, string][] };
    sheets = [...k.sheets.map(([name, sec]) => ({ name, rows: s[sec] || [], note: sec === "changes" ? "No changes" : "No rows" })), { name: "Batch Info", rows: info }];
  }
  const name = `${b.batch_no}_${(KIND_SHEETS[b.kind]?.label || b.kind).replace(/[^A-Za-z0-9]+/g, "_")}.xlsx`;
  return { buffer: workbook(sheets), name, batch: b };
}
const flatten = (r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v]));

/**
 * After an upload that changed the asset register: archive (uploaded rows, before, after, changes) and email.
 * `before` must be captured with snapshotRegister() before the change.
 */
export async function archiveAssetUpload(o: { kind: "asset_register_upload" | "asset_bulk_assign" | "asset_finance_upload"; fileName?: string | null; uploaded: any[]; before: Record<string, any>[]; by: string; summary: Record<string, any> }) {
  try {
    const after = await snapshotRegister();
    const changes = diffRows(o.before, after);
    const counts = { added: changes.filter(c => c.Change === "Added").length, modifiedAssets: new Set(changes.filter(c => c.Change === "Modified").map(c => c["Asset Tag"])).size, removed: changes.filter(c => c.Change === "Removed").length };
    const label = KIND_SHEETS[o.kind].label;
    const summary = { ...o.summary, ...counts, registerBefore: o.before.length, registerAfter: after.length };
    const batch = await createBatch({ kind: o.kind, module: "IT Asset Management", title: `${label}${o.fileName ? ` — ${o.fileName}` : ""}`, fileName: o.fileName, rowCount: o.uploaded.length, summary, by: o.by,
      sections: { uploaded: o.uploaded.map(({ __row, ...r }) => r), before: o.before, after, changes } });
    const { buffer, name } = await batchWorkbook(batch.id);
    void notify(o.kind, {
      subject: `${label}: ${counts.added} added, ${counts.modifiedAssets} changed${o.fileName ? ` (${o.fileName})` : ""}`,
      html: `<p><b>${esc(label)}</b> was applied to the IT asset register.</p>${htmlTable([["Archive batch", batch.batchNo], ["File", o.fileName || "—"], ["By", o.by], ["Rows in file", o.uploaded.length],
        ["Assets added", counts.added], ["Assets changed", counts.modifiedAssets], ["Assets removed", counts.removed], ["Register before → after", `${o.before.length} → ${after.length}`]])}
        <p>Attached: Change Summary, New Asset Register, Old Asset Register.</p>`,
      attachment: { name, content: buffer, contentType: XLSX_TYPE }, batchId: batch.id,
    });
    return batch.batchNo;
  } catch (e) { console.error("archiveAssetUpload failed:", e); return null; }
}
