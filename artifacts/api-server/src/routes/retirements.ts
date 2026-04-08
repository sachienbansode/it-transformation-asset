import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, retirementsTable } from "@workspace/db";
import {
  CreateRetirementBody,
  UpdateRetirementBody,
  UpdateRetirementParams,
  DeleteRetirementParams,
} from "@workspace/api-zod";

const router = Router();

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
  const [item] = await db.insert(retirementsTable).values(parsed.data).returning();
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
  const [item] = await db
    .update(retirementsTable)
    .set(parsed.data)
    .where(eq(retirementsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Retirement plan not found" });
    return;
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
  res.sendStatus(204);
});

export default router;
