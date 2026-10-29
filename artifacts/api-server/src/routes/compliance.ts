import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { readObject } from "./storage";
import { parseWorkbook, exportWorkbook, STATUSES, CLOSED } from "../lib/compliance-template";

/*
 * Audit & Compliance (module key "compliance", enforced by lib/rbac.ts: GET = read, writes = write).
 *  Companies → audit templates (imported from the auditor's Excel) → audits (one company + one template + scope)
 *  → checkpoints / policy register / information grids, each with owner, SPOC, target date, replies, status,
 *  linked evidence (versioned library documents) and comments. Files are served only through this router (logged).
 */

const router = Router();
router.use(requireAuth);
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const q = async (query: any) => rowsOf(await db.execute(query));
const camel = (r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v instanceof Date ? v.toISOString() : v]));
const fail = (res: Response, c: number, e: string) => { res.status(c).json({ error: e }); };
class Bad extends Error { status = 400; }
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); }
};
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new Bad(r.error.issues.map(i => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message).join("; "));
  return r.data;
}
const uid = (req: Request) => (req.session as any)?.userId as number | undefined;
const who = async (req: Request) => getPerformedBy(uid(req)).catch(() => "System");
const audit = (p: Parameters<typeof logAudit>[0]) => logAudit(p).catch(() => { /* non-fatal */ });
const id = (v: unknown) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Bad("Invalid id"); return n; };
const dateS = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable().optional().or(z.literal("").transform(() => null));
const txt = (max = 20000) => z.string().max(max).nullable().optional();

/* ─── People (owner / SPOC pickers) ─────────────────────────────────────── */
router.get("/compliance-people", wrap(async (_req, res) => {
  res.json((await q(sql`SELECT id, name, email, department FROM users WHERE is_active = true AND coalesce(user_type,'internal') = 'internal' ORDER BY name`)).map(camel));
}));

/* ─── Companies ──────────────────────────────────────────────────────────── */
const companySchema = z.object({ name: z.string().trim().min(2).max(160), shortName: txt(40), businessLine: txt(80), regulator: txt(40), registrationNo: txt(60), address: txt(500), isActive: z.boolean().optional() });
router.get("/compliance-companies", wrap(async (_req, res) => {
  res.json((await q(sql`SELECT c.*, (SELECT count(*)::int FROM cmp_audits a WHERE a.company_id = c.id AND a.is_active) AS audits FROM cmp_companies c ORDER BY c.is_active DESC, c.name`)).map(camel));
}));
router.post("/compliance-companies", wrap(async (req, res) => {
  const v = parse(companySchema, req.body); const by = await who(req);
  if ((await q(sql`SELECT 1 FROM cmp_companies WHERE lower(name) = lower(${v.name})`)).length) throw new Bad(`${v.name} already exists`);
  const [r] = await q(sql`INSERT INTO cmp_companies (name, short_name, business_line, regulator, registration_no, address, created_by) VALUES (${v.name}, ${v.shortName ?? null}, ${v.businessLine ?? null}, ${v.regulator ?? null}, ${v.registrationNo ?? null}, ${v.address ?? null}, ${by}) RETURNING *`);
  await audit({ entityType: "compliance_company", entityId: r.id, action: "create", performedBy: by, summary: `Company ${v.name} added` });
  res.status(201).json(camel(r));
}));
router.patch("/compliance-companies/:id", wrap(async (req, res) => {
  const cid = id(req.params.id);
  const [old] = await q(sql`SELECT * FROM cmp_companies WHERE id = ${cid}`); if (!old) return fail(res, 404, "Company not found");
  const v: any = parse(companySchema.partial(), req.body); const by = await who(req);
  if (v.name && (await q(sql`SELECT 1 FROM cmp_companies WHERE lower(name) = lower(${v.name}) AND id <> ${cid}`)).length) throw new Bad(`${v.name} already exists`);
  const m = { ...camel(old), ...v } as any;
  const [r] = await q(sql`UPDATE cmp_companies SET name = ${m.name}, short_name = ${m.shortName ?? null}, business_line = ${m.businessLine ?? null}, regulator = ${m.regulator ?? null}, registration_no = ${m.registrationNo ?? null}, address = ${m.address ?? null}, is_active = ${m.isActive}, updated_at = now() WHERE id = ${cid} RETURNING *`);
  await audit({ entityType: "compliance_company", entityId: cid, action: "update", performedBy: by, summary: `Company ${r.name} updated` });
  res.json(camel(r));
}));

