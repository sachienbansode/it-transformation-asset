import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { readObject } from "./storage";
import { logAudit } from "./audit-logs";
import { sha256, AUDITOR_STATUSES, sendFile } from "./compliance";

/*
 * External auditor portal.
 *  Sign-in: invitation link → set password → every sign-in = password + 6-digit code emailed (10 min, 5 tries).
 *  Scope:   only audits with live access (active, within valid_from…valid_until), only items / schedules the team has
 *           shared, only evidence linked to those, only comments marked for the auditor. Files view-only unless the
 *           access allows downloads. Every sign-in, file view and download is logged against the audit.
 *  Writes:  comments, auditor remarks, auditor statuses, "request information" (back to In Progress with a comment).
 */

export const authRouter = Router();
export const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const q = async (query: any) => rowsOf(await db.execute(query));
const camel = (r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v instanceof Date ? v.toISOString() : v]));
class Bad extends Error { constructor(m: string, public status = 400) { super(m); } }
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) res.status(e?.status || 500).json({ error: e?.message || String(e) }); }
};
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const LIVE = sql`x.is_active AND x.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date AND x.valid_until >= (now() AT TIME ZONE 'Asia/Kolkata')::date`;
const otpOn = () => (process.env.AUDITOR_OTP || "on").toLowerCase() !== "off";
const sess = (req: Request) => req.session as any;
async function log(req: Request, action: string, o: { userId?: number | null; name?: string | null; auditId?: number | null; documentId?: number | null; fileId?: number | null; detail?: string | null } = {}) {
  await q(sql`INSERT INTO cmp_access_log (user_id, user_name, action, audit_id, document_id, file_id, detail, ip) VALUES (${o.userId ?? sess(req).userId ?? null}, ${o.name ?? sess(req).auditorName ?? null}, ${action}, ${o.auditId ?? null}, ${o.documentId ?? null}, ${o.fileId ?? null}, ${o.detail ?? null}, ${req.ip ?? null})`).catch(() => {});
}
const save = (req: Request) => new Promise<void>((ok, ko) => req.session.save(e => (e ? ko(e) : ok())));
const regen = (req: Request) => new Promise<void>((ok, ko) => req.session.regenerate(e => (e ? ko(e) : ok())));
const mask = (e: string) => e.replace(/^(.)(.*)(.@.*)$/, (_, a, b, c) => a + "*".repeat(Math.min(b.length, 6)) + c);

/* ─── Sign-in (public) ───────────────────────────────────────────────────── */
const PW_RULE = "At least 10 characters with upper and lower case letters and a number";
const strong = (p: string) => p.length >= 10 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);

authRouter.get("/auditor-auth/setup", wrap(async (req, res) => {
  const t = String(req.query.token || "");
  const [r] = await q(sql`SELECT t.*, u.email, u.name FROM cmp_auditor_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ${sha256(t)}`);
  if (!r || r.used_at || new Date(r.expires_at) < new Date()) throw new Bad("This link has expired or was already used. Ask the audit team to resend the invitation.", 410);
  res.json({ email: r.email, name: r.name, rule: PW_RULE });
}));
authRouter.post("/auditor-auth/setup", wrap(async (req, res) => {
  const pv = z.object({ token: z.string().min(20), password: z.string().max(200) }).safeParse(req.body);
  if (!pv.success) throw new Bad("Link or password missing");
  const v = pv.data;
  const [r] = await q(sql`SELECT t.*, u.email, u.user_type FROM cmp_auditor_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ${sha256(v.token)}`);
  if (!r || r.used_at || new Date(r.expires_at) < new Date()) throw new Bad("This link has expired or was already used. Ask the audit team to resend the invitation.", 410);
  if (r.user_type !== "external") throw new Bad("Not an auditor account", 403);
  if (!strong(v.password)) throw new Bad(PW_RULE);
  if (v.password.toLowerCase().includes(String(r.email).split("@")[0].toLowerCase())) throw new Bad("The password must not contain your email name");
  await q(sql`UPDATE users SET password_hash = ${await bcrypt.hash(v.password, 12)}, status = 'active' WHERE id = ${r.user_id}`);
  await q(sql`UPDATE cmp_auditor_tokens SET used_at = now() WHERE id = ${r.id}`);
  await log(req, "password_set", { userId: r.user_id, name: r.email });
  res.json({ ok: true });
}));

