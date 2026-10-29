import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, PageOrientation, Footer, PageNumber, HeadingLevel, PageBreak } from "docx";
import { CLOSED } from "./compliance-template";
import { groupOf, courtOf } from "./compliance-status";

/* Audit dashboard as Excel (several sheets) and as a printable report (Word → PDF via LibreOffice). */

const isOverdue = (i: any, today: string) => !!i.targetDate && String(i.targetDate).slice(0, 10) < today && !CLOSED.includes(i.status);
// dashboard buckets follow the status master (each status belongs to one bucket)
const GROUPS: [string, (s: string) => boolean][] = [["Pending", s => groupOf(s) === "pending"], ["In progress", s => groupOf(s) === "inprog"], ["Submitted", s => groupOf(s) === "submitted"], ["Under review", s => groupOf(s) === "review"], ["Closed / N.A.", s => groupOf(s) === "closed"]];
const ref = (i: any) => (i.refNo ? `${i.refNo}${i.seq > 1 ? "." + i.seq : ""}` : "");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function dashboardData(audit: any, items: any[], users: Map<number, string>, activity: any[] = []) {
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const check = items.filter(i => i.kind === "checklist"), pol = items.filter(i => i.kind === "policy");
  const row = (list: any[]) => ({ total: list.length, pending: list.filter(i => groupOf(i.status) === "pending").length, inprog: list.filter(i => groupOf(i.status) === "inprog").length,
    submitted: list.filter(i => groupOf(i.status) === "submitted").length, review: list.filter(i => groupOf(i.status) === "review").length, closed: list.filter(i => CLOSED.includes(i.status)).length,
    overdue: list.filter(i => isOverdue(i, today)).length, noOwner: list.filter(i => !i.ownerUserId).length,
    withEntity: list.filter(i => courtOf(i.status, i.sharedAt) === "entity").length, withAuditor: list.filter(i => courtOf(i.status, i.sharedAt) === "auditor").length,
    submittedToAuditor: list.filter(i => courtOf(i.status, i.sharedAt) !== "entity").length });
  const areas = new Map<string, any[]>(); check.forEach(i => { const k = i.area || i.sheet; areas.set(k, [...(areas.get(k) || []), i]); });
  const owners = new Map<string, any[]>(); items.forEach(i => { const k = i.ownerUserId ? users.get(i.ownerUserId) || `#${i.ownerUserId}` : "— No owner —"; owners.set(k, [...(owners.get(k) || []), i]); });
  const tot = row(check);
  return {
    today, audit, tot, closurePct: pct(tot.closed, tot.total), submissionPct: pct(tot.submittedToAuditor, tot.total), policies: pol.length,
    entityDetail: [
      ["Not started", check.filter(i => groupOf(i.status) === "pending").length],
      ["In progress", check.filter(i => groupOf(i.status) === "inprog" && !i.auditorUpdatedAt).length],
      ["Information requested / partly closed by auditor", check.filter(i => groupOf(i.status) === "inprog" && !!i.auditorUpdatedAt).length],
      ["Submitted, not yet shared", check.filter(i => groupOf(i.status) === "submitted" && !i.sharedAt).length],
    ] as [string, number][],
    auditorDetail: [
      ["Shared, awaiting auditor review", check.filter(i => groupOf(i.status) === "submitted" && !!i.sharedAt).length],
      ["Under review", check.filter(i => groupOf(i.status) === "review").length],
    ] as [string, number][],
    activity: activity.map(x => ({ When: new Date(x.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), By: String(x.author || "—").replace(/\s*<[^>]*>/, ""), Side: x.side === "auditor" ? "Auditor" : "Entity", Ref: x.refNo ? `${x.refNo}${x.seq > 1 ? "." + x.seq : ""}` : x.sheet || "", What: String(x.body || "").replace(/\s+/g, " ").slice(0, 300) })),
    groups: GROUPS.map(([l, f]) => ({ label: l, n: check.filter(i => f(i.status)).length })),
    policyGroups: [{ label: "Total", n: pol.length }, ...GROUPS.map(([l, f]) => ({ label: l, n: pol.filter(i => f(i.status)).length })), { label: "No owner", n: pol.filter(i => !i.ownerUserId).length }, { label: "No document linked", n: pol.filter(i => !i.evidenceCount).length }],
    areas: [...areas].map(([area, list]) => ({ area, ...row(list) })),
    owners: [...owners].map(([owner, list]) => ({ owner, checkpoints: list.filter(i => i.kind === "checklist").length, policies: list.filter(i => i.kind === "policy").length, open: list.filter(i => !CLOSED.includes(i.status)).length, overdue: list.filter(i => isOverdue(i, today)).length, closed: list.filter(i => CLOSED.includes(i.status)).length, total: list.length }))
      .sort((a, b) => (a.owner.startsWith("—") ? -1 : b.owner.startsWith("—") ? 1 : b.total - a.total)),
    open: items.filter(i => !CLOSED.includes(i.status)).map(i => ({ Type: i.kind === "policy" ? "Policy" : "Checkpoint", Ref: ref(i), Area: i.area || i.sheet, Item: String(i.checkpoint).replace(/\s+/g, " ").slice(0, 300), Owner: i.ownerUserId ? users.get(i.ownerUserId) || "" : "", SPOC: i.spocUserId ? users.get(i.spocUserId) || "" : "", Target: i.targetDate ? String(i.targetDate).slice(0, 10) : "", Status: i.status, Overdue: isOverdue(i, today) ? "Yes" : "", Evidence: i.evidenceCount || 0, Shared: i.sharedAt ? "Yes" : "No" })),
  };
}
type D = ReturnType<typeof dashboardData>;

