/** ITH-101 — ITSM workflow engine.
 *
 *  A workflow is a graph drawn in ITSM › Workflows: nodes and edges, saved as versions (Draft → Published → Retired).
 *  When a ticket is raised the first active workflow whose conditions match is started on its published version; the
 *  ticket keeps that version until it finishes, even if a newer one is published.
 *
 *  Nodes
 *    start      where the ticket enters (one per workflow)
 *    stage      a ticket status; people move the ticket on along the stage's outgoing edges (the edge label is the action);
 *               optional timeout (hours) follows the "timeout" edge by itself, e.g. escalate when on hold too long
 *    approval   raises an approval task for named users, a team or a role; follows "approved" or "rejected"
 *    condition  checks a ticket field (priority, severity, category, source, impact …); follows "yes" or "no"
 *    assign     sets the team and / or person
 *    notify     in-app notice to the requester, assignee, team or named users
 *    end        finishes the workflow, optionally setting a final status
 *  condition, assign and notify run straight away; stage, approval and end stop the walk.
 *  Every step is written to itsm_workflow_events (read-only) and to the ticket history.
 */
import { db, itsmIncidentsTable, itsmProblemsTable, itsmChangesTable, itsmServiceRequestsTable, itsmTicketHistoryTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { slaConfig, slaColumns, pauseColumns } from "./itsm-sla";
import { teamByName, teamMembers, userByName } from "./itsm-routing";

export type WfKind = "incident" | "problem" | "change" | "request";
export type WfNode = { id: string; type: "start" | "stage" | "approval" | "condition" | "assign" | "notify" | "end"; label?: string; x?: number; y?: number; config?: any };
export type WfEdge = { id: string; from: string; to: string; label?: string; outcome?: "next" | "yes" | "no" | "approved" | "rejected" | "timeout" };
export type WfDef = { nodes: WfNode[]; edges: WfEdge[] };

export const WF_STATUS: Record<WfKind, string[]> = {
  incident: ["Open", "In Progress", "On Hold", "Escalated", "Pending Approval", "Resolved", "Closed"],
  problem: ["Open", "Under Investigation", "Root Cause Identified", "Known Error", "Pending Approval", "Resolved", "Closed"],
  change: ["Draft", "Open", "Pending Approval", "Approved", "Rejected", "Scheduled", "In Progress", "Completed", "Failed", "Rolled Back", "Closed", "Cancelled"],
  request: ["Open", "Pending Approval", "Approved", "Rejected", "In Progress", "On Hold", "Completed", "Cancelled"],
};
export const WF_FIELDS: Record<WfKind, { key: string; label: string; values?: string[] }[]> = {
  incident: [{ key: "priority", label: "Priority", values: ["Critical", "High", "Medium", "Low"] }, { key: "severity", label: "Severity", values: ["S1", "S2", "S3", "S4"] }, { key: "category", label: "Category" }, { key: "subcategory", label: "Sub-category" }, { key: "source", label: "Source" }, { key: "assignedGroup", label: "Team" }],
  request: [{ key: "priority", label: "Priority", values: ["Critical", "High", "Medium", "Low"] }, { key: "category", label: "Category" }, { key: "subcategory", label: "Sub-category" }, { key: "assignedGroup", label: "Team" }],
  problem: [{ key: "priority", label: "Priority", values: ["Critical", "High", "Medium", "Low"] }, { key: "category", label: "Category" }, { key: "impactLevel", label: "Impact" }],
  change: [{ key: "type", label: "Change type", values: ["Standard", "Normal", "Emergency", "Major"] }, { key: "category", label: "Category" }, { key: "impact", label: "Impact" }, { key: "riskLevel", label: "Risk", values: ["High", "Medium", "Low"] }],
};
const TABLE: Record<WfKind, any> = { incident: itsmIncidentsTable, problem: itsmProblemsTable, change: itsmChangesTable, request: itsmServiceRequestsTable };
const HISTORY_TYPE: Record<WfKind, string> = { incident: "incident", problem: "problem", change: "change", request: "service_request" };
const NO_KEY: Record<WfKind, string> = { incident: "ticketNo", problem: "problemNo", change: "changeNo", request: "requestNo" };
const LINK: Record<WfKind, string> = { incident: "/itsm-incidents", problem: "/itsm-problems", change: "/itsm-changes", request: "/itsm-requests" };
const SLA_KINDS = ["incident", "request"];
const rowsOf = (r: any) => (r.rows ?? r) as any[];
export class WfError extends Error { status = 400; }

/* ── validation (used on save and before publishing) ── */
export function validateDef(kind: WfKind, d: WfDef, strict = true): string[] {
  const errs: string[] = []; const nodes = Array.isArray(d?.nodes) ? d.nodes : []; const edges = Array.isArray(d?.edges) ? d.edges : [];
  if (nodes.length > 80) errs.push("A workflow can have at most 80 steps");
  const ids = new Set<string>(); for (const n of nodes) { if (!n.id || ids.has(n.id)) errs.push(`Step id “${n.id}” is missing or used twice`); ids.add(n.id); }
  for (const e of edges) if (!ids.has(e.from) || !ids.has(e.to)) errs.push(`A connection points to a step that does not exist (${e.from} → ${e.to})`);
  if (!strict) return errs;
  const name = (n: WfNode) => `“${n.label || n.type}”`;
  const out = (id: string) => edges.filter(e => e.from === id);
  const starts = nodes.filter(n => n.type === "start"); if (starts.length !== 1) errs.push("Add exactly one Start step");
  if (!nodes.some(n => n.type === "end")) errs.push("Add at least one End step");
  for (const n of nodes) {
    const o = out(n.id); const c = n.config || {};
    if (n.type !== "end" && !o.length) errs.push(`${name(n)} has no next step`);
    if (n.type === "start" && o.length !== 1) errs.push("Start must lead to exactly one step");
    if (n.type === "stage") { if (!WF_STATUS[kind].includes(c.status)) errs.push(`${name(n)}: choose a ${kind} status`);
      if (c.timeoutHours && !o.some(e => e.outcome === "timeout")) errs.push(`${name(n)}: has a time limit but no “timeout” connection`);
      if (o.some(e => e.outcome === "timeout") && !(Number(c.timeoutHours) > 0)) errs.push(`${name(n)}: set the time limit (hours) for the “timeout” connection`); }
    if (n.type === "approval") { if (!o.some(e => e.outcome === "approved") || !o.some(e => e.outcome === "rejected")) errs.push(`${name(n)}: connect both “approved” and “rejected”`);
      if (!(c.approverType === "users" ? (c.userIds || []).length : c.approverType === "team" ? c.team : c.approverType === "role" ? c.roleId : false)) errs.push(`${name(n)}: choose who approves`); }
    if (n.type === "condition") { if (!o.some(e => e.outcome === "yes") || !o.some(e => e.outcome === "no")) errs.push(`${name(n)}: connect both “yes” and “no”`);
      if (!c.field || !WF_FIELDS[kind].some(f => f.key === c.field)) errs.push(`${name(n)}: choose a field to check`); if (c.value === undefined || c.value === "") errs.push(`${name(n)}: enter the value to compare`); }
    if (n.type === "assign" && !c.team && !c.user) errs.push(`${name(n)}: choose a team or a person`);
    if (n.type === "assign" && kind === "change") errs.push(`${name(n)}: change requests have no team assignment`);
    if (n.type === "notify" && !(c.to || []).length) errs.push(`${name(n)}: choose who is told`);
    if (n.type === "end" && c.status && !WF_STATUS[kind].includes(c.status)) errs.push(`${name(n)}: final status is not a ${kind} status`);
  }
  // reachability
  if (starts.length === 1) {
    const seen = new Set<string>([starts[0].id]); const q = [starts[0].id];
    while (q.length) { const id = q.shift()!; for (const e of out(id)) if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); } }
    for (const n of nodes) if (!seen.has(n.id)) errs.push(`${name(n)} cannot be reached from Start`);
  }
  // loops made only of automatic steps would never stop
  const auto = new Set(nodes.filter(n => ["condition", "assign", "notify", "start"].includes(n.type)).map(n => n.id));
  const visiting = new Set<string>(), done = new Set<string>(); let loop = false;
  const dfs = (id: string) => { if (loop || done.has(id)) return; if (visiting.has(id)) { loop = true; return; } visiting.add(id); for (const e of out(id)) if (auto.has(e.to)) dfs(e.to); visiting.delete(id); done.add(id); };
  for (const id of auto) dfs(id); if (loop) errs.push("Automatic steps (condition / assign / notify) form a loop — put a stage or approval in between");
  return [...new Set(errs)];
}

