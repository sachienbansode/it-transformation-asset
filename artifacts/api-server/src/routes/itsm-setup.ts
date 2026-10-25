import { Router, type Request, type Response } from "express";
import { db, usersTable, itsmTeamsTable, itsmTeamMembersTable, itsmCatalogTable, itsmIncidentsTable, itsmServiceRequestsTable } from "@workspace/db";
import { and, eq, inArray, sql, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess } from "../lib/rbac";
import { createBatch, batchWorkbook, XLSX_TYPE } from "../lib/archive";
import { notify, htmlTable } from "../lib/mailer";
import { route, RoutingError, teamIdsOf, teamMembers, DEFAULT_DAYS, addBusinessDays, CATALOG_TYPE } from "../lib/itsm-routing";

/*
 * ITSM Setup: assignment groups (teams with members and a lead) and the category / sub-category catalog that routes
 * new tickets to a team and sets the expected closure date. Writes need module "ITSM Setup" (itsm_setup) — enforced
 * by lib/rbac.ts; reads are open to anyone with ITSM access (forms and lists need them).
 */

const router = Router();
router.use(requireAuth);
const fail = (res: Response, c: number, e: string) => { res.status(c).json({ error: e }); };
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); }
};
class Bad extends Error { status = 400; }
const s = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const who = async (req: Request) => getPerformedBy((req.session as any)?.userId).catch(() => "System");
const audit = (p: Parameters<typeof logAudit>[0]) => logAudit(p).catch(() => { /* non-fatal */ });
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new Bad(r.error.issues.map(i => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message).join("; "));
  return r.data;
}

/* ─── Teams ──────────────────────────────────────────────────────────────── */

router.get("/itsm-teams", wrap(async (req, res) => {
  const teams = await db.select().from(itsmTeamsTable).orderBy(asc(itsmTeamsTable.name));
  const members = await db.select({ teamId: itsmTeamMembersTable.teamId, id: usersTable.id, name: usersTable.name, email: usersTable.email, isActive: usersTable.isActive })
    .from(itsmTeamMembersTable).innerJoin(usersTable, eq(usersTable.id, itsmTeamMembersTable.userId)).orderBy(usersTable.name);
  const open = (r: any) => (r.rows ?? r) as any[];
  const counts = new Map<number, number>();
  for (const r of open(await db.execute(sql`SELECT team_id, count(*)::int n FROM (SELECT team_id FROM itsm_incidents WHERE is_active AND status NOT IN ('Resolved','Closed') UNION ALL SELECT team_id FROM itsm_service_requests WHERE is_active AND status NOT IN ('Completed','Cancelled','Rejected')) x WHERE team_id IS NOT NULL GROUP BY team_id`))) counts.set(r.team_id, r.n);
  const mapped = new Map<number, number>();
  for (const r of open(await db.execute(sql`SELECT team_id, count(*)::int n FROM itsm_catalog WHERE is_active AND team_id IS NOT NULL GROUP BY team_id`))) mapped.set(r.team_id, r.n);
  const mine = new Set(await teamIdsOf((req.session as any)?.userId));
  res.json(teams.filter(t => t.isActive || req.query.all === "1").map(t => ({ ...t, members: members.filter(m => m.teamId === t.id && m.isActive).map(({ teamId, isActive, ...m }) => m), openTickets: counts.get(t.id) || 0, categoriesMapped: mapped.get(t.id) || 0, isMine: mine.has(t.id) })));
}));

const teamSchema = z.object({
  name: z.string({ required_error: "Team name is required" }).trim().min(2, "Team name is required").max(80),
  description: z.string().trim().max(300).nullable().optional(),
  email: z.string().trim().email("Team email is not valid").nullable().optional().or(z.literal("").transform(() => null)),
  leadUserId: z.coerce.number().int().positive().nullable().optional(),
}).passthrough();

async function checkTeam(v: any, id?: number) {
  const [dup] = await db.select({ id: itsmTeamsTable.id }).from(itsmTeamsTable).where(sql`lower(${itsmTeamsTable.name}) = lower(${v.name})`);
  if (dup && dup.id !== id) throw new Bad(`A team named "${v.name}" already exists`);
  if (v.leadUserId) { const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.id, v.leadUserId), eq(usersTable.isActive, true))); if (!u) throw new Bad("Team lead must be an active user"); }
}

