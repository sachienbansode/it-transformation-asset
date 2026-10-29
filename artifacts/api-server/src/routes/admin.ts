import { clearUploadPolicyCache } from "../lib/upload-policy";
import { Router } from "express";
import { eq, and, lt, sql } from "drizzle-orm";
import { db, usersTable, settingsTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { z } from "zod";
import { requireAdmin } from "./auth";
import bcrypt from "bcryptjs";
import { forceSeedProductionDatabase } from "../seed-production";
import { logAudit, getPerformedBy } from "./audit-logs";

const router = Router();

// ─── CSV EXPORT of users and master tables (Admin) ──────────
// Fixed list of tables and columns (no SQL from the request). Secrets are never exported.
const EXPORTS: Record<string, { file: string; sql: ReturnType<typeof sql> }> = {
  users: { file: "users", sql: sql`SELECT u.id, u.employee_code, u.name, u.email, u.mobile, u.user_type, u.role, u.department, u.designation, u.is_active, u.status, u.mfa_enabled, u.identity_source, u.last_login_at, u.created_at,
    (SELECT string_agg(r.name, '; ') FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles FROM users u ORDER BY u.name` },
  masters: { file: "master_data", sql: sql`SELECT id, category, key, label, color, sort_order, is_active FROM masters ORDER BY category, sort_order, label` },
  business_units: { file: "business_units", sql: sql`SELECT * FROM business_units ORDER BY 1` },
  roles: { file: "roles", sql: sql`SELECT * FROM roles ORDER BY 1` },
  role_permissions: { file: "role_permissions", sql: sql`SELECT rp.*, r.name AS role_name FROM role_permissions rp LEFT JOIN roles r ON r.id = rp.role_id ORDER BY rp.role_id` },
  user_roles: { file: "user_roles", sql: sql`SELECT ur.*, u.email, r.name AS role_name FROM user_roles ur LEFT JOIN users u ON u.id = ur.user_id LEFT JOIN roles r ON r.id = ur.role_id ORDER BY u.email` },
  asset_categories: { file: "asset_categories", sql: sql`SELECT * FROM asset_categories ORDER BY 1` },
  kpi_categories: { file: "kpi_categories", sql: sql`SELECT * FROM kpi_categories ORDER BY 1` },
  compliance_statuses: { file: "compliance_checkpoint_statuses", sql: sql`SELECT name, stage, grp AS dashboard_bucket, color, sort_order, is_active, is_system, description FROM cmp_statuses ORDER BY sort_order` },
  compliance_companies: { file: "compliance_companies", sql: sql`SELECT * FROM cmp_companies ORDER BY 1` },
};
const SECRET = /password|secret|token|hash|azure_id|central_sub/i;
const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  let t = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // no formula injection when opened in Excel
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
router.get("/admin/export", requireAdmin, (_req, res): void => { res.json(Object.keys(EXPORTS)); });
router.get("/admin/export/:name", requireAdmin, async (req, res): Promise<void> => {
  const e = EXPORTS[String(req.params.name)];
  if (!e) { res.status(404).json({ error: "Unknown export" }); return; }
  try {
    const r: any = await db.execute(e.sql); const rows: any[] = r.rows ?? r;
    const cols = (rows[0] ? Object.keys(rows[0]) : (r.fields || []).map((f: any) => f.name)).filter((c: string) => !SECRET.test(c));
    const body = "\uFEFF" + [cols.join(","), ...rows.map(x => cols.map((c: string) => csvCell(x[c])).join(","))].join("\r\n");
    const stamp = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${e.file}_${stamp}.csv"`);
    await logAudit({ entityType: "admin_export", action: "export", performedBy: await getPerformedBy((req.session as any)?.userId).catch(() => "Admin"), summary: `${e.file}.csv exported (${rows.length} rows)` }).catch(() => {});
    res.send(body);
  } catch (err: any) { res.status(500).json({ error: err?.message || "Export failed" }); }
});

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
  clearUploadPolicyCache();
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

/** Employee codes are unique (case-insensitive) — they map people to assets. Returns the clashing user, if any. */
async function employeeCodeClash(code: string, exceptId: number | null) {
  const [u] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable)
    .where(sql`lower(${usersTable.employeeCode}) = lower(${code})${exceptId ? sql` AND ${usersTable.id} <> ${exceptId}` : sql``}`);
  return u ? `${u.name} (${u.email})` : null;
}

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
  rest.email = rest.email.trim().toLowerCase();
  rest.employeeCode = rest.employeeCode.trim();
  const clash = await employeeCodeClash(rest.employeeCode, null);
  if (clash) { res.status(400).json({ error: `Employee code ${rest.employeeCode} is already used by ${clash}` }); return; }
  const [emailClash] = await db.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.email}) = ${rest.email}`);
  if (emailClash) { res.status(400).json({ error: `A user with email ${rest.email} already exists` }); return; }
  const passwordHash = password ? await bcrypt.hash(password, 12) : null;
  const [user] = await db.insert(usersTable).values({ ...rest, passwordHash }).returning({
    id: usersTable.id, email: usersTable.email, name: usersTable.name,
    userType: usersTable.userType, role: usersTable.role, status: usersTable.status,
    mobile: usersTable.mobile,
  });
  const adminName = await getPerformedBy((req as any).user?.id);
  logAudit({ entityType: "user", entityId: user.id, action: "create", performedBy: adminName, summary: `Created user ${user.email} with role "${user.role}"`, newValues: { email: user.email, role: user.role, status: user.status } }).catch(() => {});
  res.status(201).json(user);
});

router.patch("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
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
  if (rest.email !== undefined) {
    rest.email = rest.email.trim().toLowerCase();
    const [clash] = await db.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.email}) = ${rest.email} AND ${usersTable.id} <> ${id}`);
    if (clash) { res.status(400).json({ error: `Another user already uses ${rest.email}` }); return; }
  }
  if (rest.employeeCode !== undefined) {
    rest.employeeCode = rest.employeeCode.trim();
    if (!rest.employeeCode) { res.status(400).json({ error: "Employee code cannot be blank — it links the user to their assets" }); return; }
    const clash = await employeeCodeClash(rest.employeeCode, id);
    if (clash) { res.status(400).json({ error: `Employee code ${rest.employeeCode} is already used by ${clash}` }); return; }
  }
  const update: Record<string, unknown> = { ...rest };
  // Keep isActive in sync with status
  if (rest.status === "active") {
    update.isActive = true;
    // Reset lastLoginAt so auto-dormant doesn't immediately re-trigger on next GET
    update.lastLoginAt = new Date();
  }
  if (rest.status === "inactive" || rest.status === "dormant") update.isActive = false;
  if (password) update.passwordHash = await bcrypt.hash(password, 12);
  const [oldUser] = await db.select({
    email: usersTable.email, name: usersTable.name, role: usersTable.role, status: usersTable.status,
    department: usersTable.department, designation: usersTable.designation, mobile: usersTable.mobile,
    userType: usersTable.userType, employeeCode: usersTable.employeeCode, mfaEnabled: usersTable.mfaEnabled,
  }).from(usersTable).where(eq(usersTable.id, id));
  const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, id)).returning({
    id: usersTable.id, email: usersTable.email, name: usersTable.name,
    userType: usersTable.userType, role: usersTable.role, status: usersTable.status,
    department: usersTable.department, designation: usersTable.designation,
    mobile: usersTable.mobile, mfaEnabled: usersTable.mfaEnabled, employeeCode: usersTable.employeeCode,
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const adminNameU = await getPerformedBy((req as any).user?.id);
  const updatedKeys = Object.keys(body.data).filter(k => k !== "password");
  const oldSnap: Record<string, unknown> = {};
  const newSnap: Record<string, unknown> = {};
  for (const k of updatedKeys) {
    oldSnap[k] = (oldUser as any)?.[k];
    newSnap[k] = (user as any)[k] ?? (rest as any)[k];
  }
  logAudit({ entityType: "user", entityId: user.id, action: "update", performedBy: adminNameU, summary: `Updated user ${user.email}: ${updatedKeys.filter(k => oldSnap[k] !== newSnap[k]).map(k => `${k}: "${oldSnap[k]}" → "${newSnap[k]}"`).join(", ") || updatedKeys.join(", ")}`, oldValues: oldSnap, newValues: newSnap }).catch(() => {});
  res.json(user);
});

