/** 2.11 — change approval board, clash check, freeze windows, review after go-live; problem known errors. */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess } from "../lib/rbac";
import { isItsmAdmin, isItsmStaff } from "../lib/access-model";
import { isMember } from "../lib/itsm-routing";
import { RISK_QUESTIONS, PIR_OUTCOMES, PIR_FROM, RCA_METHODS, ROOT_CAUSE_CATEGORIES, FISHBONE, clashesOf, toTs, publishKnownError, matchKnownErrors, riskOf } from "../lib/itsm-advanced";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const fail = (res: Response, code: number, error: string) => res.status(code).json({ error });
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => { try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); } };
const uid = (req: Request) => Number((req.session as any)?.userId) || 0;
const s = (v: unknown, n = 4000) => (typeof v === "string" ? v.trim() : "").slice(0, n);
const hist = (type: string, id: number, by: string, notes: string) => db.execute(sql`INSERT INTO itsm_ticket_history (ticket_id, ticket_type, updated_by, notes) VALUES (${id}, ${type}, ${by}, ${notes})`);
async function canWork(req: Request, teamId: number | null) { const a = await getAccess(req); return !!a && (isItsmAdmin(a) || await isMember(uid(req), teamId)); }
async function staff(req: Request) { const a = await getAccess(req); return !!a && await isItsmStaff(a); }
const CH = sql`id, change_no AS "changeNo", title, type, status, approval_status AS "approvalStatus", risk_level AS "riskLevel", risk_score AS "riskScore", environment, affected_apps AS "affectedApps",
  team_id AS "teamId", assigned_group AS "assignedGroup", assigned_to AS "assignedTo", requested_by AS "requestedBy", planned_start AS "plannedStart", planned_end AS "plannedEnd", pir_at AS "pirAt", pir_outcome AS "pirOutcome", rollback_plan AS "rollbackPlan", test_plan AS "testPlan", impact`;

router.get("/itsm-advanced/meta", requireAuth, (_req, res) => {
  return res.json({ riskQuestions: RISK_QUESTIONS.map(q => ({ key: q.key, label: q.label, options: q.options.map(o => ({ label: o[0], points: o[1] })) })), pirOutcomes: PIR_OUTCOMES, rcaMethods: RCA_METHODS, rootCauseCategories: ROOT_CAUSE_CATEGORIES, fishbone: FISHBONE,
    riskBands: [{ level: "Low", from: 0 }, { level: "Medium", from: 30 }, { level: "High", from: 60 }] });
});
router.post("/itsm-advanced/risk-preview", requireAuth, (req, res) => { res.json(riskOf(req.body?.answers, req.body?.environment) || { score: null, level: null }); });

/* ── clash check ── */
router.get("/itsm-change-clashes", requireAuth, wrap(async (req, res) => {
  const q = req.query as any;
  const start = toTs(q.start, "Window start"), end = toTs(q.end, "Window end");
  const apps = String(q.apps || "").split("|").map(x => x.trim()).filter(Boolean);
  return res.json(await clashesOf({ id: Number(q.id) || null, start: start || null, end: end || null, environment: q.environment || null, apps, teamId: Number(q.teamId) || null }));
}));
router.get("/itsm-changes/:id/clashes", requireAuth, wrap(async (req, res) => {
  const [c] = rowsOf(await db.execute(sql`SELECT ${CH} FROM itsm_changes WHERE id = ${Number(req.params.id)} AND is_active`));
  if (!c) return fail(res, 404, "Change not found");
  return res.json(await clashesOf({ id: c.id, start: c.plannedStart, end: c.plannedEnd, environment: c.environment, apps: c.affectedApps, teamId: c.teamId }));
}));