/* ─── Templates ──────────────────────────────────────────────────────────── */
router.get("/compliance-templates", wrap(async (_req, res) => {
  res.json((await q(sql`SELECT t.*, (SELECT count(*)::int FROM cmp_template_items i WHERE i.template_id = t.id AND i.kind = 'checklist') AS checkpoints,
    (SELECT count(*)::int FROM cmp_template_items i WHERE i.template_id = t.id AND i.kind = 'policy') AS policies,
    (SELECT count(*)::int FROM cmp_template_grids g WHERE g.template_id = t.id) AS grids,
    (SELECT count(*)::int FROM cmp_audits a WHERE a.template_id = t.id) AS audits FROM cmp_templates t ORDER BY t.is_active DESC, t.created_at DESC`)).map(camel));
}));
router.get("/compliance-templates/:id", wrap(async (req, res) => {
  const tid = id(req.params.id);
  const [t] = await q(sql`SELECT * FROM cmp_templates WHERE id = ${tid}`); if (!t) return fail(res, 404, "Template not found");
  res.json({ ...camel(t), items: (await q(sql`SELECT * FROM cmp_template_items WHERE template_id = ${tid} ORDER BY sort_order`)).map(camel), grids: (await q(sql`SELECT id, sheet, sort_order, grid FROM cmp_template_grids WHERE template_id = ${tid} ORDER BY sort_order`)).map(camel) });
}));
const importSchema = z.object({ objectPath: z.string().min(1), fileName: z.string().max(200).optional(), name: z.string().trim().min(3).max(160).optional(), framework: txt(120), version: txt(40), description: txt(1000), dryRun: z.boolean().optional() });
router.post("/compliance-templates/import", wrap(async (req, res) => {
  const v = parse(importSchema, req.body);
  const { buffer } = await readObject(v.objectPath).catch(() => { throw new Bad("Uploaded file not found — upload it again"); });
  let p: ReturnType<typeof parseWorkbook>;
  try { p = parseWorkbook(buffer); } catch { throw new Bad("Could not read the workbook — upload an .xlsx file"); }
  const summary = { checkpoints: p.items.filter(i => i.kind === "checklist").length, policies: p.items.filter(i => i.kind === "policy").length, grids: p.grids.map(g => g.sheet), skipped: p.skipped,
    areas: [...new Set(p.items.filter(i => i.kind === "checklist").map(i => i.area).filter(Boolean))], sheets: p.sheets };
  if (!summary.checkpoints && !summary.policies) throw new Bad("No checklist found. The checklist sheet needs a header row with an \"Audit Checklist\" column.");
  if (v.dryRun !== false) return res.json({ ...summary, applied: false });
  if (!v.name) throw new Bad("Template name is required");
  const by = await who(req);
  const tid = await db.transaction(async tx => {
    const [t] = rowsOf(await tx.execute(sql`INSERT INTO cmp_templates (name, framework, version, description, source_file, source_object, created_by) VALUES (${v.name}, ${v.framework ?? null}, ${v.version ?? null}, ${v.description ?? null}, ${v.fileName ?? null}, ${v.objectPath}, ${by}) RETURNING id`));
    for (const i of p.items) await tx.execute(sql`INSERT INTO cmp_template_items (template_id, kind, sheet, source_row, ref_no, seq, area, sub_area, checkpoint, evidence_required, doc_type, sort_order)
      VALUES (${t.id}, ${i.kind}, ${i.sheet}, ${i.sourceRow}, ${i.refNo}, ${i.seq}, ${i.area}, ${i.subArea}, ${i.checkpoint}, ${i.evidenceRequired}, ${i.docType}, ${i.sortOrder})`);
    for (const g of p.grids) await tx.execute(sql`INSERT INTO cmp_template_grids (template_id, sheet, sort_order, grid) VALUES (${t.id}, ${g.sheet}, ${g.sortOrder}, ${JSON.stringify(g.grid)}::jsonb)`);
    return t.id as number;
  });
  await audit({ entityType: "compliance_template", entityId: tid, action: "import", performedBy: by, summary: `Template ${v.name} imported from ${v.fileName || "file"}: ${summary.checkpoints} checkpoints, ${summary.policies} policies, ${summary.grids.length} schedules` });
  res.status(201).json({ ...summary, applied: true, id: tid });
}));
router.patch("/compliance-templates/:id", wrap(async (req, res) => {
  const tid = id(req.params.id);
  const v = parse(z.object({ name: z.string().trim().min(3).max(160).optional(), framework: txt(120), version: txt(40), description: txt(1000), isActive: z.boolean().optional() }), req.body);
  const [o] = await q(sql`SELECT * FROM cmp_templates WHERE id = ${tid}`); if (!o) return fail(res, 404, "Template not found");
  const m: any = { ...camel(o), ...v };
  const [r] = await q(sql`UPDATE cmp_templates SET name = ${m.name}, framework = ${m.framework ?? null}, version = ${m.version ?? null}, description = ${m.description ?? null}, is_active = ${m.isActive} WHERE id = ${tid} RETURNING *`);
  res.json(camel(r));
}));

/* ─── Audits ─────────────────────────────────────────────────────────────── */
const scopeSchema = z.object({
  applications: z.array(z.object({ name: z.string().trim().min(1).max(120), category: txt(80), hosting: txt(160), notes: txt(500) })).max(100).default([]),
  vendors: z.array(z.object({ role: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(160), system: txt(160), notes: txt(500) })).max(100).default([]),
});
const auditSchema = z.object({
  companyId: z.coerce.number().int().positive(), templateId: z.coerce.number().int().positive().optional(), title: z.string().trim().min(3).max(200),
  auditType: txt(120), periodFrom: dateS, periodTo: dateS, auditFirm: txt(160), auditorContact: txt(300), status: z.enum(["Planning", "Fieldwork", "Reporting", "Closed"]).optional(),
  targetDate: dateS, scope: scopeSchema.optional(), notes: txt(4000),
});
const statsSql = sql`count(*) FILTER (WHERE i.kind = 'checklist')::int AS checkpoints,
  count(*) FILTER (WHERE i.kind = 'checklist' AND i.status IN ('Closed','Closed-Obs','Not Applicable'))::int AS closed,
  count(*) FILTER (WHERE i.kind = 'checklist' AND i.status = 'Under Review')::int AS under_review,
  count(*) FILTER (WHERE i.kind = 'checklist' AND i.status NOT IN ('Closed','Closed-Obs','Not Applicable') AND i.target_date < (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS overdue,
  count(*) FILTER (WHERE i.kind = 'checklist' AND i.owner_user_id IS NULL)::int AS unassigned,
  count(*) FILTER (WHERE i.kind = 'policy')::int AS policies,
  count(*) FILTER (WHERE i.kind = 'policy' AND i.status IN ('Closed','Closed-Obs','Not Applicable'))::int AS policies_closed`;
