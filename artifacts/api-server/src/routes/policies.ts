import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess } from "../lib/rbac";

/*
 * Policies & notices with recorded acceptance.
 *  - Admin: draft → publish (immutable version snapshot + SHA-256 of the text) → users are notified (in-app, email, push).
 *    Editing a published policy and publishing again creates a new version that everyone must accept again.
 *  - Requirement: Mandatory (accept only; after the grace days the app is locked until accepted), Optional (accept / decline,
 *    can be withdrawn), Information (acknowledge).
 *  - Every decision is kept (append-only): who, which version, text hash, time, IP, browser, method.
 *  - Audience: everyone, or roles / departments / internal-external; built-in notices can target their own group (device agent).
 */

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const sha = (t: string) => crypto.createHash("sha256").update(t, "utf8").digest("hex");
const s = (v: unknown, max = 20000) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim().slice(0, max));
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); }
};
const uid = (req: Request) => (req.session as any)?.userId as number | undefined;
async function admin(req: Request) { const a = await getAccess(req); return !!a?.isAdmin; }

/* ── who a policy applies to ───────────────────────────────────────────── */
type Aud = { all?: boolean; roles?: number[]; departments?: string[]; userTypes?: string[]; agentUsers?: boolean };
function audSql(a: Aud) {
  if (a.all) return sql`u.is_active`;
  const parts = [];
  if (a.roles?.length) parts.push(sql`u.id IN (SELECT user_id FROM user_roles WHERE role_id IN (${sql.join(a.roles.map(Number).filter(Boolean).map(x => sql`${x}`), sql`, `)}))`);
  if (a.departments?.length) parts.push(sql`lower(coalesce(u.department, '')) IN (${sql.join(a.departments.map(d => sql`${String(d).toLowerCase()}`), sql`, `)})`);
  if (a.userTypes?.length) parts.push(sql`coalesce(u.user_type, 'internal') IN (${sql.join(a.userTypes.map(t => sql`${t}`), sql`, `)})`);
  if (a.agentUsers) parts.push(sql`(u.id IN (SELECT user_id FROM asset_agent_codes WHERE user_id IS NOT NULL) OR u.id IN (SELECT user_id FROM asset_agents WHERE user_id IS NOT NULL))`);
  if (!parts.length) return sql`false`;
  return sql`u.is_active AND (${sql.join(parts, sql` OR `)})`;
}
/** Latest decision per user for the current version of one policy. */
async function statusRows(p: any) {
  return rowsOf(await db.execute(sql`
    SELECT u.id AS "userId", u.name, u.email, u.employee_code AS "employeeCode", u.department, coalesce(u.user_type, 'internal') AS "userType",
           d.decision, d.at, d.method, d.ip, d.user_agent AS "userAgent", d.version AS "decidedVersion",
           (SELECT max(version) FROM policy_acceptances x WHERE x.policy_id = ${p.id} AND x.user_id = u.id AND x.decision = 'Accepted') AS "lastAcceptedVersion"
    FROM users u
    LEFT JOIN LATERAL (SELECT decision, at, method, ip, user_agent, version FROM policy_acceptances a WHERE a.policy_id = ${p.id} AND a.user_id = u.id AND a.version = ${p.version} ORDER BY a.at DESC, a.id DESC LIMIT 1) d ON true
    WHERE ${audSql(p.audience || {})} ORDER BY u.name`));
}
const overdueAt = (p: any) => p.published_at ? new Date(new Date(p.published_at).getTime() + (Number(p.due_days) || 0) * 86_400_000) : null;

