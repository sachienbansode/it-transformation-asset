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
/** Deadline = days after publishing, or after a resend / reactivation that restarted the clock. */
const overdueAt = (p: any) => {
  if (!p.published_at) return null;
  const base = Math.max(new Date(p.published_at).getTime(), p.due_from ? new Date(p.due_from).getTime() : 0);
  return new Date(base + (Number(p.due_days) || 0) * 86_400_000);
};

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
      blockAccess: p.requirement === "Mandatory" && p.block_access !== false,
      overdue: p.requirement === "Mandatory" && !accepted && !!due && due < new Date(),
      // access is halted only when the policy says so
      halts: p.requirement === "Mandatory" && p.block_access !== false && !accepted && !!due && due < new Date() });
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
    try { const l = await policiesFor(id); const o = l.find(x => x.halts); c = { at: Date.now(), blocked: o ? o.title : null }; gateCache.set(id, c); }
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
  res.json({ policies: list, pending: list.filter(x => x.pending).length, blocking: list.filter(x => x.halts).length, history });
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
      (SELECT title FROM policy_versions v WHERE v.policy_id = p.id AND v.version = p.version) AS published_title,
      (SELECT requirement FROM policy_versions v WHERE v.policy_id = p.id AND v.version = p.version) AS published_requirement FROM policies p ORDER BY p.status = 'Retired', p.status = 'Inactive', p.updated_at DESC`));
  const out = [];
  for (const p of pol) {
    let stats = null;
    if ((p.status === "Published" || p.status === "Inactive") && p.version > 0) {
      const r = await statusRows(p); const due = overdueAt(p);
      const acc = r.filter(x => x.decision === "Accepted").length, dec = r.filter(x => x.decision === "Declined").length;
      const pend = r.length - acc - dec;
      stats = { audience: r.length, accepted: acc, declined: dec, pending: pend, overdue: p.status === "Published" && p.requirement === "Mandatory" && p.block_access !== false && due && due < new Date() ? r.length - acc : 0 };
    }
    out.push({ id: p.id, code: p.code, title: p.title, category: p.category, body: p.body, requirement: p.requirement, audience: p.audience, dueDays: p.due_days, allowWithdraw: p.allow_withdraw,
      push: p.push, blockAccess: p.block_access !== false, status: p.status, version: p.version, publishedAt: p.published_at, publishedBy: p.published_by, systemKey: p.system_key, updatedAt: p.updated_at, statusNote: p.status_note, dueAt: p.version > 0 ? overdueAt(p) : null,
      unpublishedChanges: p.version > 0 && (p.body !== p.published_body || p.title !== p.published_title || p.requirement !== p.published_requirement), stats });
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
  return { title, body, category, requirement, dueDays: due, audience, allowWithdraw: b.allowWithdraw !== false, push: b.push !== false, blockAccess: requirement === "Mandatory" && b.blockAccess !== false };
}

router.post("/policies", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage policies");
  const v = readPolicy(req.body || {});
  const by = await getPerformedBy(uid(req)).catch(() => "Admin");
  const [n] = rowsOf(await db.execute(sql`SELECT coalesce(max(substring(code from 5)::int), 0) + 1 AS n FROM policies WHERE code ~ '^POL-[0-9]+$'`));
  const code = `POL-${String(n.n).padStart(4, "0")}`;
  const [r] = rowsOf(await db.execute(sql`INSERT INTO policies (code, title, category, body, requirement, audience, due_days, allow_withdraw, push, block_access, created_by)
    VALUES (${code}, ${v.title}, ${v.category}, ${v.body}, ${v.requirement}, ${JSON.stringify(v.audience)}::jsonb, ${v.dueDays}, ${v.allowWithdraw}, ${v.push}, ${v.blockAccess}, ${by}) RETURNING id, code`));
  void logAudit({ entityType: "policy", entityId: r.id, action: "create", performedBy: by, summary: `Policy draft ${r.code}: ${v.title}` }).catch(() => {});
  res.status(201).json(r);
}));

router.patch("/policies/:id", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage policies");
  const id = Number(req.params.id);
  const [p] = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE id = ${id}`)); if (!p) return fail(res, 404, "Policy not found");
  if (p.status === "Retired") return fail(res, 400, "A retired policy cannot be edited — restore it first");
  const v = readPolicy({ ...{ title: p.title, body: p.body, category: p.category, requirement: p.requirement, dueDays: p.due_days, audience: p.audience, allowWithdraw: p.allow_withdraw, push: p.push, blockAccess: p.block_access }, ...req.body });
  await db.execute(sql`UPDATE policies SET title = ${v.title}, body = ${v.body}, category = ${v.category}, requirement = ${v.requirement}, audience = ${JSON.stringify(v.audience)}::jsonb, due_days = ${v.dueDays},
    allow_withdraw = ${v.allowWithdraw}, push = ${v.push}, block_access = ${v.blockAccess}, updated_at = now() WHERE id = ${id}`);
  gateCache.clear();
  const by = await getPerformedBy(uid(req)).catch(() => "Admin");
  const ch = [v.title !== p.title && "title", v.body !== p.body && "text", v.requirement !== p.requirement && "acceptance type", JSON.stringify(v.audience) !== JSON.stringify(p.audience) && "audience", v.dueDays !== p.due_days && "days", v.blockAccess !== (p.block_access !== false) && "halt access"].filter(Boolean);
  audit(id, "edit", by, `Edited ${p.code}${ch.length ? `: ${ch.join(", ")}` : ""}${p.version > 0 ? " (unpublished)" : ""}`);
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
    await tx.execute(sql`INSERT INTO policy_versions (policy_id, version, title, body, body_sha256, requirement, change_note, published_by, category, settings) VALUES (${id}, ${ver}, ${p.title}, ${p.body}, ${sha(p.body)}, ${p.requirement}, ${note || "First version"}, ${by}, ${p.category}, ${JSON.stringify(settingsOf(p))}::jsonb)`);
    await tx.execute(sql`UPDATE policies SET version = ${ver}, status = 'Published', published_at = now(), published_by = ${by}, due_from = NULL, status_note = NULL, updated_at = now() WHERE id = ${id}`);
  });
  gateCache.clear();
  const [np] = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE id = ${id}`));
  let notified = 0;
  if (np.push) notified = await notifyAudience(np, ver === 1 ? "New" : "Updated");
  void logAudit({ entityType: "policy", entityId: id, action: "publish", performedBy: by, summary: `Published ${p.code} v${ver} (${p.requirement}): ${p.title}${note ? ` — ${note}` : ""}` }).catch(() => {});
  res.json({ ok: true, version: ver, notified });
}));

async function notifyAudience(p: any, what: "New" | "Updated" | "Reminder" | "Resent", scope: "pending" | "all" = "pending", extra?: string | null) {
  const rows = (await statusRows(p)).filter(r => scope === "all" || (r.decision !== "Accepted" && !(p.requirement === "Optional" && r.decision === "Declined")));
  const due = overdueAt(p); const dueTxt = due ? due.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).replace(/ /g, "-") : "";
  const title = `${what === "Reminder" ? "Reminder: " : what === "Updated" ? "Updated: " : what === "Resent" ? "Please read again: " : ""}${p.requirement === "Mandatory" ? "Please accept" : p.requirement === "Optional" ? "Your consent is requested" : "Please read"} — ${p.title}`;
  let msg = p.requirement === "Mandatory" ? (p.block_access !== false ? `Read and accept by ${dueTxt}. If not accepted by then, your access to IT Hub will be halted until you accept.` : `Please read and accept by ${dueTxt}.`) : p.requirement === "Optional" ? "You can accept or decline; you can change your choice later." : "Please read and acknowledge.";
  if (extra) msg = `${extra} ${msg}`;
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
  await db.execute(sql`UPDATE policies SET status = 'Retired', status_note = ${s(req.body?.reason, 300) || null}, updated_at = now() WHERE id = ${p.id}`); gateCache.clear();
  const by = await getPerformedBy(uid(req)).catch(() => "Admin");
  void logAudit({ entityType: "policy", entityId: p.id, action: "retire", performedBy: by, summary: `Retired ${p.code}: ${p.title} (acceptance records kept)${req.body?.reason ? ` — ${s(req.body.reason, 300)}` : ""}` }).catch(() => {});
  res.json({ ok: true });
}));

const settingsOf = (p: any) => ({ audience: p.audience, dueDays: p.due_days, blockAccess: p.block_access !== false, allowWithdraw: p.allow_withdraw, push: p.push });
async function getPolicy(id: any) { const [p] = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE id = ${Number(id)}`)); return p; }
async function adminGuard(req: Request, res: Response) { if (!await admin(req)) { fail(res, 403, "Only administrators manage policies"); return null; } return getPerformedBy(uid(req)).catch(() => "Admin"); }
const audit = (id: number, action: string, by: string, summary: string, newValues?: unknown) => void logAudit({ entityType: "policy", entityId: id, action, performedBy: by, summary, newValues }).catch(() => {});