router.post("/itsm-teams", wrap(async (req, res) => {
  const v: any = parse(teamSchema, req.body);
  await checkTeam(v);
  const by = await who(req);
  const [t] = await db.insert(itsmTeamsTable).values({ name: v.name, description: s(v.description), email: s(v.email), leadUserId: v.leadUserId ?? null }).returning();
  if (t.leadUserId) await db.insert(itsmTeamMembersTable).values({ teamId: t.id, userId: t.leadUserId }).onConflictDoNothing();
  await audit({ entityType: "itsm_team", entityId: t.id, action: "create", performedBy: by, summary: `Team created: ${t.name}` });
  res.status(201).json(t);
}));

router.patch("/itsm-teams/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [old] = await db.select().from(itsmTeamsTable).where(eq(itsmTeamsTable.id, id));
  if (!old) return fail(res, 404, "Team not found");
  const v: any = parse(teamSchema, { ...old, ...req.body });
  await checkTeam(v, id);
  if (req.body?.isActive === false) {
    const [m] = (await db.execute(sql`SELECT count(*)::int n FROM itsm_catalog WHERE is_active AND team_id = ${id}`) as any).rows ?? [];
    if (m?.n > 0) throw new Bad(`${old.name} is mapped to ${m.n} categor${m.n === 1 ? "y" : "ies"} — map them to another team first`);
  }
  const by = await who(req);
  const [t] = await db.update(itsmTeamsTable).set({ name: v.name, description: s(v.description), email: s(v.email), leadUserId: v.leadUserId ?? null, isActive: req.body?.isActive ?? old.isActive, updatedAt: new Date() }).where(eq(itsmTeamsTable.id, id)).returning();
  if (t.leadUserId) await db.insert(itsmTeamMembersTable).values({ teamId: id, userId: t.leadUserId }).onConflictDoNothing();
  if (t.name !== old.name) { // keep the readable team name on tickets in step
    await db.update(itsmIncidentsTable).set({ assignedGroup: t.name }).where(eq(itsmIncidentsTable.teamId, id));
    await db.update(itsmServiceRequestsTable).set({ assignedGroup: t.name }).where(eq(itsmServiceRequestsTable.teamId, id));
  }
  await audit({ entityType: "itsm_team", entityId: id, action: "update", performedBy: by, summary: `Team updated: ${old.name}${t.name !== old.name ? ` → ${t.name}` : ""}${t.isActive !== old.isActive ? (t.isActive ? " (reactivated)" : " (deactivated)") : ""}` });
  res.json(t);
}));

router.put("/itsm-teams/:id/members", wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [t] = await db.select().from(itsmTeamsTable).where(eq(itsmTeamsTable.id, id));
  if (!t) return fail(res, 404, "Team not found");
  const ids: number[] = [...new Set<number>((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0))];
  if (ids.length) { const us = await db.select({ id: usersTable.id }).from(usersTable).where(and(inArray(usersTable.id, ids), eq(usersTable.isActive, true))); if (us.length !== ids.length) throw new Bad("Every member must be an active user"); }
  if (t.leadUserId && !ids.includes(t.leadUserId)) ids.push(t.leadUserId);
  const before = (await teamMembers(id)).map(m => m.name);
  await db.transaction(async tx => {
    await tx.delete(itsmTeamMembersTable).where(eq(itsmTeamMembersTable.teamId, id));
    if (ids.length) await tx.insert(itsmTeamMembersTable).values(ids.map(userId => ({ teamId: id, userId })));
  });
  const after = (await teamMembers(id)).map(m => m.name);
  await audit({ entityType: "itsm_team", entityId: id, action: "members", performedBy: await who(req), summary: `${t.name} members: ${after.join(", ") || "(none)"} (was ${before.join(", ") || "none"})` });
  res.json({ ok: true, members: after });
}));

/* ─── Catalog ────────────────────────────────────────────────────────────── */

