import { Router, type Request, type Response } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess, can } from "../lib/rbac";

/*
 * Device Health support:
 *  - act on health items: raise an ITSM incident (manually, or automatically per setting), ignore with a mandatory reason
 *    (ignored items do not count towards the device's health), un-ignore;
 *  - support chat between IT and the employee about a device: only IT can start a chat; the employee replies;
 *    IT resolves; the employee confirms or re-opens; resolved chats close automatically after N days.
 */

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const s = (v: unknown, max = 2000) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim().slice(0, max));
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); }
};
const uid = (req: Request) => Number((req.session as any)?.userId) || null;
async function isIT(req: Request) { const a = await getAccess(req); return !!a && (a.isAdmin || can(a, "asset_registry", "write")); }
async function setting(key: string, def: any) {
  const [r] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  let v: any = r?.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { /* keep */ } }
  return v ?? def;
}
const audit = (p: Parameters<typeof logAudit>[0]) => void logAudit(p).catch(() => {});
const notify = (userId: number, title: string, message: string, link: string, type = "info") =>
  db.execute(sql`INSERT INTO notifications (user_id, title, message, type, link) VALUES (${userId}, ${title.slice(0, 200)}, ${message.slice(0, 500)}, ${type}, ${link})`).catch(() => {});

/* ── health state ignores ignored items ──────────────────────────────────── */
export const NOT_IGNORED = sql`NOT (ignored_at IS NOT NULL AND (ignore_until IS NULL OR ignore_until > now()))`;
export async function recomputeState(agentId: number): Promise<string> {
  const [r] = rowsOf(await db.execute(sql`UPDATE asset_agents SET health_state = (
      SELECT CASE WHEN count(*) FILTER (WHERE severity = 'Critical') > 0 THEN 'Critical' WHEN count(*) > 0 THEN 'Warning' ELSE 'Healthy' END
      FROM asset_agent_alerts WHERE agent_id = ${agentId} AND closed_at IS NULL AND kind NOT IN ('idle', 'offline') AND ${NOT_IGNORED})
    WHERE id = ${agentId} RETURNING health_state`));
  return r?.health_state || "Healthy";
}