/** Deactivate: pause a published policy — nobody is asked to accept it, nobody is halted. Records and versions are kept; activate any time. */
router.post("/policies/:id/deactivate", requireAuth, wrap(async (req, res) => {
  const by = await adminGuard(req, res); if (!by) return;
  const p = await getPolicy(req.params.id); if (!p) return fail(res, 404, "Policy not found");
  if (p.status !== "Published") return fail(res, 400, "Only a published policy can be deactivated");
  const reason = s(req.body?.reason, 300) || null;
  await db.execute(sql`UPDATE policies SET status = 'Inactive', status_note = ${reason}, updated_at = now() WHERE id = ${p.id}`); gateCache.clear();
  audit(p.id, "deactivate", by, `Deactivated ${p.code} v${p.version}: ${p.title}${reason ? ` — ${reason}` : ""}`);
  res.json({ ok: true });
}));

/** Activate again. restartDays: give people that many days from now before access is halted (default: the policy's own days). */
router.post("/policies/:id/activate", requireAuth, wrap(async (req, res) => {
  const by = await adminGuard(req, res); if (!by) return;
  const p = await getPolicy(req.params.id); if (!p) return fail(res, 404, "Policy not found");
  if (p.status !== "Inactive") return fail(res, 400, "Only an inactive policy can be activated");
  const restart = req.body?.restartClock !== false;
  await db.execute(sql`UPDATE policies SET status = 'Published', status_note = NULL, due_from = ${restart ? sql`now()` : sql`due_from`}, updated_at = now() WHERE id = ${p.id}`); gateCache.clear();
  const np = await getPolicy(p.id);
  const notified = req.body?.notify ? await notifyAudience(np, "Reminder") : 0;
  audit(p.id, "activate", by, `Activated ${p.code} v${p.version}${restart ? ` — deadline restarted (${p.due_days} days)` : ""}`);
  res.json({ ok: true, notified, dueAt: overdueAt(np) });
}));