const fails = new Map<string, { n: number; at: number }>();
authRouter.post("/auditor-auth/login", wrap(async (req, res) => {
  const v = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!v.success) throw new Bad("Enter your email and password");
  const key = v.data.email; const f = fails.get(key);
  if (f && f.n >= 5 && Date.now() - f.at < 15 * 60_000) throw new Bad("Too many attempts. Try again in 15 minutes.", 429);
  const [u] = await q(sql`SELECT id, email, name, password_hash, is_active, user_type FROM users WHERE lower(email) = ${v.data.email}`);
  const ok = !!u && u.user_type === "external" && u.is_active && u.password_hash && (await bcrypt.compare(v.data.password, u.password_hash));
  if (!ok) { fails.set(key, { n: (f && Date.now() - f.at < 15 * 60_000 ? f.n : 0) + 1, at: Date.now() }); await log(req, "login_failed", { userId: u?.id ?? null, name: v.data.email }); throw new Bad("Email or password is incorrect", 401); }
  const live = await q(sql`SELECT 1 FROM cmp_audit_access x WHERE x.user_id = ${u.id} AND ${LIVE}`);
  if (!live.length) { await log(req, "login_refused", { userId: u.id, name: u.email, detail: "no live audit access" }); throw new Bad("Your audit access has ended or not started yet. Contact the audit team.", 403); }
  fails.delete(key);
  if (!otpOn()) return finish(req, res, u);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await q(sql`UPDATE cmp_auditor_otps SET used_at = now() WHERE user_id = ${u.id} AND used_at IS NULL`);
  await q(sql`INSERT INTO cmp_auditor_otps (user_id, code_hash, expires_at) VALUES (${u.id}, ${sha256(u.id + ":" + code)}, now() + interval '10 minutes')`);
  const { sendDirect } = await import("../lib/mailer");
  await sendDirect("compliance_auditor", [u.email], "Your sign-in code", `<p>Your IT Hub auditor portal sign-in code is</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you did not try to sign in, tell the audit team.</p><p>Regards,</p>`);
  sess(req).pendingAuditorId = u.id; await save(req);
  res.json({ otpRequired: true, sentTo: mask(u.email) });
}));
authRouter.post("/auditor-auth/verify", wrap(async (req, res) => {
  const v = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }).safeParse(req.body);
  if (!v.success) throw new Bad("Enter the 6-digit code");
  const pid = sess(req).pendingAuditorId; if (!pid) throw new Bad("Sign in again", 401);
  const [o] = await q(sql`SELECT * FROM cmp_auditor_otps WHERE user_id = ${pid} AND used_at IS NULL ORDER BY id DESC LIMIT 1`);
  if (!o || new Date(o.expires_at) < new Date()) throw new Bad("The code has expired. Sign in again for a new code.", 401);
  if (o.attempts >= 5) throw new Bad("Too many wrong codes. Sign in again for a new code.", 429);
  if (o.code_hash !== sha256(pid + ":" + v.data.code)) { await q(sql`UPDATE cmp_auditor_otps SET attempts = attempts + 1 WHERE id = ${o.id}`); await log(req, "otp_failed", { userId: pid }); throw new Bad("Wrong code", 401); }
  await q(sql`UPDATE cmp_auditor_otps SET used_at = now() WHERE id = ${o.id}`);
  const [u] = await q(sql`SELECT id, email, name FROM users WHERE id = ${pid}`);
  return finish(req, res, u);
}));
async function finish(req: Request, res: Response, u: any) {
  await regen(req);
  req.session.userId = u.id; sess(req).mfaVerified = true; sess(req).auditor = true; sess(req).auditorName = u.name || u.email;
  await save(req);
  await q(sql`UPDATE users SET last_login_at = now(), status = 'active' WHERE id = ${u.id}`);
  for (const a of await q(sql`SELECT audit_id FROM cmp_audit_access x WHERE x.user_id = ${u.id} AND ${LIVE}`)) await log(req, "login", { userId: u.id, name: u.name || u.email, auditId: a.audit_id });
  res.json({ ok: true });
}

