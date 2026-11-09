import express, { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { db, settingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess } from "../lib/rbac";
import { isSupportStaff, isSuperAdmin } from "../lib/access-model";
import { openText, sealBuf, openBuf } from "../lib/secure-text";
import { post, autoClose, notify, tellIT, tooFast } from "./device-support";

/*
 * Chats — enterprise rules
 *  Direct chat (person ↔ person): any active internal user can start one with another active user (not with themselves).
 *    Seen only by its two members. Not visible to ITSM / Asset staff. Super Admin can open any chat read-only (every view audited).
 *  IT support chat (IT ↔ employee about a computer / ticket): started only by IT staff (ITSM Admin / Agent / team member,
 *    Asset Admin / Manager, Super Admin), never about themselves. Seen by the employee, all IT staff and Super Admin.
 *    Only the employee writes on the employee side; IT staff (other than the employee) write on the IT side.
 *  Messages and attachments are encrypted at rest and cannot be edited or deleted; every action is in the audit log.
 */
const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const s = (v: unknown, max = 4000) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim().slice(0, max));
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); }
};
const uid = (req: Request) => Number((req.session as any)?.userId) || null;
const audit = (p: Parameters<typeof logAudit>[0]) => logAudit(p).catch(() => {});
async function setting(key: string, def: any) {
  const [r] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  let v: any = r?.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { /* keep */ } }
  return v ?? def;
}
async function me(req: Request) {
  const a = await getAccess(req);
  const [u] = rowsOf(await db.execute(sql`SELECT id, name, coalesce(user_type, 'internal') AS "userType", is_active FROM users WHERE id = ${uid(req)}`));
  return { a, u, id: uid(req)!, superAdmin: isSuperAdmin(a), staff: await isSupportStaff(a) };
}

/** My relation to a chat: member (direct), employee / it (support), admin (Super Admin read-only) — or null (no access). */
async function roleIn(c: any, m: Awaited<ReturnType<typeof me>>): Promise<"member" | "employee" | "it" | "admin" | null> {
  if (c.kind === "direct") {
    const [x] = rowsOf(await db.execute(sql`SELECT 1 FROM chat_members WHERE chat_id = ${c.id} AND user_id = ${m.id}`));
    return x ? "member" : m.superAdmin ? "admin" : null;
  }
  if (c.user_id === m.id) return "employee";
  if (m.staff) return "it";
  return m.superAdmin ? "admin" : null;
}
const COLS = sql`c.id, c.kind, c.subject, c.status, c.user_id AS "userId", c.agent_id AS "agentId", c.alert_id AS "alertId", c.incident_id AS "incidentId", i.ticket_no AS "ticketNo",
  c.opened_by AS "openedBy", c.opened_by_id AS "openedById", c.opened_at AS "openedAt", c.resolved_at AS "resolvedAt", c.resolved_by AS "resolvedBy", c.resolution,
  c.closed_at AS "closedAt", c.closed_by AS "closedBy", c.close_note AS "closeNote", c.last_msg_at AS "lastMsgAt",
  u.name AS "userName", u.employee_code AS "employeeCode", u.department, g.hostname, s.asset_tag AS "assetTag", x.message AS "alertMessage",
  (SELECT body FROM device_chat_messages m WHERE m.chat_id = c.id ORDER BY m.at DESC, m.id DESC LIMIT 1) AS "lastMessage",
  (SELECT json_agg(json_build_object('id', mu.id, 'name', mu.name, 'employeeCode', mu.employee_code, 'department', mu.department)) FROM chat_members cm JOIN users mu ON mu.id = cm.user_id WHERE cm.chat_id = c.id) AS members`;
const FROM = sql`FROM device_chats c JOIN users u ON u.id = c.user_id LEFT JOIN asset_agents g ON g.id = c.agent_id LEFT JOIN assets s ON s.id = g.asset_id
  LEFT JOIN asset_agent_alerts x ON x.id = c.alert_id LEFT JOIN itsm_incidents i ON i.id = c.incident_id`;
/** Unread for this person: messages from someone else not yet read (support IT side counts employee messages only). */
const UNREAD = (myId: number) => sql`(SELECT count(*)::int FROM device_chat_messages m WHERE m.chat_id = c.id AND m.read_at IS NULL AND m.side <> 'System' AND coalesce(m.sender_id, 0) <> ${myId}
   AND (c.kind = 'direct' OR (c.user_id = ${myId} AND m.side = 'IT') OR (c.user_id <> ${myId} AND m.side = 'Employee')))`;
const view = (c: any, myId: number) => {
  const other = c.kind === "direct" ? (c.members || []).find((x: any) => x.id !== myId) || (c.members || [])[0] : null;
  return { ...c, lastMessage: c.lastMessage ? openText(c.lastMessage) : null, title: c.kind === "direct" ? (other?.name || "Chat") : c.subject, with: other };
};

