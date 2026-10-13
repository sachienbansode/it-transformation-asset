import { Router, Request, Response } from "express";
import { db, assetsTable, assetCategoriesTable, assetVendorsTable, assetLicensesTable, assetAllocationsTable, assetTransactionsTable, maintenanceRecordsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";
import { logAudit, getPerformedBy, buildContext } from "./audit-logs";

const router = Router();

function handleError(res: Response, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  res.status(500).json({ error: msg });
}

async function safeLog(params: Parameters<typeof logAudit>[0]) {
  try { await logAudit(params); } catch { /* audit failure is non-fatal */ }
}

/* ─── ASSETS ──────────────────────────────────────────────────────────────── */

router.get("/assets", requireAuth, async (_req, res) => {
  try {
    const items = await db.select().from(assetsTable).where(eq(assetsTable.isActive, true)).orderBy(desc(assetsTable.createdAt));
    res.json(items);
  } catch (e) { handleError(res, e); }
});

const TYPE_PREFIX: Record<string, string> = {
  "Laptop": "LAP", "Desktop": "DSK", "Server": "SRV", "Network Switch": "NSW",
  "Firewall": "FWL", "Access Point": "WAP", "Printer": "PRN", "Tablet": "TAB",
  "Mobile": "MOB", "Storage": "STR", "UPS": "UPS", "Others": "AST",
};

router.get("/assets/next-tag", requireAuth, async (req, res) => {
  try {
    const type = (req.query.type as string) || "Others";
    const prefix = TYPE_PREFIX[type] || "AST";
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(assetsTable).where(sql`type = ${type}`);
    const next = (count || 0) + 1;
    res.json({ tag: `${prefix}-${String(next).padStart(4, "0")}`, prefix, count: count || 0 });
  } catch (e) { handleError(res, e); }
});

router.post("/assets", requireAuth, async (req, res) => {
  try {
    const { type, serialNumber } = req.body;
    if (serialNumber && type) {
      const existing = await db.select({ id: assetsTable.id }).from(assetsTable)
        .where(sql`type = ${type} AND serial_number = ${serialNumber} AND is_active = true`);
      if (existing.length > 0) {
        res.status(400).json({ error: `Serial number "${serialNumber}" already exists for asset type "${type}"` });
        return;
      }
    }
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const ctx = buildContext(req, "Asset Registry");
    const [item] = await db.insert(assetsTable).values({ ...req.body, createdBy: performedBy, updatedBy: performedBy }).returning();
    await safeLog({ entityType: "asset", entityId: item.id, action: "create", performedBy, summary: `Created asset: ${item.name} (${item.assetTag})`, newValues: item, context: ctx });
    res.status(201).json(item);
  } catch (e) { handleError(res, e); }
});

router.patch("/assets/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [old] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
    if (!old) { res.status(404).json({ error: "Asset not found" }); return; }
    const { type, serialNumber } = req.body;
    if (serialNumber && type) {
      const existing = await db.select({ id: assetsTable.id }).from(assetsTable)
        .where(sql`type = ${type} AND serial_number = ${serialNumber} AND is_active = true AND id != ${id}`);
      if (existing.length > 0) {
        res.status(400).json({ error: `Serial number "${serialNumber}" already exists for asset type "${type}"` });
        return;
      }
    }
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const ctx = buildContext(req, "Asset Registry");
    const [item] = await db.update(assetsTable).set({ ...req.body, updatedBy: performedBy, updatedAt: new Date() }).where(eq(assetsTable.id, id)).returning();
    if (old.status !== item.status) {
      await db.insert(assetTransactionsTable).values({ assetId: id, action: "Status Change", oldStatus: old.status, newStatus: item.status, userName: performedBy });
    }
    await safeLog({ entityType: "asset", entityId: id, action: "update", performedBy, summary: `Updated asset: ${item.name} (${item.assetTag})`, newValues: item, context: ctx });
    res.json(item);
  } catch (e) { handleError(res, e); }
});

router.delete("/assets/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [old] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    await db.update(assetsTable).set({ isActive: false }).where(eq(assetsTable.id, id));
    await safeLog({ entityType: "asset", entityId: id, action: "delete", performedBy, summary: `Deleted asset: ${old?.name || id} (${old?.assetTag || ""})`, context: buildContext(req, "Asset Registry") });
    res.status(204).end();
  } catch (e) { handleError(res, e); }
});