/* ── tickets ─────────────────────────────────────────────────────────────── */
function categoryFor(kind: string, server: boolean): [string, string | null][] {
  const k = kind.split(":")[0];
  const m: Record<string, [string, string]> = {
    disk: server ? ["Infrastructure", "Disk Space"] : ["Hardware", "Laptop / Desktop"], smart: ["Hardware", "Laptop / Desktop"], battery: ["Hardware", "Battery / Power"],
    antivirus: ["Security", "Malware"], "antivirus-defs": ["Security", "Malware"], bitlocker: ["Security", "Vulnerability"], firewall: ["Security", "Vulnerability"],
    patches: ["Operations", "Maintenance"], reboot: ["Operations", "Maintenance"], "pending-reboot": ["Operations", "Maintenance"],
    memory: server ? ["Infrastructure", "CPU / Memory"] : ["Hardware", "Laptop / Desktop"], cpu: server ? ["Infrastructure", "CPU / Memory"] : ["Hardware", "Laptop / Desktop"],
    offline: ["Operations", "Monitoring Alert"], uninstalled: ["Security", "Unauthorized Access"],
  };
  return [m[k] || ["Hardware", "Laptop / Desktop"], ["Hardware", "Laptop / Desktop"], ["Operations", "Monitoring Alert"]];
}
async function alertRow(id: number) {
  const [a] = rowsOf(await db.execute(sql`SELECT x.*, g.hostname, g.platform, g.serial_number, g.model, g.user_id AS agent_user, s.asset_tag, s.owner_id
    FROM asset_agent_alerts x JOIN asset_agents g ON g.id = x.agent_id LEFT JOIN assets s ON s.id = g.asset_id WHERE x.id = ${id}`));
  return a;
}
export async function raiseTicket(alertId: number, by: string, auto: boolean) {
  const a = await alertRow(alertId); if (!a) throw Object.assign(new Error("Health item not found"), { status: 404 });
  if (a.incident_id) return { ticketNo: a.ticket_no, incidentId: a.incident_id, existing: true };
  const { createSystemIncident } = await import("./itsm");
  const label = a.asset_tag ? `${a.asset_tag} (${a.hostname})` : a.hostname;
  const crit = a.severity === "Critical";
  let lastErr: any = null;
  for (const [category, subcategory] of categoryFor(a.kind, a.platform === "Server")) {
    try {
      const t = await createSystemIncident({
        title: `${label}: ${a.message}`.slice(0, 200), priority: crit ? "High" : "Medium", severity: crit ? "S2" : "S3", category, subcategory,
        description: `Raised ${auto ? "automatically " : ""}from Device Health.\nDevice: ${a.hostname}${a.asset_tag ? ` · asset ${a.asset_tag}` : ""}${a.serial_number ? ` · serial ${a.serial_number}` : ""}${a.model ? ` · ${a.model}` : ""}\nIssue: ${a.message}\nSeverity: ${a.severity} · since ${new Date(a.opened_at).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })}`,
        requesterUserId: a.owner_id || a.agent_user || null, by, affectedSystem: label, source: "Device agent",
      });
      await db.execute(sql`UPDATE asset_agent_alerts SET incident_id = ${t.id}, ticket_no = ${t.ticketNo}, ticket_auto = ${auto}, ticket_tried_at = now() WHERE id = ${alertId}`);
      return { ticketNo: t.ticketNo, incidentId: t.id, existing: false };
    } catch (e) { lastErr = e; }
  }
  await db.execute(sql`UPDATE asset_agent_alerts SET ticket_tried_at = now() WHERE id = ${alertId}`);
  throw Object.assign(new Error(`Could not raise the ticket: ${lastErr?.message || lastErr}`), { status: 400 });
}
/** Called after a device check-in: raise incidents for new open (not ignored) items per the auto-ticket setting. */
export async function autoTickets(agentId: number) {
  const mode = String(await setting("assetAgent.autoTicket", "critical"));
  if (mode === "off") return;
  const open = rowsOf(await db.execute(sql`SELECT id FROM asset_agent_alerts WHERE agent_id = ${agentId} AND closed_at IS NULL AND incident_id IS NULL AND ticket_tried_at IS NULL
    AND kind NOT IN ('idle') AND ${NOT_IGNORED} ${mode === "all" ? sql`` : sql`AND severity = 'Critical'`}`));
  for (const a of open) { try { await raiseTicket(a.id, "IT Hub agent", true); } catch (e) { console.error("auto ticket failed", e); } }
}
/** Items the device reports as fixed: note the linked incident; auto-raised incidents nobody picked up are resolved. */
export async function alertsClosed(ids: number[]) {
  if (!ids.length) return;
  const { noteIncident } = await import("./itsm");
  const rows = rowsOf(await db.execute(sql`SELECT id, incident_id, ticket_auto, message FROM asset_agent_alerts WHERE id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)}) AND incident_id IS NOT NULL`));
  for (const r of rows) { try { await noteIncident(r.incident_id, "IT Hub agent", `Device now reports this as fixed: ${r.message}`, !!r.ticket_auto); } catch (e) { console.error(e); } }
}

router.post("/asset-agents/alerts/:id/ticket", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can act on device health items");
  const by = await getPerformedBy(uid(req) ?? undefined).catch(() => "IT");
  const r = await raiseTicket(Number(req.params.id), by, false);
  if (!r.existing) audit({ entityType: "asset_agent_alert", entityId: Number(req.params.id), action: "ticket", performedBy: by, summary: `Raised ${r.ticketNo} for a device health item` });
  res.json(r);
}));