/* Audit details (cover page / first sheet): company, engagement, scope, auditors */
const dt = (x: any) => (x ? new Date(String(x).length === 10 ? x + "T00:00:00" : x).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");
function details(a: any) {
  const c = a.company || {};
  const info: [string, string][] = [
    ["Company", c.name || a.companyName || "—"], ["Short name", c.shortName || "—"], ["Business line", c.businessLine || "—"], ["Regulator", c.regulator || "—"],
    ["Registration no.", c.registrationNo || "—"], ["Registered address", c.address || "—"],
    ["Audit no.", a.auditNo], ["Title", a.title], ["Audit type", a.auditType || "—"], ["Status", a.status], ["Checklist template", a.template ? `${a.template.name}${a.template.version ? ` (${a.template.version})` : ""}` : "—"],
    ["Audit start date", dt(a.startDate)], ["Audit period", a.periodFrom ? `${dt(a.periodFrom)} to ${dt(a.periodTo)}` : "—"], ["Target closure date", dt(a.targetDate)],
    ["Audit firm", a.auditFirm || "—"], ["Auditor contact", a.auditorContact || "—"], ["Notes", a.notes || "—"],
  ];
  const apps = ((a.scope?.applications || []) as any[]).map(x => [x.name || "", x.category || "", x.hosting || "", x.notes || ""]);
  const vendors = ((a.scope?.vendors || []) as any[]).map(x => [x.role || "", x.name || "", x.system || "", x.notes || ""]);
  const auditors = ((a.auditors || []) as any[]).map(x => [x.name || "", x.email || "", x.firm || "", `${dt(x.validFrom)} – ${dt(x.validUntil)}`, x.canDownload ? "View + download" : "View only",
    x.live ? "Active" : x.isActive ? "Outside dates" : "Revoked", x.accepted ? (x.lastAccessAt ? dt(x.lastAccessAt) : "Not signed in yet") : "Invitation not accepted"]);
  return { info, apps, vendors, auditors };
}

export function dashboardXlsx(d: D) {
  const wb = XLSX.utils.book_new(); const a = d.audit;
  const x = details(a);
  const s0 = XLSX.utils.aoa_to_sheet([["Audit details"], [`As on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`], [], ["Field", "Value"], ...x.info,
    [], ["In-scope applications"], ["Application", "Category", "Hosting", "Notes"], ...(x.apps.length ? x.apps : [["None recorded"]]),
    [], ["Critical vendors"], ["Role", "Vendor", "System / service", "Notes"], ...(x.vendors.length ? x.vendors : [["None recorded"]]),
    [], ["External auditors (portal access)"], ["Name", "Email", "Firm", "Access period", "Rights", "Status", "Last active"], ...(x.auditors.length ? x.auditors : [["None invited"]])]);
  s0["!cols"] = [{ wch: 26 }, { wch: 44 }, { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, s0, "Audit details");
  const head = [["Audit dashboard"], [`${a.auditNo} — ${a.title}`], [`${a.companyName}${a.auditFirm ? " · " + a.auditFirm : ""}`], [`As on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`], []];
  const sum = [...head, ["Measure", "Value"], ["Total checkpoints", d.tot.total], ["Policies & procedures", d.policies], ["Closure %", d.closurePct / 100], ["Submitted to auditor %", d.submissionPct / 100],
    ["Pending with entity", d.tot.withEntity], ["Pending with auditor", d.tot.withAuditor], ["Closed / N.A.", d.tot.closed], ["Pending", d.tot.pending], ["In progress", d.tot.inprog], ["Submitted", d.tot.submitted], ["Under review", d.tot.review], ["Overdue", d.tot.overdue], ["No owner", d.tot.noOwner]];
  const s1 = XLSX.utils.aoa_to_sheet(sum); s1["!cols"] = [{ wch: 28 }, { wch: 14 }]; ["B9", "B10"].forEach(k => s1[k] && (s1[k].z = "0%"));
  XLSX.utils.sheet_add_aoa(s1, [[], ["Pending with entity — detail", ""], ...d.entityDetail, [], ["Pending with auditor — detail", ""], ...d.auditorDetail], { origin: -1 });
  XLSX.utils.book_append_sheet(wb, s1, "Summary");
  const areaRows = [["Area", "Total", "Pending", "In progress", "Submitted", "Under review", "With entity", "With auditor", "Overdue", "No owner", "Closed", "Submitted %", "Closed %"], ...d.areas.map(r => [r.area, r.total, r.pending, r.inprog, r.submitted, r.review, r.withEntity, r.withAuditor, r.overdue, r.noOwner, r.closed, pct(r.submittedToAuditor, r.total) / 100, pct(r.closed, r.total) / 100]),
    ["Total", d.tot.total, d.tot.pending, d.tot.inprog, d.tot.submitted, d.tot.review, d.tot.withEntity, d.tot.withAuditor, d.tot.overdue, d.tot.noOwner, d.tot.closed, d.submissionPct / 100, d.closurePct / 100]];
  const s2 = XLSX.utils.aoa_to_sheet(areaRows); s2["!cols"] = [{ wch: 52 }, ...Array(12).fill({ wch: 12 })];
  for (let r = 2; r <= areaRows.length; r++) for (const c of ["L", "M"]) if (s2[`${c}${r}`]) s2[`${c}${r}`].z = "0%";
  XLSX.utils.book_append_sheet(wb, s2, "By area");
  const s3 = XLSX.utils.aoa_to_sheet([["Owner", "Checkpoints", "Policies", "Open", "Overdue", "Closed", "Total"], ...d.owners.map(o => [o.owner, o.checkpoints, o.policies, o.open, o.overdue, o.closed, o.total])]); s3["!cols"] = [{ wch: 32 }, ...Array(6).fill({ wch: 12 })];
  XLSX.utils.book_append_sheet(wb, s3, "By owner");
  const s4 = XLSX.utils.aoa_to_sheet([["Policies & procedures", "Count"], ...d.policyGroups.map(g => [g.label, g.n])]); s4["!cols"] = [{ wch: 28 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, s4, "Policies");
  const s5 = XLSX.utils.json_to_sheet(d.open.length ? d.open : [{ Type: "", Ref: "", Area: "Nothing open" }]); s5["!cols"] = [{ wch: 11 }, { wch: 7 }, { wch: 30 }, { wch: 70 }, { wch: 20 }, { wch: 20 }, { wch: 11 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 7 }];
  XLSX.utils.book_append_sheet(wb, s5, "Open items");
  const s6 = XLSX.utils.json_to_sheet(d.activity.length ? d.activity : [{ When: "", By: "", Side: "", Ref: "", What: "No activity yet" }]); s6["!cols"] = [{ wch: 20 }, { wch: 26 }, { wch: 9 }, { wch: 8 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, s6, "Latest activity");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/* Printable report (A4 landscape) — Word, converted to PDF by the caller */
const BLUE = "1F3864", GREY = "F2F4F7", LINE = "D0D5DD";
const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };
const p = (t: string | number, o: { b?: boolean; color?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ alignment: o.align, spacing: { before: 20, after: 20 }, children: [new TextRun({ text: String(t), bold: o.b, color: o.color, size: o.size ?? 18, font: "Arial" })] });
function table(headers: string[], rows: (string | number)[][], widths: number[], opts: { totalRow?: boolean; left?: boolean; labels?: number[] } = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (v: string | number, i: number, kind: "h" | "b" | "t") => new TableCell({ borders, width: { size: widths[i], type: WidthType.DXA }, margins: { top: 50, bottom: 50, left: 90, right: 90 },
    shading: kind === "h" ? { fill: BLUE, type: ShadingType.CLEAR, color: "auto" } : kind === "t" ? { fill: GREY, type: ShadingType.CLEAR, color: "auto" } : undefined,
    children: [p(v, { b: kind !== "b" || (opts.labels || []).includes(i), color: kind === "h" ? "FFFFFF" : (opts.labels || []).includes(i) ? "475467" : undefined, align: i === 0 || opts.left ? AlignmentType.LEFT : AlignmentType.CENTER })],
    ...(kind === "b" && (opts.labels || []).includes(i) ? { shading: { fill: GREY, type: ShadingType.CLEAR, color: "auto" } } : {}) });
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
    ...(() => { const x = details(a); const half = Math.ceil(x.info.length / 2); const L = x.info.slice(0, half), R = x.info.slice(half);
      return [
        h("Audit details"),
        table(["Field", "Value", "Field", "Value"], L.map((r, i) => [r[0], r[1], R[i]?.[0] ?? "", R[i]?.[1] ?? ""]), [2300, 4700, 2300, 4700], { left: true, labels: [0, 2] }),
        h("Scope — in-scope applications"),
        x.apps.length ? table(["Application", "Category", "Hosting", "Notes"], x.apps, [3500, 3500, 3500, 3500], { left: true }) : p("None recorded", { color: "667085" }),
        h("Scope — critical vendors"),
        x.vendors.length ? table(["Role", "Vendor", "System / service", "Notes"], x.vendors, [3000, 3500, 4000, 3500], { left: true }) : p("None recorded", { color: "667085" }),
        h("External auditors (portal access)"),
        x.auditors.length ? table(["Name", "Email", "Firm", "Access period", "Rights", "Status", "Last active"], x.auditors, [2000, 2900, 2000, 2500, 1500, 1400, 1700], { left: true }) : p("None invited", { color: "667085" }),
        new Paragraph({ children: [new PageBreak()] }),
      ]; })(),
    h("Summary"),
    table(["Total checkpoints", "Policies", "Submitted to auditor", "Closure", "Pending with entity", "Pending with auditor", "Overdue", "No owner"],
      [[d.tot.total, d.policies, `${d.submissionPct}% (${d.tot.submittedToAuditor}/${d.tot.total})`, `${d.closurePct}% (${d.tot.closed}/${d.tot.total})`, d.tot.withEntity, d.tot.withAuditor, d.tot.overdue, d.tot.noOwner]], [1700, 1100, 2200, 2000, 2000, 2000, 1500, 1500]),
    h("Whose action is pending"),
    table(["With the entity", "Count", "With the auditor", "Count"], Array.from({ length: Math.max(d.entityDetail.length, d.auditorDetail.length) + 1 }, (_, i) => i < Math.max(d.entityDetail.length, d.auditorDetail.length)
      ? [d.entityDetail[i]?.[0] ?? "", d.entityDetail[i] ? d.entityDetail[i][1] : "", d.auditorDetail[i]?.[0] ?? "", d.auditorDetail[i] ? d.auditorDetail[i][1] : ""]
      : ["Total with entity", d.tot.withEntity, "Total with auditor", d.tot.withAuditor]), [5000, 2000, 5000, 2000], { totalRow: true }),
    h("Checkpoint status"),
    table(d.groups.map(g => g.label), [d.groups.map(g => `${g.n} (${pct(g.n, d.tot.total)}%)`)], Array(d.groups.length).fill(Math.floor(W / d.groups.length))),
    h("By audit area"),
    table(["Area", "Total", "Pending", "In progress", "Submitted", "Under review", "With entity", "With auditor", "Overdue", "Closed"],
      [...d.areas.map(r => [r.area, r.total, dash(r.pending), dash(r.inprog), dash(r.submitted), dash(r.review), dash(r.withEntity), dash(r.withAuditor), dash(r.overdue), `${r.closed}/${r.total}`]), ["Total", d.tot.total, d.tot.pending, d.tot.inprog, d.tot.submitted, d.tot.review, d.tot.withEntity, d.tot.withAuditor, d.tot.overdue, `${d.tot.closed}/${d.tot.total}`]],
      [4200, 900, 1000, 1100, 1100, 1200, 1100, 1200, 1000, 1200], { totalRow: true }),
    h("By owner (checkpoints and policies)"),
    table(["Owner", "Checkpoints", "Policies", "Open", "Overdue", "Closed"], [...d.owners.map(o => [o.owner, dash(o.checkpoints), dash(o.policies), o.open, dash(o.overdue), `${o.closed}/${o.total}`]),
      ["Total", d.tot.total, d.policies, d.owners.reduce((s, o) => s + o.open, 0), d.tot.overdue, `${d.owners.reduce((s, o) => s + o.closed, 0)}/${d.tot.total + d.policies}`]], [5000, 1800, 1800, 1800, 1800, 1800], { totalRow: true }),
    h("Policies & procedures"),
    table(d.policyGroups.map(g => g.label), [d.policyGroups.map(g => g.n)], Array(d.policyGroups.length).fill(Math.floor(W / d.policyGroups.length))),
  ];
  const overdue = d.open.filter(o => o.Overdue === "Yes");
  if (overdue.length) { children.push(h(`Overdue items (${overdue.length})`)); children.push(table(["Ref", "Area", "Item", "Owner", "Target", "Status"], overdue.slice(0, 200).map(o => [o.Ref, o.Area, o.Item.slice(0, 160), o.Owner || "—", o.Target, o.Status]), [900, 2600, 5900, 1800, 1300, 1500])); }
  if (d.activity.length) { children.push(h(`Latest activity (${Math.min(d.activity.length, 50)})`)); children.push(table(["When", "By", "Side", "Ref", "What"], d.activity.slice(0, 50).map(x => [x.When, x.By, x.Side, x.Ref, x.What.slice(0, 180)]), [2000, 2400, 1000, 900, 7700])); }
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 18 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${a.auditNo} · Page `, size: 14, color: "98A2B3" }), new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "98A2B3" })] })] }) },
      children }],
  });
  return Packer.toBuffer(doc);
}