/* ── ticket access ── */
async function ticket(kind: WfKind, id: number) { const [t] = await db.select().from(TABLE[kind]).where(eq(TABLE[kind].id, id)); return t as any; }
async function history(kind: WfKind, id: number, notes: string, oldStatus: string | null = null, newStatus: string | null = null, by = "Workflow") {
  await db.insert(itsmTicketHistoryTable).values({ ticketId: id, ticketType: HISTORY_TYPE[kind], oldStatus, newStatus, updatedBy: by, notes } as any);
}
async function inApp(userIds: (number | null | undefined)[], title: string, message: string, link: string, type = "info") {
  for (const u of [...new Set(userIds.filter(Boolean) as number[])]) await db.execute(sql`INSERT INTO notifications (user_id, title, message, type, link) VALUES (${u}, ${title}, ${message}, ${type}, ${link})`).catch(() => {});
}
async function setStatus(kind: WfKind, t: any, to: string, note: string, by: string) {
  if (!to || t.status === to) return t;
  const set: any = { status: to, updatedBy: by, updatedAt: new Date() };
  if (SLA_KINDS.includes(kind)) { const cfg = await slaConfig(); Object.assign(set, pauseColumns(kind, t, to, cfg)); Object.assign(set, slaColumns(kind, { ...t, ...set }, cfg)); }
  if (kind === "incident" && to === "Resolved" && !t.resolvedAt) set.resolvedAt = new Date();
  if (kind === "incident" && to === "Closed" && !t.closedAt) set.closedAt = new Date();
  if (kind === "request" && to === "Completed" && !t.completedAt) set.completedAt = new Date();
  const [row] = await db.update(TABLE[kind]).set(set).where(eq(TABLE[kind].id, t.id)).returning();
  await history(kind, t.id, note, t.status, to, by);
  return row;
}
function fieldOf(t: any, f: string) { return t?.[f] ?? null; }
export function conditionTrue(t: any, c: any) {
  const v = String(fieldOf(t, c.field) ?? "").toLowerCase(); const list = String(c.value ?? "").split(",").map((x: string) => x.trim().toLowerCase()).filter(Boolean);
  switch (c.op || "eq") {
    case "neq": return !list.includes(v);
    case "contains": return list.some(x => v.includes(x));
    case "empty": return !v;
    default: return list.includes(v);   // eq / in
  }
}

