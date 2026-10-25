import { Router, Request, Response } from "express";
import { db, assetsTable, assetAllocationsTable, assetTransactionsTable, usersTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy, buildContext } from "./audit-logs";
import { snapshotRegister, archiveAssetUpload } from "../lib/archive";
import { notify, htmlTable, sendDirect } from "../lib/mailer";
import { getLock, assertOpenDate, loadCarries, LockError } from "../lib/finance-controls";
import { resolveInput, accumulated } from "../lib/depreciation";
import { loadRules } from "./asset-finance";

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
function handleError(res: Response, e: unknown) { fail(res, e instanceof LockError ? 409 : 500, e instanceof Error ? e.message : String(e)); }

/** Book value on the disposal / write-off date and the profit (loss) against the sale value. Null when cost / purchase date are missing. */
async function disposalPL(asset: any, date: string, sale: number) {
  const { input } = resolveInput({ ...asset, disposalDate: date }, await loadRules(), await loadCarries());
  if (!input) return { bookValue: null as string | null, gainLoss: null as string | null };
  const book = Math.round((input.cost - accumulated(input, date)) * 100) / 100;
  return { bookValue: book.toFixed(2), gainLoss: (Math.round((sale - book) * 100) / 100).toFixed(2) };
}
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
  res.json({ states: ASSET_STATES, transitions: LIFECYCLE, actions: ACTION_LABEL, disposalMethods: DISPOSAL_METHODS, conditions: CONDITIONS, allocationTypes: ALLOCATION_TYPES, handoverIssues: HANDOVER_ISSUES });
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

// People who can hold assets = User Master (internal staff and external associates). Employee Code is the key.
router.get("/asset-people", requireAuth, async (_req, res) => {
  try {
    const rows = await db.select({
      id: usersTable.id, name: usersTable.name, email: usersTable.email, employeeCode: usersTable.employeeCode, userType: usersTable.userType,
      department: usersTable.department, designation: usersTable.designation,
    }).from(usersTable).where(eq(usersTable.isActive, true)).orderBy(usersTable.name);
    res.json(rows.map(r => ({ ...r, userType: r.userType === "external" ? "external" : "internal", selectable: !!(r.employeeCode && r.employeeCode.trim()) })));
  } catch (e) { handleError(res, e); }
});

/* ─── Issue (handover) ───────────────────────────────────────────────────── */

type Employee = { userId: number; userName: string; email: string | null; employeeCode: string; userType: string; designation?: string | null; department?: string | null; location?: string | null };

