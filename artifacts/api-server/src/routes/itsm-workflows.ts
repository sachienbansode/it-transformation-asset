/** ITH-101 — ITSM › Workflows: designer API (workflows, versions, publish, test run) and the ticket-side view / approvals.
 *  Design: ITSM Admin. View: ITSM Admin or ITSM Setup read. Tickets: anyone who can read that ticket type. */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess, can } from "../lib/rbac";
import { isItsmAdmin } from "../lib/access-model";
import { validateDef, wfSimulate, wfView, wfDecide, WF_STATUS, WF_FIELDS, type WfKind, type WfDef } from "../lib/itsm-workflow";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const fail = (res: Response, code: number, error: string) => res.status(code).json({ error });
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => { try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); } };
const KINDS: WfKind[] = ["incident", "request", "problem", "change"];
const KIND_NAME: Record<WfKind, string> = { incident: "Incident", request: "Service Request", problem: "Problem", change: "Change Request" };
const MODULE: Record<WfKind, string> = { incident: "itsm_incidents", request: "itsm_requests", problem: "itsm_problems", change: "itsm_changes" };
const uid = (req: Request) => Number((req.session as any)?.userId) || 0;
const canDesign = async (req: Request) => { const a = await getAccess(req); return !!a && isItsmAdmin(a); };
const canView = async (req: Request) => { const a = await getAccess(req); return !!a && (isItsmAdmin(a) || can(a, "itsm_setup", "read")); };
const qs = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? "") : String(v ?? ""));
const cleanDef = (d: any): WfDef => ({
  nodes: (Array.isArray(d?.nodes) ? d.nodes : []).slice(0, 80).map((n: any) => ({ id: String(n.id).slice(0, 40), type: String(n.type), label: String(n.label || "").slice(0, 80), x: Math.round(Number(n.x) || 0), y: Math.round(Number(n.y) || 0), config: typeof n.config === "object" && n.config ? JSON.parse(JSON.stringify(n.config).slice(0, 4000)) : {} }))
    .filter((n: any) => ["start", "stage", "approval", "condition", "assign", "notify", "end"].includes(n.type)),
  edges: (Array.isArray(d?.edges) ? d.edges : []).slice(0, 200).map((e: any) => ({ id: String(e.id).slice(0, 40), from: String(e.from), to: String(e.to), label: String(e.label || "").slice(0, 60), outcome: ["next", "yes", "no", "approved", "rejected", "timeout"].includes(e.outcome) ? e.outcome : "next" })),
});

/* Starter graphs so a new workflow is not a blank canvas */
function template(kind: WfKind): WfDef {
  const n = (id: string, type: any, label: string, x: number, y: number, config: any = {}) => ({ id, type, label, x, y, config });
  const e = (from: string, to: string, label = "", outcome: any = "next") => ({ id: `${from}-${to}-${outcome}`, from, to, label, outcome });
  if (kind === "change") return { nodes: [n("start", "start", "Raised", 40, 200), n("review", "stage", "Draft", 220, 200, { status: "Draft" }), n("cab", "approval", "CAB approval", 420, 200, { approverType: "team", team: "", title: "CAB approval for {no}" }),
      n("sched", "stage", "Scheduled", 640, 120, { status: "Scheduled" }), n("impl", "stage", "In Progress", 840, 120, { status: "In Progress" }), n("done", "end", "Completed", 1040, 120, { status: "Completed" }), n("rej", "end", "Rejected", 640, 300, { status: "Rejected" })],
    edges: [e("start", "review"), e("review", "cab", "Submit for approval"), e("cab", "sched", "", "approved"), e("cab", "rej", "", "rejected"), e("sched", "impl", "Start implementation"), e("impl", "done", "Complete")] };
  const first = kind === "problem" ? "Under Investigation" : "In Progress"; const fin = kind === "request" ? "Completed" : "Resolved";
  return { nodes: [n("start", "start", "Raised", 40, 200), n("open", "stage", "Open", 220, 200, { status: "Open" }), n("work", "stage", first, 440, 200, { status: first, ...(kind === "problem" ? {} : {}) }),
      n("hold", "stage", "On Hold", 440, 360, { status: kind === "problem" ? "Known Error" : "On Hold" }), n("fix", "stage", fin, 660, 200, { status: fin }), n("end", "end", "Closed", 880, 200, { status: kind === "request" ? "" : "Closed" })],
    edges: [e("start", "open"), e("open", "work", "Start work"), e("work", "hold", "Put on hold"), e("hold", "work", "Resume"), e("work", "fix", fin === "Resolved" ? "Resolve" : "Complete"), e("fix", "end", "Close")] };
}