router.get("/compliance-audits", wrap(async (req, res) => {
  const company = req.query.companyId ? id(req.query.companyId) : null;
  res.json((await q(sql`SELECT a.*, c.name AS company_name, t.name AS template_name, s.* FROM cmp_audits a JOIN cmp_companies c ON c.id = a.company_id LEFT JOIN cmp_templates t ON t.id = a.template_id
    LEFT JOIN LATERAL (SELECT ${statsSql} FROM cmp_items i WHERE i.audit_id = a.id) s ON true
    WHERE a.is_active ${company ? sql`AND a.company_id = ${company}` : sql``} ORDER BY a.status = 'Closed', a.target_date NULLS LAST, a.id DESC`)).map(camel));
}));
async function getAudit(aid: number) {
  const [a] = await q(sql`SELECT a.*, c.name AS company_name, t.name AS template_name FROM cmp_audits a JOIN cmp_companies c ON c.id = a.company_id LEFT JOIN cmp_templates t ON t.id = a.template_id WHERE a.id = ${aid}`);
  return a ? camel(a) as any : null;
}
router.get("/compliance-audits/:id", wrap(async (req, res) => {
  const aid = id(req.params.id);
  const a = await getAudit(aid); if (!a) return fail(res, 404, "Audit not found");
  const [s] = await q(sql`SELECT ${statsSql} FROM cmp_items i WHERE i.audit_id = ${aid}`);
  const byStatus = (await q(sql`SELECT kind, status, count(*)::int AS n FROM cmp_items WHERE audit_id = ${aid} GROUP BY kind, status`)).map(camel);
  const byArea = (await q(sql`SELECT coalesce(area, sheet) AS area, min(sort_order) AS o, count(*)::int AS total,
    count(*) FILTER (WHERE status IN ('Closed','Closed-Obs','Not Applicable'))::int AS closed, count(*) FILTER (WHERE status = 'Under Review')::int AS under_review,
    count(*) FILTER (WHERE status = 'Pending')::int AS pending, count(*) FILTER (WHERE status NOT IN ('Closed','Closed-Obs','Not Applicable') AND target_date < (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS overdue
    FROM cmp_items WHERE audit_id = ${aid} AND kind = 'checklist' GROUP BY 1 ORDER BY 2`)).map(camel);
  const byOwner = (await q(sql`SELECT coalesce(u.name, '— Unassigned —') AS owner, i.owner_user_id, count(*)::int AS total, count(*) FILTER (WHERE i.status IN ('Closed','Closed-Obs','Not Applicable'))::int AS closed,
    count(*) FILTER (WHERE i.status NOT IN ('Closed','Closed-Obs','Not Applicable') AND i.target_date < (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS overdue
    FROM cmp_items i LEFT JOIN users u ON u.id = i.owner_user_id WHERE i.audit_id = ${aid} GROUP BY 1, 2 ORDER BY 3 DESC`)).map(camel);
  const grids = (await q(sql`SELECT status, count(*)::int AS n FROM cmp_grids WHERE audit_id = ${aid} GROUP BY status`)).map(camel);
  res.json({ ...a, stats: camel(s), byStatus, byArea, byOwner, grids });
}));
router.post("/compliance-audits", wrap(async (req, res) => {
  const v = parse(auditSchema, req.body); const by = await who(req);
  if (!(await q(sql`SELECT 1 FROM cmp_companies WHERE id = ${v.companyId} AND is_active`)).length) throw new Bad("Choose an active company");
  if (!v.templateId) throw new Bad("Choose an audit template");
  if (!(await q(sql`SELECT 1 FROM cmp_templates WHERE id = ${v.templateId} AND is_active`)).length) throw new Bad("Choose an active template");
  if (v.periodFrom && v.periodTo && v.periodFrom > v.periodTo) throw new Bad("Audit period: 'from' is after 'to'");
  const aid = await db.transaction(async tx => {
    const [a] = rowsOf(await tx.execute(sql`INSERT INTO cmp_audits (company_id, template_id, title, audit_type, period_from, period_to, audit_firm, auditor_contact, status, target_date, scope, notes, created_by)
      VALUES (${v.companyId}, ${v.templateId}, ${v.title}, ${v.auditType ?? null}, ${v.periodFrom ?? null}, ${v.periodTo ?? null}, ${v.auditFirm ?? null}, ${v.auditorContact ?? null}, ${v.status ?? "Planning"}, ${v.targetDate ?? null},
      ${JSON.stringify(v.scope ?? { applications: [], vendors: [] })}::jsonb, ${v.notes ?? null}, ${by}) RETURNING id`));
    await tx.execute(sql`UPDATE cmp_audits SET audit_no = ${"AUD-" + new Date().getFullYear() + "-"} || lpad(id::text, 4, '0') WHERE id = ${a.id}`);
    await tx.execute(sql`INSERT INTO cmp_items (audit_id, kind, sheet, source_row, ref_no, seq, area, sub_area, checkpoint, evidence_required, doc_type, sort_order, target_date, updated_by)
      SELECT ${a.id}, kind, sheet, source_row, ref_no, seq, area, sub_area, checkpoint, evidence_required, doc_type, sort_order, ${v.targetDate ?? null}::date, ${by} FROM cmp_template_items WHERE template_id = ${v.templateId} ORDER BY sort_order`);
    await tx.execute(sql`INSERT INTO cmp_grids (audit_id, sheet, sort_order, template_grid, grid, updated_by) SELECT ${a.id}, sheet, sort_order, grid, grid, ${by} FROM cmp_template_grids WHERE template_id = ${v.templateId}`);
    return a.id as number;
  });
  const a = await getAudit(aid);
  await audit({ entityType: "compliance_audit", entityId: aid, action: "create", performedBy: by, summary: `Audit ${a.auditNo} ${a.title} created for ${a.companyName}` });
  res.status(201).json(a);
}));
router.patch("/compliance-audits/:id", wrap(async (req, res) => {
  const aid = id(req.params.id);
  const old = await getAudit(aid); if (!old) return fail(res, 404, "Audit not found");
  const v: any = parse(auditSchema.partial().omit({ templateId: true }), req.body); const by = await who(req);
  const m: any = { ...old, ...v };
  if (m.periodFrom && m.periodTo && m.periodFrom > m.periodTo) throw new Bad("Audit period: 'from' is after 'to'");
  await q(sql`UPDATE cmp_audits SET company_id = ${m.companyId}, title = ${m.title}, audit_type = ${m.auditType ?? null}, period_from = ${m.periodFrom ?? null}, period_to = ${m.periodTo ?? null}, audit_firm = ${m.auditFirm ?? null},
    auditor_contact = ${m.auditorContact ?? null}, status = ${m.status}, target_date = ${m.targetDate ?? null}, scope = ${JSON.stringify(m.scope ?? { applications: [], vendors: [] })}::jsonb, notes = ${m.notes ?? null}, updated_at = now() WHERE id = ${aid}`);
  await audit({ entityType: "compliance_audit", entityId: aid, action: "update", performedBy: by, summary: `Audit ${old.auditNo} updated${v.status && v.status !== old.status ? ` — status ${old.status} → ${v.status}` : ""}` });
  res.json(await getAudit(aid));
}));