async function issueOne(tx: any, assetId: number, emp: Employee, h: any, who: { performedBy: string; name: string }) {
  const [asset] = await tx.select().from(assetsTable).where(and(eq(assetsTable.id, assetId), eq(assetsTable.isActive, true)));
  if (!asset) throw new Error(`Asset #${assetId} not found`);
  if (!canMove(asset.status, "Allocated")) throw new Error(`${asset.assetTag} is "${asset.status}" — only assets In Stock can be issued`);
  const [al] = await tx.insert(assetAllocationsTable).values({
    assetId, userId: emp.userId, userName: emp.userName, email: emp.email ?? null, employeeCode: emp.employeeCode, holderType: emp.userType,
    designation: emp.designation ?? null, department: emp.department ?? null, location: emp.location ?? asset.location ?? null,
    startDate: s(h.startDate) || today(), status: "Active", notes: s(h.notes),
    allocationType: s(h.allocationType) || "Permanent", expectedReturnDate: s(h.expectedReturnDate),
    issueCondition: s(h.condition) || "Good", accessories: s(h.accessories), issuedBy: who.name,
    ackStatus: "Pending", createdBy: who.performedBy,
  }).returning();
  const handoverNo = `HO-${new Date().getFullYear()}-${String(al.id).padStart(5, "0")}`;
  await tx.update(assetAllocationsTable).set({ handoverNo }).where(eq(assetAllocationsTable.id, al.id));
  await tx.update(assetsTable).set({
    status: "Allocated", ownerId: emp.userId, ownerName: emp.userName, ownerEmail: emp.email ?? null,
    ownerEmployeeCode: emp.employeeCode, department: emp.department ?? asset.department,
    location: emp.location ?? asset.location, updatedBy: who.performedBy, updatedAt: new Date(),
  }).where(eq(assetsTable.id, assetId));
  const holder = (n?: string | null, c?: string | null) => n ? `${n}${c ? ` (${c})` : ""}` : null;
  const moves = [
    { field: "holder", label: "Holder", from: holder(asset.ownerName, asset.ownerEmployeeCode), to: `${emp.userName} (${emp.employeeCode}, ${emp.userType === "external" ? "External" : "Internal"})` },
    ...((emp.location ?? asset.location) !== asset.location ? [{ field: "location", label: "Location", from: asset.location, to: emp.location ?? asset.location }] : []),
    ...((emp.department ?? asset.department) !== asset.department ? [{ field: "department", label: "Department", from: asset.department, to: emp.department ?? asset.department }] : []),
  ];
  await tx.insert(assetTransactionsTable).values({
    assetId, action: "Issued", oldStatus: asset.status, newStatus: "Allocated", userName: who.performedBy, comment: s(h.notes), changes: moves,
    notes: `${handoverNo} · to ${emp.userName} (${emp.employeeCode}, ${emp.userType}) · ${s(h.allocationType) || "Permanent"} · condition ${s(h.condition) || "Good"}${s(h.accessories) ? ` · accessories: ${s(h.accessories)}` : ""}`,
  });
  return { ...al, handoverNo, assetTag: asset.assetTag };
}

/**
 * Resolve the holder from User Master. The UI sends the selected user's id (and/or employee code); name, email,
 * employee code and internal/external type always come from User Master, never from free text.
 */
export async function resolveHolder(q: { userId?: unknown; employeeCode?: unknown }): Promise<Employee | string> {
  const id = Number(q.userId) || null, code = s(q.employeeCode);
  if (!id && !code) return "Select the employee (from User Master)";
  const [u] = await db.select().from(usersTable).where(id ? eq(usersTable.id, id) : sql`lower(${usersTable.employeeCode}) = lower(${code})`);
  if (!u) return code ? `Employee code "${code}" is not in User Master — add the person (internal or external) first` : "Employee not found in User Master";
  if (!u.isActive) return `${u.name} (${u.employeeCode || u.email}) is inactive in User Master`;
  if (!u.employeeCode) return `${u.name} has no Employee Code in User Master — add it before issuing assets`;
  if (code && u.employeeCode.toLowerCase() !== code.toLowerCase()) return `Employee code ${code} does not belong to ${u.name}`;
  let department = u.department;
  if (department) {   // User Master stores the department master key; handovers show its label
    const r: any = await db.execute(sql`SELECT label FROM masters WHERE category = 'department' AND (key = ${department} OR lower(label) = lower(${department})) LIMIT 1`);
    department = (r.rows ?? r)[0]?.label ?? department;
  }
  return { userId: u.id, userName: u.name, email: u.email, employeeCode: u.employeeCode, userType: u.userType === "external" ? "external" : "internal", designation: u.designation, department };
}

async function readEmployee(body: any): Promise<Employee | string> {
  if (s(body.allocationType) && !ALLOCATION_TYPES.includes(body.allocationType)) return `Allocation type must be one of ${ALLOCATION_TYPES.join(", ")}`;
  if (s(body.condition) && !CONDITIONS.includes(body.condition)) return `Condition must be one of ${CONDITIONS.join(", ")}`;
  if (s(body.allocationType) && body.allocationType !== "Permanent" && !s(body.expectedReturnDate)) return "Expected return date is required for temporary / loaner issues";
  const emp = await resolveHolder(body);
  if (typeof emp === "string") return emp;
  return { ...emp, department: s(body.department) || emp.department, designation: s(body.designation) || emp.designation, location: s(body.location) };
}