/** Policies that apply to a user, with that user's state. */
export async function policiesFor(userId: number) {
  const pol = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE status = 'Published' AND version > 0 ORDER BY published_at DESC`));
  const out: any[] = [];
  for (const p of pol) {
    const [hit] = rowsOf(await db.execute(sql`SELECT 1 AS ok FROM users u WHERE u.id = ${userId} AND ${audSql(p.audience || {})}`));
    if (!hit) continue;
    const [d] = rowsOf(await db.execute(sql`SELECT decision, at, version FROM policy_acceptances WHERE policy_id = ${p.id} AND user_id = ${userId} AND version = ${p.version} ORDER BY at DESC, id DESC LIMIT 1`));
    const [v] = rowsOf(await db.execute(sql`SELECT title, body, body_sha256, change_note, published_at FROM policy_versions WHERE policy_id = ${p.id} AND version = ${p.version}`));
    const accepted = d?.decision === "Accepted";
    const decided = !!d && d.decision !== "Withdrawn";
    const due = overdueAt(p);
    out.push({ id: p.id, code: p.code, title: v?.title || p.title, category: p.category, requirement: p.requirement, version: p.version, body: v?.body || p.body, changeNote: v?.change_note,
      publishedAt: p.published_at, dueAt: p.requirement === "Mandatory" ? due : null, allowWithdraw: p.allow_withdraw && p.requirement === "Optional",
      decision: d?.decision || null, decidedAt: d?.at || null, pending: p.requirement === "Mandatory" || p.requirement === "Information" ? !accepted : !decided,
      overdue: p.requirement === "Mandatory" && !accepted && !!due && due < new Date() });
  }
  return out;
}

/** Record one decision (used by the app and by the device-agent download page). */
export async function recordDecision(p: any, userId: number, decision: string, meta: { method: string; ip?: string | null; userAgent?: string | null; note?: string | null }) {
  const [v] = rowsOf(await db.execute(sql`SELECT body_sha256 FROM policy_versions WHERE policy_id = ${p.id} AND version = ${p.version}`));
  await db.execute(sql`INSERT INTO policy_acceptances (policy_id, version, user_id, decision, body_sha256, method, ip, user_agent, note)
    VALUES (${p.id}, ${p.version}, ${userId}, ${decision}, ${v?.body_sha256 || sha(p.body || "")}, ${meta.method}, ${meta.ip || null}, ${String(meta.userAgent || "").slice(0, 300) || null}, ${meta.note || null})`);
  gateCache.delete(userId);
}

/* ── lock the app while a mandatory policy is overdue ─────────────────── */
const gateCache = new Map<number, { at: number; blocked: string | null }>();
const OPEN = [/^\/auth(\/|$)/, /^\/my-policies(\/|$)/, /^\/policies(\/|$)/, /^\/notifications(\/|$)/, /^\/push(\/|$)/, /^\/config$/, /^\/masters$/, /^\/healthz$/, /^\/agent\//, /^\/central(\/|$)/, /^\/auditor(\/|$)/];
export async function policyGate(req: Request, res: Response, next: NextFunction) {
  const id = uid(req); if (!id || OPEN.some(r => r.test(req.path))) return next();
  let c = gateCache.get(id);
  if (!c || Date.now() - c.at > 60_000) {
    try { const l = await policiesFor(id); const o = l.find(x => x.overdue); c = { at: Date.now(), blocked: o ? o.title : null }; gateCache.set(id, c); }
    catch { return next(); }
  }
  if (c.blocked) { res.status(428).json({ error: `Please read and accept "${c.blocked}" to continue (My Policies).`, policyRequired: true }); return; }
  next();
}

/* ═══ user ═══════════════════════════════════════════════════════════════ */
router.get("/my-policies", requireAuth, wrap(async (req, res) => {
  const list = await policiesFor(uid(req)!);
  const history = rowsOf(await db.execute(sql`SELECT a.id, a.policy_id AS "policyId", p.title, p.code, a.version, a.decision, a.method, a.at, a.ip
    FROM policy_acceptances a JOIN policies p ON p.id = a.policy_id WHERE a.user_id = ${uid(req)!} ORDER BY a.at DESC LIMIT 200`));
  res.json({ policies: list, pending: list.filter(x => x.pending).length, blocking: list.filter(x => x.overdue).length, history });
}));

router.post("/my-policies/:id/decision", requireAuth, wrap(async (req, res) => {
  const me = uid(req)!; const id = Number(req.params.id);
  const [p] = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE id = ${id} AND status = 'Published'`));
  if (!p) return fail(res, 404, "Policy not found");
  if (!(await policiesFor(me)).some(x => x.id === id)) return fail(res, 403, "This policy does not apply to you");
  const decision = String(req.body?.decision || "");
  if (Number(req.body?.version) !== Number(p.version)) return fail(res, 409, "A newer version has been published — read it again before accepting");
  if (!["Accepted", "Declined", "Withdrawn"].includes(decision)) return fail(res, 400, "Decision must be Accepted, Declined or Withdrawn");
  if (decision !== "Accepted" && p.requirement !== "Optional") return fail(res, 400, `${p.requirement === "Mandatory" ? "A mandatory policy" : "A notice"} can only be accepted`);
  if (decision === "Withdrawn") {
    if (!p.allow_withdraw) return fail(res, 400, "This consent cannot be withdrawn here — contact IT");
    const [d] = rowsOf(await db.execute(sql`SELECT decision FROM policy_acceptances WHERE policy_id = ${id} AND user_id = ${me} AND version = ${p.version} ORDER BY at DESC, id DESC LIMIT 1`));
    if (d?.decision !== "Accepted") return fail(res, 400, "Nothing to withdraw");
  }
  if (req.body?.confirm !== true && decision === "Accepted") return fail(res, 400, "Tick “I have read and understood” to accept");
  await recordDecision(p, me, decision, { method: "web", ip: req.ip, userAgent: req.get("user-agent"), note: s(req.body?.note, 500) });
  const by = await getPerformedBy(me).catch(() => "User");
  void logAudit({ entityType: "policy", entityId: id, action: decision.toLowerCase(), performedBy: by, summary: `${decision} ${p.code} v${p.version}: ${p.title}` }).catch(() => {});
  res.json({ ok: true });
}));