/* ─── Session fence: auditor sessions reach only the auditor API ─────────── */
const AUDITOR_ALLOWED = [/^\/auditor-/, /^\/auth\/(me|logout|profile)$/, /^\/config$/];
export async function auditorFence(req: Request, res: Response, next: NextFunction) {
  const s = sess(req);
  if (!s.userId) return next();
  if (s.auditor === undefined) { // decide once per session: external user with any audit access = auditor
    const [u] = await q(sql`SELECT u.user_type, EXISTS (SELECT 1 FROM cmp_audit_access x WHERE x.user_id = u.id) AS has FROM users u WHERE u.id = ${s.userId}`).catch(() => [] as any[]);
    s.auditor = !!(u && u.user_type === "external" && u.has);
  }
  if (!s.auditor) { if (/^\/auditor-(?!auth\/)/.test(req.path)) { res.status(403).json({ error: "Auditor portal only" }); return; } return next(); }
  if (AUDITOR_ALLOWED.some(r => r.test(req.path))) return next();
  res.status(403).json({ error: "Not available in the auditor portal" });
}

/* ─── Auditor data (signed-in auditor) ───────────────────────────────────── */
async function access(req: Request, auditId: number) {
  const [x] = await q(sql`SELECT x.* FROM cmp_audit_access x JOIN users u ON u.id = x.user_id AND u.is_active WHERE x.user_id = ${req.session.userId} AND x.audit_id = ${auditId} AND ${LIVE}`);
  if (!x) throw new Bad("You do not have access to this audit (or it has ended)", 403);
  void q(sql`UPDATE cmp_audit_access SET last_access_at = now() WHERE id = ${x.id}`);
  return x;
}
const id = (v: unknown) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Bad("Invalid id"); return n; };
async function itemFor(req: Request, iid: number) {
  const [i] = await q(sql`SELECT * FROM cmp_items WHERE id = ${iid} AND shared_at IS NOT NULL`);
  if (!i) throw new Bad("Checkpoint not found", 404);
  const x = await access(req, i.audit_id);
  return { i, x };
}
const stats = sql`count(*) FILTER (WHERE i.kind = 'checklist')::int AS checkpoints,
  count(*) FILTER (WHERE i.kind = 'checklist' AND i.status IN ('Closed','Closed-Obs','Not Applicable'))::int AS closed,
  count(*) FILTER (WHERE i.kind = 'checklist' AND i.status = 'Submitted')::int AS to_review,
  count(*) FILTER (WHERE i.kind = 'checklist' AND i.status = 'Under Review')::int AS under_review,
  count(*) FILTER (WHERE i.kind = 'checklist' AND i.status = 'In Progress')::int AS info_requested,
  count(*) FILTER (WHERE i.kind = 'policy')::int AS policies`;