router.get("/assets/stats", requireAuth, async (_req, res) => {
  try {
    const total = await db.select({ count: sql<number>`count(*)::int` }).from(assetsTable).where(eq(assetsTable.isActive, true));
    const byStatus = await db.select({ status: assetsTable.status, count: sql<number>`count(*)::int` }).from(assetsTable).where(eq(assetsTable.isActive, true)).groupBy(assetsTable.status);
    const byType = await db.select({ type: assetsTable.type, count: sql<number>`count(*)::int` }).from(assetsTable).where(eq(assetsTable.isActive, true)).groupBy(assetsTable.type);
    const totalCost = await db.select({ total: sql<string>`COALESCE(sum(cost), 0)` }).from(assetsTable).where(eq(assetsTable.isActive, true));
    res.json({ total: total[0]?.count || 0, byStatus, byType, totalCost: totalCost[0]?.total || "0" });
  } catch (e) { handleError(res, e); }
});

/* ─── ASSET REGISTER IMPORT (Excel/CSV upload, validated, all-or-nothing) ─── */

const IMPORT_TYPES = Object.keys(TYPE_PREFIX);
const IMPORT_STATUSES = ["In Stock", "Allocated", "In Use", "Under Maintenance", "Retired", "Disposed"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IMPORT_FIELDS = ["assetTag", "name", "type", "serialNumber", "status", "ownerName", "department", "location",
  "purchaseDate", "purchaseOrderNo", "cost", "vendorName", "warrantyExpiry", "ipAddress", "macAddress",
  "osVersion", "configuration", "notes"] as const;

type ImportError = { row: number; field: string; message: string };

router.post("/assets/import", requireAuth, async (req, res) => {
  try {
    const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const dryRun = req.body?.dryRun !== false;
    if (rows.length === 0) { res.status(400).json({ error: "The file has no asset rows." }); return; }
    if (rows.length > 5000) { res.status(400).json({ error: "Maximum 5,000 rows per upload." }); return; }

    const errors: ImportError[] = [];
    const existing = await db.select({ assetTag: assetsTable.assetTag, type: assetsTable.type, serialNumber: assetsTable.serialNumber, isActive: assetsTable.isActive }).from(assetsTable);
    const usedTags = new Set(existing.map(a => a.assetTag.toLowerCase()));
    const usedSerials = new Set(existing.filter(a => a.isActive && a.serialNumber).map(a => `${a.type}|${a.serialNumber!.toLowerCase()}`));
    const typeCounts: Record<string, number> = {};
    for (const a of existing) typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;

    const clean: any[] = [];
    rows.forEach((raw, i) => {
      const rowNo = Number(raw?.__row) || i + 2; // Excel row number (header is row 1)
      const r: any = {};
      for (const f of IMPORT_FIELDS) {
        const v = raw?.[f];
        r[f] = v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim();
      }
      const err = (field: string, message: string) => errors.push({ row: rowNo, field, message });

      if (r.assetTag && /^sample-/i.test(r.assetTag)) { err("Asset Tag", "Sample row from the template — delete it before uploading"); return; }
      if (!r.name) err("Asset Name", "Required");
      if (!r.type) err("Asset Type", "Required");
      else {
        const t = IMPORT_TYPES.find(x => x.toLowerCase() === r.type.toLowerCase());
        if (!t) err("Asset Type", `"${r.type}" is not valid. Use one of: ${IMPORT_TYPES.join(", ")}`); else r.type = t;
      }
      if (!r.serialNumber) err("Serial Number", "Required");
      if (r.status) {
        const s = IMPORT_STATUSES.find(x => x.toLowerCase() === r.status.toLowerCase());
        if (!s) err("Status", `"${r.status}" is not valid. Use one of: ${IMPORT_STATUSES.join(", ")}`); else r.status = s;
      } else r.status = "In Stock";
      if (!r.vendorName) err("Vendor", "Required");
      for (const [f, label] of [["purchaseDate", "Purchase Date"], ["warrantyExpiry", "Warranty Expiry"]] as const) {
        if (r[f] && !DATE_RE.test(r[f])) err(label, `"${r[f]}" must be a date in YYYY-MM-DD format`);
      }
      if (r.cost) {
        const n = Number(String(r.cost).replace(/[,₹\s]/g, ""));
        if (!Number.isFinite(n) || n < 0) err("Cost", `"${r.cost}" is not a valid amount`); else r.cost = n.toFixed(2);
      }
      if (r.assetTag) {
        if (usedTags.has(r.assetTag.toLowerCase())) err("Asset Tag", `"${r.assetTag}" already exists`);
        else usedTags.add(r.assetTag.toLowerCase());
      }
      if (r.type && r.serialNumber) {
        const k = `${r.type}|${r.serialNumber.toLowerCase()}`;
        if (usedSerials.has(k)) err("Serial Number", `"${r.serialNumber}" already exists for type ${r.type}`);
        else usedSerials.add(k);
      }
      clean.push(r);
    });

    // Auto-generate missing asset tags per type (e.g. LAP-0001), skipping tags already in use
    for (const r of clean) {
      if (r.assetTag || !r.type) continue;
      const prefix = TYPE_PREFIX[r.type] || "AST";
      let n = typeCounts[r.type] || 0, tag = "";
      do { n += 1; tag = `${prefix}-${String(n).padStart(4, "0")}`; } while (usedTags.has(tag.toLowerCase()));
      typeCounts[r.type] = n; usedTags.add(tag.toLowerCase()); r.assetTag = tag; r.tagGenerated = true;
    }

    const summary = { total: rows.length, valid: rows.length - new Set(errors.map(e => e.row)).size, errors, generatedTags: clean.filter(r => r.tagGenerated).length };
    if (dryRun || errors.length) { res.json({ ...summary, inserted: 0, dryRun: true, preview: clean.slice(0, 5) }); return; }

    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const inserted = await db.transaction(async (tx) => {
      const vendors = await tx.select({ id: assetVendorsTable.id, name: assetVendorsTable.name }).from(assetVendorsTable).where(eq(assetVendorsTable.isActive, true));
      const vendorByName = new Map(vendors.map(v => [v.name.trim().toLowerCase(), { id: v.id, name: v.name }]));
      for (const r of clean) {
        const key = r.vendorName.toLowerCase();
        if (!vendorByName.has(key)) {
          const [v] = await tx.insert(assetVendorsTable).values({ name: r.vendorName, status: "Active", createdBy: performedBy, updatedBy: performedBy }).returning({ id: assetVendorsTable.id });
          vendorByName.set(key, { id: v.id, name: r.vendorName });
        }
      }
      const values = clean.map(({ tagGenerated, ...r }) => { const v = vendorByName.get(r.vendorName.toLowerCase())!; return { ...r, vendorId: v.id, vendorName: v.name, createdBy: performedBy, updatedBy: performedBy }; });
      const out: { id: number; status: string }[] = [];
      for (let i = 0; i < values.length; i += 500) {
        out.push(...await tx.insert(assetsTable).values(values.slice(i, i + 500)).returning({ id: assetsTable.id, status: assetsTable.status }));
      }
      for (let i = 0; i < out.length; i += 500) {
        await tx.insert(assetTransactionsTable).values(out.slice(i, i + 500).map(a => ({ assetId: a.id, action: "Imported", newStatus: a.status, userName: performedBy, notes: "Asset register upload" })));
      }
      return out.length;
    });
    await safeLog({ entityType: "asset", action: "import", performedBy, summary: `Imported ${inserted} assets from asset register upload`, context: buildContext(req, "Asset Registry") });
    res.json({ ...summary, inserted, dryRun: false });
  } catch (e) { handleError(res, e); }
});

/* ─── CLEAR ALL ASSET MODULE DATA (admin only) ───────────────────────────── */

router.post("/assets/purge", requireAdmin, async (req, res) => {
  try {
    if (req.body?.confirm !== "DELETE ALL ASSET DATA") { res.status(400).json({ error: "Confirmation text missing" }); return; }
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(assetsTable);
    await db.execute(sql`TRUNCATE TABLE asset_transactions, asset_allocations, maintenance_records, asset_licenses, assets, asset_vendors RESTART IDENTITY`);
    await safeLog({ entityType: "asset", action: "purge", performedBy, summary: `Cleared all asset management data (${count} assets, plus vendors, licenses, allocations, maintenance and history)`, context: buildContext(req, "Asset Registry") });
    res.json({ ok: true, assetsDeleted: count });
  } catch (e) { handleError(res, e); }
});

/* ─── ASSET CATEGORIES ───────────────────────────────────────────────────── */

router.get("/asset-categories", requireAuth, async (_req, res) => {
  try {
    const items = await db.select().from(assetCategoriesTable).where(eq(assetCategoriesTable.isActive, true)).orderBy(assetCategoriesTable.name);
    res.json(items);
  } catch (e) { handleError(res, e); }
});

router.post("/asset-categories", requireAuth, async (req, res) => {
  try {
    const [item] = await db.insert(assetCategoriesTable).values(req.body).returning();
    await safeLog({ entityType: "asset_category", entityId: item.id, action: "create", summary: `Created category: ${item.name}`, newValues: item, context: buildContext(req) });
    res.status(201).json(item);
  } catch (e) { handleError(res, e); }
});

router.patch("/asset-categories/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [item] = await db.update(assetCategoriesTable).set(req.body).where(eq(assetCategoriesTable.id, id)).returning();
    await safeLog({ entityType: "asset_category", entityId: id, action: "update", summary: `Updated category: ${item.name}`, newValues: item, context: buildContext(req) });
    res.json(item);
  } catch (e) { handleError(res, e); }
});

