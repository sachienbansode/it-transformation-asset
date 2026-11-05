import { Router, Response } from "express";
import { db, assetsTable, assetAllocationsTable, assetTransactionsTable, assetContractsTable, assetAuditsTable, maintenanceRecordsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { resolveInput, accumulated, fyOf, fyStart, fyLabel, today } from "../lib/depreciation";
import { loadRules, coverageMap, warrantyState, contractState, coversOn } from "./asset-finance";
import { complianceReport } from "./asset-licenses";

/* One call that feeds the Asset Dashboard: inventory, handovers, warranty / AMC, contracts, depreciation, licenses, audits. */

const router = Router();
const handleError = (res: Response, e: unknown) => res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
const GONE = ["Disposed", "Lost / Stolen"];
const inc = (m: Record<string, number>, k: string | null | undefined, by = 1) => { const key = k && String(k).trim() ? String(k).trim() : "Not set"; m[key] = (m[key] || 0) + by; };
const top = (m: Record<string, number>, n = 99) => Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, n);

router.get("/asset-dashboard", requireAuth, async (_req, res) => {
  try {
    const on = today();
    const monthStart = on.slice(0, 8) + "01";
    const fy = fyOf(on);
    const assets = await db.select().from(assetsTable).where(eq(assetsTable.isActive, true));
    const live = assets.filter(a => !GONE.includes(a.status));            // still on the books (incl. Retired, until disposed)
    const inService = live.filter(a => a.status !== "Retired");             // in use / in stock / in repair
    const rules = await loadRules();
    const cover = await coverageMap(on);

    const byStatus: Record<string, number> = {}, byType: Record<string, number> = {}, byLocation: Record<string, number> = {}, byDept: Record<string, number> = {}, spare: Record<string, number> = {};
    const age: Record<string, number> = { "< 1 yr": 0, "1–2 yrs": 0, "2–3 yrs": 0, "3–4 yrs": 0, "4+ yrs": 0, "Unknown": 0 };
    let cost = 0, book = 0, depFy = 0, missingFinance = 0, pastLife = 0;
    const w = { covered: 0, inWarranty: 0, expiring30: 0, expiring90: 0, expired: 0, unknown: 0, underAmc: 0, notCovered: 0 };
    const expiringList: any[] = [];
    for (const a of assets) inc(byStatus, a.status);
    for (const a of live) {
      const serving = a.status !== "Retired";
      if (serving) { inc(byType, a.type); inc(byLocation, a.location); inc(byDept, a.department); }
      if (a.status === "In Stock") inc(spare, a.type);
      if (serving && a.purchaseDate && /^\d{4}-\d{2}-\d{2}$/.test(a.purchaseDate)) {
        const yrs = (Date.parse(on) - Date.parse(a.purchaseDate)) / (365.25 * 86_400_000);
        age[yrs < 1 ? "< 1 yr" : yrs < 2 ? "1–2 yrs" : yrs < 3 ? "2–3 yrs" : yrs < 4 ? "3–4 yrs" : "4+ yrs"]++;
      } else if (serving) age.Unknown++;
      const { input } = resolveInput(a, rules);
      if (input) {
        const acc = accumulated(input, on);
        cost += input.cost; book += input.cost - acc;
        const before = input.purchaseDate < fyStart(fy) ? accumulated(input, `${fy}-03-31`) : 0;
        depFy += acc - before;
        if (input.method !== "None" && input.cost - acc - input.salvage < 0.01) pastLife++;
      } else missingFinance++;
      if (!serving) continue; // retired assets: on the books (above) but not counted for age, warranty or AMC
      const ws = warrantyState(a.warrantyExpiry, on);
      const amc = cover.get(a.id) || [];
      if (amc.length) w.underAmc++;
      if (amc.length || ws.warranty === "In warranty" || ws.warranty === "Expiring") w.covered++;
      if (ws.warranty === "In warranty") w.inWarranty++;
      else if (ws.warranty === "Expiring") { w.expiring90++; if (ws.warrantyDays! <= 30) w.expiring30++; if (!amc.length) expiringList.push({ id: a.id, assetTag: a.assetTag, name: a.name, ownerName: a.ownerName, warrantyExpiry: a.warrantyExpiry, days: ws.warrantyDays }); }
      else if (ws.warranty === "Expired") w.expired++;
      else w.unknown++;
      if (!amc.length && (ws.warranty === "Expired")) w.notCovered++;
    }

    const allocs = await db.select({ status: assetAllocationsTable.status, ackStatus: assetAllocationsTable.ackStatus, allocationType: assetAllocationsTable.allocationType,
      expectedReturnDate: assetAllocationsTable.expectedReturnDate, createdAt: assetAllocationsTable.createdAt, returnedAt: assetAllocationsTable.returnedAt, issuedBy: assetAllocationsTable.issuedBy }).from(assetAllocationsTable);
    const activeAllocs = allocs.filter(a => a.status === "Active");
    const handovers = {
      active: activeAllocs.length,
      pendingAck: activeAllocs.filter(a => a.ackStatus === "Pending").length,
      issuedThisMonth: allocs.filter(a => a.createdAt && a.createdAt.toISOString().slice(0, 10) >= monthStart && a.issuedBy !== "Asset register upload").length,
      returnedThisMonth: allocs.filter(a => a.returnedAt && a.returnedAt.toISOString().slice(0, 10) >= monthStart).length,
      overdueReturns: activeAllocs.filter(a => a.expectedReturnDate && a.expectedReturnDate < on).length,
    };

    const contracts = (await db.select().from(assetContractsTable).where(eq(assetContractsTable.isActive, true))).map(c => ({ ...c, ...contractState(c, on) }));
    const contractSummary = {
      active: contracts.filter(c => coversOn(c, on)).length,
      expiring: contracts.filter(c => c.state === "Expiring").length,
      expired: contracts.filter(c => c.state === "Expired").length,
      value: Math.round(contracts.filter(c => coversOn(c, on)).reduce((t, c) => t + Number(c.value || 0), 0)),
      upcoming: contracts.filter(c => c.state === "Expiring" || (c.state === "Active" && c.daysLeft <= 90)).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 6)
        .map(c => ({ id: c.id, contractNo: c.contractNo, title: c.title, contractType: c.contractType, vendorName: c.vendorName, endDate: c.endDate, daysLeft: c.daysLeft, value: c.value })),
    };

    const lic = await complianceReport();
    const [maint] = await db.select({ open: sql<number>`count(*) filter (where status in ('Scheduled', 'In Progress'))::int` }).from(maintenanceRecordsTable);
    const audits = await db.select({ id: assetAuditsTable.id, auditNo: assetAuditsTable.auditNo, name: assetAuditsTable.name, status: assetAuditsTable.status, completedAt: assetAuditsTable.completedAt, summary: assetAuditsTable.summary })
      .from(assetAuditsTable).orderBy(desc(assetAuditsTable.createdAt));
    const lastAudit = audits.find(a => a.status === "Completed") || null;

    const activity = await db.select({ id: assetTransactionsTable.id, assetId: assetTransactionsTable.assetId, action: assetTransactionsTable.action, notes: assetTransactionsTable.notes, comment: assetTransactionsTable.comment,
      userName: assetTransactionsTable.userName, createdAt: assetTransactionsTable.createdAt, assetTag: assetsTable.assetTag, assetName: assetsTable.name })
      .from(assetTransactionsTable).leftJoin(assetsTable, eq(assetsTable.id, assetTransactionsTable.assetId))
      .where(sql`${assetTransactionsTable.action} <> 'Imported'`).orderBy(desc(assetTransactionsTable.createdAt)).limit(10);

    // What needs attention, most important first
    const attention: { level: "high" | "medium" | "low"; text: string; href: string; count: number }[] = [];
    const add = (level: "high" | "medium" | "low", count: number, text: string, href: string) => { if (count > 0) attention.push({ level, count, text, href }); };
    add("high", lic.summary.underLicensed + lic.summary.expiredInUse, "licenses out of compliance", "/asset-licenses?tab=compliance");
    add("high", contractSummary.expired, "contracts expired (not renewed)", "/asset-contracts");
    add("high", handovers.overdueReturns, "temporary handovers past their return date", "/asset-allocations");
    add("medium", contractSummary.expiring, "contracts due for renewal", "/asset-contracts");
    add("medium", expiringList.length, "assets going out of warranty within 90 days with no AMC", "/asset-contracts?tab=warranty");
    add("medium", lic.summary.expiring, "licenses expiring soon", "/asset-licenses");
    add("medium", lic.summary.reclaimSeats, "license seats to reclaim (disposed devices / leavers)", "/asset-licenses?tab=compliance");
    add("low", handovers.pendingAck, "handovers awaiting the employee's acknowledgement", "/asset-allocations");
    add("low", missingFinance, "assets without purchase date or cost (no warranty / depreciation)", "/asset-depreciation?tab=missing");
    add("low", pastLife, "assets fully depreciated — candidates for refresh", "/asset-depreciation");

    res.json({
      asOf: on, fyLabel: fyLabel(fy),
      inventory: {
        total: inService.length, all: assets.length,
        deployed: live.filter(a => a.status === "Allocated" || a.status === "In Use").length,
        inStock: live.filter(a => a.status === "In Stock").length,
        maintenance: live.filter(a => a.status === "Under Maintenance").length,
        retired: live.filter(a => a.status === "Retired").length,
        disposed: assets.filter(a => GONE.includes(a.status)).length,
        byStatus: top(byStatus), byType: top(byType), byLocation: top(byLocation, 10), byDepartment: top(byDept, 10), spare: top(spare), age: Object.entries(age).map(([name, value]) => ({ name, value })),
      },
      handovers, warranty: { ...w, expiringNoAmc: expiringList.sort((a, b) => a.days - b.days).slice(0, 6), expiringNoAmcCount: expiringList.length },
      contracts: contractSummary,
      finance: { cost: Math.round(cost), bookValue: Math.round(book), depreciationFy: Math.round(depFy), missingFinance, pastLife },
      licenses: lic.summary,
      maintenance: { open: maint?.open || 0 },
      audits: { open: audits.filter(a => a.status === "Planned" || a.status === "In Progress").length, last: lastAudit },
      attention, activity,
    });
  } catch (e) { handleError(res, e); }
});

