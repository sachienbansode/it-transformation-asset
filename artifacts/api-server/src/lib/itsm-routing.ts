import { db, usersTable, itsmTeamsTable, itsmTeamMembersTable, itsmCatalogTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

/*
 * ITSM routing: the category / sub-category catalog decides the assignment group (team) and the expected closure date.
 *  - Sub-category row overrides the category row's team / days; when neither sets days the default is T+2 business days.
 *  - Business days skip Saturday and Sunday.
 *  - Only members of the ticket's team (or base-role Admin) may assign it to a person; the assignee must be a member.
 */

export const DEFAULT_DAYS = 2;
export const CATALOG_TYPE: Record<string, string> = { incident: "Incident", request: "Service Request" };

export class RoutingError extends Error { status = 400; }

/** Add n business days (Mon–Fri) to a date; a ticket raised at the weekend starts counting from Monday. Returns YYYY-MM-DD (IST). */
export function addBusinessDays(from: Date, n: number): string {
  const ist = new Date(from.getTime() + 330 * 60_000); // dates are business dates in India
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  let left = Math.max(0, Math.floor(n));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--; }
  return d.toISOString().slice(0, 10);
}

export async function catalogFor(ticketType: string) {
  return db.select().from(itsmCatalogTable).where(and(eq(itsmCatalogTable.ticketType, ticketType), eq(itsmCatalogTable.isActive, true)));
}

/** Resolve category / sub-category → team, days and expected closure date. Throws RoutingError with a clear message. */
export async function route(kind: string, category: unknown, subcategory: unknown, createdAt = new Date()) {
  const ticketType = CATALOG_TYPE[kind];
  const rows = await catalogFor(ticketType);
  const cat = String(category ?? "").trim(), sub = String(subcategory ?? "").trim();
  if (!cat) throw new RoutingError("Category is required");
  const catRow = rows.find(r => !r.subcategory && r.category.toLowerCase() === cat.toLowerCase());
  if (!catRow) throw new RoutingError(`"${cat}" is not a ${ticketType} category. Choose one from the list (Admin › ITSM Setup › Categories).`);
  const subs = rows.filter(r => r.subcategory && r.category.toLowerCase() === cat.toLowerCase());
  let subRow = null as (typeof rows)[number] | null;
  if (subs.length) {
    if (!sub) throw new RoutingError(`Sub-category is required for ${catRow.category}`);
    subRow = subs.find(r => r.subcategory!.toLowerCase() === sub.toLowerCase()) || null;
    if (!subRow) throw new RoutingError(`"${sub}" is not a sub-category of ${catRow.category}`);
  } else if (sub) throw new RoutingError(`${catRow.category} has no sub-categories`);
  const teamId = subRow?.teamId ?? catRow.teamId ?? null;
  if (!teamId) throw new RoutingError(`No assignment group is mapped to ${catRow.category}${subRow ? ` › ${subRow.subcategory}` : ""} — ask the ITSM admin to map it`);
  const [team] = await db.select().from(itsmTeamsTable).where(eq(itsmTeamsTable.id, teamId));
  if (!team || !team.isActive) throw new RoutingError(`The team mapped to ${catRow.category} is inactive — ask the ITSM admin to re-map it`);
  const days = subRow?.resolutionDays ?? catRow.resolutionDays ?? DEFAULT_DAYS;
  return { category: catRow.category, subcategory: subRow?.subcategory ?? null, team, days, defaulted: (subRow?.resolutionDays ?? catRow.resolutionDays) == null, expectedClosureDate: addBusinessDays(createdAt, days) };
}

export async function teamIdsOf(userId: number | null | undefined) {
  if (!userId) return [] as number[];
  return (await db.select({ t: itsmTeamMembersTable.teamId }).from(itsmTeamMembersTable).where(eq(itsmTeamMembersTable.userId, userId))).map(r => r.t);
}
export async function isMember(userId: number | null | undefined, teamId: number | null | undefined) {
  if (!userId || !teamId) return false;
  const [r] = await db.select({ t: itsmTeamMembersTable.teamId }).from(itsmTeamMembersTable).where(and(eq(itsmTeamMembersTable.teamId, teamId), eq(itsmTeamMembersTable.userId, userId)));
  return !!r;
}
export async function teamMembers(teamId: number) {
  return db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, employeeCode: usersTable.employeeCode })
    .from(itsmTeamMembersTable).innerJoin(usersTable, eq(usersTable.id, itsmTeamMembersTable.userId))
    .where(and(eq(itsmTeamMembersTable.teamId, teamId), eq(usersTable.isActive, true))).orderBy(usersTable.name);
}
export async function teamByName(name: string | null | undefined) {
  if (!name) return null;
  const [t] = await db.select().from(itsmTeamsTable).where(and(sql`lower(${itsmTeamsTable.name}) = lower(${name})`, eq(itsmTeamsTable.isActive, true)));
  return t || null;
}
export async function teamById(id: number | null | undefined) {
  if (!id) return null;
  const [t] = await db.select().from(itsmTeamsTable).where(eq(itsmTeamsTable.id, id));
  return t || null;
}
export async function userByName(name: string) {
  const [u] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable)
    .where(and(sql`(lower(${usersTable.name}) = lower(${name}) OR lower(${usersTable.email}) = lower(${name}))`, eq(usersTable.isActive, true)));
  return u || null;
}
export async function emailsOfTeam(teamId: number) {
  const t = await teamById(teamId);
  const m = await teamMembers(teamId);
  return [...new Set([...(t?.email ? [t.email] : []), ...m.map(x => x.email).filter(Boolean) as string[]])];
}
export async function usersByIds(ids: number[]) {
  if (!ids.length) return [];
  return db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, ids));
}
