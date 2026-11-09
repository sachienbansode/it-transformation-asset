import { Router, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, mastersTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess } from "../lib/rbac";
import { isItsmAdmin } from "../lib/access-model";

/*
 * Masters (ITH-076) — every drop-down value in IT Hub, including the ITSM lookup lists (category "itsm.*").
 *  - Values are never deleted: they are deactivated (reason required) and can be activated again. Existing records keep
 *    the value they were saved with; inactive values no longer appear in drop-downs.
 *  - Every addition, change, deactivation and activation is in the audit log with from → to, and in the value's history.
 *  - Listing is paged, searchable and filterable by status.
 *  - Super Admin manages all masters; ITSM Admin manages the ITSM lists.
 */
const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); }
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "value";
const uid = (req: Request) => Number((req.session as any)?.userId) || undefined;

/** ITSM lookup lists kept as master rows (seeded once from the old settings, else the defaults). */
export const ITSM_LISTS: { key: string; label: string; note: string; parentOf?: string }[] = [
  { key: "itsm.urgencyLevels", label: "Urgency levels", note: "Incidents and Service Requests" },
  { key: "itsm.impactLevels", label: "Impact levels", note: "Incidents and Problems" },
  { key: "itsm.departments", label: "Departments (ITSM)", note: "Service Requests" },
  { key: "itsm.itGroups", label: "IT groups", note: "Assigned group on every ticket type" },
  { key: "itsm.incidentSources", label: "Incident sources", note: "How an incident was reported" },
  { key: "itsm.incidentCategories", label: "Incident categories", note: "Incidents form" },
  { key: "itsm.incidentSubcategories", label: "Incident subcategories", note: "Shown when an incident category is chosen", parentOf: "itsm.incidentCategories" },
  { key: "itsm.problemCategories", label: "Problem categories", note: "Problems form" },
  { key: "itsm.changeCategories", label: "Change categories", note: "Change Requests form" },
  { key: "itsm.srCategories", label: "Service request categories", note: "Service Requests form" },
];
const isItsmList = (c: string) => c.startsWith("itsm.");

async function canManage(req: Request, category: string) {
  const a = await getAccess(req);
  if (a?.isAdmin) return true;
  return isItsmList(category) && isItsmAdmin(a);
}

let seeded = false;
/** One-time move of the ITSM lists from settings (JSON arrays) into master rows. Safe to call repeatedly. */
export async function seedItsmLists(defaults: Record<string, unknown>) {
  if (seeded) return; seeded = true;
  for (const l of ITSM_LISTS) {
    const [have] = rowsOf(await db.execute(sql`SELECT 1 FROM masters WHERE category = ${l.key} LIMIT 1`));
    if (have) continue;
    const [st] = rowsOf(await db.execute(sql`SELECT value FROM settings WHERE key = ${l.key}`));
    let v: any = st?.value ?? defaults[l.key]; if (typeof v === "string") { try { v = JSON.parse(v); } catch { /* keep */ } }
    const rows: { label: string; parent: string | null }[] = [];
    if (Array.isArray(v)) v.forEach((x: any) => rows.push({ label: String(x), parent: null }));
    else if (v && typeof v === "object") for (const [p, list] of Object.entries(v)) (Array.isArray(list) ? list : []).forEach((x: any) => rows.push({ label: String(x), parent: p }));
    let n = 0; const used = new Set<string>();
    for (const r of rows) {
      let key = (r.parent ? slug(r.parent) + "__" : "") + slug(r.label); while (used.has(key)) key += "_";
      used.add(key);
      await db.execute(sql`INSERT INTO masters (category, key, label, parent, sort_order, is_active, created_by) VALUES (${l.key}, ${key}, ${r.label}, ${r.parent}, ${++n}, true, 'System (moved from ITSM settings)')`);
    }
  }
}
/** Active values of the ITSM lists in the shape /itsm-config always returned (arrays; subcategories by category). */
export async function itsmListValues() {
  const rows = rowsOf(await db.execute(sql`SELECT category, label, parent FROM masters WHERE category LIKE 'itsm.%' AND is_active ORDER BY category, parent NULLS FIRST, sort_order, label`));
  const out: Record<string, any> = {};
  for (const l of ITSM_LISTS) out[l.key] = l.parentOf ? {} : [];
  for (const r of rows) {
    const l = ITSM_LISTS.find(x => x.key === r.category); if (!l) continue;
    if (l.parentOf) { if (r.parent) (out[l.key][r.parent] ||= []).push(r.label); } else out[l.key].push(r.label);
  }
  return out;
}