/* ── choosing the workflow ── */
export async function pickWorkflow(kind: WfKind, t: any) {
  const rows = rowsOf(await db.execute(sql`SELECT w.id, w.name, w.match, v.id AS version_id, v.version, v.definition FROM itsm_workflows w JOIN itsm_workflow_versions v ON v.workflow_id = w.id AND v.status = 'Published'
    WHERE w.ticket_type = ${kind} AND w.is_active ORDER BY w.rank, w.id`));
  for (const w of rows) {
    const m = w.match || {}; const ok = (k: string) => !Array.isArray(m[k]) || !m[k].length || m[k].map((x: string) => x.toLowerCase()).includes(String(t[k] ?? "").toLowerCase());
    if (ok("category") && ok("priority") && ok("subcategory") && ok("type")) return w;
  }
  return null;
}
export const hasWorkflows = async (kind: WfKind) => rowsOf(await db.execute(sql`SELECT 1 FROM itsm_workflows w JOIN itsm_workflow_versions v ON v.workflow_id = w.id AND v.status = 'Published' WHERE w.ticket_type = ${kind} AND w.is_active LIMIT 1`)).length > 0;

async function instanceOf(kind: WfKind, id: number) {
  const [i] = rowsOf(await db.execute(sql`SELECT i.*, v.definition, v.version, w.name AS workflow FROM itsm_ticket_workflows i JOIN itsm_workflow_versions v ON v.id = i.version_id JOIN itsm_workflows w ON w.id = i.workflow_id
    WHERE i.ticket_type = ${kind} AND i.ticket_id = ${id}`));
  return i || null;
}
async function event(instId: number, n: WfNode | null, ev: string, detail: string | null, by = "Workflow") {
  await db.execute(sql`INSERT INTO itsm_workflow_events (instance_id, node_id, node_label, node_type, event, detail, by_name) VALUES (${instId}, ${n?.id || null}, ${n ? (n.label || n.type) : null}, ${n?.type || null}, ${ev}, ${detail}, ${by})`);
}
const nodeOf = (d: WfDef, id: string) => d.nodes.find(n => n.id === id) || null;
const outOf = (d: WfDef, id: string, outcome?: string) => d.edges.filter(e => e.from === id && (!outcome || (e.outcome || "next") === outcome));