/* ─── Checkpoints & policy register ─────────────────────────────────────── */
const itemCols = sql`i.*, ou.name AS owner_name, su.name AS spoc_name,
  (SELECT count(*)::int FROM cmp_item_documents d WHERE d.item_id = i.id) AS evidence_count,
  (SELECT count(*)::int FROM cmp_comments c WHERE c.item_id = i.id AND NOT c.system) AS comment_count`;
router.get("/compliance-audits/:id/items", wrap(async (req, res) => {
  const aid = id(req.params.id);
  res.json((await q(sql`SELECT ${itemCols} FROM cmp_items i LEFT JOIN users ou ON ou.id = i.owner_user_id LEFT JOIN users su ON su.id = i.spoc_user_id WHERE i.audit_id = ${aid} ORDER BY i.sort_order`)).map(camel));
}));
router.get("/compliance-items/:id", wrap(async (req, res) => {
  const iid = id(req.params.id);
  const [i] = await q(sql`SELECT ${itemCols} FROM cmp_items i LEFT JOIN users ou ON ou.id = i.owner_user_id LEFT JOIN users su ON su.id = i.spoc_user_id WHERE i.id = ${iid}`);
  if (!i) return fail(res, 404, "Checkpoint not found");
  const documents = (await q(sql`SELECT d.*, l.linked_by, l.linked_at, f.id AS file_id, f.file_name, f.version, f.file_size, f.uploaded_at FROM cmp_item_documents l JOIN cmp_documents d ON d.id = l.document_id
    LEFT JOIN LATERAL (SELECT * FROM cmp_document_files x WHERE x.document_id = d.id ORDER BY version DESC LIMIT 1) f ON true WHERE l.item_id = ${iid} ORDER BY l.linked_at`)).map(camel);
  const comments = (await q(sql`SELECT * FROM cmp_comments WHERE item_id = ${iid} ORDER BY created_at`)).map(camel);
  // other lines of the same checkpoint (1b.1, 1b.2 …) for context
  const siblings = i.ref_no ? (await q(sql`SELECT id, seq, checkpoint, status FROM cmp_items WHERE audit_id = ${i.audit_id} AND sheet = ${i.sheet} AND ref_no = ${i.ref_no} ORDER BY seq`)).map(camel) : [];
  res.json({ ...camel(i), documents, comments, siblings });
}));
const itemPatch = z.object({ ownerUserId: z.coerce.number().int().positive().nullable().optional(), spocUserId: z.coerce.number().int().positive().nullable().optional(), targetDate: dateS,
  managementReply: txt(), auditorRemarks: txt(), status: z.enum(STATUSES as [string, ...string[]]).optional(), lastReviewDate: dateS });