router.post("/assets/:id/issue", requireAuth, async (req, res) => {
  try {
    const emp = await readEmployee(req.body);
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
    const emp = await readEmployee(req.body);
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
        changes: [{ field: "holder", label: "Holder", from: `${al?.userName ?? asset.ownerName ?? "—"}${(al?.employeeCode ?? asset.ownerEmployeeCode) ? ` (${al?.employeeCode ?? asset.ownerEmployeeCode})` : ""}`, to: `IT store (${next})` },
          ...(s(req.body.location) && s(req.body.location) !== asset.location ? [{ field: "location", label: "Location", from: asset.location, to: s(req.body.location) }] : [])],
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
      if (val && Number(val) < 0) return fail(res, 400, "Disposal value cannot be negative");
      const date = s(req.body.disposalDate) || today();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) return fail(res, 400, "Disposal date must be a valid date, not in the future");
      if (asset.purchaseDate && date < asset.purchaseDate) return fail(res, 400, `Disposal date is before the purchase date (${asset.purchaseDate})`);
      await assertOpenDate(date, "Disposal date");
      const pl = await disposalPL(asset, date, val ? Number(val) : 0);
      Object.assign(patch, { disposalDate: date, disposalMethod: method, disposalReference: s(req.body.disposalReference), disposalValue: val ? Number(val).toFixed(2) : null, disposalBookValue: pl.bookValue, disposalGainLoss: pl.gainLoss });
    }
    if (to === "Lost / Stolen") {
      // Write-off: depreciation stops and the remaining book value is a loss (less any insurance claim recorded later)
      const date = today();
      await assertOpenDate(date, "Write-off date");
      const pl = await disposalPL(asset, date, 0);
      Object.assign(patch, { disposalDate: date, disposalMethod: "Write-off (lost / stolen)", disposalReference: reason, disposalValue: null, disposalBookValue: pl.bookValue, disposalGainLoss: pl.gainLoss });
    }
    if (asset.status === "Lost / Stolen" && to !== "Disposed" && to !== "Lost / Stolen") {
      // Found again: reverse the write-off (only while its year is open)
      if (asset.disposalDate) {
        const lock = await getLock();
        if (lock && asset.disposalDate <= lock.lockDate) return fail(res, 409, `The write-off on ${asset.disposalDate} is in ${lock.label}, which is closed — ask Finance to reopen the year, or register the found asset again.`);
      }
      Object.assign(patch, { disposalDate: null, disposalMethod: null, disposalReference: null, disposalValue: null, disposalBookValue: null, disposalGainLoss: null });
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
      const moved = (patch as any).location && (patch as any).location !== asset.location ? [{ field: "location", label: "Location", from: asset.location, to: (patch as any).location }] : [];
      const disp = to === "Disposed" || to === "Lost / Stolen" ? [{ field: "disposal", label: to === "Disposed" ? "Disposal" : "Write-off", from: null, to: [(patch as any).disposalMethod, to === "Disposed" ? (patch as any).disposalReference : null, (patch as any).disposalValue ? `sale ₹${(patch as any).disposalValue}` : null,
        (patch as any).disposalBookValue !== null && (patch as any).disposalBookValue !== undefined ? `book value ₹${(patch as any).disposalBookValue}` : null,
        (patch as any).disposalGainLoss !== null && (patch as any).disposalGainLoss !== undefined ? `${Number((patch as any).disposalGainLoss) >= 0 ? "profit" : "loss"} ₹${Math.abs(Number((patch as any).disposalGainLoss))}` : null].filter(Boolean).join(" · ") }] : [];
      await tx.insert(assetTransactionsTable).values({ assetId: id, action, oldStatus: asset.status, newStatus: to, userName: who.performedBy, notes: detail || null, comment: reason, changes: [...moved, ...disp].length ? [...moved, ...disp] : null });
    });
    await safeLog({ entityType: "asset", entityId: id, action: "transition", performedBy: who.performedBy, summary: `${asset.assetTag}: ${asset.status} → ${to}${reason ? ` (${reason})` : ""}`, context: buildContext(req, "Asset Lifecycle") });
    if (to === "Disposed" || to === "Lost / Stolen") void notify("asset_disposed", { subject: `${asset.assetTag} ${to === "Disposed" ? "disposed" : "reported lost / stolen"} — ${asset.name}`,
      html: `<p>An asset left the active register.</p>${htmlTable([["Asset", `${asset.assetTag} — ${asset.name}`], ["Serial", asset.serialNumber || "—"], ["Status", `${asset.status} → ${to}`], ["Last holder", asset.ownerName ? `${asset.ownerName} (${asset.ownerEmployeeCode || "—"})` : "—"], ["Reason", reason || "—"], ["Disposal method", (patch as any).disposalMethod || "—"], ["Certificate / ref", s(req.body.disposalReference) || "—"], ["Book value", (patch as any).disposalBookValue != null ? `₹${(patch as any).disposalBookValue}` : "—"], ["Sale value", (patch as any).disposalValue ? `₹${(patch as any).disposalValue}` : "—"], ["Profit / (loss)", (patch as any).disposalGainLoss != null ? `₹${(patch as any).disposalGainLoss}` : "—"], ["By", who.performedBy]])}` });
    res.json({ ok: true, status: to });
  } catch (e) { handleError(res, e); }
});