router.get("/itsm-workflows/meta", requireAuth, wrap(async (req, res) => {
  if (!await canView(req)) return fail(res, 403, "No access to ITSM workflows");
  const teams = rowsOf(await db.execute(sql`SELECT id, name FROM itsm_teams WHERE is_active ORDER BY name`));
  const roles = rowsOf(await db.execute(sql`SELECT id, name FROM roles ORDER BY name`));
  const cats = rowsOf(await db.execute(sql`SELECT DISTINCT ticket_type AS type, category FROM itsm_catalog WHERE is_active ORDER BY 1, 2`).catch(() => ({ rows: [] })));
  res.json({ kinds: KINDS.map(k => ({ key: k, name: KIND_NAME[k], statuses: WF_STATUS[k], fields: WF_FIELDS[k] })), teams, roles, categories: cats, canEdit: await canDesign(req) });
}));
router.get("/itsm-workflows", requireAuth, wrap(async (req, res) => {
  if (!await canView(req)) return fail(res, 403, "No access to ITSM workflows");
  const rows = rowsOf(await db.execute(sql`SELECT w.id, w.ticket_type AS "ticketType", w.name, w.description, w.match, w.rank, w.is_active AS "isActive", w.updated_by AS "updatedBy", w.updated_at AS "updatedAt",
      (SELECT json_build_object('id', v.id, 'version', v.version, 'publishedBy', v.published_by, 'publishedAt', v.published_at) FROM itsm_workflow_versions v WHERE v.workflow_id = w.id AND v.status = 'Published') AS published,
      (SELECT json_build_object('id', v.id, 'version', v.version, 'updatedBy', v.updated_by, 'updatedAt', v.updated_at) FROM itsm_workflow_versions v WHERE v.workflow_id = w.id AND v.status = 'Draft') AS draft,
      (SELECT count(*)::int FROM itsm_ticket_workflows i WHERE i.workflow_id = w.id AND i.state NOT IN ('Finished', 'Stopped')) AS running,
      (SELECT count(*)::int FROM itsm_ticket_workflows i WHERE i.workflow_id = w.id) AS tickets
    FROM itsm_workflows w ORDER BY w.ticket_type, w.is_active DESC, w.rank, w.name`));
  res.json({ rows, canEdit: await canDesign(req) });
}));
router.post("/itsm-workflows", requireAuth, wrap(async (req, res) => {
  if (!await canDesign(req)) return fail(res, 403, "Only an ITSM Admin can design workflows");
  const kind = String(req.body?.ticketType) as WfKind; if (!KINDS.includes(kind)) return fail(res, 400, "Choose the ticket type");
  const name = String(req.body?.name || "").trim().slice(0, 120); if (name.length < 3) return fail(res, 400, "Name needs at least 3 characters");
  const [dup] = rowsOf(await db.execute(sql`SELECT id FROM itsm_workflows WHERE ticket_type = ${kind} AND lower(name) = ${name.toLowerCase()}`)); if (dup) return fail(res, 409, "A workflow with this name already exists for this ticket type");
  const by = await getPerformedBy(uid(req)); const match = matchOf(req.body?.match);
  const [w] = rowsOf(await db.execute(sql`INSERT INTO itsm_workflows (ticket_type, name, description, match, rank, created_by, updated_by) VALUES (${kind}, ${name}, ${String(req.body?.description || "").slice(0, 500) || null}, ${JSON.stringify(match)}::jsonb, ${Number(req.body?.rank) || 100}, ${by}, ${by}) RETURNING id`));
  const def = req.body?.blank ? { nodes: [{ id: "start", type: "start", label: "Raised", x: 60, y: 200, config: {} }], edges: [] } : template(kind);
  await db.execute(sql`INSERT INTO itsm_workflow_versions (workflow_id, version, status, definition, created_by, updated_by) VALUES (${w.id}, 1, 'Draft', ${JSON.stringify(def)}::jsonb, ${by}, ${by})`);
  await logAudit({ entityType: "itsm_workflow", entityId: w.id, action: "create", performedBy: by, summary: `Workflow “${name}” created for ${KIND_NAME[kind]}` });
  res.status(201).json({ id: w.id });
}));
function matchOf(m: any) { const out: any = {}; for (const k of ["category", "subcategory", "priority", "type"]) if (Array.isArray(m?.[k])) { const v = m[k].map((x: any) => String(x).trim()).filter(Boolean).slice(0, 50); if (v.length) out[k] = v; } return out; }
router.get("/itsm-workflows/:id", requireAuth, wrap(async (req, res, ) => {
  if (!await canView(req)) return fail(res, 403, "No access to ITSM workflows");
  const id = Number(req.params.id); const [w] = rowsOf(await db.execute(sql`SELECT id, ticket_type AS "ticketType", name, description, match, rank, is_active AS "isActive" FROM itsm_workflows WHERE id = ${id}`)); if (!w) return fail(res, 404, "Workflow not found");
  const versions = rowsOf(await db.execute(sql`SELECT id, version, status, notes, created_by AS "createdBy", created_at AS "createdAt", updated_by AS "updatedBy", updated_at AS "updatedAt", published_by AS "publishedBy", published_at AS "publishedAt",
      (SELECT count(*)::int FROM itsm_ticket_workflows i WHERE i.version_id = v.id) AS tickets FROM itsm_workflow_versions v WHERE workflow_id = ${id} ORDER BY version DESC`));
  const vid = Number(qs(req.query.version)) || (versions.find(v => v.status === "Draft") || versions.find(v => v.status === "Published") || versions[0])?.id;
  const [cur] = rowsOf(await db.execute(sql`SELECT id, version, status, definition FROM itsm_workflow_versions WHERE id = ${vid} AND workflow_id = ${id}`));
  res.json({ ...w, versions, current: cur ? { ...cur, problems: validateDef(w.ticketType, cur.definition) } : null, canEdit: await canDesign(req) });
}));
router.patch("/itsm-workflows/:id", requireAuth, wrap(async (req, res) => {
  if (!await canDesign(req)) return fail(res, 403, "Only an ITSM Admin can change workflows");
  const id = Number(req.params.id); const [o] = rowsOf(await db.execute(sql`SELECT * FROM itsm_workflows WHERE id = ${id}`)); if (!o) return fail(res, 404, "Workflow not found");
  const b = req.body || {}; const next = { name: b.name !== undefined ? String(b.name).trim().slice(0, 120) : o.name, description: b.description !== undefined ? (String(b.description).slice(0, 500) || null) : o.description,
    match: b.match !== undefined ? matchOf(b.match) : o.match, rank: b.rank !== undefined ? Number(b.rank) || 100 : o.rank, is_active: b.isActive !== undefined ? !!b.isActive : o.is_active };
  if (next.name.length < 3) return fail(res, 400, "Name needs at least 3 characters");
  if (o.is_active && !next.is_active && String(b.reason || "").trim().length < 5) return fail(res, 400, "Give a reason for deactivating the workflow");
  const ch = (["name", "description", "rank", "is_active"] as const).filter(k => String((next as any)[k] ?? "") !== String(o[k] ?? "")).map(k => `${k === "is_active" ? "active" : k}: ${o[k] ?? "—"} → ${(next as any)[k] ?? "—"}`);
  if (JSON.stringify(next.match) !== JSON.stringify(o.match)) ch.push(`applies to: ${JSON.stringify(o.match)} → ${JSON.stringify(next.match)}`);
  if (!ch.length) return res.json({ ok: true, unchanged: true });
  const by = await getPerformedBy(uid(req));
  await db.execute(sql`UPDATE itsm_workflows SET name = ${next.name}, description = ${next.description}, match = ${JSON.stringify(next.match)}::jsonb, rank = ${next.rank}, is_active = ${next.is_active}, updated_by = ${by}, updated_at = now() WHERE id = ${id}`);
  await logAudit({ entityType: "itsm_workflow", entityId: id, action: "update", performedBy: by, summary: `Workflow “${o.name}”: ${ch.join("; ")}${b.reason ? ` — ${b.reason}` : ""}` });
  res.json({ ok: true });
}));
/** Save the draft (creates one from the published version if there is none). */
router.put("/itsm-workflows/:id/draft", requireAuth, wrap(async (req, res) => {
  if (!await canDesign(req)) return fail(res, 403, "Only an ITSM Admin can change workflows");
  const id = Number(req.params.id); const [w] = rowsOf(await db.execute(sql`SELECT * FROM itsm_workflows WHERE id = ${id}`)); if (!w) return fail(res, 404, "Workflow not found");
  const def = cleanDef(req.body?.definition); const basic = validateDef(w.ticket_type, def, false); if (basic.length) return fail(res, 400, basic[0]);
  const by = await getPerformedBy(uid(req));
  let [d] = rowsOf(await db.execute(sql`SELECT id, version FROM itsm_workflow_versions WHERE workflow_id = ${id} AND status = 'Draft'`));
  if (d) await db.execute(sql`UPDATE itsm_workflow_versions SET definition = ${JSON.stringify(def)}::jsonb, notes = ${String(req.body?.notes || "").slice(0, 500) || null}, updated_by = ${by}, updated_at = now() WHERE id = ${d.id}`);
  else [d] = rowsOf(await db.execute(sql`INSERT INTO itsm_workflow_versions (workflow_id, version, status, definition, notes, created_by, updated_by)
      VALUES (${id}, (SELECT coalesce(max(version), 0) + 1 FROM itsm_workflow_versions WHERE workflow_id = ${id}), 'Draft', ${JSON.stringify(def)}::jsonb, ${String(req.body?.notes || "").slice(0, 500) || null}, ${by}, ${by}) RETURNING id, version`));
  await logAudit({ entityType: "itsm_workflow", entityId: id, action: "save_draft", performedBy: by, summary: `Workflow “${w.name}” draft v${d.version} saved (${def.nodes.length} steps, ${def.edges.length} connections)` });
  res.json({ ok: true, versionId: d.id, version: d.version, problems: validateDef(w.ticket_type, def) });
}));
/** Start a new draft from any version (restore an older one). */
router.post("/itsm-workflows/:id/versions/:vid/copy", requireAuth, wrap(async (req, res) => {
  if (!await canDesign(req)) return fail(res, 403, "Only an ITSM Admin can change workflows");
  const id = Number(req.params.id); const [v] = rowsOf(await db.execute(sql`SELECT * FROM itsm_workflow_versions WHERE id = ${Number(req.params.vid)} AND workflow_id = ${id}`)); if (!v) return fail(res, 404, "Version not found");
  const [d] = rowsOf(await db.execute(sql`SELECT id FROM itsm_workflow_versions WHERE workflow_id = ${id} AND status = 'Draft'`)); if (d) return fail(res, 409, "There is already a draft — publish or discard it first");
  const by = await getPerformedBy(uid(req));
  const [n] = rowsOf(await db.execute(sql`INSERT INTO itsm_workflow_versions (workflow_id, version, status, definition, notes, created_by, updated_by)
    VALUES (${id}, (SELECT max(version) + 1 FROM itsm_workflow_versions WHERE workflow_id = ${id}), 'Draft', ${JSON.stringify(v.definition)}::jsonb, ${`Copied from v${v.version}`}, ${by}, ${by}) RETURNING id, version`));
  await logAudit({ entityType: "itsm_workflow", entityId: id, action: "copy_version", performedBy: by, summary: `Workflow draft v${n.version} started from v${v.version}` });
  res.status(201).json({ versionId: n.id, version: n.version });
}));
router.post("/itsm-workflows/:id/draft/discard", requireAuth, wrap(async (req, res) => {
  if (!await canDesign(req)) return fail(res, 403, "Only an ITSM Admin can change workflows");
  const id = Number(req.params.id); const [d] = rowsOf(await db.execute(sql`SELECT id, version FROM itsm_workflow_versions WHERE workflow_id = ${id} AND status = 'Draft'`)); if (!d) return fail(res, 404, "No draft to discard");
  const [p] = rowsOf(await db.execute(sql`SELECT 1 FROM itsm_workflow_versions WHERE workflow_id = ${id} AND status <> 'Draft'`)); if (!p) return fail(res, 400, "This is the only version — edit it instead");
  const by = await getPerformedBy(uid(req));
  await db.execute(sql`UPDATE itsm_workflow_versions SET status = 'Retired', notes = 'Draft discarded', updated_by = ${by}, updated_at = now() WHERE id = ${d.id}`);
  await logAudit({ entityType: "itsm_workflow", entityId: id, action: "discard_draft", performedBy: by, summary: `Workflow draft v${d.version} discarded` });
  res.json({ ok: true });
}));
router.post("/itsm-workflows/:id/publish", requireAuth, wrap(async (req, res) => {
  if (!await canDesign(req)) return fail(res, 403, "Only an ITSM Admin can publish workflows");
  const id = Number(req.params.id); const [w] = rowsOf(await db.execute(sql`SELECT * FROM itsm_workflows WHERE id = ${id}`)); if (!w) return fail(res, 404, "Workflow not found");
  const [d] = rowsOf(await db.execute(sql`SELECT * FROM itsm_workflow_versions WHERE workflow_id = ${id} AND status = 'Draft'`)); if (!d) return fail(res, 400, "No draft to publish");
  const problems = validateDef(w.ticket_type, d.definition); if (problems.length) return res.status(400).json({ error: `Fix ${problems.length} problem${problems.length === 1 ? "" : "s"} before publishing: ${problems[0]}`, problems });
  const by = await getPerformedBy(uid(req));
  const [old] = rowsOf(await db.execute(sql`SELECT id, version FROM itsm_workflow_versions WHERE workflow_id = ${id} AND status = 'Published'`));
  await db.transaction(async tx => {
    if (old) await tx.execute(sql`UPDATE itsm_workflow_versions SET status = 'Retired', updated_by = ${by}, updated_at = now() WHERE id = ${old.id}`);
    await tx.execute(sql`UPDATE itsm_workflow_versions SET status = 'Published', published_by = ${by}, published_at = now(), notes = coalesce(${String(req.body?.notes || "").slice(0, 500) || null}, notes) WHERE id = ${d.id}`);
  });
  await logAudit({ entityType: "itsm_workflow", entityId: id, action: "publish", performedBy: by, summary: `Workflow “${w.name}” v${d.version} published${old ? ` (replaces v${old.version}; tickets already running stay on v${old.version})` : ""}${req.body?.notes ? ` — ${req.body.notes}` : ""}` });
  res.json({ ok: true, version: d.version, replaced: old?.version || null });
}));
router.post("/itsm-workflows/:id/simulate", requireAuth, wrap(async (req, res) => {
  if (!await canView(req)) return fail(res, 403, "No access");
  const id = Number(req.params.id); const [w] = rowsOf(await db.execute(sql`SELECT ticket_type FROM itsm_workflows WHERE id = ${id}`)); if (!w) return fail(res, 404, "Workflow not found");
  res.json(wfSimulate(w.ticket_type, cleanDef(req.body?.definition), req.body?.facts || {}, Array.isArray(req.body?.choices) ? req.body.choices.map(String) : []));
}));

