import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, PageOrientation, Footer, PageNumber, HeadingLevel } from "docx";
import { CLOSED } from "./compliance-template";
import { groupOf } from "./compliance-status";

/* Audit dashboard as Excel (several sheets) and as a printable report (Word → PDF via LibreOffice). */

const isOverdue = (i: any, today: string) => !!i.targetDate && String(i.targetDate).slice(0, 10) < today && !CLOSED.includes(i.status);
// dashboard buckets follow the status master (each status belongs to one bucket)
const GROUPS: [string, (s: string) => boolean][] = [["Pending", s => groupOf(s) === "pending"], ["In progress", s => groupOf(s) === "inprog"], ["Submitted", s => groupOf(s) === "submitted"], ["Under review", s => groupOf(s) === "review"], ["Closed / N.A.", s => groupOf(s) === "closed"]];
const ref = (i: any) => (i.refNo ? `${i.refNo}${i.seq > 1 ? "." + i.seq : ""}` : "");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function dashboardData(audit: any, items: any[], users: Map<number, string>) {
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const check = items.filter(i => i.kind === "checklist"), pol = items.filter(i => i.kind === "policy");
  const row = (list: any[]) => ({ total: list.length, pending: list.filter(i => groupOf(i.status) === "pending").length, inprog: list.filter(i => groupOf(i.status) === "inprog").length,
    submitted: list.filter(i => groupOf(i.status) === "submitted").length, review: list.filter(i => groupOf(i.status) === "review").length, closed: list.filter(i => CLOSED.includes(i.status)).length,
    overdue: list.filter(i => isOverdue(i, today)).length, noOwner: list.filter(i => !i.ownerUserId).length });
  const areas = new Map<string, any[]>(); check.forEach(i => { const k = i.area || i.sheet; areas.set(k, [...(areas.get(k) || []), i]); });
  const owners = new Map<string, any[]>(); items.forEach(i => { const k = i.ownerUserId ? users.get(i.ownerUserId) || `#${i.ownerUserId}` : "— No owner —"; owners.set(k, [...(owners.get(k) || []), i]); });
  const tot = row(check);
  return {
    today, audit, tot, closurePct: pct(tot.closed, tot.total), policies: pol.length,
    groups: GROUPS.map(([l, f]) => ({ label: l, n: check.filter(i => f(i.status)).length })),
    policyGroups: [{ label: "Total", n: pol.length }, ...GROUPS.map(([l, f]) => ({ label: l, n: pol.filter(i => f(i.status)).length })), { label: "No owner", n: pol.filter(i => !i.ownerUserId).length }, { label: "No document linked", n: pol.filter(i => !i.evidenceCount).length }],
    areas: [...areas].map(([area, list]) => ({ area, ...row(list) })),
    owners: [...owners].map(([owner, list]) => ({ owner, checkpoints: list.filter(i => i.kind === "checklist").length, policies: list.filter(i => i.kind === "policy").length, open: list.filter(i => !CLOSED.includes(i.status)).length, overdue: list.filter(i => isOverdue(i, today)).length, closed: list.filter(i => CLOSED.includes(i.status)).length, total: list.length }))
      .sort((a, b) => (a.owner.startsWith("—") ? -1 : b.owner.startsWith("—") ? 1 : b.total - a.total)),
    open: items.filter(i => !CLOSED.includes(i.status)).map(i => ({ Type: i.kind === "policy" ? "Policy" : "Checkpoint", Ref: ref(i), Area: i.area || i.sheet, Item: String(i.checkpoint).replace(/\s+/g, " ").slice(0, 300), Owner: i.ownerUserId ? users.get(i.ownerUserId) || "" : "", SPOC: i.spocUserId ? users.get(i.spocUserId) || "" : "", Target: i.targetDate ? String(i.targetDate).slice(0, 10) : "", Status: i.status, Overdue: isOverdue(i, today) ? "Yes" : "", Evidence: i.evidenceCount || 0, Shared: i.sharedAt ? "Yes" : "No" })),
  };
}
type D = ReturnType<typeof dashboardData>;

