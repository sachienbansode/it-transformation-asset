import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, sbomEntriesTable } from "@workspace/db";
import {
  CreateSbomEntryBody,
  UpdateSbomEntryBody,
  UpdateSbomEntryParams,
  DeleteSbomEntryParams,
} from "@workspace/api-zod";
import { getPerformedBy } from "./audit-logs";

const router = Router();

router.get("/sbom", async (_req, res): Promise<void> => {
  const items = await db.select().from(sbomEntriesTable).orderBy(sbomEntriesTable.name);
  res.json(items);
});

router.post("/sbom", async (req, res): Promise<void> => {
  const parsed = CreateSbomEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req.session as any).userId;
  const createdBy = await getPerformedBy(userId);
  const [item] = await db.insert(sbomEntriesTable).values({ ...parsed.data, createdBy, modifiedBy: createdBy } as any).returning();
  res.status(201).json(item);
});

router.patch("/sbom/:id", async (req, res): Promise<void> => {
  const params = UpdateSbomEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSbomEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req.session as any).userId;
  const modifiedBy = await getPerformedBy(userId);
  const [item] = await db
    .update(sbomEntriesTable)
    .set({ ...parsed.data, modifiedBy } as any)
    .where(eq(sbomEntriesTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "SBOM entry not found" });
    return;
  }
  res.json(item);
});

router.delete("/sbom/:id", async (req, res): Promise<void> => {
  const params = DeleteSbomEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(sbomEntriesTable)
    .where(eq(sbomEntriesTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "SBOM entry not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