const VIEW = sql`id, category, key, label, parent, color, sort_order AS "sortOrder", is_active AS "isActive", created_at AS "createdAt", created_by AS "createdBy",
  updated_at AS "updatedAt", updated_by AS "updatedBy", status_reason AS "statusReason"`;
const one = async (id: number) => rowsOf(await db.execute(sql`SELECT ${VIEW} FROM masters WHERE id = ${id}`))[0];

// GET /masters — list all, optionally filter by category; ?showAll=true (admin only) returns inactive items too
router.get("/masters", async (req, res): Promise<void> => {
  const category = req.query.category as string | undefined;
  let isAdmin = false;
  if (req.query.showAll === "true" && req.session.userId) {
    const [u] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, req.session.userId));
    isAdmin = u?.role === "admin";
  }
  const where = isAdmin ? (category ? eq(mastersTable.category, category) : undefined)
    : (category ? and(eq(mastersTable.category, category), eq(mastersTable.isActive, true)) : eq(mastersTable.isActive, true));
  res.json(await db.select().from(mastersTable).where(where).orderBy(mastersTable.category, mastersTable.sortOrder, mastersTable.label));
});

/** Paged admin listing for one category: ?category&q&status=active|inactive|all&parent&page&pageSize */
router.get("/masters-admin", requireAuth, wrap(async (req, res) => {
  const category = String(req.query.category || ""); if (!category) return fail(res, 400, "Choose a master list");
  if (!await canManage(req, category)) return fail(res, 403, "No access to this master list");
  const q = String(req.query.q || "").trim().toLowerCase(); const st = String(req.query.status || "all"); const parent = String(req.query.parent || "");
  const page = Math.max(1, Number(req.query.page) || 1), size = Math.min(100, Math.max(5, Number(req.query.pageSize) || 10));
  const where = sql`category = ${category} AND (${q} = '' OR lower(label) LIKE ${"%" + q + "%"} OR lower(coalesce(parent, '')) LIKE ${"%" + q + "%"})
    AND (${st} = 'all' OR (${st} = 'active' AND is_active) OR (${st} = 'inactive' AND NOT is_active)) AND (${parent} = '' OR parent = ${parent})`;
  const [c] = rowsOf(await db.execute(sql`SELECT count(*) FILTER (WHERE ${where})::int AS total, count(*) FILTER (WHERE is_active)::int AS active,
      count(*) FILTER (WHERE NOT is_active)::int AS inactive FROM masters WHERE category = ${category}`));
  const rows = rowsOf(await db.execute(sql`SELECT ${VIEW} FROM masters WHERE ${where} ORDER BY parent NULLS FIRST, sort_order, label LIMIT ${size} OFFSET ${(page - 1) * size}`));
  const l = ITSM_LISTS.find(x => x.key === category);
  const parents = l?.parentOf ? rowsOf(await db.execute(sql`SELECT label, is_active AS "isActive" FROM masters WHERE category = ${l.parentOf} ORDER BY sort_order, label`)) : [];
  res.json({ rows, total: c?.total || 0, counts: { active: c?.active || 0, inactive: c?.inactive || 0 }, parents });
}));
router.get("/masters-admin/itsm-lists", requireAuth, wrap(async (req, res) => {
  const a = await getAccess(req); if (!a?.isAdmin && !isItsmAdmin(a)) return fail(res, 403, "No access");
  const cnt = rowsOf(await db.execute(sql`SELECT category, count(*) FILTER (WHERE is_active)::int AS active, count(*) FILTER (WHERE NOT is_active)::int AS inactive FROM masters WHERE category LIKE 'itsm.%' GROUP BY 1`));
  res.json(ITSM_LISTS.map(l => ({ ...l, ...(cnt.find(c => c.category === l.key) || { active: 0, inactive: 0 }) })));
}));

