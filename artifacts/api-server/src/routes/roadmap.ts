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
  const extra = ExtraRoadmapFields.safeParse(req.body);
  const userId = (req.session as any).userId;
  const createdBy = await getPerformedBy(userId);
  const extraData = extra.success ? {
    startDate: parseDate(extra.data.startDate ?? undefined),
    endDate: parseDate(extra.data.endDate ?? undefined),
    isActive: extra.data.isActive ?? true,
  } : {};
  const [item] = await db.insert(roadmapItemsTable).values({ ...parsed.data, ...extraData, createdBy, modifiedBy: createdBy } as any).returning();
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
