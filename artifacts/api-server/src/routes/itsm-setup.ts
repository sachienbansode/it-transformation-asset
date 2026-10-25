import { Router, type Request, type Response } from "express";
import { db, usersTable, itsmTeamsTable, itsmTeamMembersTable, itsmCatalogTable, itsmIncidentsTable, itsmServiceRequestsTable } from "@workspace/db";
import { and, eq, inArray, sql, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess } from "../lib/rbac";
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
