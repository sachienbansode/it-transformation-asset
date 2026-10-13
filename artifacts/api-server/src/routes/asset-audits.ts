import { Router, Request, Response } from "express";
import { db, assetsTable, assetAuditsTable, assetAuditItemsTable, assetTransactionsTable, usersTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy, buildContext } from "./audit-logs";

/*
 * Physical asset audit (stock verification), ManageEngine-style:
 *  1. Plan: pick scope (locations / departments / types) → the expected asset list is snapshotted.
 *  2. Start: auditors scan QR stickers (in-app camera or phone camera → /a/<tag>) or key in tags,
 *     at a declared "audit location". Each scan marks Found / Location mismatch / Not in scope / Unknown tag.
 *  3. Complete: anything still Pending becomes Missing; optionally the register's locations are
 *     corrected from the scans. Every verified / missing asset gets an entry in its history trail.
 */

const router = Router();
const RESULTS = ["Pending", "Found", "Location mismatch", "Missing", "Not in scope", "Unknown tag"] as const;
const CONDITIONS = ["Good", "Fair", "Damaged", "Not working"];

const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const handleError = (res: Response, e: unknown) => fail(res, 500, e instanceof Error ? e.message : String(e));
const s = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const list = (v: unknown): string[] => (Array.isArray(v) ? v : String(v ?? "").split(",")).map(x => String(x).trim()).filter(Boolean);
async function safeLog(p: Parameters<typeof logAudit>[0]) { try { await logAudit(p); } catch { /* non-fatal */ } }
async function who(req: Request) {
  const userId = (req.session as any)?.userId as number | undefined;
  const performedBy = await getPerformedBy(userId).catch(() => "System");
  let name = "System";
  if (userId) { const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)); name = u?.name || name; }
  return { performedBy, name };
}
const sameLoc = (a?: string | null, b?: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** Extract an asset tag from a scanned QR payload: ".../a/LAP-0001", "LAP-0001", or a URL with ?tag= */
export function tagFromScan(raw: string) {
  const t = String(raw || "").trim();
  const m = t.match(/\/a\/([^/?#\s]+)/i);
  if (m) return decodeURIComponent(m[1]).toUpperCase();
  try { const u = new URL(t); const q = u.searchParams.get("tag"); if (q) return q.toUpperCase(); } catch { /* not a URL */ }
  return t.toUpperCase();
}

async function counts(auditId: number) {
  const rows = await db.select({ result: assetAuditItemsTable.result, inScope: assetAuditItemsTable.inScope, n: sql<number>`count(*)::int` })
    .from(assetAuditItemsTable).where(eq(assetAuditItemsTable.auditId, auditId)).groupBy(assetAuditItemsTable.result, assetAuditItemsTable.inScope);
  const c: Record<string, number> = Object.fromEntries(RESULTS.map(r => [r, 0]));
  let expected = 0;
  for (const r of rows) { c[r.result] = (c[r.result] || 0) + r.n; if (r.inScope) expected += r.n; }
  const verified = c["Found"] + c["Location mismatch"];
  return { ...c, expected, verified, progress: expected ? Math.round((verified / expected) * 100) : 0 };
}

/* ─── Options for the planning form ─────────────────────────────────────── */

router.get("/asset-audits/options", requireAuth, async (_req, res) => {
  try {
    const rows = await db.select({ location: assetsTable.location, department: assetsTable.department, type: assetsTable.type, n: sql<number>`count(*)::int` })
      .from(assetsTable).where(and(eq(assetsTable.isActive, true), sql`${assetsTable.status} <> 'Disposed'`))
      .groupBy(assetsTable.location, assetsTable.department, assetsTable.type);
    const agg = (k: "location" | "department" | "type") => {
      const m = new Map<string, number>();
      for (const r of rows) { const v = (r[k] || "").trim(); if (v) m.set(v, (m.get(v) || 0) + r.n); }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
    };
    res.json({ locations: agg("location"), departments: agg("department"), types: agg("type"), conditions: CONDITIONS });
  } catch (e) { handleError(res, e); }
});

/* ─── List / detail ─────────────────────────────────────────────────────── */

router.get("/asset-audits", requireAuth, async (_req, res) => {
  try {
    const audits = await db.select().from(assetAuditsTable).orderBy(desc(assetAuditsTable.createdAt));
    const out = [];
    for (const a of audits) out.push({ ...a, counts: a.status === "Completed" && a.summary ? a.summary : await counts(a.id) });
    res.json(out);
  } catch (e) { handleError(res, e); }
});

router.get("/asset-audits/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [a] = await db.select().from(assetAuditsTable).where(eq(assetAuditsTable.id, id));
    if (!a) return fail(res, 404, "Audit not found");
    const items = await db.select().from(assetAuditItemsTable).where(eq(assetAuditItemsTable.auditId, id)).orderBy(assetAuditItemsTable.assetTag);
    res.json({ ...a, counts: await counts(id), items });
  } catch (e) { handleError(res, e); }
});

/* ─── Plan an audit (snapshot of expected assets) ───────────────────────── */

router.post("/asset-audits", requireAuth, async (req, res) => {
  try {
    const name = s(req.body.name);
    if (!name) return fail(res, 400, "Audit name is required");
    const locs = list(req.body.locations), depts = list(req.body.departments), types = list(req.body.types);
    const conds = [eq(assetsTable.isActive, true), sql`${assetsTable.status} <> 'Disposed'`];
    if (locs.length) conds.push(sql`lower(coalesce(${assetsTable.location},'')) IN (${sql.join(locs.map(l => sql`${l.toLowerCase()}`), sql`, `)})`);
    if (depts.length) conds.push(sql`lower(coalesce(${assetsTable.department},'')) IN (${sql.join(depts.map(d => sql`${d.toLowerCase()}`), sql`, `)})`);
    if (types.length) conds.push(sql`${assetsTable.type} IN (${sql.join(types.map(t => sql`${t}`), sql`, `)})`);
    const assets = await db.select().from(assetsTable).where(and(...conds)).orderBy(assetsTable.assetTag);
    if (!assets.length) return fail(res, 400, "No assets match this scope");
    const w = await who(req);
    const audit = await db.transaction(async tx => {
      const [a] = await tx.insert(assetAuditsTable).values({
        name, scopeLocations: locs.join(", ") || null, scopeDepartments: depts.join(", ") || null, scopeTypes: types.join(", ") || null,
        dueDate: s(req.body.dueDate), auditors: s(req.body.auditors), notes: s(req.body.notes), status: "Planned", createdBy: w.performedBy,
      }).returning();
      const auditNo = `AUD-${new Date().getFullYear()}-${String(a.id).padStart(4, "0")}`;
      await tx.update(assetAuditsTable).set({ auditNo }).where(eq(assetAuditsTable.id, a.id));
      for (let i = 0; i < assets.length; i += 500) {
        await tx.insert(assetAuditItemsTable).values(assets.slice(i, i + 500).map(x => ({
          auditId: a.id, assetId: x.id, assetTag: x.assetTag, assetName: x.name, serialNumber: x.serialNumber,
          expectedLocation: x.location, expectedHolder: x.ownerName, expectedStatus: x.status, inScope: true, result: "Pending",
        })));
      }
      return { ...a, auditNo };
    });
    await safeLog({ entityType: "asset_audit", entityId: audit.id, action: "create", performedBy: w.performedBy, summary: `Planned audit ${audit.auditNo} "${name}" — ${assets.length} assets`, context: buildContext(req, "Physical Audit") });
    res.status(201).json({ ...audit, expected: assets.length });
  } catch (e) { handleError(res, e); }
});

router.post("/asset-audits/:id/start", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [a] = await db.update(assetAuditsTable).set({ status: "In Progress", startedAt: new Date() })
      .where(and(eq(assetAuditsTable.id, id), eq(assetAuditsTable.status, "Planned"))).returning();
    if (!a) return fail(res, 400, "Only a planned audit can be started");
    res.json(a);
  } catch (e) { handleError(res, e); }
});

