import { Router, type Request, type Response } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess, can } from "../lib/rbac";
import { sealText, openText, fingerprint } from "../lib/secure-text";
import { isSupportStaff } from "../lib/access-model";

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
/** IT support staff (ITSM agents / admins, asset staff, Super Admin) — raising tickets alone does not count. */
async function isIT(req: Request) { return isSupportStaff(await getAccess(req)); }
async function setting(key: string, def: any) {
  const [r] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  let v: any = r?.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { /* keep */ } }
  return v ?? def;
}
const audit = (p: Parameters<typeof logAudit>[0]) => void logAudit(p).catch(() => {});
export const notify = (userId: number, title: string, message: string, link: string, type = "info") =>
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
/** What the device reports now for an item kind (shown in the clearing note). */
function nowValue(kind: string, h: any) {
  const k = kind.split(":")[0];
  try {
    if (k === "disk") { const d = (h?.disks || []).find((x: any) => `disk:${x.drive}` === kind); return d ? `drive ${d.drive} ${Math.round(d.freePct)}% free (${d.freeGb} GB of ${d.sizeGb} GB)` : "drive no longer reported"; }
    if (k === "battery") return h?.battery?.present ? `battery health ${Math.round(h.battery.healthPct)}%` : "no battery reported";
    if (k === "antivirus" || k === "antivirus-defs") return `antivirus: ${(h?.security?.av || []).map((a: any) => `${a.name} ${a.enabled ? "on" : "off"}${a.upToDate === false ? " (old definitions)" : ""}`).join(", ") || "—"}`;
    if (k === "bitlocker") return `BitLocker: ${(h?.security?.bitlocker || []).map((b: any) => `${b.drive} ${b.status}`).join(", ") || "—"}`;
    if (k === "firewall") { const f = h?.security?.firewall || {}; return `firewall domain ${f.domain ? "on" : "off"}, private ${f.private ? "on" : "off"}, public ${f.public ? "on" : "off"}`; }
    if (k === "patches") return `last Windows update ${h?.patches?.lastInstalled ? new Date(h.patches.lastInstalled).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }) : "—"}`;
    if (k === "reboot" || k === "pending-reboot") return `up ${Math.round((Number(h?.uptimeHours) || 0) / 24)} days${h?.patches?.pendingReboot ? ", restart pending" : ", no restart pending"}`;
    if (k === "memory") return `memory ${Math.round(h?.mem?.usedPct)}% used`;
    if (k === "cpu") return `CPU ${Math.round(h?.cpu?.pct)}% busy`;
  } catch { /* fall through */ }
  return "no longer reported";
}
/** Items the device reports as fixed: each is closed with the report time and the current value; any linked ticket that is
 *  still being worked is resolved with the same reference (Resolved / Closed tickets are left alone). */
export async function alertsClosed(ids: number[], ctx?: { at: Date; h: any; hostname?: string }) {
  if (!ids.length) return;
  const at = ctx?.at || new Date();
  const when = at.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).replace(/ /g, "-").replace(/,-/, " ") + " IST";
  const { noteIncident } = await import("./itsm");
  const rows = rowsOf(await db.execute(sql`SELECT id, kind, incident_id, message, ignored_at FROM asset_agent_alerts WHERE id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`));
  for (const r of rows) {
    const note = `Cleared by the device report of ${when}${ctx?.hostname ? ` from ${ctx.hostname}` : ""}: “${r.message}” no longer applies — now ${nowValue(r.kind, ctx?.h)}.`;
    await db.execute(sql`UPDATE asset_agent_alerts SET closed_note = ${note} WHERE id = ${r.id}`).catch(() => {});
    if (r.incident_id) { try { await noteIncident(r.incident_id, "IT Hub agent", note, "any"); } catch (e) { console.error(e); } }
  }
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