router.post("/asset-agents/alerts/:id/ignore", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can act on device health items");
  const reason = s(req.body?.reason, 500);
  if (!reason || reason.length < 10) return fail(res, 400, "Give a reason for ignoring (at least 10 characters)");
  const until = s(req.body?.until, 10);
  if (until && (!/^\d{4}-\d{2}-\d{2}$/.test(until) || new Date(until) <= new Date())) return fail(res, 400, "Ignore-until date must be in the future");
  const a = await alertRow(Number(req.params.id)); if (!a) return fail(res, 404, "Health item not found");
  if (a.closed_at) return fail(res, 400, "This item is already fixed");
  const by = await getPerformedBy(uid(req) ?? undefined).catch(() => "IT");
  await db.execute(sql`UPDATE asset_agent_alerts SET ignored_at = now(), ignored_by = ${by}, ignore_reason = ${reason}, ignore_until = ${until ? sql`${until}::date` : null} WHERE id = ${a.id}`);
  const state = await recomputeState(a.agent_id);
  if (a.incident_id) { const { noteIncident } = await import("./itsm"); await noteIncident(a.incident_id, by, `Device health item ignored${until ? ` until ${until}` : ""}: ${reason}`); }
  audit({ entityType: "asset_agent_alert", entityId: a.id, action: "ignore", performedBy: by, summary: `Ignored on ${a.hostname}: ${a.message}${until ? ` (until ${until})` : ""} — ${reason}` });
  res.json({ ok: true, state });
}));

router.post("/asset-agents/alerts/:id/unignore", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can act on device health items");
  const a = await alertRow(Number(req.params.id)); if (!a) return fail(res, 404, "Health item not found");
  const by = await getPerformedBy(uid(req) ?? undefined).catch(() => "IT");
  await db.execute(sql`UPDATE asset_agent_alerts SET ignored_at = NULL, ignored_by = NULL, ignore_reason = NULL, ignore_until = NULL WHERE id = ${a.id}`);
  const state = await recomputeState(a.agent_id);
  audit({ entityType: "asset_agent_alert", entityId: a.id, action: "unignore", performedBy: by, summary: `No longer ignored on ${a.hostname}: ${a.message}` });
  res.json({ ok: true, state });
}));

/* ── support chat ────────────────────────────────────────────────────────── */
async function autoClose() {
  const days = Math.max(1, Number(await setting("assetAgent.chatAutoCloseDays", 3)) || 3);
  const done = rowsOf(await db.execute(sql`UPDATE device_chats SET status = 'Closed', closed_at = now(), closed_by = 'System', close_note = ${`Closed automatically ${days} days after it was resolved`}
    WHERE status = 'Resolved' AND resolved_at < now() - (${days} || ' days')::interval RETURNING id`));
  for (const c of done) await db.execute(sql`INSERT INTO device_chat_messages (chat_id, sender_name, side, body) VALUES (${c.id}, 'System', 'System', ${`Closed automatically ${days} days after it was resolved.`})`);
}
const CHAT_COLS = sql`c.id, c.agent_id AS "agentId", c.alert_id AS "alertId", c.incident_id AS "incidentId", i.ticket_no AS "ticketNo", c.user_id AS "userId", u.name AS "userName", u.employee_code AS "employeeCode", u.department,
  c.subject, c.status, c.opened_by AS "openedBy", c.opened_at AS "openedAt", c.resolved_at AS "resolvedAt", c.resolved_by AS "resolvedBy", c.resolution, c.closed_at AS "closedAt", c.closed_by AS "closedBy", c.close_note AS "closeNote", c.last_msg_at AS "lastMsgAt",
  g.hostname, s.asset_tag AS "assetTag", x.message AS "alertMessage",
  (SELECT body FROM device_chat_messages m WHERE m.chat_id = c.id ORDER BY m.at DESC, m.id DESC LIMIT 1) AS "lastMessage"`;
const CHAT_FROM = sql`FROM device_chats c JOIN users u ON u.id = c.user_id JOIN asset_agents g ON g.id = c.agent_id LEFT JOIN assets s ON s.id = g.asset_id
  LEFT JOIN asset_agent_alerts x ON x.id = c.alert_id LEFT JOIN itsm_incidents i ON i.id = c.incident_id`;