router.get("/auditor-me", wrap(async (req, res) => {
  const [u] = await q(sql`SELECT id, name, email FROM users WHERE id = ${req.session.userId}`);
  const audits = (await q(sql`SELECT a.id, a.audit_no, a.title, a.status, a.period_from, a.period_to, a.target_date, a.scope, c.name AS company_name, x.firm, x.valid_until, x.can_download, s.*
    FROM cmp_audit_access x JOIN cmp_audits a ON a.id = x.audit_id JOIN cmp_companies c ON c.id = a.company_id
    LEFT JOIN LATERAL (SELECT ${stats} FROM cmp_items i WHERE i.audit_id = a.id AND i.shared_at IS NOT NULL) s ON true
    WHERE x.user_id = ${req.session.userId} AND ${LIVE} ORDER BY a.id DESC`)).map(camel);
  res.json({ ...u, audits });
}));
router.get("/auditor-audits/:id", wrap(async (req, res) => {
  const aid = id(req.params.id); const x = await access(req, aid);
  const [a] = await q(sql`SELECT a.id, a.audit_no, a.title, a.status, a.audit_type, a.period_from, a.period_to, a.target_date, a.scope, a.audit_firm, c.name AS company_name FROM cmp_audits a JOIN cmp_companies c ON c.id = a.company_id WHERE a.id = ${aid}`);
  const [s] = await q(sql`SELECT ${stats} FROM cmp_items i WHERE i.audit_id = ${aid} AND i.shared_at IS NOT NULL`);
  const [t] = await q(sql`SELECT count(*) FILTER (WHERE kind = 'checklist')::int AS total FROM cmp_items WHERE audit_id = ${aid}`);
  const byArea = (await q(sql`SELECT coalesce(area, sheet) AS area, min(sort_order) AS o, count(*)::int AS total, count(*) FILTER (WHERE status IN ('Closed','Closed-Obs','Not Applicable'))::int AS closed,
    count(*) FILTER (WHERE status = 'Submitted')::int AS to_review FROM cmp_items WHERE audit_id = ${aid} AND kind = 'checklist' AND shared_at IS NOT NULL GROUP BY 1 ORDER BY 2`)).map(camel);
  res.json({ ...camel(a), canDownload: x.can_download, validUntil: x.valid_until, stats: { ...camel(s), totalInAudit: t.total }, byArea });
}));
router.get("/auditor-audits/:id/items", wrap(async (req, res) => {
  const aid = id(req.params.id); await access(req, aid);
  res.json((await q(sql`SELECT i.id, i.kind, i.sheet, i.ref_no, i.seq, i.area, i.sub_area, i.checkpoint, i.evidence_required, i.doc_type, i.management_reply, i.auditor_remarks, i.status, i.target_date, i.last_review_date, i.shared_at, i.sort_order,
    ou.name AS owner_name, (SELECT count(*)::int FROM cmp_item_documents d WHERE d.item_id = i.id) AS evidence_count,
    (SELECT count(*)::int FROM cmp_comments c WHERE c.item_id = i.id AND (c.visibility = 'auditor' OR c.is_external)) AS comment_count
    FROM cmp_items i LEFT JOIN users ou ON ou.id = i.owner_user_id WHERE i.audit_id = ${aid} AND i.shared_at IS NOT NULL ORDER BY i.sort_order`)).map(camel));
}));
async function itemDetail(iid: number) {
  const [i] = await q(sql`SELECT i.id, i.audit_id, i.kind, i.sheet, i.ref_no, i.seq, i.area, i.sub_area, i.checkpoint, i.evidence_required, i.doc_type, i.management_reply, i.auditor_remarks, i.status, i.target_date, i.last_review_date, ou.name AS owner_name, su.name AS spoc_name
    FROM cmp_items i LEFT JOIN users ou ON ou.id = i.owner_user_id LEFT JOIN users su ON su.id = i.spoc_user_id WHERE i.id = ${iid}`);
  const documents = (await q(sql`SELECT d.id, d.category, d.title, d.description, d.approved_by, d.approved_on, d.last_review_date, f.id AS file_id, f.file_name, f.version, f.file_size, f.content_type, f.uploaded_at
    FROM cmp_item_documents l JOIN cmp_documents d ON d.id = l.document_id LEFT JOIN LATERAL (SELECT * FROM cmp_document_files x WHERE x.document_id = d.id ORDER BY version DESC LIMIT 1) f ON true WHERE l.item_id = ${iid} ORDER BY l.linked_at`)).map(camel);
  const comments = (await q(sql`SELECT id, author, is_external, system, body, created_at FROM cmp_comments WHERE item_id = ${iid} AND (visibility = 'auditor' OR is_external) ORDER BY created_at`)).map(camel);
  return { ...camel(i), documents, comments };
}
router.get("/auditor-items/:id", wrap(async (req, res) => { const { i } = await itemFor(req, id(req.params.id)); res.json(await itemDetail(i.id)); }));