/** Everything that happened to a device: link / unlink / assignment / transfer, register moves of its asset, health actions, chats, key events. */
router.get("/asset-agents/:id/history", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can see device history");
  const id = Number(req.params.id);
  const [g] = rowsOf(await db.execute(sql`SELECT id, asset_id, enrolled_by_code, hostname FROM asset_agents WHERE id = ${id}`)); if (!g) return fail(res, 404, "Device not found");
  const assetIds = rowsOf(await db.execute(sql`SELECT DISTINCT x::int AS id FROM audit_logs, LATERAL (VALUES (new_values->>'assetId'), (new_values->>'previousAssetId')) v(x)
      WHERE entity_type IN ('asset_agent', 'device') AND entity_id = ${id} AND x ~ '^[0-9]+$'`)).map((r: any) => r.id).filter(Boolean);
  if (g.asset_id) assetIds.push(g.asset_id);
  const aIn = assetIds.length ? sql`(entity_type IN ('asset', 'asset_allocation') AND entity_id IN (${sql.join(assetIds.map((x: number) => sql`${x}`), sql`, `)}))` : sql`false`;
  const audit = rowsOf(await db.execute(sql`SELECT id, entity_type AS "entityType", entity_id AS "entityId", action, performed_by AS "by", performed_at AS "at", summary
    FROM audit_logs WHERE (entity_type IN ('asset_agent', 'device') AND entity_id = ${id})
      OR (entity_type = 'asset_agent_alert' AND entity_id IN (SELECT id FROM asset_agent_alerts WHERE agent_id = ${id}))
      OR (entity_type = 'device_chat' AND entity_id IN (SELECT id FROM device_chats WHERE agent_id = ${id}))
      OR (entity_type = 'asset_agent_code' AND entity_id = ${g.enrolled_by_code ?? 0})
      OR ${aIn}
    ORDER BY performed_at DESC LIMIT 500`));
  const moves = g.asset_id ? rowsOf(await db.execute(sql`SELECT action, old_status AS "from", new_status AS "to", user_name AS "by", created_at AS "at", notes FROM asset_transactions WHERE asset_id = ${g.asset_id} ORDER BY created_at DESC LIMIT 200`)) : [];
  res.json({ audit, moves });
}));

/* ── my own device(s): every employee sees their computer's health and what needs attention ── */
const MY_DEV = (uid: number | null) => sql`g.status = 'Active' AND coalesce(CASE WHEN s.status = 'Allocated' THEN s.owner_id END, g.user_id) = ${uid}`;
router.get("/my-devices", requireAuth, wrap(async (req, res) => {
  res.json(rowsOf(await db.execute(sql`SELECT g.id, g.hostname, g.model, g.manufacturer, g.serial_number AS "serialNumber", g.health_state AS "healthState", g.last_seen_at AS "lastSeenAt", g.agent_version AS "agentVersion", s.asset_tag AS "assetTag",
      (SELECT count(*)::int FROM asset_agent_alerts x WHERE x.agent_id = g.id AND x.closed_at IS NULL AND ${NOT_IGNORED}) AS "openItems"
    FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE ${MY_DEV(uid(req))} ORDER BY g.last_seen_at DESC NULLS LAST`)));
}));
router.get("/my-devices/:id/health", requireAuth, wrap(async (req, res) => {
  const { healthOf, AG_COLS } = await import("./asset-agent");
  const [ag] = rowsOf(await db.execute(sql`SELECT ${AG_COLS} FROM asset_agents WHERE id = ${Number(req.params.id)} AND id IN (SELECT g.id FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE ${MY_DEV(uid(req))})`));
  if (!ag) return fail(res, 404, "This is not your computer");
  const out: any = await healthOf(ag, { usage: false });   // ITH-074: the employee never sees usage data
  out.alerts = (out.alerts || []).map((x: any) => ({ ...x, ignoreReason: undefined, ignoredBy: undefined }));   // IT's internal notes stay internal
  res.json(out);
}));