router.delete("/asset-categories/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [old] = await db.select().from(assetCategoriesTable).where(eq(assetCategoriesTable.id, id));
    await db.update(assetCategoriesTable).set({ isActive: false }).where(eq(assetCategoriesTable.id, id));
    await safeLog({ entityType: "asset_category", entityId: id, action: "delete", summary: `Deleted category: ${old?.name || id}`, context: buildContext(req) });
    res.status(204).end();
  } catch (e) { handleError(res, e); }
});

/* ─── VENDORS ────────────────────────────────────────────────────────────── */

router.get("/asset-vendors", requireAuth, async (_req, res) => {
  try {
    const items = await db.select().from(assetVendorsTable).where(eq(assetVendorsTable.isActive, true)).orderBy(assetVendorsTable.name);
    res.json(items);
  } catch (e) { handleError(res, e); }
});

router.post("/asset-vendors", requireAuth, async (req, res) => {
  try {
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const [item] = await db.insert(assetVendorsTable).values({ ...req.body, createdBy: performedBy }).returning();
    await safeLog({ entityType: "asset_vendor", entityId: item.id, action: "create", performedBy, summary: `Created vendor: ${item.name}`, newValues: item, context: buildContext(req, "Vendors") });
    res.status(201).json(item);
  } catch (e) { handleError(res, e); }
});