async function approversOf(c: any): Promise<{ ids: number[]; label: string }> {
  if (c.approverType === "users") { const ids = (c.userIds || []).map(Number).filter(Boolean); const names = rowsOf(await db.execute(sql`SELECT name FROM users WHERE id = ANY(${sql.raw(`ARRAY[${ids.join(",") || "0"}]::int[]`)}) AND is_active`)).map(r => r.name); return { ids, label: names.join(", ") }; }
  if (c.approverType === "team") { const t = await teamByName(c.team); if (!t) return { ids: [], label: `${c.team} (team not found)` }; return { ids: (await teamMembers(t.id)).map(m => m.id), label: `${t.name} team` }; }
  if (c.approverType === "role") { const r = rowsOf(await db.execute(sql`SELECT u.id, ro.name FROM user_roles ur JOIN users u ON u.id = ur.user_id AND u.is_active JOIN roles ro ON ro.id = ur.role_id WHERE ur.role_id = ${Number(c.roleId)}`));
    const [ro] = rowsOf(await db.execute(sql`SELECT name FROM roles WHERE id = ${Number(c.roleId)}`)); return { ids: r.map(x => x.id), label: `${ro?.name || "role"} role` }; }
  return { ids: [], label: "—" };
}
async function recipients(kind: WfKind, t: any, c: any) {
  const ids: number[] = [];
  for (const to of c.to || []) {
    if (to === "requester" && t.requesterUserId) ids.push(t.requesterUserId);
    if (to === "assignee" && t.assignedTo) { const u = await userByName(t.assignedTo); if (u) ids.push(u.id); }
    if (to === "team" && t.assignedGroup) { const tm = await teamByName(t.assignedGroup); if (tm) ids.push(...(await teamMembers(tm.id)).map(m => m.id)); }
    if (to === "users") ids.push(...(c.userIds || []).map(Number));
  }
  return ids;
}
const fill = (s: string, t: any, kind: WfKind) => String(s || "").replace(/\{(\w+)\}/g, (_m, k) => k === "no" ? t[NO_KEY[kind]] : String(t[k] ?? ""));