router.post("/asset-audits/:id/cancel", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reason = s(req.body.reason);
    const [a] = await db.update(assetAuditsTable).set({ status: "Cancelled", notes: sql`coalesce(${assetAuditsTable.notes} || E'\n', '') || ${"Cancelled: " + (reason || "no reason given")}` })
      .where(and(eq(assetAuditsTable.id, id), sql`${assetAuditsTable.status} IN ('Planned','In Progress')`)).returning();
    if (!a) return fail(res, 400, "Only a planned or running audit can be cancelled");
    res.json(a);
  } catch (e) { handleError(res, e); }
});

/* ─── Scan / verify an asset ────────────────────────────────────────────── */

router.post("/asset-audits/:id/scan", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [a] = await db.select().from(assetAuditsTable).where(eq(assetAuditsTable.id, id));
    if (!a) return fail(res, 404, "Audit not found");
    if (a.status !== "In Progress") return fail(res, 400, a.status === "Planned" ? "Start the audit before scanning" : `Audit is ${a.status.toLowerCase()}`);
    const tag = tagFromScan(String(req.body.code ?? req.body.tag ?? ""));
    if (!tag) return fail(res, 400, "Nothing scanned");
    const here = s(req.body.location);
    if (!here) return fail(res, 400, "Select the location you are auditing first");
    const condition = s(req.body.condition) || "Good";
    const remarks = s(req.body.remarks);
    const method = s(req.body.method) || "QR scan";
    const w = await who(req);

    const [item] = await db.select().from(assetAuditItemsTable).where(and(eq(assetAuditItemsTable.auditId, id), sql`upper(${assetAuditItemsTable.assetTag}) = ${tag}`));
    const stamp = { foundLocation: here, condition, remarks, scannedAt: new Date(), scannedBy: w.name, method };
    if (item) {
      const result = !item.inScope ? item.result : sameLoc(item.expectedLocation, here) || !item.expectedLocation ? "Found" : "Location mismatch";
      const [u] = await db.update(assetAuditItemsTable).set({ ...stamp, result }).where(eq(assetAuditItemsTable.id, item.id)).returning();
      return res.json({ item: u, repeat: item.result !== "Pending", counts: await counts(id) });
    }
    // Not in the expected list: is it a registered asset at all?
    const [asset] = await db.select().from(assetsTable).where(sql`upper(${assetsTable.assetTag}) = ${tag}`);
    const [u] = await db.insert(assetAuditItemsTable).values({
      auditId: id, assetId: asset?.id ?? null, assetTag: tag, assetName: asset?.name ?? null, serialNumber: asset?.serialNumber ?? null,
      expectedLocation: asset?.location ?? null, expectedHolder: asset?.ownerName ?? null, expectedStatus: asset?.status ?? null,
      inScope: false, result: asset ? "Not in scope" : "Unknown tag", ...stamp,
    }).returning();
    res.json({ item: u, repeat: false, counts: await counts(id) });
  } catch (e) { handleError(res, e); }
});

