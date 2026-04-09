import { Router } from "express";
import { eq, asc, desc, and } from "drizzle-orm";
import { db, kpiYearsTable, kpiCategoriesTable, kpisTable, kpiTargetsTable, kpiActualsTable, kpiApprovalsTable, kpiSettingsTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

// ─── Seed default categories and settings (idempotent) ──────────────────────
export async function seedKpiData() {
  const cats = await db.select().from(kpiCategoriesTable);
  if (cats.length === 0) {
    await db.insert(kpiCategoriesTable).values([
      { name: "Run", description: "Keep the lights on — operations & maintenance", color: "#2563eb", sortOrder: 1 },
      { name: "Change", description: "Incremental improvements & projects", color: "#d97706", sortOrder: 2 },
      { name: "Transform", description: "Strategic & innovation initiatives", color: "#9333ea", sortOrder: 3 },
    ]);
  }
  const settings = await db.select().from(kpiSettingsTable);
  if (settings.length === 0) {
    await db.insert(kpiSettingsTable).values({ approvalEnabled: false, scoringModel: "percentage", defaultWeightageType: "equal", allowCtoOverride: true });
  }
}

// ─── Financial Years ─────────────────────────────────────────────────────────
router.get("/kpi-years", async (_req, res): Promise<void> => {
  const rows = await db.select().from(kpiYearsTable).orderBy(desc(kpiYearsTable.startDate));
  res.json(rows);
});

router.post("/kpi-years", async (req, res): Promise<void> => {
  const body = z.object({
    label: z.string().min(1),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    isActive: z.boolean().default(true),
    isCurrent: z.boolean().default(false),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (body.data.isCurrent) {
    await db.update(kpiYearsTable).set({ isCurrent: false });
  }
  const [row] = await db.insert(kpiYearsTable).values(body.data).returning();
  res.status(201).json(row);
});

router.patch("/kpi-years/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    label: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    isActive: z.boolean().optional(),
    isCurrent: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (body.data.isCurrent) {
    await db.update(kpiYearsTable).set({ isCurrent: false });
  }
  const [row] = await db.update(kpiYearsTable).set(body.data).where(eq(kpiYearsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/kpi-years/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(kpiYearsTable).set({ isActive: false }).where(eq(kpiYearsTable.id, id));
  res.sendStatus(204);
});

// ─── KPI Categories ──────────────────────────────────────────────────────────
router.get("/kpi-categories", async (_req, res): Promise<void> => {
  const rows = await db.select().from(kpiCategoriesTable).where(eq(kpiCategoriesTable.isActive, true)).orderBy(asc(kpiCategoriesTable.sortOrder));
  res.json(rows);
});

router.post("/kpi-categories", async (req, res): Promise<void> => {
  const body = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    color: z.string().optional(),
    sortOrder: z.number().default(0),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.insert(kpiCategoriesTable).values(body.data).returning();
  res.status(201).json(row);
});

router.patch("/kpi-categories/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    color: z.string().optional(),
    sortOrder: z.number().optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(kpiCategoriesTable).set(body.data).where(eq(kpiCategoriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ─── KPIs ────────────────────────────────────────────────────────────────────
router.get("/kpis", async (req, res): Promise<void> => {
  const yearId = req.query.yearId ? parseInt(req.query.yearId as string) : undefined;
  const type = req.query.type as string | undefined;

  let query = db.select().from(kpisTable).$dynamic();
  const conditions = [];
  if (yearId) conditions.push(eq(kpisTable.yearId, yearId));
  if (type) conditions.push(eq(kpisTable.type, type));
  if (conditions.length > 0) query = query.where(and(...conditions));
  const rows = await query.orderBy(asc(kpisTable.type), asc(kpisTable.name));
  res.json(rows);
});

router.post("/kpis", async (req, res): Promise<void> => {
  const body = z.object({
    yearId: z.number(),
    type: z.enum(["CTO", "Team"]),
    name: z.string().min(1),
    description: z.string().optional(),
    categoryId: z.number().optional(),
    weightage: z.string().optional(),
    metric: z.string().optional(),
    unit: z.string().optional(),
    owner: z.string().optional(),
    ownerEmail: z.string().optional(),
    businessUnit: z.string().optional(),
    approvalRequired: z.boolean().default(false),
    createdBy: z.number().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.insert(kpisTable).values({ ...body.data, status: "Draft" }).returning();
  res.status(201).json(row);
});

router.patch("/kpis/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    type: z.enum(["CTO", "Team"]).optional(),
    categoryId: z.number().optional().nullable(),
    weightage: z.string().optional().nullable(),
    metric: z.string().optional().nullable(),
    unit: z.string().optional().nullable(),
    owner: z.string().optional().nullable(),
    ownerEmail: z.string().optional().nullable(),
    businessUnit: z.string().optional().nullable(),
    status: z.string().optional(),
    approvalRequired: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(kpisTable).set({ ...body.data, updatedAt: new Date() }).where(eq(kpisTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/kpis/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(kpisTable).where(eq(kpisTable.id, id));
  res.sendStatus(204);
});

// ─── KPI Targets ─────────────────────────────────────────────────────────────
router.get("/kpi-targets", async (req, res): Promise<void> => {
  const kpiId = req.query.kpiId ? parseInt(req.query.kpiId as string) : undefined;
  const yearId = req.query.yearId ? parseInt(req.query.yearId as string) : undefined;
  const conditions = [];
  if (kpiId) conditions.push(eq(kpiTargetsTable.kpiId, kpiId));
  if (yearId) conditions.push(eq(kpiTargetsTable.yearId, yearId));
  const rows = await db.select().from(kpiTargetsTable).where(conditions.length > 0 ? and(...conditions) : undefined);
  res.json(rows);
});

router.post("/kpi-targets", async (req, res): Promise<void> => {
  const body = z.object({
    kpiId: z.number(),
    yearId: z.number(),
    annualTarget: z.string().optional().nullable(),
    q1Target: z.string().optional().nullable(),
    q2Target: z.string().optional().nullable(),
    q3Target: z.string().optional().nullable(),
    q4Target: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const existing = await db.select().from(kpiTargetsTable)
    .where(and(eq(kpiTargetsTable.kpiId, body.data.kpiId), eq(kpiTargetsTable.yearId, body.data.yearId)));
  if (existing.length > 0) {
    const [row] = await db.update(kpiTargetsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(kpiTargetsTable.id, existing[0].id)).returning();
    res.json(row);
  } else {
    const [row] = await db.insert(kpiTargetsTable).values(body.data).returning();
    res.status(201).json(row);
  }
});

router.patch("/kpi-targets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    annualTarget: z.string().optional().nullable(),
    q1Target: z.string().optional().nullable(),
    q2Target: z.string().optional().nullable(),
    q3Target: z.string().optional().nullable(),
    q4Target: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(kpiTargetsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(kpiTargetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ─── KPI Actuals ─────────────────────────────────────────────────────────────
router.get("/kpi-actuals", async (req, res): Promise<void> => {
  const kpiId = req.query.kpiId ? parseInt(req.query.kpiId as string) : undefined;
  const yearId = req.query.yearId ? parseInt(req.query.yearId as string) : undefined;
  const conditions = [];
  if (kpiId) conditions.push(eq(kpiActualsTable.kpiId, kpiId));
  if (yearId) conditions.push(eq(kpiActualsTable.yearId, yearId));
  const rows = await db.select().from(kpiActualsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(kpiActualsTable.kpiId), asc(kpiActualsTable.quarter));
  res.json(rows);
});

router.post("/kpi-actuals", async (req, res): Promise<void> => {
  const body = z.object({
    kpiId: z.number(),
    yearId: z.number(),
    quarter: z.number().min(1).max(4),
    actualValue: z.string().optional().nullable(),
    score: z.string().optional().nullable(),
    scoreOverride: z.boolean().default(false),
    comments: z.string().optional().nullable(),
    evidenceUrl: z.string().optional().nullable(),
    evidenceFileName: z.string().optional().nullable(),
    updatedBy: z.number().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const existing = await db.select().from(kpiActualsTable)
    .where(and(eq(kpiActualsTable.kpiId, body.data.kpiId), eq(kpiActualsTable.yearId, body.data.yearId), eq(kpiActualsTable.quarter, body.data.quarter)));
  if (existing.length > 0) {
    const [row] = await db.update(kpiActualsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(kpiActualsTable.id, existing[0].id)).returning();
    res.json(row);
  } else {
    const [row] = await db.insert(kpiActualsTable).values(body.data).returning();
    res.status(201).json(row);
  }
});

router.patch("/kpi-actuals/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    actualValue: z.string().optional().nullable(),
    score: z.string().optional().nullable(),
    scoreOverride: z.boolean().optional(),
    comments: z.string().optional().nullable(),
    evidenceUrl: z.string().optional().nullable(),
    evidenceFileName: z.string().optional().nullable(),
    updatedBy: z.number().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(kpiActualsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(kpiActualsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ─── KPI Approvals ───────────────────────────────────────────────────────────
router.get("/kpi-approvals", async (_req, res): Promise<void> => {
  const rows = await db.select().from(kpiApprovalsTable).orderBy(desc(kpiApprovalsTable.requestedAt));
  res.json(rows);
});

router.post("/kpi-approvals", async (req, res): Promise<void> => {
  const body = z.object({
    kpiId: z.number(),
    requestedBy: z.number().optional(),
    comments: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.insert(kpiApprovalsTable).values({ ...body.data, status: "Pending" }).returning();
  await db.update(kpisTable).set({ status: "Pending" }).where(eq(kpisTable.id, body.data.kpiId));
  res.status(201).json(row);
});

router.patch("/kpi-approvals/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    status: z.enum(["Approved", "Rejected"]),
    reviewedBy: z.number().optional(),
    comments: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(kpiApprovalsTable)
    .set({ ...body.data, reviewedAt: new Date() })
    .where(eq(kpiApprovalsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (body.data.status === "Approved") {
    await db.update(kpisTable).set({ status: "Approved" }).where(eq(kpisTable.id, row.kpiId));
  } else {
    await db.update(kpisTable).set({ status: "Draft" }).where(eq(kpisTable.id, row.kpiId));
  }
  res.json(row);
});

// ─── KPI Settings ────────────────────────────────────────────────────────────
router.get("/kpi-settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(kpiSettingsTable);
  res.json(rows[0] || { approvalEnabled: false, scoringModel: "percentage", defaultWeightageType: "equal", allowCtoOverride: true });
});

router.patch("/kpi-settings", async (req, res): Promise<void> => {
  const body = z.object({
    approvalEnabled: z.boolean().optional(),
    scoringModel: z.string().optional(),
    defaultWeightageType: z.string().optional(),
    allowCtoOverride: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const rows = await db.select().from(kpiSettingsTable);
  if (rows.length === 0) {
    const [row] = await db.insert(kpiSettingsTable).values({ ...body.data, updatedAt: new Date() } as any).returning();
    res.json(row);
  } else {
    const [row] = await db.update(kpiSettingsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(kpiSettingsTable.id, rows[0].id)).returning();
    res.json(row);
  }
});

// ─── KPI Dashboard Summary ───────────────────────────────────────────────────
router.get("/kpi-dashboard", async (req, res): Promise<void> => {
  const yearId = req.query.yearId ? parseInt(req.query.yearId as string) : undefined;
  const conditions = yearId ? [eq(kpisTable.yearId, yearId)] : [];
  const allKpis = await db.select().from(kpisTable).where(conditions.length > 0 ? and(...conditions) : undefined);
  const allActuals = yearId
    ? await db.select().from(kpiActualsTable).where(eq(kpiActualsTable.yearId, yearId))
    : await db.select().from(kpiActualsTable);

  const total = allKpis.length;
  const ctoKpis = allKpis.filter(k => k.type === "CTO").length;
  const teamKpis = allKpis.filter(k => k.type === "Team").length;
  const active = allKpis.filter(k => k.status === "Approved" || k.status === "Active").length;
  const draft = allKpis.filter(k => k.status === "Draft").length;
  const pending = allKpis.filter(k => k.status === "Pending").length;
  const withScores = allActuals.filter(a => a.score !== null);
  const avgScore = withScores.length > 0
    ? Math.round(withScores.reduce((sum, a) => sum + parseFloat(a.score || "0"), 0) / withScores.length)
    : null;

  res.json({ total, ctoKpis, teamKpis, active, draft, pending, avgScore, totalActuals: allActuals.length });
});

export default router;