/** List: box = mine (my direct chats + support chats about me) | support (IT staff) | all (Super Admin). Search, status, 10 a page. */
router.get("/chats", requireAuth, wrap(async (req, res) => {
  const m = await me(req); await autoClose();
  const box = String(req.query.box || "mine");
  if (box === "support" && !m.staff) return fail(res, 403, "Only IT staff can see IT support chats");
  if (box === "all" && !m.superAdmin) return fail(res, 403, "Only the Super Admin can see all chats");
  const scope = box === "all" ? sql`true` : box === "support" ? sql`c.kind = 'support'`
    : sql`((c.kind = 'direct' AND EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = c.id AND cm.user_id = ${m.id})) OR (c.kind = 'support' AND c.user_id = ${m.id}))`;
  const q = String(req.query.q || "").trim().toLowerCase(); const like = q ? `%${q}%` : null;
  const search = sql`(${like}::text IS NULL OR lower(concat_ws(' ', '#' || c.id, c.subject, u.name, u.employee_code, u.department, g.hostname, s.asset_tag, i.ticket_no, c.opened_by,
      (SELECT string_agg(mu.name || ' ' || coalesce(mu.employee_code, ''), ' ') FROM chat_members cm JOIN users mu ON mu.id = cm.user_id WHERE cm.chat_id = c.id))) LIKE ${like})`;
  const st = String(req.query.status || "Open");
  const stc = st === "All" ? sql`true` : st === "Open" ? sql`c.status IN ('Active', 'Waiting on employee', 'Waiting on IT')` : sql`c.status = ${st}`;
  const kind = req.query.kind === "direct" || req.query.kind === "support" ? sql`c.kind = ${req.query.kind}` : sql`true`;
  const agent = Number(req.query.agentId) || null;
  const where = sql`${scope} AND ${search} AND ${kind} AND (${agent}::int IS NULL OR c.agent_id = ${agent})`;
  const size = Math.min(50, Math.max(5, Number(req.query.pageSize) || 10)); const page = Math.max(1, Number(req.query.page) || 1);
  const rows = rowsOf(await db.execute(sql`SELECT ${COLS}, ${UNREAD(m.id)} AS unread ${FROM} WHERE ${where} AND ${stc}
    ORDER BY (${UNREAD(m.id)} > 0) DESC, c.last_msg_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`)).map(c => view(c, m.id));
  const counts = rowsOf(await db.execute(sql`SELECT c.status, count(*)::int AS n ${FROM} WHERE ${where} GROUP BY 1`));
  const n = (k: string) => counts.find((x: any) => x.status === k)?.n || 0;
  const by: Record<string, number> = { Open: n("Active") + n("Waiting on employee") + n("Waiting on IT"), "Waiting on IT": n("Waiting on IT"), "Waiting on employee": n("Waiting on employee"), Resolved: n("Resolved"), Closed: n("Closed"), All: counts.reduce((a: number, x: any) => a + x.n, 0) };
  if (box === "all") audit({ entityType: "device_chat", action: "admin_list", performedBy: await getPerformedBy(m.id).catch(() => "Super Admin"), summary: `Super Admin listed all chats${q ? ` (search "${q.slice(0, 60)}")` : ""}` });
  res.json({ rows, total: by[st] ?? by.All, page, pageSize: size, counts: by, me: { staff: m.staff, superAdmin: m.superAdmin } });
}));

/** People to start a chat with (active users; no one-self). */
router.get("/chats/people", requireAuth, wrap(async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase(); if (q.length < 2) return res.json([]);
  res.json(rowsOf(await db.execute(sql`SELECT id, name, employee_code AS "employeeCode", department, designation, coalesce(user_type, 'internal') AS "userType" FROM users
    WHERE is_active AND coalesce(status, 'active') = 'active' AND id <> ${uid(req)} AND lower(concat_ws(' ', name, email, employee_code)) LIKE ${`%${q}%`} ORDER BY name LIMIT 15`)));
}));