/* ── approval board (CAB) ── */
router.get("/itsm-change-board", requireAuth, wrap(async (req, res) => {
  if (!await staff(req)) return fail(res, 403, "The change board is for the ITSM team");
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
  const me = uid(req);
  const awaiting = rowsOf(await db.execute(sql`SELECT ${CH}, (SELECT json_agg(json_build_object('id', k.id, 'title', k.title, 'approvers', k.approver_label, 'mine', ${me} = ANY(k.approver_ids)) ORDER BY k.id)
      FROM itsm_ticket_workflows i JOIN itsm_workflow_tasks k ON k.instance_id = i.id AND k.status = 'Pending' WHERE i.ticket_type = 'change' AND i.ticket_id = c.id) AS tasks
    FROM itsm_changes c WHERE is_active AND status = 'Pending Approval' ORDER BY coalesce(planned_start, created_at)`));
  const upcoming = rowsOf(await db.execute(sql`SELECT ${CH} FROM itsm_changes WHERE is_active AND status IN ('Approved', 'Scheduled', 'In Progress') AND planned_start IS NOT NULL
    AND planned_start < now() + make_interval(days => ${days}) AND planned_end > now() - interval '1 day' ORDER BY planned_start`));
  const unscheduled = rowsOf(await db.execute(sql`SELECT ${CH} FROM itsm_changes WHERE is_active AND status IN ('Approved', 'Scheduled') AND planned_start IS NULL ORDER BY created_at`));
  const reviews = rowsOf(await db.execute(sql`SELECT ${CH}, updated_at AS "updatedAt" FROM itsm_changes WHERE is_active AND status IN ('Completed', 'Failed', 'Rolled Back') AND pir_at IS NULL AND (type <> 'Standard' OR status <> 'Completed') ORDER BY updated_at`));
  const freezes = rowsOf(await db.execute(sql`SELECT id, name, starts_at AS "startsAt", ends_at AS "endsAt", environment, reason FROM itsm_change_freezes WHERE is_active AND ends_at > now() ORDER BY starts_at`));
  for (const c of [...awaiting, ...upcoming]) { const k = await clashesOf({ id: c.id, start: c.plannedStart, end: c.plannedEnd, environment: c.environment, apps: c.affectedApps, teamId: c.teamId }); c.clashes = k.changes.length; c.conflicts = k.changes.filter((x: any) => x.level === "Conflict").length; c.inFreeze = k.freezes.length > 0 && c.type !== "Emergency"; }
  return res.json({ days, awaiting, upcoming, unscheduled, reviews, freezes });
}));

/* ── freeze windows (ITSM Admin) ── */
router.get("/itsm-change-freezes", requireAuth, wrap(async (req, res) => {
  return res.json(rowsOf(await db.execute(sql`SELECT id, name, starts_at AS "startsAt", ends_at AS "endsAt", environment, reason, is_active AS "isActive", created_by AS "createdBy", updated_by AS "updatedBy", updated_at AS "updatedAt"
    FROM itsm_change_freezes WHERE ${req.query.all === "1"} OR (is_active AND ends_at > now()) ORDER BY starts_at DESC LIMIT 200`)));
}));
async function freezeBody(req: Request) {
  const b = req.body || {};
  const name = s(b.name, 120); if (name.length < 3) throw Object.assign(new Error("Name the freeze window (at least 3 characters)"), { status: 400 });
  const st = toTs(b.startsAt, "Start"), en = toTs(b.endsAt, "End");
  if (!st || !en) throw Object.assign(new Error("Give the start and end"), { status: 400 });
  if (+en <= +st) throw Object.assign(new Error("The freeze must end after it starts"), { status: 400 });
  return { name, st, en, env: s(b.environment, 40) || null, reason: s(b.reason, 500) || null };
}
router.post("/itsm-change-freezes", requireAuth, wrap(async (req, res) => {
  const a = await getAccess(req); if (!a || !isItsmAdmin(a)) return fail(res, 403, "Only an ITSM Admin can set freeze windows");
  const f = await freezeBody(req); const by = await getPerformedBy(uid(req));
  const [r] = rowsOf(await db.execute(sql`INSERT INTO itsm_change_freezes (name, starts_at, ends_at, environment, reason, created_by, updated_by) VALUES (${f.name}, ${f.st.toISOString()}::timestamptz, ${f.en.toISOString()}::timestamptz, ${f.env}, ${f.reason}, ${by}, ${by}) RETURNING id`));
  await logAudit({ entityType: "itsm_change_freeze", entityId: r.id, action: "create", performedBy: by, summary: `Change freeze "${f.name}" ${f.st.toISOString()} – ${f.en.toISOString()}${f.env ? ` (${f.env})` : ""}` });
  return res.json({ ok: true, id: r.id });
}));
router.patch("/itsm-change-freezes/:id", requireAuth, wrap(async (req, res) => {
  const a = await getAccess(req); if (!a || !isItsmAdmin(a)) return fail(res, 403, "Only an ITSM Admin can change freeze windows");
  const id = Number(req.params.id); const by = await getPerformedBy(uid(req));
  if (req.body?.isActive === false) {
    const why = s(req.body?.reason, 300); if (why.length < 5) return fail(res, 400, "Give a reason for ending the freeze window (at least 5 characters)");
    await db.execute(sql`UPDATE itsm_change_freezes SET is_active = false, updated_by = ${by}, updated_at = now() WHERE id = ${id}`);
    await logAudit({ entityType: "itsm_change_freeze", entityId: id, action: "deactivate", performedBy: by, summary: `Change freeze #${id} ended — ${why}` });
    return res.json({ ok: true });
  }
  const f = await freezeBody(req);
  await db.execute(sql`UPDATE itsm_change_freezes SET name = ${f.name}, starts_at = ${f.st.toISOString()}::timestamptz, ends_at = ${f.en.toISOString()}::timestamptz, environment = ${f.env}, reason = ${f.reason}, is_active = true, updated_by = ${by}, updated_at = now() WHERE id = ${id}`);
  await logAudit({ entityType: "itsm_change_freeze", entityId: id, action: "update", performedBy: by, summary: `Change freeze "${f.name}" updated` });
  return res.json({ ok: true });
}));

