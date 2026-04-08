import { Router } from "express";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";
import multer from "multer";
import { db, retirementsTable, applicationsTable, retirementDocumentsTable } from "@workspace/db";
import {
  CreateRetirementBody,
  UpdateRetirementBody,
  UpdateRetirementParams,
  DeleteRetirementParams,
} from "@workspace/api-zod";
import { getPerformedBy, logAudit } from "./audit-logs";

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "retirement-docs");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${ts}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/retirements", async (_req, res): Promise<void> => {
  const items = await db.select().from(retirementsTable).orderBy(retirementsTable.appName);
  res.json(items);
});

router.post("/retirements", async (req, res): Promise<void> => {
  const parsed = CreateRetirementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req.session as any).userId;
  const createdBy = await getPerformedBy(userId);
  const [item] = await db
    .insert(retirementsTable)
    .values({ ...parsed.data, createdBy, modifiedBy: createdBy } as any)
    .returning();
  await logAudit({
    entityType: "retirement",
    entityId: item.id,
    action: "CREATE",
    performedBy: createdBy,
    summary: `Created retirement plan for ${item.appName}`,
    newValues: parsed.data,
  });
  res.status(201).json(item);
});

router.patch("/retirements/:id", async (req, res): Promise<void> => {
  const params = UpdateRetirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRetirementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(retirementsTable)
    .where(eq(retirementsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Retirement plan not found" });
    return;
  }

  const userId = (req.session as any).userId;
  const modifiedBy = await getPerformedBy(userId);

  const [item] = await db
    .update(retirementsTable)
    .set({ ...parsed.data, modifiedBy } as any)
    .where(eq(retirementsTable.id, params.data.id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Retirement plan not found" });
    return;
  }

  await logAudit({
    entityType: "retirement",
    entityId: item.id,
    action: "UPDATE",
    performedBy: modifiedBy,
    summary: `Updated retirement plan for ${item.appName}`,
    oldValues: existing,
    newValues: parsed.data,
  });

  const newStatus = (parsed.data as any).status;
  const appId = item.applicationId ?? existing.applicationId;

  if (newStatus === "Completed" && appId) {
    const retirementDate = item.targetDate ?? new Date().toISOString().slice(0, 10);
    await db
      .update(applicationsTable)
      .set({
        applicationStatus: "Retired",
        dateOfRetirement: retirementDate,
        modifiedBy,
      } as any)
      .where(eq(applicationsTable.id, appId));
  }

  res.json(item);
});

router.delete("/retirements/:id", async (req, res): Promise<void> => {
  const params = DeleteRetirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(retirementsTable)
    .where(eq(retirementsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Retirement plan not found" });
    return;
  }
  const docs = await db
    .select()
    .from(retirementDocumentsTable)
    .where(eq(retirementDocumentsTable.retirementId, params.data.id));
  for (const doc of docs) {
    try { fs.unlinkSync(doc.filePath); } catch {}
  }
  res.sendStatus(204);
});

router.get("/retirements/:id/documents", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const docs = await db
    .select()
    .from(retirementDocumentsTable)
    .where(eq(retirementDocumentsTable.retirementId, id));
  res.json(docs);
});

router.post("/retirements/:id/documents", upload.array("files", 10), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const userId = (req.session as any).userId;
  const uploadedBy = await getPerformedBy(userId);
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (files.length === 0) { res.status(400).json({ error: "No files uploaded" }); return; }

  const inserted = await Promise.all(
    files.map(f =>
      db.insert(retirementDocumentsTable).values({
        retirementId: id,
        fileName: f.originalname,
        filePath: f.path,
        fileSize: f.size,
        mimeType: f.mimetype,
        uploadedBy,
      }).returning()
    )
  );

  await logAudit({
    entityType: "retirement",
    entityId: id,
    action: "UPLOAD",
    performedBy: uploadedBy,
    summary: `Uploaded ${files.length} document(s) to retirement plan #${id}`,
  });

  res.status(201).json(inserted.map(r => r[0]));
});

router.delete("/retirements/documents/:docId", async (req, res): Promise<void> => {
  const docId = parseInt(req.params.docId);
  if (isNaN(docId)) { res.status(400).json({ error: "Invalid doc id" }); return; }
  const [doc] = await db
    .delete(retirementDocumentsTable)
    .where(eq(retirementDocumentsTable.id, docId))
    .returning();
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  try { fs.unlinkSync(doc.filePath); } catch {}
  res.sendStatus(204);
});

router.get("/retirements/documents/:docId/download", async (req, res): Promise<void> => {
  const docId = parseInt(req.params.docId);
  if (isNaN(docId)) { res.status(400).json({ error: "Invalid doc id" }); return; }
  const [doc] = await db
    .select()
    .from(retirementDocumentsTable)
    .where(eq(retirementDocumentsTable.id, docId));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (!fs.existsSync(doc.filePath)) { res.status(404).json({ error: "File not found on disk" }); return; }
  res.download(doc.filePath, doc.fileName);
});

export default router;