router.get("/itsm-catalog", wrap(async (req, res) => {
  const type = s(req.query.ticketType);
  const rows = await db.select().from(itsmCatalogTable).where(type ? eq(itsmCatalogTable.ticketType, type) : sql`true`).orderBy(asc(itsmCatalogTable.ticketType), asc(itsmCatalogTable.sortOrder), asc(itsmCatalogTable.category));
  const teams = new Map((await db.select().from(itsmTeamsTable)).map(t => [t.id, t]));
  const out = rows.filter(r => r.isActive || req.query.all === "1").map(r => {
    const parent = r.subcategory ? rows.find(p => !p.subcategory && p.ticketType === r.ticketType && p.category.toLowerCase() === r.category.toLowerCase()) : null;
    const teamId = r.teamId ?? parent?.teamId ?? null;
    const days = r.resolutionDays ?? parent?.resolutionDays ?? null;
    return { ...r, teamName: r.teamId ? teams.get(r.teamId)?.name : null, effectiveTeamId: teamId, effectiveTeam: teamId ? teams.get(teamId)?.name ?? null : null, effectiveDays: days ?? DEFAULT_DAYS, daysDefaulted: days == null, inherits: !!r.subcategory && r.teamId == null };
  });
  res.json(out);
}));

const catSchema = z.object({
  ticketType: z.enum(["Incident", "Service Request"]),
  category: z.string().trim().min(2, "Category is required").max(80),
  subcategory: z.string().trim().max(80).nullable().optional(),
  teamId: z.coerce.number().int().positive().nullable().optional(),
  resolutionDays: z.coerce.number().int("Days must be a whole number").min(0).max(365).nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
}).passthrough();

async function checkCatalog(v: any, id?: number) {
  const sub = s(v.subcategory);
  if (!sub && !v.teamId) throw new Bad("Map the category to a team (assignment group)");
  if (v.teamId) { const [t] = await db.select().from(itsmTeamsTable).where(eq(itsmTeamsTable.id, v.teamId)); if (!t || !t.isActive) throw new Bad("Choose an active team"); }
  if (sub) {
    const [parent] = await db.select().from(itsmCatalogTable).where(and(eq(itsmCatalogTable.ticketType, v.ticketType), sql`lower(${itsmCatalogTable.category}) = lower(${v.category})`, sql`${itsmCatalogTable.subcategory} IS NULL`, eq(itsmCatalogTable.isActive, true)));
    if (!parent) throw new Bad(`Add the category "${v.category}" first, then its sub-categories`);
  }
  const [dup] = await db.select({ id: itsmCatalogTable.id }).from(itsmCatalogTable).where(and(eq(itsmCatalogTable.ticketType, v.ticketType), sql`lower(${itsmCatalogTable.category}) = lower(${v.category})`, sql`lower(coalesce(${itsmCatalogTable.subcategory}, '')) = lower(${sub ?? ""})`));
  if (dup && dup.id !== id) throw new Bad(`${v.category}${sub ? ` › ${sub}` : ""} already exists`);
}

router.post("/itsm-catalog", wrap(async (req, res) => {
  const v: any = parse(catSchema, req.body);
  await checkCatalog(v);
  const by = await who(req);
  const [r] = await db.insert(itsmCatalogTable).values({ ticketType: v.ticketType, category: v.category, subcategory: s(v.subcategory), teamId: v.teamId ?? null, resolutionDays: v.resolutionDays ?? null, sortOrder: v.sortOrder ?? 999, updatedBy: by }).returning();
  await audit({ entityType: "itsm_catalog", entityId: r.id, action: "create", performedBy: by, summary: `${r.ticketType} category ${r.category}${r.subcategory ? ` › ${r.subcategory}` : ""} added` });
  res.status(201).json(r);
}));

router.patch("/itsm-catalog/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [old] = await db.select().from(itsmCatalogTable).where(eq(itsmCatalogTable.id, id));
  if (!old) return fail(res, 404, "Catalog entry not found");
  const v: any = parse(catSchema, { ...old, ...req.body });
  if (req.body?.isActive !== false) await checkCatalog(v, id);
  const by = await who(req);
  const set: any = { category: v.category, subcategory: s(v.subcategory), teamId: v.teamId ?? null, resolutionDays: v.resolutionDays ?? null, sortOrder: v.sortOrder ?? old.sortOrder, isActive: req.body?.isActive ?? old.isActive, updatedBy: by, updatedAt: new Date() };
  const [r] = await db.update(itsmCatalogTable).set(set).where(eq(itsmCatalogTable.id, id)).returning();
  if (!old.subcategory && set.isActive === false) await db.update(itsmCatalogTable).set({ isActive: false, updatedBy: by, updatedAt: new Date() }).where(and(eq(itsmCatalogTable.ticketType, old.ticketType), sql`lower(${itsmCatalogTable.category}) = lower(${old.category})`));
  await audit({ entityType: "itsm_catalog", entityId: id, action: "update", performedBy: by, summary: `${r.ticketType} ${r.category}${r.subcategory ? ` › ${r.subcategory}` : ""}: team ${r.teamId ?? "inherit"}, days ${r.resolutionDays ?? "default"}${r.isActive ? "" : " (removed)"} — applies to new tickets` });
  res.json(r);
}));


