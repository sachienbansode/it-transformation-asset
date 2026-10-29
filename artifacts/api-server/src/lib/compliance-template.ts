import * as XLSX from "xlsx";
import { fillWorkbook, type CellWrite } from "./xlsx-fill";
import { fmtDate, nowStamp } from "./dates";

/*
 * Audit checklist workbook → template. Generic rules, so any auditor's Excel can be imported:
 *  - A sheet whose header row has "Audit Checklist" (or "Checkpoint") → tracked checkpoints. Blank Sr No / heading cells
 *    inherit from the row above (continuation lines of the same checkpoint get seq 2, 3 …).
 *  - A sheet whose header row has "Particulars" and "Type" → policy / procedure register (tracked like checkpoints).
 *  - "Index" / summary sheets are skipped (the app computes the summary).
 *  - Every other sheet → an editable grid (IT environment, in-scope applications, vendor agreements, samples …).
 */

export const STATUSES = ["Pending", "In Progress", "Submitted", "Under Review", "Partially Closed", "Closed", "Closed-Obs", "Not Applicable"];
export const CLOSED = ["Closed", "Closed-Obs", "Not Applicable"];
export const TEAM_STATUSES = ["Pending", "In Progress", "Submitted"];
export const AUDITOR_STATUSES = ["Under Review", "Partially Closed", "Closed", "Closed-Obs", "Not Applicable"];
// ↑ built-in defaults; refreshed in place from the status master by lib/compliance-status.ts

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clean = (v: unknown) => String(v ?? "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
const oneLine = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").replace(/\s*\(/g, " (").trim();
const PLACEHOLDER = /^walkthrough\s*:?\s*evidence\s*:?$/i;

export type TItem = { kind: "checklist" | "policy"; sheet: string; sourceRow: number; refNo: string | null; seq: number; area: string | null; subArea: string | null; checkpoint: string; evidenceRequired: string | null; docType: string | null; ownerText?: string | null; spocText?: string | null; managementReply?: string | null; auditorRemarks?: string | null; status: string; sortOrder: number };
export type Merge = { r: number; c: number; rs: number; cs: number };
export type TGrid = { sheet: string; sortOrder: number; grid: string[][]; merges: Merge[] };

function findHeader(aoa: any[][], test: (cells: string[]) => boolean) {
  for (let i = 0; i < Math.min(aoa.length, 15); i++) { const cells = (aoa[i] || []).map(norm); if (test(cells)) return i; }
  return -1;
}
const col = (cells: string[], ...names: string[]) => cells.findIndex(c => names.some(n => c === n || c.startsWith(n)));

/** Merged cells of a sheet, relative to the grid (only those inside it). */
export function mergesOf(ws: XLSX.WorkSheet, rows: number, width: number): Merge[] {
  const rg = XLSX.utils.decode_range(ws["!ref"] || "A1");
  return ((ws["!merges"] || []) as XLSX.Range[]).map(m => ({ r: m.s.r - rg.s.r, c: m.s.c - rg.s.c, rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 }))
    .filter(m => m.r >= 0 && m.c >= 0 && m.r < rows && m.c < width && (m.rs > 1 || m.cs > 1)).map(m => ({ ...m, rs: Math.min(m.rs, rows - m.r), cs: Math.min(m.cs, width - m.c) }));
}
/** Merges for named sheets of an uploaded workbook (used to back-fill templates imported before merges were kept). */
export function sheetMerges(buf: Buffer, sheets: { sheet: string; rows: number; width: number }[]) {
  const wb = XLSX.read(buf, { type: "buffer" });
  return Object.fromEntries(sheets.map(x => [x.sheet, wb.Sheets[x.sheet] ? mergesOf(wb.Sheets[x.sheet], x.rows, x.width) : []]));
}

export function parseWorkbook(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const items: TItem[] = []; const grids: TGrid[] = []; const skipped: string[] = [];
  let order = 0;
  wb.SheetNames.forEach((name, si) => {
    const ws = wb.Sheets[name];
    // a text cell typed starting with "=" or "=-" becomes a broken formula (#NAME? in Excel) — keep its text
    for (const k of Object.keys(ws)) { const c: any = (ws as any)[k]; if (k[0] !== "!" && c && c.t === "e" && c.f) { c.t = "s"; c.v = c.w = String(c.f).replace(/^=+\s*/, ""); delete c.f; } }
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: true });
    if (/^(index|summary|cover)$/i.test(name.trim())) { skipped.push(name); return; }
    const ch = findHeader(aoa, c => c.some(x => x === "audit checklist" || x === "checkpoint" || x === "control"));
    const ph = findHeader(aoa, c => c.includes("particulars") && c.includes("type"));
    if (ch >= 0) {
      const h = (aoa[ch] || []).map(norm);
      const ci = { ref: col(h, "sr no", "sr", "ref", "point no"), area: col(h, "audit objective heading", "audit objective", "area", "domain"), sub: col(h, "sub heading", "sub area"),
        cp: col(h, "audit checklist", "checkpoint", "control"), ev: col(h, "clarifications", "evidences required", "evidence", "requirements"), owner: col(h, "person responsible", "owner"),
        spoc: col(h, "spoc"), reply: col(h, "management reply", "management response"), remarks: col(h, "auditors remarks", "auditor remarks", "auditor s remarks"), status: col(h, "status") };
      let ref: string | null = null, area: string | null = null, sub: string | null = null, seq = 0;
      for (let r = ch + 1; r < aoa.length; r++) {
        const line = aoa[r] || []; const g = (i: number) => (i >= 0 ? line[i] : "");
        const cp = clean(g(ci.cp)); if (!cp) continue;
        const nRef = oneLine(g(ci.ref)), nArea = oneLine(g(ci.area)), nSub = oneLine(g(ci.sub));
        if (nArea) area = nArea;
        if (nRef && nRef !== ref) { ref = nRef; seq = 0; if (!nSub) sub = null; }
        if (nSub) sub = nSub;
        seq++;
        const remarks = clean(g(ci.remarks)); const st = oneLine(g(ci.status));
        items.push({ kind: "checklist", sheet: name, sourceRow: r + 1, refNo: ref, seq, area, subArea: sub, checkpoint: cp, evidenceRequired: clean(g(ci.ev)) || null,
          docType: null, ownerText: oneLine(g(ci.owner)) || null, spocText: oneLine(g(ci.spoc)) || null, managementReply: clean(g(ci.reply)) || null,
          auditorRemarks: PLACEHOLDER.test(oneLine(remarks)) ? null : remarks || null, status: STATUSES.find(s => s.toLowerCase() === st.toLowerCase()) || "Pending", sortOrder: ++order });
      }
      return;
    }
    if (ph >= 0) {
      const h = (aoa[ph] || []).map(norm);
      const ci = { type: col(h, "type"), point: col(h, "point no", "point", "ref"), part: col(h, "particulars"), owner: col(h, "person responsible", "owner"), status: col(h, "status") };
      for (let r = ph + 1; r < aoa.length; r++) {
        const line = aoa[r] || []; const g = (i: number) => (i >= 0 ? line[i] : "");
        const part = clean(g(ci.part)); if (!part) continue;
        const st = oneLine(g(ci.status));
        items.push({ kind: "policy", sheet: name, sourceRow: r + 1, refNo: oneLine(g(ci.point)) || null, seq: 1, area: null, subArea: null, checkpoint: part, evidenceRequired: null,
          docType: oneLine(g(ci.type)) || "Policy", ownerText: oneLine(g(ci.owner)) || null, status: STATUSES.find(s => s.toLowerCase() === st.toLowerCase()) || "Pending", sortOrder: ++order });
      }
      return;
    }
    // grid: trim to the used area, drop navigation cells
    const rows = aoa.map(l => (l || []).map(v => (/^back to index$/i.test(String(v).trim()) || String(v).trim() === "`" ? "" : String(v ?? "").replace(/\r/g, ""))));
    let lastR = -1, lastC = -1;
    rows.forEach((l, r) => l.forEach((v, c) => { if (String(v).trim()) { lastR = Math.max(lastR, r); lastC = Math.max(lastC, c); } }));
    if (lastR < 0) { skipped.push(name); return; }
    const width = Math.max(2, Math.min(lastC + 1, 30));   // label-only sheets (e.g. password settings) get a value column
    const grid = rows.slice(0, Math.min(lastR + 1, 500)).map(l => Array.from({ length: width }, (_, c) => String(l[c] ?? "")));
    // a table that ends at its header row (sample sheets) gets 10 empty rows to fill
    if (grid.length === 1) for (let i = 0; i < 10; i++) grid.push(Array(width).fill(""));
    grids.push({ sheet: name, sortOrder: si, grid, merges: mergesOf(ws, grid.length, width) });
  });
  return { items, grids, skipped, sheets: wb.SheetNames };
}

