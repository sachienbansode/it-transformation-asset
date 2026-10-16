import { Router, Request, Response } from "express";
import {
  db, assetsTable, assetTransactionsTable, assetVendorsTable, assetLicensesTable, assetLicenseAssignmentsTable,
  assetDepreciationRulesTable, assetContractsTable, assetContractAssetsTable, usersTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy, buildContext } from "./audit-logs";
import { DATE_RE, DepRule, resolveInput, schedule, accumulated, registerLine, fyOf, fyLabel, fyStart, fyEnd, today } from "../lib/depreciation";

/*
 * Asset finance: contracts / AMC / extended warranty, warranty tracking, depreciation (Schedule II, Indian FY)
 * and the finance-data upload (purchase date, cost, PO, invoice, warranty) that fills those in for existing assets.
 */

const router = Router();
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const handleError = (res: Response, e: unknown) => fail(res, 500, e instanceof Error ? e.message : String(e));
const s = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
async function safeLog(p: Parameters<typeof logAudit>[0]) { try { await logAudit(p); } catch { /* non-fatal */ } }
async function who(req: Request) {
  const userId = (req.session as any)?.userId as number | undefined;
  const performedBy = await getPerformedBy(userId).catch(() => "System");
  let name = "System";
  if (userId) { const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)); name = u?.name || name; }
  return { performedBy, name, userId: userId ?? null };
}
const daysBetween = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);
const GONE = ["Disposed", "Lost / Stolen"];

export const CONTRACT_TYPES = ["Comprehensive AMC", "Non-comprehensive AMC", "Extended Warranty", "Support & Subscription", "Lease / Rental", "Insurance"];
export const BILLING_CYCLES = ["One-time", "Monthly", "Quarterly", "Half-yearly", "Annual", "Multi-year"];

/** Display status for a contract: Draft / Renewed / Terminated as stored; otherwise derived from the dates. */
export function contractState(c: { status: string; startDate: string; endDate: string; renewalNoticeDays: number }, on = today()) {
  if (["Draft", "Renewed", "Terminated"].includes(c.status)) return { state: c.status, daysLeft: daysBetween(on, c.endDate) };
  const daysLeft = daysBetween(on, c.endDate);
  if (daysLeft < 0) return { state: "Expired", daysLeft };
  if (c.startDate > on) return { state: "Upcoming", daysLeft };
  if (daysLeft <= (c.renewalNoticeDays ?? 30)) return { state: "Expiring", daysLeft };
  return { state: "Active", daysLeft };
}
/** Does the contract cover assets on this date? (a renewed contract keeps covering until its own end date) */
export const coversOn = (c: { status: string; startDate: string; endDate: string }, on = today()) => !["Draft", "Terminated"].includes(c.status) && c.startDate <= on && c.endDate >= on;

export async function loadRules() {
  const rows = await db.select().from(assetDepreciationRulesTable);
  return new Map<string, DepRule>(rows.map(r => [r.assetType.toLowerCase(), r as any]));
}

async function trail(tx: any, assetIds: number[], action: string, comment: string, userName: string) {
  if (!assetIds.length) return;
  for (let i = 0; i < assetIds.length; i += 500)
    await tx.insert(assetTransactionsTable).values(assetIds.slice(i, i + 500).map(assetId => ({ assetId, action, userName, comment, notes: comment })));
}

/* ═══ CONTRACTS / AMC ═══════════════════════════════════════════════════════ */

router.get("/asset-contracts/options", requireAuth, (_req, res) => { res.json({ types: CONTRACT_TYPES, billingCycles: BILLING_CYCLES }); });

router.get("/asset-contracts", requireAuth, async (_req, res) => {
  try {
    const rows = await db.select().from(assetContractsTable).where(eq(assetContractsTable.isActive, true)).orderBy(assetContractsTable.endDate);
    const counts = await db.select({ contractId: assetContractAssetsTable.contractId, n: sql<number>`count(*)::int` }).from(assetContractAssetsTable).groupBy(assetContractAssetsTable.contractId);
    const byId = new Map(counts.map(c => [c.contractId, c.n]));
    res.json(rows.map(c => ({ ...c, ...contractState(c), assetCount: byId.get(c.id) || 0 })));
  } catch (e) { handleError(res, e); }
});

