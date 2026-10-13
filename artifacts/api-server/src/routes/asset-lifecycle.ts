import { Router, Request, Response } from "express";
import { db, assetsTable, assetAllocationsTable, assetTransactionsTable, usersTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy, buildContext } from "./audit-logs";

/*
 * Asset lifecycle (ManageEngine-style asset states).
 * Every status change goes through this router so the transition rules, the handover record and the
 * asset history stay consistent. The client reads LIFECYCLE from GET /asset-lifecycle/model.
 */
export const ASSET_STATES = ["In Stock", "Allocated", "In Use", "Under Maintenance", "Retired", "Lost / Stolen", "Disposed"] as const;
export type AssetState = typeof ASSET_STATES[number];

export const LIFECYCLE: Record<AssetState, AssetState[]> = {
  "In Stock": ["Allocated", "In Use", "Under Maintenance", "Retired", "Lost / Stolen"],
  "Allocated": ["In Stock", "Under Maintenance", "Retired", "Lost / Stolen"], // leaving Allocated = Return (or Lost)
  "In Use": ["In Stock", "Under Maintenance", "Retired", "Lost / Stolen"],
  "Under Maintenance": ["In Stock", "In Use", "Retired"],
  "Retired": ["Disposed", "In Stock"],
  "Lost / Stolen": ["In Stock", "Retired"],
  "Disposed": [],
};

const ACTION_LABEL: Record<string, string> = {
  "Allocated": "Issued",
  "In Use": "Deployed",
  "Under Maintenance": "Sent for Repair",
  "Retired": "Retired",
  "Disposed": "Disposed",
  "Lost / Stolen": "Reported Lost / Stolen",
  "In Stock": "Returned to Store",
};

export const DISPOSAL_METHODS = ["E-waste recycler", "Sold", "Buy-back / Exchange", "Donated", "Scrapped", "Returned to vendor"];
export const CONDITIONS = ["New", "Good", "Fair", "Damaged", "Not working"];
export const ALLOCATION_TYPES = ["Permanent", "Temporary", "Loaner"];

const router = Router();

function fail(res: Response, status: number, error: string) { res.status(status).json({ error }); }
function handleError(res: Response, e: unknown) { fail(res, 500, e instanceof Error ? e.message : String(e)); }
async function safeLog(p: Parameters<typeof logAudit>[0]) { try { await logAudit(p); } catch { /* non-fatal */ } }
const s = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const today = () => new Date().toISOString().slice(0, 10);

async function actor(req: Request) {
  const userId = (req.session as any)?.userId as number | undefined;
  const performedBy = await getPerformedBy(userId).catch(() => "System");
  let name = "System";
  if (userId) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
    name = u?.name || name;
  }
  return { userId, performedBy, name };
}

async function loadAsset(id: number) {
  const [a] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, id), eq(assetsTable.isActive, true)));
  return a;
}

async function activeAllocation(assetId: number) {
  const [al] = await db.select().from(assetAllocationsTable)
    .where(and(eq(assetAllocationsTable.assetId, assetId), eq(assetAllocationsTable.status, "Active")))
    .orderBy(desc(assetAllocationsTable.createdAt)).limit(1);
  return al;
}

function canMove(from: string, to: string) {
  return (LIFECYCLE[from as AssetState] || []).includes(to as AssetState);
}

/* ─── Model (single source of truth for the UI) ──────────────────────────── */

router.get("/asset-lifecycle/model", requireAuth, (_req, res) => {
  res.json({ states: ASSET_STATES, transitions: LIFECYCLE, actions: ACTION_LABEL, disposalMethods: DISPOSAL_METHODS, conditions: CONDITIONS, allocationTypes: ALLOCATION_TYPES });
});

/* ─── QR scan lookup ─────────────────────────────────────────────────────── */

router.get("/assets/by-tag/:tag", requireAuth, async (req, res) => {
  try {
    const tag = decodeURIComponent(String(req.params.tag)).trim();
    const [a] = await db.select().from(assetsTable).where(sql`lower(${assetsTable.assetTag}) = lower(${tag})`).limit(1);
    if (!a) return fail(res, 404, `No asset with tag ${tag}`);
    const al = a.status === "Allocated" || a.status === "Under Maintenance" ? await activeAllocation(a.id) : undefined;
    res.json({ ...a, activeHandover: al ?? null });
  } catch (e) { handleError(res, e); }
});

/* ─── People picker (all signed-in users can read; no admin needed) ──────── */