/* ── support chat ────────────────────────────────────────────────────────── */
export async function autoClose() {
  const days = Math.max(1, Number(await setting("assetAgent.chatAutoCloseDays", 3)) || 3);
  const done = rowsOf(await db.execute(sql`UPDATE device_chats SET status = 'Closed', closed_at = now(), closed_by = 'System', close_note = ${`Closed automatically ${days} days after it was resolved`}
    WHERE status = 'Resolved' AND resolved_at < now() - (${days} || ' days')::interval RETURNING id`));
  for (const c of done) { await db.execute(sql`INSERT INTO device_chat_messages (chat_id, sender_name, side, body) VALUES (${c.id}, 'System', 'System', ${sealText(`Closed automatically ${days} days after it was resolved.`)})`);
    audit({ entityType: "device_chat", entityId: c.id, action: "auto_close", performedBy: "System", summary: `Chat #${c.id} closed automatically ${days} days after it was resolved` }); }
}
const CHAT_COLS = sql`c.id, c.agent_id AS "agentId", c.alert_id AS "alertId", c.incident_id AS "incidentId", i.ticket_no AS "ticketNo", c.user_id AS "userId", u.name AS "userName", u.employee_code AS "employeeCode", u.department,
  c.subject, c.status, c.opened_by AS "openedBy", c.opened_at AS "openedAt", c.resolved_at AS "resolvedAt", c.resolved_by AS "resolvedBy", c.resolution, c.closed_at AS "closedAt", c.closed_by AS "closedBy", c.close_note AS "closeNote", c.last_msg_at AS "lastMsgAt",
  g.hostname, s.asset_tag AS "assetTag", x.message AS "alertMessage",
  (SELECT body FROM device_chat_messages m WHERE m.chat_id = c.id ORDER BY m.at DESC, m.id DESC LIMIT 1) AS "lastMessage"`;
const CHAT_FROM = sql`FROM device_chats c JOIN users u ON u.id = c.user_id AND c.kind = 'support' JOIN asset_agents g ON g.id = c.agent_id LEFT JOIN assets s ON s.id = g.asset_id
  LEFT JOIN asset_agent_alerts x ON x.id = c.alert_id LEFT JOIN itsm_incidents i ON i.id = c.incident_id`;
async function chatMessages(id: number) {
  return rowsOf(await db.execute(sql`SELECT id, sender_name AS "senderName", side, body, at, read_at AS "readAt" FROM device_chat_messages WHERE chat_id = ${id} ORDER BY at, id`)).map((m: any) => ({ ...m, body: openText(m.body) }));
}
export async function post(chat: any, side: "IT" | "Employee" | "System" | "Member", senderId: number | null, senderName: string, body: string) {
  const [m] = rowsOf(await db.execute(sql`INSERT INTO device_chat_messages (chat_id, sender_id, sender_name, side, body) VALUES (${chat.id}, ${senderId}, ${senderName}, ${side}, ${sealText(body)}) RETURNING id`));
  await db.execute(sql`UPDATE device_chats SET last_msg_at = now() WHERE id = ${chat.id}`);
  if (side !== "System") audit({ entityType: "device_chat", entityId: chat.id, action: side === "IT" ? "message_it" : side === "Member" ? "message" : "message_employee", performedBy: senderName, summary: `Chat #${chat.id} — ${side === "IT" ? "IT" : "employee"} message (${body.length} characters, fingerprint ${fingerprint(body)}); text kept encrypted in the chat` });
  if (chat.incident_id && side !== "System") { const { noteIncident } = await import("./itsm"); await noteIncident(chat.incident_id, senderName, `Chat (${side === "IT" ? "IT → employee" : "employee → IT"}) message in IT chat #${chat.id} — open Chats to read it`).catch(() => {}); }
  return m?.id as number;
}
const clean = (c: any) => ({ ...c, lastMessage: c.lastMessage ? openText(c.lastMessage) : c.lastMessage });
const sent = new Map<number, number[]>();
export { tooFast };
/** At most 20 messages a minute per person (stops floods / scripts). */
function tooFast(userId: number | null) { if (!userId) return false; const now = Date.now(); const l = (sent.get(userId) || []).filter(t => now - t < 60_000); l.push(now); sent.set(userId, l); return l.length > 20; }
const shortName = (by: string) => String(by || "").replace(/ <.*>$/, "");