/** Walk from a node along an edge, running automatic steps, until a stage / approval / end. */
async function walk(kind: WfKind, inst: any, edge: WfEdge | null, by: string) {
  const d: WfDef = inst.definition; let t = await ticket(kind, inst.ticket_id); let e = edge;
  for (let guard = 0; e && guard < 60; guard++) {
    const n = nodeOf(d, e.to); if (!n) break; const c = n.config || {};
    await db.execute(sql`UPDATE itsm_ticket_workflows SET current_node = ${n.id}, entered_at = now(), state = 'Running' WHERE id = ${inst.id}`);
    if (n.type === "condition") { const yes = conditionTrue(t, c); await event(inst.id, n, "condition", `${c.field} ${c.op || "eq"} ${c.value} → ${yes ? "yes" : "no"}`, by); e = outOf(d, n.id, yes ? "yes" : "no")[0] || null; continue; }
    if (n.type === "assign") {
      const set: any = {}; const notes: string[] = [];
      if (c.team && (kind === "incident" || kind === "request" || kind === "problem")) { const tm = await teamByName(c.team); if (tm) { set.assignedGroup = tm.name; if (kind !== "problem") set.teamId = tm.id; notes.push(`team ${tm.name}`); } }
      if (c.user && kind !== "change") { const u = await userByName(c.user); if (u) { set.assignedTo = u.name; notes.push(u.name); if (kind !== "problem" && !t.firstResponseAt) set.firstResponseAt = new Date(); } }
      if (Object.keys(set).length) { [t] = await db.update(TABLE[kind]).set({ ...set, updatedBy: by, updatedAt: new Date() }).where(eq(TABLE[kind].id, t.id)).returning(); await history(kind, t.id, `Workflow assigned to ${notes.join(" / ")}`, null, null, by); }
      await event(inst.id, n, "assigned", notes.join(" / ") || "nothing to assign", by); e = outOf(d, n.id)[0] || null; continue;
    }
    if (n.type === "notify") {
      const ids = await recipients(kind, t, c); const msg = fill(c.message || "{no}: {title} is now at “{status}”.", t, kind);
      await inApp(ids, fill(c.title || `${t[NO_KEY[kind]]} update`, t, kind), msg, `${LINK[kind]}?open=${t.id}`);
      await event(inst.id, n, "notified", `${ids.length} people: ${msg}`.slice(0, 500), by); e = outOf(d, n.id)[0] || null; continue;
    }
    if (n.type === "stage") {
      t = await setStatus(kind, t, c.status, `Workflow “${inst.workflow}” → ${n.label || c.status}`, by);
      await event(inst.id, n, "entered", `status ${c.status}`, by); return;
    }
    if (n.type === "approval") {
      const ap = await approversOf(c); const title = fill(c.title || n.label || "Approval", t, kind);
      await db.execute(sql`INSERT INTO itsm_workflow_tasks (instance_id, node_id, title, approver_ids, approver_label) VALUES (${inst.id}, ${n.id}, ${title}, ${sql.raw(`ARRAY[${ap.ids.join(",")}]::int[]`)}, ${ap.label})`);
      await db.execute(sql`UPDATE itsm_ticket_workflows SET state = 'Waiting approval' WHERE id = ${inst.id}`);
      if (WF_STATUS[kind].includes("Pending Approval")) t = await setStatus(kind, t, "Pending Approval", `Workflow “${inst.workflow}”: waiting for ${title} (${ap.label})`, by);
      await inApp(ap.ids, `Approval needed: ${t[NO_KEY[kind]]}`, `${title} — ${t.title}`, `${LINK[kind]}?open=${t.id}`, "warning");
      await event(inst.id, n, "entered", `approval by ${ap.label}${ap.ids.length ? "" : " — nobody can approve (no active people)"}`, by); return;
    }
    if (n.type === "end") {
      if (c.status) t = await setStatus(kind, t, c.status, `Workflow “${inst.workflow}” finished`, by);
      await db.execute(sql`UPDATE itsm_ticket_workflows SET state = 'Finished', finished_at = now() WHERE id = ${inst.id}`);
      await event(inst.id, n, "finished", c.status ? `status ${c.status}` : null, by); return;
    }
    e = outOf(d, n.id)[0] || null;   // start
  }
}

/** Statuses a person may move the ticket to from its current stage (following automatic steps as the ticket is now). */
async function targets(kind: WfKind, inst: any, t: any) {
  const d: WfDef = inst.definition; const res: { status: string; edge: WfEdge; label: string }[] = [];
  for (const e of outOf(d, inst.current_node).filter(x => (x.outcome || "next") === "next")) {
    let cur: WfEdge | null = e;
    for (let g = 0; cur && g < 60; g++) {
      const n = nodeOf(d, cur.to); if (!n) break; const c = n.config || {};
      if (n.type === "condition") { cur = outOf(d, n.id, conditionTrue(t, c) ? "yes" : "no")[0] || null; continue; }
      if (n.type === "assign" || n.type === "notify" || n.type === "start") { cur = outOf(d, n.id)[0] || null; continue; }
      const st = n.type === "stage" ? c.status : n.type === "approval" ? "Pending Approval" : n.type === "end" ? (c.status || null) : null;
      res.push({ status: st || "", edge: e, label: e.label || n.label || st || "Finish" }); break;
    }
  }
  return res;
}