/* ═══ admin ══════════════════════════════════════════════════════════════ */
router.get("/policies", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage policies");
  const pol = rowsOf(await db.execute(sql`SELECT p.*, (SELECT body FROM policy_versions v WHERE v.policy_id = p.id AND v.version = p.version) AS published_body,
      (SELECT title FROM policy_versions v WHERE v.policy_id = p.id AND v.version = p.version) AS published_title FROM policies p ORDER BY p.status = 'Retired', p.updated_at DESC`));
  const out = [];
  for (const p of pol) {
    let stats = null;
    if (p.status === "Published" && p.version > 0) {
      const r = await statusRows(p); const due = overdueAt(p);
      const acc = r.filter(x => x.decision === "Accepted").length, dec = r.filter(x => x.decision === "Declined").length;
      const pend = r.length - acc - dec;
      stats = { audience: r.length, accepted: acc, declined: dec, pending: pend, overdue: p.requirement === "Mandatory" && due && due < new Date() ? r.length - acc : 0 };
    }
    out.push({ id: p.id, code: p.code, title: p.title, category: p.category, body: p.body, requirement: p.requirement, audience: p.audience, dueDays: p.due_days, allowWithdraw: p.allow_withdraw,
      push: p.push, status: p.status, version: p.version, publishedAt: p.published_at, publishedBy: p.published_by, systemKey: p.system_key, updatedAt: p.updated_at,
      unpublishedChanges: p.version > 0 && (p.body !== p.published_body || p.title !== p.published_title), stats });
  }
  res.json(out);
}));

function readPolicy(b: any) {
  const title = s(b.title, 200); if (!title || title.length < 3) throw Object.assign(new Error("Title is required"), { status: 400 });
  const body = s(b.body); if (!body || body.length < 20) throw Object.assign(new Error("Write the policy text (at least 20 characters)"), { status: 400 });
  const category = ["Policy", "Notice", "Consent"].includes(b.category) ? b.category : "Policy";
  const requirement = ["Mandatory", "Optional", "Information"].includes(b.requirement) ? b.requirement : "Mandatory";
  const due = Math.round(Number(b.dueDays ?? 7)); if (!(due >= 0 && due <= 90)) throw Object.assign(new Error("Days to accept must be 0–90"), { status: 400 });
  const a = b.audience || { all: true };
  const audience: Aud = a.all ? { all: true } : { roles: (a.roles || []).map(Number).filter(Boolean), departments: (a.departments || []).map(String).filter(Boolean), userTypes: (a.userTypes || []).filter((t: string) => ["internal", "external"].includes(t)), ...(a.agentUsers ? { agentUsers: true } : {}) };
  if (!audience.all && !audience.roles?.length && !audience.departments?.length && !audience.userTypes?.length && !audience.agentUsers) throw Object.assign(new Error("Choose who must accept it (everyone, or roles / departments / user type)"), { status: 400 });
  return { title, body, category, requirement, dueDays: due, audience, allowWithdraw: b.allowWithdraw !== false, push: b.push !== false };
}

router.post("/policies", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage policies");
  const v = readPolicy(req.body || {});
  const by = await getPerformedBy(uid(req)).catch(() => "Admin");
  const [n] = rowsOf(await db.execute(sql`SELECT count(*)::int + 1 AS n FROM policies`));
  const code = `POL-${String(n.n).padStart(4, "0")}`;
  const [r] = rowsOf(await db.execute(sql`INSERT INTO policies (code, title, category, body, requirement, audience, due_days, allow_withdraw, push, created_by)
    VALUES (${code}, ${v.title}, ${v.category}, ${v.body}, ${v.requirement}, ${JSON.stringify(v.audience)}::jsonb, ${v.dueDays}, ${v.allowWithdraw}, ${v.push}, ${by}) RETURNING id, code`));
  void logAudit({ entityType: "policy", entityId: r.id, action: "create", performedBy: by, summary: `Policy draft ${r.code}: ${v.title}` }).catch(() => {});
  res.status(201).json(r);
}));