router.patch("/asset-vendors/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const [item] = await db.update(assetVendorsTable).set({ ...req.body, updatedBy: performedBy, updatedAt: new Date() }).where(eq(assetVendorsTable.id, id)).returning();
    await safeLog({ entityType: "asset_vendor", entityId: id, action: "update", performedBy, summary: `Updated vendor: ${item.name}`, newValues: item, context: buildContext(req, "Vendors") });
    res.json(item);
  } catch (e) { handleError(res, e); }
});

router.delete("/asset-vendors/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [old] = await db.select().from(assetVendorsTable).where(eq(assetVendorsTable.id, id));
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    await db.update(assetVendorsTable).set({ isActive: false }).where(eq(assetVendorsTable.id, id));
    await safeLog({ entityType: "asset_vendor", entityId: id, action: "delete", performedBy, summary: `Deleted vendor: ${old?.name || id}`, context: buildContext(req, "Vendors") });
    res.status(204).end();
  } catch (e) { handleError(res, e); }
});

/* ─── LICENSES ───────────────────────────────────────────────────────────── */

router.get("/asset-licenses", requireAuth, async (_req, res) => {
  try {
    const items = await db.select().from(assetLicensesTable).where(eq(assetLicensesTable.isActive, true)).orderBy(desc(assetLicensesTable.createdAt));
    res.json(items);
  } catch (e) { handleError(res, e); }
});

router.post("/asset-licenses", requireAuth, async (req, res) => {
  try {
    const { seatsUsed = 0, seatsTotal = 1 } = req.body;
    if (Number(seatsUsed) > Number(seatsTotal)) {
      res.status(400).json({ error: `Seats used (${seatsUsed}) cannot exceed total seats (${seatsTotal})` });
      return;
    }
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const [item] = await db.insert(assetLicensesTable).values({ ...req.body, createdBy: performedBy }).returning();
    await safeLog({ entityType: "asset_license", entityId: item.id, action: "create", performedBy, summary: `Created license: ${item.productName}`, newValues: item, context: buildContext(req, "Licenses") });
    res.status(201).json(item);
  } catch (e) { handleError(res, e); }
});