/* ─── Handovers list, acknowledgement and employee views ─────────────────── */

const handoverCols = {
  id: assetAllocationsTable.id, handoverNo: assetAllocationsTable.handoverNo, assetId: assetAllocationsTable.assetId,
  userId: assetAllocationsTable.userId, userName: assetAllocationsTable.userName, email: assetAllocationsTable.email,
  employeeCode: assetAllocationsTable.employeeCode, holderType: assetAllocationsTable.holderType, designation: assetAllocationsTable.designation, department: assetAllocationsTable.department,
  location: assetAllocationsTable.location, startDate: assetAllocationsTable.startDate, endDate: assetAllocationsTable.endDate,
  status: assetAllocationsTable.status, allocationType: assetAllocationsTable.allocationType, expectedReturnDate: assetAllocationsTable.expectedReturnDate,
  issueCondition: assetAllocationsTable.issueCondition, accessories: assetAllocationsTable.accessories, issuedBy: assetAllocationsTable.issuedBy,
  ackStatus: assetAllocationsTable.ackStatus, ackAt: assetAllocationsTable.ackAt, ackBy: assetAllocationsTable.ackBy, ackMethod: assetAllocationsTable.ackMethod,
  returnCondition: assetAllocationsTable.returnCondition, returnAccessories: assetAllocationsTable.returnAccessories, returnRemarks: assetAllocationsTable.returnRemarks,
  receivedBy: assetAllocationsTable.receivedBy, returnedAt: assetAllocationsTable.returnedAt,
  disputeReason: assetAllocationsTable.disputeReason, disputeNote: assetAllocationsTable.disputeNote, disputedAt: assetAllocationsTable.disputedAt, disputeCount: assetAllocationsTable.disputeCount,
  disputeResolution: assetAllocationsTable.disputeResolution, disputeResolvedBy: assetAllocationsTable.disputeResolvedBy, disputeResolvedAt: assetAllocationsTable.disputeResolvedAt, notes: assetAllocationsTable.notes, createdAt: assetAllocationsTable.createdAt,
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
    const [cur] = await db.select({ ackStatus: assetAllocationsTable.ackStatus }).from(assetAllocationsTable).where(eq(assetAllocationsTable.id, id));
    if (cur?.ackStatus === ISSUE) return fail(res, 400, "The employee reported a problem with this handover — resolve it first (Resolve issue).");
    const [al] = await db.update(assetAllocationsTable).set({ ackStatus: "Acknowledged", ackAt: new Date(), ackBy: who.name, ackMethod: s(req.body.method) || "Signed copy received" })
      .where(and(eq(assetAllocationsTable.id, id), eq(assetAllocationsTable.status, "Active"))).returning();
    if (!al) return fail(res, 404, "Active handover not found");
    await db.insert(assetTransactionsTable).values({ assetId: al.assetId, action: "Acknowledged", userName: who.performedBy, notes: `${al.handoverNo} · ${al.ackMethod}` });
    res.json(al);
  } catch (e) { handleError(res, e); }
});