router.get("/asset-people", requireAuth, async (_req, res) => {
  try {
    const rows = await db.select({
      id: usersTable.id, name: usersTable.name, email: usersTable.email, employeeCode: usersTable.employeeCode,
      department: usersTable.department, designation: usersTable.designation,
    }).from(usersTable).where(eq(usersTable.isActive, true)).orderBy(usersTable.name);
    res.json(rows);
  } catch (e) { handleError(res, e); }
});

/* ─── Issue (handover) ───────────────────────────────────────────────────── */

type Employee = { userId?: number | null; userName: string; email?: string | null; employeeCode?: string | null; designation?: string | null; department?: string | null; location?: string | null };

async function issueOne(tx: any, assetId: number, emp: Employee, h: any, who: { performedBy: string; name: string }) {
  const [asset] = await tx.select().from(assetsTable).where(and(eq(assetsTable.id, assetId), eq(assetsTable.isActive, true)));
  if (!asset) throw new Error(`Asset #${assetId} not found`);
  if (!canMove(asset.status, "Allocated")) throw new Error(`${asset.assetTag} is "${asset.status}" — only assets In Stock can be issued`);
  const [al] = await tx.insert(assetAllocationsTable).values({
    assetId, userId: emp.userId ?? null, userName: emp.userName, email: emp.email ?? null, employeeCode: emp.employeeCode ?? null,
    designation: emp.designation ?? null, department: emp.department ?? null, location: emp.location ?? asset.location ?? null,
    startDate: s(h.startDate) || today(), status: "Active", notes: s(h.notes),
    allocationType: s(h.allocationType) || "Permanent", expectedReturnDate: s(h.expectedReturnDate),
    issueCondition: s(h.condition) || "Good", accessories: s(h.accessories), issuedBy: who.name,
    ackStatus: "Pending", createdBy: who.performedBy,
  }).returning();
  const handoverNo = `HO-${new Date().getFullYear()}-${String(al.id).padStart(5, "0")}`;
  await tx.update(assetAllocationsTable).set({ handoverNo }).where(eq(assetAllocationsTable.id, al.id));
  await tx.update(assetsTable).set({
    status: "Allocated", ownerId: emp.userId ?? null, ownerName: emp.userName, ownerEmail: emp.email ?? null,
    ownerEmployeeCode: emp.employeeCode ?? null, department: emp.department ?? asset.department,
    location: emp.location ?? asset.location, updatedBy: who.performedBy, updatedAt: new Date(),
  }).where(eq(assetsTable.id, assetId));
  await tx.insert(assetTransactionsTable).values({
    assetId, action: "Issued", oldStatus: asset.status, newStatus: "Allocated", userName: who.performedBy, comment: s(h.notes),
    notes: `${handoverNo} · to ${emp.userName}${emp.employeeCode ? ` (${emp.employeeCode})` : ""} · ${s(h.allocationType) || "Permanent"} · condition ${s(h.condition) || "Good"}${s(h.accessories) ? ` · accessories: ${s(h.accessories)}` : ""}`,
  });
  return { ...al, handoverNo, assetTag: asset.assetTag };
}

function readEmployee(body: any): Employee | string {
  const userName = s(body.userName);
  if (!userName) return "Employee name is required";
  if (s(body.allocationType) && !ALLOCATION_TYPES.includes(body.allocationType)) return `Allocation type must be one of ${ALLOCATION_TYPES.join(", ")}`;
  if (s(body.condition) && !CONDITIONS.includes(body.condition)) return `Condition must be one of ${CONDITIONS.join(", ")}`;
  if (s(body.allocationType) && body.allocationType !== "Permanent" && !s(body.expectedReturnDate)) return "Expected return date is required for temporary / loaner issues";
  return {
    userId: body.userId ? Number(body.userId) : null, userName, email: s(body.email), employeeCode: s(body.employeeCode),
    designation: s(body.designation), department: s(body.department), location: s(body.location),
  };
}

router.post("/assets/:id/issue", requireAuth, async (req, res) => {
  try {
    const emp = readEmployee(req.body);
    if (typeof emp === "string") return fail(res, 400, emp);
    const who = await actor(req);
    const result = await db.transaction(tx => issueOne(tx, Number(req.params.id), emp, req.body, who));
    await safeLog({ entityType: "asset", entityId: Number(req.params.id), action: "issue", performedBy: who.performedBy, summary: `Issued ${result.assetTag} to ${emp.userName} (${result.handoverNo})`, newValues: result, context: buildContext(req, "Asset Lifecycle") });
    res.status(201).json(result);
  } catch (e) { fail(res, 400, e instanceof Error ? e.message : String(e)); }
});