/* Export: rebuild the auditor's workbook (same sheets, columns and rows) with today's values. */
export function exportWorkbook(o: { audit: any; items: any[]; grids: any[]; users: Map<number, string>; docsByItem: Map<number, string[]> }) {
  const wb = XLSX.utils.book_new();
  const check = o.items.filter(i => i.kind === "checklist"), pol = o.items.filter(i => i.kind === "policy");
  const count = (s: string) => check.filter(i => i.status === s).length;
  const total = check.length || 1;
  const idx: any[][] = [["Overall Status"], [`${o.audit.companyName} — ${o.audit.title}`], ["Sr No", "Status", "Count", "%"]];
  const base = ["Not Applicable", "Pending", "In Progress", "Submitted", "Partially Closed", "Under Review", "Closed", "Closed-Obs"];
  [...base, ...STATUSES.filter(x => !base.includes(x))].forEach((s, i) => idx.push([i + 1, s, count(s), +(count(s) / total).toFixed(4)]));
  idx.push(["", "Total", check.length, 1]);
  idx.push(["Total Closure", "", check.filter(i => CLOSED.includes(i.status)).length, +(check.filter(i => CLOSED.includes(i.status)).length / total).toFixed(4)]);
  idx.push([]); idx.push(["Exported", nowStamp()]);
  const wsI = XLSX.utils.aoa_to_sheet(idx); wsI["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsI, "Index");
  const name = (id: number | null) => (id ? o.users.get(id) ?? "" : "");
  const sheets = [...new Set(o.items.map(i => i.sheet))];
  const order: { sheet: string; at: number }[] = [...sheets.map(s => ({ sheet: s, at: o.items.find(i => i.sheet === s)!.sortOrder })), ...o.grids.map(g => ({ sheet: g.sheet, at: 100000 + g.sortOrder }))];
  for (const { sheet } of order) {
    const g = o.grids.find(x => x.sheet === sheet);
    let aoa: any[][];
    if (g) aoa = g.grid;
    else if (pol.some(i => i.sheet === sheet)) {
      aoa = [["Sr No", "Type", "Point No", "Particulars", "Person Responsible", "Document Reference", "Last Review Date", "Status", "Management Reply", "Auditors Remarks"],
        ...pol.filter(i => i.sheet === sheet).map((i, n) => [n + 1, i.docType, i.refNo, i.checkpoint, name(i.ownerUserId), (o.docsByItem.get(i.id) || []).join("\n"), fmtDate(i.lastReviewDate), i.status, i.managementReply || "", i.auditorRemarks || ""])];
    } else {
      aoa = [["Sr No", "Audit Objective Heading", "Sub-Heading", "Audit Checklist", "Clarifications / Evidences Required", "Person Responsible", "Spoc", "Management Reply", "Auditors Remarks", "Status", "Evidence Reference", "Target Date"],
        ...check.filter(i => i.sheet === sheet).map(i => [i.seq === 1 ? i.refNo : "", i.seq === 1 ? i.area : "", i.seq === 1 ? i.subArea : "", i.checkpoint, i.evidenceRequired || "", name(i.ownerUserId), name(i.spocUserId), i.managementReply || "", i.auditorRemarks || "", i.status, (o.docsByItem.get(i.id) || []).join("\n"), fmtDate(i.targetDate)])];
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = g ? (aoa[0] || []).map(() => ({ wch: 24 })) : aoa[0].length === 10 ? [6, 12, 10, 50, 20, 30, 20, 40, 40, 14].map(w => ({ wch: w })) : [6, 22, 22, 60, 45, 18, 18, 45, 45, 14, 40, 12].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/* Export in the auditor's own workbook: the uploaded file with today's values written into its cells (formatting kept). */
export function exportIntoOriginal(orig: Buffer, o: { audit: any; items: any[]; grids: any[]; users: Map<number, string>; docsByItem: Map<number, string[]> }) {
  const wb = XLSX.read(orig, { type: "buffer" });
  const name = (id: number | null) => (id ? o.users.get(id) ?? "" : "");
  const fmt = (d: any) => fmtDate(d ? String(d).slice(0, 10) : "");
  const writes: Record<string, CellWrite[]> = {};
  const W = (sheet: string, w: CellWrite) => (writes[sheet] ||= []).push(w);
  for (const sheet of new Set(o.items.map(i => i.sheet))) {
    const ws = wb.Sheets[sheet]; if (!ws) continue;
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: true });
    const start = XLSX.utils.decode_range(ws["!ref"] || "A1"); const R0 = start.s.r, C0 = start.s.c;
    const list = o.items.filter(i => i.sheet === sheet);
    const isPolicy = list[0]?.kind === "policy";
    const hr = findHeader(aoa, isPolicy ? (c => c.includes("particulars") && c.includes("type")) : (c => c.some(x => x === "audit checklist" || x === "checkpoint" || x === "control")));
    if (hr < 0) continue;
    const h = (aoa[hr] || []).map(norm);
    const lastHeader = h.reduce((m, v, i) => (v ? i : m), 0);
    const cols = isPolicy
      ? { owner: col(h, "person responsible", "owner"), doc: col(h, "document reference"), review: col(h, "last review date"), status: col(h, "status"), reply: col(h, "management reply"), remarks: col(h, "auditors remarks", "auditor remarks") }
      : { owner: col(h, "person responsible", "owner"), spoc: col(h, "spoc"), reply: col(h, "management reply", "management response"), remarks: col(h, "auditors remarks", "auditor remarks", "auditor s remarks"), status: col(h, "status"), doc: -1, review: -1 };
    // columns the template does not have are added after its last header (header styled like the last header cell)
    let next = lastHeader + 1;
    const ensure = (key: string, label: string) => { if ((cols as any)[key] >= 0) return; (cols as any)[key] = next; W(sheet, { row: R0 + hr, col: C0 + next, value: label, styleFrom: { row: R0 + hr, col: C0 + lastHeader } }); next++; };
    if (isPolicy) { ensure("reply", "Management Reply"); ensure("remarks", "Auditors Remarks"); }
    else { ensure("doc", "Evidence Reference"); }
    ensure("target", "Target Date"); ensure("shared", "Shared with Auditor");
    for (const i of list) {
      const r = (i.sourceRow ?? 0) - 1; if (r < 0) continue;
      const put = (k: string, v: any) => { const c = (cols as any)[k]; if (c === undefined || c < 0) return; W(sheet, { row: R0 + r, col: C0 + c, value: v ?? "", styleFrom: { row: R0 + r, col: C0 + (cols.reply >= 0 && cols.reply <= lastHeader ? cols.reply : lastHeader) } }); };
      put("owner", name(i.ownerUserId));
      if (!isPolicy) put("spoc", name(i.spocUserId));
      put("reply", i.managementReply || "");
      put("remarks", i.auditorRemarks || "");
      put("status", i.status);
      put("doc", (o.docsByItem.get(i.id) || []).join("\n"));
      if (isPolicy) put("review", fmt(i.lastReviewDate));
      put("target", fmt(i.targetDate));
      put("shared", i.sharedAt ? "Yes" : "No");
    }
  }
  for (const g of o.grids) {
    const ws = wb.Sheets[g.sheet]; if (!ws) continue;
    const start = XLSX.utils.decode_range(ws["!ref"] || "A1"); const R0 = start.s.r, C0 = start.s.c;
    const t: string[][] = g.templateGrid || [];
    (g.grid as string[][]).forEach((row, r) => row.forEach((v, c) => {
      if (t[r]?.[c]) return; // template label
      const before = t[r]?.[c] ?? "";
      if ((v ?? "") === before) return;
      const sr = Math.min(r, Math.max(0, t.length - 1));
      W(g.sheet, { row: R0 + r, col: C0 + c, value: v, styleFrom: { row: R0 + sr, col: C0 + c } });
    }));
  }
  // stamp on the first sheet, two rows below its content
  const first = wb.SheetNames[0]; const fws = wb.Sheets[first];
  if (fws) { const rr = XLSX.utils.decode_range(fws["!ref"] || "A1"); W(first, { row: rr.e.r + 2, col: rr.s.c, value: `Status exported from IT Hub — ${o.audit.auditNo} ${o.audit.companyName} — ${nowStamp()}` }); }
  return fillWorkbook(orig, writes);
}