export function dashboardXlsx(d: D) {
  const wb = XLSX.utils.book_new(); const a = d.audit;
  const head = [["Audit dashboard"], [`${a.auditNo} — ${a.title}`], [`${a.companyName}${a.auditFirm ? " · " + a.auditFirm : ""}`], [`As on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`], []];
  const sum = [...head, ["Measure", "Value"], ["Total checkpoints", d.tot.total], ["Policies & procedures", d.policies], ["Closure %", d.closurePct / 100], ["Closed / N.A.", d.tot.closed], ["Pending", d.tot.pending], ["In progress", d.tot.inprog], ["Submitted", d.tot.submitted], ["Under review", d.tot.review], ["Overdue", d.tot.overdue], ["No owner", d.tot.noOwner]];
  const s1 = XLSX.utils.aoa_to_sheet(sum); s1["!cols"] = [{ wch: 28 }, { wch: 14 }]; s1["B9"] && (s1["B9"].z = "0%");
  XLSX.utils.book_append_sheet(wb, s1, "Summary");
  const areaRows = [["Area", "Total", "Pending", "In progress", "Submitted", "Under review", "Overdue", "No owner", "Closed", "Closed %"], ...d.areas.map(r => [r.area, r.total, r.pending, r.inprog, r.submitted, r.review, r.overdue, r.noOwner, r.closed, pct(r.closed, r.total) / 100]),
    ["Total", d.tot.total, d.tot.pending, d.tot.inprog, d.tot.submitted, d.tot.review, d.tot.overdue, d.tot.noOwner, d.tot.closed, d.closurePct / 100]];
  const s2 = XLSX.utils.aoa_to_sheet(areaRows); s2["!cols"] = [{ wch: 52 }, ...Array(9).fill({ wch: 12 })];
  for (let r = 2; r <= areaRows.length; r++) if (s2[`J${r}`]) s2[`J${r}`].z = "0%";
  XLSX.utils.book_append_sheet(wb, s2, "By area");
  const s3 = XLSX.utils.aoa_to_sheet([["Owner", "Checkpoints", "Policies", "Open", "Overdue", "Closed", "Total"], ...d.owners.map(o => [o.owner, o.checkpoints, o.policies, o.open, o.overdue, o.closed, o.total])]); s3["!cols"] = [{ wch: 32 }, ...Array(6).fill({ wch: 12 })];
  XLSX.utils.book_append_sheet(wb, s3, "By owner");
  const s4 = XLSX.utils.aoa_to_sheet([["Policies & procedures", "Count"], ...d.policyGroups.map(g => [g.label, g.n])]); s4["!cols"] = [{ wch: 28 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, s4, "Policies");
  const s5 = XLSX.utils.json_to_sheet(d.open.length ? d.open : [{ Type: "", Ref: "", Area: "Nothing open" }]); s5["!cols"] = [{ wch: 11 }, { wch: 7 }, { wch: 30 }, { wch: 70 }, { wch: 20 }, { wch: 20 }, { wch: 11 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 7 }];
  XLSX.utils.book_append_sheet(wb, s5, "Open items");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/* Printable report (A4 landscape) — Word, converted to PDF by the caller */
const BLUE = "1F3864", GREY = "F2F4F7", LINE = "D0D5DD";
const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };
const p = (t: string | number, o: { b?: boolean; color?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ alignment: o.align, spacing: { before: 20, after: 20 }, children: [new TextRun({ text: String(t), bold: o.b, color: o.color, size: o.size ?? 18, font: "Arial" })] });
function table(headers: string[], rows: (string | number)[][], widths: number[], opts: { totalRow?: boolean } = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (v: string | number, i: number, kind: "h" | "b" | "t") => new TableCell({ borders, width: { size: widths[i], type: WidthType.DXA }, margins: { top: 50, bottom: 50, left: 90, right: 90 },
    shading: kind === "h" ? { fill: BLUE, type: ShadingType.CLEAR, color: "auto" } : kind === "t" ? { fill: GREY, type: ShadingType.CLEAR, color: "auto" } : undefined,
    children: [p(v, { b: kind !== "b", color: kind === "h" ? "FFFFFF" : undefined, align: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER })] });
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: [
    new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, "h")) }),
    ...rows.map((r, ri) => new TableRow({ children: r.map((v, i) => cell(v, i, opts.totalRow && ri === rows.length - 1 ? "t" : "b")) })) ] });
}
const h = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, children: [new TextRun({ text: t, bold: true, color: BLUE, size: 24, font: "Arial" })] });

