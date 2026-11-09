import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess, can } from "../lib/rbac";

/*
 * Device data (IT): what the agents report, searchable — daily usage per Windows user, applications, hardware / security
 * inventory, installed software — and the per-employee tracking rules an administrator sets.
 */
const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); }
};
/** ITH-074: how people use their computers (usage, applications) is for Super Admin only. */
async function isSuper(req: Request) { const a = await getAccess(req); return !!a?.isAdmin; }
async function isIT(req: Request) { const a = await getAccess(req); return !!a && (a.isAdmin || can(a, "asset_registry", "read")); }
const day = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null;
const like = (q: unknown) => { const t = String(q || "").trim().toLowerCase(); return t ? `%${t}%` : null; };
/** Employee of a device: register holder when issued, else the employee of the installer key. */
const EMP = sql`coalesce(CASE WHEN s.status = 'Allocated' THEN s.owner_id END, g.user_id)`;
const FROM = sql`FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id LEFT JOIN users e ON e.id = ${EMP} LEFT JOIN agent_tracking_rules t ON t.user_id = e.id`;
const range = (req: Request) => {
  const to = day(req.query.to) || new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);
  const from = day(req.query.from) || new Date(new Date(to).getTime() - 6 * 86400e3).toISOString().slice(0, 10);
  return { from, to };
};

/** Daily usage: one row per computer, Windows user and day. */
router.get("/asset-agents/data/usage", requireAuth, wrap(async (req, res) => {
  if (!await isSuper(req)) return fail(res, 403, "Usage data is available to Super Admin only");
  const { from, to } = range(req); const q = like(req.query.q);
  const rows = rowsOf(await db.execute(sql`SELECT g.id AS "agentId", g.hostname, s.asset_tag AS "assetTag", e.id AS "employeeId", e.employee_code AS "employeeCode", e.name AS "employee", e.department,
      to_char(u.day, 'YYYY-MM-DD') AS day, u.user_name AS "windowsUser", u.first_seen AS "firstSeen", u.last_seen AS "lastSeen", u.active_mins AS active, u.idle_mins AS idle,
      (SELECT k FROM jsonb_each_text(u.apps) AS x(k, v) ORDER BY v::int DESC LIMIT 1) AS "topApp", coalesce(t.level, 'standard') AS tracking
    FROM asset_usage_daily u JOIN asset_agents g ON g.id = u.agent_id LEFT JOIN assets s ON s.id = g.asset_id LEFT JOIN users e ON e.id = ${EMP} LEFT JOIN agent_tracking_rules t ON t.user_id = e.id
    WHERE u.day BETWEEN ${from}::date AND ${to}::date
      AND (${q}::text IS NULL OR lower(concat_ws(' ', g.hostname, g.serial_number, s.asset_tag, e.name, e.employee_code, e.email, e.department, u.user_name)) LIKE ${q})
    ORDER BY u.day DESC, u.active_mins DESC LIMIT 5000`));
  res.json({ from, to, rows });
}));

