import { Router } from "express";
import { eq, desc, asc, and, ne, inArray } from "drizzle-orm";
import {
  db, kpiPersonsTable, kpiSetsTable, kpiSetVersionsTable, kpiSetItemsTable, kpiYearsTable, auditLogsTable,
} from "@workspace/db";

import { z } from "zod";

// ─── Audit helper ─────────────────────────────────────────────────────────────
async function auditKpi(entityId: number, action: string, summary: string, performedBy: string | undefined, extra?: object) {
  try { await db.insert(auditLogsTable).values({ entityType: "kpi_set", entityId, action, performedBy: performedBy || null, summary, newValues: extra || null }); } catch {}
}

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
    department: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    employeeCode: z.string().optional().nullable(),
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
  const archived = req.query.archived === "true";
  const conditions: any[] = [];
  // By default, exclude Archived; if ?archived=true only show Archived
  if (archived) {
    conditions.push(eq(kpiSetsTable.status, "Archived"));
  } else {
    conditions.push(ne(kpiSetsTable.status, "Archived"));
  }
  if (yearId) conditions.push(eq(kpiSetsTable.yearId, yearId));
  if (personId) conditions.push(eq(kpiSetsTable.personId, personId));
  if (status && status !== "all") conditions.push(eq(kpiSetsTable.status, status));

  const rows = await db
    .select({
      id: kpiSetsTable.id,
      personId: kpiSetsTable.personId,
      yearId: kpiSetsTable.yearId,
      status: kpiSetsTable.status,
      currentVersionId: kpiSetsTable.currentVersionId,
      notes: kpiSetsTable.notes,
      submittedAt: kpiSetsTable.submittedAt,
      approvedAt: kpiSetsTable.approvedAt,
      approvedBy: kpiSetsTable.approvedBy,
      approvalComments: kpiSetsTable.approvalComments,
      createdAt: kpiSetsTable.createdAt,
      updatedAt: kpiSetsTable.updatedAt,
      itemCount: kpiSetVersionsTable.itemCount,
      versionNumber: kpiSetVersionsTable.versionNumber,
    })
    .from(kpiSetsTable)
    .leftJoin(kpiSetVersionsTable, and(
      eq(kpiSetVersionsTable.setId, kpiSetsTable.id),
      eq(kpiSetVersionsTable.isCurrent, true)
    ))
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
    .where(and(
      eq(kpiSetsTable.personId, body.data.personId),
      eq(kpiSetsTable.yearId, body.data.yearId),
      ne(kpiSetsTable.status, "Archived")
    ));
  if (existing.length > 0) { res.status(409).json({ error: "KPI set already exists for this person and year." }); return; }
  const [row] = await db.insert(kpiSetsTable).values(body.data).returning();
  auditKpi(row.id, "create", `KPI set created (person #${row.personId}, year #${row.yearId})`, (req.session as any)?.userId?.toString());
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
  auditKpi(id, "archive", `KPI set #${id} archived`, (req.session as any)?.userId?.toString());
  res.sendStatus(204);
});

// ─── Upload new KPI Excel version ─────────────────────────────────────────────