export async function dashboardDocx(d: D) {
  const a = d.audit; const W = 14000; // landscape A4 text width (twips) ≈ 15840 − margins
  const dash = (n: number) => (n ? n : "–");
  const children: any[] = [
    new Paragraph({ children: [new TextRun({ text: "Audit dashboard", bold: true, size: 36, color: BLUE, font: "Arial" })] }),
    p(`${a.auditNo} — ${a.title}`, { b: true, size: 22 }),
    p(`${a.companyName}${a.auditFirm ? " · " + a.auditFirm : ""}${a.periodFrom ? ` · period ${String(a.periodFrom).slice(0, 10)} to ${String(a.periodTo || "").slice(0, 10)}` : ""}${a.targetDate ? ` · target ${String(a.targetDate).slice(0, 10)}` : ""}`, { color: "475467" }),
    p(`As on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, { color: "667085", size: 16 }),
    h("Summary"),
    table(["Total checkpoints", "Policies", "Closure", "Pending", "In progress", "Submitted", "Under review", "Overdue", "No owner"],
      [[d.tot.total, d.policies, `${d.closurePct}% (${d.tot.closed}/${d.tot.total})`, d.tot.pending, d.tot.inprog, d.tot.submitted, d.tot.review, d.tot.overdue, d.tot.noOwner]], [1700, 1200, 2000, 1300, 1400, 1400, 1500, 1300, 1300]),
    h("Checkpoint status"),
    table(d.groups.map(g => g.label), [d.groups.map(g => `${g.n} (${pct(g.n, d.tot.total)}%)`)], Array(d.groups.length).fill(Math.floor(W / d.groups.length))),
    h("By audit area"),
    table(["Area", "Total", "Pending", "In progress", "Submitted", "Under review", "Overdue", "No owner", "Closed"],
      [...d.areas.map(r => [r.area, r.total, dash(r.pending), dash(r.inprog), dash(r.submitted), dash(r.review), dash(r.overdue), dash(r.noOwner), `${r.closed}/${r.total}`]), ["Total", d.tot.total, d.tot.pending, d.tot.inprog, d.tot.submitted, d.tot.review, d.tot.overdue, d.tot.noOwner, `${d.tot.closed}/${d.tot.total}`]],
      [4800, 1000, 1100, 1200, 1200, 1300, 1100, 1200, 1100], { totalRow: true }),
    h("By owner (checkpoints and policies)"),
    table(["Owner", "Checkpoints", "Policies", "Open", "Overdue", "Closed"], [...d.owners.map(o => [o.owner, dash(o.checkpoints), dash(o.policies), o.open, dash(o.overdue), `${o.closed}/${o.total}`]),
      ["Total", d.tot.total, d.policies, d.owners.reduce((s, o) => s + o.open, 0), d.tot.overdue, `${d.owners.reduce((s, o) => s + o.closed, 0)}/${d.tot.total + d.policies}`]], [5000, 1800, 1800, 1800, 1800, 1800], { totalRow: true }),
    h("Policies & procedures"),
    table(d.policyGroups.map(g => g.label), [d.policyGroups.map(g => g.n)], Array(d.policyGroups.length).fill(Math.floor(W / d.policyGroups.length))),
  ];
  const overdue = d.open.filter(o => o.Overdue === "Yes");
  if (overdue.length) { children.push(h(`Overdue items (${overdue.length})`)); children.push(table(["Ref", "Area", "Item", "Owner", "Target", "Status"], overdue.slice(0, 200).map(o => [o.Ref, o.Area, o.Item.slice(0, 160), o.Owner || "—", o.Target, o.Status]), [900, 2600, 5900, 1800, 1300, 1500])); }
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 18 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${a.auditNo} · Page `, size: 14, color: "98A2B3" }), new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "98A2B3" })] })] }) },
      children }],
  });
  return Packer.toBuffer(doc);
}