router.get("/asset-contracts/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [c] = await db.select().from(assetContractsTable).where(eq(assetContractsTable.id, id));
    if (!c || !c.isActive) return fail(res, 404, "Contract not found");
    const assets = await db.select({
      id: assetsTable.id, assetTag: assetsTable.assetTag, name: assetsTable.name, type: assetsTable.type, serialNumber: assetsTable.serialNumber,
      status: assetsTable.status, location: assetsTable.location, ownerName: assetsTable.ownerName, warrantyExpiry: assetsTable.warrantyExpiry, addedAt: assetContractAssetsTable.addedAt,
    }).from(assetContractAssetsTable).innerJoin(assetsTable, eq(assetsTable.id, assetContractAssetsTable.assetId))
      .where(eq(assetContractAssetsTable.contractId, id)).orderBy(assetsTable.assetTag);
    const chain = await db.select({ id: assetContractsTable.id, contractNo: assetContractsTable.contractNo, startDate: assetContractsTable.startDate, endDate: assetContractsTable.endDate, status: assetContractsTable.status, renewedFromId: assetContractsTable.renewedFromId })
      .from(assetContractsTable).where(and(eq(assetContractsTable.isActive, true), sql`(${assetContractsTable.id} = ${c.renewedFromId ?? -1} OR ${assetContractsTable.renewedFromId} = ${id})`));
    res.json({ ...c, ...contractState(c), assets, renewedFrom: chain.find(x => x.id === c.renewedFromId) || null, renewedTo: chain.find(x => x.renewedFromId === id) || null });
  } catch (e) { handleError(res, e); }
});

function validateContract(b: any, partial = false): string | null {
  if (!partial || b.title !== undefined) if (!s(b.title)) return "Contract title is required";
  if (!partial || b.contractType !== undefined) if (!s(b.contractType)) return "Contract type is required";
  for (const f of ["startDate", "endDate"]) if (!partial || b[f] !== undefined) if (!s(b[f]) || !DATE_RE.test(b[f])) return `${f === "startDate" ? "Start" : "End"} date is required (YYYY-MM-DD)`;
  if (b.startDate && b.endDate && b.endDate < b.startDate) return "End date cannot be before the start date";
  if (b.value !== undefined && b.value !== null && b.value !== "" && !(Number(b.value) >= 0)) return "Contract value must be a positive number";
  return null;
}
const CONTRACT_FIELDS = ["title", "contractType", "vendorName", "startDate", "endDate", "value", "billingCycle", "coverage", "slaTerms", "renewalNoticeDays", "autoRenew",
  "poNumber", "vendorContact", "vendorEmail", "vendorPhone", "ownerName", "status", "notes"] as const;
function pickContract(b: any) {
  const o: any = {};
  for (const f of CONTRACT_FIELDS) if (b[f] !== undefined) o[f] = typeof b[f] === "string" ? s(b[f]) : b[f];
  if (o.value !== undefined) o.value = o.value === null ? null : Number(o.value).toFixed(2);
  if (o.renewalNoticeDays !== undefined) o.renewalNoticeDays = Math.max(0, parseInt(o.renewalNoticeDays) || 30);
  if (o.autoRenew !== undefined) o.autoRenew = !!o.autoRenew;
  if (o.status !== undefined && !["Draft", "Active", "Terminated", "Renewed"].includes(o.status)) o.status = "Active";
  return o;
}
async function vendorIdFor(name: string | null) {
  if (!name) return null;
  const [v] = await db.select({ id: assetVendorsTable.id }).from(assetVendorsTable).where(and(eq(assetVendorsTable.isActive, true), sql`lower(${assetVendorsTable.name}) = lower(${name})`));
  return v?.id ?? null;
}
async function addAssets(tx: any, c: { id: number; contractNo: string; contractType: string; endDate: string }, assetIds: number[], userName: string) {
  const ids = [...new Set(assetIds.map(Number).filter(Boolean))];
  if (!ids.length) return 0;
  const existing = await tx.select({ assetId: assetContractAssetsTable.assetId }).from(assetContractAssetsTable).where(and(eq(assetContractAssetsTable.contractId, c.id), inArray(assetContractAssetsTable.assetId, ids)));
  const have = new Set(existing.map((x: any) => x.assetId));
  const valid = await tx.select({ id: assetsTable.id }).from(assetsTable).where(and(inArray(assetsTable.id, ids), eq(assetsTable.isActive, true)));
  const add = valid.map((v: any) => v.id).filter((id: number) => !have.has(id));
  if (!add.length) return 0;
  await tx.insert(assetContractAssetsTable).values(add.map((assetId: number) => ({ contractId: c.id, assetId, addedBy: userName })));
  await trail(tx, add, "Contract", `Covered by ${c.contractType} ${c.contractNo} (valid till ${c.endDate})`, userName);
  return add.length;
}