/** Cancel: a never-published draft is deleted; otherwise unpublished edits are discarded (back to the published version). */
router.post("/policies/:id/discard", requireAuth, wrap(async (req, res) => {
  const by = await adminGuard(req, res); if (!by) return;
  const p = await getPolicy(req.params.id); if (!p) return fail(res, 404, "Policy not found");
  if (p.version === 0) {
    if (p.system_key) return fail(res, 400, "Built-in notices cannot be deleted");
    await db.execute(sql`DELETE FROM policies WHERE id = ${p.id} AND version = 0`);
    audit(p.id, "delete-draft", by, `Cancelled draft ${p.code}: ${p.title}`);
    return res.json({ ok: true, deleted: true });
  }
  const [v] = rowsOf(await db.execute(sql`SELECT * FROM policy_versions WHERE policy_id = ${p.id} AND version = ${p.version}`));
  // settings (audience, days, halt) apply as soon as they are saved, so only the versioned text is put back
  await db.execute(sql`UPDATE policies SET title = ${v.title}, body = ${v.body}, requirement = ${v.requirement}, category = ${v.category || p.category},
      block_access = ${v.requirement === "Mandatory" && p.block_access !== false}, updated_at = now() WHERE id = ${p.id}`);
  gateCache.clear();
  audit(p.id, "discard", by, `Discarded unpublished changes to ${p.code} (back to v${p.version})`);
  res.json({ ok: true });
}));

/** Version history: every published version with its full text, plus the admin action log. */
router.get("/policies/:id/history", requireAuth, wrap(async (req, res) => {
  const by = await adminGuard(req, res); if (!by) return;
  const p = await getPolicy(req.params.id); if (!p) return fail(res, 404, "Policy not found");
  const versions = rowsOf(await db.execute(sql`SELECT version, title, body, body_sha256 AS "sha256", requirement, category, settings, change_note AS "changeNote", published_at AS "publishedAt", published_by AS "publishedBy",
      (SELECT count(DISTINCT user_id)::int FROM policy_acceptances a WHERE a.policy_id = v.policy_id AND a.version = v.version AND a.decision = 'Accepted') AS accepted
    FROM policy_versions v WHERE policy_id = ${p.id} ORDER BY version DESC`));
  const events = rowsOf(await db.execute(sql`SELECT action, performed_by AS "by", performed_at AS "at", summary FROM audit_logs WHERE entity_type = 'policy' AND entity_id = ${p.id} AND action NOT IN ('accepted', 'declined', 'withdrawn') ORDER BY performed_at DESC LIMIT 200`));
  res.json({ policy: { id: p.id, code: p.code, title: p.title, body: p.body, requirement: p.requirement, version: p.version, status: p.status }, versions, events });
}));