async function myFilter(req: Request) {
  const userId = (req.session as any)?.userId as number;
  const [me] = await db.select({ email: usersTable.email, code: usersTable.employeeCode }).from(usersTable).where(eq(usersTable.id, userId));
  // Strictly the signed-in person's own handovers — no role (not even admin) widens this
  return sql`(${assetAllocationsTable.userId} = ${userId} OR (${me?.email ?? null}::text IS NOT NULL AND lower(${assetAllocationsTable.email}) = lower(${me?.email ?? ""})) OR (${me?.code ?? null}::text IS NOT NULL AND lower(${assetAllocationsTable.employeeCode}) = lower(${me?.code ?? ""})))`;
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
      .where(and(eq(assetAllocationsTable.id, id), eq(assetAllocationsTable.status, "Active"), eq(assetAllocationsTable.ackStatus, "Pending"), await myFilter(req))).returning();
    if (!al) return fail(res, 404, "This handover is not assigned to you or is no longer active");
    await db.insert(assetTransactionsTable).values({ assetId: al.assetId, action: "Acknowledged", userName: who.performedBy, notes: `${al.handoverNo} · acknowledged by employee` });
    await safeLog({ entityType: "asset_allocation", entityId: id, action: "acknowledge", performedBy: who.performedBy, summary: `${who.name} acknowledged handover ${al.handoverNo}`, context: buildContext(req, "My Assets") });
    res.json(al);
  } catch (e) { handleError(res, e); }
});

/* ─── Employee sends a handover back to IT (wrong asset, damaged, missing accessories…) ─── */

export const ISSUE = "Issue reported";
export const HANDOVER_ISSUES = ["Wrong asset (tag / serial does not match)", "Damaged or faulty", "Accessories missing", "Not received", "Other"];

router.post("/my-assets/:id/report-issue", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reason = s(req.body.reason), note = s(req.body.note);
    if (!reason || !HANDOVER_ISSUES.includes(reason)) return fail(res, 400, `Choose what is wrong (${HANDOVER_ISSUES.join(" / ")})`);
    if (!note || note.length < 5) return fail(res, 400, "Describe the problem (at least 5 characters) so IT can fix it");
    const who = await actor(req);
    const [al] = await db.update(assetAllocationsTable).set({ ackStatus: ISSUE, disputeReason: reason, disputeNote: note, disputedAt: new Date(), disputeCount: sql`${assetAllocationsTable.disputeCount} + 1`, disputeResolution: null, disputeResolvedBy: null, disputeResolvedAt: null })
      .where(and(eq(assetAllocationsTable.id, id), eq(assetAllocationsTable.status, "Active"), eq(assetAllocationsTable.ackStatus, "Pending"), await myFilter(req))).returning();
    if (!al) return fail(res, 404, "This handover is not yours, is no longer active, or was already acknowledged / reported");
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, al.assetId));
    await db.insert(assetTransactionsTable).values({ assetId: al.assetId, action: "Issue Reported", userName: who.performedBy, comment: note, notes: `${al.handoverNo} · ${reason}`,
      changes: [{ field: "ackStatus", label: "Acknowledgement", from: "Pending", to: `Issue reported — ${reason}` }] });
    await safeLog({ entityType: "asset_allocation", entityId: id, action: "report_issue", performedBy: who.performedBy, summary: `${who.name} sent handover ${al.handoverNo} back to IT: ${reason} — ${note}`, context: buildContext(req, "My Assets") });
    void notify("asset_handover_issue", { subject: `${al.handoverNo} sent back by ${al.userName}: ${reason}`,
      html: `<p><b>${al.userName}</b> did not acknowledge an issued asset and reported a problem. Resolve it in IT Hub › Handovers (tab "Issues reported").</p>${htmlTable([["Handover", al.handoverNo], ["Asset", `${asset?.assetTag} — ${asset?.name}`], ["Serial", asset?.serialNumber || "—"], ["Employee", `${al.userName} (${al.employeeCode || "—"})`], ["Problem", reason], ["Details", note], ["Times reported", al.disputeCount]])}` });
    res.json(al);
  } catch (e) { handleError(res, e); }
});

