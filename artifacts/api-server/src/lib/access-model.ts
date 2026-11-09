import type { Request } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getAccess, can, type Access } from "./rbac";

/*
 * Who is who (IT Hub roles):
 *  Super Admin  — base role "admin": everything, including read access to every chat (each view is audited).
 *  ITSM Admin   — ITSM Setup at "admin" level: whole ITSM module, re-open closed tickets, all support chats.
 *  ITSM Agent   — Problems write, or member of an ITSM team: works tickets, starts / sees support chats.
 *  Asset staff  — Asset Registry write (IT Asset Admin / Manager): device health, starts / sees support chats.
 *  Employee     — everyone else: own assets, own device, own tickets, own chats (direct + support about them).
 * Raising tickets (Incidents / Service Requests write) does NOT make someone IT staff.
 */
export const isSuperAdmin = (a: Access | null) => !!a?.isAdmin;
export const isItsmAdmin = (a: Access | null) => !!a && (a.isAdmin || a.perms.itsm_setup === "admin");
async function inTeam(userId: number) {
  const r: any = await db.execute(sql`SELECT 1 FROM itsm_team_members WHERE user_id = ${userId} LIMIT 1`);
  return ((r.rows ?? r) as any[]).length > 0;
}
export async function isItsmStaff(a: Access | null) { return !!a && (isItsmAdmin(a) || can(a, "itsm_problems", "write") || await inTeam(a.userId)); }
export const isAssetStaff = (a: Access | null) => !!a && (a.isAdmin || can(a, "asset_registry", "write"));
export async function isSupportStaff(a: Access | null) { return isAssetStaff(a) || await isItsmStaff(a); }
export async function accessOf(req: Request) {
  const a = await getAccess(req);
  return { a, superAdmin: isSuperAdmin(a), itsmAdmin: isItsmAdmin(a), itsmStaff: await isItsmStaff(a), assetStaff: isAssetStaff(a), support: await isSupportStaff(a) };
}
