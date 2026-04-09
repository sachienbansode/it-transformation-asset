import { Router } from "express";
import { eq, asc, inArray, and } from "drizzle-orm";
import { db, rolesTable, rolePermissionsTable, userRolesTable, usersTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

export const MODULES = [
  { key: "dashboard", label: "Executive Dashboard" },
  { key: "checklist", label: "IT Master Checklist" },
  { key: "roadmap", label: "Transformation Roadmap" },
  { key: "retirements", label: "App Retirement Plan" },
  { key: "applications", label: "Application Inventory" },
  { key: "aibom", label: "AI Bill of Materials" },
  { key: "sbom", label: "Software BOM" },
  { key: "kpis", label: "KPI Management" },
  { key: "reports", label: "PPT Reports" },
  { key: "admin", label: "Admin Panel" },
];

const MODULE_KEYS = MODULES.map(m => m.key);

router.get("/roles", async (_req, res): Promise<void> => {
  const roles = await db.select().from(rolesTable).orderBy(asc(rolesTable.name));
  const permissions = await db.select().from(rolePermissionsTable);
  const userRoleLinks = await db.select().from(userRolesTable);
  const result = roles.map(r => ({
    ...r,
    permissions: permissions.filter(p => p.roleId === r.id),
    userCount: userRoleLinks.filter(ur => ur.roleId === r.id).length,
  }));
  res.json(result);
});

router.post("/roles", async (req, res): Promise<void> => {
  const body = z.object({
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    permissions: z.record(z.string(), z.string()).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [role] = await db.insert(rolesTable).values({
    name: body.data.name,
    description: body.data.description || null,
  }).returning();

  if (body.data.permissions) {
    const rows = Object.entries(body.data.permissions)
      .filter(([module, level]) => MODULE_KEYS.includes(module) && level !== "none")
      .map(([module, accessLevel]) => ({ roleId: role.id, module, accessLevel }));
    if (rows.length > 0) await db.insert(rolePermissionsTable).values(rows);
  }
  res.status(201).json(role);
});

router.patch("/roles/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    name: z.string().optional(),
    description: z.string().optional().nullable(),
    defaultDashboard: z.string().optional().nullable(),
    permissions: z.record(z.string(), z.string()).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  if (body.data.name !== undefined || body.data.description !== undefined || body.data.defaultDashboard !== undefined) {
    await db.update(rolesTable).set({
      name: body.data.name,
      description: body.data.description,
      defaultDashboard: body.data.defaultDashboard,
    }).where(eq(rolesTable.id, id));
  }

  if (body.data.permissions) {
    await db.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, id));
    const rows = Object.entries(body.data.permissions)
      .filter(([module, level]) => MODULE_KEYS.includes(module) && level !== "none")
      .map(([module, accessLevel]) => ({ roleId: id, module, accessLevel }));
    if (rows.length > 0) await db.insert(rolePermissionsTable).values(rows);
  }

  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
  if (!role) { res.status(404).json({ error: "Not found" }); return; }
  res.json(role);
});

router.delete("/roles/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [role] = await db.select({ isSystem: rolesTable.isSystem }).from(rolesTable).where(eq(rolesTable.id, id));
  if (!role) { res.status(404).json({ error: "Not found" }); return; }
  if (role.isSystem) { res.status(403).json({ error: "Cannot delete a system role" }); return; }
  await db.delete(rolesTable).where(eq(rolesTable.id, id));
  res.sendStatus(204);
});

// ─── ROLE PERMISSIONS (role-centric) ─────────────────────────────────────────

router.get("/roles/:id/permissions", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const perms = await db.select().from(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, id));
  res.json(perms);
});

router.put("/roles/:id/permissions", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    permissions: z.array(z.object({ module: z.string(), accessLevel: z.string() }))
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  await db.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, id));
  const rows = body.data.permissions
    .filter(p => MODULE_KEYS.includes(p.module) && p.accessLevel !== "none")
    .map(p => ({ roleId: id, module: p.module, accessLevel: p.accessLevel }));
  if (rows.length > 0) await db.insert(rolePermissionsTable).values(rows);
  res.sendStatus(204);
});

// ─── ROLE USERS (role-centric) ────────────────────────────────────────────────

router.get("/roles/:id/users", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const links = await db.select().from(userRolesTable).where(eq(userRolesTable.roleId, id));
  if (links.length === 0) { res.json([]); return; }
  const userIds = links.map(l => l.userId);
  const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(inArray(usersTable.id, userIds));
  const result = links.map(l => {
    const u = users.find(u => u.id === l.userId);
    return { id: l.id, userId: l.userId, roleId: l.roleId, userName: u?.name, userEmail: u?.email };
  });
  res.json(result);
});

router.post("/roles/:id/users", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({ userId: z.number() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const existing = await db.select().from(userRolesTable)
    .where(eq(userRolesTable.roleId, id));
  if (existing.some(r => r.userId === body.data.userId)) {
    res.status(409).json({ error: "User already has this role" }); return;
  }
  const [link] = await db.insert(userRolesTable).values({
    userId: body.data.userId, roleId: id, assignedBy: (req.session as any)?.userId,
  }).returning();
  res.status(201).json(link);
});

router.delete("/roles/:id/users/:userId", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const userId = parseInt(req.params.userId);
  if (isNaN(id) || isNaN(userId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(userRolesTable)
    .where(and(eq(userRolesTable.roleId, id), eq(userRolesTable.userId, userId)));
  res.sendStatus(204);
});

router.get("/user-roles/:userId", async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }
  const links = await db.select({ roleId: userRolesTable.roleId })
    .from(userRolesTable).where(eq(userRolesTable.userId, userId));
  res.json(links.map(l => l.roleId));
});

router.put("/user-roles/:userId", async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }
  const body = z.object({ roleIds: z.array(z.number()) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  await db.delete(userRolesTable).where(eq(userRolesTable.userId, userId));
  if (body.data.roleIds.length > 0) {
    await db.insert(userRolesTable).values(
      body.data.roleIds.map(roleId => ({
        userId,
        roleId,
        assignedBy: (req.session as any).userId,
      }))
    );
  }
  res.sendStatus(204);
});

export default router;
