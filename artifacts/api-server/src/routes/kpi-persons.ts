import { Router } from "express";
import { eq, desc, asc, and, ne, inArray } from "drizzle-orm";
import {
  db, kpiPersonsTable, kpiSetsTable, kpiSetVersionsTable, kpiSetItemsTable, kpiYearsTable, auditLogsTable, usersTable,
} from "@workspace/db";
import { getPerformedBy } from "./audit-logs";

// ─── Role scope helper ────────────────────────────────────────────────────────
async function getKpiScope(req: any): Promise<{ role: string; email: string; department: string | null }> {
  const userId = (req.session as any)?.userId;
  if (!userId) return { role: "user", email: "", department: null };
  const [u] = await db.select({ role: usersTable.role, email: usersTable.email, department: usersTable.department })
    .from(usersTable).where(eq(usersTable.id, userId));
  return { role: u?.role || "user", email: u?.email || "", department: u?.department || null };
}

import { z } from "zod";

// ─── Audit helper ─────────────────────────────────────────────────────────────
async function auditKpi(entityId: number, action: string, summary: string, userId: string | undefined, extra?: object) {
  try {
    const performedBy = userId ? await getPerformedBy(parseInt(userId, 10)) : null;
    await db.insert(auditLogsTable).values({ entityType: "kpi_set", entityId, action, performedBy, summary, newValues: extra || null });
  } catch {}
}

/**
 * Compute KPI set status from all item approval statuses:
 *  - All approved → "Approved"
 *  - All rejected (none approved, none pending) → "Rejected - All"
 *  - Mix of approved+rejected, no pending → "Approved - Partial"
 *  - Any still pending → "Pending"
 */
function computeSetStatus(statuses: string[]): string {
  if (!statuses.length) return "Pending";
  const allApproved = statuses.every(s => s === "Approved");
  const anyApproved = statuses.some(s => s === "Approved");
  const anyRejected = statuses.some(s => s === "Rejected");
  const anyPending  = statuses.some(s => !["Approved", "Rejected"].includes(s));
  if (allApproved) return "Approved";
  if (!anyPending && anyRejected && !anyApproved) return "Rejected - All";
  if (!anyPending && anyRejected && anyApproved) return "Approved - Partial";
  return "Pending";
}

const router = Router();

// ─── Persons ─────────────────────────────────────────────────────────────────

router.get("/kpi-persons", async (req, res): Promise<void> => {
  const scope = await getKpiScope(req);
  const conditions: any[] = [eq(kpiPersonsTable.isActive, true)];
  if (scope.role === "cxo" && scope.department) {
    conditions.push(eq(kpiPersonsTable.department, scope.department));
  } else if (scope.role === "kpi_employee" && scope.email) {
    conditions.push(eq(kpiPersonsTable.email, scope.email));
  }
  const rows = await db.select().from(kpiPersonsTable)
    .where(and(...conditions))
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

// ─── KPI Users (user-master selection for new KPI set) ───────────────────────

router.get("/kpi-users", async (req, res): Promise<void> => {
  const scope = await getKpiScope(req);
  // Exclude system admins — they manage the system, not KPI targets
  const conditions: any[] = [eq(usersTable.isActive, true), ne(usersTable.role, "admin")];
  if (scope.role === "cxo" && scope.department) {
    conditions.push(eq(usersTable.department, scope.department));
  }
  const rows = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email,
    role: usersTable.role, department: usersTable.department,
    designation: usersTable.designation, employeeCode: usersTable.employeeCode,
  }).from(usersTable)
    .where(and(...conditions))
    .orderBy(asc(usersTable.department), asc(usersTable.name));
  res.json(rows);
});

// ─── Auto-sync kpi_person from user ───────────────────────────────────────────
async function syncKpiPersonFromUser(userId: number): Promise<number> {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!u) throw new Error("User not found");
  const roleToDesig: Record<string, string> = {
    cxo: "Chief Executive Officer", kpi_employee: "Senior Manager",
    user: "Employee", hr: "HR Manager", admin: "Administrator",
  };
  const designation = (u as any).designation || roleToDesig[u.role] || "Employee";
  const employeeCode = (u as any).employeeCode || null;
  // Find existing kpi_person by email
  const [existing] = await db.select().from(kpiPersonsTable)
    .where(eq(kpiPersonsTable.email, u.email));
  if (existing) {
    // Update to sync latest user data
    await db.update(kpiPersonsTable).set({
      name: u.name, department: u.department, designation, updatedAt: new Date(),
    }).where(eq(kpiPersonsTable.id, existing.id));
    return existing.id;
  }
  // Create new kpi_person record
  const [created] = await db.insert(kpiPersonsTable).values({
    name: u.name, email: u.email, designation, department: u.department, isActive: true,
  }).returning({ id: kpiPersonsTable.id });
  return created.id;
}