async function addComment(itemId: number, req: Request, body: string, system = false) {
  await q(sql`INSERT INTO cmp_comments (item_id, user_id, author, system, body) VALUES (${itemId}, ${uid(req) ?? null}, ${await who(req)}, ${system}, ${body})`);
}
async function userName(uId: number | null | undefined) { if (!uId) return "—"; const [u] = await q(sql`SELECT name FROM users WHERE id = ${uId}`); return u?.name ?? `#${uId}`; }
async function checkUser(uId: number | null | undefined) { if (uId && !(await q(sql`SELECT 1 FROM users WHERE id = ${uId} AND is_active`)).length) throw new Bad("Choose an active user"); }
async function applyItemPatch(req: Request, iid: number, v: z.infer<typeof itemPatch>) {
  const [o] = await q(sql`SELECT * FROM cmp_items WHERE id = ${iid}`); if (!o) throw Object.assign(new Bad("Checkpoint not found"), { status: 404 });
  await checkUser(v.ownerUserId); await checkUser(v.spocUserId);
  const m: any = { ...camel(o) }; for (const [k, val] of Object.entries(v)) if (val !== undefined) m[k] = val;
  const by = await who(req);
  await q(sql`UPDATE cmp_items SET owner_user_id = ${m.ownerUserId ?? null}, spoc_user_id = ${m.spocUserId ?? null}, target_date = ${m.targetDate ?? null}, management_reply = ${m.managementReply ?? null},
    auditor_remarks = ${m.auditorRemarks ?? null}, status = ${m.status}, last_review_date = ${m.lastReviewDate ?? null}, updated_by = ${by}, updated_at = now() WHERE id = ${iid}`);
  const notes: string[] = [];
  if (m.status !== o.status) notes.push(`Status ${o.status} → ${m.status}`);
  if ((m.ownerUserId ?? null) !== (o.owner_user_id ?? null)) notes.push(`Owner ${await userName(o.owner_user_id)} → ${await userName(m.ownerUserId)}`);
  if ((m.spocUserId ?? null) !== (o.spoc_user_id ?? null)) notes.push(`SPOC ${await userName(o.spoc_user_id)} → ${await userName(m.spocUserId)}`);
  const oldT = o.target_date ? new Date(o.target_date).toISOString().slice(0, 10) : null;
  if ((m.targetDate ?? null) !== oldT && v.targetDate !== undefined) notes.push(`Target date ${oldT ?? "—"} → ${m.targetDate ?? "—"}`);
  if (v.managementReply !== undefined && (v.managementReply ?? null) !== (o.management_reply ?? null)) notes.push("Management reply updated");
  if (v.auditorRemarks !== undefined && (v.auditorRemarks ?? null) !== (o.auditor_remarks ?? null)) notes.push("Auditor remarks updated");
  if (notes.length) await addComment(iid, req, notes.join(" · "), true);
  const assigned = [m.ownerUserId !== o.owner_user_id ? m.ownerUserId : null, m.spocUserId !== o.spoc_user_id ? m.spocUserId : null].filter(Boolean) as number[];
  return { o, m, assigned, notes };
}
router.patch("/compliance-items/:id", wrap(async (req, res) => {
  const iid = id(req.params.id);
  const r = await applyItemPatch(req, iid, parse(itemPatch, req.body));
  if (r.assigned.length) void emailAssignment(r.assigned, [iid]);
  const [i] = await q(sql`SELECT ${itemCols} FROM cmp_items i LEFT JOIN users ou ON ou.id = i.owner_user_id LEFT JOIN users su ON su.id = i.spoc_user_id WHERE i.id = ${iid}`);
  res.json(camel(i));
}));
router.post("/compliance-items/bulk", wrap(async (req, res) => {
  const v = parse(z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(1000), set: itemPatch.pick({ ownerUserId: true, spocUserId: true, targetDate: true, status: true }) }), req.body);
  if (!Object.values(v.set).some(x => x !== undefined)) throw new Bad("Nothing to change");
  const perUser = new Map<number, number[]>();
  for (const iid of v.ids) { const r = await applyItemPatch(req, iid, v.set); for (const u of r.assigned) perUser.set(u, [...(perUser.get(u) || []), iid]); }
  for (const [u, ids] of perUser) void emailAssignment([u], ids);
  const by = await who(req);
  await audit({ entityType: "compliance_item", action: "bulk_update", performedBy: by, summary: `${v.ids.length} checkpoint(s) updated: ${Object.entries(v.set).filter(([, x]) => x !== undefined).map(([k]) => k).join(", ")}` });
  res.json({ updated: v.ids.length });
}));
router.post("/compliance-items/:id/comments", wrap(async (req, res) => {
  const iid = id(req.params.id);
  const v = parse(z.object({ body: z.string().trim().min(1, "Write a comment").max(4000) }), req.body);
  if (!(await q(sql`SELECT 1 FROM cmp_items WHERE id = ${iid}`)).length) return fail(res, 404, "Checkpoint not found");
  await addComment(iid, req, v.body);
  res.status(201).json({ ok: true });
}));

async function emailAssignment(userIds: number[], itemIds: number[]) {
  try {
    const { sendDirect, notify, htmlTable, esc } = await import("../lib/mailer");
    const items = await q(sql`SELECT i.ref_no, i.seq, i.area, i.checkpoint, i.target_date, i.kind, a.audit_no, a.title, c.name AS company FROM cmp_items i JOIN cmp_audits a ON a.id = i.audit_id JOIN cmp_companies c ON c.id = a.company_id WHERE i.id IN (${sql.join(itemIds.map(x => sql`${x}`), sql`, `)}) ORDER BY i.sort_order`);
    if (!items.length) return;
    const users = await q(sql`SELECT email FROM users WHERE id IN (${sql.join(userIds.map(x => sql`${x}`), sql`, `)}) AND email IS NOT NULL`);
    const to = users.map(u => u.email).filter(Boolean);
    const a = items[0];
    const subject = `Audit ${a.audit_no}: ${items.length} checkpoint(s) assigned to you — ${a.company}`;
    const rows = items.slice(0, 50).map(i => `<tr><td style="padding:4px 8px;border:1px solid #ddd">${esc(i.ref_no ?? "")}${i.seq > 1 ? "." + i.seq : ""}</td><td style="padding:4px 8px;border:1px solid #ddd">${esc(i.area ?? (i.kind === "policy" ? "Policy register" : ""))}</td><td style="padding:4px 8px;border:1px solid #ddd">${esc(String(i.checkpoint).slice(0, 220))}</td><td style="padding:4px 8px;border:1px solid #ddd">${i.target_date ? new Date(i.target_date).toLocaleDateString("en-IN") : "—"}</td></tr>`).join("");
    const html = `<p>You have been made owner / SPOC for the audit checkpoints below. Please add the management reply and upload the evidence in IT Hub › Audit &amp; Compliance.</p>${htmlTable([["Audit", `${a.audit_no} — ${a.title}`], ["Company", a.company]])}
      <table style="border-collapse:collapse;font-size:13px;margin-top:8px"><tr><th style="padding:4px 8px;border:1px solid #ddd">Ref</th><th style="padding:4px 8px;border:1px solid #ddd">Area</th><th style="padding:4px 8px;border:1px solid #ddd">Checkpoint</th><th style="padding:4px 8px;border:1px solid #ddd">Target</th></tr>${rows}</table>${items.length > 50 ? `<p>…and ${items.length - 50} more.</p>` : ""}<p>Regards,</p>`;
    if (to.length) await sendDirect("compliance_assignment", to, subject, html);
    void notify("compliance_assignment", { subject, html });
  } catch (e) { console.error("compliance emailAssignment failed", e); }
}

