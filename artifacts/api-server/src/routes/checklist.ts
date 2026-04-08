import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, checklistItemsTable } from "@workspace/db";
import {
  CreateChecklistItemBody,
  UpdateChecklistItemBody,
  UpdateChecklistItemParams,
  DeleteChecklistItemParams,
  ListChecklistItemsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/checklist", async (req, res): Promise<void> => {
  const query = ListChecklistItemsQueryParams.safeParse(req.query);
  let items = await db.select().from(checklistItemsTable).orderBy(checklistItemsTable.category, checklistItemsTable.feature);

  if (query.success) {
    const { business, category, status, priority } = query.data;
    items = items.filter(i => {
      if (business && i.business !== business) return false;
      if (category && i.category !== category) return false;
      if (status && i.status !== status) return false;
      if (priority && i.priority !== priority) return false;
      return true;
    });
  }

  res.json(items);
});

router.post("/checklist", async (req, res): Promise<void> => {
  const parsed = CreateChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.insert(checklistItemsTable).values(parsed.data).returning();
  res.status(201).json(item);
});

router.patch("/checklist/:id", async (req, res): Promise<void> => {
  const params = UpdateChecklistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db
    .update(checklistItemsTable)
    .set(parsed.data)
    .where(eq(checklistItemsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }
  res.json(item);
});

router.delete("/checklist/:id", async (req, res): Promise<void> => {
  const params = DeleteChecklistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(checklistItemsTable)
    .where(eq(checklistItemsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/checklist/stats", async (_req, res): Promise<void> => {
  const items = await db.select().from(checklistItemsTable);

  const groupBy = (key: keyof typeof items[0]) => {
    const map: Record<string, number> = {};
    for (const item of items) {
      const val = String(item[key] ?? "Unknown");
      map[val] = (map[val] ?? 0) + 1;
    }
    return Object.entries(map).map(([k, count]) => ({ key: k, count }));
  };

  res.json({
    byStatus: groupBy("status"),
    byBusiness: groupBy("business"),
    byCategory: groupBy("category"),
    byPriority: groupBy("priority"),
  });
});

export default router;