async function chatMessages(id: number) {
  return rowsOf(await db.execute(sql`SELECT id, sender_name AS "senderName", side, body, at, read_at AS "readAt" FROM device_chat_messages WHERE chat_id = ${id} ORDER BY at, id`));
}
async function post(chat: any, side: "IT" | "Employee" | "System", senderId: number | null, senderName: string, body: string) {
  await db.execute(sql`INSERT INTO device_chat_messages (chat_id, sender_id, sender_name, side, body) VALUES (${chat.id}, ${senderId}, ${senderName}, ${side}, ${body})`);
  await db.execute(sql`UPDATE device_chats SET last_msg_at = now() WHERE id = ${chat.id}`);
  if (chat.incident_id && side !== "System") { const { noteIncident } = await import("./itsm"); await noteIncident(chat.incident_id, senderName, `Chat (${side === "IT" ? "IT → employee" : "employee → IT"}): ${body}`.slice(0, 2000)).catch(() => {}); }
}
const shortName = (by: string) => String(by || "").replace(/ <.*>$/, "");

/** IT: all chats. */
router.get("/asset-agents/chats", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can see device chats");
  await autoClose();
  const agent = Number(req.query.agentId) || null;
  res.json(rowsOf(await db.execute(sql`SELECT ${CHAT_COLS},
      (SELECT count(*)::int FROM device_chat_messages m WHERE m.chat_id = c.id AND m.side = 'Employee' AND m.read_at IS NULL) AS unread
    ${CHAT_FROM} WHERE (${agent}::int IS NULL OR c.agent_id = ${agent}) ORDER BY (c.status IN ('Waiting on IT')) DESC, c.last_msg_at DESC LIMIT 1000`)));
}));
/** IT starts a chat with the device's employee (optionally about one health item). */
router.post("/asset-agents/:id/chats", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can start a chat");
  const id = Number(req.params.id);
  const [g] = rowsOf(await db.execute(sql`SELECT g.*, s.owner_id, s.status AS asset_status, s.asset_tag FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE g.id = ${id}`));
  if (!g) return fail(res, 404, "Device not found");
  const userId = Number(req.body?.userId) || (g.asset_status === "Allocated" ? g.owner_id : null) || g.user_id;
  if (!userId) return fail(res, 400, "No employee is linked to this device — assign it first");
  const [u] = rowsOf(await db.execute(sql`SELECT id, name, is_active FROM users WHERE id = ${userId}`)); if (!u?.is_active) return fail(res, 400, "The employee is not an active user");
  const msg = s(req.body?.message, 4000); if (!msg) return fail(res, 400, "Write the first message");
  const alertId = Number(req.body?.alertId) || null;
  let alert: any = null; if (alertId) { [alert] = rowsOf(await db.execute(sql`SELECT id, message, incident_id FROM asset_agent_alerts WHERE id = ${alertId} AND agent_id = ${id}`)); if (!alert) return fail(res, 400, "Health item not found on this device"); }
  const subject = s(req.body?.subject, 200) || (alert ? alert.message : `Your computer ${g.hostname}`);
  const by = await getPerformedBy(uid(req) ?? undefined).catch(() => "IT"); const name = shortName(by);
  const [c] = rowsOf(await db.execute(sql`INSERT INTO device_chats (agent_id, alert_id, incident_id, user_id, subject, opened_by, opened_by_id) VALUES (${id}, ${alertId}, ${alert?.incident_id ?? null}, ${userId}, ${subject}, ${name}, ${uid(req)}) RETURNING *`));
  await post(c, "IT", uid(req), name, msg);
  await notify(userId, `IT Support: ${subject}`, `${name}: ${msg}`, `/my-it-chats?c=${c.id}`);
  audit({ entityType: "device_chat", entityId: c.id, action: "open", performedBy: by, summary: `Chat with ${u.name} about ${g.hostname}: ${subject}` });
  res.status(201).json({ id: c.id });
}));
router.get("/asset-agents/chats/:cid", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can see device chats");
  const id = Number(req.params.cid);
  const [c] = rowsOf(await db.execute(sql`SELECT ${CHAT_COLS} ${CHAT_FROM} WHERE c.id = ${id}`)); if (!c) return fail(res, 404, "Chat not found");
  await db.execute(sql`UPDATE device_chat_messages SET read_at = now() WHERE chat_id = ${id} AND side = 'Employee' AND read_at IS NULL`);
  res.json({ chat: c, messages: await chatMessages(id) });
}));
router.post("/asset-agents/chats/:cid/messages", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can reply here");
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM device_chats WHERE id = ${Number(req.params.cid)}`)); if (!c) return fail(res, 404, "Chat not found");
  const msg = s(req.body?.message, 4000); if (!msg) return fail(res, 400, "Write a message");
  const by = shortName(await getPerformedBy(uid(req) ?? undefined).catch(() => "IT"));
  if (c.status === "Resolved" || c.status === "Closed") { await db.execute(sql`UPDATE device_chats SET resolved_at = NULL, resolved_by = NULL, closed_at = NULL, closed_by = NULL WHERE id = ${c.id}`); await post(c, "System", null, "System", `Re-opened by ${by}.`); }
  await db.execute(sql`UPDATE device_chats SET status = 'Waiting on employee' WHERE id = ${c.id}`);
  await post(c, "IT", uid(req), by, msg);
  await notify(c.user_id, `IT Support: ${c.subject}`, `${by}: ${msg}`, `/my-it-chats?c=${c.id}`);
  res.json({ ok: true });
}));
router.post("/asset-agents/chats/:cid/resolve", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can resolve a chat");
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM device_chats WHERE id = ${Number(req.params.cid)}`)); if (!c) return fail(res, 404, "Chat not found");
  if (c.status === "Resolved" || c.status === "Closed") return fail(res, 400, `This chat is already ${c.status.toLowerCase()}`);
  const note = s(req.body?.resolution, 1000); if (!note || note.length < 5) return fail(res, 400, "Say how it was resolved");
  const by = shortName(await getPerformedBy(uid(req) ?? undefined).catch(() => "IT"));
  await db.execute(sql`UPDATE device_chats SET status = 'Resolved', resolved_at = now(), resolved_by = ${by}, resolution = ${note} WHERE id = ${c.id}`);
  await post(c, "System", null, "System", `Marked resolved by ${by}: ${note}`);
  const days = Number(await setting("assetAgent.chatAutoCloseDays", 3)) || 3;
  await notify(c.user_id, `Resolved: ${c.subject}`, `${by} marked this resolved. Confirm, or re-open within ${days} days if it is not fixed.`, `/my-it-chats?c=${c.id}`, "success");
  audit({ entityType: "device_chat", entityId: c.id, action: "resolve", performedBy: by, summary: `Chat resolved: ${note}` });
  res.json({ ok: true });
}));
router.post("/asset-agents/chats/:cid/close", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can close a chat");
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM device_chats WHERE id = ${Number(req.params.cid)}`)); if (!c) return fail(res, 404, "Chat not found");
  if (c.status === "Closed") return fail(res, 400, "Already closed");
  const note = s(req.body?.note, 500); if (!note || note.length < 5) return fail(res, 400, "Give a reason for closing");
  const by = shortName(await getPerformedBy(uid(req) ?? undefined).catch(() => "IT"));
  await db.execute(sql`UPDATE device_chats SET status = 'Closed', closed_at = now(), closed_by = ${by}, close_note = ${note} WHERE id = ${c.id}`);
  await post(c, "System", null, "System", `Closed by ${by}: ${note}`);
  audit({ entityType: "device_chat", entityId: c.id, action: "close", performedBy: by, summary: `Chat closed: ${note}` });
  res.json({ ok: true });
}));

/* employee side — only chats IT has opened with them */
router.get("/my-it-chats", requireAuth, wrap(async (req, res) => {
  await autoClose();
  res.json(rowsOf(await db.execute(sql`SELECT ${CHAT_COLS}, (SELECT count(*)::int FROM device_chat_messages m WHERE m.chat_id = c.id AND m.side = 'IT' AND m.read_at IS NULL) AS unread
    ${CHAT_FROM} WHERE c.user_id = ${uid(req)} ORDER BY (c.status = 'Waiting on employee') DESC, c.last_msg_at DESC LIMIT 200`)));
}));
async function myChat(req: Request) {
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM device_chats WHERE id = ${Number(req.params.cid)} AND user_id = ${uid(req)}`));
  return c;
}
router.get("/my-it-chats/:cid", requireAuth, wrap(async (req, res) => {
  const c0 = await myChat(req); if (!c0) return fail(res, 404, "Chat not found");
  const [c] = rowsOf(await db.execute(sql`SELECT ${CHAT_COLS} ${CHAT_FROM} WHERE c.id = ${c0.id}`));
  await db.execute(sql`UPDATE device_chat_messages SET read_at = now() WHERE chat_id = ${c0.id} AND side = 'IT' AND read_at IS NULL`);
  res.json({ chat: c, messages: await chatMessages(c0.id) });
}));
async function tellIT(c: any, title: string, msg: string) {
  const ids = new Set<number>(); if (c.opened_by_id) ids.add(c.opened_by_id);
  for (const r of rowsOf(await db.execute(sql`SELECT DISTINCT sender_id FROM device_chat_messages WHERE chat_id = ${c.id} AND side = 'IT' AND sender_id IS NOT NULL`))) ids.add(r.sender_id);
  for (const i of ids) await notify(i, title, msg, `/asset-agents/chats?c=${c.id}`);
}
router.post("/my-it-chats/:cid/messages", requireAuth, wrap(async (req, res) => {
  const c = await myChat(req); if (!c) return fail(res, 404, "Chat not found");
  if (c.status === "Closed") return fail(res, 400, "This chat is closed. IT will contact you if anything else is needed.");
  if (c.status === "Resolved") return fail(res, 400, "IT marked this resolved — use Re-open if it is not fixed");
  const msg = s(req.body?.message, 4000); if (!msg) return fail(res, 400, "Write a message");
  const [u] = rowsOf(await db.execute(sql`SELECT name FROM users WHERE id = ${uid(req)}`));
  await db.execute(sql`UPDATE device_chats SET status = 'Waiting on IT' WHERE id = ${c.id}`);
  await post(c, "Employee", uid(req), u?.name || "Employee", msg);
  await tellIT(c, `Reply from ${u?.name}: ${c.subject}`, msg);
  res.json({ ok: true });
}));
router.post("/my-it-chats/:cid/confirm", requireAuth, wrap(async (req, res) => {
  const c = await myChat(req); if (!c) return fail(res, 404, "Chat not found");
  if (c.status !== "Resolved") return fail(res, 400, "Only a resolved chat can be confirmed");
  const [u] = rowsOf(await db.execute(sql`SELECT name FROM users WHERE id = ${uid(req)}`));
  await db.execute(sql`UPDATE device_chats SET status = 'Closed', closed_at = now(), closed_by = ${u?.name || "Employee"}, close_note = 'Confirmed fixed by the employee' WHERE id = ${c.id}`);
  await post(c, "System", null, "System", `${u?.name} confirmed it is fixed.`);
  await tellIT(c, `Confirmed fixed: ${c.subject}`, `${u?.name} confirmed it is fixed.`);
  res.json({ ok: true });
}));
router.post("/my-it-chats/:cid/reopen", requireAuth, wrap(async (req, res) => {
  const c = await myChat(req); if (!c) return fail(res, 404, "Chat not found");
  if (c.status !== "Resolved") return fail(res, 400, "Only a resolved chat can be re-opened");
  const why = s(req.body?.message, 2000); if (!why || why.length < 5) return fail(res, 400, "Say what is still not working");
  const [u] = rowsOf(await db.execute(sql`SELECT name FROM users WHERE id = ${uid(req)}`));
  await db.execute(sql`UPDATE device_chats SET status = 'Waiting on IT', resolved_at = NULL, resolved_by = NULL WHERE id = ${c.id}`);
  await post(c, "System", null, "System", `${u?.name} re-opened it.`);
  await post(c, "Employee", uid(req), u?.name || "Employee", why);
  await tellIT(c, `Re-opened by ${u?.name}: ${c.subject}`, why);
  res.json({ ok: true });
}));

export default router;