const decision = z.object({ status: z.enum([...AUDITOR_STATUSES, "In Progress"] as unknown as [string, ...string[]]).optional(), auditorRemarks: z.string().max(20000).nullable().optional(), comment: z.string().trim().max(4000).optional() });
router.patch("/auditor-items/:id", wrap(async (req, res) => {
  const iid = id(req.params.id); const { i } = await itemFor(req, iid);
  const p = decision.safeParse(req.body); if (!p.success) throw new Bad("Choose a valid review status");
  const v = p.data; const me = sess(req).auditorName || "Auditor";
  if (v.status === "In Progress" && (!v.comment || v.comment.length < 5)) throw new Bad("Say what information is needed (a comment of at least 5 characters)");
  if (v.status === "Partially Closed" && !v.comment && !(v.auditorRemarks ?? i.auditor_remarks)) throw new Bad("Add remarks or a comment saying what is still open");
  const status = v.status ?? i.status, remarks = v.auditorRemarks === undefined ? i.auditor_remarks : v.auditorRemarks;
  await q(sql`UPDATE cmp_items SET status = ${status}, auditor_remarks = ${remarks}, auditor_updated_at = now(), updated_by = ${me + " (auditor)"}, updated_at = now() WHERE id = ${iid}`);
  const notes: string[] = [];
  if (status !== i.status) notes.push(status === "In Progress" ? `Information requested by the auditor (status ${i.status} → In Progress)` : `Auditor set status ${i.status} → ${status}`);
  if ((remarks ?? null) !== (i.auditor_remarks ?? null)) notes.push("Auditor remarks updated");
  if (notes.length) await q(sql`INSERT INTO cmp_comments (item_id, user_id, author, is_external, system, body, visibility) VALUES (${iid}, ${req.session.userId}, ${me}, true, true, ${notes.join(" · ")}, 'auditor')`);
  if (v.comment) await q(sql`INSERT INTO cmp_comments (item_id, user_id, author, is_external, body, visibility) VALUES (${iid}, ${req.session.userId}, ${me}, true, ${v.comment}, 'auditor')`);
  if (notes.length || v.comment) void tellTeam(iid, me, notes.join(" · ") || "New comment", v.comment);
  await logAudit({ entityType: "compliance_item", entityId: iid, action: "auditor_update", performedBy: `${me} (auditor)`, summary: notes.join(" · ") || "Auditor comment" }).catch(() => {});
  res.json(await itemDetail(iid));
}));
router.post("/auditor-items/:id/comments", wrap(async (req, res) => {
  const iid = id(req.params.id); await itemFor(req, iid);
  const v = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(req.body); if (!v.success) throw new Bad("Write a comment");
  const me = sess(req).auditorName || "Auditor";
  await q(sql`INSERT INTO cmp_comments (item_id, user_id, author, is_external, body, visibility) VALUES (${iid}, ${req.session.userId}, ${me}, true, ${v.data.body}, 'auditor')`);
  void tellTeam(iid, me, "New comment", v.data.body);
  res.status(201).json({ ok: true });
}));
async function tellTeam(iid: number, who: string, what: string, comment?: string) {
  try {
    const { sendDirect, notify, htmlTable, esc } = await import("../lib/mailer");
    const [i] = await q(sql`SELECT i.ref_no, i.seq, i.checkpoint, i.status, a.audit_no, a.title, c.name AS company, ou.email AS oe, su.email AS se FROM cmp_items i JOIN cmp_audits a ON a.id = i.audit_id JOIN cmp_companies c ON c.id = a.company_id LEFT JOIN users ou ON ou.id = i.owner_user_id LEFT JOIN users su ON su.id = i.spoc_user_id WHERE i.id = ${iid}`);
    const ref = `${i.ref_no ?? ""}${i.seq > 1 ? "." + i.seq : ""}`;
    const subject = `Auditor on ${i.audit_no} ${ref}: ${what.slice(0, 80)}`;
    const html = `<p>${esc(who)} (auditor) updated a checkpoint.</p>${htmlTable([["Audit", `${i.audit_no} — ${i.title}`], ["Company", i.company], ["Checkpoint", `${ref} ${String(i.checkpoint).slice(0, 200)}`], ["Status", i.status], ["Update", what]])}${comment ? `<p><b>Comment:</b><br>${esc(comment).replace(/\n/g, "<br>")}</p>` : ""}<p>Reply in IT Hub › Audit &amp; Compliance.</p><p>Regards,</p>`;
    const to = [i.oe, i.se].filter(Boolean);
    if (to.length) await sendDirect("compliance_auditor_activity", to, subject, html);
    void notify("compliance_auditor_activity", { subject, html });
  } catch (e) { console.error("auditor tellTeam failed", e); }
}