/** Start a chat. kind direct: anyone internal → another active user. kind support: IT staff → an employee (optionally about a computer). */
router.post("/chats", requireAuth, wrap(async (req, res) => {
  const m = await me(req); const b = req.body || {};
  const other = Number(b.userId); const msg = s(b.message);
  if (!other) return fail(res, 400, "Choose the person");
  if (other === m.id) return fail(res, 400, b.kind === "support" ? "You cannot open an IT chat about your own computer or account — ask another IT team member" : "You cannot start a chat with yourself");
  if (!msg) return fail(res, 400, "Write the first message");
  const [o] = rowsOf(await db.execute(sql`SELECT id, name, is_active, coalesce(status, 'active') AS status FROM users WHERE id = ${other}`));
  if (!o || !o.is_active || o.status !== "active") return fail(res, 400, "That person is not an active user");
  const name = String(await getPerformedBy(m.id).catch(() => m.u?.name || "User")).replace(/ <.*>$/, "");
  if (b.kind === "support") {
    if (!m.staff) return fail(res, 403, "Only IT staff can start an IT support chat");
    const agentId = Number(b.agentId) || null;
    if (agentId && !rowsOf(await db.execute(sql`SELECT 1 FROM asset_agents WHERE id = ${agentId}`)).length) return fail(res, 400, "Computer not found");
    const subject = s(b.subject, 200) || "Message from IT";
    const [c] = rowsOf(await db.execute(sql`INSERT INTO device_chats (kind, agent_id, user_id, subject, opened_by, opened_by_id) VALUES ('support', ${agentId}, ${other}, ${subject}, ${name}, ${m.id}) RETURNING *`));
    await db.execute(sql`INSERT INTO chat_members (chat_id, user_id) VALUES (${c.id}, ${other}) ON CONFLICT DO NOTHING`);
    await post(c, "IT", m.id, name, msg);
    await notify(other, "Message from IT", `${name} sent you a message — open Chats to read and reply.`, `/chats?c=${c.id}`);
    await audit({ entityType: "device_chat", entityId: c.id, action: "open", performedBy: name, summary: `IT support chat #${c.id} with ${o.name}: ${subject}` });
    return res.status(201).json({ id: c.id });
  }
  if ((await setting("chat.directEnabled", true)) === false) return fail(res, 403, "Person-to-person chats are switched off by the administrator");
  if (m.u?.userType === "external") return fail(res, 403, "External users can reply but not start chats");
  // one direct conversation per pair: reuse it
  const [ex] = rowsOf(await db.execute(sql`SELECT c.* FROM device_chats c WHERE c.kind = 'direct'
    AND EXISTS (SELECT 1 FROM chat_members a WHERE a.chat_id = c.id AND a.user_id = ${m.id}) AND EXISTS (SELECT 1 FROM chat_members z WHERE z.chat_id = c.id AND z.user_id = ${other}) LIMIT 1`));
  let c = ex;
  if (!c) {
    [c] = rowsOf(await db.execute(sql`INSERT INTO device_chats (kind, status, user_id, subject, opened_by, opened_by_id) VALUES ('direct', 'Active', ${m.id}, ${`${name} ↔ ${o.name}`}, ${name}, ${m.id}) RETURNING *`));
    await db.execute(sql`INSERT INTO chat_members (chat_id, user_id) VALUES (${c.id}, ${m.id}), (${c.id}, ${other}) ON CONFLICT DO NOTHING`);
    await audit({ entityType: "device_chat", entityId: c.id, action: "open_direct", performedBy: name, summary: `Direct chat #${c.id} started with ${o.name}` });
  } else if (c.status === "Closed") await db.execute(sql`UPDATE device_chats SET status = 'Active', closed_at = NULL, closed_by = NULL WHERE id = ${c.id}`);
  if (tooFast(m.id)) return fail(res, 429, "Too many messages — wait a minute");
  await post(c, "Member", m.id, name, msg);
  await notify(other, `New message from ${name}`, "Open Chats to read and reply.", `/chats?c=${c.id}`);
  res.status(ex ? 200 : 201).json({ id: c.id, existing: !!ex });
}));

/** One chat with messages and attachments. Super Admin views of chats they are not part of are audited. */
router.get("/chats/:id", requireAuth, wrap(async (req, res) => {
  const m = await me(req); const id = Number(req.params.id);
  const [c] = rowsOf(await db.execute(sql`SELECT ${COLS}, c.user_id, c.kind AS k ${FROM} WHERE c.id = ${id}`)); if (!c) return fail(res, 404, "Chat not found");
  const role = await roleIn({ ...c, id, user_id: c.user_id, kind: c.kind }, m); if (!role) return fail(res, 404, "Chat not found");
  const msgs = rowsOf(await db.execute(sql`SELECT m.id, m.sender_id AS "senderId", m.sender_name AS "senderName", m.side, m.body, m.at, m.read_at AS "readAt",
      (SELECT json_agg(json_build_object('id', a.id, 'name', a.file_name, 'size', a.size_bytes, 'kind', a.kind)) FROM chat_attachments a WHERE a.message_id = m.id) AS files
    FROM device_chat_messages m WHERE m.chat_id = ${id} ORDER BY m.at, m.id`)).map((x: any) => ({ ...x, body: openText(x.body) }));
  if (role === "admin") await audit({ entityType: "device_chat", entityId: id, action: "admin_view", performedBy: await getPerformedBy(m.id).catch(() => "Super Admin"), summary: `Super Admin opened chat #${id} (${c.kind === "direct" ? "direct chat" : "IT support chat"}) read-only` });
  else {   // mark the other side's messages read
    const cond = c.kind === "direct" ? sql`coalesce(sender_id, 0) <> ${m.id}` : role === "employee" ? sql`side = 'IT'` : sql`side = 'Employee'`;
    await db.execute(sql`UPDATE device_chat_messages SET read_at = now() WHERE chat_id = ${id} AND read_at IS NULL AND side <> 'System' AND ${cond}`);
  }
  const maxMB = Number(await setting("chat.maxAttachmentMB", 10)) || 10; const exts = String(await setting("chat.attachmentExtensions", "pdf,png,jpg,jpeg,txt,log,csv,docx,xlsx,zip"));
  res.json({ chat: view(c, m.id), messages: msgs, role, attach: { maxMB, extensions: exts.split(",").map(x => x.trim().toLowerCase()).filter(Boolean) } });
}));

