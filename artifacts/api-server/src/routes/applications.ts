import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, applicationsTable } from "@workspace/db";
import {
  CreateApplicationBody,
  UpdateApplicationBody,
  UpdateApplicationParams,
  DeleteApplicationParams,
  ListApplicationsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/applications", async (req, res): Promise<void> => {
  const query = ListApplicationsQueryParams.safeParse(req.query);
  let items = await db.select().from(applicationsTable).orderBy(applicationsTable.name);

  if (query.success) {
    const { business, category, criticality, hosting } = query.data;
    items = items.filter(i => {
      if (business && i.business !== business) return false;
      if (category && i.category !== category) return false;
      if (criticality && i.criticality !== criticality) return false;
      if (hosting && i.hosting !== hosting) return false;
      return true;
    });
  }

  res.json(items);
});

router.post("/applications", async (req, res): Promise<void> => {
  const parsed = CreateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.insert(applicationsTable).values(parsed.data).returning();
  res.status(201).json(item);
});

router.patch("/applications/:id", async (req, res): Promise<void> => {
  const params = UpdateApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db
    .update(applicationsTable)
    .set(parsed.data)
    .where(eq(applicationsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.json(item);
});

router.delete("/applications/:id", async (req, res): Promise<void> => {
  const params = DeleteApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(applicationsTable)
    .where(eq(applicationsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