const toNum = (v: string | undefined | null): string | null => {
  if (!v || String(v).trim() === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n.toFixed(2);
};
const toStr = (v: string | undefined | null): string | null => {
  if (!v || String(v).trim() === "") return null;
  return String(v).trim();
};

router.post("/kpi-sets/:id/upload", async (req, res): Promise<void> => {
  const setId = parseInt(req.params.id);
  if (isNaN(setId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = z.object({
    fileName: z.string().min(1),
    fileData: z.string().min(1),
    fileSize: z.number().optional(),
    comments: z.string().optional().nullable(),
    uploadedBy: z.number().optional().nullable(),
    items: z.array(z.object({
      sno: z.number().optional().nullable(),
      kpiName: z.string().min(1),
      description: z.string().optional().nullable(),
      category: z.string().optional().nullable(),
      weightage: z.string().optional().nullable(),
      metric: z.string().optional().nullable(),
      unit: z.string().optional().nullable(),
      annualTarget: z.string().optional().nullable(),
      q1Target: z.string().optional().nullable(),
      q2Target: z.string().optional().nullable(),
      q3Target: z.string().optional().nullable(),
      q4Target: z.string().optional().nullable(),
      q1Actual: z.string().optional().nullable(),
      q2Actual: z.string().optional().nullable(),
      q3Actual: z.string().optional().nullable(),
      q4Actual: z.string().optional().nullable(),
      remarks: z.string().optional().nullable(),
    })),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const set = await db.select().from(kpiSetsTable).where(eq(kpiSetsTable.id, setId));
  if (set.length === 0) { res.status(404).json({ error: "KPI set not found" }); return; }

  const existingVersions = await db.select({ id: kpiSetVersionsTable.id })
    .from(kpiSetVersionsTable).where(eq(kpiSetVersionsTable.setId, setId));
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

  await db.delete(kpiSetItemsTable).where(eq(kpiSetItemsTable.setId, setId));

  if (body.data.items.length > 0) {
    await db.insert(kpiSetItemsTable).values(
      body.data.items.map((item, i) => ({
        setId,
        versionId: newVersion.id,
        sno: item.sno ?? i + 1,
        kpiName: item.kpiName,
        description: toStr(item.description),
        category: toStr(item.category),
        weightage: toNum(item.weightage),
        metric: toStr(item.metric),
        unit: toStr(item.unit),
        annualTarget: toNum(item.annualTarget),
        q1Target: toNum(item.q1Target),
        q2Target: toNum(item.q2Target),
        q3Target: toNum(item.q3Target),
        q4Target: toNum(item.q4Target),
        q1Actual: toNum(item.q1Actual),
        q2Actual: toNum(item.q2Actual),
        q3Actual: toNum(item.q3Actual),
        q4Actual: toNum(item.q4Actual),
        remarks: toStr(item.remarks),
        approvalStatus: "Draft",
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
    kpiName: z.string().optional(),
    description: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    weightage: z.string().optional().nullable(),
    metric: z.string().optional().nullable(),
    unit: z.string().optional().nullable(),
    annualTarget: z.string().optional().nullable(),
    q1Target: z.string().optional().nullable(),
    q2Target: z.string().optional().nullable(),
    q3Target: z.string().optional().nullable(),
    q4Target: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(kpiSetItemsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(kpiSetItemsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ─── Individual KPI item approval ─────────────────────────────────────────────

router.patch("/kpi-set-items/:id/review", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    decision: z.enum(["Approved", "Rejected"]),
    approvedBy: z.number().optional().nullable(),
    approvalComments: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [item] = await db.update(kpiSetItemsTable)
    .set({
      approvalStatus: body.data.decision,
      approvedBy: body.data.approvedBy,
      approvalComments: body.data.approvalComments,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(kpiSetItemsTable.id, id))
    .returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  // Auto-update set status based on all item statuses
  const allItems = await db.select({ approvalStatus: kpiSetItemsTable.approvalStatus })
    .from(kpiSetItemsTable).where(eq(kpiSetItemsTable.setId, item.setId));
  const allApproved = allItems.every(i => i.approvalStatus === "Approved");
  const anyRejected = allItems.some(i => i.approvalStatus === "Rejected");
  const anyPending = allItems.some(i => !["Approved", "Rejected"].includes(i.approvalStatus || ""));

  let newStatus = "Pending";
  if (allApproved) newStatus = "Approved";
  else if (!anyPending && anyRejected) newStatus = "Rejected";

  await db.update(kpiSetsTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(kpiSetsTable.id, item.setId));

  res.json({ ...item, setStatus: newStatus });
});

// ─── Batch approve/reject all pending items in a set ──────────────────────────

router.post("/kpi-sets/:id/batch-review", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    decision: z.enum(["Approved", "Rejected"]),
    approvedBy: z.number().optional().nullable(),
    approvalComments: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  await db.update(kpiSetItemsTable)
    .set({
      approvalStatus: body.data.decision,
      approvedBy: body.data.approvedBy,
      approvalComments: body.data.approvalComments,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(kpiSetItemsTable.setId, id));

  const [set] = await db.update(kpiSetsTable)
    .set({
      status: body.data.decision,
      approvedBy: body.data.approvedBy,
      approvalComments: body.data.approvalComments,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(kpiSetsTable.id, id))
    .returning();
  if (!set) { res.status(404).json({ error: "Not found" }); return; }
  res.json(set);
});

// ─── Submit for approval ───────────────────────────────────────────────────────

router.post("/kpi-sets/:id/submit", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Set all items approval_status → Pending
  await db.update(kpiSetItemsTable)
    .set({ approvalStatus: "Pending", updatedAt: new Date() })
    .where(eq(kpiSetItemsTable.setId, id));

  const [row] = await db.update(kpiSetsTable)
    .set({ status: "Pending", submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(kpiSetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  auditKpi(id, "submit", `KPI set #${id} submitted for approval`, (req.session as any)?.userId?.toString());
  res.json(row);
});

// ─── Bulk save actuals for a set ─────────────────────────────────────────────

router.put("/kpi-sets/:id/actuals", async (req, res): Promise<void> => {
  const setId = parseInt(req.params.id);
  if (isNaN(setId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    actuals: z.array(z.object({
      itemId: z.number(),
      q1Actual: z.string().optional().nullable(),
      q2Actual: z.string().optional().nullable(),
      q3Actual: z.string().optional().nullable(),
      q4Actual: z.string().optional().nullable(),
      remarks: z.string().optional().nullable(),
    }))
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  for (const a of body.data.actuals) {
    await db.update(kpiSetItemsTable)
      .set({ q1Actual: a.q1Actual, q2Actual: a.q2Actual, q3Actual: a.q3Actual, q4Actual: a.q4Actual, remarks: a.remarks, updatedAt: new Date() })
      .where(and(eq(kpiSetItemsTable.id, a.itemId), eq(kpiSetItemsTable.setId, setId)));
  }
  auditKpi(setId, "actuals_update", `Performance actuals updated for KPI set #${setId} (${body.data.actuals.length} items)`, (req.session as any)?.userId?.toString());
  res.sendStatus(204);
});

// ─── Recall / revert to Draft ─────────────────────────────────────────────────

router.post("/kpi-sets/:id/recall", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(kpiSetItemsTable)
    .set({ approvalStatus: "Draft", approvedBy: null, approvalComments: null, approvedAt: null, updatedAt: new Date() })
    .where(eq(kpiSetItemsTable.setId, id));
  const [row] = await db.update(kpiSetsTable)
    .set({ status: "Draft", submittedAt: null, updatedAt: new Date() })
    .where(eq(kpiSetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