/* ── review after go-live ── */
router.post("/itsm-changes/:id/review", requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [c] = rowsOf(await db.execute(sql`SELECT ${CH} FROM itsm_changes WHERE id = ${id} AND is_active`)); if (!c) return fail(res, 404, "Change not found");
  if (!await canWork(req, c.teamId)) return fail(res, 403, `Only ${c.assignedGroup || "the assigned team"} or an ITSM Admin can record the review`);
  if (!PIR_FROM.includes(c.status)) return fail(res, 400, `The review is recorded after the change is done (Completed, Failed or Rolled Back) — it is ${c.status}`);
  const outcome = s(req.body?.outcome, 60); if (!PIR_OUTCOMES.includes(outcome)) return fail(res, 400, `Outcome: choose ${PIR_OUTCOMES.join(" / ")}`);
  const notes = s(req.body?.notes); if (notes.length < 10) return fail(res, 400, "Describe how it went (at least 10 characters)");
  const lessons = s(req.body?.lessons); if (outcome !== "Successful" && lessons.length < 10) return fail(res, 400, "Write what was learnt (at least 10 characters) — the change did not go fully to plan");
  const incidents = s(req.body?.incidents, 500) || null;
  if ((outcome === "Failed" && c.status === "Completed") || (outcome === "Rolled back" && c.status !== "Rolled Back")) return fail(res, 400, `The outcome "${outcome}" does not match the status ${c.status} — set the status first`);
  const by = await getPerformedBy(uid(req));
  await db.execute(sql`UPDATE itsm_changes SET pir_outcome = ${outcome}, pir_notes = ${notes}, pir_lessons = ${lessons || null}, pir_incidents = ${incidents}, pir_by = ${by}, pir_at = now(), updated_by = ${by}, updated_at = now() WHERE id = ${id}`);
  await hist("change", id, by, `Review after go-live: ${outcome} — ${notes}${lessons ? ` · Learnt: ${lessons}` : ""}`);
  await logAudit({ entityType: "itsm_change", entityId: id, action: "review", performedBy: by, summary: `${c.changeNo}: review after go-live — ${outcome}` });
  return res.json({ ok: true });
}));

/* ── known errors ── */
router.post("/itsm-problems/:id/known-error", requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [p] = rowsOf(await db.execute(sql`SELECT id, problem_no AS "problemNo", team_id AS "teamId", assigned_group AS "assignedGroup", kb_article_id AS "kb" FROM itsm_problems WHERE id = ${id} AND is_active`));
  if (!p) return fail(res, 404, "Problem not found");
  if (!await canWork(req, p.teamId)) return fail(res, 403, `Only ${p.assignedGroup || "the assigned team"} or an ITSM Admin can publish the known error`);
  const by = await getPerformedBy(uid(req));
  const kb = await publishKnownError(id, by);
  await hist("problem", id, by, p.kb ? "Known error article refreshed in the knowledge base" : `Published as a known error in the knowledge base (article #${kb})`);
  await logAudit({ entityType: "itsm_problem", entityId: id, action: "known_error", performedBy: by, summary: `${p.problemNo}: known error ${p.kb ? "refreshed" : "published"} (KB #${kb})` });
  return res.json({ ok: true, kbArticleId: kb });
}));
router.get("/itsm-known-errors", requireAuth, wrap(async (req, res) => {
  const q = req.query as any;
  if (q.text || q.category || q.apps) return res.json(await matchKnownErrors({ text: String(q.text || ""), category: q.category || null, apps: String(q.apps || "").split("|").filter(Boolean) }));
  return res.json(rowsOf(await db.execute(sql`SELECT k.id, k.title, k.symptoms, k.workaround, k.root_cause AS "rootCause", k.permanent_fix AS "permanentFix", k.updated_at AS "updatedAt", p.id AS "problemId", p.problem_no AS "problemNo", p.status AS "problemStatus"
    FROM itsm_knowledge_base k LEFT JOIN itsm_problems p ON p.id = k.problem_id WHERE k.is_active AND k.article_type = 'Known Error' ORDER BY k.updated_at DESC LIMIT 200`)));
}));
export default router;