router.patch("/policies/:id", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage policies");
  const id = Number(req.params.id);
  const [p] = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE id = ${id}`)); if (!p) return fail(res, 404, "Policy not found");
  if (p.status === "Retired") return fail(res, 400, "A retired policy cannot be edited");
  const v = readPolicy({ ...{ title: p.title, body: p.body, category: p.category, requirement: p.requirement, dueDays: p.due_days, audience: p.audience, allowWithdraw: p.allow_withdraw, push: p.push }, ...req.body });
  await db.execute(sql`UPDATE policies SET title = ${v.title}, body = ${v.body}, category = ${v.category}, requirement = ${v.requirement}, audience = ${JSON.stringify(v.audience)}::jsonb, due_days = ${v.dueDays},
    allow_withdraw = ${v.allowWithdraw}, push = ${v.push}, updated_at = now() WHERE id = ${id}`);
  res.json({ ok: true, note: p.version > 0 ? "Saved as changes — publish a new version for users to accept" : undefined });
}));

/** Publish: new immutable version; users in the audience are notified (in-app + email; push follows in-app). */
router.post("/policies/:id/publish", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage policies");
  const id = Number(req.params.id);
  const [p] = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE id = ${id}`)); if (!p) return fail(res, 404, "Policy not found");
  if (p.status === "Retired") return fail(res, 400, "A retired policy cannot be published");
  const note = s(req.body?.changeNote, 500);
  if (p.version > 0 && !note) return fail(res, 400, "Say what changed in this version (shown to users)");
  const by = await getPerformedBy(uid(req)).catch(() => "Admin");
  const ver = p.version + 1;
  await db.transaction(async tx => {
    await tx.execute(sql`INSERT INTO policy_versions (policy_id, version, title, body, body_sha256, requirement, change_note, published_by) VALUES (${id}, ${ver}, ${p.title}, ${p.body}, ${sha(p.body)}, ${p.requirement}, ${note || "First version"}, ${by})`);
    await tx.execute(sql`UPDATE policies SET version = ${ver}, status = 'Published', published_at = now(), published_by = ${by}, updated_at = now() WHERE id = ${id}`);
  });
  gateCache.clear();
  const [np] = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE id = ${id}`));
  let notified = 0;
  if (np.push) notified = await notifyAudience(np, ver === 1 ? "New" : "Updated");
  void logAudit({ entityType: "policy", entityId: id, action: "publish", performedBy: by, summary: `Published ${p.code} v${ver} (${p.requirement}): ${p.title}${note ? ` — ${note}` : ""}` }).catch(() => {});
  res.json({ ok: true, version: ver, notified });
}));

async function notifyAudience(p: any, what: "New" | "Updated" | "Reminder") {
  const rows = (await statusRows(p)).filter(r => r.decision !== "Accepted" && !(p.requirement === "Optional" && r.decision === "Declined"));
  const due = overdueAt(p); const dueTxt = due ? due.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).replace(/ /g, "-") : "";
  const title = `${what === "Reminder" ? "Reminder: " : what === "Updated" ? "Updated: " : ""}${p.requirement === "Mandatory" ? "Please accept" : p.requirement === "Optional" ? "Your consent is requested" : "Please read"} — ${p.title}`;
  const msg = p.requirement === "Mandatory" ? `Read and accept by ${dueTxt}. After that IT Hub will ask you to accept before you continue.` : p.requirement === "Optional" ? "You can accept or decline; you can change your choice later." : "Please read and acknowledge.";
  for (const r of rows) await db.execute(sql`INSERT INTO notifications (user_id, title, message, type, link) VALUES (${r.userId}, ${title.slice(0, 200)}, ${msg}, ${p.requirement === "Mandatory" ? "warning" : "info"}, '/my-policies')`);
  try {
    const { sendDirect } = await import("../lib/mailer");
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    const html = `<p>${title}</p><p>${msg}</p><p>Open it in IT Hub › My Policies${base ? ` (${base}/my-policies)` : ""}.</p><p>Regards,</p>`;
    const to = rows.map(r => r.email).filter(Boolean);
    for (let i = 0; i < to.length; i += 40) await sendDirect("policy_notice", to.slice(i, i + 40), title, html);
  } catch (e) { console.error("policy email failed", e); }
  return rows.length;
}

router.post("/policies/:id/remind", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage policies");
  const [p] = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE id = ${Number(req.params.id)} AND status = 'Published'`)); if (!p) return fail(res, 404, "Published policy not found");
  res.json({ notified: await notifyAudience(p, "Reminder") });
}));