router.get("/auditor-audits/:id/grids", wrap(async (req, res) => {
  const aid = id(req.params.id); await access(req, aid);
  const grids = (await q(sql`SELECT id, sheet, sort_order, grid, template_grid, status, updated_at FROM cmp_grids WHERE audit_id = ${aid} AND shared_at IS NOT NULL ORDER BY sort_order`)).map(camel);
  for (const g of grids as any[]) g.documents = (await q(sql`SELECT d.id, d.title, d.category, f.id AS file_id, f.file_name, f.version, f.file_size FROM cmp_grid_documents l JOIN cmp_documents d ON d.id = l.document_id
    LEFT JOIN LATERAL (SELECT * FROM cmp_document_files x WHERE x.document_id = d.id ORDER BY version DESC LIMIT 1) f ON true WHERE l.grid_id = ${g.id}`)).map(camel);
  res.json(grids);
}));

/* Files: only the current version of a document linked to something shared in an audit the auditor can access */
router.get("/auditor-files/:id", wrap(async (req, res) => {
  const fid = id(req.params.id); const download = req.query.download === "1";
  const [f] = await q(sql`SELECT f.*, d.title FROM cmp_document_files f JOIN cmp_documents d ON d.id = f.document_id AND d.is_active
    WHERE f.id = ${fid} AND f.version = (SELECT max(version) FROM cmp_document_files y WHERE y.document_id = f.document_id)`);
  if (!f) throw new Bad("File not found", 404);
  const audits = await q(sql`SELECT DISTINCT i.audit_id FROM cmp_item_documents l JOIN cmp_items i ON i.id = l.item_id WHERE l.document_id = ${f.document_id} AND i.shared_at IS NOT NULL
    UNION SELECT DISTINCT g.audit_id FROM cmp_grid_documents l JOIN cmp_grids g ON g.id = l.grid_id WHERE l.document_id = ${f.document_id} AND g.shared_at IS NOT NULL`);
  let x: any = null;
  for (const a of audits) { const [r] = await q(sql`SELECT x.* FROM cmp_audit_access x JOIN users u ON u.id = x.user_id AND u.is_active WHERE x.user_id = ${req.session.userId} AND x.audit_id = ${a.audit_id} AND ${LIVE}`); if (r) { x = r; break; } }
  if (!x) { await log(req, "file_refused", { fileId: fid, documentId: f.document_id }); throw new Bad("You do not have access to this file", 403); }
  if (download && !x.can_download) throw new Bad("Downloads are not enabled for your access — view the file in the browser", 403);
  const obj = await readObject(f.object_path).catch(() => null); if (!obj) throw new Bad("File is missing from storage", 404);
  await log(req, download ? "download" : "view", { auditId: x.audit_id, documentId: f.document_id, fileId: fid, detail: f.file_name });
  sendFile(res, obj.buffer, f.content_type || obj.contentType, f.file_name, download);
}));