/* ─── Information schedules (grids) ─────────────────────────────────────── */
router.get("/compliance-audits/:id/grids", wrap(async (req, res) => {
  const aid = id(req.params.id);
  res.json((await q(sql`SELECT g.*, u.name AS owner_name, (SELECT count(*)::int FROM cmp_grid_documents d WHERE d.grid_id = g.id) AS evidence_count FROM cmp_grids g LEFT JOIN users u ON u.id = g.owner_user_id WHERE g.audit_id = ${aid} ORDER BY g.sort_order`)).map(camel));
}));
router.patch("/compliance-grids/:id", wrap(async (req, res) => {
  const gid = id(req.params.id);
  const v = parse(z.object({ grid: z.array(z.array(z.string().max(5000)).max(40)).max(1000).optional(), status: z.enum(STATUSES as [string, ...string[]]).optional(), ownerUserId: z.coerce.number().int().positive().nullable().optional() }), req.body);
  const [o] = await q(sql`SELECT * FROM cmp_grids WHERE id = ${gid}`); if (!o) return fail(res, 404, "Schedule not found");
  await checkUser(v.ownerUserId);
  let grid = v.grid ?? o.grid;
  if (v.grid) { // template label cells cannot be changed
    const t: string[][] = o.template_grid || [];
    grid = v.grid.map((row, r) => row.map((cell, c) => (t[r]?.[c] ? t[r][c] : cell)));
    for (let r = 0; r < t.length; r++) if (!grid[r]) grid[r] = t[r];
  }
  const by = await who(req);
  await q(sql`UPDATE cmp_grids SET grid = ${JSON.stringify(grid)}::jsonb, status = ${v.status ?? o.status}, owner_user_id = ${v.ownerUserId === undefined ? o.owner_user_id : v.ownerUserId}, updated_by = ${by}, updated_at = now() WHERE id = ${gid}`);
  const [r] = await q(sql`SELECT g.*, u.name AS owner_name FROM cmp_grids g LEFT JOIN users u ON u.id = g.owner_user_id WHERE g.id = ${gid}`);
  res.json(camel(r));
}));

/* ─── Evidence & policy library ─────────────────────────────────────────── */
const fileSchema = z.object({ objectPath: z.string().min(1).max(300), fileName: z.string().min(1).max(250), fileSize: z.coerce.number().int().nonnegative().optional(), contentType: z.string().max(150).optional(), note: txt(500) });
const docSchema = z.object({ companyId: z.coerce.number().int().positive().nullable().optional(), category: z.enum(["Policy", "Procedure", "Evidence", "Report", "Agreement", "Other"]).default("Evidence"),
  title: z.string().trim().min(2).max(250), description: txt(2000), ownerUserId: z.coerce.number().int().positive().nullable().optional(), approvedBy: txt(160), approvedOn: dateS,
  lastReviewDate: dateS, nextReviewDate: dateS, confidential: z.boolean().optional() });
const docCols = sql`d.*, c.name AS company_name, u.name AS owner_name, f.id AS file_id, f.file_name, f.version, f.file_size, f.content_type, f.uploaded_at, f.uploaded_by,
  (SELECT count(*)::int FROM cmp_item_documents l WHERE l.document_id = d.id) + (SELECT count(*)::int FROM cmp_grid_documents l WHERE l.document_id = d.id) AS link_count`;