/** Applications: active minutes per application, with how many people / computers used it. Optional employee / device filter. */
router.get("/asset-agents/data/apps", requireAuth, wrap(async (req, res) => {
  if (!await isSuper(req)) return fail(res, 403, "Usage data is available to Super Admin only");
  const { from, to } = range(req); const q = like(req.query.q); const app = like(req.query.app);
  const rows = rowsOf(await db.execute(sql`SELECT x.k AS app, sum(x.v::int)::int AS mins, count(DISTINCT u.user_name)::int AS users, count(DISTINCT u.agent_id)::int AS devices, count(DISTINCT u.day)::int AS days,
      (SELECT string_agg(DISTINCT coalesce(e2.name, u2.user_name), ', ') FROM asset_usage_daily u2 JOIN asset_agents g2 ON g2.id = u2.agent_id LEFT JOIN assets s2 ON s2.id = g2.asset_id
         LEFT JOIN users e2 ON e2.id = coalesce(CASE WHEN s2.status = 'Allocated' THEN s2.owner_id END, g2.user_id)
         WHERE u2.day BETWEEN ${from}::date AND ${to}::date AND u2.apps ? x.k) AS people
    FROM asset_usage_daily u JOIN asset_agents g ON g.id = u.agent_id LEFT JOIN assets s ON s.id = g.asset_id LEFT JOIN users e ON e.id = ${EMP}, jsonb_each_text(u.apps) AS x(k, v)
    WHERE u.day BETWEEN ${from}::date AND ${to}::date
      AND (${q}::text IS NULL OR lower(concat_ws(' ', g.hostname, s.asset_tag, e.name, e.employee_code, e.email, u.user_name)) LIKE ${q})
      AND (${app}::text IS NULL OR lower(x.k) LIKE ${app})
    GROUP BY x.k ORDER BY mins DESC LIMIT 500`));
  const total = rowsOf(await db.execute(sql`SELECT coalesce(sum(u.active_mins), 0)::int AS active FROM asset_usage_daily u JOIN asset_agents g ON g.id = u.agent_id LEFT JOIN assets s ON s.id = g.asset_id LEFT JOIN users e ON e.id = ${EMP}
    WHERE u.day BETWEEN ${from}::date AND ${to}::date AND (${q}::text IS NULL OR lower(concat_ws(' ', g.hostname, s.asset_tag, e.name, e.employee_code, e.email, u.user_name)) LIKE ${q})`))[0];
  res.json({ from, to, totalActive: total.active, rows });
}));

/** Inventory: latest hardware / OS / security reported by each computer. */
router.get("/asset-agents/data/inventory", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "No access to device data");
  const q = like(req.query.q);
  const rows = rowsOf(await db.execute(sql`SELECT g.id AS "agentId", g.hostname, g.serial_number AS "serial", g.manufacturer, g.model, g.platform, g.os_name AS "os", g.os_version AS "osVersion", g.agent_version AS "agentVersion",
      g.last_user AS "lastUser", g.last_ip AS "ip", g.last_seen_at AS "lastSeenAt", g.health_state AS "health", g.status, s.asset_tag AS "assetTag", e.employee_code AS "employeeCode", e.name AS "employee", e.department,
      g.latest->'cpu'->>'name' AS cpu, g.latest->'mem'->>'totalGb' AS "memGb",
      (SELECT string_agg((d->>'drive') || ' ' || coalesce(d->>'freeGb', '?') || '/' || coalesce(d->>'sizeGb', '?') || ' GB', ', ') FROM jsonb_array_elements(coalesce(g.latest->'disks', '[]'::jsonb)) d WHERE coalesce((d->>'sizeGb')::numeric, 0) >= 1) AS disks,
      g.latest->'battery'->>'healthPct' AS "batteryPct",
      (SELECT string_agg((a->>'name') || CASE WHEN (a->>'enabled')::boolean THEN ' on' ELSE ' OFF' END, ', ') FROM jsonb_array_elements(coalesce(g.latest->'security'->'av', '[]'::jsonb)) a) AS antivirus,
      (SELECT string_agg((b->>'drive') || ' ' || coalesce(b->>'status', ''), ', ') FROM jsonb_array_elements(coalesce(g.latest->'security'->'bitlocker', '[]'::jsonb)) b) AS bitlocker,
      g.latest->'patches'->>'lastInstalled' AS "lastPatch", g.latest->>'uptimeHours' AS "uptimeHours", coalesce(t.level, 'standard') AS tracking
    ${FROM} WHERE (${q}::text IS NULL OR lower(concat_ws(' ', g.hostname, g.serial_number, g.model, g.os_name, s.asset_tag, e.name, e.employee_code, e.email, g.last_user, g.last_ip)) LIKE ${q})
    ORDER BY g.status = 'Active' DESC, g.hostname LIMIT 3000`));
  res.json({ rows });
}));

/** Installed software across the fleet: which computers have it. */
router.get("/asset-agents/data/software", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "No access to device data");
  const q = like(req.query.q); const who = like(req.query.who);
  const rows = rowsOf(await db.execute(sql`SELECT w.name, w.version, w.publisher, count(DISTINCT w.agent_id)::int AS devices,
      string_agg(DISTINCT g.hostname || coalesce(' (' || e.name || ')', ''), ', ') AS computers
    FROM asset_software w JOIN asset_agents g ON g.id = w.agent_id AND g.status = 'Active' LEFT JOIN assets s ON s.id = g.asset_id LEFT JOIN users e ON e.id = ${EMP}
    WHERE (${q}::text IS NULL OR lower(concat_ws(' ', w.name, w.publisher, w.version)) LIKE ${q})
      AND (${who}::text IS NULL OR lower(concat_ws(' ', g.hostname, s.asset_tag, e.name, e.employee_code)) LIKE ${who})
    GROUP BY w.name, w.version, w.publisher ORDER BY devices DESC, w.name LIMIT 2000`));
  res.json({ rows });
}));