/* ── hooks called by the ticket routes ── */
export async function wfStart(kind: WfKind, ticketId: number, by: string) {
  const t = await ticket(kind, ticketId); const w = await pickWorkflow(kind, t); if (!w) return null;
  const d: WfDef = w.definition; const start = d.nodes.find(n => n.type === "start"); if (!start) return null;
  const [inst] = rowsOf(await db.execute(sql`INSERT INTO itsm_ticket_workflows (ticket_type, ticket_id, workflow_id, version_id, current_node) VALUES (${kind}, ${ticketId}, ${w.id}, ${w.version_id}, ${start.id})
    ON CONFLICT (ticket_type, ticket_id) DO NOTHING RETURNING *`)); if (!inst) return null;
  await event(inst.id, start, "started", `“${w.name}” v${w.version}`, by);
  await history(kind, ticketId, `Workflow “${w.name}” v${w.version} started`, null, null, by);
  await walk(kind, { ...inst, definition: d, workflow: w.name }, outOf(d, start.id)[0] || null, "Workflow");
  return w;
}
/** Before a status change: refuse moves the workflow does not allow (ITSM Admin may override; the workflow then follows). */
export async function wfCheckStatus(kind: WfKind, ticketId: number, from: string, to: string, admin: boolean) {
  if (from === to) return;
  const inst = await instanceOf(kind, ticketId); if (!inst || inst.state === "Finished" || inst.state === "Stopped") return;
  if (admin) return;
  const d: WfDef = inst.definition; const n = nodeOf(d, inst.current_node);
  if (inst.state === "Waiting approval") throw new WfError(`Waiting for approval in workflow “${inst.workflow}” (${n?.label || "approval"}) — the status moves on when it is approved or rejected`);
  const t = await ticket(kind, ticketId); const opts = await targets(kind, inst, t);
  const ok = opts.some(o => o.status === to) || opts.some(o => !o.status && ["Resolved", "Closed", "Completed", "Cancelled"].includes(to));
  if (!ok) throw new WfError(`Workflow “${inst.workflow}” at “${n?.label || n?.config?.status || "this step"}” allows: ${opts.map(o => `${o.label}${o.status && o.status !== o.label ? ` (${o.status})` : ""}`).join(", ") || "no manual moves"}`);
}
/** After a status change has been saved: move the workflow along the matching edge. */
export async function wfAfterStatus(kind: WfKind, ticketId: number, from: string, to: string, by: string, admin: boolean) {
  if (from === to) return;
  const inst = await instanceOf(kind, ticketId); if (!inst || inst.state === "Finished" || inst.state === "Stopped") return;
  const d: WfDef = inst.definition; const t = await ticket(kind, ticketId);
  if (inst.state === "Running") {
    const o = (await targets(kind, inst, { ...t, status: from })).find(x => x.status === to) || (await targets(kind, inst, { ...t, status: from })).find(x => !x.status);
    if (o) { await event(inst.id, nodeOf(d, inst.current_node), "left", `${o.label} → ${to}`, by); await walk(kind, inst, o.edge, by); return; }
  }
  if (admin) {   // override outside the drawn path: jump to a stage with that status, else stop the workflow
    const st = d.nodes.find(n => n.type === "stage" && n.config?.status === to);
    await db.execute(sql`UPDATE itsm_workflow_tasks SET status = 'Cancelled', notes = 'Status changed by ITSM Admin' WHERE instance_id = ${inst.id} AND status = 'Pending'`);
    if (st) { await db.execute(sql`UPDATE itsm_ticket_workflows SET current_node = ${st.id}, entered_at = now(), state = 'Running' WHERE id = ${inst.id}`); await event(inst.id, st, "override", `ITSM Admin moved the ticket to ${to}`, by); }
    else { await db.execute(sql`UPDATE itsm_ticket_workflows SET state = 'Stopped', finished_at = now() WHERE id = ${inst.id}`); await event(inst.id, null, "stopped", `ITSM Admin set ${to}, which is not in the workflow`, by); await history(kind, ticketId, `Workflow “${inst.workflow}” stopped: status ${to} set by ITSM Admin outside the workflow`, null, null, by); }
  }
}
/** Approve or reject a workflow approval task. */
export async function wfDecide(taskId: number, userId: number, userName: string, decision: "Approved" | "Rejected", notes: string, admin: boolean) {
  const [tk] = rowsOf(await db.execute(sql`SELECT k.*, i.ticket_type, i.ticket_id FROM itsm_workflow_tasks k JOIN itsm_ticket_workflows i ON i.id = k.instance_id WHERE k.id = ${taskId}`));
  if (!tk) throw Object.assign(new WfError("Approval not found"), { status: 404 });
  if (tk.status !== "Pending") throw new WfError(`Already ${tk.status.toLowerCase()} by ${tk.decided_by || "someone"}`);
  const mine = (tk.approver_ids || []).map(Number).includes(userId);
  if (!mine && !admin) throw Object.assign(new WfError(`Only ${tk.approver_label} can decide this`), { status: 403 });
  if (decision === "Rejected" && notes.trim().length < 5) throw new WfError("Give a reason for rejecting");
  if (!mine && notes.trim().length < 5) throw new WfError("ITSM Admin deciding for the approvers — give a reason");
  const by = mine ? userName : `${userName} (ITSM Admin on behalf of ${tk.approver_label})`;
  await db.execute(sql`UPDATE itsm_workflow_tasks SET status = ${decision}, decided_by = ${by}, decided_by_id = ${userId}, decided_at = now(), notes = ${notes.trim() || null} WHERE id = ${taskId}`);
  const kind = tk.ticket_type as WfKind; const inst = await instanceOf(kind, tk.ticket_id); const d: WfDef = inst.definition; const n = nodeOf(d, tk.node_id);
  if (kind === "change") await db.update(itsmChangesTable).set({ approvalStatus: decision, approvedBy: by } as any).where(eq(itsmChangesTable.id, tk.ticket_id));
  await event(inst.id, n, decision === "Approved" ? "approved" : "rejected", notes.trim() || null, by);
  await history(kind, tk.ticket_id, `${tk.title}: ${decision.toLowerCase()} by ${by}${notes.trim() ? ` — ${notes.trim()}` : ""}`, null, null, by);
  const e = outOf(d, tk.node_id, decision === "Approved" ? "approved" : "rejected")[0] || null;
  await walk(kind, inst, e, by);
  return { kind, ticketId: tk.ticket_id };
}
/** Stage time limits: follow the "timeout" edge (run every minute). */
export async function wfSweep() {
  const rows = rowsOf(await db.execute(sql`SELECT i.*, v.definition, w.name AS workflow FROM itsm_ticket_workflows i JOIN itsm_workflow_versions v ON v.id = i.version_id JOIN itsm_workflows w ON w.id = i.workflow_id WHERE i.state = 'Running'`));
  let n = 0;
  for (const inst of rows) {
    const node = nodeOf(inst.definition, inst.current_node); const h = Number(node?.config?.timeoutHours) || 0;
    if (node?.type !== "stage" || !h || Date.now() - new Date(inst.entered_at).getTime() < h * 3600e3) continue;
    const e = outOf(inst.definition, node.id, "timeout")[0]; if (!e) continue;
    await event(inst.id, node, "timeout", `${h} h at “${node.label || node.config.status}”`); await walk(inst.ticket_type, inst, e, "Workflow (time limit)"); n++;
  }
  return n;
}
let sweeping: NodeJS.Timeout | null = null;
export function startWorkflowSweep(ms = 60_000) { if (!sweeping) { sweeping = setInterval(() => { wfSweep().catch(e => console.error("workflow sweep", e)); }, ms); sweeping.unref?.(); } }

