import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, businessUnitsTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const BU_SEEDS = [
  { code: "AIF", name: "AIF", description: "Alternative Investment Fund", sortOrder: 1 },
  { code: "IE", name: "IE", description: "Insurance & Education", sortOrder: 2 },
  { code: "BROKING", name: "Broking", description: "Broking Services", sortOrder: 3 },
  { code: "MF", name: "MF", description: "Mutual Fund", sortOrder: 4 },
  { code: "IB", name: "IB", description: "Investment Banking", sortOrder: 5 },
  { code: "NBFC", name: "NBFC", description: "Non-Banking Financial Company", sortOrder: 6 },
];

export async function seedBusinessUnits() {
  for (const bu of BU_SEEDS) {
    const existing = await db.select().from(businessUnitsTable).where(eq(businessUnitsTable.code, bu.code));
    if (existing.length === 0) {
      await db.insert(businessUnitsTable).values({ ...bu, isActive: true });
    }
  }
}

// GET /business-units — public
router.get("/business-units", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(businessUnitsTable)
    .where(eq(businessUnitsTable.isActive, true))
    .orderBy(asc(businessUnitsTable.sortOrder), asc(businessUnitsTable.name));
  res.json(rows);
});

// GET /business-units/all — admin (includes inactive)
router.get("/business-units/all", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(businessUnitsTable)
    .orderBy(asc(businessUnitsTable.sortOrder), asc(businessUnitsTable.name));
  res.json(rows);
});

// POST /admin/business-units
router.post("/admin/business-units", async (req, res): Promise<void> => {
  const body = z.object({
    name: z.string().min(1),
    code: z.string().min(1).toUpperCase(),
    description: z.string().optional(),
    sortOrder: z.number().default(0),
    isActive: z.boolean().default(true),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [bu] = await db.insert(businessUnitsTable).values(body.data).returning();
  res.status(201).json(bu);
});

// PATCH /admin/business-units/:id
router.patch("/admin/business-units/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    sortOrder: z.number().optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [bu] = await db.update(businessUnitsTable).set(body.data).where(eq(businessUnitsTable.id, id)).returning();
  if (!bu) { res.status(404).json({ error: "Not found" }); return; }
  res.json(bu);
});

// DELETE /admin/business-units/:id — actually deactivates
router.delete("/admin/business-units/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(businessUnitsTable).set({ isActive: false }).where(eq(businessUnitsTable.id, id));
  res.sendStatus(204);
});

export default router;