/** IT: all chats. */
/** Search + status filter + page (10 a page). Without ?page the plain list is returned (device panel). */
async function listChats(req: Request, scope: any, unreadSide: "Employee" | "IT") {
  const q = String(req.query.q || "").trim().toLowerCase(); const like = q ? `%${q}%` : null;
  const st = String(req.query.status || "Open");
  const stCond = st === "All" ? sql`true` : st === "Open" ? sql`c.status IN ('Waiting on employee', 'Waiting on IT')` : sql`c.status = ${st}`;
  const where = sql`${scope} AND (${like}::text IS NULL OR lower(concat_ws(' ', '#' || c.id, c.subject, u.name, u.employee_code, u.department, g.hostname, s.asset_tag, i.ticket_no, c.opened_by)) LIKE ${like})`;
  const size = Math.min(50, Math.max(5, Number(req.query.pageSize) || 10)); const page = Math.max(1, Number(req.query.page) || 1);
  const rows = rowsOf(await db.execute(sql`SELECT ${CHAT_COLS}, (SELECT count(*)::int FROM device_chat_messages m WHERE m.chat_id = c.id AND m.side = ${unreadSide} AND m.read_at IS NULL) AS unread
    ${CHAT_FROM} WHERE ${where} AND ${stCond} ORDER BY (c.status = ${unreadSide === "Employee" ? "Waiting on IT" : "Waiting on employee"}) DESC, c.last_msg_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`)).map(clean);
  const counts = rowsOf(await db.execute(sql`SELECT c.status, count(*)::int AS n ${CHAT_FROM} WHERE ${where} GROUP BY 1`));
  const c = (k: string) => counts.find((x: any) => x.status === k)?.n || 0;
  const byStatus = { Open: c("Waiting on employee") + c("Waiting on IT"), "Waiting on IT": c("Waiting on IT"), "Waiting on employee": c("Waiting on employee"), Resolved: c("Resolved"), Closed: c("Closed"), All: counts.reduce((a: number, x: any) => a + x.n, 0) } as Record<string, number>;
  return { rows, total: byStatus[st] ?? byStatus.All, page, pageSize: size, counts: byStatus };
}
router.get("/asset-agents/chats", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can see device chats");
  await autoClose();
  const agent = Number(req.query.agentId) || null;
  if (req.query.page) return res.json(await listChats(req, sql`(${agent}::int IS NULL OR c.agent_id = ${agent})`, "Employee"));
  res.json(rowsOf(await db.execute(sql`SELECT ${CHAT_COLS},
      (SELECT count(*)::int FROM device_chat_messages m WHERE m.chat_id = c.id AND m.side = 'Employee' AND m.read_at IS NULL) AS unread
    ${CHAT_FROM} WHERE (${agent}::int IS NULL OR c.agent_id = ${agent}) ORDER BY (c.status IN ('Waiting on IT')) DESC, c.last_msg_at DESC LIMIT 1000`)).map(clean));
}));
/** Cheap poll for the pop-up chat window: chats with unread messages for me (as employee) and, for IT, from employees. */
router.get("/chat-unread", requireAuth, wrap(async (req, res) => {
  const me = rowsOf(await db.execute(sql`SELECT c.id, c.subject, max(m.at) AS "lastAt", count(*)::int AS unread FROM device_chats c JOIN device_chat_messages m ON m.chat_id = c.id AND m.side = 'IT' AND m.read_at IS NULL
    WHERE c.user_id = ${uid(req)} AND c.status <> 'Closed' GROUP BY c.id, c.subject`));
  let it: any[] = [];
  if (await isIT(req)) it = rowsOf(await db.execute(sql`SELECT c.id, c.subject, u.name AS "userName", max(m.at) AS "lastAt", count(*)::int AS unread FROM device_chats c JOIN users u ON u.id = c.user_id
    JOIN device_chat_messages m ON m.chat_id = c.id AND m.side = 'Employee' AND m.read_at IS NULL
    WHERE c.status <> 'Closed' AND (c.opened_by_id = ${uid(req)} OR EXISTS (SELECT 1 FROM device_chat_messages x WHERE x.chat_id = c.id AND x.side = 'IT' AND x.sender_id = ${uid(req)})) GROUP BY c.id, c.subject, u.name`));
  res.json({ me, it });
}));
/** IT starts a chat with the device's employee (optionally about one health item). */
router.post("/asset-agents/:id/chats", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can start a chat");
  const id = Number(req.params.id);
  const [g] = rowsOf(await db.execute(sql`SELECT g.*, s.owner_id, s.status AS asset_status, s.asset_tag FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE g.id = ${id}`));
  if (!g) return fail(res, 404, "Device not found");
  const userId = Number(req.body?.userId) || (g.asset_status === "Allocated" ? g.owner_id : null) || g.user_id;
  if (!userId) return fail(res, 400, "No employee is linked to this device — assign it first");
  if (Number(userId) === uid(req)) return fail(res, 400, "You cannot open an IT chat about your own computer or account — ask another IT team member");
  const [u] = rowsOf(await db.execute(sql`SELECT id, name, is_active FROM users WHERE id = ${userId}`)); if (!u?.is_active) return fail(res, 400, "The employee is not an active user");
  const msg = s(req.body?.message, 4000); if (!msg) return fail(res, 400, "Write the first message");
  const alertId = Number(req.body?.alertId) || null;
  let alert: any = null; if (alertId) { [alert] = rowsOf(await db.execute(sql`SELECT id, message, incident_id FROM asset_agent_alerts WHERE id = ${alertId} AND agent_id = ${id}`)); if (!alert) return fail(res, 400, "Health item not found on this device"); }
  const subject = s(req.body?.subject, 200) || (alert ? alert.message : `Your computer ${g.hostname}`);
  const by = await getPerformedBy(uid(req) ?? undefined).catch(() => "IT"); const name = shortName(by);
  const [c] = rowsOf(await db.execute(sql`INSERT INTO device_chats (agent_id, alert_id, incident_id, user_id, subject, opened_by, opened_by_id) VALUES (${id}, ${alertId}, ${alert?.incident_id ?? null}, ${userId}, ${subject}, ${name}, ${uid(req)}) RETURNING *`));
  await db.execute(sql`INSERT INTO chat_members (chat_id, user_id) VALUES (${c.id}, ${userId}) ON CONFLICT DO NOTHING`);
  await post(c, "IT", uid(req), name, msg);
  await notify(userId, `Message from IT about your computer`, `${name} sent you a message — open My IT Chats to read and reply.`, `/my-it-chats?c=${c.id}`);
  audit({ entityType: "device_chat", entityId: c.id, action: "open", performedBy: by, summary: `Chat with ${u.name} about ${g.hostname}: ${subject}` });
  res.status(201).json({ id: c.id });
}));
router.get("/asset-agents/chats/:cid", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can see device chats");
  const id = Number(req.params.cid);
  const [c] = rowsOf(await db.execute(sql`SELECT ${CHAT_COLS} ${CHAT_FROM} WHERE c.id = ${id}`)); if (!c) return fail(res, 404, "Chat not found");
  await db.execute(sql`UPDATE device_chat_messages SET read_at = now() WHERE chat_id = ${id} AND side = 'Employee' AND read_at IS NULL`);
  res.json({ chat: clean(c), messages: await chatMessages(id) });
}));
/** Full transcript as CSV (IT) — the download itself is audited. */
router.get("/asset-agents/chats/:cid/transcript", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can export chats");
  const id = Number(req.params.cid);
  const [c] = rowsOf(await db.execute(sql`SELECT ${CHAT_COLS} ${CHAT_FROM} WHERE c.id = ${id}`)); if (!c) return fail(res, 404, "Chat not found");
  const m = await chatMessages(id);
  const q = (v: any) => { const x = String(v ?? "").replace(/"/g, '""'); return /[,"\n]/.test(x) ? `"${x}"` : x; };
  const ist = (d: any) => d ? new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" }) : "";
  const head = [["Chat", `#${c.id} ${c.subject}`], ["Employee", `${c.employeeCode || ""} ${c.userName}`], ["Computer", `${c.hostname}${c.assetTag ? ` (${c.assetTag})` : ""}`], ["Ticket", c.ticketNo || ""], ["Status", c.status], ["Opened", `${ist(c.openedAt)} by ${c.openedBy}`]];
  const csv = [...head.map(r => r.map(q).join(",")), "", "When (IST),From,Side,Message,Read at (IST)", ...m.map((x: any) => [ist(x.at), x.senderName, x.side, x.body, ist(x.readAt)].map(q).join(","))].join("\r\n");
  const by = await getPerformedBy(uid(req) ?? undefined).catch(() => "IT");
  audit({ entityType: "device_chat", entityId: id, action: "export", performedBy: by, summary: `Chat #${id} transcript downloaded` });
  res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="it_chat_${id}.csv"`); res.send("\ufeff" + csv);
}));
router.post("/asset-agents/chats/:cid/messages", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can reply here");
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM device_chats WHERE id = ${Number(req.params.cid)} AND kind = 'support'`)); if (!c) return fail(res, 404, "Chat not found");
  if (c.user_id === uid(req)) return fail(res, 403, "This chat is about you — reply from My IT Chats; another IT team member handles the IT side");
  const msg = s(req.body?.message, 4000); if (!msg) return fail(res, 400, "Write a message");
  if (tooFast(uid(req))) return fail(res, 429, "Too many messages — wait a minute");
  const by = shortName(await getPerformedBy(uid(req) ?? undefined).catch(() => "IT"));
  if (c.status === "Resolved" || c.status === "Closed") { await db.execute(sql`UPDATE device_chats SET resolved_at = NULL, resolved_by = NULL, closed_at = NULL, closed_by = NULL WHERE id = ${c.id}`); await post(c, "System", null, "System", `Re-opened by ${by}.`);
    audit({ entityType: "device_chat", entityId: c.id, action: "reopen", performedBy: by, summary: `Chat #${c.id} "${c.subject}" re-opened by IT` }); }
  await db.execute(sql`UPDATE device_chats SET status = 'Waiting on employee' WHERE id = ${c.id}`);
  await post(c, "IT", uid(req), by, msg);
  await notify(c.user_id, `New message from IT`, `${by} replied — open My IT Chats to read it.`, `/my-it-chats?c=${c.id}`);
  res.json({ ok: true });
}));
router.post("/asset-agents/chats/:cid/resolve", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can resolve a chat");
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM device_chats WHERE id = ${Number(req.params.cid)} AND kind = 'support'`)); if (!c) return fail(res, 404, "Chat not found");
  if (c.user_id === uid(req)) return fail(res, 403, "This chat is about you — another IT team member must handle it");
  if (c.status === "Resolved" || c.status === "Closed") return fail(res, 400, `This chat is already ${c.status.toLowerCase()}`);
  const note = s(req.body?.resolution, 1000); if (!note || note.length < 5) return fail(res, 400, "Say how it was resolved");
  const by = shortName(await getPerformedBy(uid(req) ?? undefined).catch(() => "IT"));
  await db.execute(sql`UPDATE device_chats SET status = 'Resolved', resolved_at = now(), resolved_by = ${by}, resolution = ${note} WHERE id = ${c.id}`);
  await post(c, "System", null, "System", `Marked resolved by ${by}: ${note}`);
  const days = Number(await setting("assetAgent.chatAutoCloseDays", 3)) || 3;
  await notify(c.user_id, `IT marked your chat resolved`, `${by} marked it resolved. Confirm, or re-open within ${days} days if it is not fixed.`, `/my-it-chats?c=${c.id}`, "success");
  audit({ entityType: "device_chat", entityId: c.id, action: "resolve", performedBy: by, summary: `Chat resolved: ${note}` });
  res.json({ ok: true });
}));
router.post("/asset-agents/chats/:cid/close", requireAuth, wrap(async (req, res) => {
  if (!await isIT(req)) return fail(res, 403, "Only IT can close a chat");
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM device_chats WHERE id = ${Number(req.params.cid)} AND kind = 'support'`)); if (!c) return fail(res, 404, "Chat not found");
  if (c.user_id === uid(req)) return fail(res, 403, "This chat is about you — another IT team member must handle it");
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
  if (req.query.page) return res.json(await listChats(req, sql`c.user_id = ${uid(req)}`, "IT"));
  res.json(rowsOf(await db.execute(sql`SELECT ${CHAT_COLS}, (SELECT count(*)::int FROM device_chat_messages m WHERE m.chat_id = c.id AND m.side = 'IT' AND m.read_at IS NULL) AS unread
    ${CHAT_FROM} WHERE c.user_id = ${uid(req)} ORDER BY (c.status = 'Waiting on employee') DESC, c.last_msg_at DESC LIMIT 200`)).map(clean));
}));
async function myChat(req: Request) {
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM device_chats WHERE id = ${Number(req.params.cid)} AND user_id = ${uid(req)} AND kind = 'support'`));
  return c;
}
router.get("/my-it-chats/:cid", requireAuth, wrap(async (req, res) => {
  const c0 = await myChat(req); if (!c0) return fail(res, 404, "Chat not found");
  const [c] = rowsOf(await db.execute(sql`SELECT ${CHAT_COLS} ${CHAT_FROM} WHERE c.id = ${c0.id}`));
  await db.execute(sql`UPDATE device_chat_messages SET read_at = now() WHERE chat_id = ${c0.id} AND side = 'IT' AND read_at IS NULL`);
  res.json({ chat: clean(c), messages: await chatMessages(c0.id) });
}));
export async function tellIT(c: any, title: string, msg: string) {
  const ids = new Set<number>(); if (c.opened_by_id) ids.add(c.opened_by_id);
  for (const r of rowsOf(await db.execute(sql`SELECT DISTINCT sender_id FROM device_chat_messages WHERE chat_id = ${c.id} AND side = 'IT' AND sender_id IS NOT NULL`))) ids.add(r.sender_id);
  for (const i of ids) await notify(i, title, msg, `/itsm-chats?c=${c.id}`);
}
router.post("/my-it-chats/:cid/messages", requireAuth, wrap(async (req, res) => {
  const c = await myChat(req); if (!c) return fail(res, 404, "Chat not found");
  if (c.status === "Closed") return fail(res, 400, "This chat is closed. IT will contact you if anything else is needed.");
  if (c.status === "Resolved") return fail(res, 400, "IT marked this resolved — use Re-open if it is not fixed");
  const msg = s(req.body?.message, 4000); if (!msg) return fail(res, 400, "Write a message");
  if (tooFast(uid(req))) return fail(res, 429, "Too many messages — wait a minute");
  const [u] = rowsOf(await db.execute(sql`SELECT name FROM users WHERE id = ${uid(req)}`));
  await db.execute(sql`UPDATE device_chats SET status = 'Waiting on IT' WHERE id = ${c.id}`);
  await post(c, "Employee", uid(req), u?.name || "Employee", msg);
  await tellIT(c, `Reply from ${u?.name} (IT chat #${c.id})`, "Open ITSM › IT Chats to read it.");
  res.json({ ok: true });
}));
router.post("/my-it-chats/:cid/confirm", requireAuth, wrap(async (req, res) => {
  const c = await myChat(req); if (!c) return fail(res, 404, "Chat not found");
  if (c.status !== "Resolved") return fail(res, 400, "Only a resolved chat can be confirmed");
  const [u] = rowsOf(await db.execute(sql`SELECT name FROM users WHERE id = ${uid(req)}`));
  await db.execute(sql`UPDATE device_chats SET status = 'Closed', closed_at = now(), closed_by = ${u?.name || "Employee"}, close_note = 'Confirmed fixed by the employee' WHERE id = ${c.id}`);
  await post(c, "System", null, "System", `${u?.name} confirmed it is fixed.`);
  audit({ entityType: "device_chat", entityId: c.id, action: "confirm", performedBy: u?.name || "Employee", summary: `Chat #${c.id} "${c.subject}" confirmed fixed by the employee — closed` });
  await tellIT(c, `Confirmed fixed (IT chat #${c.id})`, `${u?.name} confirmed it is fixed.`);
  res.json({ ok: true });
}));
router.post("/my-it-chats/:cid/reopen", requireAuth, wrap(async (req, res) => {
  const c = await myChat(req); if (!c) return fail(res, 404, "Chat not found");
  if (c.status !== "Resolved") return fail(res, 400, "Only a resolved chat can be re-opened");
  const why = s(req.body?.message, 2000); if (!why || why.length < 5) return fail(res, 400, "Say what is still not working");
  const [u] = rowsOf(await db.execute(sql`SELECT name FROM users WHERE id = ${uid(req)}`));
  await db.execute(sql`UPDATE device_chats SET status = 'Waiting on IT', resolved_at = NULL, resolved_by = NULL WHERE id = ${c.id}`);
  await post(c, "System", null, "System", `${u?.name} re-opened it.`);
  audit({ entityType: "device_chat", entityId: c.id, action: "reopen", performedBy: u?.name || "Employee", summary: `Chat #${c.id} re-opened by the employee (reason kept encrypted in the chat)` });
  await post(c, "Employee", uid(req), u?.name || "Employee", why);
  await tellIT(c, `Re-opened by ${u?.name} (IT chat #${c.id})`, "Open ITSM › IT Chats to read why.");
  res.json({ ok: true });
}));

export default router;
