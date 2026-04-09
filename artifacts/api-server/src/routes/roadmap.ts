import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, roadmapItemsTable, roadmapUploadBatchesTable, auditLogsTable } from "@workspace/db";
import { getPerformedBy } from "./audit-logs";
import {
  CreateRoadmapItemBody,
  UpdateRoadmapItemBody,
  UpdateRoadmapItemParams,
  DeleteRoadmapItemParams,
  ListRoadmapItemsQueryParams,
} from "@workspace/api-zod";
import { z } from "zod/v4";

/** Extra fields not in the generated schema but present in the DB */
const ExtraRoadmapFields = z.object({
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

function parseDate(v: string | null | undefined): string | null {
  if (!v?.trim()) return null;
  const s = v.trim();
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`;
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  return null;
}

async function auditRoadmap(params: {
  action: string; entityId?: number; summary: string;
  performedBy?: string; oldValues?: unknown; newValues?: unknown;
}) {
  try {
    await db.insert(auditLogsTable).values({
      entityType: "roadmap", entityId: params.entityId,
      action: params.action, performedBy: params.performedBy || null,
      summary: params.summary,
      oldValues: params.oldValues as any,
      newValues: params.newValues as any,
    });
  } catch {}
}

const router = Router();

router.get("/roadmap", async (req, res): Promise<void> => {
  const query = ListRoadmapItemsQueryParams.safeParse(req.query);
  let items = await db.select().from(roadmapItemsTable).orderBy(roadmapItemsTable.startMonth);

  if (query.success) {
    const { phase, business, status } = query.data;
    items = items.filter(i => {
      if (phase && i.phase !== phase) return false;
      if (business && i.business !== business) return false;
      if (status && i.status !== status) return false;
      return true;
    });
  }

  res.json(items);
});

// ─── Upload History ────────────────────────────────────────────────────────────

router.get("/roadmap/upload-history", async (_req, res): Promise<void> => {
  const batches = await db.select({
    id: roadmapUploadBatchesTable.id,
    fileName: roadmapUploadBatchesTable.fileName,
    uploadedBy: roadmapUploadBatchesTable.uploadedBy,
    rowCount: roadmapUploadBatchesTable.rowCount,
    importedCount: roadmapUploadBatchesTable.importedCount,
    skippedCount: roadmapUploadBatchesTable.skippedCount,
    archivedCount: roadmapUploadBatchesTable.archivedCount,
    rowErrors: roadmapUploadBatchesTable.rowErrors,
    createdAt: roadmapUploadBatchesTable.createdAt,
  }).from(roadmapUploadBatchesTable).orderBy(desc(roadmapUploadBatchesTable.createdAt)).limit(50);
  res.json(batches);
});

// Restore a batch: re-activate those items, archive current active ones
router.post("/roadmap/upload-history/:id/restore", async (req, res): Promise<void> => {
  const batchId = parseInt(req.params.id);
  if (isNaN(batchId)) { res.status(400).json({ error: "Invalid batch id" }); return; }
  const [batch] = await db.select().from(roadmapUploadBatchesTable).where(eq(roadmapUploadBatchesTable.id, batchId));
  if (!batch) { res.status(404).json({ error: "Batch not found" }); return; }
  const userId = (req.session as any).userId;
  const performedBy = await getPerformedBy(userId);
  const now = new Date();
  // Archive currently active
  await db.update(roadmapItemsTable)
    .set({ isActive: false, archivedAt: now, archivedBy: performedBy, updatedAt: now } as any)
    .where(eq(roadmapItemsTable.isActive, true));
  // Restore this batch's items
  await db.update(roadmapItemsTable)
    .set({ isActive: true, archivedAt: null, archivedBy: null, updatedAt: now } as any)
    .where(eq((roadmapItemsTable as any).uploadBatchId, batchId));
  await auditRoadmap({ action: "restore_batch", entityId: batchId, summary: `Roadmap batch #${batchId} restored by ${performedBy}`, performedBy });
  res.json({ ok: true });
});

// Download a historic batch's CSV content
router.get("/roadmap/upload-history/:id/download", async (req, res): Promise<void> => {
  const batchId = parseInt(req.params.id);
  if (isNaN(batchId)) { res.status(400).json({ error: "Invalid batch id" }); return; }
  const [batch] = await db.select().from(roadmapUploadBatchesTable).where(eq(roadmapUploadBatchesTable.id, batchId));
  if (!batch || !batch.fileContent) { res.status(404).json({ error: "File not found" }); return; }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${batch.fileName || `batch-${batchId}.csv`}"`);
  res.send(batch.fileContent);
});

// ─── Audit Trail ───────────────────────────────────────────────────────────────

router.get("/roadmap/audit-trail", async (_req, res): Promise<void> => {
  const logs = await db.select().from(auditLogsTable)
    .where(eq(auditLogsTable.entityType, "roadmap"))
    .orderBy(desc(auditLogsTable.performedAt))
    .limit(200);
  res.json(logs);
});

// ─── CRUD ──────────────────────────────────────────────────────────────────────

router.post("/roadmap", async (req, res): Promise<void> => {
  const parsed = CreateRoadmapItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const extra = ExtraRoadmapFields.safeParse(req.body);
  const userId = (req.session as any).userId;
  const createdBy = await getPerformedBy(userId);
  const extraData = extra.success ? {
    startDate: parseDate(extra.data.startDate ?? undefined),
    endDate: parseDate(extra.data.endDate ?? undefined),
    isActive: extra.data.isActive ?? true,
  } : {};
  const [item] = await db.insert(roadmapItemsTable).values({ ...parsed.data, ...extraData, createdBy, modifiedBy: createdBy } as any).returning();
  await auditRoadmap({ action: "create", entityId: item.id, summary: `Initiative created: "${item.title}"`, performedBy: createdBy, newValues: item });
  res.status(201).json(item);
});

router.patch("/roadmap/:id", async (req, res): Promise<void> => {
  const params = UpdateRoadmapItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRoadmapItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Fetch old values for audit
  const [old] = await db.select().from(roadmapItemsTable).where(eq(roadmapItemsTable.id, params.data.id));

  const extra = ExtraRoadmapFields.safeParse(req.body);
  const userId = (req.session as any).userId;
  const modifiedBy = await getPerformedBy(userId);
  const extraData: Record<string, unknown> = {};
  if (extra.success) {
    if (extra.data.startDate !== undefined) extraData.startDate = parseDate(extra.data.startDate);
    if (extra.data.endDate !== undefined) extraData.endDate = parseDate(extra.data.endDate);
    if (extra.data.isActive !== undefined) extraData.isActive = extra.data.isActive;
  }
  const [item] = await db
    .update(roadmapItemsTable)
    .set({ ...parsed.data, ...extraData, modifiedBy } as any)
    .where(eq(roadmapItemsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Roadmap item not found" });
    return;
  }
  await auditRoadmap({ action: "update", entityId: item.id, summary: `Initiative updated: "${item.title}"`, performedBy: modifiedBy, oldValues: old, newValues: item });
  res.json(item);
});

router.delete("/roadmap/:id", async (req, res): Promise<void> => {
  const params = DeleteRoadmapItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req.session as any).userId;
  const performedBy = await getPerformedBy(userId);
  const [item] = await db
    .delete(roadmapItemsTable)
    .where(eq(roadmapItemsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Roadmap item not found" });
    return;
  }
  await auditRoadmap({ action: "delete", entityId: item.id, summary: `Initiative deleted: "${item.title}"`, performedBy, oldValues: item });
  res.sendStatus(204);
});

export default router;