router.delete("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [target] = await db.select({ email: usersTable.email, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
  const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const adminNameD = await getPerformedBy((req as any).user?.id);
  logAudit({ entityType: "User", entityId: id, action: "DELETE", performedBy: adminNameD, summary: `User deleted: ${target?.email ?? id} (${target?.role ?? "?"})`, oldValues: target }).catch(() => {});
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

// ─── SAFE ITSM APPROVAL MATRIX SEED (idempotent, no truncate) ───
router.post("/admin/seed-itsm-approval-matrix", requireAdmin, async (_req, res): Promise<void> => {
  const rules = [
    { ticketType: "Incident", condition: "All", approverRole: "Service Desk Manager", approverLevel: "L1", sequence: 1 },
    { ticketType: "Incident", condition: "Priority:Critical,High", approverRole: "IT Manager", approverLevel: "L2", sequence: 2 },
    { ticketType: "Incident", condition: "Severity:S1", approverRole: "CTO / IT Director", approverLevel: "L3", sequence: 3 },
    { ticketType: "Incident", condition: "Severity:S1", approverRole: "CTO", approverLevel: "L4", sequence: 4 },
    { ticketType: "Problem", condition: "All", approverRole: "Problem Manager", approverLevel: "L1", sequence: 1 },
    { ticketType: "Problem", condition: "Priority:Critical,High", approverRole: "IT Manager", approverLevel: "L2", sequence: 2 },
    { ticketType: "Change Request", condition: "All", approverRole: "Change Manager", approverLevel: "L1", sequence: 1 },
    { ticketType: "Change Request", condition: "All", approverRole: "Change Advisory Board (CAB)", approverLevel: "L2", sequence: 2 },
    { ticketType: "Change Request", condition: "Type:Emergency", approverRole: "CTO / IT Director", approverLevel: "L3", sequence: 3 },
    { ticketType: "Service Request", condition: "All", approverRole: "Team Lead / Supervisor", approverLevel: "L1", sequence: 1 },
    { ticketType: "Service Request", condition: "Priority:Critical,High", approverRole: "IT Manager", approverLevel: "L2", sequence: 2 },
  ];
  try {
    const existing = await pool.query("SELECT COUNT(*)::int AS cnt FROM itsm_approval_matrix WHERE is_active = true");
    if (existing.rows[0]?.cnt > 0) {
      res.json({ ok: true, message: `Already seeded — ${existing.rows[0].cnt} active rules exist.`, skipped: true });
      return;
    }
    for (const r of rules) {
      await pool.query(
        `INSERT INTO itsm_approval_matrix (ticket_type, condition, approver_role, approver_level, sequence, is_active)
         VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT DO NOTHING`,
        [r.ticketType, r.condition, r.approverRole, r.approverLevel, r.sequence]
      );
    }
    res.json({ ok: true, message: `Seeded ${rules.length} approval matrix rules.` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Seed failed", detail: msg });
  }
});

// ─── SAFE: Create itsm_attachments table if missing in prod ─────
router.post("/admin/migrate-itsm-attachments", requireAdmin, async (_req, res): Promise<void> => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS itsm_attachments (
        id SERIAL PRIMARY KEY,
        ticket_type TEXT NOT NULL,
        ticket_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        content_type TEXT NOT NULL,
        object_path TEXT NOT NULL,
        uploaded_by INTEGER,
        uploaded_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_itsm_attachments_ticket ON itsm_attachments(ticket_type, ticket_id)`);
    res.json({ ok: true, message: "itsm_attachments table ensured." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Migration failed", detail: msg });
  }
});

export default router;