/** IT resolves the reported problem and sends the handover back to the employee to acknowledge again. */
router.post("/asset-allocations/:id/resolve-issue", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const resolution = s(req.body.resolution);
    if (!resolution || resolution.length < 5) return fail(res, 400, "Describe what was done (at least 5 characters) — the employee sees this");
    const who = await actor(req);
    const [al] = await db.update(assetAllocationsTable).set({ ackStatus: "Pending", disputeResolution: resolution, disputeResolvedBy: who.name, disputeResolvedAt: new Date() })
      .where(and(eq(assetAllocationsTable.id, id), eq(assetAllocationsTable.status, "Active"), eq(assetAllocationsTable.ackStatus, ISSUE))).returning();
    if (!al) return fail(res, 404, "No open issue on this handover");
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, al.assetId));
    await db.insert(assetTransactionsTable).values({ assetId: al.assetId, action: "Issue Resolved", userName: who.performedBy, comment: resolution, notes: `${al.handoverNo} · sent back to ${al.userName} to acknowledge`,
      changes: [{ field: "ackStatus", label: "Acknowledgement", from: `Issue reported — ${al.disputeReason}`, to: "Pending (re-review)" }] });
    await safeLog({ entityType: "asset_allocation", entityId: id, action: "resolve_issue", performedBy: who.performedBy, summary: `Issue on ${al.handoverNo} resolved: ${resolution}`, context: buildContext(req, "Handovers") });
    if (al.email) void sendDirect("asset_handover_issue_resolved", [al.email], `Your IT asset ${asset?.assetTag} — please review and acknowledge again`,
      `<p>Dear ${al.userName},</p><p>IT has looked into the problem you reported on handover <b>${al.handoverNo}</b>.</p>${htmlTable([["Asset", `${asset?.assetTag} — ${asset?.name}`], ["Serial", asset?.serialNumber || "—"], ["You reported", `${al.disputeReason}: ${al.disputeNote}`], ["IT's resolution", resolution], ["Resolved by", who.name]])}<p>Please open <b>IT Hub › My Assets</b> and acknowledge the asset, or report the problem again if it is still not right.</p><p>Regards,</p>`);
    res.json(al);
  } catch (e) { handleError(res, e); }
});

/*
 * Bulk (re)assignment by Excel: Asset Tag + Employee Code per row. Validated first (dry run), then applied in one
 * transaction. An asset already held by someone else is returned from them and issued to the new holder; an asset
 * already with the same employee code is left as is. Employees must exist in User Master (internal or external).
 */