async function load(req: Request) {
  const m = await me(req); const [c] = rowsOf(await db.execute(sql`SELECT * FROM device_chats WHERE id = ${Number(req.params.id)}`));
  const role = c ? await roleIn(c, m) : null;
  return { m, c, role, name: String(await getPerformedBy(m.id).catch(() => m.u?.name || "User")).replace(/ <.*>$/, "") };
}
/** Send a message (members of a direct chat; employee or IT on a support chat). Super Admin is read-only unless a participant. */
router.post("/chats/:id/messages", requireAuth, wrap(async (req, res) => {
  const { m, c, role, name } = await load(req); if (!c || !role) return fail(res, 404, "Chat not found");
  if (role === "admin") return fail(res, 403, "Super Admin can read this chat but not write in it");
  const msg = s(req.body?.message); if (!msg) return fail(res, 400, "Write a message");
  if (tooFast(m.id)) return fail(res, 429, "Too many messages — wait a minute");
  if (c.kind === "direct") {
    if (c.status === "Closed") await db.execute(sql`UPDATE device_chats SET status = 'Active', closed_at = NULL, closed_by = NULL WHERE id = ${c.id}`);
    await post(c, "Member", m.id, name, msg);
    for (const x of rowsOf(await db.execute(sql`SELECT user_id FROM chat_members WHERE chat_id = ${c.id} AND user_id <> ${m.id}`))) await notify(x.user_id, `New message from ${name}`, "Open Chats to read and reply.", `/chats?c=${c.id}`);
    return res.json({ ok: true });
  }
  if (role === "employee") {
    if (c.status === "Closed") return fail(res, 400, "This chat is closed. IT will contact you if anything else is needed.");
    if (c.status === "Resolved") return fail(res, 400, "IT marked this resolved — use Re-open if it is not fixed");
    await db.execute(sql`UPDATE device_chats SET status = 'Waiting on IT' WHERE id = ${c.id}`);
    await post(c, "Employee", m.id, name, msg);
    await tellIT(c, `Reply from ${name} (chat #${c.id})`, "Open Chats to read it.");
    return res.json({ ok: true });
  }
  if (c.status === "Resolved" || c.status === "Closed") { await db.execute(sql`UPDATE device_chats SET resolved_at = NULL, resolved_by = NULL, closed_at = NULL, closed_by = NULL WHERE id = ${c.id}`); await post(c, "System", null, "System", `Re-opened by ${name}.`); }
  await db.execute(sql`UPDATE device_chats SET status = 'Waiting on employee' WHERE id = ${c.id}`);
  await post(c, "IT", m.id, name, msg);
  await notify(c.user_id, "New message from IT", `${name} replied — open Chats to read it.`, `/chats?c=${c.id}`);
  res.json({ ok: true });
}));