/** What the ticket screen shows: workflow, current step, next actions, open approvals, history. */
export async function wfView(kind: WfKind, ticketId: number, userId: number, admin: boolean) {
  const inst = await instanceOf(kind, ticketId); if (!inst) return null;
  const d: WfDef = inst.definition; const t = await ticket(kind, ticketId); const n = nodeOf(d, inst.current_node);
  const tasks = rowsOf(await db.execute(sql`SELECT id, node_id AS "nodeId", title, approver_label AS "approvers", approver_ids AS ids, status, decided_by AS "decidedBy", decided_at AS "decidedAt", notes, created_at AS "createdAt" FROM itsm_workflow_tasks WHERE instance_id = ${inst.id} ORDER BY id`))
    .map(x => ({ ...x, canDecide: x.status === "Pending" && ((x.ids || []).map(Number).includes(userId) || admin), mine: (x.ids || []).map(Number).includes(userId), ids: undefined }));
  const events = rowsOf(await db.execute(sql`SELECT node_id AS "nodeId", node_label AS "label", node_type AS "type", event, detail, by_name AS "by", at FROM itsm_workflow_events WHERE instance_id = ${inst.id} ORDER BY at, id`));
  const next = inst.state === "Running" ? (await targets(kind, inst, t)).map(o => ({ label: o.label, status: o.status || null })) : [];
  const timeout = n?.type === "stage" && Number(n.config?.timeoutHours) ? new Date(new Date(inst.entered_at).getTime() + Number(n.config.timeoutHours) * 3600e3).toISOString() : null;
  return { id: inst.id, workflow: inst.workflow, workflowId: inst.workflow_id, version: inst.version, state: inst.state, current: n ? { id: n.id, label: n.label || n.config?.status || n.type, type: n.type } : null,
    enteredAt: inst.entered_at, timeoutAt: timeout, next, tasks, events, definition: d, visited: [...new Set(events.map(e => e.nodeId).filter(Boolean))] };
}
/** Test a workflow against sample ticket values without touching any ticket. */
export function wfSimulate(kind: WfKind, d: WfDef, facts: any, choices: string[] = []) {
  const path: { id: string; label: string; type: string; note?: string }[] = []; const start = d.nodes.find(n => n.type === "start"); if (!start) return { path, stop: "No Start step" };
  let e: WfEdge | null = outOf(d, start.id)[0] || null; path.push({ id: start.id, label: start.label || "Start", type: "start" }); let ci = 0; const t = { ...facts };
  for (let g = 0; e && g < 80; g++) {
    const n = nodeOf(d, e.to); if (!n) break; const c = n.config || {};
    if (n.type === "condition") { const y = conditionTrue(t, c); path.push({ id: n.id, label: n.label || "Condition", type: n.type, note: y ? "yes" : "no" }); e = outOf(d, n.id, y ? "yes" : "no")[0] || null; continue; }
    if (n.type === "assign") { if (c.team) t.assignedGroup = c.team; if (c.user) t.assignedTo = c.user; path.push({ id: n.id, label: n.label || "Assign", type: n.type, note: [c.team, c.user].filter(Boolean).join(" / ") }); e = outOf(d, n.id)[0] || null; continue; }
    if (n.type === "notify") { path.push({ id: n.id, label: n.label || "Notify", type: n.type, note: (c.to || []).join(", ") }); e = outOf(d, n.id)[0] || null; continue; }
    if (n.type === "end") { path.push({ id: n.id, label: n.label || "End", type: n.type, note: c.status || "" }); return { path, stop: "Finished" }; }
    if (n.type === "stage") { t.status = c.status; path.push({ id: n.id, label: n.label || c.status, type: n.type, note: c.status });
      const opts = outOf(d, n.id).filter(x => (x.outcome || "next") === "next"); const pick = choices[ci++];
      const seen = new Set(path.map(p => p.id)); const fresh = opts.filter(x => !seen.has(x.to));
      e = (pick && opts.find(x => x.id === pick || x.label === pick || x.to === pick)) || fresh[fresh.length - 1] || fresh[0] || opts[opts.length - 1] || outOf(d, n.id, "timeout")[0] || null; continue; }
    if (n.type === "approval") { const pick = choices[ci++] === "rejected" ? "rejected" : "approved"; path.push({ id: n.id, label: n.label || "Approval", type: n.type, note: pick }); e = outOf(d, n.id, pick)[0] || null; continue; }
    e = outOf(d, n.id)[0] || null;
  }
  return { path, stop: e ? "Too many steps (loop?)" : "Stopped — a step has no next step" };
}