router.post("/asset-contracts", requireAuth, async (req, res) => {
  try {
    const err = validateContract(req.body); if (err) return fail(res, 400, err);
    const u = await who(req);
    const data = pickContract(req.body);
    const out = await db.transaction(async tx => {
      const [c] = await tx.insert(assetContractsTable).values({ ...data, contractNo: `TMP-${Date.now()}`, vendorId: await vendorIdFor(data.vendorName), status: data.status || "Active", createdBy: u.performedBy, updatedBy: u.performedBy }).returning();
      const contractNo = s(req.body.contractNo) || `CT-${c.startDate.slice(0, 4)}-${String(c.id).padStart(4, "0")}`;
      const [dup] = await tx.select({ id: assetContractsTable.id }).from(assetContractsTable).where(and(eq(assetContractsTable.contractNo, contractNo), sql`${assetContractsTable.id} <> ${c.id}`));
      if (dup) throw Object.assign(new Error(`Contract number "${contractNo}" already exists`), { status: 400 });
      const [c2] = await tx.update(assetContractsTable).set({ contractNo }).where(eq(assetContractsTable.id, c.id)).returning();
      const added = await addAssets(tx, c2, req.body.assetIds || [], u.name);
      return { ...c2, added };
    });
    await safeLog({ entityType: "asset_contract", entityId: out.id, action: "create", performedBy: u.performedBy, summary: `Created ${out.contractType} ${out.contractNo} — ${out.title} (${out.added} assets)`, newValues: out, context: buildContext(req, "Contracts & AMC") });
    res.status(201).json(out);
  } catch (e: any) { e?.status === 400 ? fail(res, 400, e.message) : handleError(res, e); }
});

router.patch("/asset-contracts/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(assetContractsTable).where(eq(assetContractsTable.id, id));
    if (!old || !old.isActive) return fail(res, 404, "Contract not found");
    const merged = { ...old, ...req.body };
    const err = validateContract(merged); if (err) return fail(res, 400, err);
    const u = await who(req);
    const data = pickContract(req.body);
    if (data.vendorName !== undefined) (data as any).vendorId = await vendorIdFor(data.vendorName);
    const [c] = await db.update(assetContractsTable).set({ ...data, updatedBy: u.performedBy, updatedAt: new Date() }).where(eq(assetContractsTable.id, id)).returning();
    if (old.endDate !== c.endDate) {
      const ids = (await db.select({ a: assetContractAssetsTable.assetId }).from(assetContractAssetsTable).where(eq(assetContractAssetsTable.contractId, id))).map(r => r.a);
      await trail(db, ids, "Contract", `${c.contractNo} end date changed ${old.endDate} → ${c.endDate}`, u.name);
    }
    await safeLog({ entityType: "asset_contract", entityId: id, action: "update", performedBy: u.performedBy, summary: `Updated contract ${c.contractNo}`, newValues: c, context: buildContext(req, "Contracts & AMC") });
    res.json({ ...c, ...contractState(c) });
  } catch (e) { handleError(res, e); }
});

router.delete("/asset-contracts/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [c] = await db.select().from(assetContractsTable).where(eq(assetContractsTable.id, id));
    if (!c || !c.isActive) return fail(res, 404, "Contract not found");
    const u = await who(req);
    await db.transaction(async tx => {
      const ids = (await tx.select({ a: assetContractAssetsTable.assetId }).from(assetContractAssetsTable).where(eq(assetContractAssetsTable.contractId, id))).map(r => r.a);
      await trail(tx, ids, "Contract", `Contract ${c.contractNo} deleted — coverage removed`, u.name);
      await tx.delete(assetContractAssetsTable).where(eq(assetContractAssetsTable.contractId, id));
      await tx.update(assetContractsTable).set({ isActive: false, updatedBy: u.performedBy }).where(eq(assetContractsTable.id, id));
    });
    await safeLog({ entityType: "asset_contract", entityId: id, action: "delete", performedBy: u.performedBy, summary: `Deleted contract ${c.contractNo} — ${c.title}`, context: buildContext(req, "Contracts & AMC") });
    res.status(204).end();
  } catch (e) { handleError(res, e); }
});