/** Support-chat workflow: IT resolves / closes; the employee confirms or re-opens. Direct chats can be closed by a member. */
router.post("/chats/:id/:action", requireAuth, (req, _res, next) => ["resolve", "close", "confirm", "reopen"].includes(String(req.params.action)) ? next() : next("route"), wrap(async (req, res) => {
  const { m, c, role, name } = await load(req); if (!c || !role) return fail(res, 404, "Chat not found");
  if (role === "admin") return fail(res, 403, "Super Admin can read this chat but not change it");
  const act = String(req.params.action); const note = s(req.body?.note || req.body?.resolution || req.body?.message, 1000);
  if (c.kind === "direct") {
    if (act !== "close") return fail(res, 400, "Direct chats can only be closed (a new message opens them again)");
    await db.execute(sql`UPDATE device_chats SET status = 'Closed', closed_at = now(), closed_by = ${name} WHERE id = ${c.id}`);
    await post(c, "System", null, "System", `${name} closed the chat.`); await audit({ entityType: "device_chat", entityId: c.id, action: "close", performedBy: name, summary: `Direct chat #${c.id} closed` });
    return res.json({ ok: true });
  }
  if (act === "resolve" || act === "close") {
    if (role !== "it") return fail(res, 403, "Only IT can do that");
    if (!note || note.length < 5) return fail(res, 400, act === "resolve" ? "Say how it was resolved" : "Give a reason for closing");
    if (c.status === "Closed" || (act === "resolve" && c.status === "Resolved")) return fail(res, 400, `This chat is already ${c.status.toLowerCase()}`);
    if (act === "resolve") { await db.execute(sql`UPDATE device_chats SET status = 'Resolved', resolved_at = now(), resolved_by = ${name}, resolution = ${note} WHERE id = ${c.id}`); await post(c, "System", null, "System", `Marked resolved by ${name}: ${note}`);
      await notify(c.user_id, "IT marked your chat resolved", `${name} marked it resolved. Confirm, or re-open it if it is not fixed.`, `/chats?c=${c.id}`, "success"); }
    else { await db.execute(sql`UPDATE device_chats SET status = 'Closed', closed_at = now(), closed_by = ${name}, close_note = ${note} WHERE id = ${c.id}`); await post(c, "System", null, "System", `Closed by ${name}: ${note}`); }
    await audit({ entityType: "device_chat", entityId: c.id, action: act, performedBy: name, summary: `Chat #${c.id} ${act === "resolve" ? "resolved" : "closed"}: ${note}` });
    return res.json({ ok: true });
  }
  if (role !== "employee") return fail(res, 403, "Only the employee can do that");
  if (c.status !== "Resolved") return fail(res, 400, act === "confirm" ? "Only a resolved chat can be confirmed" : "Only a resolved chat can be re-opened");
  if (act === "confirm") {
    await db.execute(sql`UPDATE device_chats SET status = 'Closed', closed_at = now(), closed_by = ${name}, close_note = 'Confirmed fixed by the employee' WHERE id = ${c.id}`);
    await post(c, "System", null, "System", `${name} confirmed it is fixed.`); await tellIT(c, `Confirmed fixed (chat #${c.id})`, `${name} confirmed it is fixed.`);
  } else {
    if (!note || note.length < 5) return fail(res, 400, "Say what is still not working");
    await db.execute(sql`UPDATE device_chats SET status = 'Waiting on IT', resolved_at = NULL, resolved_by = NULL WHERE id = ${c.id}`);
    await post(c, "System", null, "System", `${name} re-opened it.`); await post(c, "Employee", m.id, name, note); await tellIT(c, `Re-opened by ${name} (chat #${c.id})`, "Open Chats to read why.");
  }
  await audit({ entityType: "device_chat", entityId: c.id, action: act, performedBy: name, summary: `Chat #${c.id} ${act === "confirm" ? "confirmed fixed" : "re-opened"} by the employee` });
  res.json({ ok: true });
}));