/* ─── Excel upload: the whole catalog in one sheet ───────────────────────────
 * Rows: Ticket Type | Category | Sub-category (blank = category row) | Assigned Group | Days to Close (blank = default) | Active (Yes/No).
 * Listed rows are added or updated; Active = No removes (a category also removes its sub-categories). Rows not in the file are left alone.
 * dryRun returns the plan and every error; apply runs in one transaction, then archives (before / after / changes) and emails.
 */
const TYPE_ALIASES: Record<string, string> = { "service request": "Service Request", sr: "Service Request", request: "Service Request", incident: "Incident", inc: "Incident" };
async function catalogSnapshot() {
  const teams = new Map((await db.select().from(itsmTeamsTable)).map(t => [t.id, t.name]));
  const rows = await db.select().from(itsmCatalogTable).where(eq(itsmCatalogTable.isActive, true)).orderBy(asc(itsmCatalogTable.ticketType), asc(itsmCatalogTable.sortOrder), asc(itsmCatalogTable.category));
  return rows.map(r => ({ "Ticket Type": r.ticketType, "Category": r.category, "Sub-category": r.subcategory ?? "", "Assigned Group": r.teamId ? teams.get(r.teamId) ?? "" : "", "Days to Close": r.resolutionDays ?? "" }));
}
const keyOf = (t: string, c: string, sub: string | null) => `${t}|${c.toLowerCase()}|${(sub ?? "").toLowerCase()}`;