router.post("/asset-contracts/:id/assets", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [c] = await db.select().from(assetContractsTable).where(eq(assetContractsTable.id, id));
    if (!c || !c.isActive) return fail(res, 404, "Contract not found");
    const u = await who(req);
    const added = await db.transaction(tx => addAssets(tx, c, req.body?.assetIds || [], u.name));
    await safeLog({ entityType: "asset_contract", entityId: id, action: "update", performedBy: u.performedBy, summary: `Added ${added} asset(s) to ${c.contractNo}`, context: buildContext(req, "Contracts & AMC") });
    res.json({ added });
  } catch (e) { handleError(res, e); }
});

router.delete("/asset-contracts/:id/assets/:assetId", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id), assetId = Number(req.params.assetId);
    const [c] = await db.select().from(assetContractsTable).where(eq(assetContractsTable.id, id));
    if (!c) return fail(res, 404, "Contract not found");
    const u = await who(req);
    await db.transaction(async tx => {
      await tx.delete(assetContractAssetsTable).where(and(eq(assetContractAssetsTable.contractId, id), eq(assetContractAssetsTable.assetId, assetId)));
      await trail(tx, [assetId], "Contract", `Removed from ${c.contractType} ${c.contractNo}${s(req.body?.reason) ? ` — ${s(req.body.reason)}` : ""}`, u.name);
    });
    res.status(204).end();
  } catch (e) { handleError(res, e); }
});

router.post("/asset-contracts/:id/renew", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(assetContractsTable).where(eq(assetContractsTable.id, id));
    if (!old || !old.isActive) return fail(res, 404, "Contract not found");
    if (old.status === "Renewed") return fail(res, 400, "This contract has already been renewed");
    const b = req.body || {};
    const startDate = s(b.startDate), endDate = s(b.endDate);
    if (!startDate || !DATE_RE.test(startDate) || !endDate || !DATE_RE.test(endDate) || endDate < startDate) return fail(res, 400, "Give valid new start and end dates");
    const u = await who(req);
    const out = await db.transaction(async tx => {
      const { id: _i, contractNo: _n, createdAt: _c, updatedAt: _u, ...rest } = old;
      const [c] = await tx.insert(assetContractsTable).values({
        ...rest, contractNo: `TMP-${Date.now()}`, startDate, endDate, status: "Active", renewedFromId: id,
        value: b.value !== undefined && b.value !== "" && b.value !== null ? Number(b.value).toFixed(2) : old.value,
        poNumber: s(b.poNumber) ?? old.poNumber, notes: s(b.notes) ?? old.notes, createdBy: u.performedBy, updatedBy: u.performedBy,
      }).returning();
      const contractNo = s(b.contractNo) || `CT-${startDate.slice(0, 4)}-${String(c.id).padStart(4, "0")}`;
      const [c2] = await tx.update(assetContractsTable).set({ contractNo }).where(eq(assetContractsTable.id, c.id)).returning();
      await tx.update(assetContractsTable).set({ status: "Renewed", updatedBy: u.performedBy }).where(eq(assetContractsTable.id, id));
      const ids = (await tx.select({ a: assetContractAssetsTable.assetId }).from(assetContractAssetsTable)
        .innerJoin(assetsTable, eq(assetsTable.id, assetContractAssetsTable.assetId))
        .where(and(eq(assetContractAssetsTable.contractId, id), eq(assetsTable.isActive, true), sql`${assetsTable.status} NOT IN ('Disposed', 'Lost / Stolen')`))).map(r => r.a);
      if (ids.length) await tx.insert(assetContractAssetsTable).values(ids.map(assetId => ({ contractId: c2.id, assetId, addedBy: u.name })));
      await trail(tx, ids, "Contract", `${old.contractNo} renewed as ${contractNo} (${startDate} to ${endDate})`, u.name);
      return { ...c2, carried: ids.length };
    });
    await safeLog({ entityType: "asset_contract", entityId: out.id, action: "renew", performedBy: u.performedBy, summary: `Renewed ${old.contractNo} as ${out.contractNo} (${out.carried} assets carried over)`, context: buildContext(req, "Contracts & AMC") });
    res.status(201).json(out);
  } catch (e) { handleError(res, e); }
});

/* ═══ WARRANTY ══════════════════════════════════════════════════════════════ */