router.post("/assets/bulk-issue", requireAuth, async (req, res) => {
  try {
    const ids: number[] = Array.isArray(req.body.assetIds) ? req.body.assetIds.map(Number) : [];
    if (!ids.length) return fail(res, 400, "Select at least one asset");
    const emp = readEmployee(req.body);
    if (typeof emp === "string") return fail(res, 400, emp);
    const who = await actor(req);
    const results = await db.transaction(async tx => { const out = []; for (const id of ids) out.push(await issueOne(tx, id, emp, req.body, who)); return out; });
    await safeLog({ entityType: "asset", action: "bulk_issue", performedBy: who.performedBy, summary: `Issued ${results.length} assets to ${emp.userName}`, newValues: results.map(r => r.handoverNo), context: buildContext(req, "Asset Lifecycle") });
    res.status(201).json({ count: results.length, handovers: results });
  } catch (e) { fail(res, 400, e instanceof Error ? e.message : String(e)); }
});

/* ─── Return ─────────────────────────────────────────────────────────────── */

router.post("/assets/:id/return", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const next = (s(req.body.nextStatus) || "In Stock") as AssetState;
    if (!["In Stock", "Under Maintenance", "Retired"].includes(next)) return fail(res, 400, "After return the asset must go to In Stock, Under Maintenance or Retired");
    const condition = s(req.body.condition);
    if (!condition || !CONDITIONS.includes(condition)) return fail(res, 400, `Return condition is required (${CONDITIONS.join(", ")})`);
    const asset = await loadAsset(id);
    if (!asset) return fail(res, 404, "Asset not found");
    const al = await activeAllocation(id);
    // An issued asset can be returned straight from repair as well
    if (asset.status !== "Allocated" && !(asset.status === "Under Maintenance" && al)) return fail(res, 400, `${asset.assetTag} is "${asset.status}", not issued to anyone`);
    const who = await actor(req);
    await db.transaction(async tx => {
      if (al) await tx.update(assetAllocationsTable).set({
        status: "Returned", endDate: s(req.body.returnDate) || today(), returnCondition: condition,
        returnAccessories: s(req.body.accessoriesReturned), returnRemarks: s(req.body.remarks), receivedBy: who.name, returnedAt: new Date(),
      }).where(eq(assetAllocationsTable.id, al.id));
      await tx.update(assetsTable).set({
        status: next, ownerId: null, ownerName: null, ownerEmail: null, ownerEmployeeCode: null,
        location: s(req.body.location) || asset.location, updatedBy: who.performedBy, updatedAt: new Date(),
      }).where(eq(assetsTable.id, id));
      await tx.insert(assetTransactionsTable).values({
        assetId: id, action: "Returned", oldStatus: asset.status, newStatus: next, userName: who.performedBy, comment: s(req.body.remarks),
        notes: `${al?.handoverNo ?? ""} · from ${al?.userName ?? asset.ownerName ?? "employee"} · condition ${condition}${s(req.body.accessoriesReturned) ? ` · accessories: ${s(req.body.accessoriesReturned)}` : ""}${s(req.body.remarks) ? ` · ${s(req.body.remarks)}` : ""}`,
      });
    });
    await safeLog({ entityType: "asset", entityId: id, action: "return", performedBy: who.performedBy, summary: `Returned ${asset.assetTag} from ${al?.userName ?? asset.ownerName} → ${next}`, context: buildContext(req, "Asset Lifecycle") });
    res.json({ ok: true, status: next });
  } catch (e) { handleError(res, e); }
});

/* ─── Other transitions: deploy, repair, retire, dispose, lost, found ────── */