/** Restore an old version's text into the working copy (then publish it as a new version). */
router.post("/policies/:id/restore/:version", requireAuth, wrap(async (req, res) => {
  const by = await adminGuard(req, res); if (!by) return;
  const p = await getPolicy(req.params.id); if (!p) return fail(res, 404, "Policy not found");
  if (p.status === "Retired") return fail(res, 400, "Restore the policy from Retired first");
  const [v] = rowsOf(await db.execute(sql`SELECT * FROM policy_versions WHERE policy_id = ${p.id} AND version = ${Number(req.params.version)}`)); if (!v) return fail(res, 404, "Version not found");
  await db.execute(sql`UPDATE policies SET title = ${v.title}, body = ${v.body}, requirement = ${v.requirement}, block_access = ${v.requirement === "Mandatory" && p.block_access !== false}, updated_at = now() WHERE id = ${p.id}`);
  audit(p.id, "restore", by, `Copied v${v.version} text into ${p.code} as unpublished changes`);
  res.json({ ok: true, note: `Version ${v.version} copied as changes — publish to make it version ${p.version + 1}` });
}));

/** Resend to the audience. scope pending|all; reaccept: publish the same text as a new version so everyone must accept again. */
router.post("/policies/:id/resend", requireAuth, wrap(async (req, res) => {
  const by = await adminGuard(req, res); if (!by) return;
  const p = await getPolicy(req.params.id); if (!p) return fail(res, 404, "Policy not found");
  if (p.status !== "Published") return fail(res, 400, "Only a published policy can be sent — activate it first");
  const scope = req.body?.scope === "all" ? "all" : "pending";
  const msg = s(req.body?.message, 300) || null;
  if (req.body?.reaccept) {
    const note = s(req.body?.changeNote, 500) || "Please read and accept again";
    const [v] = rowsOf(await db.execute(sql`SELECT * FROM policy_versions WHERE policy_id = ${p.id} AND version = ${p.version}`));
    const ver = p.version + 1;
    await db.transaction(async tx => {
      await tx.execute(sql`INSERT INTO policy_versions (policy_id, version, title, body, body_sha256, requirement, change_note, published_by, category, settings) VALUES (${p.id}, ${ver}, ${v.title}, ${v.body}, ${v.body_sha256}, ${v.requirement}, ${note}, ${by}, ${v.category || p.category}, ${JSON.stringify(settingsOf(p))}::jsonb)`);
      await tx.execute(sql`UPDATE policies SET version = ${ver}, published_at = now(), published_by = ${by}, due_from = NULL, updated_at = now() WHERE id = ${p.id}`);
    });
    gateCache.clear();
    const np = await getPolicy(p.id);
    const notified = await notifyAudience(np, "Updated", "all", msg);
    audit(p.id, "reaccept", by, `Re-acceptance requested for ${p.code}: published unchanged text as v${ver} — ${note} (${notified} notified)`);
    return res.json({ ok: true, version: ver, notified });
  }
  if (req.body?.restartClock) { await db.execute(sql`UPDATE policies SET due_from = now(), updated_at = now() WHERE id = ${p.id}`); gateCache.clear(); }
  const np = await getPolicy(p.id);
  const notified = await notifyAudience(np, scope === "all" ? "Resent" : "Reminder", scope, msg);
  audit(p.id, "resend", by, `Resent ${p.code} v${p.version} to ${scope === "all" ? "everyone" : "people who have not accepted"} (${notified})${req.body?.restartClock ? " — deadline restarted" : ""}`);
  res.json({ ok: true, notified, dueAt: overdueAt(np) });
}));

