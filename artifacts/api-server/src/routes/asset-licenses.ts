import { Router, Request, Response } from "express";
import { db, assetsTable, assetLicensesTable, assetLicenseAssignmentsTable, assetTransactionsTable, usersTable } from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy, buildContext } from "./audit-logs";

/*
 * Software licenses + compliance (ManageEngine-style SAM):
 *  - Entitlement = seats purchased. Consumption = active assignments (to users or devices); licenses with no
 *    assignment history fall back to the manually entered "seats used" (e.g. a count from the vendor portal).
 *  - Compliance per license: Under-licensed (shortfall → true-up exposure), Expired but in use, Over-licensed
 *    (≥30 % idle seats → unused spend), Compliant. Site / enterprise agreements are unlimited.
 *  - Reclaim candidates: seats held by disposed / lost / retired devices or by deactivated users.
 */

const router = Router();
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const handleError = (res: Response, e: unknown) => fail(res, 500, e instanceof Error ? e.message : String(e));
const s = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
async function safeLog(p: Parameters<typeof logAudit>[0]) { try { await logAudit(p); } catch { /* non-fatal */ } }
async function who(req: Request) {
  const userId = (req.session as any)?.userId as number | undefined;
  const performedBy = await getPerformedBy(userId).catch(() => "System");
  let name = "System";
  if (userId) { const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)); name = u?.name || name; }
  return { performedBy, name };
}

export const LICENSE_TYPES = ["Subscription", "Per User", "Per Device", "Concurrent", "Perpetual", "Volume", "OEM", "Site License", "Enterprise Agreement"];
const UNLIMITED = ["Site License", "Enterprise Agreement"];

type Counts = { active: number; ever: number };
export function evaluate(l: any, c: Counts | undefined, on = today()) {
  const tracking = c && c.ever > 0 ? "Assignments" : "Manual";
  const consumed = tracking === "Assignments" ? c!.active : Number(l.seatsUsed || 0);
  const unlimited = UNLIMITED.includes(l.licenseType);
  const entitled = unlimited ? null : Number(l.seatsTotal || 0);
  const available = entitled === null ? null : entitled - consumed;
  const shortfall = entitled === null ? 0 : Math.max(0, consumed - entitled);
  const unitCost = l.cost && Number(l.seatsTotal) > 0 ? Number(l.cost) / Number(l.seatsTotal) : null;
  const daysLeft = l.expiryDate && DATE_RE.test(l.expiryDate) ? days(on, l.expiryDate) : null;
  const perpetual = l.licenseType === "Perpetual" || l.licenseType === "OEM";
  let status = l.status === "Cancelled" ? "Cancelled" : "Active";
  if (status !== "Cancelled" && daysLeft !== null && !perpetual) status = daysLeft < 0 ? "Expired" : daysLeft <= (l.reminderDays ?? 30) ? "Expiring Soon" : "Active";
  let compliance = "Compliant";
  if ((status === "Expired" || status === "Cancelled") && consumed > 0) compliance = "Expired – in use";
  else if (shortfall > 0) compliance = "Under-licensed";
  else if (entitled !== null && entitled >= 5 && consumed / entitled < 0.7) compliance = "Over-licensed";
  const utilisation = entitled ? Math.round((consumed / entitled) * 100) : null;
  return {
    tracking, consumed, entitled, available, shortfall, utilisation, unitCost: unitCost === null ? null : Math.round(unitCost * 100) / 100,
    exposure: unitCost === null ? null : Math.round(shortfall * unitCost), unusedSpend: unitCost === null || available === null ? null : Math.round(Math.max(0, available) * unitCost),
    status, daysLeft, compliance,
  };
}

async function countsFor(ids?: number[]) {
  const rows = await db.select({ licenseId: assetLicenseAssignmentsTable.licenseId, active: sql<number>`count(*) filter (where ${assetLicenseAssignmentsTable.status} = 'Active')::int`, ever: sql<number>`count(*)::int` })
    .from(assetLicenseAssignmentsTable).where(ids ? inArray(assetLicenseAssignmentsTable.licenseId, ids) : sql`true`).groupBy(assetLicenseAssignmentsTable.licenseId);
  return new Map(rows.map(r => [r.licenseId, { active: r.active, ever: r.ever }]));
}
async function syncUsed(tx: any, licenseId: number) {
  await tx.execute(sql`UPDATE asset_licenses SET seats_used = (SELECT count(*) FROM asset_license_assignments WHERE license_id = ${licenseId} AND status = 'Active') WHERE id = ${licenseId}`);
}

/* ─── Licenses CRUD ──────────────────────────────────────────────────────── */