// ─── KPI Sets ─────────────────────────────────────────────────────────────────

router.get("/kpi-sets", async (req, res): Promise<void> => {
  const scope = await getKpiScope(req);
  const yearId = req.query.yearId ? parseInt(req.query.yearId as string) : undefined;
  const personId = req.query.personId ? parseInt(req.query.personId as string) : undefined;
  const status = req.query.status as string | undefined;
  const archived = req.query.archived === "true";
  const conditions: any[] = [];
  if (archived) {
    conditions.push(eq(kpiSetsTable.status, "Archived"));
  } else {
    conditions.push(ne(kpiSetsTable.status, "Archived"));
  }
  if (yearId) conditions.push(eq(kpiSetsTable.yearId, yearId));
  if (personId) conditions.push(eq(kpiSetsTable.personId, personId));
  if (status && status !== "all") conditions.push(eq(kpiSetsTable.status, status));

  // Role-based scoping via join with kpi_persons
  const personConditions: any[] = [];
  if (scope.role === "cxo" && scope.department) {
    personConditions.push(eq(kpiPersonsTable.department, scope.department));
  } else if (scope.role === "kpi_employee" && scope.email) {
    personConditions.push(eq(kpiPersonsTable.email, scope.email));
  }

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
    .innerJoin(kpiPersonsTable, and(
      eq(kpiPersonsTable.id, kpiSetsTable.personId),
      ...(personConditions.length > 0 ? personConditions : [eq(kpiPersonsTable.isActive, kpiPersonsTable.isActive)])
    ))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(kpiSetsTable.updatedAt));
  res.json(rows);
});

