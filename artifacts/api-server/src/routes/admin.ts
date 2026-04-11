import { Router } from "express";
import { eq, and, lt } from "drizzle-orm";
import { db, usersTable, settingsTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { z } from "zod";
import { requireAdmin } from "./auth";
import bcrypt from "bcryptjs";
import { forceSeedProductionDatabase } from "../seed-production";

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
      designation: usersTable.designation,
      employeeCode: usersTable.employeeCode,
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
    role: z.enum(["admin", "user", "cxo", "kpi_employee", "hr"]).default("user"),
    department: z.string().min(1),
    designation: z.string().min(1),
    employeeCode: z.string().min(1),
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
    role: z.enum(["admin", "user", "cxo", "kpi_employee", "hr"]).optional(),
    department: z.string().optional(),
    designation: z.string().optional(),
    employeeCode: z.string().optional(),
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

// ─── TEMPORARY: ONE-TIME PRODUCTION DB RESET ─────────────────
router.post("/admin/force-seed", requireAdmin, async (_req, res): Promise<void> => {
  try {
    await forceSeedProductionDatabase();
    res.json({ ok: true, message: "All tables truncated and re-seeded with full dev dataset." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Force seed failed", detail: msg });
  }
});

// Safe endpoint: inserts checklist items for businesses that have none — never wipes data
router.post("/admin/seed-missing-checklist", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const newItems = [
      // IE — Insurance & Education
      [77, 'Policy & Product Management', 'Policy Administration System', 'IE', 'Custom Portal', 'Available', 'High', 'Life & health policy lifecycle management'],
      [78, 'Policy & Product Management', 'Claims Management System', 'IE', 'Finacle Claims', 'Partial', 'High', 'Partial automation; manual adjudication'],
      [79, 'Policy & Product Management', 'Underwriting Engine', 'IE', 'Manual + Excel', 'Legacy', 'High', 'Rules-based engine needed'],
      [80, 'Policy & Product Management', 'Customer Self-Service Portal', 'IE', 'Not Available', 'Not Available', 'High', 'No digital self-service yet'],
      [81, 'Compliance & KYC', 'KYC/AML Platform', 'IE', 'KarvyKYC Pro', 'Available', 'High', 'IRDAI-compliant KYC'],
      [82, 'Compliance & KYC', 'IRDAI Regulatory Reporting', 'IE', 'Manual + Excel', 'Legacy', 'High', 'Manual filing; automation pending'],
      [83, 'Education Platform', 'Learning Management System', 'IE', 'Moodle', 'Available', 'Medium', 'LMS deployed for Ashika Academy'],
      [84, 'Education Platform', 'SEBI NISM Exam Integration', 'IE', 'Partial', 'Partial', 'Medium', 'Exam registration linked; score sync pending'],
      // MF — Mutual Fund
      [85, 'Fund Operations', 'Portfolio Management System', 'MF', 'Advent Geneva', 'Available', 'High', 'Core PMS for fund management'],
      [86, 'Fund Operations', 'NAV Calculation Engine', 'MF', 'Custom + Geneva', 'Available', 'High', 'Daily NAV calculation automated'],
      [87, 'Fund Operations', 'Investor Portal & Reporting', 'MF', 'Custom Portal', 'Partial', 'High', 'Partial features; SOA download missing'],
      [88, 'Fund Operations', 'SIP & STP Processing System', 'MF', 'Finacle', 'Available', 'High', 'SIP automation live; STP partial'],
      [89, 'Compliance & Regulatory', 'SEBI MF Compliance Module', 'MF', 'Manual + Excel', 'Legacy', 'High', 'Manual SEBI filings; automation needed'],
      [90, 'Compliance & Regulatory', 'CKYC / KYC Integration', 'MF', 'KarvyKYC Pro', 'Available', 'High', 'CKYC registry integrated'],
      [91, 'Fund Accounting', 'Fund Accounting System', 'MF', 'Advent Geneva', 'Available', 'High', 'GL and sub-ledger managed via Geneva'],
      [92, 'Fund Accounting', 'Unit Holder Register (UTR)', 'MF', 'Custom', 'Partial', 'Medium', 'Unit holder data partially digitised'],
      // IB — Investment Banking
      [93, 'Deal Management', 'Deal Pipeline & CRM', 'IB', 'Salesforce CRM', 'Partial', 'High', 'CRM active; deal stage automation pending'],
      [94, 'Deal Management', 'Financial Modelling Platform', 'IB', 'Excel + Python', 'Legacy', 'High', 'Manual models; SaaS platform needed'],
      [95, 'Deal Management', 'Virtual Data Room (VDR)', 'IB', 'Not Available', 'Not Available', 'High', 'No secure VDR; using email/SharePoint'],
      [96, 'Due Diligence', 'Due Diligence Management Platform', 'IB', 'Manual + Excel', 'Legacy', 'High', 'No structured DD workflow tool'],
      [97, 'Due Diligence', 'Company Research & Analytics', 'IB', 'Bloomberg Terminal', 'Available', 'High', 'Bloomberg active for market data & comps'],
      [98, 'Regulatory & Compliance', 'SEBI IB Regulatory Filing System', 'IB', 'Manual', 'Legacy', 'High', 'Manual filings to SEBI; portal integration needed'],
      [99, 'Regulatory & Compliance', 'Conflict of Interest Management', 'IB', 'Not Available', 'Not Available', 'Medium', 'No system; policy-only controls'],
      [100, 'Pitch & Reporting', 'Pitch Book Automation Tool', 'IB', 'Not Available', 'Not Available', 'Medium', 'PowerPoint-only; no automation'],
    ] as const;

    const inserted: number[] = [];
    const skipped: number[] = [];
    for (const [id, category, feature, business, currentTool, status, priority, notes] of newItems) {
      const existing = await pool.query('SELECT id FROM checklist_items WHERE id = $1', [id]);
      if (existing.rows.length > 0) { skipped.push(id); continue; }
      await pool.query(
        `INSERT INTO checklist_items (id, category, feature, business, current_app, status, priority, comments)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, category, feature, business, currentTool, status, priority, notes]
      );
      inserted.push(id);
    }
    res.json({ ok: true, inserted: inserted.length, skipped: skipped.length, insertedIds: inserted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Seed missing checklist failed", detail: msg });
  }
});

export default router;