router.post("/asset-handovers/bulk-assign", requireAuth, async (req, res) => {
  try {
    const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const dryRun = req.body?.dryRun !== false;
    if (!rows.length) return fail(res, 400, "The file has no rows.");
    if (rows.length > 3000) return fail(res, 400, "Maximum 3,000 rows per upload.");
    const errors: { row: number; field: string; message: string }[] = [];
    const plan: { row: number; asset: any; emp: Employee; h: any; action: "Issue" | "Reassign" | "Unchanged"; from?: string }[] = [];
    const seen = new Set<string>();
    const people = new Map<string, Employee | string>();
    for (const [i, raw] of rows.entries()) {
      const row = Number(raw?.__row) || i + 2;
      const err = (field: string, message: string) => { errors.push({ row, field, message }); };
      const tag = s(raw.assetTag), code = s(raw.employeeCode);
      if (!tag) { err("Asset Tag", "Required"); continue; }
      if (!code) { err("Employee Code", "Required"); continue; }
      if (seen.has(tag.toLowerCase())) { err("Asset Tag", `${tag} appears more than once`); continue; }
      seen.add(tag.toLowerCase());
      const [asset] = await db.select().from(assetsTable).where(and(sql`lower(${assetsTable.assetTag}) = lower(${tag})`, eq(assetsTable.isActive, true)));
      if (!asset) { err("Asset Tag", `"${tag}" not found`); continue; }
      if (!["In Stock", "In Use", "Allocated"].includes(asset.status)) { err("Asset Tag", `${tag} is "${asset.status}" — only In Stock, In Use or Allocated assets can be assigned`); continue; }
      const key = code.toLowerCase();
      if (!people.has(key)) people.set(key, await resolveHolder({ employeeCode: code }));
      const emp = people.get(key)!;
      if (typeof emp === "string") { err("Employee Code", emp); continue; }
      const type = s(raw.allocationType) || "Permanent";
      if (!ALLOCATION_TYPES.includes(type)) { err("Allocation Type", `Use one of: ${ALLOCATION_TYPES.join(", ")}`); continue; }
      const cond = s(raw.condition) || "Good";
      if (!CONDITIONS.includes(cond)) { err("Condition", `Use one of: ${CONDITIONS.join(", ")}`); continue; }
      for (const f of ["startDate", "expectedReturnDate"]) if (s(raw[f]) && !/^\d{4}-\d{2}-\d{2}$/.test(raw[f])) err(f === "startDate" ? "Issue Date" : "Expected Return", `"${raw[f]}" must be YYYY-MM-DD`);
      if (type !== "Permanent" && !s(raw.expectedReturnDate)) { err("Expected Return", "Required for temporary / loaner"); continue; }
      const same = asset.status === "Allocated" && (asset.ownerEmployeeCode || "").toLowerCase() === emp.employeeCode.toLowerCase();
      plan.push({ row, asset, emp: { ...emp, location: s(raw.location) }, action: same ? "Unchanged" : asset.status === "Allocated" ? "Reassign" : "Issue",
        from: asset.status === "Allocated" ? `${asset.ownerName || "—"}${asset.ownerEmployeeCode ? ` (${asset.ownerEmployeeCode})` : ""}` : undefined,
        h: { allocationType: type, condition: cond, startDate: s(raw.startDate), expectedReturnDate: s(raw.expectedReturnDate), accessories: s(raw.accessories), notes: s(raw.remarks) || "Bulk assignment upload" } });
    }
    const summary = { total: rows.length, issue: plan.filter(p => p.action === "Issue").length, reassign: plan.filter(p => p.action === "Reassign").length,
      unchanged: plan.filter(p => p.action === "Unchanged").length, errors,
      preview: plan.filter(p => p.action !== "Unchanged").slice(0, 12).map(p => ({ assetTag: p.asset.assetTag, action: p.action, from: p.from, to: `${p.emp.userName} (${p.emp.employeeCode}, ${p.emp.userType})` })) };
    if (dryRun || errors.length) return void res.json({ ...summary, applied: 0, dryRun: true });
    const who = await actor(req);
    const before = await snapshotRegister();
    const done = await db.transaction(async tx => {
      let n = 0;
      for (const p of plan) {
        if (p.action === "Unchanged") continue;
        if (p.asset.status !== "In Stock") {
          if (p.asset.status === "Allocated") {
            const [al] = await tx.select().from(assetAllocationsTable).where(and(eq(assetAllocationsTable.assetId, p.asset.id), eq(assetAllocationsTable.status, "Active")));
            if (al) await tx.update(assetAllocationsTable).set({ status: "Returned", endDate: today(), returnCondition: p.h.condition, returnRemarks: `Reassigned to ${p.emp.employeeCode} via upload`, receivedBy: who.name, returnedAt: new Date() }).where(eq(assetAllocationsTable.id, al.id));
            await tx.insert(assetTransactionsTable).values({ assetId: p.asset.id, action: "Returned", oldStatus: "Allocated", newStatus: "In Stock", userName: who.performedBy, notes: `${al?.handoverNo ?? ""} · from ${p.from} · reassigned via upload`,
              changes: [{ field: "holder", label: "Holder", from: p.from ?? null, to: "IT store (reassignment)" }] });
          }
          await tx.update(assetsTable).set({ status: "In Stock", ownerId: null, ownerName: null, ownerEmail: null, ownerEmployeeCode: null }).where(eq(assetsTable.id, p.asset.id));
        }
        await issueOne(tx, p.asset.id, p.emp, p.h, who); n++;
      }
      return n;
    });
    await safeLog({ entityType: "asset_allocation", action: "bulk_assign", performedBy: who.performedBy, summary: `Bulk assignment upload: ${summary.issue} issued, ${summary.reassign} reassigned`, context: buildContext(req, "Handovers") });
    const archiveBatch = await archiveAssetUpload({ kind: "asset_bulk_assign", fileName: s(req.body?.fileName), uploaded: rows, before, by: who.performedBy, summary: { issued: summary.issue, reassigned: summary.reassign, unchanged: summary.unchanged } });
    res.json({ ...summary, applied: done, dryRun: false, archiveBatch });
  } catch (e) { handleError(res, e); }
});