/* ── attachments (max size and file types set by the administrator; stored encrypted) ── */
const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", txt: "text/plain", log: "text/plain", csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip: "application/zip", webm: "video/webm" };
export async function storeAttachment(c: any, by: { id: number | null; name: string }, side: "IT" | "Employee" | "Member", fileName: string, data: Buffer, kind: "file" | "recording" = "file", note?: string | null) {
  const msgId = await post(c, side, by.id, by.name, note || `${kind === "recording" ? "Session recording" : "Attachment"}: ${fileName} (${(data.length / 1024 / 1024).toFixed(2)} MB)`);
  const ext = fileName.split(".").pop()!.toLowerCase();
  const [a] = rowsOf(await db.execute(sql`INSERT INTO chat_attachments (chat_id, message_id, file_name, mime, size_bytes, sha256, data, kind, uploaded_by_id, uploaded_by)
    VALUES (${c.id}, ${msgId}, ${fileName}, ${MIME[ext] || "application/octet-stream"}, ${data.length}, ${crypto.createHash("sha256").update(data).digest("hex")}, ${sealBuf(data)}, ${kind}, ${by.id}, ${by.name}) RETURNING id`));
  await audit({ entityType: "device_chat", entityId: c.id, action: kind === "recording" ? "recording" : "attach", performedBy: by.name, summary: `Chat #${c.id}: ${kind} "${fileName}" (${data.length} bytes, sha256 ${crypto.createHash("sha256").update(data).digest("hex").slice(0, 12)})` });
  return a.id as number;
}
router.post("/chats/:id/attachments", requireAuth, wrap(async (req, res) => {
  const { m, c, role, name } = await load(req); if (!c || !role) return fail(res, 404, "Chat not found");
  if (role === "admin") return fail(res, 403, "Super Admin can read this chat but not write in it");
  if (c.kind === "support" && role === "employee" && (c.status === "Closed" || c.status === "Resolved")) return fail(res, 400, "Re-open the chat to send files");
  const fileName = String(req.body?.fileName || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 150);
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const exts = String(await setting("chat.attachmentExtensions", "pdf,png,jpg,jpeg,txt,log,csv,docx,xlsx,zip")).split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  const NEVER = ["exe", "bat", "cmd", "com", "ps1", "psm1", "vbs", "js", "jse", "wsf", "msi", "scr", "dll", "html", "htm", "svg", "hta", "jar", "lnk", "reg"];
  if (!fileName || !ext || !exts.includes(ext) || NEVER.includes(ext)) return fail(res, 400, `This file type is not allowed. Allowed: ${exts.filter(x => !NEVER.includes(x)).join(", ")}`);
  const data = Buffer.from(String(req.body?.dataBase64 || ""), "base64");
  const maxMB = Math.min(10, Number(await setting("chat.maxAttachmentMB", 10)) || 10);
  if (!data.length) return fail(res, 400, "The file is empty");
  if (data.length > maxMB * 1024 * 1024) return fail(res, 400, `Files can be at most ${maxMB} MB`);
  if (["docx", "xlsx", "pptx", "zip"].includes(ext) && !(data[0] === 0x50 && data[1] === 0x4b)) return fail(res, 400, "The file content does not match its type");
  if (ext === "pdf" && data.subarray(0, 4).toString() !== "%PDF") return fail(res, 400, "The file content does not match its type");
  if (["png", "jpg", "jpeg", "gif"].includes(ext) && !((data[0] === 0x89 && data[1] === 0x50) || (data[0] === 0xff && data[1] === 0xd8) || data.subarray(0, 3).toString() === "GIF")) return fail(res, 400, "The file content does not match its type");
  if (tooFast(m.id)) return fail(res, 429, "Too many messages — wait a minute");
  const side = c.kind === "direct" ? "Member" : role === "employee" ? "Employee" : "IT";
  const aid = await storeAttachment(c, { id: m.id, name }, side, fileName, data, "file", s(req.body?.message));
  if (c.kind === "support") { if (side === "Employee") { await db.execute(sql`UPDATE device_chats SET status = 'Waiting on IT' WHERE id = ${c.id}`); await tellIT(c, `File from ${name} (chat #${c.id})`, "Open Chats to see it."); } else { await db.execute(sql`UPDATE device_chats SET status = 'Waiting on employee' WHERE id = ${c.id}`); await notify(c.user_id, "New file from IT", `${name} sent a file — open Chats.`, `/chats?c=${c.id}`); } }
  else for (const x of rowsOf(await db.execute(sql`SELECT user_id FROM chat_members WHERE chat_id = ${c.id} AND user_id <> ${m.id}`))) await notify(x.user_id, `New file from ${name}`, "Open Chats to see it.", `/chats?c=${c.id}`);
  res.status(201).json({ id: aid });
}));
router.get("/chats/:id/attachments/:aid", requireAuth, wrap(async (req, res) => {
  const { c, role, name } = await load(req); if (!c || !role) return fail(res, 404, "Not found");
  const [a] = rowsOf(await db.execute(sql`SELECT * FROM chat_attachments WHERE id = ${Number(req.params.aid)} AND chat_id = ${c.id}`)); if (!a) return fail(res, 404, "Not found");
  const data = openBuf(Buffer.from(a.data));
  await audit({ entityType: "device_chat", entityId: c.id, action: "download", performedBy: name, summary: `Chat #${c.id}: downloaded ${a.kind} "${a.file_name}"${role === "admin" ? " (Super Admin)" : ""}` });
  res.setHeader("Content-Type", a.mime); res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename="${String(a.file_name).replace(/"/g, "")}"`); res.setHeader("Cache-Control", "private, no-store");
  res.send(data);
}));