/* ── ticket side ── */
router.get("/itsm-workflow/:kind/:id", requireAuth, wrap(async (req, res) => {
  const kind = String(req.params.kind) as WfKind; if (!KINDS.includes(kind)) return fail(res, 400, "Unknown ticket type");
  const a = await getAccess(req); if (!a) return fail(res, 401, "Sign in");
  res.json(await wfView(kind, Number(req.params.id), uid(req), isItsmAdmin(a)));
}));
router.get("/itsm-workflow-tasks/mine", requireAuth, wrap(async (req, res) => {
  const me = uid(req);
  res.json(rowsOf(await db.execute(sql`SELECT k.id, k.title, k.approver_label AS "approvers", k.created_at AS "createdAt", i.ticket_type AS "ticketType", i.ticket_id AS "ticketId", w.name AS workflow,
      coalesce(inc.ticket_no, sr.request_no, pr.problem_no, ch.change_no) AS "ticketNo", coalesce(inc.title, sr.title, pr.title, ch.title) AS "ticketTitle"
    FROM itsm_workflow_tasks k JOIN itsm_ticket_workflows i ON i.id = k.instance_id JOIN itsm_workflows w ON w.id = i.workflow_id
    LEFT JOIN itsm_incidents inc ON i.ticket_type = 'incident' AND inc.id = i.ticket_id LEFT JOIN itsm_service_requests sr ON i.ticket_type = 'request' AND sr.id = i.ticket_id
    LEFT JOIN itsm_problems pr ON i.ticket_type = 'problem' AND pr.id = i.ticket_id LEFT JOIN itsm_changes ch ON i.ticket_type = 'change' AND ch.id = i.ticket_id
    WHERE k.status = 'Pending' AND ${me} = ANY(k.approver_ids) ORDER BY k.created_at`)));
}));
router.post("/itsm-workflow-tasks/:id/decide", requireAuth, wrap(async (req, res) => {
  const a = await getAccess(req); if (!a) return fail(res, 401, "Sign in");
  const decision = req.body?.decision === "Rejected" ? "Rejected" : req.body?.decision === "Approved" ? "Approved" : null; if (!decision) return fail(res, 400, "Choose Approve or Reject");
  const by = await getPerformedBy(uid(req));
  const r = await wfDecide(Number(req.params.id), uid(req), by, decision, String(req.body?.notes || ""), isItsmAdmin(a));
  await logAudit({ entityType: "itsm_workflow_task", entityId: Number(req.params.id), action: decision.toLowerCase(), performedBy: by, summary: `Workflow approval ${decision.toLowerCase()} on ${KIND_NAME[r.kind]} #${r.ticketId}${req.body?.notes ? ` — ${req.body.notes}` : ""}` });
  res.json({ ok: true, ...r });
}));
export default router;