const Body = z.object({ category: z.string().min(1).max(60).optional(), key: z.string().max(80).optional(), label: z.string().trim().min(1, "Enter a value").max(120),
  parent: z.string().trim().max(120).nullable().optional(), color: z.string().max(40).nullable().optional(), sortOrder: z.number().int().min(0).max(9999).optional(), isActive: z.boolean().optional() });
async function duplicate(category: string, label: string, parent: string | null, notId = 0) {
  const [d] = rowsOf(await db.execute(sql`SELECT id, is_active FROM masters WHERE category = ${category} AND lower(label) = ${label.toLowerCase()} AND coalesce(parent, '') = ${parent || ""} AND id <> ${notId} LIMIT 1`));
  return d;
}

// POST /masters — add a value
router.post("/masters", requireAuth, wrap(async (req, res) => {
  const b = Body.safeParse(req.body); if (!b.success) return fail(res, 400, b.error.issues[0]?.message || "Invalid value");
  const category = b.data.category || ""; if (!category) return fail(res, 400, "Choose a master list");
  if (!await canManage(req, category)) return fail(res, 403, "No access to this master list");
  const l = ITSM_LISTS.find(x => x.key === category); const parent = b.data.parent?.trim() || null;
  if (l?.parentOf && !parent) return fail(res, 400, "Choose the category this subcategory belongs to");
  if (l?.parentOf && parent) { const [p] = rowsOf(await db.execute(sql`SELECT 1 FROM masters WHERE category = ${l.parentOf} AND label = ${parent} LIMIT 1`)); if (!p) return fail(res, 400, `“${parent}” is not a category`); }
  const d = await duplicate(category, b.data.label, parent);
  if (d) return fail(res, 409, d.is_active ? `“${b.data.label}” already exists` : `“${b.data.label}” already exists but is inactive — activate it instead`);
  const by = await getPerformedBy(uid(req));
  let key = b.data.key?.trim() || (parent ? slug(parent) + "__" : "") + slug(b.data.label);
  while (rowsOf(await db.execute(sql`SELECT 1 FROM masters WHERE category = ${category} AND key = ${key}`)).length) key += "_";
  const sort = b.data.sortOrder ?? Number(rowsOf(await db.execute(sql`SELECT coalesce(max(sort_order), 0) + 1 AS n FROM masters WHERE category = ${category} AND coalesce(parent, '') = ${parent || ""}`))[0].n);
  const [r] = rowsOf(await db.execute(sql`INSERT INTO masters (category, key, label, parent, color, sort_order, is_active, created_by) VALUES (${category}, ${key}, ${b.data.label}, ${parent}, ${b.data.color || null}, ${sort}, true, ${by}) RETURNING id`));
  await logAudit({ entityType: "master", entityId: r.id, action: "create", performedBy: by, summary: `Master ${category}: added “${b.data.label}”${parent ? ` under ${parent}` : ""}`, newValues: { category, label: b.data.label, parent, color: b.data.color || null, sortOrder: sort } });
  res.status(201).json(await one(r.id));
}));