export async function coverageMap(on = today()) {
  const rows = await db.select({ assetId: assetContractAssetsTable.assetId, contractNo: assetContractsTable.contractNo, contractType: assetContractsTable.contractType, status: assetContractsTable.status,
    startDate: assetContractsTable.startDate, endDate: assetContractsTable.endDate, renewalNoticeDays: assetContractsTable.renewalNoticeDays, id: assetContractsTable.id, vendorName: assetContractsTable.vendorName })
    .from(assetContractAssetsTable).innerJoin(assetContractsTable, eq(assetContractsTable.id, assetContractAssetsTable.contractId)).where(eq(assetContractsTable.isActive, true));
  const map = new Map<number, any[]>();
  for (const r of rows) {
    if (!coversOn(r, on)) continue;
    const st = contractState(r, on);
    const list = map.get(r.assetId) || []; list.push({ ...r, ...st }); map.set(r.assetId, list);
  }
  return map;
}
export function warrantyState(expiry: string | null, on = today()) {
  if (!expiry || !DATE_RE.test(expiry)) return { warranty: "Unknown", warrantyDays: null as number | null };
  const d = daysBetween(on, expiry);
  return { warranty: d < 0 ? "Expired" : d <= 90 ? "Expiring" : "In warranty", warrantyDays: d };
}

router.get("/asset-warranty", requireAuth, async (_req, res) => {
  try {
    const on = today();
    const assets = await db.select({ id: assetsTable.id, assetTag: assetsTable.assetTag, name: assetsTable.name, type: assetsTable.type, serialNumber: assetsTable.serialNumber, status: assetsTable.status,
      location: assetsTable.location, department: assetsTable.department, ownerName: assetsTable.ownerName, vendorName: assetsTable.vendorName, purchaseDate: assetsTable.purchaseDate,
      warrantyStart: assetsTable.warrantyStart, warrantyExpiry: assetsTable.warrantyExpiry })
      .from(assetsTable).where(and(eq(assetsTable.isActive, true), sql`${assetsTable.status} NOT IN ('Disposed', 'Lost / Stolen')`)).orderBy(assetsTable.assetTag);
    const cover = await coverageMap(on);
    const rows = assets.map(a => {
      const w = warrantyState(a.warrantyExpiry, on);
      const contracts = cover.get(a.id) || [];
      const amcEnd = contracts.reduce((m: string | null, c: any) => (!m || c.endDate > m ? c.endDate : m), null);
      const covered = w.warranty === "In warranty" || w.warranty === "Expiring" || contracts.length > 0;
      return { ...a, ...w, contracts: contracts.map(c => ({ id: c.id, contractNo: c.contractNo, contractType: c.contractType, endDate: c.endDate })), amcEnd, covered,
        risk: !covered ? (w.warranty === "Unknown" ? "Unknown" : "Not covered") : w.warranty === "Expiring" && !contracts.length ? "Expiring, no AMC" : "Covered" };
    });
    const count = (f: (r: any) => boolean) => rows.filter(f).length;
    res.json({
      asOf: on, rows,
      summary: {
        total: rows.length, inWarranty: count(r => r.warranty === "In warranty"), expiring30: count(r => r.warranty === "Expiring" && r.warrantyDays <= 30),
        expiring90: count(r => r.warranty === "Expiring"), expired: count(r => r.warranty === "Expired"), unknown: count(r => r.warranty === "Unknown"),
        underAmc: count(r => r.contracts.length > 0), notCovered: count(r => r.risk === "Not covered"), expiringNoAmc: count(r => r.risk === "Expiring, no AMC"),
      },
    });
  } catch (e) { handleError(res, e); }
});

/* ═══ DEPRECIATION ══════════════════════════════════════════════════════════ */

router.get("/asset-depreciation/rules", requireAuth, async (_req, res) => {
  try { res.json(await db.select().from(assetDepreciationRulesTable).orderBy(assetDepreciationRulesTable.assetType)); } catch (e) { handleError(res, e); }
});

router.put("/asset-depreciation/rules/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const method = s(req.body.method) || "SLM";
    const life = Number(req.body.usefulLifeYears), salvage = Number(req.body.salvagePct);
    if (!["SLM", "WDV", "None"].includes(method)) return fail(res, 400, "Method must be SLM, WDV or None");
    if (!(life > 0 && life <= 60)) return fail(res, 400, "Useful life must be between 0 and 60 years");
    if (!(salvage >= 0 && salvage < 100)) return fail(res, 400, "Residual value must be 0–99 %");
    const u = await who(req);
    const [old] = await db.select().from(assetDepreciationRulesTable).where(eq(assetDepreciationRulesTable.id, id));
    if (!old) return fail(res, 404, "Rule not found");
    const [r] = await db.update(assetDepreciationRulesTable).set({ method, usefulLifeYears: String(life), salvagePct: String(salvage), notes: s(req.body.notes), updatedBy: u.performedBy, updatedAt: new Date() })
      .where(eq(assetDepreciationRulesTable.id, id)).returning();
    await safeLog({ entityType: "asset_depreciation_rule", entityId: id, action: "update", performedBy: u.performedBy,
      summary: `Depreciation rule for ${r.assetType}: ${old.method} ${Number(old.usefulLifeYears)}y ${Number(old.salvagePct)}% → ${r.method} ${life}y ${salvage}%`, context: buildContext(req, "Depreciation") });
    res.json(r);
  } catch (e) { handleError(res, e); }
});