router.patch("/asset-licenses/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const seatsUsed = req.body.seatsUsed !== undefined ? Number(req.body.seatsUsed) : undefined;
    const seatsTotal = req.body.seatsTotal !== undefined ? Number(req.body.seatsTotal) : undefined;
    if (seatsUsed !== undefined && seatsTotal !== undefined && seatsUsed > seatsTotal) {
      res.status(400).json({ error: `Seats used (${seatsUsed}) cannot exceed total seats (${seatsTotal})` });
      return;
    }
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const [item] = await db.update(assetLicensesTable).set({ ...req.body, updatedBy: performedBy, updatedAt: new Date() }).where(eq(assetLicensesTable.id, id)).returning();
    await safeLog({ entityType: "asset_license", entityId: id, action: "update", performedBy, summary: `Updated license: ${item.productName}`, newValues: item, context: buildContext(req, "Licenses") });
    res.json(item);
  } catch (e) { handleError(res, e); }
});

router.delete("/asset-licenses/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [old] = await db.select().from(assetLicensesTable).where(eq(assetLicensesTable.id, id));
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    await db.update(assetLicensesTable).set({ isActive: false }).where(eq(assetLicensesTable.id, id));
    await safeLog({ entityType: "asset_license", entityId: id, action: "delete", performedBy, summary: `Deleted license: ${old?.productName || id}`, context: buildContext(req, "Licenses") });
    res.status(204).end();
  } catch (e) { handleError(res, e); }
});

/* ─── ALLOCATIONS ────────────────────────────────────────────────────────── */

router.get("/asset-allocations", requireAuth, async (_req, res) => {
  try {
    const items = await db.select().from(assetAllocationsTable).orderBy(desc(assetAllocationsTable.createdAt));
    res.json(items);
  } catch (e) { handleError(res, e); }
});

router.post("/asset-allocations", requireAuth, async (req, res) => {
  try {
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const [item] = await db.insert(assetAllocationsTable).values({ ...req.body, createdBy: performedBy }).returning();
    if (req.body.assetId) {
      await db.update(assetsTable).set({ status: "Allocated", ownerName: req.body.userName, department: req.body.department }).where(eq(assetsTable.id, req.body.assetId));
      await db.insert(assetTransactionsTable).values({ assetId: req.body.assetId, action: "Allocation", oldStatus: "In Stock", newStatus: "Allocated", userName: performedBy });
    }
    await safeLog({ entityType: "asset_allocation", entityId: item.id, action: "create", performedBy, summary: `Allocated asset #${req.body.assetId} to ${req.body.userName}`, newValues: item, context: buildContext(req, "Allocations") });
    res.status(201).json(item);
  } catch (e) { handleError(res, e); }
});

/* Bulk allocation — POST /asset-allocations/bulk */
router.post("/asset-allocations/bulk", requireAuth, async (req, res) => {
  try {
    const { assetIds, userId, userName, employeeCode, designation, department, startDate, notes } = req.body as { assetIds: number[]; userId?: number; userName: string; employeeCode?: string; designation?: string; department?: string; startDate?: string; notes?: string };
    if (!assetIds?.length || !userName) {
      res.status(400).json({ error: "assetIds and userName are required" });
      return;
    }
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const ctx = buildContext(req, "Allocations");
    const results = [];
    for (const assetId of assetIds) {
      const [item] = await db.insert(assetAllocationsTable).values({ assetId, userId, userName, employeeCode, designation, department, startDate: startDate || new Date().toISOString().split("T")[0], status: "Active", notes, createdBy: performedBy }).returning();
      await db.update(assetsTable).set({ status: "Allocated", ownerName: userName, department }).where(eq(assetsTable.id, assetId));
      await db.insert(assetTransactionsTable).values({ assetId, action: "Bulk Allocation", oldStatus: "In Stock", newStatus: "Allocated", userName: performedBy, notes: `Bulk allocated to ${userName}` });
      results.push(item);
    }
    await safeLog({ entityType: "asset_allocation", action: "bulk_create", performedBy, summary: `Bulk allocated ${assetIds.length} assets to ${userName}`, newValues: { assetIds, userName, department }, context: ctx });
    res.status(201).json({ count: results.length, allocations: results });
  } catch (e) { handleError(res, e); }
});