router.post("/assets/:id/transition", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const to = s(req.body.toStatus) as AssetState;
    const reason = s(req.body.reason);
    const asset = await loadAsset(id);
    if (!asset) return fail(res, 404, "Asset not found");
    if (!to || !ASSET_STATES.includes(to)) return fail(res, 400, "Unknown target status");
    const holder = ["Allocated", "Under Maintenance"].includes(asset.status) ? await activeAllocation(id) : undefined;
    const backToHolder = asset.status === "Under Maintenance" && !!holder && to === "Allocated"; // repair done, back with the same employee
    if (to === "Allocated" && !backToHolder) return fail(res, 400, "Use Issue to hand an asset to an employee");
    if (holder && !backToHolder && to !== "Lost / Stolen") return fail(res, 400, `${asset.assetTag} is still issued to ${holder.userName} — use Return first`);
    if (!backToHolder && !canMove(asset.status, to)) return fail(res, 400, `Cannot move ${asset.assetTag} from "${asset.status}" to "${to}"`);
    if (["Under Maintenance", "Retired", "Lost / Stolen"].includes(to) && !reason) return fail(res, 400, "Reason is required");
    if (to === "In Use" && !s(req.body.location) && !asset.location) return fail(res, 400, "Location is required to deploy an asset");

    const patch: any = { status: to, updatedAt: new Date() };
    if (to === "In Use" && s(req.body.location)) patch.location = s(req.body.location);
    if (to === "Disposed") {
      const method = s(req.body.disposalMethod);
      if (!method || !DISPOSAL_METHODS.includes(method)) return fail(res, 400, `Disposal method is required (${DISPOSAL_METHODS.join(", ")})`);
      if (!s(req.body.disposalReference)) return fail(res, 400, "Disposal certificate / reference number is required");
      const val = s(req.body.disposalValue);
      if (val && !Number.isFinite(Number(val))) return fail(res, 400, "Disposal value must be a number");
      Object.assign(patch, { disposalDate: s(req.body.disposalDate) || today(), disposalMethod: method, disposalReference: s(req.body.disposalReference), disposalValue: val ? Number(val).toFixed(2) : null });
    }
    const who = await actor(req);
    patch.updatedBy = who.performedBy;
    const al = to === "Lost / Stolen" ? holder : undefined;
    const action = asset.status === "Under Maintenance" && to !== "Retired" ? "Repair Completed" : asset.status === "Lost / Stolen" && to === "In Stock" ? "Found" : ACTION_LABEL[to];
    const detail = [reason, s(req.body.location) && `location ${s(req.body.location)}`, s(req.body.vendor) && `vendor ${s(req.body.vendor)}`, s(req.body.reference) && `ref ${s(req.body.reference)}`,
      to === "Disposed" && `${patch.disposalMethod} · cert ${patch.disposalReference}${patch.disposalValue ? ` · ₹${patch.disposalValue}` : ""}`].filter(Boolean).join(" · ");

    await db.transaction(async tx => {
      if (al) {
        await tx.update(assetAllocationsTable).set({ status: "Lost", endDate: today(), returnRemarks: `Reported lost/stolen: ${reason}`, receivedBy: who.name, returnedAt: new Date() }).where(eq(assetAllocationsTable.id, al.id));
        Object.assign(patch, { ownerId: null, ownerName: null, ownerEmail: null, ownerEmployeeCode: null });
      }
      await tx.update(assetsTable).set(patch).where(eq(assetsTable.id, id));
      await tx.insert(assetTransactionsTable).values({ assetId: id, action, oldStatus: asset.status, newStatus: to, userName: who.performedBy, notes: detail || null, comment: reason });
    });
    await safeLog({ entityType: "asset", entityId: id, action: "transition", performedBy: who.performedBy, summary: `${asset.assetTag}: ${asset.status} → ${to}${reason ? ` (${reason})` : ""}`, context: buildContext(req, "Asset Lifecycle") });
    res.json({ ok: true, status: to });
  } catch (e) { handleError(res, e); }
});

/* ─── Handovers list, acknowledgement and employee views ─────────────────── */

const handoverCols = {
  id: assetAllocationsTable.id, handoverNo: assetAllocationsTable.handoverNo, assetId: assetAllocationsTable.assetId,
  userId: assetAllocationsTable.userId, userName: assetAllocationsTable.userName, email: assetAllocationsTable.email,
  employeeCode: assetAllocationsTable.employeeCode, designation: assetAllocationsTable.designation, department: assetAllocationsTable.department,
  location: assetAllocationsTable.location, startDate: assetAllocationsTable.startDate, endDate: assetAllocationsTable.endDate,
  status: assetAllocationsTable.status, allocationType: assetAllocationsTable.allocationType, expectedReturnDate: assetAllocationsTable.expectedReturnDate,
  issueCondition: assetAllocationsTable.issueCondition, accessories: assetAllocationsTable.accessories, issuedBy: assetAllocationsTable.issuedBy,
  ackStatus: assetAllocationsTable.ackStatus, ackAt: assetAllocationsTable.ackAt, ackBy: assetAllocationsTable.ackBy, ackMethod: assetAllocationsTable.ackMethod,
  returnCondition: assetAllocationsTable.returnCondition, returnAccessories: assetAllocationsTable.returnAccessories, returnRemarks: assetAllocationsTable.returnRemarks,
  receivedBy: assetAllocationsTable.receivedBy, returnedAt: assetAllocationsTable.returnedAt, notes: assetAllocationsTable.notes, createdAt: assetAllocationsTable.createdAt,
  assetTag: assetsTable.assetTag, assetName: assetsTable.name, assetType: assetsTable.type, serialNumber: assetsTable.serialNumber,
  configuration: assetsTable.configuration, assetStatus: assetsTable.status,
};