router.post("/asset-depreciation/rules", requireAuth, async (req, res) => {
  try {
    const assetType = s(req.body.assetType); if (!assetType) return fail(res, 400, "Asset type is required");
    const [dup] = await db.select({ id: assetDepreciationRulesTable.id }).from(assetDepreciationRulesTable).where(sql`lower(asset_type) = lower(${assetType})`);
    if (dup) return fail(res, 400, `A rule for "${assetType}" already exists`);
    const u = await who(req);
    const [r] = await db.insert(assetDepreciationRulesTable).values({ assetType, method: s(req.body.method) || "SLM", usefulLifeYears: String(Number(req.body.usefulLifeYears) || 3), salvagePct: String(Number(req.body.salvagePct) || 5), notes: s(req.body.notes), updatedBy: u.performedBy }).returning();
    res.status(201).json(r);
  } catch (e) { handleError(res, e); }
});

const REGISTER_COLS = { id: assetsTable.id, assetTag: assetsTable.assetTag, name: assetsTable.name, type: assetsTable.type, serialNumber: assetsTable.serialNumber, status: assetsTable.status,
  location: assetsTable.location, department: assetsTable.department, vendorName: assetsTable.vendorName, purchaseDate: assetsTable.purchaseDate, purchaseOrderNo: assetsTable.purchaseOrderNo,
  invoiceNo: assetsTable.invoiceNo, cost: assetsTable.cost, depreciationMethod: assetsTable.depreciationMethod, usefulLifeYears: assetsTable.usefulLifeYears, salvageValue: assetsTable.salvageValue,
  disposalDate: assetsTable.disposalDate, disposalValue: assetsTable.disposalValue, warrantyStart: assetsTable.warrantyStart, warrantyExpiry: assetsTable.warrantyExpiry };

router.get("/asset-depreciation/register", requireAuth, async (req, res) => {
  try {
    const on = today();
    const fy = Number(req.query.fy) || fyOf(on);
    const asOf = s(req.query.asOf) && DATE_RE.test(String(req.query.asOf)) ? String(req.query.asOf) : (fyEnd(fy) < on ? fyEnd(fy) : on);
    const rules = await loadRules();
    const assets = await db.select(REGISTER_COLS).from(assetsTable).where(eq(assetsTable.isActive, true)).orderBy(assetsTable.assetTag);
    const rows: any[] = [], missing: any[] = [];
    for (const a of assets) {
      const { input, missing: miss } = resolveInput(a, rules);
      if (!input) { if (!GONE.includes(a.status) || a.disposalDate) missing.push({ id: a.id, assetTag: a.assetTag, name: a.name, type: a.type, serialNumber: a.serialNumber, status: a.status, location: a.location, missing: miss }); continue; }
      const line = registerLine(a, input, fy, asOf);
      if (!line) continue;
      rows.push({ ...a, method: input.method, lifeYears: input.lifeYears, salvage: input.salvage, source: input.source, ...line });
    }
    const sum = (k: string) => Math.round(rows.reduce((t, r) => t + (Number(r[k]) || 0), 0) * 100) / 100;
    const totals = Object.fromEntries(["grossOpening", "additions", "deletions", "grossClosing", "accOpening", "depreciation", "accOnDeletion", "accClosing", "netOpening", "netClosing"].map(k => [k, sum(k)]));
    const years: number[] = [];
    const first = assets.filter(a => a.purchaseDate && DATE_RE.test(a.purchaseDate)).reduce((m, a) => Math.min(m, fyOf(a.purchaseDate!)), fyOf(on));
    for (let y = fyOf(on); y >= Math.max(first, fyOf(on) - 15); y--) years.push(y);
    res.json({ fy, label: fyLabel(fy), from: fyStart(fy), to: fyEnd(fy), asOf, rows, missing, totals, years: years.map(y => ({ fy: y, label: fyLabel(y) })),
      byType: Object.values(rows.reduce((m: any, r) => { const k = r.type; m[k] ||= { type: k, count: 0, gross: 0, depreciation: 0, net: 0 }; m[k].count++; m[k].gross += r.grossClosing; m[k].depreciation += r.depreciation; m[k].net += r.netClosing; return m; }, {})) });
  } catch (e) { handleError(res, e); }
});