router.post("/itsm-catalog/import", wrap(async (req, res) => {
  const input: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const dryRun = req.body?.dryRun !== false;
  if (!input.length) return fail(res, 400, "No rows in the file");
  if (input.length > 2000) return fail(res, 400, "Too many rows (max 2000)");
  const teams = await db.select().from(itsmTeamsTable);
  const teamOf = (n: string) => teams.find(t => t.name.toLowerCase() === n.toLowerCase());
  const all = await db.select().from(itsmCatalogTable);
  const existing = new Map(all.map(r => [keyOf(r.ticketType, r.category, r.subcategory), r]));
  const errors: { row: number; field: string; message: string }[] = [];
  const err = (row: number, field: string, message: string) => errors.push({ row, field, message });
  type P = { row: number; ticketType: string; category: string; subcategory: string | null; teamId: number | null; team: string | null; days: number | null; active: boolean; sortOrder: number };
  const plan: P[] = []; const seen = new Map<string, number>();
  input.forEach((r, i) => {
    const row = Number(r.__row) || i + 2;
    const tt = TYPE_ALIASES[String(r.ticketType ?? "").trim().toLowerCase()];
    const category = String(r.category ?? "").trim().replace(/\s+/g, " ");
    const subcategory = s(r.subcategory)?.replace(/\s+/g, " ") ?? null;
    const teamName = s(r.team);
    const daysRaw = s(r.days);
    const activeRaw = (s(r.active) ?? "yes").toLowerCase();
    if (!tt) err(row, "Ticket Type", `"${r.ticketType ?? ""}" — use Service Request or Incident`);
    if (category.length < 2) err(row, "Category", "Category is required");
    else if (category.length > 80) err(row, "Category", "Max 80 characters");
    if (subcategory && subcategory.length > 80) err(row, "Sub-category", "Max 80 characters");
    if (!["yes", "y", "no", "n", "true", "false", "1", "0", "active", "inactive"].includes(activeRaw)) err(row, "Active", `"${r.active}" — use Yes or No`);
    const active = ["yes", "y", "true", "1", "active"].includes(activeRaw);
    let teamId: number | null = null;
    if (teamName) { const t = teamOf(teamName); if (!t) err(row, "Assigned Group", `"${teamName}" is not a team — use a name from the Teams sheet (add new teams in ITSM Setup › Teams first)`); else if (!t.isActive) err(row, "Assigned Group", `"${t.name}" is inactive`); else teamId = t.id; }
    let days: number | null = null;
    if (daysRaw) { const n = Number(daysRaw); if (!Number.isInteger(n) || n < 0 || n > 365) err(row, "Days to Close", `"${daysRaw}" — whole number 0–365, or blank for the default (T+${DEFAULT_DAYS})`); else days = n; }
    if (active && !subcategory && !teamName) err(row, "Assigned Group", "A category row needs an Assigned Group");
    if (!tt || category.length < 2) return;
    const k = keyOf(tt, category, subcategory);
    if (seen.has(k)) { err(row, "Category", `Duplicate of row ${seen.get(k)}`); return; }
    seen.set(k, row);
    plan.push({ row, ticketType: tt, category, subcategory, teamId, team: teamName ? teamOf(teamName)?.name ?? teamName : null, days, active, sortOrder: (i + 1) * 10 });
  });
  // hierarchy: an active sub-category needs its category active (in the file or already in the catalog)
  const catActive = (tt: string, c: string) => { const f = plan.find(p => p.ticketType === tt && !p.subcategory && p.category.toLowerCase() === c.toLowerCase()); if (f) return f.active; const e = existing.get(keyOf(tt, c, null)); return !!e?.isActive; };
  for (const p of plan) if (p.subcategory && p.active && !catActive(p.ticketType, p.category)) err(p.row, "Category", `Add the category "${p.category}" (${p.ticketType}) as its own row with a blank Sub-category, or keep it Active`);
  // removing a category that live sub-categories in the file still use
  for (const p of plan) if (!p.subcategory && !p.active && plan.some(q => q.active && q.subcategory && q.ticketType === p.ticketType && q.category.toLowerCase() === p.category.toLowerCase())) err(p.row, "Active", `"${p.category}" is set to No but has sub-categories set to Yes`);

  const changes: Record<string, any>[] = [];
  const teamName = (id: number | null) => (id ? teams.find(t => t.id === id)?.name ?? "" : "");
  for (const p of plan) {
    const e = existing.get(keyOf(p.ticketType, p.category, p.subcategory));
    const label = { "Ticket Type": p.ticketType, "Category": p.category, "Sub-category": p.subcategory ?? "" };
    if (!e || !e.isActive) { if (p.active) changes.push({ Change: "Added", ...label, "Assigned Group": p.team ?? (p.subcategory ? "same as category" : ""), "Days to Close": p.days ?? (p.subcategory ? "same as category" : `default (T+${DEFAULT_DAYS})`), Before: e ? "previously removed" : "" }); continue; }
    if (!p.active) { changes.push({ Change: "Removed", ...label, "Assigned Group": teamName(e.teamId), "Days to Close": e.resolutionDays ?? "", Before: "" }); continue; }
    const diffs: string[] = [];
    if ((e.teamId ?? null) !== p.teamId) diffs.push(`group ${teamName(e.teamId) || "(inherit)"} → ${p.team ?? "(inherit)"}`);
    if ((e.resolutionDays ?? null) !== p.days) diffs.push(`days ${e.resolutionDays ?? "default"} → ${p.days ?? "default"}`);
    if (e.category !== p.category || (e.subcategory ?? null) !== p.subcategory) diffs.push("spelling");
    if (diffs.length) changes.push({ Change: "Modified", ...label, "Assigned Group": p.team ?? "same as category", "Days to Close": p.days ?? "default", Before: diffs.join("; ") });
  }
  const counts = { added: changes.filter(c => c.Change === "Added").length, modified: changes.filter(c => c.Change === "Modified").length, removed: changes.filter(c => c.Change === "Removed").length };
  const result = { total: input.length, ...counts, unchanged: plan.length - changes.length, errors, changes: changes.slice(0, 500) };
  if (dryRun || errors.length || !changes.length) return res.json({ ...result, applied: false });

  const by = await who(req);
  const before = await catalogSnapshot();
  await db.transaction(async tx => {
    for (const p of plan) {
      const e = existing.get(keyOf(p.ticketType, p.category, p.subcategory));
      if (!e) { if (p.active) await tx.insert(itsmCatalogTable).values({ ticketType: p.ticketType, category: p.category, subcategory: p.subcategory, teamId: p.teamId, resolutionDays: p.days, sortOrder: p.sortOrder, updatedBy: by }); continue; }
      if (!p.active) {
        if (!e.isActive) continue;
        await tx.update(itsmCatalogTable).set({ isActive: false, updatedBy: by, updatedAt: new Date() }).where(p.subcategory ? eq(itsmCatalogTable.id, e.id)
          : and(eq(itsmCatalogTable.ticketType, p.ticketType), sql`lower(${itsmCatalogTable.category}) = lower(${p.category})`));
        continue;
      }
      await tx.update(itsmCatalogTable).set({ category: p.category, subcategory: p.subcategory, teamId: p.teamId, resolutionDays: p.days, sortOrder: p.sortOrder, isActive: true, updatedBy: by, updatedAt: new Date() }).where(eq(itsmCatalogTable.id, e.id));
    }
    // keep category spelling consistent across its sub-categories
    for (const p of plan.filter(x => !x.subcategory && x.active)) await tx.update(itsmCatalogTable).set({ category: p.category }).where(and(eq(itsmCatalogTable.ticketType, p.ticketType), sql`lower(${itsmCatalogTable.category}) = lower(${p.category})`));
  });
  const after = await catalogSnapshot();
  const fileName = s(req.body?.fileName);
  let batchNo: string | null = null;
  try {
    const batch = await createBatch({ kind: "itsm_catalog_upload", module: "ITSM", title: `ITSM category upload${fileName ? ` — ${fileName}` : ""}`, fileName, rowCount: input.length, by,
      summary: { ...counts, catalogBefore: before.length, catalogAfter: after.length },
      sections: { uploaded: input.map(({ __row, ...r }) => r), before, after, changes } });
    batchNo = batch.batchNo;
    const { buffer, name } = await batchWorkbook(batch.id);
    void notify("itsm_catalog_upload", {
      subject: `ITSM categories: ${counts.added} added, ${counts.modified} changed, ${counts.removed} removed${fileName ? ` (${fileName})` : ""}`,
      html: `<p><b>ITSM category / sub-category upload</b> was applied. New tickets use the new routing; existing tickets are unchanged.</p>${htmlTable([["Archive batch", batch.batchNo], ["File", fileName || "—"], ["By", by], ["Rows in file", input.length], ["Added", counts.added], ["Changed", counts.modified], ["Removed", counts.removed], ["Catalog rows before → after", `${before.length} → ${after.length}`]])}<p>Attached: Change Summary, New Catalog, Old Catalog, Uploaded Rows.</p>`,
      attachment: { name, content: buffer, contentType: XLSX_TYPE }, batchId: batch.id,
    });
  } catch (e) { console.error("catalog archive failed:", e); }
  await audit({ entityType: "itsm_catalog", entityId: 0, action: "import", performedBy: by, summary: `Category upload${fileName ? ` ${fileName}` : ""}: ${counts.added} added, ${counts.modified} changed, ${counts.removed} removed${batchNo ? ` — archive ${batchNo}` : ""}` });
  res.json({ ...result, applied: true, archiveBatch: batchNo });
}));