router.patch("/asset-allocations/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const [item] = await db.update(assetAllocationsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(assetAllocationsTable.id, id)).returning();
    if (req.body.status === "Returned" && item.assetId) {
      await db.update(assetsTable).set({ status: "In Stock", ownerName: null }).where(eq(assetsTable.id, item.assetId));
      await db.insert(assetTransactionsTable).values({ assetId: item.assetId, action: "Return", oldStatus: "Allocated", newStatus: "In Stock", userName: performedBy });
    }
    await safeLog({ entityType: "asset_allocation", entityId: id, action: "update", performedBy, summary: `Updated allocation #${id}`, newValues: item, context: buildContext(req, "Allocations") });
    res.json(item);
  } catch (e) { handleError(res, e); }
});

router.delete("/asset-allocations/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(assetAllocationsTable).where(eq(assetAllocationsTable.id, id));
    res.status(204).end();
  } catch (e) { handleError(res, e); }
});

/* ─── TRANSACTIONS ───────────────────────────────────────────────────────── */

router.get("/asset-transactions", requireAuth, async (req, res) => {
  try {
    const assetId = req.query.assetId ? parseInt(req.query.assetId as string) : null;
    const q = assetId
      ? db.select().from(assetTransactionsTable).where(eq(assetTransactionsTable.assetId, assetId)).orderBy(desc(assetTransactionsTable.createdAt))
      : db.select().from(assetTransactionsTable).orderBy(desc(assetTransactionsTable.createdAt)).limit(100);
    const items = await q;
    res.json(items);
  } catch (e) { handleError(res, e); }
});

/* ─── MAINTENANCE RECORDS ────────────────────────────────────────────────── */

router.get("/maintenance-records", requireAuth, async (req, res) => {
  try {
    const assetId = req.query.assetId ? parseInt(req.query.assetId as string) : null;
    const q = assetId
      ? db.select().from(maintenanceRecordsTable).where(eq(maintenanceRecordsTable.assetId, assetId)).orderBy(desc(maintenanceRecordsTable.createdAt))
      : db.select().from(maintenanceRecordsTable).orderBy(desc(maintenanceRecordsTable.createdAt));
    const items = await q;
    res.json(items);
  } catch (e) { handleError(res, e); }
});

router.post("/maintenance-records", requireAuth, async (req, res) => {
  try {
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const [item] = await db.insert(maintenanceRecordsTable).values({ ...req.body, createdBy: performedBy }).returning();
    if (req.body.assetId && req.body.status === "In Progress") {
      await db.update(assetsTable).set({ status: "Under Maintenance" }).where(eq(assetsTable.id, req.body.assetId));
      await db.insert(assetTransactionsTable).values({ assetId: req.body.assetId, action: "Maintenance Started", oldStatus: "In Use", newStatus: "Under Maintenance", userName: performedBy, notes: req.body.description });
    }
    await safeLog({ entityType: "maintenance", entityId: item.id, action: "create", performedBy, summary: `Created maintenance record for asset #${req.body.assetId}: ${req.body.description || req.body.type}`, newValues: item, context: buildContext(req, "Maintenance Records") });
    res.status(201).json(item);
  } catch (e) { handleError(res, e); }
});

router.patch("/maintenance-records/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [old] = await db.select().from(maintenanceRecordsTable).where(eq(maintenanceRecordsTable.id, id));
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const [item] = await db.update(maintenanceRecordsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(maintenanceRecordsTable.id, id)).returning();
    if (old?.status !== "Completed" && item.status === "Completed" && item.assetId) {
      await db.update(assetsTable).set({ status: "In Use" }).where(eq(assetsTable.id, item.assetId));
      await db.insert(assetTransactionsTable).values({ assetId: item.assetId, action: "Maintenance Completed", oldStatus: "Under Maintenance", newStatus: "In Use", userName: performedBy, notes: item.description || undefined });
    }
    await safeLog({ entityType: "maintenance", entityId: id, action: "update", performedBy, summary: `Updated maintenance record #${id}`, newValues: item, context: buildContext(req, "Maintenance Records") });
    res.json(item);
  } catch (e) { handleError(res, e); }
});

router.delete("/maintenance-records/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    await db.delete(maintenanceRecordsTable).where(eq(maintenanceRecordsTable.id, id));
    await safeLog({ entityType: "maintenance", entityId: id, action: "delete", performedBy, summary: `Deleted maintenance record #${id}`, context: buildContext(req, "Maintenance Records") });
    res.status(204).end();
  } catch (e) { handleError(res, e); }
});

export default router;