router.get("/asset-depreciation/asset/:id", requireAuth, async (req, res) => {
  try {
    const [a] = await db.select(REGISTER_COLS).from(assetsTable).where(eq(assetsTable.id, Number(req.params.id)));
    if (!a) return fail(res, 404, "Asset not found");
    const rules = await loadRules();
    const { input, missing, rule } = resolveInput(a, rules);
    if (!input) { res.json({ asset: a, rule, missing }); return; }
    const on = today();
    const acc = accumulated(input, on);
    res.json({ asset: a, rule, input, schedule: schedule(input), accumulated: acc, bookValue: Math.round((input.cost - acc) * 100) / 100, asOf: on });
  } catch (e) { handleError(res, e); }
});

/* ═══ ASSET COVERAGE PANEL (contracts, warranty, licenses, book value) ═════ */

router.get("/assets/:id/coverage", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [a] = await db.select(REGISTER_COLS).from(assetsTable).where(eq(assetsTable.id, id));
    if (!a) return fail(res, 404, "Asset not found");
    const on = today();
    const contracts = await db.select().from(assetContractsTable).innerJoin(assetContractAssetsTable, eq(assetContractAssetsTable.contractId, assetContractsTable.id))
      .where(and(eq(assetContractAssetsTable.assetId, id), eq(assetContractsTable.isActive, true))).orderBy(desc(assetContractsTable.endDate));
    const licenses = await db.select({ id: assetLicenseAssignmentsTable.id, licenseId: assetLicensesTable.id, productName: assetLicensesTable.productName, edition: assetLicensesTable.edition, expiryDate: assetLicensesTable.expiryDate, assignedAt: assetLicenseAssignmentsTable.assignedAt })
      .from(assetLicenseAssignmentsTable).innerJoin(assetLicensesTable, eq(assetLicensesTable.id, assetLicenseAssignmentsTable.licenseId))
      .where(and(eq(assetLicenseAssignmentsTable.assetId, id), eq(assetLicenseAssignmentsTable.status, "Active")));
    const { input, missing, rule } = resolveInput(a, await loadRules());
    const acc = input ? accumulated(input, on) : null;
    res.json({
      warranty: { start: a.warrantyStart ?? null, expiry: a.warrantyExpiry, ...warrantyState(a.warrantyExpiry, on) },
      contracts: contracts.map(r => ({ ...r.asset_contracts, ...contractState(r.asset_contracts, on) })),
      licenses,
      depreciation: input ? { method: input.method, lifeYears: input.lifeYears, salvage: input.salvage, source: input.source, cost: input.cost, accumulated: acc, bookValue: Math.round((input.cost - acc!) * 100) / 100 } : { missing, rule },
    });
  } catch (e) { handleError(res, e); }
});

/* ═══ FINANCE DATA UPLOAD — fill purchase / cost / warranty for existing assets ═══ */

const FIN_FIELDS: Record<string, string> = { purchaseDate: "Purchase date", purchaseOrderNo: "PO number", invoiceNo: "Invoice number", cost: "Cost", warrantyStart: "Warranty start", warrantyExpiry: "Warranty expiry",
  depreciationMethod: "Depreciation method", usefulLifeYears: "Useful life (years)", salvageValue: "Residual value" };

