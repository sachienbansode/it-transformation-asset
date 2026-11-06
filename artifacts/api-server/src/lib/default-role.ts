import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/*
 * Default "Employee" role (settings: auth.defaultEmployeeRole). Every active INTERNAL user who has no IT Hub role gets
 * it automatically (at sign-in, when created, or when changed to internal), so all employees can use IT Hub for
 * My Assets, My Policies, My Approvals and raising tickets. External users never get it — it is removed if a user
 * becomes external, and it cannot be assigned to an external user.
 */
const rowsOf = (r: any) => (r.rows ?? r) as any[];

export async function defaultRoleId(): Promise<number | null> {
  const [s] = rowsOf(await db.execute(sql`SELECT value FROM settings WHERE key = 'auth.defaultEmployeeRole'`));
  let name: any = s?.value ?? "Employee"; if (typeof name === "string") { try { name = JSON.parse(name); } catch { /* plain */ } }
  if (name === false || name === "" || name === null) return null;            // switched off
  const [r] = rowsOf(await db.execute(sql`SELECT id FROM roles WHERE name = ${String(name)}`));
  return r?.id ?? null;
}

/** Give the default role to an internal user with no roles; remove it from external users. Returns true when the user now has a role. */
export async function ensureDefaultRole(userId: number): Promise<boolean> {
  const [u] = rowsOf(await db.execute(sql`SELECT id, role, is_active, coalesce(user_type, 'internal') AS user_type,
      (SELECT count(*)::int FROM user_roles ur WHERE ur.user_id = users.id) AS roles FROM users WHERE id = ${userId}`));
  if (!u) return false;
  const rid = await defaultRoleId();
  if (u.user_type === "external") {
    if (rid) await db.execute(sql`DELETE FROM user_roles WHERE user_id = ${userId} AND role_id = ${rid}`);
    const [n] = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM user_roles WHERE user_id = ${userId}`));
    return u.role === "admin" || n.n > 0;
  }
  if (u.roles > 0 || u.role === "admin") return true;
  if (!u.is_active || !rid) return false;
  await db.execute(sql`INSERT INTO user_roles (user_id, role_id) VALUES (${userId}, ${rid}) ON CONFLICT DO NOTHING`);
  try {
    const { logAudit } = await import("../routes/audit-logs");
    await logAudit({ entityType: "user", entityId: userId, action: "role_default", performedBy: "System", summary: `Default Employee role given (internal user without an IT Hub role)` } as any);
  } catch { /* non-fatal */ }
  return true;
}

/** Refuse the default role for external users (role assignment screens). */
export async function assertNotExternalDefault(userId: number, roleIds: number[]) {
  const rid = await defaultRoleId(); if (!rid || !roleIds.includes(rid)) return;
  const [u] = rowsOf(await db.execute(sql`SELECT name, coalesce(user_type, 'internal') AS t FROM users WHERE id = ${userId}`));
  if (u?.t === "external") throw Object.assign(new Error(`${u.name} is an external user — the Employee role is for internal employees only`), { status: 400 });
}
