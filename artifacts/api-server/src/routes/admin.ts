import { Router } from "express";
import { eq, and, lt } from "drizzle-orm";
import { db, usersTable, settingsTable } from "@workspace/db";
import { z } from "zod";
import { requireAdmin } from "./auth";
import bcrypt from "bcryptjs";

const router = Router();

// ─── SETTINGS ────────────────────────────────────────────────

router.get("/admin/settings", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const settings: Record<string, unknown> = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

router.put("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const body = z.record(z.string(), z.unknown()).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  for (const [key, value] of Object.entries(body.data)) {
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
  }
  res.json({ ok: true });
});

// ─── USERS ────────────────────────────────────────────────────

function autoDormantDate() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

router.get("/admin/users", requireAdmin, async (_req, res): Promise<void> => {
  // Auto-mark users dormant if inactive for 30+ days
  await db
    .update(usersTable)
    .set({ status: "dormant" })
    .where(
      and(
        eq(usersTable.status, "active"),
        lt(usersTable.lastLoginAt, autoDormantDate())
      )
    );

  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      userType: usersTable.userType,
      role: usersTable.role,
      department: usersTable.department,
      mobile: usersTable.mobile,
      mfaEnabled: usersTable.mfaEnabled,
      mfaMethod: usersTable.mfaMethod,
      isActive: usersTable.isActive,
      status: usersTable.status,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  res.json(users);
});

router.post("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const body = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(8).optional(),
    userType: z.enum(["internal", "external"]).default("internal"),
    role: z.enum(["admin", "user"]).default("user"),
    department: z.string().optional(),
    mobile: z.string().optional(),
    status: z.enum(["active", "inactive", "dormant"]).default("active"),
    isActive: z.boolean().default(true),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { password, ...rest } = body.data;
  const passwordHash = password ? await bcrypt.hash(password, 12) : null;
  const [user] = await db.insert(usersTable).values({ ...rest, passwordHash }).returning({
    id: usersTable.id, email: usersTable.email, name: usersTable.name,
    userType: usersTable.userType, role: usersTable.role, status: usersTable.status,
    mobile: usersTable.mobile,
  });
  res.status(201).json(user);
});

router.patch("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    name: z.string().optional(),
    userType: z.enum(["internal", "external"]).optional(),
    role: z.enum(["admin", "user"]).optional(),
    department: z.string().optional(),
    mobile: z.string().optional(),
    status: z.enum(["active", "inactive", "dormant"]).optional(),
    isActive: z.boolean().optional(),
    mfaEnabled: z.boolean().optional(),
    password: z.string().min(8).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { password, ...rest } = body.data;
  const update: Record<string, unknown> = { ...rest };
  // Keep isActive in sync with status
  if (rest.status === "active") update.isActive = true;
  if (rest.status === "inactive" || rest.status === "dormant") update.isActive = false;
  if (password) update.passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, id)).returning({
    id: usersTable.id, email: usersTable.email, name: usersTable.name,
    userType: usersTable.userType, role: usersTable.role, status: usersTable.status,
    mobile: usersTable.mobile, mfaEnabled: usersTable.mfaEnabled,
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.delete("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.sendStatus(204);
});

export default router;