const docJoin = sql`FROM cmp_documents d LEFT JOIN cmp_companies c ON c.id = d.company_id LEFT JOIN users u ON u.id = d.owner_user_id LEFT JOIN LATERAL (SELECT * FROM cmp_document_files x WHERE x.document_id = d.id ORDER BY version DESC LIMIT 1) f ON true`;
router.get("/compliance-documents", wrap(async (req, res) => {
  const company = req.query.companyId ? id(req.query.companyId) : null;
  const cat = typeof req.query.category === "string" && req.query.category ? req.query.category : null;
  const term = typeof req.query.q === "string" && req.query.q.trim() ? `%${req.query.q.trim().toLowerCase()}%` : null;
  res.json((await q(sql`SELECT ${docCols} ${docJoin} WHERE d.is_active ${company ? sql`AND (d.company_id = ${company} OR d.company_id IS NULL)` : sql``} ${cat ? sql`AND d.category = ${cat}` : sql``}
    ${term ? sql`AND (lower(d.title) LIKE ${term} OR lower(coalesce(d.description,'')) LIKE ${term} OR lower(coalesce(f.file_name,'')) LIKE ${term})` : sql``} ORDER BY d.updated_at DESC LIMIT 1000`)).map(camel));
}));
router.get("/compliance-documents/:id", wrap(async (req, res) => {
  const did = id(req.params.id);
  const [d] = await q(sql`SELECT ${docCols} ${docJoin} WHERE d.id = ${did}`); if (!d) return fail(res, 404, "Document not found");
  const files = (await q(sql`SELECT * FROM cmp_document_files WHERE document_id = ${did} ORDER BY version DESC`)).map(camel);
  const links = (await q(sql`SELECT i.id, i.ref_no, i.seq, i.kind, i.checkpoint, a.id AS audit_id, a.audit_no, a.title FROM cmp_item_documents l JOIN cmp_items i ON i.id = l.item_id JOIN cmp_audits a ON a.id = i.audit_id WHERE l.document_id = ${did} ORDER BY a.id, i.sort_order`)).map(camel);
  res.json({ ...camel(d), files, links });
}));
router.post("/compliance-documents", wrap(async (req, res) => {
  const v = parse(docSchema.extend({ file: fileSchema, itemId: z.coerce.number().int().positive().optional(), gridId: z.coerce.number().int().positive().optional() }), req.body);
  await checkUser(v.ownerUserId); const by = await who(req);
  if (v.companyId && !(await q(sql`SELECT 1 FROM cmp_companies WHERE id = ${v.companyId}`)).length) throw new Bad("Company not found");
  await readObject(v.file.objectPath).catch(() => { throw new Bad("Uploaded file not found — upload it again"); });
  const did = await db.transaction(async tx => {
    const [d] = rowsOf(await tx.execute(sql`INSERT INTO cmp_documents (company_id, category, title, description, owner_user_id, approved_by, approved_on, last_review_date, next_review_date, confidential, created_by)
      VALUES (${v.companyId ?? null}, ${v.category}, ${v.title}, ${v.description ?? null}, ${v.ownerUserId ?? null}, ${v.approvedBy ?? null}, ${v.approvedOn ?? null}, ${v.lastReviewDate ?? null}, ${v.nextReviewDate ?? null}, ${v.confidential ?? false}, ${by}) RETURNING id`));
    await tx.execute(sql`INSERT INTO cmp_document_files (document_id, version, object_path, file_name, file_size, content_type, note, uploaded_by) VALUES (${d.id}, 1, ${v.file.objectPath}, ${v.file.fileName}, ${v.file.fileSize ?? null}, ${v.file.contentType ?? null}, ${v.file.note ?? null}, ${by})`);
    if (v.itemId) await tx.execute(sql`INSERT INTO cmp_item_documents (item_id, document_id, linked_by) VALUES (${v.itemId}, ${d.id}, ${by}) ON CONFLICT DO NOTHING`);
    if (v.gridId) await tx.execute(sql`INSERT INTO cmp_grid_documents (grid_id, document_id, linked_by) VALUES (${v.gridId}, ${d.id}, ${by}) ON CONFLICT DO NOTHING`);
    return d.id as number;
  });
  if (v.itemId) await addComment(v.itemId, req, `Evidence uploaded: ${v.title} (${v.file.fileName})`, true);
  await audit({ entityType: "compliance_document", entityId: did, action: "create", performedBy: by, summary: `${v.category} ${v.title} uploaded (${v.file.fileName})` });
  const [d] = await q(sql`SELECT ${docCols} ${docJoin} WHERE d.id = ${did}`);
  res.status(201).json(camel(d));
}));
router.patch("/compliance-documents/:id", wrap(async (req, res) => {
  const did = id(req.params.id);
  const [o] = await q(sql`SELECT * FROM cmp_documents WHERE id = ${did}`); if (!o) return fail(res, 404, "Document not found");
  const v: any = parse(docSchema.partial().extend({ isActive: z.boolean().optional() }), req.body); await checkUser(v.ownerUserId);
  const m: any = { ...camel(o) }; for (const [k, val] of Object.entries(v)) if (val !== undefined) m[k] = val;
  const d10 = (x: any) => (x instanceof Date || (typeof x === "string" && x.length > 10) ? new Date(x).toISOString().slice(0, 10) : x ?? null);
  const by = await who(req);
  await q(sql`UPDATE cmp_documents SET company_id = ${m.companyId ?? null}, category = ${m.category}, title = ${m.title}, description = ${m.description ?? null}, owner_user_id = ${m.ownerUserId ?? null}, approved_by = ${m.approvedBy ?? null},
    approved_on = ${d10(m.approvedOn)}, last_review_date = ${d10(m.lastReviewDate)}, next_review_date = ${d10(m.nextReviewDate)}, confidential = ${m.confidential}, is_active = ${m.isActive}, updated_at = now() WHERE id = ${did}`);
  await audit({ entityType: "compliance_document", entityId: did, action: v.isActive === false ? "archive" : "update", performedBy: by, summary: `${m.category} ${m.title} ${v.isActive === false ? "archived" : "updated"}` });
  const [d] = await q(sql`SELECT ${docCols} ${docJoin} WHERE d.id = ${did}`);
  res.json(camel(d));
}));
router.post("/compliance-documents/:id/files", wrap(async (req, res) => {
  const did = id(req.params.id);
  const v = parse(fileSchema, req.body); const by = await who(req);
  const [d] = await q(sql`SELECT * FROM cmp_documents WHERE id = ${did}`); if (!d) return fail(res, 404, "Document not found");
  await readObject(v.objectPath).catch(() => { throw new Bad("Uploaded file not found — upload it again"); });
  const [f] = await q(sql`INSERT INTO cmp_document_files (document_id, version, object_path, file_name, file_size, content_type, note, uploaded_by)
    SELECT ${did}, coalesce(max(version), 0) + 1, ${v.objectPath}, ${v.fileName}, ${v.fileSize ?? null}, ${v.contentType ?? null}, ${v.note ?? null}, ${by} FROM cmp_document_files WHERE document_id = ${did} RETURNING *`);
  await q(sql`UPDATE cmp_documents SET updated_at = now() WHERE id = ${did}`);
  for (const l of await q(sql`SELECT item_id FROM cmp_item_documents WHERE document_id = ${did}`)) await addComment(l.item_id, req, `New version v${f.version} of ${d.title}: ${v.fileName}`, true);
  await audit({ entityType: "compliance_document", entityId: did, action: "new_version", performedBy: by, summary: `${d.title} v${f.version} uploaded (${v.fileName})` });
  res.status(201).json(camel(f));
}));
const linkSchema = z.object({ documentId: z.coerce.number().int().positive() });
router.post("/compliance-items/:id/documents", wrap(async (req, res) => {
  const iid = id(req.params.id); const v = parse(linkSchema, req.body); const by = await who(req);
  const [d] = await q(sql`SELECT title FROM cmp_documents WHERE id = ${v.documentId} AND is_active`); if (!d) throw new Bad("Document not found");
  if (!(await q(sql`SELECT 1 FROM cmp_items WHERE id = ${iid}`)).length) return fail(res, 404, "Checkpoint not found");
  const ins = await q(sql`INSERT INTO cmp_item_documents (item_id, document_id, linked_by) VALUES (${iid}, ${v.documentId}, ${by}) ON CONFLICT DO NOTHING RETURNING item_id`);
  if (ins.length) await addComment(iid, req, `Evidence linked from library: ${d.title}`, true);
  res.status(201).json({ ok: true });
}));
router.delete("/compliance-items/:id/documents/:docId", wrap(async (req, res) => {
  const iid = id(req.params.id), did = id(req.params.docId);
  const [d] = await q(sql`SELECT title FROM cmp_documents WHERE id = ${did}`);
  const del = await q(sql`DELETE FROM cmp_item_documents WHERE item_id = ${iid} AND document_id = ${did} RETURNING item_id`);
  if (del.length) await addComment(iid, req, `Evidence unlinked: ${d?.title ?? did} (kept in the library)`, true);
  res.json({ ok: true });
}));
router.get("/compliance-grids/:id/documents", wrap(async (req, res) => {
  const gid = id(req.params.id);
  res.json((await q(sql`SELECT ${docCols} ${docJoin} JOIN cmp_grid_documents l ON l.document_id = d.id WHERE l.grid_id = ${gid} ORDER BY l.linked_at`)).map(camel));
}));
router.post("/compliance-grids/:id/documents", wrap(async (req, res) => {
  const gid = id(req.params.id); const v = parse(linkSchema, req.body); const by = await who(req);
  await q(sql`INSERT INTO cmp_grid_documents (grid_id, document_id, linked_by) VALUES (${gid}, ${v.documentId}, ${by}) ON CONFLICT DO NOTHING`);
  res.status(201).json({ ok: true });
}));
router.delete("/compliance-grids/:id/documents/:docId", wrap(async (req, res) => {
  await q(sql`DELETE FROM cmp_grid_documents WHERE grid_id = ${id(req.params.id)} AND document_id = ${id(req.params.docId)}`);
  res.json({ ok: true });
}));