/* ── screen sharing / remote help (support chats only; the employee consents; IT's browser records the session) ── */
async function sess(req: Request) {
  const ctx = await load(req); const sid = Number(req.params.sid) || null;
  const [ss] = sid ? rowsOf(await db.execute(sql`SELECT * FROM chat_sessions WHERE id = ${sid} AND chat_id = ${Number(req.params.id)}`)) : [null];
  return { ...ctx, ss };
}
const SESSION_VIEW = (x: any) => x && ({ id: x.id, status: x.status, control: x.control, requestedBy: x.requested_by, requestedById: x.requested_by_id, sharerId: x.sharer_id, startedAt: x.started_at, endedAt: x.ended_at, consentAt: x.consent_at, recordingId: x.recording_attachment_id });
router.get("/chats/:id/sessions/current", requireAuth, wrap(async (req, res) => {
  const { c, role } = await load(req); if (!c || !role) return fail(res, 404, "Chat not found");
  const [x] = rowsOf(await db.execute(sql`SELECT * FROM chat_sessions WHERE chat_id = ${c.id} AND status IN ('requested', 'live') ORDER BY id DESC LIMIT 1`));
  res.json({ session: SESSION_VIEW(x), role, iceServers: await setting("chat.iceServers", []), maxRecordingMB: Number(await setting("chat.maxRecordingMB", 300)) || 300 });
}));
router.post("/chats/:id/sessions", requireAuth, wrap(async (req, res) => {
  const { m, c, role, name } = await load(req); if (!c || !role) return fail(res, 404, "Chat not found");
  if (c.kind !== "support") return fail(res, 400, "Screen sharing is available in IT support chats");
  if (role !== "it") return fail(res, 403, "Only IT can ask to see a screen");
  if (c.status === "Closed") return fail(res, 400, "Re-open the chat first");
  const [open] = rowsOf(await db.execute(sql`SELECT id FROM chat_sessions WHERE chat_id = ${c.id} AND status IN ('requested', 'live')`)); if (open) return fail(res, 400, "A session is already open");
  const [x] = rowsOf(await db.execute(sql`INSERT INTO chat_sessions (chat_id, requested_by_id, requested_by, sharer_id) VALUES (${c.id}, ${m.id}, ${name}, ${c.user_id}) RETURNING *`));
  await post(c, "System", null, "System", `${name} asked to see your screen (session #${x.id}).`);
  await notify(c.user_id, "IT asks to see your screen", `${name} asked to see your screen — open Chats to accept or decline.`, `/chats?c=${c.id}`, "warning");
  await audit({ entityType: "chat_session", entityId: x.id, action: "request", performedBy: name, summary: `Screen share requested in chat #${c.id}` });
  res.status(201).json(SESSION_VIEW(x));
}));
router.post("/chats/:id/sessions/:sid/:action", requireAuth, (req, _res, next) => ["accept", "decline", "control", "end", "signal"].includes(String(req.params.action)) ? next() : next("route"), wrap(async (req, res) => {
  const { m, c, role, name, ss } = await sess(req); if (!c || !role || !ss) return fail(res, 404, "Session not found");
  const act = String(req.params.action); const ev = (t: string) => post(c, "System", null, "System", t);
  const done = async (summary: string) => { await audit({ entityType: "chat_session", entityId: ss.id, action: act, performedBy: name, summary: `${summary} (chat #${c.id})` }); const [x] = rowsOf(await db.execute(sql`SELECT * FROM chat_sessions WHERE id = ${ss.id}`)); res.json(SESSION_VIEW(x)); };
  const employee = role === "employee", it = role === "it" && ss.requested_by_id === m.id;
  if (act === "accept" || act === "decline") {
    if (!employee || ss.status !== "requested") return fail(res, 400, "Nothing to accept");
    if (act === "decline") { await db.execute(sql`UPDATE chat_sessions SET status = 'declined', ended_at = now(), ended_by = ${name} WHERE id = ${ss.id}`); await ev(`${name} declined screen sharing.`); return done("Screen share declined"); }
    await db.execute(sql`UPDATE chat_sessions SET status = 'live', consent_at = now(), started_at = now() WHERE id = ${ss.id}`); await ev(`${name} agreed and is sharing the screen. This session is recorded.`); return done("Employee consented; screen sharing started");
  }
  if (act === "control") {   // IT asks for control → employee grants / denies → either ends
    const step = String(req.body?.step || "");
    if (ss.status !== "live") return fail(res, 400, "Start screen sharing first");
    if (step === "request") { if (!it) return fail(res, 403, "Only the IT person on the session can ask"); await db.execute(sql`UPDATE chat_sessions SET control = 'requested' WHERE id = ${ss.id}`); await ev(`${name} asked for remote control.`); return done("Remote control requested"); }
    if (step === "grant" || step === "deny") { if (!employee || ss.control !== "requested") return fail(res, 400, "Nothing to answer");
      await db.execute(sql`UPDATE chat_sessions SET control = ${step === "grant" ? "granted" : "denied"}, control_granted_at = ${step === "grant" ? sql`now()` : null} WHERE id = ${ss.id}`);
      await ev(step === "grant" ? `${name} allowed remote control (Quick Assist). Everything on screen is recorded.` : `${name} did not allow remote control.`); return done(step === "grant" ? "Remote control granted by the employee" : "Remote control denied"); }
    if (step === "end") { if (!employee && !it) return fail(res, 403, "Not on this session"); await db.execute(sql`UPDATE chat_sessions SET control = 'ended', control_ended_at = now() WHERE id = ${ss.id}`); await ev(`Remote control ended by ${name}.`); return done("Remote control ended"); }
    return fail(res, 400, "Unknown step");
  }
  if (act === "end") {
    if (!employee && !it && !(role === "it")) return fail(res, 403, "Not on this session");
    if (ss.status === "ended" || ss.status === "declined") return fail(res, 400, "Session already ended");
    await db.execute(sql`UPDATE chat_sessions SET status = 'ended', ended_at = now(), ended_by = ${name}, control = CASE WHEN control = 'granted' THEN 'ended' ELSE control END WHERE id = ${ss.id}`);
    const mins = ss.started_at ? Math.max(1, Math.round((Date.now() - new Date(ss.started_at).getTime()) / 60000)) : 0;
    await ev(`Screen session ended by ${name}${mins ? ` after ${mins} min` : ""}.`); return done(`Screen session ended${mins ? ` after ${mins} min` : ""}`);
  }
  if (act === "signal") {
    if (ss.status !== "live") return fail(res, 400, "Session not live");
    if (!employee && !it) return fail(res, 403, "Not on this session");
    const type = String(req.body?.type || ""); if (!["offer", "answer", "ice"].includes(type)) return fail(res, 400, "Bad signal");
    if (type === "offer" && !employee) return fail(res, 403, "Only the employee shares the screen"); if (type === "answer" && !it) return fail(res, 403, "Only IT answers");
    const payload = JSON.stringify(req.body?.payload ?? null); if (payload.length > 20000) return fail(res, 400, "Signal too large");
    await db.execute(sql`INSERT INTO chat_signals (session_id, from_id, type, payload) VALUES (${ss.id}, ${m.id}, ${type}, ${payload}::jsonb)`);
    return res.json({ ok: true });
  }
  return fail(res, 404, "Unknown action");
}));
router.get("/chats/:id/sessions/:sid/signals", requireAuth, wrap(async (req, res) => {
  const { m, role, ss } = await sess(req); if (!role || !ss) return fail(res, 404, "Session not found");
  if (!(role === "employee" || (role === "it" && ss.requested_by_id === m.id))) return fail(res, 403, "Not on this session");
  const after = Number(req.query.after) || 0;
  const [st] = rowsOf(await db.execute(sql`SELECT status, control FROM chat_sessions WHERE id = ${ss.id}`));
  res.json({ status: st.status, control: st.control, signals: rowsOf(await db.execute(sql`SELECT id, type, payload FROM chat_signals WHERE session_id = ${ss.id} AND from_id <> ${m.id} AND id > ${after} ORDER BY id`)) });
}));
/** IT uploads the session recording (webm) — kept encrypted as a chat attachment; size limit set by the administrator. */
router.post("/chats/:id/sessions/:sid/recording", requireAuth, express.raw({ type: () => true, limit: "400mb" }), wrap(async (req, res) => {
  const { m, c, role, name, ss } = await sess(req); if (!c || !role || !ss) return fail(res, 404, "Session not found");
  if (!(role === "it" && ss.requested_by_id === m.id)) return fail(res, 403, "Only the IT person on the session uploads its recording");
  const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const maxMB = Number(await setting("chat.maxRecordingMB", 300)) || 300;
  if (!data.length) return fail(res, 400, "Empty recording");
  if (data.length > maxMB * 1048576) return fail(res, 400, `Recording is larger than ${maxMB} MB`);
  if (!(data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3)) return fail(res, 400, "Not a WebM recording");
  const aid = await storeAttachment(c, { id: m.id, name }, "IT", `session-${ss.id}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.webm`, data, "recording", `Recording of screen session #${ss.id} (${(data.length / 1048576).toFixed(1)} MB)`);
  await db.execute(sql`UPDATE chat_sessions SET recording_attachment_id = ${aid} WHERE id = ${ss.id}`);
  res.status(201).json({ id: aid });
}));