router.post("/policies/:id/retire", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage policies");
  const [p] = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE id = ${Number(req.params.id)}`)); if (!p) return fail(res, 404, "Policy not found");
  if (p.system_key) return fail(res, 400, "Built-in notices cannot be retired — edit and publish a new version instead");
  await db.execute(sql`UPDATE policies SET status = 'Retired', updated_at = now() WHERE id = ${p.id}`); gateCache.clear();
  const by = await getPerformedBy(uid(req)).catch(() => "Admin");
  void logAudit({ entityType: "policy", entityId: p.id, action: "retire", performedBy: by, summary: `Retired ${p.code}: ${p.title} (acceptance records kept)` }).catch(() => {});
  res.json({ ok: true });
}));

/** Acceptance register for one policy: everyone in the audience with their decision on the current version. */
router.get("/policies/:id/report", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage policies");
  const [p] = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE id = ${Number(req.params.id)}`)); if (!p) return fail(res, 404, "Policy not found");
  const versions = rowsOf(await db.execute(sql`SELECT version, title, body_sha256 AS "sha256", change_note AS "changeNote", published_at AS "publishedAt", published_by AS "publishedBy",
      (SELECT count(DISTINCT user_id)::int FROM policy_acceptances a WHERE a.policy_id = v.policy_id AND a.version = v.version AND a.decision = 'Accepted') AS accepted
    FROM policy_versions v WHERE policy_id = ${p.id} ORDER BY version DESC`));
  res.json({ policy: { id: p.id, code: p.code, title: p.title, version: p.version, requirement: p.requirement, dueAt: overdueAt(p) }, users: p.version ? await statusRows(p) : [], versions });
}));
/** Full decision log (all versions, append-only) — for audit / DPDP requests. */
router.get("/policies/:id/log", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage policies");
  res.json(rowsOf(await db.execute(sql`SELECT a.id, a.version, a.decision, a.method, a.ip, a.user_agent AS "userAgent", a.body_sha256 AS "sha256", a.note, a.at, u.name, u.email, u.employee_code AS "employeeCode"
    FROM policy_acceptances a JOIN users u ON u.id = a.user_id WHERE a.policy_id = ${Number(req.params.id)} ORDER BY a.at DESC LIMIT 5000`)));
}));

/* ═══ push subscriptions ═════════════════════════════════════════════════ */
router.get("/push/key", requireAuth, wrap(async (req, res) => {
  const { vapidKeys } = await import("../lib/webpush");
  const [n] = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = ${uid(req)!}`));
  const [en] = rowsOf(await db.execute(sql`SELECT value FROM settings WHERE key = 'push.enabled'`));
  res.json({ publicKey: (await vapidKeys()).publicKey, devices: n.n, enabled: !(en && (en.value === false || en.value === "false")) });
}));
router.post("/push/subscribe", requireAuth, wrap(async (req, res) => {
  const sub = req.body?.subscription || req.body;
  const endpoint = s(sub?.endpoint, 1000), p256dh = s(sub?.keys?.p256dh, 200), auth = s(sub?.keys?.auth, 100);
  if (!endpoint || !/^https:\/\//.test(endpoint) || !p256dh || !auth) return fail(res, 400, "Invalid push subscription");
  await db.execute(sql`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (${uid(req)!}, ${endpoint}, ${p256dh}, ${auth}, ${String(req.get("user-agent") || "").slice(0, 300)})
    ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, failures = 0`);
  res.status(201).json({ ok: true });
}));
router.delete("/push/subscribe", requireAuth, wrap(async (req, res) => {
  const endpoint = s(req.body?.endpoint, 1000);
  if (endpoint) await db.execute(sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint} AND user_id = ${uid(req)!}`);
  else await db.execute(sql`DELETE FROM push_subscriptions WHERE user_id = ${uid(req)!}`);
  res.status(204).end();
}));
router.post("/push/test", requireAuth, wrap(async (req, res) => {
  const { pushToUser } = await import("../lib/webpush");
  const n = await pushToUser(uid(req)!, { title: "IT Hub notifications are on", body: "You will get alerts for approvals, tickets, policies and devices here.", url: "/" });
  res.json({ sent: n });
}));

export default router;
