import { Router, Request, Response } from "express";
import { db, usersTable, assetsTable, assetCategoriesTable, assetVendorsTable, assetLicensesTable, assetAllocationsTable, assetTransactionsTable, maintenanceRecordsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";
import { logAudit, getPerformedBy, buildContext } from "./audit-logs";
import { snapshotRegister, archiveAssetUpload, ASSET_TABLES, createBatch, batchWorkbook, XLSX_TYPE } from "../lib/archive";
import { missingMasters, ensureMasters } from "../lib/masters-auto";
import { notify, htmlTable } from "../lib/mailer";

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

/** Next free tag for a type (PREFIX-0001…), skipping tags already used — safe after deletions / imports. */
async function nextTag(type: string) {
  const prefix = TYPE_PREFIX[type] || "AST";
  const rows = await db.select({ t: assetsTable.assetTag }).from(assetsTable).where(sql`asset_tag ILIKE ${prefix + "-%"}`);
  const used = new Set(rows.map(r => r.t.toUpperCase()));
  let n = rows.reduce((m, r) => { const k = Number(r.t.split("-").pop()); return Number.isFinite(k) && k > m ? k : m; }, 0) + 1;
  while (used.has(`${prefix}-${String(n).padStart(4, "0")}`)) n++;
  return { tag: `${prefix}-${String(n).padStart(4, "0")}`, prefix, count: rows.length };
}

router.get("/assets/next-tag", requireAuth, async (req, res) => {
  try { res.json(await nextTag((req.query.type as string) || "Others")); } catch (e) { handleError(res, e); }
});

const CREATE_STATES = ["In Stock", "In Use", "Under Maintenance", "Retired"];

// Fields shown in the change trail (label used in the History & comments tab)
const TRACKED: Record<string, string> = {
  assetTag: "Asset tag", name: "Name", type: "Type", serialNumber: "Serial number", department: "Department", location: "Location",
  purchaseDate: "Purchase date", purchaseOrderNo: "PO number", cost: "Cost", vendorName: "Vendor", warrantyExpiry: "Warranty expiry",
  ipAddress: "IP address", macAddress: "MAC address", osVersion: "OS version", configuration: "Configuration", notes: "Notes", categoryId: "Category",
  invoiceNo: "Invoice number", warrantyStart: "Warranty start", depreciationMethod: "Depreciation method", usefulLifeYears: "Useful life (years)", salvageValue: "Residual value",
};
const norm = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
function diffAsset(oldA: any, newA: any) {
  const out: { field: string; label: string; from: string | null; to: string | null }[] = [];
  for (const [f, label] of Object.entries(TRACKED)) {
    let a = norm(oldA[f]), b = norm(newA[f]);
    if (f === "cost" || f === "salvageValue" || f === "usefulLifeYears") { a = a === null ? null : Number(a).toFixed(2); b = b === null ? null : Number(b).toFixed(2); }
    if (a !== b) out.push({ field: f, label, from: a, to: b });
  }
  return out;
}
const LIFECYCLE_FIELDS = ["status", "ownerId", "ownerName", "ownerEmail", "ownerEmployeeCode", "disposalDate", "disposalMethod", "disposalReference", "disposalValue"];

router.post("/assets", requireAuth, async (req, res) => {
  try {
    const status = req.body.status || "In Stock";
    if (!CREATE_STATES.includes(status)) {
      res.status(400).json({ error: `New assets start as ${CREATE_STATES.join(" / ")}. Register it In Stock, then use Issue to hand it to an employee.` });
      return;
    }
    for (const f of LIFECYCLE_FIELDS) if (f !== "status") delete req.body[f];
    req.body.status = status;
    for (const f of ["id", "createdAt", "updatedAt", "createdBy", "updatedBy", "isActive"]) delete req.body[f];
    if (!norm(req.body.name)) { res.status(400).json({ error: "Asset name is required" }); return; }
    if (!norm(req.body.type)) { res.status(400).json({ error: "Asset type is required" }); return; }
    if (!norm(req.body.assetTag)) req.body.assetTag = (await nextTag(req.body.type)).tag;
    else {
      const [dupTag] = await db.select({ id: assetsTable.id }).from(assetsTable).where(sql`lower(asset_tag) = lower(${req.body.assetTag})`);
      if (dupTag) { res.status(400).json({ error: `Asset tag "${req.body.assetTag}" already exists` }); return; }
    }
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
    const comment = norm(req.body.comment); delete req.body.comment;
    const [item] = await db.insert(assetsTable).values({ ...req.body, createdBy: performedBy, updatedBy: performedBy }).returning();
    await db.insert(assetTransactionsTable).values({ assetId: item.id, action: "Registered", newStatus: item.status, userName: performedBy, comment, notes: `Registered as ${item.status}` });
    await safeLog({ entityType: "asset", entityId: item.id, action: "create", performedBy, summary: `Created asset: ${item.name} (${item.assetTag})`, newValues: item, context: ctx });
    res.status(201).json(item);
  } catch (e) { handleError(res, e); }
});

router.patch("/assets/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [old] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
    if (!old) { res.status(404).json({ error: "Asset not found" }); return; }
    // Status and holder change only through the lifecycle actions (issue / return / transition)
    for (const f of LIFECYCLE_FIELDS) delete req.body[f];
    const comment = norm(req.body.comment); delete req.body.comment;
    for (const f of ["id", "createdAt", "updatedAt", "createdBy", "updatedBy", "isActive"]) delete req.body[f];
    const changes = diffAsset(old, { ...old, ...req.body });
    if (!changes.length) { res.json(old); return; }
    if (!comment || comment.length < 3) { res.status(400).json({ error: "Please add a comment explaining the change (reason / reference)." }); return; }
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
    await db.insert(assetTransactionsTable).values({ assetId: id, action: "Updated", userName: performedBy, comment, changes,
      notes: changes.map(c => c.label).join(", ") + " changed" });
    await safeLog({ entityType: "asset", entityId: id, action: "update", performedBy, summary: `Updated asset: ${item.name} (${item.assetTag}) — ${changes.map(c => `${c.label}: ${c.from ?? "—"} → ${c.to ?? "—"}`).join("; ")}${comment ? ` · "${comment}"` : ""}`, newValues: { changes, comment }, context: ctx });
    res.json(item);
  } catch (e) { handleError(res, e); }
});