/* ── tracking rules (administrators) ────────────────────────────────────── */
const LEVELS = ["standard", "usage", "detailed", "excluded"];
router.get("/asset-agents/tracking", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "No access to device data");
  const [st] = rowsOf(await db.execute(sql`SELECT value FROM settings WHERE key = 'assetAgent.trackApps'`));
  res.json({ globalApps: st?.value !== false && st?.value !== "false", rules: rowsOf(await db.execute(sql`SELECT t.user_id AS "userId", t.level, t.reason, t.set_by AS "setBy", t.set_at AS "setAt", u.name, u.employee_code AS "employeeCode", u.department,
    (SELECT count(*)::int FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE g.status = 'Active' AND ${EMP} = t.user_id) AS devices
    FROM agent_tracking_rules t JOIN users u ON u.id = t.user_id ORDER BY u.name`)) });
}));
router.put("/asset-agents/tracking/:userId", requireAuth, wrap(async (req, res) => {
  const a = await getAccess(req); if (!a?.isAdmin) return fail(res, 403, "Only an administrator can change what is tracked");
  const userId = Number(req.params.userId); const level = String(req.body?.level || "");
  if (!LEVELS.includes(level)) return fail(res, 400, "Choose standard, usage only, detailed or excluded");
  const reason = String(req.body?.reason || "").trim().slice(0, 500);
  if (reason.length < 10) return fail(res, 400, "Give the reason (at least 10 characters) — it is kept in the audit log");
  const [u] = rowsOf(await db.execute(sql`SELECT id, name, employee_code FROM users WHERE id = ${userId}`)); if (!u) return fail(res, 404, "Employee not found");
  const by = await getPerformedBy((req.session as any)?.userId).catch(() => "Admin");
  const [old] = rowsOf(await db.execute(sql`SELECT level FROM agent_tracking_rules WHERE user_id = ${userId}`));
  if (level === "standard") await db.execute(sql`DELETE FROM agent_tracking_rules WHERE user_id = ${userId}`);
  else await db.execute(sql`INSERT INTO agent_tracking_rules (user_id, level, reason, set_by) VALUES (${userId}, ${level}, ${reason}, ${by})
    ON CONFLICT (user_id) DO UPDATE SET level = EXCLUDED.level, reason = EXCLUDED.reason, set_by = EXCLUDED.set_by, set_at = now()`);
  let purged = 0;
  if (req.body?.purge && (level === "excluded" || level === "usage")) {
    const ids = sql`(SELECT g.id FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE ${EMP} = ${userId})`;
    purged = rowsOf(level === "excluded"
      ? await db.execute(sql`DELETE FROM asset_usage_daily WHERE agent_id IN ${ids} RETURNING 1`)
      : await db.execute(sql`UPDATE asset_usage_daily SET apps = '{}'::jsonb WHERE agent_id IN ${ids} AND apps <> '{}'::jsonb RETURNING 1`)).length;
  }
  const label: Record<string, string> = { standard: "Standard", usage: "Usage only (no applications)", detailed: "Detailed (usage + applications)", excluded: "Excluded (no usage tracking)" };
  await logAudit({ entityType: "agent_tracking", entityId: userId, action: level === "standard" ? "reset" : level, performedBy: by,
    newValues: { employee: `${u.name} (${u.employee_code || "-"})`, from: old?.level || "standard", to: level, reason, purgedDays: purged },
    summary: `Tracking for ${u.name} (${u.employee_code || "-"}): ${label[old?.level || "standard"]} → ${label[level]} — ${reason}${purged ? ` · ${purged} day(s) of collected data ${level === "excluded" ? "deleted" : "stripped of applications"}` : ""}` });
  res.json({ ok: true, purged });
}));

export default router;