// Undo a scan (wrong asset scanned) — back to Pending, or remove an out-of-scope entry
router.post("/asset-audits/:id/items/:itemId/reset", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id), itemId = Number(req.params.itemId);
    const [a] = await db.select().from(assetAuditsTable).where(eq(assetAuditsTable.id, id));
    if (!a || a.status !== "In Progress") return fail(res, 400, "Audit is not in progress");
    const [it] = await db.select().from(assetAuditItemsTable).where(and(eq(assetAuditItemsTable.id, itemId), eq(assetAuditItemsTable.auditId, id)));
    if (!it) return fail(res, 404, "Item not found");
    if (!it.inScope) await db.delete(assetAuditItemsTable).where(eq(assetAuditItemsTable.id, itemId));
    else await db.update(assetAuditItemsTable).set({ result: "Pending", foundLocation: null, condition: null, remarks: null, scannedAt: null, scannedBy: null, method: null }).where(eq(assetAuditItemsTable.id, itemId));
    res.json({ ok: true, counts: await counts(id) });
  } catch (e) { handleError(res, e); }
});

/* ─── Complete ───────────────────────────────────────────────────────────── */

router.post("/asset-audits/:id/complete", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const applyLocations = req.body.applyLocations === true;
    const [a] = await db.select().from(assetAuditsTable).where(eq(assetAuditsTable.id, id));
    if (!a) return fail(res, 404, "Audit not found");
    if (a.status !== "In Progress") return fail(res, 400, "Only an audit in progress can be completed");
    const w = await who(req);
    const summary = await db.transaction(async tx => {
      await tx.update(assetAuditItemsTable).set({ result: "Missing" }).where(and(eq(assetAuditItemsTable.auditId, id), eq(assetAuditItemsTable.result, "Pending")));
      const items = await tx.select().from(assetAuditItemsTable).where(eq(assetAuditItemsTable.auditId, id));
      const trail = [];
      for (const it of items) {
        if (!it.assetId) continue;
        if (it.result === "Found") trail.push({ assetId: it.assetId, action: "Audit: verified", userName: w.performedBy, notes: `${a.auditNo} · at ${it.foundLocation} · condition ${it.condition}`, comment: it.remarks });
        else if (it.result === "Location mismatch") {
          trail.push({ assetId: it.assetId, action: "Audit: location mismatch", userName: w.performedBy, notes: `${a.auditNo} · expected ${it.expectedLocation || "—"}, found at ${it.foundLocation}${applyLocations ? " · register updated" : ""}`, comment: it.remarks,
            changes: applyLocations ? [{ field: "location", label: "Location", from: it.expectedLocation, to: it.foundLocation }] : null });
          if (applyLocations) await tx.update(assetsTable).set({ location: it.foundLocation, updatedBy: w.performedBy, updatedAt: new Date() }).where(eq(assetsTable.id, it.assetId));
        } else if (it.result === "Missing") trail.push({ assetId: it.assetId, action: "Audit: not found", userName: w.performedBy, notes: `${a.auditNo} · expected at ${it.expectedLocation || "—"}${it.expectedHolder ? `, with ${it.expectedHolder}` : ""}` });
        else if (it.result === "Not in scope") trail.push({ assetId: it.assetId, action: "Audit: seen outside scope", userName: w.performedBy, notes: `${a.auditNo} · found at ${it.foundLocation}`, comment: it.remarks });
      }
      for (let i = 0; i < trail.length; i += 500) await tx.insert(assetTransactionsTable).values(trail.slice(i, i + 500));
      const c: Record<string, number> = Object.fromEntries(RESULTS.map(r => [r, 0]));
      let expected = 0;
      for (const it of items) { c[it.result] = (c[it.result] || 0) + 1; if (it.inScope) expected++; }
      const verified = c["Found"] + c["Location mismatch"];
      const sum: Record<string, number> = { ...c, expected, verified, progress: expected ? Math.round((verified / expected) * 100) : 0, locationsUpdated: applyLocations ? c["Location mismatch"] : 0 };
      await tx.update(assetAuditsTable).set({ status: "Completed", completedAt: new Date(), completedBy: w.name, summary: sum }).where(eq(assetAuditsTable.id, id));
      return sum;
    });
    await safeLog({ entityType: "asset_audit", entityId: id, action: "complete", performedBy: w.performedBy,
      summary: `Completed audit ${a.auditNo}: ${summary.verified}/${summary.expected} verified, ${summary["Missing"]} missing, ${summary["Location mismatch"]} location mismatches`, context: buildContext(req, "Physical Audit") });
    res.json({ ok: true, summary });
  } catch (e) { handleError(res, e); }
});

/* ─── Running audits that include a given asset (for the QR scan page) ───── */

router.get("/asset-audits/for-asset/:assetId", requireAuth, async (req, res) => {
  try {
    const assetId = Number(req.params.assetId);
    const rows = await db.select({ id: assetAuditsTable.id, auditNo: assetAuditsTable.auditNo, name: assetAuditsTable.name, scopeLocations: assetAuditsTable.scopeLocations,
      itemResult: assetAuditItemsTable.result, expectedLocation: assetAuditItemsTable.expectedLocation })
      .from(assetAuditsTable).leftJoin(assetAuditItemsTable, and(eq(assetAuditItemsTable.auditId, assetAuditsTable.id), eq(assetAuditItemsTable.assetId, assetId)))
      .where(eq(assetAuditsTable.status, "In Progress")).orderBy(desc(assetAuditsTable.createdAt));
    res.json(rows);
  } catch (e) { handleError(res, e); }
});

export default router;