router.post("/assets/finance-update", requireAuth, async (req, res) => {
  try {
    const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const dryRun = req.body?.dryRun !== false;
    if (!rows.length) return fail(res, 400, "The file has no rows.");
    if (rows.length > 5000) return fail(res, 400, "Maximum 5,000 rows per upload.");
    const assets = await db.select().from(assetsTable).where(eq(assetsTable.isActive, true));
    const byTag = new Map(assets.map(a => [a.assetTag.toLowerCase(), a]));
    const bySerial = new Map<string, any[]>();
    for (const a of assets) if (a.serialNumber) { const k = a.serialNumber.toLowerCase(); bySerial.set(k, [...(bySerial.get(k) || []), a]); }
    const errors: { row: number; field: string; message: string }[] = [];
    const updates: { asset: any; set: any; changes: any[] }[] = [];
    const seen = new Set<number>();
    rows.forEach((raw, i): void => {
      const rowNo = Number(raw?.__row) || i + 2;
      const err = (field: string, message: string): void => { errors.push({ row: rowNo, field, message }); };
      const tag = s(raw.assetTag), serial = s(raw.serialNumber);
      let a: any = tag ? byTag.get(tag.toLowerCase()) : null;
      if (!a && serial) { const m = bySerial.get(serial.toLowerCase()) || []; if (m.length === 1) a = m[0]; else if (m.length > 1) return err("Serial Number", `"${serial}" matches ${m.length} assets — give the Asset Tag`); }
      if (!a) return err("Asset Tag", tag ? `"${tag}" not found` : "Asset Tag or Serial Number is required");
      if (seen.has(a.id)) return err("Asset Tag", `${a.assetTag} appears more than once in the file`);
      seen.add(a.id);
      const set: any = {};
      for (const f of ["purchaseDate", "warrantyStart", "warrantyExpiry"]) { const v = s(raw[f]); if (v === null) continue; if (!DATE_RE.test(v)) err(FIN_FIELDS[f], `"${v}" must be a date (YYYY-MM-DD)`); else set[f] = v; }
      for (const f of ["purchaseOrderNo", "invoiceNo"]) { const v = s(raw[f]); if (v !== null) set[f] = v; }
      for (const f of ["cost", "salvageValue"]) { const v = s(raw[f]); if (v === null) continue; const n = Number(v.replace(/[,₹\s]/g, "")); if (!Number.isFinite(n) || n < 0) err(FIN_FIELDS[f], `"${v}" is not a valid amount`); else set[f] = n.toFixed(2); }
      { const v = s(raw.depreciationMethod); if (v !== null) { const m = ["SLM", "WDV", "None"].find(x => x.toLowerCase() === v.toLowerCase()); if (!m) err(FIN_FIELDS.depreciationMethod, `"${v}" — use SLM, WDV or None`); else set.depreciationMethod = m; } }
      { const v = s(raw.usefulLifeYears); if (v !== null) { const n = Number(v); if (!(n > 0 && n <= 60)) err(FIN_FIELDS.usefulLifeYears, `"${v}" is not a valid number of years`); else set.usefulLifeYears = String(n); } }
      const pd = set.purchaseDate ?? a.purchaseDate, ws = set.warrantyStart ?? a.warrantyStart, we = set.warrantyExpiry ?? a.warrantyExpiry;
      if (pd && pd > today()) err("Purchase Date", "Cannot be in the future");
      if (ws && we && we < ws) err("Warranty Expiry", "Is before the warranty start");
      if (pd && we && we < pd) err("Warranty Expiry", "Is before the purchase date");
      const changes = Object.entries(set).filter(([f, v]) => String(a[f] ?? "") !== String(v ?? "") && !(f === "cost" || f === "salvageValue" ? Number(a[f]) === Number(v) : false))
        .map(([f, v]) => ({ field: f, label: FIN_FIELDS[f], from: a[f] ?? null, to: v }));
      if (changes.length) updates.push({ asset: a, set: Object.fromEntries(changes.map(c => [c.field, c.to])), changes });
    });
    const summary = { total: rows.length, matched: seen.size, toUpdate: updates.length, unchanged: seen.size - updates.length, fieldsChanged: updates.reduce((t, u) => t + u.changes.length, 0), errors };
    if (dryRun || errors.length) { res.json({ ...summary, updated: 0, dryRun: true, preview: updates.slice(0, 8).map(u => ({ assetTag: u.asset.assetTag, changes: u.changes })) }); return; }
    const u = await who(req);
    const comment = s(req.body?.comment) || "Finance data upload";
    await db.transaction(async tx => {
      for (const up of updates) {
        await tx.update(assetsTable).set({ ...up.set, updatedBy: u.performedBy, updatedAt: new Date() }).where(eq(assetsTable.id, up.asset.id));
        await tx.insert(assetTransactionsTable).values({ assetId: up.asset.id, action: "Updated", userName: u.performedBy, comment, changes: up.changes, notes: up.changes.map(c => c.label).join(", ") + " changed" });
      }
    });
    await safeLog({ entityType: "asset", action: "finance_update", performedBy: u.performedBy, summary: `Finance data upload: updated ${updates.length} assets (${summary.fieldsChanged} fields)`, context: buildContext(req, "Depreciation") });
    res.json({ ...summary, updated: updates.length, dryRun: false });
  } catch (e) { handleError(res, e); }
});

export default router;