const LIC_FIELDS = ["productName", "vendorName", "vendorId", "edition", "licenseKey", "licenseType", "startDate", "expiryDate", "seatsTotal", "seatsUsed", "cost", "renewalCost",
  "billingCycle", "poNumber", "autoRenew", "ownerName", "reminderDays", "contractId", "status", "notes"] as const;
function pickLicense(b: any) {
  const o: any = {};
  for (const f of LIC_FIELDS) if (b[f] !== undefined) o[f] = typeof b[f] === "string" ? s(b[f]) : b[f];
  for (const f of ["seatsTotal", "seatsUsed", "reminderDays"]) if (o[f] !== undefined) o[f] = Math.max(0, parseInt(o[f]) || 0);
  for (const f of ["cost", "renewalCost"]) if (o[f] !== undefined) o[f] = o[f] === null ? null : Number(o[f]).toFixed(2);
  if (o.autoRenew !== undefined) o.autoRenew = !!o.autoRenew;
  if (o.status !== undefined && o.status !== "Cancelled") o.status = "Active"; // Expired / Expiring are computed from the dates
  return o;
}
function validateLicense(o: any): string | null {
  if (!s(o.productName)) return "Product name is required";
  for (const f of ["startDate", "expiryDate"]) if (o[f] && !DATE_RE.test(o[f])) return `${f === "startDate" ? "Start" : "Expiry"} date is not valid — use dd-MMM-yyyy, e.g. 05-Nov-2026`;
  if (o.startDate && o.expiryDate && o.expiryDate < o.startDate) return "Expiry date is before the start date";
  for (const f of ["cost", "renewalCost"]) if (o[f] !== null && o[f] !== undefined && !(Number(o[f]) >= 0)) return "Cost must be a positive number";
  return null;
}

router.get("/asset-licenses", requireAuth, async (_req, res) => {
  try {
    const items = await db.select().from(assetLicensesTable).where(eq(assetLicensesTable.isActive, true)).orderBy(assetLicensesTable.productName);
    const counts = await countsFor();
    res.json(items.map(l => ({ ...l, storedStatus: l.status, ...evaluate(l, counts.get(l.id)) })));
  } catch (e) { handleError(res, e); }
});

router.post("/asset-licenses", requireAuth, async (req, res) => {
  try {
    const o = pickLicense(req.body); o.licenseType ||= "Subscription";
    const err = validateLicense(o); if (err) return fail(res, 400, err);
    const u = await who(req);
    const [item] = await db.insert(assetLicensesTable).values({ ...o, createdBy: u.performedBy, updatedBy: u.performedBy }).returning();
    await safeLog({ entityType: "asset_license", entityId: item.id, action: "create", performedBy: u.performedBy, summary: `Created license: ${item.productName} (${item.seatsTotal} seats)`, newValues: item, context: buildContext(req, "Licenses") });
    res.status(201).json(item);
  } catch (e) { handleError(res, e); }
});

router.patch("/asset-licenses/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(assetLicensesTable).where(eq(assetLicensesTable.id, id));
    if (!old || !old.isActive) return fail(res, 404, "License not found");
    const o = pickLicense(req.body);
    const c = (await countsFor([id])).get(id);
    if (c && c.ever > 0) delete o.seatsUsed; // consumption comes from assignments
    const err = validateLicense({ ...old, ...o }); if (err) return fail(res, 400, err);
    const u = await who(req);
    const [item] = await db.update(assetLicensesTable).set({ ...o, updatedBy: u.performedBy, updatedAt: new Date() }).where(eq(assetLicensesTable.id, id)).returning();
    const changed = Object.keys(o).filter(k => String((old as any)[k] ?? "") !== String((item as any)[k] ?? ""));
    await safeLog({ entityType: "asset_license", entityId: id, action: "update", performedBy: u.performedBy, summary: `Updated license: ${item.productName}${changed.length ? ` (${changed.join(", ")})` : ""}`, newValues: item, context: buildContext(req, "Licenses") });
    res.json({ ...item, ...evaluate(item, c) });
  } catch (e) { handleError(res, e); }
});

router.delete("/asset-licenses/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(assetLicensesTable).where(eq(assetLicensesTable.id, id));
    if (!old) return fail(res, 404, "License not found");
    const c = (await countsFor([id])).get(id);
    if (c && c.active > 0) return fail(res, 400, `${c.active} seat(s) are still assigned. Revoke them before deleting this license.`);
    const u = await who(req);
    await db.update(assetLicensesTable).set({ isActive: false, updatedBy: u.performedBy }).where(eq(assetLicensesTable.id, id));
    await safeLog({ entityType: "asset_license", entityId: id, action: "delete", performedBy: u.performedBy, summary: `Deleted license: ${old.productName}`, context: buildContext(req, "Licenses") });
    res.status(204).end();
  } catch (e) { handleError(res, e); }
});