router.delete("/assets/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [old] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    if (old && ["Allocated"].includes(old.status)) { res.status(400).json({ error: `${old.assetTag} is issued to ${old.ownerName} — return it before deleting` }); return; }
    await db.update(assetsTable).set({ isActive: false }).where(eq(assetsTable.id, id));
    await db.insert(assetTransactionsTable).values({ assetId: id, action: "Deleted", oldStatus: old?.status, userName: performedBy, comment: norm(req.query.reason as string) });
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

/* ─── COMMENTS on an asset (anyone with access can add; kept in the asset's trail) ─── */

router.post("/asset-comments/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const comment = norm(req.body?.comment);
    if (!comment) { res.status(400).json({ error: "Comment is empty" }); return; }
    if (comment.length > 2000) { res.status(400).json({ error: "Comment is too long (max 2000 characters)" }); return; }
    const [a] = await db.select({ id: assetsTable.id, assetTag: assetsTable.assetTag }).from(assetsTable).where(eq(assetsTable.id, id));
    if (!a) { res.status(404).json({ error: "Asset not found" }); return; }
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const [t] = await db.insert(assetTransactionsTable).values({ assetId: id, action: "Comment", userName: performedBy, comment }).returning();
    await safeLog({ entityType: "asset", entityId: id, action: "comment", performedBy, summary: `Comment on ${a.assetTag}: ${comment.slice(0, 120)}`, context: buildContext(req, "Asset Registry") });
    res.status(201).json(t);
  } catch (e) { handleError(res, e); }
});

/* ─── ASSET REGISTER IMPORT (Excel/CSV upload, validated, all-or-nothing) ─── */