/** Unread for the pop-up window: everything I would see as unread (direct + support as employee + support I am handling). */
router.get("/chats-unread", requireAuth, wrap(async (req, res) => {
  const m = await me(req);
  const rows = rowsOf(await db.execute(sql`SELECT c.id, c.kind, c.subject, max(x.at) AS "lastAt", count(*)::int AS unread,
      (SELECT x2.sender_name FROM device_chat_messages x2 WHERE x2.chat_id = c.id AND x2.side <> 'System' ORDER BY x2.at DESC LIMIT 1) AS "fromName"
    FROM device_chats c JOIN device_chat_messages x ON x.chat_id = c.id AND x.read_at IS NULL AND x.side <> 'System' AND coalesce(x.sender_id, 0) <> ${m.id}
    WHERE c.status <> 'Closed' AND (
      (c.kind = 'direct' AND EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = c.id AND cm.user_id = ${m.id}))
      OR (c.kind = 'support' AND c.user_id = ${m.id} AND x.side = 'IT')
      OR (c.kind = 'support' AND c.user_id <> ${m.id} AND x.side = 'Employee' AND (c.opened_by_id = ${m.id} OR EXISTS (SELECT 1 FROM device_chat_messages y WHERE y.chat_id = c.id AND y.side = 'IT' AND y.sender_id = ${m.id}))))
    GROUP BY c.id, c.kind, c.subject`));
  res.json(rows);
}));

export default router;