/* ─── Routing preview for the ticket form, and "my teams" ───────────────── */

router.get("/itsm-route", wrap(async (req, res) => {
  const kind = String(req.query.type || "request");
  if (!CATALOG_TYPE[kind]) return fail(res, 400, "type must be incident or request");
  try {
    const r = await route(kind, req.query.category, req.query.subcategory);
    const a = await getAccess(req);
    const mine = await teamIdsOf(a?.userId);
    const canAssign = !!a?.isAdmin || mine.includes(r.team.id);
    res.json({ ok: true, category: r.category, subcategory: r.subcategory, teamId: r.team.id, team: r.team.name, days: r.days, defaulted: r.defaulted, expectedClosureDate: r.expectedClosureDate, canAssign, members: canAssign ? await teamMembers(r.team.id) : [] });
  } catch (e: any) { if (e instanceof RoutingError) res.json({ ok: false, error: e.message }); else throw e; }
}));

router.get("/itsm-my-teams", wrap(async (req, res) => {
  const ids = await teamIdsOf((req.session as any)?.userId);
  res.json(ids.length ? await db.select({ id: itsmTeamsTable.id, name: itsmTeamsTable.name }).from(itsmTeamsTable).where(inArray(itsmTeamsTable.id, ids)) : []);
}));

router.get("/itsm-teams/:id/members", wrap(async (req, res) => { res.json(await teamMembers(Number(req.params.id))); }));

export { addBusinessDays };
export default router;