const IMPORT_TYPES = Object.keys(TYPE_PREFIX);
const IMPORT_STATUSES = ["In Stock", "Allocated", "In Use", "Under Maintenance", "Retired"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IMPORT_FIELDS = ["assetTag", "name", "type", "serialNumber", "status", "ownerName", "ownerEmployeeCode", "ownerEmail", "department", "location",
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
    // Holders are identified by Employee Code from User Master (internal or external people)
    const people = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, code: usersTable.employeeCode, type: usersTable.userType, active: usersTable.isActive, department: usersTable.department }).from(usersTable);
    const byCode = new Map(people.filter(p => p.code).map(p => [p.code!.trim().toLowerCase(), p]));
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
      } else r.status = r.ownerEmployeeCode ? "Allocated" : "In Stock";
      if (r.status === "Allocated" && !r.ownerEmployeeCode) err("Employee Code", "Required when Status is Allocated (the person must exist in User Master)");
      if (r.status !== "Allocated" && (r.ownerName || r.ownerEmail || r.ownerEmployeeCode)) err("Employee Code", `Only Allocated assets can have an employee — set Status to Allocated or clear Employee Code / Assigned To`);
      if (r.status === "Allocated" && r.ownerEmployeeCode) {
        const p = byCode.get(r.ownerEmployeeCode.toLowerCase());
        if (!p) err("Employee Code", `"${r.ownerEmployeeCode}" is not in User Master — add the person (internal or external) first`);
        else if (!p.active) err("Employee Code", `${r.ownerEmployeeCode} (${p.name}) is inactive in User Master`);
        else { r.ownerEmployeeCode = p.code; r.ownerName = p.name; r.ownerEmail = p.email; r.ownerId = p.id; r.holderType = p.type === "external" ? "external" : "internal"; }
      }
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
    const newMasters = { departments: await missingMasters("department", clean.map(r => r.department)), locations: await missingMasters("asset_location", clean.map(r => r.location)) };
    if (dryRun || errors.length) { res.json({ ...summary, newMasters, inserted: 0, dryRun: true, preview: clean.slice(0, 5) }); return; }

    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    const before = await snapshotRegister();
    const inserted = await db.transaction(async (tx) => {
      // Department / Location are drop-downs: map to the master value, adding new ones automatically
      const dm = (await ensureMasters(tx, "department", clean.map(r => r.department))).map;
      const lm = (await ensureMasters(tx, "asset_location", clean.map(r => r.location))).map;
      for (const r of clean) { if (r.department) r.department = dm.get(r.department.toLowerCase()) || r.department; if (r.location) r.location = lm.get(r.location.toLowerCase()) || r.location; }
      const vendors = await tx.select({ id: assetVendorsTable.id, name: assetVendorsTable.name }).from(assetVendorsTable).where(eq(assetVendorsTable.isActive, true));
      const vendorByName = new Map(vendors.map(v => [v.name.trim().toLowerCase(), { id: v.id, name: v.name }]));
      for (const r of clean) {
        const key = r.vendorName.toLowerCase();
        if (!vendorByName.has(key)) {
          const [v] = await tx.insert(assetVendorsTable).values({ name: r.vendorName, status: "Active", createdBy: performedBy, updatedBy: performedBy }).returning({ id: assetVendorsTable.id });
          vendorByName.set(key, { id: v.id, name: r.vendorName });
        }
      }
      const values = clean.map(({ tagGenerated, holderType, ...r }) => { const v = vendorByName.get(r.vendorName.toLowerCase())!; return { ...r, vendorId: v.id, vendorName: v.name, createdBy: performedBy, updatedBy: performedBy }; });
      const out: { id: number; status: string; assetTag: string }[] = [];
      for (let i = 0; i < values.length; i += 500) {
        out.push(...await tx.insert(assetsTable).values(values.slice(i, i + 500)).returning({ id: assetsTable.id, status: assetsTable.status, assetTag: assetsTable.assetTag }));
      }
      // Assets uploaded as Allocated get an open handover record (acknowledgement pending)
      const byTag = new Map(values.map(v => [v.assetTag, v]));
      const typeByTag = new Map(clean.map(c => [c.assetTag, c.holderType]));
      const allocated = out.filter(a => a.status === "Allocated");
      for (const a of allocated) {
        const v: any = byTag.get(a.assetTag);
        const userId = v.ownerId ?? null;
        const [al] = await tx.insert(assetAllocationsTable).values({
          assetId: a.id, userId, userName: v.ownerName, email: v.ownerEmail, employeeCode: v.ownerEmployeeCode, holderType: typeByTag.get(a.assetTag) ?? null, department: v.department, location: v.location,
          startDate: v.purchaseDate || new Date().toISOString().slice(0, 10), status: "Active", allocationType: "Permanent", issueCondition: "Good",
          issuedBy: "Asset register upload", ackStatus: "Pending", notes: "Created from asset register upload", createdBy: performedBy,
        }).returning({ id: assetAllocationsTable.id });
        await tx.update(assetAllocationsTable).set({ handoverNo: `HO-${new Date().getFullYear()}-${String(al.id).padStart(5, "0")}` }).where(eq(assetAllocationsTable.id, al.id));
      }
      for (let i = 0; i < out.length; i += 500) {
        await tx.insert(assetTransactionsTable).values(out.slice(i, i + 500).map(a => ({ assetId: a.id, action: "Imported", newStatus: a.status, userName: performedBy, notes: "Asset register upload" })));
      }
      return out.length;
    });
    await safeLog({ entityType: "asset", action: "import", performedBy, summary: `Imported ${inserted} assets from asset register upload`, context: buildContext(req, "Asset Registry") });
    const archiveBatch = await archiveAssetUpload({ kind: "asset_register_upload", fileName: typeof req.body?.fileName === "string" ? req.body.fileName : null, uploaded: rows, before, by: performedBy, summary: { inserted, newDepartments: newMasters.departments.join(", "), newLocations: newMasters.locations.join(", ") } });
    res.json({ ...summary, newMasters, inserted, dryRun: false, archiveBatch });
  } catch (e) { handleError(res, e); }
});