/* Files: served only here, every view / download logged */
router.get("/compliance-files/:id", wrap(async (req, res) => {
  const fid = id(req.params.id);
  const [f] = await q(sql`SELECT f.*, d.title FROM cmp_document_files f JOIN cmp_documents d ON d.id = f.document_id WHERE f.id = ${fid}`);
  if (!f) return fail(res, 404, "File not found");
  const obj = await readObject(f.object_path).catch(() => null); if (!obj) return fail(res, 404, "File is missing from storage");
  const download = req.query.download === "1";
  await q(sql`INSERT INTO cmp_access_log (user_id, user_name, action, document_id, file_id, ip) VALUES (${uid(req) ?? null}, ${await who(req)}, ${download ? "download" : "view"}, ${f.document_id}, ${fid}, ${req.ip ?? null})`);
  res.setHeader("Content-Type", f.content_type || obj.contentType);
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${String(f.file_name).replace(/["\r\n]/g, "")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(obj.buffer);
}));

/* ─── Export (auditor's workbook layout) ─────────────────────────────────── */
router.get("/compliance-audits/:id/export", wrap(async (req, res) => {
  const aid = id(req.params.id);
  const a = await getAudit(aid); if (!a) return fail(res, 404, "Audit not found");
  const items = (await q(sql`SELECT * FROM cmp_items WHERE audit_id = ${aid} ORDER BY sort_order`)).map(camel).map((i: any) => ({ ...i, targetDate: i.targetDate ? String(i.targetDate).slice(0, 10) : null, lastReviewDate: i.lastReviewDate ? String(i.lastReviewDate).slice(0, 10) : null }));
  const grids = (await q(sql`SELECT * FROM cmp_grids WHERE audit_id = ${aid} ORDER BY sort_order`)).map(camel);
  const users = new Map((await q(sql`SELECT id, name FROM users`)).map(u => [u.id as number, u.name as string]));
  const docsByItem = new Map<number, string[]>();
  for (const l of await q(sql`SELECT l.item_id, d.title, f.file_name, f.version FROM cmp_item_documents l JOIN cmp_items i ON i.id = l.item_id JOIN cmp_documents d ON d.id = l.document_id
    LEFT JOIN LATERAL (SELECT * FROM cmp_document_files x WHERE x.document_id = d.id ORDER BY version DESC LIMIT 1) f ON true WHERE i.audit_id = ${aid}`))
    docsByItem.set(l.item_id, [...(docsByItem.get(l.item_id) || []), `${l.title}${l.file_name ? ` (${l.file_name}, v${l.version})` : ""}`]);
  const buf = exportWorkbook({ audit: a, items, grids, users, docsByItem });
  await audit({ entityType: "compliance_audit", entityId: aid, action: "export", performedBy: await who(req), summary: `Audit ${a.auditNo} exported to Excel` });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${a.auditNo}_${String(a.companyName).replace(/[^A-Za-z0-9]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
}));

export { CLOSED };
export default router;
