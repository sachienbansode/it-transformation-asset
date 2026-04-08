import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, applicationsTable, usersTable } from "@workspace/db";
import {
  CreateApplicationBody,
  UpdateApplicationBody,
  UpdateApplicationParams,
  DeleteApplicationParams,
  ListApplicationsQueryParams,
} from "@workspace/api-zod";
import { logAudit, getPerformedBy } from "./audit-logs";

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
  const [item] = await db.insert(applicationsTable).values(parsed.data as any).returning();

  const performedBy = await getPerformedBy((req.session as any).userId);
  await logAudit({
    entityType: "application",
    entityId: item.id,
    action: "create",
    performedBy,
    summary: `Created application "${item.name}" (${item.appId})`,
    newValues: item,
  });

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

  const [existing] = await db.select().from(applicationsTable).where(eq(applicationsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  // Validate date_of_retirement > date_of_onboarding if both set
  const newRetDate = (parsed.data as any).dateOfRetirement || existing.dateOfRetirement;
  const newOnbDate = (parsed.data as any).dateOfOnboarding || existing.dateOfOnboarding;
  if (newRetDate && newOnbDate && newRetDate <= newOnbDate) {
    res.status(400).json({ error: "Date of retirement must be after date of onboarding" });
    return;
  }

  const [item] = await db
    .update(applicationsTable)
    .set(parsed.data as any)
    .where(eq(applicationsTable.id, params.data.id))
    .returning();

  const performedBy = await getPerformedBy((req.session as any).userId);
  const changedFields: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, val] of Object.entries(parsed.data)) {
    const oldVal = (existing as any)[key];
    if (oldVal !== val && val !== undefined) {
      changedFields[key] = { from: oldVal, to: val };
    }
  }
  const fieldNames = Object.keys(changedFields).join(", ");
  await logAudit({
    entityType: "application",
    entityId: item.id,
    action: "update",
    performedBy,
    summary: `Updated application "${item.name}" — changed: ${fieldNames || "no changes"}`,
    oldValues: existing,
    newValues: item,
  });

  res.json(item);
});

router.delete("/applications/:id", async (req, res): Promise<void> => {
  const params = DeleteApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(applicationsTable).where(eq(applicationsTable.id, params.data.id));

  const [item] = await db
    .delete(applicationsTable)
    .where(eq(applicationsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  const performedBy = await getPerformedBy((req.session as any).userId);
  await logAudit({
    entityType: "application",
    entityId: params.data.id,
    action: "delete",
    performedBy,
    summary: `Deleted application "${existing?.name ?? "unknown"}" (${existing?.appId ?? params.data.id})`,
    oldValues: existing,
  });

  res.sendStatus(204);
});

export default router;
