/**
 * ITH-077 — user status, shown as a coloured dot wherever people appear (chats, people search, lists):
 *   Online (green)   active in IT Hub in the last 5 minutes
 *   Away (amber)     no activity for 5 minutes up to 4 hours
 *   Do not disturb (red) set by the person (until a time, or until turned off)
 *   Offline (grey)   no activity for more than 4 hours
 * The app sends a small heartbeat once a minute while the person is actually using it (mouse / keyboard in the last
 * 2 minutes, page visible) — nothing is tracked outside IT Hub.
 */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); }
};
const uid = (req: Request) => Number((req.session as any)?.userId) || 0;

/** SQL for a user's status (u = users alias). */
export const PRESENCE = (u = "u") => sql.raw(`CASE WHEN ${u}.presence_mode = 'dnd' AND (${u}.dnd_until IS NULL OR ${u}.dnd_until > now()) THEN 'dnd'
  WHEN ${u}.last_active_at > now() - interval '5 minutes' THEN 'online'
  WHEN ${u}.last_active_at > now() - interval '4 hours' THEN 'away' ELSE 'offline' END`);

const last = new Map<number, number>();
router.post("/presence/heartbeat", requireAuth, wrap(async (req, res) => {
  const id = uid(req); const now = Date.now();
  if ((last.get(id) || 0) < now - 45_000) { last.set(id, now); await db.execute(sql`UPDATE users SET last_active_at = now() WHERE id = ${id}`); }
  res.json({ ok: true });
}));
router.get("/presence/me", requireAuth, wrap(async (req, res) => {
  const [r] = rowsOf(await db.execute(sql`SELECT ${PRESENCE()} AS status, u.presence_mode AS mode, u.dnd_until AS "dndUntil", u.last_active_at AS "lastActiveAt" FROM users u WHERE u.id = ${uid(req)}`));
  res.json(r || { status: "offline" });
}));
/** Set my status: auto (Online / Away / Offline from activity) or dnd (optionally until a time). */
router.put("/presence/me", requireAuth, wrap(async (req, res) => {
  const mode = req.body?.mode === "dnd" ? "dnd" : "auto";
  const mins = Number(req.body?.minutes) || 0;
  const until = mode === "dnd" && mins > 0 ? new Date(Date.now() + Math.min(mins, 7 * 1440) * 60_000) : null;
  await db.execute(sql`UPDATE users SET presence_mode = ${mode}, dnd_until = ${until}, last_active_at = now() WHERE id = ${uid(req)}`);
  await logAudit({ entityType: "user", entityId: uid(req), action: "presence", performedBy: await getPerformedBy(uid(req)).catch(() => "User"), summary: mode === "dnd" ? `Status set to Do not disturb${until ? ` until ${until.toISOString()}` : ""}` : "Status set to automatic (Online / Away / Offline)" }).catch(() => {});
  const [r] = rowsOf(await db.execute(sql`SELECT ${PRESENCE()} AS status, u.presence_mode AS mode, u.dnd_until AS "dndUntil" FROM users u WHERE u.id = ${uid(req)}`));
  res.json(r);
}));
/** Status of several people: ?ids=1,2,3 (max 200). */
router.get("/presence", requireAuth, wrap(async (req, res) => {
  const ids = String(req.query.ids || "").split(",").map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200);
  if (!ids.length) return res.json({});
  const rows = rowsOf(await db.execute(sql`SELECT u.id, ${PRESENCE()} AS status, u.dnd_until AS "dndUntil", u.last_active_at AS "lastActiveAt" FROM users u WHERE u.id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`));
  res.json(Object.fromEntries(rows.map(r => [r.id, { status: r.status, dndUntil: r.dndUntil, lastActiveAt: r.lastActiveAt }])));
}));

export default router;