router.get("/asset-handovers", requireAuth, async (_req, res) => {
  try {
    const rows = await db.select(handoverCols).from(assetAllocationsTable)
      .leftJoin(assetsTable, eq(assetsTable.id, assetAllocationsTable.assetId))
      .orderBy(desc(assetAllocationsTable.createdAt));
    res.json(rows);
  } catch (e) { handleError(res, e); }
});

router.post("/asset-allocations/:id/acknowledge", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const who = await actor(req);
    const [al] = await db.update(assetAllocationsTable).set({ ackStatus: "Acknowledged", ackAt: new Date(), ackBy: who.name, ackMethod: s(req.body.method) || "Signed copy received" })
      .where(and(eq(assetAllocationsTable.id, id), eq(assetAllocationsTable.status, "Active"))).returning();
    if (!al) return fail(res, 404, "Active handover not found");
    await db.insert(assetTransactionsTable).values({ assetId: al.assetId, action: "Acknowledged", userName: who.performedBy, notes: `${al.handoverNo} · ${al.ackMethod}` });
    res.json(al);
  } catch (e) { handleError(res, e); }
});

async function myFilter(req: Request) {
  const userId = (req.session as any)?.userId as number;
  const [me] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  return sql`(${assetAllocationsTable.userId} = ${userId} OR lower(${assetAllocationsTable.email}) = lower(${me?.email ?? ""}))`;
}

// Every signed-in user can see what is issued to them (no asset-module permission needed)
router.get("/my-assets", requireAuth, async (req, res) => {
  try {
    const rows = await db.select(handoverCols).from(assetAllocationsTable)
      .leftJoin(assetsTable, eq(assetsTable.id, assetAllocationsTable.assetId))
      .where(await myFilter(req)).orderBy(desc(assetAllocationsTable.createdAt));
    res.json(rows);
  } catch (e) { handleError(res, e); }
});

router.post("/my-assets/:id/acknowledge", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const who = await actor(req);
    const [al] = await db.update(assetAllocationsTable).set({ ackStatus: "Acknowledged", ackAt: new Date(), ackBy: who.name, ackMethod: "Employee portal" })
      .where(and(eq(assetAllocationsTable.id, id), eq(assetAllocationsTable.status, "Active"), await myFilter(req))).returning();
    if (!al) return fail(res, 404, "This handover is not assigned to you or is no longer active");
    await db.insert(assetTransactionsTable).values({ assetId: al.assetId, action: "Acknowledged", userName: who.performedBy, notes: `${al.handoverNo} · acknowledged by employee` });
    await safeLog({ entityType: "asset_allocation", entityId: id, action: "acknowledge", performedBy: who.performedBy, summary: `${who.name} acknowledged handover ${al.handoverNo}`, context: buildContext(req, "My Assets") });
    res.json(al);
  } catch (e) { handleError(res, e); }
});

// Per-employee view: everyone who holds or has held an asset
router.get("/asset-holders", requireAuth, async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT coalesce(lower(nullif(email,'')), lower(user_name)) AS key,
             max(user_name) AS "userName", max(email) AS email, max(employee_code) AS "employeeCode",
             max(department) AS department, max(designation) AS designation,
             count(*) FILTER (WHERE status = 'Active')::int AS "activeCount",
             count(*) FILTER (WHERE status = 'Active' AND ack_status <> 'Acknowledged')::int AS "pendingAck",
             count(*) FILTER (WHERE status = 'Active' AND expected_return_date IS NOT NULL AND expected_return_date < to_char(now(), 'YYYY-MM-DD'))::int AS "overdue",
             count(*)::int AS "totalCount", max(created_at) AS "lastIssued"
      FROM asset_allocations GROUP BY 1 ORDER BY "activeCount" DESC, "userName"`);
    res.json((rows as any).rows ?? rows);
  } catch (e) { handleError(res, e); }
});

router.get("/asset-holders/assets", requireAuth, async (req, res) => {
  try {
    const key = String(req.query.key || "").toLowerCase();
    if (!key) return fail(res, 400, "key is required");
    const rows = await db.select(handoverCols).from(assetAllocationsTable)
      .leftJoin(assetsTable, eq(assetsTable.id, assetAllocationsTable.assetId))
      .where(sql`coalesce(lower(nullif(${assetAllocationsTable.email},'')), lower(${assetAllocationsTable.userName})) = ${key}`)
      .orderBy(desc(assetAllocationsTable.createdAt));
    res.json(rows);
  } catch (e) { handleError(res, e); }
});

export default router;
