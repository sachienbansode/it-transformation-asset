import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, retirementsTable, applicationsTable } from "@workspace/db";
import {
  CreateRetirementBody,
  UpdateRetirementBody,
  UpdateRetirementParams,
  DeleteRetirementParams,
} from "@workspace/api-zod";
import { getPerformedBy } from "./audit-logs";

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
  const userId = (req.session as any).userId;
  const createdBy = await getPerformedBy(userId);
  const [item] = await db
    .insert(retirementsTable)
    .values({ ...parsed.data, createdBy, modifiedBy: createdBy } as any)
    .returning();
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
  res.sendStatus(204);
});

export default router;