// PATCH /masters/:id — change the value / colour / order. Activation status has its own endpoints (reason required).
router.patch("/masters/:id", requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id); const old = await one(id); if (!old) return fail(res, 404, "Not found");
  if (!await canManage(req, old.category)) return fail(res, 403, "No access to this master list");
  const b = Body.partial().safeParse(req.body); if (!b.success) return fail(res, 400, b.error.issues[0]?.message || "Invalid value");
  if (b.data.isActive !== undefined && b.data.isActive !== old.isActive) return fail(res, 400, `Use ${b.data.isActive ? "Activate" : "Deactivate"} — a reason is recorded`);
  const next: any = { label: b.data.label ?? old.label, color: b.data.color === undefined ? old.color : b.data.color || null, sortOrder: b.data.sortOrder ?? old.sortOrder };
  const changes = (["label", "color", "sortOrder"] as const).filter(k => String(next[k] ?? "") !== String(old[k] ?? ""));
  if (!changes.length) return res.json(old);
  if (changes.includes("label") && await duplicate(old.category, next.label, old.parent, id)) return fail(res, 409, `“${next.label}” already exists`);
  const by = await getPerformedBy(uid(req));
  await db.execute(sql`UPDATE masters SET label = ${next.label}, color = ${next.color}, sort_order = ${next.sortOrder}, updated_at = now(), updated_by = ${by} WHERE id = ${id}`);
  // a renamed incident category keeps its subcategories
  if (changes.includes("label")) { const l = ITSM_LISTS.find(x => x.parentOf === old.category); if (l) await db.execute(sql`UPDATE masters SET parent = ${next.label} WHERE category = ${l.key} AND parent = ${old.label}`); }
  const txt = changes.map(k => `${k === "sortOrder" ? "order" : k} “${old[k] ?? "—"}” → “${next[k] ?? "—"}”`).join(", ");
  await logAudit({ entityType: "master", entityId: id, action: "update", performedBy: by, summary: `Master ${old.category}: ${txt}${changes.includes("label") ? " (records saved earlier keep the old text)" : ""}`,
    newValues: { from: Object.fromEntries(changes.map(k => [k, old[k]])), to: Object.fromEntries(changes.map(k => [k, next[k]])) } });
  res.json(await one(id));
}));

// POST /masters/:id/deactivate | activate { reason }
router.post("/masters/:id/:action", requireAuth, (req, _res, next) => ["activate", "deactivate"].includes(String(req.params.action)) ? next() : next("route"), wrap(async (req, res) => {
  const id = Number(req.params.id); const old = await one(id); if (!old) return fail(res, 404, "Not found");
  if (!await canManage(req, old.category)) return fail(res, 403, "No access to this master list");
  const on = req.params.action === "activate"; const reason = String(req.body?.reason || "").trim().slice(0, 300);
  if (old.isActive === on) return fail(res, 400, `Already ${on ? "active" : "inactive"}`);
  if (!on && reason.length < 5) return fail(res, 400, "Give a reason for deactivating (at least 5 characters)");
  if (on && old.parent) { const l = ITSM_LISTS.find(x => x.key === old.category); if (l?.parentOf) { const [p] = rowsOf(await db.execute(sql`SELECT is_active FROM masters WHERE category = ${l.parentOf} AND label = ${old.parent} LIMIT 1`)); if (p && !p.is_active) return fail(res, 400, `Activate the category “${old.parent}” first`); } }
  const by = await getPerformedBy(uid(req));
  await db.execute(sql`UPDATE masters SET is_active = ${on}, status_reason = ${reason || null}, updated_at = now(), updated_by = ${by} WHERE id = ${id}`);
  await logAudit({ entityType: "master", entityId: id, action: on ? "activate" : "deactivate", performedBy: by, summary: `Master ${old.category}: “${old.label}” ${on ? "activated" : "deactivated"}${reason ? ` — ${reason}` : ""}`, newValues: { from: old.isActive ? "Active" : "Inactive", to: on ? "Active" : "Inactive", reason: reason || null } });
  res.json(await one(id));
}));

/** History of one value (from the audit log). */
router.get("/masters/:id/history", requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id); const m = await one(id); if (!m) return fail(res, 404, "Not found");
  if (!await canManage(req, m.category)) return fail(res, 403, "No access");
  res.json({ master: m, history: rowsOf(await db.execute(sql`SELECT id, action, performed_by AS "performedBy", summary, performed_at AS "at" FROM audit_logs WHERE entity_type = 'master' AND entity_id = ${id} ORDER BY id DESC LIMIT 200`)) });
}));

// Masters are never deleted
router.delete("/masters/:id", requireAuth, (_req, res) => { fail(res, 405, "Master values cannot be deleted — deactivate them instead"); });

export default router;