/* ─── CLEAR ALL ASSET MODULE DATA (admin only) ───────────────────────────── */

router.post("/assets/purge", requireAdmin, async (req, res) => {
  try {
    if (req.body?.confirm !== "DELETE ALL ASSET DATA") { res.status(400).json({ error: "Confirmation text missing" }); return; }
    const performedBy = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
    // No data loss: every asset table is copied into one archive batch first, in the same transaction as the clear
    const register = await snapshotRegister();
    const result = await db.transaction(async tx => {
      const sections: Record<string, any[]> = { register };
      const counts: Record<string, number> = {};
      for (const t of ASSET_TABLES) {
        const r: any = await tx.execute(sql.raw(`SELECT coalesce(json_agg(x ORDER BY x.id), '[]'::json) AS rows FROM public.${t} x`));
        sections[`table:${t}`] = (r.rows ?? r)[0].rows; counts[t] = sections[`table:${t}`].length;
      }
      const r: any = await tx.execute(sql`INSERT INTO data_archive_batches (batch_no, kind, module, title, row_count, summary, created_by)
        VALUES (${"TMP-" + Date.now()}, 'asset_clear', 'IT Asset Management', 'All asset data cleared (archived)', ${counts.assets || 0}, ${JSON.stringify(counts)}::jsonb, ${performedBy}) RETURNING id`);
      const id = (r.rows ?? r)[0].id as number;
      const batchNo = `ARC-${new Date().getFullYear()}-${String(id).padStart(5, "0")}`;
      await tx.execute(sql`UPDATE data_archive_batches SET batch_no = ${batchNo} WHERE id = ${id}`);
      for (const [section, payload] of Object.entries(sections))
        await tx.execute(sql`INSERT INTO data_archive_items (batch_id, section, row_count, payload) VALUES (${id}, ${section}, ${payload.length}, ${JSON.stringify(payload)}::jsonb)`);
      await tx.execute(sql.raw(`TRUNCATE TABLE ${ASSET_TABLES.map(t => "public." + t).join(", ")} RESTART IDENTITY`));
      return { id, batchNo, counts };
    });
    await safeLog({ entityType: "asset", action: "purge", performedBy, summary: `Cleared all asset data — archived as ${result.batchNo} (${result.counts.assets} assets, ${result.counts.asset_transactions} history entries); restorable from Admin › Archive`, context: buildContext(req, "Asset Registry") });
    batchWorkbook(result.id).then(({ buffer, name }) => notify("asset_clear", {
      subject: `Asset data cleared — archived as ${result.batchNo} (${result.counts.assets} assets)`,
      html: `<p>All IT asset data was cleared from the live register and kept in the archive. It can be restored from <b>Admin › Archive</b>.</p>${htmlTable([["Archive batch", result.batchNo], ["By", performedBy], ["Assets", result.counts.assets], ["Handovers", result.counts.asset_allocations], ["History entries", result.counts.asset_transactions], ["Licenses", result.counts.asset_licenses], ["Contracts", result.counts.asset_contracts]])}<p>Attached: archived register and every asset table.</p>`,
      attachment: { name, content: buffer, contentType: XLSX_TYPE }, batchId: result.id,
    })).catch(e => console.error("clear notify failed", e));
    res.json({ ok: true, assetsDeleted: result.counts.assets, archiveBatch: result.batchNo });
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

/* Licenses: see asset-licenses.ts (assignments + compliance) */

/* ─── ALLOCATIONS ────────────────────────────────────────────────────────── */

router.get("/asset-allocations", requireAuth, async (_req, res) => {
  try {
    const items = await db.select().from(assetAllocationsTable).orderBy(desc(assetAllocationsTable.createdAt));
    res.json(items);
  } catch (e) { handleError(res, e); }
});

// Issue / return / bulk issue / acknowledgement live in asset-lifecycle.ts so every
// status change follows the lifecycle rules and creates a handover record.

/* ─── TRANSACTIONS ───────────────────────────────────────────────────────── */

router.get("/asset-transactions", requireAuth, async (req, res) => {
  try {
    const assetId = req.query.assetId ? parseInt(req.query.assetId as string) : null;
    const q = assetId
      ? db.select().from(assetTransactionsTable).where(eq(assetTransactionsTable.assetId, assetId)).orderBy(desc(assetTransactionsTable.createdAt), desc(assetTransactionsTable.id))
      : db.select().from(assetTransactionsTable).orderBy(desc(assetTransactionsTable.createdAt)).limit(100);
    const items = await q;
    res.json(items);
  } catch (e) { handleError(res, e); }
});

/* ─── MAINTENANCE RECORDS ────────────────────────────────────────────────── */

// Starting maintenance keeps the employee assignment (a laptop can be in repair while still issued);
// completing it puts the asset back in the state it was in before the repair.
async function startMaintenance(assetId: number, performedBy: string, notes?: string | null) {
  const [a] = await db.select().from(assetsTable).where(eq(assetsTable.id, assetId));
  if (!a || ["Under Maintenance", "Retired", "Disposed", "Lost / Stolen"].includes(a.status)) return;
  await db.update(assetsTable).set({ status: "Under Maintenance" }).where(eq(assetsTable.id, assetId));
  await db.insert(assetTransactionsTable).values({ assetId, action: "Sent for Repair", oldStatus: a.status, newStatus: "Under Maintenance", userName: performedBy, notes: notes || null });
}
async function completeMaintenance(assetId: number, performedBy: string, notes?: string | null) {
  const [a] = await db.select().from(assetsTable).where(eq(assetsTable.id, assetId));
  if (!a || a.status !== "Under Maintenance") return;
  const [last] = await db.select().from(assetTransactionsTable)
    .where(sql`${assetTransactionsTable.assetId} = ${assetId} AND ${assetTransactionsTable.newStatus} = 'Under Maintenance'`)
    .orderBy(desc(assetTransactionsTable.createdAt)).limit(1);
  const [active] = await db.select({ id: assetAllocationsTable.id }).from(assetAllocationsTable)
    .where(sql`${assetAllocationsTable.assetId} = ${assetId} AND ${assetAllocationsTable.status} = 'Active'`).limit(1);
  const back = active ? "Allocated" : last?.oldStatus === "In Use" ? "In Use" : "In Stock";
  await db.update(assetsTable).set({ status: back }).where(eq(assetsTable.id, assetId));
  await db.insert(assetTransactionsTable).values({ assetId, action: "Repair Completed", oldStatus: "Under Maintenance", newStatus: back, userName: performedBy, notes: notes || null });
}

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
    if (req.body.assetId && req.body.status === "In Progress") await startMaintenance(Number(req.body.assetId), performedBy, req.body.description);
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
    if (old?.status !== "In Progress" && item.status === "In Progress" && item.assetId) await startMaintenance(item.assetId, performedBy, item.description);
    if (old?.status !== "Completed" && item.status === "Completed" && item.assetId) await completeMaintenance(item.assetId, performedBy, item.description);
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