/*
 * Inventory analytics for the dashboard: one row per asset on the books with a stock bucket and a condition, plus
 * people / login analytics. The page groups and drills down (type, location, department, holder) in the browser.
 *  Buckets: Assigned · Available (good, unassigned) · Needs repair (unassigned, damaged / not working) · Under repair
 *           · Retired (awaiting disposal) · Lost / Stolen · Disposed
 *  Condition: latest known (return / issue condition, open maintenance, agent health) → Good / Fair / Damaged.
 */
router.get("/asset-analytics", requireAuth, async (_req, res) => {
  try {
    const rowsOf = (r: any) => (r.rows ?? r) as any[];
    const rows = rowsOf(await db.execute(sql`
      WITH last_alloc AS (
        SELECT DISTINCT ON (asset_id) asset_id, status, issue_condition, return_condition, start_date, end_date, user_id, user_name, email, employee_code
        FROM asset_allocations ORDER BY asset_id, created_at DESC, id DESC),
      open_maint AS (SELECT asset_id, count(*)::int AS n FROM maintenance_records WHERE status IN ('Scheduled', 'In Progress') GROUP BY asset_id),
      agent AS (SELECT DISTINCT ON (asset_id) asset_id, health_state, last_user, last_seen_at, hostname, user_id,
                  (SELECT max(day) FROM asset_usage_daily u WHERE u.agent_id = g.id AND u.active_mins >= 15) AS last_active_day
                FROM asset_agents g WHERE status = 'Active' AND asset_id IS NOT NULL ORDER BY asset_id, last_seen_at DESC NULLS LAST)
      SELECT s.id, s.asset_tag AS "assetTag", s.name, s.type, s.status, coalesce(nullif(s.location, ''), 'Not set') AS location, coalesce(nullif(s.department, ''), 'Not set') AS department,
             s.owner_name AS "ownerName", s.owner_email AS "ownerEmail", s.owner_employee_code AS "ownerCode", s.serial_number AS "serialNumber", s.vendor_name AS vendor,
             s.purchase_date AS "purchaseDate", s.warranty_expiry AS "warrantyExpiry", s.cost::float AS cost,
             la.issue_condition AS "issueCondition", la.return_condition AS "returnCondition", la.status AS "allocStatus", la.start_date AS "holdingSince",
             coalesce(om.n, 0) AS "openMaintenance",
             ag.health_state AS "deviceHealth", ag.last_user AS "deviceUser", ag.last_seen_at AS "deviceSeenAt", ag.hostname, ag.last_active_day AS "lastActiveDay",
             u.is_active AS "holderActive", u.last_login_at AS "holderLastLogin", u.name AS "holderUserName"
      FROM assets s
      LEFT JOIN last_alloc la ON la.asset_id = s.id
      LEFT JOIN open_maint om ON om.asset_id = s.id
      LEFT JOIN agent ag ON ag.asset_id = s.id
      LEFT JOIN users u ON u.id = coalesce(la.user_id, s.owner_id) OR (la.user_id IS NULL AND s.owner_id IS NULL AND s.owner_email IS NOT NULL AND lower(u.email) = lower(s.owner_email))
      WHERE s.is_active`));
    const on = today();
    const bad = (c: any) => /damaged|not working/i.test(String(c || ""));
    const assigned = (st: string) => st === "Allocated" || st === "In Use";
    const norm = (x: string) => String(x || "").toLowerCase().replace(/^.*\\/, "").replace(/@.*$/, "").replace(/[^a-z0-9]/g, "");
    const out = rows.map(r => {
      const lastCond = r.allocStatus && r.allocStatus !== "Active" ? r.returnCondition : r.issueCondition;
      const condition = r.status === "Under Maintenance" || r.openMaintenance > 0 || bad(lastCond) ? "Damaged / in repair" : r.deviceHealth === "Critical" ? "Health issue" : /fair/i.test(String(lastCond || "")) ? "Fair" : "Good";
      const bucket = ["Disposed"].includes(r.status) ? "Disposed" : r.status === "Lost / Stolen" ? "Lost / Stolen" : r.status === "Retired" ? "Retired" : r.status === "Under Maintenance" ? "Under repair"
        : assigned(r.status) ? "Assigned" : r.status === "In Stock" ? (condition === "Damaged / in repair" ? "Needs repair" : "Available") : r.status;
      const ageYears = r.purchaseDate && /^\d{4}-\d{2}-\d{2}$/.test(r.purchaseDate) ? Math.floor((Date.parse(on) - Date.parse(r.purchaseDate)) / (365.25 * 86_400_000)) : null;
      // device signed-in user vs the person it is assigned to
      let mismatch = false;
      if (assigned(r.status) && r.deviceUser) {
        const du = norm(r.deviceUser), keys = [norm(r.ownerEmail || ""), norm(r.ownerCode || ""), ...String(r.ownerName || "").toLowerCase().split(/\s+/).map(norm)].filter(k => k.length >= 3);
        mismatch = !keys.some(k => du.includes(k) || k.includes(du));
      }
      const idleDays = r.lastActiveDay ? Math.floor((Date.parse(on) - Date.parse(String(r.lastActiveDay).slice(0, 10))) / 86_400_000) : null;
      return { ...r, condition, bucket, ageYears, ageBand: ageYears === null ? "Unknown" : ageYears < 1 ? "< 1 yr" : ageYears < 3 ? "1–3 yrs" : ageYears < 5 ? "3–5 yrs" : "5+ yrs",
        warranty: !r.warrantyExpiry ? "Unknown" : r.warrantyExpiry < on ? "Expired" : r.warrantyExpiry <= new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10) ? "Expiring" : "In warranty",
        mismatch, idleDays, holderInactive: assigned(r.status) && r.holderActive === false };
    });
    // people & logins
    const [p] = rowsOf(await db.execute(sql`SELECT count(*) FILTER (WHERE is_active)::int AS active, count(*) FILTER (WHERE NOT is_active)::int AS inactive,
        count(*) FILTER (WHERE is_active AND last_login_at > now() - interval '7 days')::int AS "login7d", count(*) FILTER (WHERE is_active AND last_login_at > now() - interval '30 days')::int AS "login30d",
        count(*) FILTER (WHERE is_active AND last_login_at IS NULL)::int AS "neverLoggedIn", count(*) FILTER (WHERE is_active AND coalesce(user_type, 'internal') = 'external')::int AS external FROM users`));
    const holders = rowsOf(await db.execute(sql`SELECT lower(coalesce(nullif(owner_employee_code, ''), nullif(owner_email, ''), owner_name)) AS k, max(owner_name) AS name, count(*)::int AS n,
        string_agg(asset_tag || ' (' || type || ')', ', ' ORDER BY asset_tag) AS assets
      FROM assets WHERE is_active AND status IN ('Allocated', 'In Use') AND coalesce(owner_name, owner_email) IS NOT NULL GROUP BY 1 ORDER BY n DESC`));
    const loginTrend = rowsOf(await db.execute(sql`SELECT to_char(d, 'YYYY-MM-DD') AS day, (SELECT count(DISTINCT performed_by)::int FROM audit_logs a WHERE a.action = 'login' AND (a.performed_at AT TIME ZONE 'Asia/Kolkata')::date = d) AS users
      FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - 29, (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day') d`).catch(() => [] as any));
    const multi = holders.filter(h => h.n > 1);
    res.json({ asOf: on, assets: out,
      people: { ...p, holders: holders.length, multiAssetHolders: multi.length, multi: multi.slice(0, 25), loginTrend,
        inactiveHolders: out.filter(a => a.holderInactive).map(a => ({ assetTag: a.assetTag, type: a.type, ownerName: a.ownerName })),
        mismatches: out.filter(a => a.mismatch).map(a => ({ assetTag: a.assetTag, type: a.type, ownerName: a.ownerName, deviceUser: a.deviceUser, hostname: a.hostname })) } });
  } catch (e) { handleError(res, e); }
});

export default router;