router.post("/kpi-sets", async (req, res): Promise<void> => {
  const scope = await getKpiScope(req);
  if (scope.role === "kpi_employee") {
    res.status(403).json({ error: "Employees cannot create KPI sets. Please contact your department head or HR." });
    return;
  }
  const body = z.object({
    userId: z.number().optional(),      // select from user master → auto-sync kpi_person
    personId: z.number().optional(),    // legacy direct personId
    yearId: z.number(),
    notes: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  let personId: number;
  if (body.data.userId) {
    try { personId = await syncKpiPersonFromUser(body.data.userId); }
    catch (e: any) { res.status(400).json({ error: e.message }); return; }
  } else if (body.data.personId) {
    personId = body.data.personId;
  } else {
    res.status(400).json({ error: "userId or personId is required" }); return;
  }

  const existing = await db.select().from(kpiSetsTable)
    .where(and(
      eq(kpiSetsTable.personId, personId),
      eq(kpiSetsTable.yearId, body.data.yearId),
      ne(kpiSetsTable.status, "Archived")
    ));
  if (existing.length > 0) { res.status(409).json({ error: "KPI set already exists for this person and year." }); return; }
  const [row] = await db.insert(kpiSetsTable).values({ personId, yearId: body.data.yearId, notes: body.data.notes }).returning();
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

  const [existingSet] = await db.select().from(kpiSetsTable).where(eq(kpiSetsTable.id, setId));
  const blockedForUpload = ["Pending", "Approved", "Approved - Partial"];
  if (existingSet && blockedForUpload.includes(existingSet.status ?? "")) {
    res.status(403).json({ error: `KPI set is ${existingSet.status} — uploads are locked. Upload is only allowed for Draft or Rejected sets.` });
    return;
  }

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
      kpiId: z.string().optional().nullable(),
      kpiType: z.string().optional().nullable(),
      owner: z.string().optional().nullable(),
      businessAlignment: z.string().optional().nullable(),
      dataSource: z.string().optional().nullable(),
      riskDependency: z.string().optional().nullable(),
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
        kpiId: toStr(item.kpiId),
        kpiType: toStr(item.kpiType),
        owner: toStr(item.owner),
        businessAlignment: toStr(item.businessAlignment),
        dataSource: toStr(item.dataSource),
        riskDependency: toStr(item.riskDependency),
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
  const newStatus = computeSetStatus(allItems.map(i => i.approvalStatus || ""));

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

  // Only update items that are still pending (not yet individually decided)
  await db.update(kpiSetItemsTable)
    .set({
      approvalStatus: body.data.decision,
      approvedBy: body.data.approvedBy,
      approvalComments: body.data.approvalComments,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(kpiSetItemsTable.setId, id), ne(kpiSetItemsTable.approvalStatus, "Approved"), ne(kpiSetItemsTable.approvalStatus, "Rejected")));

  // Recompute set status based on final item statuses
  const allAfter = await db.select({ approvalStatus: kpiSetItemsTable.approvalStatus })
    .from(kpiSetItemsTable).where(eq(kpiSetItemsTable.setId, id));
  const newStatus = computeSetStatus(allAfter.map(i => i.approvalStatus || ""));

  const [set] = await db.update(kpiSetsTable)
    .set({
      status: newStatus,
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

// ─── Final review submit (set-level, after individual KPI decisions) ─────────

router.post("/kpi-sets/:id/submit-review", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    approvedBy: z.number().optional().nullable(),
    approvalComments: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  // Compute final set status from all item decisions
  const allItems = await db.select({ approvalStatus: kpiSetItemsTable.approvalStatus })
    .from(kpiSetItemsTable).where(eq(kpiSetItemsTable.setId, id));
  const pendingItems = allItems.filter(i => !["Approved", "Rejected"].includes(i.approvalStatus || ""));
  if (pendingItems.length > 0) {
    res.status(400).json({ error: `${pendingItems.length} KPI${pendingItems.length > 1 ? "s" : ""} still pending review. All KPIs must be Approved or Rejected before final submission.` });
    return;
  }
  const finalStatus = computeSetStatus(allItems.map(i => i.approvalStatus || ""));

  const [row] = await db.update(kpiSetsTable)
    .set({ status: finalStatus, approvedBy: body.data.approvedBy, approvalComments: body.data.approvalComments, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(kpiSetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "KPI set not found" }); return; }
  auditKpi(id, "final_review_submitted", `Final review submitted for KPI set #${id}. Status: ${finalStatus}. Comments: ${body.data.approvalComments||"—"}`, (req.session as any)?.userId?.toString());
  res.json(row);
});

// ─── Submit actuals for HR/Admin review ───────────────────────────────────────

router.post("/kpi-sets/:id/actuals/submit", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(kpiSetsTable).where(eq(kpiSetsTable.id, id));
  if (!existing) { res.status(404).json({ error: "KPI set not found" }); return; }
  if (existing.status !== "Approved") { res.status(400).json({ error: "Only approved KPI sets can have actuals submitted for review" }); return; }
  const [row] = await db.update(kpiSetsTable)
    .set({ actualsStatus: "PendingReview", actualsSubmittedAt: new Date(), updatedAt: new Date() })
    .where(eq(kpiSetsTable.id, id)).returning();
  auditKpi(id, "actuals_submit", `Actuals submitted for HR/Admin review on KPI set #${id}`, (req.session as any)?.userId?.toString());
  res.json(row);
});

// ─── HR/Admin review of actuals ───────────────────────────────────────────────

router.post("/kpi-sets/:id/actuals/review", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    decision: z.enum(["Reviewed", "RevisionNeeded"]),
    comments: z.string().optional().nullable(),
    reviewedBy: z.number().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [existing] = await db.select().from(kpiSetsTable).where(eq(kpiSetsTable.id, id));
  if (!existing) { res.status(404).json({ error: "KPI set not found" }); return; }
  const newStatus = body.data.decision === "Reviewed" ? "Reviewed" : "RevisionNeeded";
  const [row] = await db.update(kpiSetsTable)
    .set({ actualsStatus: newStatus, actualsReviewedAt: new Date(), actualsReviewedBy: body.data.reviewedBy, actualsReviewComments: body.data.comments, updatedAt: new Date() })
    .where(eq(kpiSetsTable.id, id)).returning();
  auditKpi(id, "actuals_review", `Actuals ${newStatus} by reviewer on KPI set #${id}. ${body.data.comments||""}`, (req.session as any)?.userId?.toString());
  res.json(row);
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