/* ─── Assignments ────────────────────────────────────────────────────────── */

router.get("/asset-licenses/:id/assignments", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.select({ a: assetLicenseAssignmentsTable, assetTag: assetsTable.assetTag, assetName: assetsTable.name, assetStatus: assetsTable.status, assetHolder: assetsTable.ownerName })
      .from(assetLicenseAssignmentsTable).leftJoin(assetsTable, eq(assetsTable.id, assetLicenseAssignmentsTable.assetId))
      .where(eq(assetLicenseAssignmentsTable.licenseId, id)).orderBy(desc(assetLicenseAssignmentsTable.status), desc(assetLicenseAssignmentsTable.assignedAt));
    res.json(rows.map(r => ({ ...r.a, assetTag: r.assetTag, assetName: r.assetName, assetStatus: r.assetStatus, assetHolder: r.assetHolder })));
  } catch (e) { handleError(res, e); }
});

router.post("/asset-licenses/:id/assignments", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [lic] = await db.select().from(assetLicensesTable).where(eq(assetLicensesTable.id, id));
    if (!lic || !lic.isActive) return fail(res, 404, "License not found");
    const type = req.body?.assigneeType === "Device" ? "Device" : "User";
    const u = await who(req);
    const notes = s(req.body?.notes);
    const active = await db.select().from(assetLicenseAssignmentsTable).where(and(eq(assetLicenseAssignmentsTable.licenseId, id), eq(assetLicenseAssignmentsTable.status, "Active")));
    const result = await db.transaction(async tx => {
      let added = 0; const skipped: string[] = [];
      if (type === "Device") {
        const ids = [...new Set((req.body?.assetIds || []).map(Number).filter(Boolean))] as number[];
        if (!ids.length) throw Object.assign(new Error("Choose at least one device"), { status: 400 });
        const have = new Set(active.filter(a => a.assetId).map(a => a.assetId));
        const assets = await tx.select().from(assetsTable).where(and(inArray(assetsTable.id, ids), eq(assetsTable.isActive, true)));
        for (const a of assets) {
          if (have.has(a.id)) { skipped.push(`${a.assetTag} (already assigned)`); continue; }
          await tx.insert(assetLicenseAssignmentsTable).values({ licenseId: id, assigneeType: "Device", assetId: a.id, userName: a.ownerName, userEmail: a.ownerEmail, employeeCode: a.ownerEmployeeCode, department: a.department, assignedBy: u.name, notes });
          await tx.insert(assetTransactionsTable).values({ assetId: a.id, action: "License", userName: u.name, comment: `License assigned: ${lic.productName}${lic.edition ? ` ${lic.edition}` : ""}`, notes: `License assigned: ${lic.productName}` });
          added++;
        }
      } else {
        const people: any[] = Array.isArray(req.body?.users) ? req.body.users : [];
        if (!people.length) throw Object.assign(new Error("Add at least one user"), { status: 400 });
        const key = (p: any) => (s(p.userEmail) || s(p.employeeCode) || s(p.userName) || "").toLowerCase();
        const have = new Set(active.filter(a => a.assigneeType === "User").map(key));
        for (const p of people) {
          const name = s(p.userName); if (!name) { skipped.push("(row without a name)"); continue; }
          const email = s(p.userEmail);
          if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped.push(`${name} (invalid email)`); continue; }
          const k = key(p); if (have.has(k)) { skipped.push(`${name} (already assigned)`); continue; }
          have.add(k);
          let userId = p.userId ? Number(p.userId) : null;
          if (!userId && email) { const [x] = await tx.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.email}) = lower(${email})`); userId = x?.id ?? null; }
          await tx.insert(assetLicenseAssignmentsTable).values({ licenseId: id, assigneeType: "User", userId, userName: name, userEmail: email, employeeCode: s(p.employeeCode), department: s(p.department), assignedBy: u.name, notes });
          added++;
        }
      }
      await syncUsed(tx, id);
      return { added, skipped };
    });
    const c = (await countsFor([id])).get(id);
    const ev = evaluate({ ...lic }, c);
    await safeLog({ entityType: "asset_license", entityId: id, action: "assign", performedBy: u.performedBy, summary: `${lic.productName}: assigned ${result.added} seat(s) to ${type === "Device" ? "devices" : "users"} — ${ev.consumed}/${ev.entitled ?? "∞"} in use`, context: buildContext(req, "Licenses") });
    res.json({ ...result, ...ev });
  } catch (e: any) { e?.status === 400 ? fail(res, 400, e.message) : handleError(res, e); }
});

router.post("/asset-license-assignments/:id/revoke", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [a] = await db.select().from(assetLicenseAssignmentsTable).where(eq(assetLicenseAssignmentsTable.id, id));
    if (!a) return fail(res, 404, "Assignment not found");
    if (a.status !== "Active") return fail(res, 400, "This seat is already revoked");
    const reason = s(req.body?.reason);
    if (!reason) return fail(res, 400, "Give a reason for revoking (e.g. employee left, device disposed)");
    const u = await who(req);
    const [lic] = await db.select().from(assetLicensesTable).where(eq(assetLicensesTable.id, a.licenseId));
    await db.transaction(async tx => {
      await tx.update(assetLicenseAssignmentsTable).set({ status: "Revoked", revokedAt: new Date(), revokedBy: u.name, revokeReason: reason }).where(eq(assetLicenseAssignmentsTable.id, id));
      if (a.assetId) await tx.insert(assetTransactionsTable).values({ assetId: a.assetId, action: "License", userName: u.name, comment: `License revoked: ${lic?.productName} — ${reason}`, notes: `License revoked: ${lic?.productName}` });
      await syncUsed(tx, a.licenseId);
    });
    await safeLog({ entityType: "asset_license", entityId: a.licenseId, action: "revoke", performedBy: u.performedBy, summary: `${lic?.productName}: revoked seat of ${a.userName || `asset #${a.assetId}`} — ${reason}`, context: buildContext(req, "Licenses") });
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

/* ─── Compliance report ──────────────────────────────────────────────────── */

export async function complianceReport() {
  const on = today();
  const lics = await db.select().from(assetLicensesTable).where(eq(assetLicensesTable.isActive, true)).orderBy(assetLicensesTable.productName);
  const counts = await countsFor();
  const rows = lics.map(l => ({ id: l.id, productName: l.productName, edition: l.edition, vendorName: l.vendorName, licenseType: l.licenseType, expiryDate: l.expiryDate, cost: l.cost, renewalCost: l.renewalCost, autoRenew: l.autoRenew, ownerName: l.ownerName, ...evaluate(l, counts.get(l.id), on) }));
  const reclaimRows = await db.select({ a: assetLicenseAssignmentsTable, productName: assetLicensesTable.productName, assetTag: assetsTable.assetTag, assetStatus: assetsTable.status, userActive: usersTable.isActive })
    .from(assetLicenseAssignmentsTable)
    .innerJoin(assetLicensesTable, and(eq(assetLicensesTable.id, assetLicenseAssignmentsTable.licenseId), eq(assetLicensesTable.isActive, true)))
    .leftJoin(assetsTable, eq(assetsTable.id, assetLicenseAssignmentsTable.assetId))
    .leftJoin(usersTable, eq(usersTable.id, assetLicenseAssignmentsTable.userId))
    .where(and(eq(assetLicenseAssignmentsTable.status, "Active"), sql`(${assetsTable.status} IN ('Disposed', 'Lost / Stolen', 'Retired') OR ${assetsTable.isActive} = false OR ${usersTable.isActive} = false)`));
  const reclaim = reclaimRows.map(r => ({ id: r.a.id, licenseId: r.a.licenseId, productName: r.productName, assigneeType: r.a.assigneeType, userName: r.a.userName, userEmail: r.a.userEmail, assetTag: r.assetTag, assignedAt: r.a.assignedAt,
    reason: r.a.assetId ? `Device is ${r.assetStatus || "deleted"}` : "User account deactivated" }));
  const unitCost = new Map(rows.map(r => [r.id, r.unitCost]));
  const sum = (f: (r: any) => number) => rows.reduce((t, r) => t + (f(r) || 0), 0);
  return {
    asOf: on, rows, reclaim,
    summary: {
      licenses: rows.length,
      compliant: rows.filter(r => r.compliance === "Compliant").length,
      underLicensed: rows.filter(r => r.compliance === "Under-licensed").length,
      expiredInUse: rows.filter(r => r.compliance === "Expired – in use").length,
      overLicensed: rows.filter(r => r.compliance === "Over-licensed").length,
      expiring: rows.filter(r => r.status === "Expiring Soon").length,
      shortfallSeats: sum(r => r.shortfall), exposure: sum(r => r.exposure), unusedSeats: sum(r => Math.max(0, r.available ?? 0)), unusedSpend: sum(r => r.unusedSpend),
      reclaimSeats: reclaim.length, reclaimValue: Math.round(reclaim.reduce((t, r) => t + (unitCost.get(r.licenseId) || 0), 0)),
      score: rows.length ? Math.round((rows.filter(r => r.compliance === "Compliant" || r.compliance === "Over-licensed").length / rows.length) * 100) : 100,
    },
  };
}

router.get("/asset-license-compliance", requireAuth, async (_req, res) => {
  try { res.json(await complianceReport()); } catch (e) { handleError(res, e); }
});

export default router;
