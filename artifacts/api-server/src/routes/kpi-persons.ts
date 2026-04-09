import { Router } from "express";
import { eq, desc, asc, and, inArray } from "drizzle-orm";
import { db, kpiPersonsTable, kpiSetsTable, kpiSetVersionsTable, kpiSetItemsTable, kpiYearsTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

// ─── Persons ─────────────────────────────────────────────────────────────────
router.get("/kpi-persons", async (_req, res): Promise<void> => {
  const rows = await db.select().from(kpiPersonsTable)
    .where(eq(kpiPersonsTable.isActive, true))
    .orderBy(asc(kpiPersonsTable.name));
  res.json(rows);
});

router.post("/kpi-persons", async (req, res): Promise<void> => {
  const body = z.object({
    name: z.string().min(1),
    designation: z.string().min(1),
    department: z.string().optional(),
    email: z.string().optional(),
    employeeCode: z.string().optional(),
    approvingAuthorityId: z.number().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.insert(kpiPersonsTable).values(body.data).returning();
  res.status(201).json(row);
});

router.patch("/kpi-persons/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    name: z.string().optional(),
    designation: z.string().optional(),
    department: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    employeeCode: z.string().optional().nullable(),
    approvingAuthorityId: z.number().optional().nullable(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(kpiPersonsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(kpiPersonsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/kpi-persons/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(kpiPersonsTable).set({ isActive: false, updatedAt: new Date() }).where(eq(kpiPersonsTable.id, id));
  res.sendStatus(204);
});

// ─── KPI Sets ─────────────────────────────────────────────────────────────────
router.get("/kpi-sets", async (req, res): Promise<void> => {
  const yearId = req.query.yearId ? parseInt(req.query.yearId as string) : undefined;
  const personId = req.query.personId ? parseInt(req.query.personId as string) : undefined;
  const status = req.query.status as string | undefined;
  const conditions: any[] = [];
  if (yearId) conditions.push(eq(kpiSetsTable.yearId, yearId));
  if (personId) conditions.push(eq(kpiSetsTable.personId, personId));
  if (status) conditions.push(eq(kpiSetsTable.status, status));
  const rows = await db.select().from(kpiSetsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(kpiSetsTable.updatedAt));
  res.json(rows);
});

router.post("/kpi-sets", async (req, res): Promise<void> => {
  const body = z.object({
    personId: z.number(),
    yearId: z.number(),
    notes: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const existing = await db.select().from(kpiSetsTable)
    .where(and(eq(kpiSetsTable.personId, body.data.personId), eq(kpiSetsTable.yearId, body.data.yearId)));
  if (existing.length > 0) { res.status(409).json({ error: "KPI set already exists for this person and year." }); return; }
  const [row] = await db.insert(kpiSetsTable).values(body.data).returning();
  res.status(201).json(row);
});

router.patch("/kpi-sets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    notes: z.string().optional().nullable(),
    status: z.string().optional(),
    approvalComments: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(kpiSetsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(kpiSetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/kpi-sets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(kpiSetsTable).set({ status: "Archived", updatedAt: new Date() }).where(eq(kpiSetsTable.id, id));
  res.sendStatus(204);
});

// ─── Upload new KPI Excel version ─────────────────────────────────────────────
router.post("/kpi-sets/:id/upload", async (req, res): Promise<void> => {
  const setId = parseInt(req.params.id);
  if (isNaN(setId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = z.object({
    fileName: z.string().min(1),
    fileData: z.string().min(1),
    fileSize: z.number().optional(),
    comments: z.string().optional(),
    uploadedBy: z.number().optional(),
    items: z.array(z.object({
      sno: z.number().optional(),
      kpiName: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      weightage: z.string().optional(),
      metric: z.string().optional(),
      unit: z.string().optional(),
      annualTarget: z.string().optional(),
      q1Target: z.string().optional(),
      q2Target: z.string().optional(),
      q3Target: z.string().optional(),
      q4Target: z.string().optional(),
      q1Actual: z.string().optional(),
      q2Actual: z.string().optional(),
      q3Actual: z.string().optional(),
      q4Actual: z.string().optional(),
      remarks: z.string().optional(),
    })),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const set = await db.select().from(kpiSetsTable).where(eq(kpiSetsTable.id, setId));
  if (set.length === 0) { res.status(404).json({ error: "KPI set not found" }); return; }

  const existingVersions = await db.select().from(kpiSetVersionsTable).where(eq(kpiSetVersionsTable.setId, setId));
  const nextVersion = existingVersions.length + 1;

  await db.update(kpiSetVersionsTable).set({ isCurrent: false }).where(eq(kpiSetVersionsTable.setId, setId));

  const [newVersion] = await db.insert(kpiSetVersionsTable).values({
    setId,
    versionNumber: nextVersion,
    fileName: body.data.fileName,
    fileData: body.data.fileData,
    fileSize: body.data.fileSize,
    itemCount: body.data.items.length,
    uploadedBy: body.data.uploadedBy,
    comments: body.data.comments,
    isCurrent: true,
  }).returning();

  const toNum = (v: string | undefined) => {
    if (!v || v.trim() === "") return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n.toFixed(2);
  };

  const oldItems = await db.select({ id: kpiSetItemsTable.id })
    .from(kpiSetItemsTable).where(eq(kpiSetItemsTable.setId, setId));
  if (oldItems.length > 0) {
    await db.delete(kpiSetItemsTable).where(eq(kpiSetItemsTable.setId, setId));
  }

  if (body.data.items.length > 0) {
    await db.insert(kpiSetItemsTable).values(
      body.data.items.map((item, i) => ({
        setId,
        versionId: newVersion.id,
        sno: item.sno ?? i + 1,
        kpiName: item.kpiName,
        description: item.description || null,
        category: item.category || null,
        weightage: toNum(item.weightage),
        metric: item.metric || null,
        unit: item.unit || null,
        annualTarget: toNum(item.annualTarget),
        q1Target: toNum(item.q1Target),
        q2Target: toNum(item.q2Target),
        q3Target: toNum(item.q3Target),
        q4Target: toNum(item.q4Target),
        q1Actual: toNum(item.q1Actual),
        q2Actual: toNum(item.q2Actual),
        q3Actual: toNum(item.q3Actual),
        q4Actual: toNum(item.q4Actual),
        remarks: item.remarks || null,
      }))
    );
  }

  await db.update(kpiSetsTable)
    .set({ currentVersionId: newVersion.id, status: "Draft", updatedAt: new Date() })
    .where(eq(kpiSetsTable.id, setId));

  res.status(201).json({ version: newVersion, itemCount: body.data.items.length });
});

// ─── Version history ──────────────────────────────────────────────────────────
router.get("/kpi-sets/:id/versions", async (req, res): Promise<void> => {
  const setId = parseInt(req.params.id);
  if (isNaN(setId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db.select().from(kpiSetVersionsTable)
    .where(eq(kpiSetVersionsTable.setId, setId))
    .orderBy(desc(kpiSetVersionsTable.versionNumber));
  res.json(rows);
});

// ─── Download specific version ─────────────────────────────────────────────────
router.get("/kpi-set-versions/:id/download", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(kpiSetVersionsTable).where(eq(kpiSetVersionsTable.id, id));
  if (!row) { res.status(404).json({ error: "Version not found" }); return; }
  res.json({ fileName: row.fileName, fileData: row.fileData, versionNumber: row.versionNumber });
});

// ─── KPI Set Items ─────────────────────────────────────────────────────────────
router.get("/kpi-set-items", async (req, res): Promise<void> => {
  const setId = req.query.setId ? parseInt(req.query.setId as string) : undefined;
  const versionId = req.query.versionId ? parseInt(req.query.versionId as string) : undefined;
  if (!setId) { res.status(400).json({ error: "setId is required" }); return; }
  const conditions: any[] = [eq(kpiSetItemsTable.setId, setId)];
  if (versionId) conditions.push(eq(kpiSetItemsTable.versionId, versionId));
  const rows = await db.select().from(kpiSetItemsTable)
    .where(and(...conditions))
    .orderBy(asc(kpiSetItemsTable.sno), asc(kpiSetItemsTable.id));
  res.json(rows);
});

router.patch("/kpi-set-items/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    q1Actual: z.string().optional().nullable(),
    q2Actual: z.string().optional().nullable(),
    q3Actual: z.string().optional().nullable(),
    q4Actual: z.string().optional().nullable(),
    remarks: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(kpiSetItemsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(kpiSetItemsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ─── Submit for approval ───────────────────────────────────────────────────────
router.post("/kpi-sets/:id/submit", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.update(kpiSetsTable)
    .set({ status: "Pending", submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(kpiSetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ─── Approve or Reject ────────────────────────────────────────────────────────
router.post("/kpi-sets/:id/review", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    decision: z.enum(["Approved", "Rejected"]),
    approvedBy: z.number().optional(),
    approvalComments: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(kpiSetsTable)
    .set({
      status: body.data.decision,
      approvedBy: body.data.approvedBy,
      approvalComments: body.data.approvalComments,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(kpiSetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
