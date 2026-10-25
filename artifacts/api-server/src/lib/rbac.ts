import type { Request, Response, NextFunction } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, userRolesTable, rolePermissionsTable } from "@workspace/db";
import { MODULES } from "../routes/roles";

/*
 * Module-level RBAC for the IT Asset Management API.
 *  - Who: every user (password or Ashika Portal sign-in) → users.role ('admin' = everything) + IT Hub role_permissions
 *         (none/read/write/admin, most permissive wins). The Portal only authenticates.
 *  - What: every asset API path maps to a module key (= Portal page key). GET needs read, writes need write.
 *  - Reference lists used by several screens (asset list, vendors, people) are readable with read access to ANY asset module.
 */

const LEVELS = ["none", "read", "write", "admin"];
export const MODULE_KEYS = MODULES.map(m => m.key);
export const ASSET_MODULES = ["assets", "asset_registry", "asset_vendors", "asset_licenses", "asset_allocations", "asset_contracts", "asset_depreciation", "asset_audits"];

export type Access = { userId: number; isAdmin: boolean; source: "local" | "central"; perms: Record<string, string> };

export async function getAccess(req: Request): Promise<Access | null> {
  const cached = (req as any)._access as Access | undefined;
  if (cached) return cached;
  const userId = req.session.userId;
  if (!userId) return null;
  // Local IT Hub roles decide access for everyone (password users and Ashika Portal sign-ins alike)
  const [u] = await db.select({ role: usersTable.role, isActive: usersTable.isActive }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u || !u.isActive) return null;
  const perms: Record<string, string> = {};
  const links = await db.select({ roleId: userRolesTable.roleId }).from(userRolesTable).where(eq(userRolesTable.userId, userId));
  if (links.length) {
    for (const p of await db.select().from(rolePermissionsTable).where(inArray(rolePermissionsTable.roleId, links.map(l => l.roleId)))) {
      if (LEVELS.indexOf(p.accessLevel) > LEVELS.indexOf(perms[p.module] || "none")) perms[p.module] = p.accessLevel;
    }
  }
  const access: Access = { userId, isAdmin: u.role === "admin", source: (req.session as any).central ? "central" : "local", perms };
  (req as any)._access = access;
  return access;
}

export const can = (a: Access, module: string, level: "read" | "write") => a.isAdmin || LEVELS.indexOf(a.perms[module] || "none") >= LEVELS.indexOf(level);

/* Path → module. First match wins; null = any signed-in user (still subject to the route's own checks). */
const RULES: [RegExp, string | null][] = [
  [/^\/my-assets(\/|$)/, null],
  [/^\/asset-lifecycle\/model$/, null],
  [/^\/assets\/by-tag\//, null],             // QR sticker look-up
  [/^\/asset-comments\//, "asset_registry"],
  [/^\/asset-dashboard(\/|$)/, "assets"],
  [/^\/asset-(contracts|warranty)(\/|$)/, "asset_contracts"],
  [/^\/asset-depreciation(\/|$)/, "asset_depreciation"],
  [/^\/assets\/finance-update$/, null],      // Asset Registry OR Depreciation edit access — checked in the route
  [/^\/asset-finance-requests(\/|$)/, null], // maker-checker queue — checked in the route
  [/^\/asset-(licenses|license-assignments|license-compliance)(\/|$)/, "asset_licenses"],
  [/^\/asset-vendors(\/|$)/, "asset_vendors"],
  [/^\/asset-audits(\/|$)/, "asset_audits"],
  [/^\/assets\/(\d+\/(issue|return)|bulk-issue)$/, "asset_allocations"],
  [/^\/asset-(handovers|allocations|holders|people)(\/|$)/, "asset_allocations"],
  [/^\/asset-(transactions|categories)(\/|$)/, "asset_registry"],
  [/^\/maintenance-records(\/|$)/, "asset_registry"],
  [/^\/assets(\/|$)/, "asset_registry"],
];
// Shared reference data: readable by anyone with read on any asset module
const SHARED_READ = [/^\/assets$/, /^\/asset-vendors$/, /^\/asset-people$/, /^\/assets\/\d+\/coverage$/];

export function moduleFor(path: string): { matched: boolean; module: string | null } {
  for (const [re, m] of RULES) if (re.test(path)) return { matched: true, module: m };
  return { matched: false, module: null };
}

export async function assetRbac(req: Request, res: Response, next: NextFunction) {
  const { matched, module } = moduleFor(req.path);
  if (!matched) return next();
  const a = await getAccess(req);
  if (!a) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!module || a.isAdmin) return next();
  const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (can(a, module, write ? "write" : "read")) return next();
  if (!write && SHARED_READ.some(re => re.test(req.path)) && ASSET_MODULES.some(m => can(a, m, "read"))) return next();
  const label = MODULES.find(m => m.key === module)?.label || module;
  res.status(403).json({ error: write ? `You have view-only access to ${label}. Ask your administrator for edit access.` : `You do not have access to ${label}.`, module, required: write ? "write" : "read" });
}
