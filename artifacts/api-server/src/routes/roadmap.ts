import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, roadmapItemsTable } from "@workspace/db";
import { getPerformedBy } from "./audit-logs";
import {
  CreateRoadmapItemBody,
  UpdateRoadmapItemBody,
  UpdateRoadmapItemParams,
  DeleteRoadmapItemParams,
  ListRoadmapItemsQueryParams,
} from "@workspace/api-zod";

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

router.post("/roadmap", async (req, res): Promise<void> => {
  const parsed = CreateRoadmapItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req.session as any).userId;
  const createdBy = await getPerformedBy(userId);
  const [item] = await db.insert(roadmapItemsTable).values({ ...parsed.data, createdBy, modifiedBy: createdBy } as any).returning();
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
  const userId = (req.session as any).userId;
  const modifiedBy = await getPerformedBy(userId);
  const [item] = await db
    .update(roadmapItemsTable)
    .set({ ...parsed.data, modifiedBy } as any)
    .where(eq(roadmapItemsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Roadmap item not found" });
    return;
  }
  res.json(item);
});

router.delete("/roadmap/:id", async (req, res): Promise<void> => {
  const params = DeleteRoadmapItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(roadmapItemsTable)
    .where(eq(roadmapItemsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Roadmap item not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
