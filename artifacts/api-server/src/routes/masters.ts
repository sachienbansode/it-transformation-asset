import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, mastersTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth, requireAdmin } from "./auth";

const router = Router();

// GET /masters — list all, optionally filter by category
router.get("/masters", async (req, res): Promise<void> => {
  const category = req.query.category as string | undefined;
  const items = await db
    .select()
    .from(mastersTable)
    .where(
      category
        ? and(eq(mastersTable.category, category), eq(mastersTable.isActive, true))
        : eq(mastersTable.isActive, true)
    )
    .orderBy(mastersTable.category, mastersTable.sortOrder, mastersTable.label);
  res.json(items);
});

// POST /masters (admin only)
router.post("/masters", requireAdmin, async (req, res): Promise<void> => {
  const body = z.object({
    category: z.string().min(1),
    key: z.string().min(1),
    label: z.string().min(1),
    color: z.string().optional(),
    sortOrder: z.number().optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [item] = await db.insert(mastersTable).values(body.data).returning();
  res.status(201).json(item);
});

// PATCH /masters/:id (admin only)
router.patch("/masters/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    label: z.string().optional(),
    color: z.string().optional(),
    sortOrder: z.number().optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [item] = await db.update(mastersTable).set(body.data).where(eq(mastersTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(item);
});

// DELETE /masters/:id (admin only)
router.delete("/masters/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [item] = await db.delete(mastersTable).where(eq(mastersTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

export default router;