// Per-employee view: everyone who holds or has held an asset
router.get("/asset-holders", requireAuth, async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT coalesce(lower(nullif(a.employee_code,'')), lower(nullif(a.email,'')), lower(a.user_name)) AS key,
             max(coalesce(u.name, a.user_name)) AS "userName", max(coalesce(u.email, a.email)) AS email, max(coalesce(u.employee_code, a.employee_code)) AS "employeeCode",
             max(coalesce(u.user_type, a.holder_type)) AS "userType", bool_or(coalesce(u.is_active, true)) AS "userActive",
             max(coalesce(a.department, u.department)) AS department, max(coalesce(a.designation, u.designation)) AS designation,
             count(*) FILTER (WHERE a.status = 'Active')::int AS "activeCount",
             count(*) FILTER (WHERE a.status = 'Active' AND a.ack_status <> 'Acknowledged')::int AS "pendingAck",
             count(*) FILTER (WHERE a.status = 'Active' AND a.expected_return_date IS NOT NULL AND a.expected_return_date < to_char(now(), 'YYYY-MM-DD'))::int AS "overdue",
             count(*)::int AS "totalCount", max(a.created_at) AS "lastIssued"
      FROM asset_allocations a LEFT JOIN users u ON u.id = a.user_id OR (a.user_id IS NULL AND lower(u.employee_code) = lower(a.employee_code))
      GROUP BY 1 ORDER BY "activeCount" DESC, "userName"`);
    res.json((rows as any).rows ?? rows);
  } catch (e) { handleError(res, e); }
});

router.get("/asset-holders/assets", requireAuth, async (req, res) => {
  try {
    const key = String(req.query.key || "").toLowerCase();
    if (!key) return fail(res, 400, "key is required");
    const rows = await db.select(handoverCols).from(assetAllocationsTable)
      .leftJoin(assetsTable, eq(assetsTable.id, assetAllocationsTable.assetId))
      .where(sql`coalesce(lower(nullif(${assetAllocationsTable.employeeCode},'')), lower(nullif(${assetAllocationsTable.email},'')), lower(${assetAllocationsTable.userName})) = ${key}`)
      .orderBy(desc(assetAllocationsTable.createdAt));
    res.json(rows);
  } catch (e) { handleError(res, e); }
});

export default router;