/** Duplicate as a new draft. */
router.post("/policies/:id/duplicate", requireAuth, wrap(async (req, res) => {
  const by = await adminGuard(req, res); if (!by) return;
  const p = await getPolicy(req.params.id); if (!p) return fail(res, 404, "Policy not found");
  const [n] = rowsOf(await db.execute(sql`SELECT coalesce(max(substring(code from 5)::int), 0) + 1 AS n FROM policies WHERE code ~ '^POL-[0-9]+$'`));
  const code = `POL-${String(n.n).padStart(4, "0")}`;
  const [r] = rowsOf(await db.execute(sql`INSERT INTO policies (code, title, category, body, requirement, audience, due_days, allow_withdraw, push, block_access, created_by)
    VALUES (${code}, ${`Copy of ${p.title}`.slice(0, 200)}, ${p.category}, ${p.body}, ${p.requirement}, ${JSON.stringify(p.audience)}::jsonb, ${p.due_days}, ${p.allow_withdraw}, ${p.push}, ${p.block_access}, ${by}) RETURNING id, code`));
  audit(r.id, "create", by, `Draft ${r.code} copied from ${p.code}`);
  res.status(201).json(r);
}));

/** Bring a retired policy back (inactive if it was ever published, else draft). */
router.post("/policies/:id/unretire", requireAuth, wrap(async (req, res) => {
  const by = await adminGuard(req, res); if (!by) return;
  const p = await getPolicy(req.params.id); if (!p) return fail(res, 404, "Policy not found");
  if (p.status !== "Retired") return fail(res, 400, "This policy is not retired");
  const st = p.version > 0 ? "Inactive" : "Draft";
  await db.execute(sql`UPDATE policies SET status = ${st}, status_note = NULL, updated_at = now() WHERE id = ${p.id}`);
  audit(p.id, "unretire", by, `Restored ${p.code} from Retired (now ${st})`);
  res.json({ ok: true, status: st });
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
/** Only IT can switch push off for someone (users cannot unsubscribe themselves). */
router.delete("/push/subscribe", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Push notifications are managed by IT and cannot be switched off here");
  const endpoint = s(req.body?.endpoint, 1000);
  if (endpoint) await db.execute(sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`);
  res.status(204).end();
}));

/* ── admin: push on/off for everyone, per-person devices ───────────────── */
router.get("/push/admin", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage push notifications");
  const [en] = rowsOf(await db.execute(sql`SELECT value FROM settings WHERE key = 'push.enabled'`));
  const users = rowsOf(await db.execute(sql`SELECT u.id AS "userId", u.name, u.email, coalesce(u.user_type, 'internal') AS "userType", count(p.id)::int AS devices, max(p.last_ok_at) AS "lastDelivered", max(p.created_at) AS "since"
    FROM users u LEFT JOIN push_subscriptions p ON p.user_id = u.id WHERE u.is_active GROUP BY u.id ORDER BY count(p.id) DESC, u.name`));
  res.json({ enabled: !(en && (en.value === false || en.value === "false")), users, withPush: users.filter(u => u.devices > 0).length, total: users.length });
}));
router.put("/push/admin", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage push notifications");
  const on = req.body?.enabled !== false;
  await db.execute(sql`INSERT INTO settings (key, value) VALUES ('push.enabled', ${JSON.stringify(on)}::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
  const by = await getPerformedBy(uid(req)).catch(() => "Admin");
  void logAudit({ entityType: "settings", action: "update", performedBy: by, summary: `Push notifications switched ${on ? "ON" : "OFF"} for everyone` }).catch(() => {});
  res.json({ ok: true, enabled: on });
}));
router.delete("/push/admin/users/:userId", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage push notifications");
  const id = Number(req.params.userId);
  const r = rowsOf(await db.execute(sql`DELETE FROM push_subscriptions WHERE user_id = ${id} RETURNING id`));
  const by = await getPerformedBy(uid(req)).catch(() => "Admin");
  void logAudit({ entityType: "user", entityId: id, action: "push_off", performedBy: by, summary: `Push notifications removed from ${r.length} device(s) of user #${id}` }).catch(() => {});
  res.json({ removed: r.length });
}));
router.post("/push/admin/test/:userId", requireAuth, wrap(async (req, res) => {
  if (!await admin(req)) return fail(res, 403, "Only administrators manage push notifications");
  const { pushToUser } = await import("../lib/webpush");
  res.json({ sent: await pushToUser(Number(req.params.userId), { title: "Test from IT", body: "Push notifications are working on this device.", url: "/" }) });
}));
router.post("/push/test", requireAuth, wrap(async (req, res) => {
  const { pushToUser } = await import("../lib/webpush");
  const n = await pushToUser(uid(req)!, { title: "IT Hub notifications are on", body: "You will get alerts for approvals, tickets, policies and devices here.", url: "/" });
  res.json({ sent: n });
}));

export default router;
