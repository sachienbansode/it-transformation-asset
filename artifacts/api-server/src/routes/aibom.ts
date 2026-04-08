import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, aibomEntriesTable } from "@workspace/db";
import {
  CreateAibomEntryBody,
  UpdateAibomEntryBody,
  UpdateAibomEntryParams,
  DeleteAibomEntryParams,
} from "@workspace/api-zod";
import { getPerformedBy } from "./audit-logs";

const router = Router();

router.get("/aibom", async (_req, res): Promise<void> => {
  const items = await db.select().from(aibomEntriesTable).orderBy(aibomEntriesTable.name);
  res.json(items);
});

router.post("/aibom", async (req, res): Promise<void> => {
  const parsed = CreateAibomEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req.session as any).userId;
  const createdBy = await getPerformedBy(userId);
  const [item] = await db.insert(aibomEntriesTable).values({ ...parsed.data, createdBy, modifiedBy: createdBy } as any).returning();
  res.status(201).json(item);
});

router.patch("/aibom/:id", async (req, res): Promise<void> => {
  const params = UpdateAibomEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAibomEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req.session as any).userId;
  const modifiedBy = await getPerformedBy(userId);
  const [item] = await db
    .update(aibomEntriesTable)
    .set({ ...parsed.data, modifiedBy } as any)
    .where(eq(aibomEntriesTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "AIBOM entry not found" });
    return;
  }
  res.json(item);
});

router.delete("/aibom/:id", async (req, res): Promise<void> => {
  const params = DeleteAibomEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(aibomEntriesTable)
    .where(eq(aibomEntriesTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "AIBOM entry not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
