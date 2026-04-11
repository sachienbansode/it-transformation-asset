import { Router } from "express";
import { db, assetsTable, assetCategoriesTable, assetVendorsTable, assetLicensesTable, assetAllocationsTable, assetTransactionsTable, maintenanceRecordsTable } from "@workspace/db";
import { eq, desc, sql, ilike, or, and } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit } from "./audit-logs";

const router = Router();

router.get("/assets", requireAuth, async (_req, res) => {
  const items = await db.select().from(assetsTable).where(eq(assetsTable.isActive, true)).orderBy(desc(assetsTable.createdAt));
  res.json(items);
});

router.post("/assets", requireAuth, async (req, res) => {
  const [item] = await db.insert(assetsTable).values(req.body).returning();
  await logAudit(req, "asset", item.id, "create", null, item, `Created asset: ${item.name}`);
  res.status(201).json(item);
});

router.patch("/assets/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [old] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
  if (!old) { res.status(404).json({ error: "Not found" }); return; }
  const [item] = await db.update(assetsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(assetsTable.id, id)).returning();
  if (old.status !== item.status) {
    await db.insert(assetTransactionsTable).values({ assetId: id, action: "Status Change", oldStatus: old.status, newStatus: item.status, userName: req.body.updatedBy || "System" });
  }
  await logAudit(req, "asset", id, "update", old, item, `Updated asset: ${item.name}`);
  res.json(item);
});

router.delete("/assets/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(assetsTable).set({ isActive: false }).where(eq(assetsTable.id, id));
  await logAudit(req, "asset", id, "delete", null, null, `Deleted asset #${id}`);
  res.status(204).end();
});

router.get("/assets/stats", requireAuth, async (_req, res) => {
  const total = await db.select({ count: sql<number>`count(*)::int` }).from(assetsTable).where(eq(assetsTable.isActive, true));
  const byStatus = await db.select({ status: assetsTable.status, count: sql<number>`count(*)::int` }).from(assetsTable).where(eq(assetsTable.isActive, true)).groupBy(assetsTable.status);
  const byType = await db.select({ type: assetsTable.type, count: sql<number>`count(*)::int` }).from(assetsTable).where(eq(assetsTable.isActive, true)).groupBy(assetsTable.type);
  const totalCost = await db.select({ total: sql<string>`COALESCE(sum(cost), 0)` }).from(assetsTable).where(eq(assetsTable.isActive, true));
  res.json({ total: total[0]?.count || 0, byStatus, byType, totalCost: totalCost[0]?.total || "0" });
});

router.get("/asset-categories", requireAuth, async (_req, res) => {
  const items = await db.select().from(assetCategoriesTable).where(eq(assetCategoriesTable.isActive, true)).orderBy(assetCategoriesTable.name);
  res.json(items);
});

router.post("/asset-categories", requireAuth, async (req, res) => {
  const [item] = await db.insert(assetCategoriesTable).values(req.body).returning();
  res.status(201).json(item);
});

router.patch("/asset-categories/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [item] = await db.update(assetCategoriesTable).set(req.body).where(eq(assetCategoriesTable.id, id)).returning();
  res.json(item);
});

router.delete("/asset-categories/:id", requireAuth, async (req, res) => {
  await db.update(assetCategoriesTable).set({ isActive: false }).where(eq(assetCategoriesTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

router.get("/asset-vendors", requireAuth, async (_req, res) => {
  const items = await db.select().from(assetVendorsTable).where(eq(assetVendorsTable.isActive, true)).orderBy(assetVendorsTable.name);
  res.json(items);
});

router.post("/asset-vendors", requireAuth, async (req, res) => {
  const [item] = await db.insert(assetVendorsTable).values(req.body).returning();
  await logAudit(req, "asset_vendor", item.id, "create", null, item, `Created vendor: ${item.name}`);
  res.status(201).json(item);
});

router.patch("/asset-vendors/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [item] = await db.update(assetVendorsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(assetVendorsTable.id, id)).returning();
  res.json(item);
});

router.delete("/asset-vendors/:id", requireAuth, async (req, res) => {
  await db.update(assetVendorsTable).set({ isActive: false }).where(eq(assetVendorsTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

router.get("/asset-licenses", requireAuth, async (_req, res) => {
  const items = await db.select().from(assetLicensesTable).where(eq(assetLicensesTable.isActive, true)).orderBy(desc(assetLicensesTable.createdAt));
  res.json(items);
});

router.post("/asset-licenses", requireAuth, async (req, res) => {
  const [item] = await db.insert(assetLicensesTable).values(req.body).returning();
  await logAudit(req, "asset_license", item.id, "create", null, item, `Created license: ${item.productName}`);
  res.status(201).json(item);
});

router.patch("/asset-licenses/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [item] = await db.update(assetLicensesTable).set({ ...req.body, updatedAt: new Date() }).where(eq(assetLicensesTable.id, id)).returning();
  res.json(item);
});

router.delete("/asset-licenses/:id", requireAuth, async (req, res) => {
  await db.update(assetLicensesTable).set({ isActive: false }).where(eq(assetLicensesTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

router.get("/asset-allocations", requireAuth, async (_req, res) => {
  const items = await db.select().from(assetAllocationsTable).orderBy(desc(assetAllocationsTable.createdAt));
  res.json(items);
});

router.post("/asset-allocations", requireAuth, async (req, res) => {
  const [item] = await db.insert(assetAllocationsTable).values(req.body).returning();
  if (req.body.assetId) {
    await db.update(assetsTable).set({ status: "Allocated", ownerName: req.body.userName }).where(eq(assetsTable.id, req.body.assetId));
    await db.insert(assetTransactionsTable).values({ assetId: req.body.assetId, action: "Allocation", oldStatus: "In Stock", newStatus: "Allocated", userName: req.body.createdBy || "System" });
  }
  res.status(201).json(item);
});

router.get("/asset-transactions", requireAuth, async (req, res) => {
  const assetId = req.query.assetId ? parseInt(req.query.assetId as string) : null;
  const q = assetId
    ? db.select().from(assetTransactionsTable).where(eq(assetTransactionsTable.assetId, assetId)).orderBy(desc(assetTransactionsTable.createdAt))
    : db.select().from(assetTransactionsTable).orderBy(desc(assetTransactionsTable.createdAt)).limit(100);
  const items = await q;
  res.json(items);
});

router.get("/maintenance-records", requireAuth, async (_req, res) => {
  const items = await db.select().from(maintenanceRecordsTable).orderBy(desc(maintenanceRecordsTable.createdAt));
  res.json(items);
});

router.post("/maintenance-records", requireAuth, async (req, res) => {
  const [item] = await db.insert(maintenanceRecordsTable).values(req.body).returning();
  res.status(201).json(item);
});

router.patch("/maintenance-records/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [item] = await db.update(maintenanceRecordsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(maintenanceRecordsTable.id, id)).returning();
  res.json(item);
});

export default router;
