import { Router, type Request, type Response } from "express";
import { db, usersTable, itsmIncidentsTable, itsmProblemsTable, itsmChangesTable, itsmSlaPoliciesTable, itsmTicketHistoryTable, itsmKnowledgeBaseTable, itsmServiceRequestsTable, itsmApprovalMatrixTable, itsmApprovalsTable, itsmAttachmentsTable, itsmApprovalDelegatesTable, settingsTable } from "@workspace/db";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess, can } from "../lib/rbac";
import { route, RoutingError, isMember, teamIdsOf, teamByName, teamById, userByName, emailsOfTeam } from "../lib/itsm-routing";
import { z } from "zod";
import { fmtDateTime } from "../lib/dates";
import { slaConfig, slaInfo, slaColumns, pauseColumns, clearSlaCache } from "../lib/itsm-sla";

/*
 * IT Service Management API.
 *  - Access: module permissions per ticket type (lib/rbac.ts: itsm_incidents, itsm_problems, itsm_changes, itsm_requests,
 *    itsm_kb, itsm_sla, itsm_approval, itsm_dashboard). Read = view, Edit = create / update, Full = delete.
 *  - Who: created-by, raised-by, updated-by and approver always come from the signed-in user — never from the request body.
 *  - Ticket numbers: allocated under an advisory lock (INC-/PRB-/CHG-/SR-#####), safe with simultaneous users.
 *  - History: every status, assignment, team and approval change is written to itsm_ticket_history with the user.
 *  - Approvals: levels are actioned in order; a rejection ends the flow; the outcome is applied to the ticket.
 */

const router = Router();
router.use(requireAuth);

/* ─── short-lived GET cache (cleared by any write) ───────────────────────── */
const responseCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10000;
router.use((req, _res, next) => { if (req.method !== "GET" && req.method !== "OPTIONS") responseCache.clear(); next(); });
function cachedGet(path: string, handler: () => Promise<any>) {
  return async (_req: any, res: any) => {
    const c = responseCache.get(path);
    if (c && Date.now() - c.ts < CACHE_TTL) { res.json(c.data); return; }
    try { const data = await handler(); responseCache.set(path, { data, ts: Date.now() }); res.json(data); }
    catch (err: any) { res.status(500).json({ error: err.message || "Internal error" }); }
  };
}

/* ─── helpers ────────────────────────────────────────────────────────────── */
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e instanceof RoutingError ? 400 : e?.status || 500, e?.message || String(e)); }
};
class Bad extends Error { status = 400; }
class Forbidden extends Error { status = 403; }
class NotFound extends Error { status = 404; }
const s = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());

export async function actor(req: Request) {
  const userId = (req.session as any)?.userId as number | undefined;
  const [u] = userId ? await db.select({ name: usersTable.name, email: usersTable.email, code: usersTable.employeeCode }).from(usersTable).where(eq(usersTable.id, userId)) : [];
  return { userId: userId ?? null, name: u?.name || "System", email: u?.email || null, code: u?.code || null, label: u ? `${u.name} <${u.email}>` : "System" };
}
const audit = (p: Parameters<typeof logAudit>[0]) => logAudit(p).catch(() => { /* non-fatal */ });

/** Server-owned fields are never taken from the browser. */
const SERVER_OWNED = ["expectedClosureDate", "requesterUserId", "firstResponseAt", "dueDate", "id", "ticketNo", "problemNo", "changeNo", "requestNo", "slaBreachAt", "slaId", "resolvedAt", "closedAt", "completedAt", "isActive",
  "createdBy", "updatedBy", "createdAt", "updatedAt", "approvalStatus", "approvedBy", "views", "authorName", "slaStatus", "sla",
  "responseDueAt", "slaPausedAt", "slaPausedMins", "slaWarnSentAt", "slaBreachSentAt", "responseBreachSentAt"];
function clean(body: any, extra: string[] = []) {
  const out: any = {};
  for (const [k, v] of Object.entries(body || {})) if (!SERVER_OWNED.includes(k) && !extra.includes(k)) out[k] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v;
  return out;
}

export const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export const SEVERITIES = ["S1", "S2", "S3", "S4"] as const;
export const STATUS = {
  incident: ["Open", "In Progress", "On Hold", "Escalated", "Pending Approval", "Resolved", "Closed"],
  problem: ["Open", "Under Investigation", "Root Cause Identified", "Known Error", "Pending Approval", "Resolved", "Closed"],
  change: ["Draft", "Open", "Pending Approval", "Approved", "Rejected", "Scheduled", "In Progress", "Completed", "Failed", "Rolled Back", "Closed", "Cancelled"],
  request: ["Open", "Pending Approval", "Approved", "Rejected", "In Progress", "On Hold", "Completed", "Cancelled"],
};
const DONE: Record<string, string[]> = { incident: ["Resolved", "Closed"], problem: ["Resolved", "Closed"], change: ["Completed", "Failed", "Rolled Back", "Closed", "Cancelled"], request: ["Completed", "Cancelled", "Rejected"] };
const TYPE_NAME: Record<string, string> = { incident: "Incident", problem: "Problem", change: "Change Request", request: "Service Request" };
const HISTORY_TYPE: Record<string, string> = { incident: "incident", problem: "problem", change: "change", request: "service_request" };
const MODULE_OF: Record<string, string> = { incident: "itsm_incidents", problem: "itsm_problems", change: "itsm_changes", request: "itsm_requests", "Incident": "itsm_incidents", "Problem": "itsm_problems", "Change Request": "itsm_changes", "Service Request": "itsm_requests" };

const title = z.string({ required_error: "Title is required" }).trim().min(3, "Title must be at least 3 characters").max(300);
const prio = z.enum(PRIORITIES, { errorMap: () => ({ message: `Priority must be one of ${PRIORITIES.join(", ")}` }) });
const sev = z.enum(SEVERITIES, { errorMap: () => ({ message: `Severity must be one of ${SEVERITIES.join(", ")}` }) });
const statusOf = (k: keyof typeof STATUS) => z.enum(STATUS[k] as [string, ...string[]], { errorMap: () => ({ message: `Status must be one of ${STATUS[k].join(", ")}` }) });
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new Bad(r.error.issues.map(i => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message).join("; "));
  return r.data;
}
const SCHEMAS = {
  incident: { create: z.object({ title, priority: prio.default("Medium"), severity: sev.default("S3") }).passthrough(), patch: z.object({ title: title.optional(), priority: prio.optional(), severity: sev.optional(), status: statusOf("incident").optional() }).passthrough() },
  problem: { create: z.object({ title, priority: prio.default("Medium") }).passthrough(), patch: z.object({ title: title.optional(), priority: prio.optional(), status: statusOf("problem").optional() }).passthrough() },
  change: { create: z.object({ title, type: z.enum(["Standard", "Normal", "Emergency", "Major"]).default("Normal"), riskLevel: z.enum(["High", "Medium", "Low"]).default("Medium") }).passthrough(), patch: z.object({ title: title.optional(), status: statusOf("change").optional() }).passthrough() },
  request: { create: z.object({ title, priority: prio.default("Medium") }).passthrough(), patch: z.object({ title: title.optional(), priority: prio.optional(), status: statusOf("request").optional() }).passthrough() },
};

/** Next ticket number, allocated under a transaction-scoped advisory lock (no duplicates with simultaneous users). */
async function nextNo(tx: any, table: string, col: string, prefix: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"itsm_no:" + table}))`);
  const r: any = await tx.execute(sql.raw(`SELECT coalesce(max(nullif(regexp_replace(${col}, '\\D', '', 'g'), '')::int), 0) AS n FROM public.${table}`));
  return `${prefix}-${String(Number((r.rows ?? r)[0].n) + 1).padStart(5, "0")}`;
}

async function history(ticketType: string, ticketId: number, by: string, notes: string, oldStatus: string | null = null, newStatus: string | null = null, tx: any = db) {
  await tx.insert(itsmTicketHistoryTable).values({ ticketId, ticketType: HISTORY_TYPE[ticketType] || ticketType, oldStatus, newStatus, updatedBy: by, notes });
}

/** Can this user do `level` on the ticket type's module? (base role Admin always can) */
async function allowed(req: Request, kind: string, level: "read" | "write" | "admin") {
  const a = await getAccess(req);
  if (!a) return false;
  if (a.isAdmin) return true;
  const LV = ["none", "read", "write", "admin"];
  return LV.indexOf(a.perms[MODULE_OF[kind]] || "none") >= LV.indexOf(level);
}

/* ─── SLA (lib/itsm-sla.ts): response + resolution targets, business hours, pause on hold ─── */
const SLA_KINDS = ["incident", "request"];
async function withSla(kind: string, rows: any[]) {
  if (!SLA_KINDS.includes(kind)) return rows;
  const cfg = await slaConfig(); const now = new Date();
  return rows.map(r => { const sla = slaInfo(kind, r, cfg, now); return { ...r, sla, slaStatus: sla.state === "Breached" ? "breached" : sla.state === "At risk" ? "warning" : "ok" }; });
}
async function computeSlaBreachCount() {
  const cfg = await slaConfig(); const now = new Date();
  const rows = await db.select().from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true));
  return rows.filter(r => !["Resolved", "Closed"].includes(r.status) && slaInfo("incident", r, cfg, now).state === "Breached").length;
}

/* ─── Approvals: created from the matrix, actioned in order, outcome applied to the ticket ─── */

type TicketFacts = { priority?: string | null; severity?: string | null; type?: string | null; riskLevel?: string | null; category?: string | null };
function ruleMatches(cond: string | null, t: TicketFacts) {
  if (!cond || cond === "All") return true;
  const [k, v] = [cond.slice(0, cond.indexOf(":")), cond.slice(cond.indexOf(":") + 1)];
  const vals = v.split(",").map(x => x.trim().toLowerCase());
  const val = (k === "Priority" ? t.priority : k === "Severity" ? t.severity : k === "Type" ? t.type : k === "Risk" ? t.riskLevel : k === "Category" ? t.category : null) || "";
  return vals.includes(val.toLowerCase());
}

async function autoApproveRules(): Promise<{ lowPriority: boolean; standardChange: boolean }> {
  const [r] = await db.select().from(settingsTable).where(eq(settingsTable.key, "itsm.autoApprove"));
  let v: any = r?.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  return { lowPriority: v?.lowPriority !== false, standardChange: v?.standardChange !== false };
}

/** Returns the number of approvals still pending (0 = nothing to approve). Emails the first level's approvers. */
async function createApprovalRecords(kind: string, ticketId: number, t: TicketFacts, by: string) {
  const ticketType = TYPE_NAME[kind];
  const rules = (await db.select().from(itsmApprovalMatrixTable)
    .where(and(eq(itsmApprovalMatrixTable.ticketType, ticketType), eq(itsmApprovalMatrixTable.isActive, true)))
    .orderBy(itsmApprovalMatrixTable.sequence)).filter(r => ruleMatches(r.condition, t));
  if (!rules.length) return 0;
  const aa = await autoApproveRules();
  const auto = (aa.lowPriority && t.priority === "Low" && kind !== "change") || (aa.standardChange && kind === "change" && t.type === "Standard");
  await db.insert(itsmApprovalsTable).values(rules.map((r, i) => ({
    ticketId, ticketType, approverLevel: r.approverLevel, approverRole: r.approverRole,
    approverRoleId: r.approverRoleId ?? null, approverUserIds: r.approverUserIds || [],
    status: auto ? "Auto-Approved" : "Pending", approverName: auto ? "System (auto-approval)" : null, actionAt: auto ? new Date() : null,
    requestedAt: auto || i === 0 ? new Date() : null,
    notes: auto ? (kind === "change" ? "Standard (pre-approved) change" : "Low priority — auto-approved") : null,
  })));
  await history(kind, ticketId, auto ? "System" : by, auto ? `Approval not needed: ${kind === "change" ? "standard (pre-approved) change" : "low priority"}` : `Waiting for approval: ${rules.map(r => `${r.approverLevel} ${r.approverRole}`).join(" → ")}`, null, auto ? "Auto-Approved" : "Pending Approval");
  if (!auto) void emailNextApprovers(kind as Kind, ticketId);
  return auto ? 0 : rules.length;
}

/* ─── Approvers: who may decide a step ───────────────────────────────────── */

/** People who can decide this step: named users, members of the IT Hub role, or (unlinked legacy rule) Full access on the module. */
async function approversOf(ap: { approverUserIds?: number[] | null; approverRoleId?: number | null; ticketType: string }) {
  const ids = new Set<number>(ap.approverUserIds || []);
  if (ap.approverRoleId) for (const r of rowsOf(await db.execute(sql`SELECT user_id FROM user_roles WHERE role_id = ${ap.approverRoleId}`))) ids.add(r.user_id);
  if (!ids.size && !ap.approverRoleId) {
    const mod = MODULE_OF[ap.ticketType];
    for (const r of rowsOf(await db.execute(sql`SELECT DISTINCT ur.user_id FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id WHERE rp.module = ${mod} AND rp.access_level = 'admin'`))) ids.add(r.user_id);
  }
  if (!ids.size) return [];
  return db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(and(inArray(usersTable.id, [...ids]), eq(usersTable.isActive, true)));
}
/** Active delegations today: approver → delegates (out-of-office cover). */
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
async function activeDelegations() {
  const d = todayIst();
  return db.select().from(itsmApprovalDelegatesTable).where(and(eq(itsmApprovalDelegatesTable.isActive, true), sql`${itsmApprovalDelegatesTable.startDate} <= ${d} AND ${itsmApprovalDelegatesTable.endDate} >= ${d}`));
}
/** Approvers plus anyone covering for them today. */
async function approversWithDelegates(ap: any) {
  const base = await approversOf(ap);
  const dl = (await activeDelegations()).filter(x => base.some(b => b.id === x.userId));
  const extra = dl.length ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(and(inArray(usersTable.id, dl.map(x => x.delegateUserId)), eq(usersTable.isActive, true))) : [];
  return { base, delegates: extra.map(u => ({ ...u, forNames: dl.filter(x => x.delegateUserId === u.id).map(x => base.find(b => b.id === x.userId)?.name).filter(Boolean) as string[] })) };
}
const rowsOf = (r: any) => (r.rows ?? r) as any[];

/** Can the signed-in user decide this step? Base-role Admin may override (recorded as such). */
async function canDecide(req: Request, ap: any): Promise<{ ok: boolean; override: boolean; onBehalfOf?: string | null }> {
  const a = await getAccess(req);
  if (!a) return { ok: false, override: false };
  const { base, delegates } = await approversWithDelegates(ap);
  if (base.some(u => u.id === a.userId)) return { ok: true, override: false };
  const d = delegates.find(u => u.id === a.userId);
  if (d) return { ok: true, override: false, onBehalfOf: d.forNames.join(", ") };
  if (a.isAdmin) return { ok: true, override: true };
  return { ok: false, override: false };
}

const appUrl = () => { try { return process.env.APP_URL || (process.env.CENTRAL_SSO_REDIRECT_URI ? new URL(process.env.CENTRAL_SSO_REDIRECT_URI).origin : ""); } catch { return ""; } };
const PAGE_OF: Record<string, string> = { incident: "/itsm-incidents", problem: "/itsm-problems", change: "/itsm-changes", request: "/itsm-requests" };
const emailOf = (label?: string | null) => (label || "").match(/<([^>]+)>/)?.[1] || null;

async function ticketBrief(kind: Kind, id: number) {
  const [t]: any[] = await db.select().from(TABLE[kind]).where(eq(TABLE[kind].id, id));
  return t ? { t, no: t[NO[kind][3]], requester: kind === "request" ? t.requestedBy : kind === "change" ? t.requestedBy : t.reportedBy || null } : null;
}

/** In-app bell notifications. Never throws. */
export async function inApp(userIds: (number | null | undefined)[], title: string, message: string, type: "info" | "warning" | "error" | "success", link: string) {
  try { for (const id of [...new Set(userIds.filter(Boolean))]) await db.execute(sql`INSERT INTO notifications (user_id, title, message, type, link) VALUES (${id}, ${title}, ${message}, ${type}, ${link})`); }
  catch (e) { console.error("inApp notification failed", e); }
}

async function emailNextApprovers(kind: Kind, ticketId: number) {
  try {
    const { sendDirect, notify, htmlTable } = await import("../lib/mailer");
    const st = await approvalState(kind, ticketId);
    if (!st.next) return;
    const b = await ticketBrief(kind, ticketId); if (!b) return;
    const { base, delegates } = await approversWithDelegates(st.next);
    const people = [...base, ...delegates];
    await inApp(people.map(p => p.id), `Approval needed: ${b.no}`, `${b.t.title} — ${st.next.approverLevel} ${st.next.approverRole}`, "warning", "/itsm-my-approvals");
    const html = `<p>A ${TYPE_NAME[kind].toLowerCase()} is waiting for your approval (${st.next.approverLevel} — ${st.next.approverRole}).</p>${htmlTable([["Ticket", b.no], ["Title", b.t.title], ["Priority", b.t.priority || b.t.riskLevel || "—"], ["Raised by", b.requester || b.t.createdBy || "—"], ["Raised on", fmtDateTime(b.t.createdAt)], ["Level", `${st.next.approverLevel} of ${st.rows.length}`]])}<p>Approve or reject it in <b>IT Hub › ITSM › My Approvals</b>${appUrl() ? ` (${appUrl()}/itsm-my-approvals)` : ""}.</p><p>Regards,</p>`;
    await sendDirect("itsm_approval_request", people.map(p => p.email).filter(Boolean) as string[], `Approval needed: ${b.no} — ${b.t.title}`, html);
    void notify("itsm_approvals", { subject: `Approval requested: ${b.no} (${st.next.approverLevel} ${st.next.approverRole})`, html });
  } catch (e) { console.error("emailNextApprovers failed", e); }
}

async function emailDecision(kind: Kind, ticketId: number, outcome: string, by: string, notes: string | null) {
  try {
    const { sendDirect, notify, htmlTable } = await import("../lib/mailer");
    const b = await ticketBrief(kind, ticketId); if (!b) return;
    const to = [emailOf(b.t.createdBy)].filter(Boolean) as string[];
    if (b.requester) { const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(sql`lower(${usersTable.name}) = lower(${b.requester})`); if (u?.email) to.push(u.email); }
    const html = `<p>Your ${TYPE_NAME[kind].toLowerCase()} <b>${b.no}</b> was <b>${outcome.toLowerCase()}</b>.</p>${htmlTable([["Title", b.t.title], ["Decision", outcome], ["Last decision by", by], ["Notes", notes || "—"]])}<p>${outcome === "Approved" ? "Work on it can now start." : "It will not proceed. Raise a new request if needed."}</p><p>Regards,</p>`;
    await sendDirect("itsm_approval_decision", [...new Set(to)], `${b.no} ${outcome.toLowerCase()} — ${b.t.title}`, html);
    await inApp([b.t.requesterUserId], `${b.no} ${outcome.toLowerCase()}`, `${b.t.title} — by ${by}${notes ? `: ${notes}` : ""}`, outcome === "Approved" ? "success" : "error", PAGE_OF[kind]);
    void notify("itsm_approvals", { subject: `${b.no} ${outcome.toLowerCase()}`, html });
  } catch (e) { console.error("emailDecision failed", e); }
}

async function approvalState(kind: string, ticketId: number) {
  const rows = await db.select().from(itsmApprovalsTable).where(and(eq(itsmApprovalsTable.ticketId, ticketId), eq(itsmApprovalsTable.ticketType, TYPE_NAME[kind])));
  const sorted = rows.sort((a, b) => a.approverLevel.localeCompare(b.approverLevel, undefined, { numeric: true }) || a.id - b.id);
  const rejected = sorted.find(r => r.status === "Rejected");
  const pending = sorted.filter(r => r.status === "Pending");
  return { rows: sorted, rejected, pending, next: pending[0] || null, state: !rows.length ? "None" : rejected ? "Rejected" : pending.length ? "Pending" : "Approved" };
}

/** Block work that needs approval first. */
async function assertApproved(kind: string, ticketId: number, toStatus: string) {
  const gated: Record<string, string[]> = { request: ["In Progress", "Completed"], problem: ["Resolved", "Closed"], change: ["Scheduled", "In Progress", "Completed"], incident: [] };
  if (!gated[kind].includes(toStatus)) return;
  const a = await approvalState(kind, ticketId);
  if (a.state === "Pending") throw new Bad(`Waiting for approval by ${a.next!.approverLevel} ${a.next!.approverRole} — cannot move to ${toStatus} yet`);
  if (a.state === "Rejected") throw new Bad(`Rejected at ${a.rejected!.approverLevel} (${a.rejected!.approverRole}) — cannot move to ${toStatus}`);
}

/* ─── generic ticket handlers ────────────────────────────────────────────── */

type Kind = "incident" | "problem" | "change" | "request";
const TABLE: Record<Kind, any> = { incident: itsmIncidentsTable, problem: itsmProblemsTable, change: itsmChangesTable, request: itsmServiceRequestsTable };
const NO: Record<Kind, [string, string, string, string]> = {
  incident: ["itsm_incidents", "ticket_no", "INC", "ticketNo"], problem: ["itsm_problems", "problem_no", "PRB", "problemNo"],
  change: ["itsm_changes", "change_no", "CHG", "changeNo"], request: ["itsm_service_requests", "request_no", "SR", "requestNo"],
};
const ENTITY: Record<Kind, string> = { incident: "itsm_incident", problem: "itsm_problem", change: "itsm_change", request: "itsm_service_request" };

async function createTicket(kind: Kind, req: Request, res: Response) {
  const who = await actor(req);
  const body: any = parse(SCHEMAS[kind].create, clean(req.body, ["status", "onBehalfOfUserId", "teamId"]));
  const createdAt = new Date();
  const values: any = { ...body, createdBy: who.label, updatedBy: who.label, createdAt, updatedAt: createdAt };
  let notifyAssignee: string | null = null;
  if (ROUTED.includes(kind)) {
    // Category / sub-category decide the team and the expected closure date (T+n business days)
    const rt = await route(kind, body.category, body.subcategory, createdAt);
    const a = await getAccess(req);
    const myTeams = await teamIdsOf(who.userId);
    let requester = { id: who.userId, name: who.name, email: who.email };
    const onBehalf = Number(req.body?.onBehalfOfUserId) || null;
    if (onBehalf && onBehalf !== who.userId) {
      if (!a?.isAdmin && !myTeams.length) throw new Forbidden("Only service desk team members can raise a ticket on behalf of someone else");
      const [u] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(and(eq(usersTable.id, onBehalf), eq(usersTable.isActive, true)));
      if (!u) throw new Bad("The person you are raising this for is not an active user");
      requester = u;
    }
    Object.assign(values, { category: rt.category, subcategory: rt.subcategory, teamId: rt.team.id, assignedGroup: rt.team.name, expectedClosureDate: rt.expectedClosureDate, requesterUserId: requester.id });
    if (kind === "request") values.requestedBy = requester.name; else { values.reportedBy = requester.name; values.reporterEmail = requester.email; }
    if (s(body.assignedTo)) {
      if (!a?.isAdmin && !myTeams.includes(rt.team.id)) throw new Forbidden(`Only members of ${rt.team.name} can assign this ticket to a person`);
      const u = await userByName(String(body.assignedTo));
      if (!u || !await isMember(u.id, rt.team.id)) throw new Bad(`${body.assignedTo} is not a member of ${rt.team.name}`);
      values.assignedTo = u.name; values.firstResponseAt = createdAt; notifyAssignee = u.email;
    } else values.assignedTo = null;
  } else if (body.assignedTo !== undefined || body.assignedGroup !== undefined) await validateAssignment(body.assignedTo, body.assignedGroup);
  if (kind === "incident") { values.status = "Open"; values.reportedBy ||= who.name; }
  if (kind === "request") { values.status = "Open"; values.requestedBy ||= who.name; }
  if (SLA_KINDS.includes(kind)) Object.assign(values, slaColumns(kind, values, await slaConfig()));
  if (kind === "problem") values.status = "Open";
  if (kind === "change") { values.status = "Draft"; values.approvalStatus = "Pending"; values.requestedBy ||= who.name; }
  const [tbl, col, prefix, key] = NO[kind];
  const item: any = await db.transaction(async tx => {
    values[key] = await nextNo(tx, tbl, col, prefix);
    const [row] = await tx.insert(TABLE[kind]).values(values).returning();
    await history(kind, row.id, who.label, `${TYPE_NAME[kind]} raised by ${who.name}${row.assignedGroup || row.assignedTo ? ` — assigned to ${[row.assignedTo, row.assignedGroup].filter(Boolean).join(" / ")}` : ""}`, null, row.status, tx);
    return row;
  });
  const pending = await createApprovalRecords(kind, item.id, item, who.label);
  let out = item;
  if (pending > 0 && (kind === "change" || kind === "request")) {
    [out] = await db.update(TABLE[kind]).set({ status: "Pending Approval", ...(SLA_KINDS.includes(kind) ? pauseColumns(kind, item, "Pending Approval", await slaConfig(), new Date(item.createdAt)) : {}) }).where(eq(TABLE[kind].id, item.id)).returning();
  } else if (pending === 0 && kind === "change") {
    [out] = await db.update(itsmChangesTable).set({ approvalStatus: "Approved", approvedBy: "No approval required" }).where(eq(itsmChangesTable.id, item.id)).returning();
  }
  if (kind === "incident" && item.priority === "Critical" && item.severity === "S1") {
    [out] = await db.update(itsmIncidentsTable).set({ status: "Escalated" }).where(eq(itsmIncidentsTable.id, item.id)).returning();
    await history(kind, item.id, "System", "Auto-escalated: Critical / S1 incident needs immediate attention", "Open", "Escalated");
  }
  await audit({ entityType: ENTITY[kind], entityId: item.id, action: "create", performedBy: who.label, summary: `Created ${TYPE_NAME[kind]} ${item[key]}: ${item.title}${item.assignedGroup ? ` → ${item.assignedGroup}` : ""}`, newValues: out });
  if (ROUTED.includes(kind)) { void notifyTicket(kind, out, "created"); if (notifyAssignee) void notifyTicket(kind, out, "assigned"); }
  res.status(201).json((await withSla(kind, [out]))[0]);
}

const REOPEN_FROM: Record<Kind, string[]> = { incident: ["Resolved", "Closed"], problem: ["Resolved", "Closed"], change: ["Completed", "Closed", "Cancelled"], request: ["Completed", "Cancelled"] };

async function updateTicket(kind: Kind, req: Request, res: Response) {
  const id = parseInt(String(req.params.id));
  const [old]: any[] = await db.select().from(TABLE[kind]).where(and(eq(TABLE[kind].id, id), eq(TABLE[kind].isActive, true)));
  if (!old) return fail(res, 404, "Ticket not found");
  const who = await actor(req);
  const reopenReason = s(req.body?.reopenReason);
  const body: any = parse(SCHEMAS[kind].patch, clean(req.body, ["reopenReason", "updatedBy", "transferReason", "onBehalfOfUserId"]));
  const transferReason = s(req.body?.transferReason);
  const extra: any = {};
  let events: ("assigned" | "transferred")[] = [];
  if (ROUTED.includes(kind)) {
    const a = await getAccess(req);
    const member = await isMember(who.userId, old.teamId);
    const isRequester = old.requesterUserId === who.userId || old.createdBy === who.label;
    const OPS = ["status", "assignedTo", "assignedGroup", "teamId", "priority", "severity", "resolutionNotes", "fulfillmentNotes", "category", "subcategory", "problemId", "urgency", "impactLevel", "source"];
    const touched = OPS.filter(k => body[k] !== undefined && String(body[k] ?? "") !== String(old[k] ?? ""));
    if (!a?.isAdmin && !member) {
      const cancelOwn = kind === "request" && isRequester && touched.length === 1 && touched[0] === "status" && body.status === "Cancelled" && !DONE.request.includes(old.status);
      if (touched.length && !cancelOwn) throw new Forbidden(`Only members of ${old.assignedGroup || "the assigned team"} can change ${touched.join(", ")}${isRequester && kind === "request" ? " (you can cancel your own request)" : ""}`);
      if (!isRequester) throw new Forbidden(`Only the requester or members of ${old.assignedGroup || "the assigned team"} can edit this ticket`);
      if (!["Open", "Pending Approval"].includes(old.status) && !touched.length) throw new Forbidden("The request is already being worked on — add details through the assigned team");
    }
    // Category change re-routes the ticket
    let newTeamId: number | null = body.teamId ? Number(body.teamId) : null;
    if (!newTeamId && body.assignedGroup !== undefined && (body.assignedGroup || null) !== (old.assignedGroup || null)) {
      const t = await teamByName(body.assignedGroup); if (!t) throw new Bad(`"${body.assignedGroup}" is not an active team`); newTeamId = t.id;
    }
    if ((body.category !== undefined && body.category !== old.category) || (body.subcategory !== undefined && (body.subcategory || null) !== (old.subcategory || null))) {
      const rt = await route(kind, body.category ?? old.category, body.subcategory !== undefined ? body.subcategory : old.subcategory, new Date(old.createdAt));
      body.category = rt.category; body.subcategory = rt.subcategory;
      if (!newTeamId && rt.team.id !== old.teamId) newTeamId = rt.team.id;
    }
    delete body.teamId; delete body.assignedGroup;
    let teamId = old.teamId;
    if (newTeamId && newTeamId !== old.teamId) {
      const t = await teamById(newTeamId); if (!t || !t.isActive) throw new Bad("Choose an active team");
      if (!transferReason || transferReason.length < 5) throw new Bad(`Give a reason for passing the ticket to ${t.name} (transferReason)`);
      extra.teamId = t.id; extra.assignedGroup = t.name; teamId = t.id; events.push("transferred");
      if (old.assignedTo && body.assignedTo === undefined) { const u = await userByName(old.assignedTo); if (!u || !await isMember(u.id, t.id)) extra.assignedTo = null; }
    }
    if (body.assignedTo !== undefined && (body.assignedTo || null) !== (old.assignedTo || null)) {
      if (body.assignedTo) {
        const u = await userByName(String(body.assignedTo));
        if (!u || !await isMember(u.id, teamId)) throw new Bad(`${body.assignedTo} is not a member of ${extra.assignedGroup || old.assignedGroup || "the team"}`);
        body.assignedTo = u.name; events.push("assigned");
      } else body.assignedTo = null;
    }
    if (!old.firstResponseAt && (a?.isAdmin || member) && (events.includes("assigned") || (body.status && body.status !== old.status && body.status !== "Cancelled"))) extra.firstResponseAt = new Date();
  } else {
    const newWho = body.assignedTo !== undefined && (body.assignedTo || null) !== (old.assignedTo || null) ? body.assignedTo : null;
    const newTeam = body.assignedGroup !== undefined && (body.assignedGroup || null) !== (old.assignedGroup || null) ? body.assignedGroup : null;
    if (newWho || newTeam) await validateAssignment(newWho, newTeam);
  }
  const to = body.status ?? old.status;
  if (to !== old.status) {
    if (REOPEN_FROM[kind].includes(old.status) && !DONE[kind].includes(to)) {
      if (!reopenReason || reopenReason.length < 5) throw new Bad(`${old.status} ticket — give a reason to reopen it (reopenReason)`);
    }
    if (kind === "incident" && to === "Resolved" && !s(body.resolutionNotes ?? old.resolutionNotes)) throw new Bad("Resolution notes are required to resolve an incident");
    if (kind === "request" && to === "Completed" && !s(body.fulfillmentNotes ?? old.fulfillmentNotes)) throw new Bad("Fulfilment notes are required to complete a request");
    if (kind === "change" && ["Scheduled", "In Progress", "Completed"].includes(to) && old.approvalStatus !== "Approved") throw new Bad("Change request must be approved before it is scheduled or implemented");
    await assertApproved(kind, id, to);
  }
  const updates: any = { ...body, ...extra, updatedBy: who.label, updatedAt: new Date() };
  if (kind === "incident" && to === "Resolved" && old.status !== "Resolved") updates.resolvedAt = new Date();
  if (kind === "incident" && to === "Closed" && !old.closedAt) updates.closedAt = new Date();
  if (kind === "request" && to === "Completed" && !old.completedAt) updates.completedAt = new Date();
  if (REOPEN_FROM[kind].includes(old.status) && !DONE[kind].includes(to)) { if (kind === "incident") { updates.resolvedAt = null; updates.closedAt = null; } if (kind === "request") updates.completedAt = null; }
  if (kind === "incident" && body.kbArticleId !== undefined && body.kbArticleId !== null) {
    const [kb] = await db.select({ id: itsmKnowledgeBaseTable.id }).from(itsmKnowledgeBaseTable).where(and(eq(itsmKnowledgeBaseTable.id, Number(body.kbArticleId)), eq(itsmKnowledgeBaseTable.isActive, true)));
    if (!kb) throw new Bad("The knowledge base article was not found"); updates.kbArticleId = kb.id;
  }
  if (SLA_KINDS.includes(kind)) {
    const cfg = await slaConfig();
    if (to !== old.status) Object.assign(updates, pauseColumns(kind, old, to, cfg));
    if (to !== old.status || (body.priority && body.priority !== old.priority)) Object.assign(updates, slaColumns(kind, { ...old, ...updates }, cfg));
    if (body.priority && body.priority !== old.priority) Object.assign(updates, { slaWarnSentAt: null, slaBreachSentAt: null, responseBreachSentAt: null });
  }
  const [item]: any[] = await db.update(TABLE[kind]).set(updates).where(eq(TABLE[kind].id, id)).returning();
  // History: status, assignment, team, priority
  if (old.status !== item.status) await history(kind, id, who.label, reopenReason && REOPEN_FROM[kind].includes(old.status) ? `Reopened: ${reopenReason}` : (body.resolutionNotes && item.status === "Resolved" ? `Resolved: ${body.resolutionNotes}` : `Status changed to ${item.status}`), old.status, item.status);
  if ((old.assignedGroup || null) !== (item.assignedGroup || null)) await history(kind, id, who.label, `Passed to team ${item.assignedGroup || "(none)"} from ${old.assignedGroup || "(none)"}${s(req.body?.transferReason) ? ` — ${s(req.body.transferReason)}` : ""}`);
  if ((old.assignedTo || null) !== (item.assignedTo || null)) await history(kind, id, who.label, item.assignedTo ? `Assigned to ${item.assignedTo}${old.assignedTo ? ` (was ${old.assignedTo})` : ""}` : `Unassigned (was ${old.assignedTo})`);
  if (old.priority && item.priority && old.priority !== item.priority) await history(kind, id, who.label, `Priority ${old.priority} → ${item.priority}`);
  for (const ev of events) void notifyTicket(kind, item, ev, transferReason);
  const changed = [...Object.keys(body), ...Object.keys(extra)].filter(k => String(old[k] ?? "") !== String(item[k] ?? ""));
  if (changed.length) await audit({ entityType: ENTITY[kind], entityId: id, action: "update", performedBy: who.label, summary: `Updated ${old[NO[kind][3]]}: ${changed.join(", ")}`, newValues: { changed: Object.fromEntries(changed.map(k => [k, { from: old[k], to: item[k] }])) } });
  res.json((await withSla(kind, [item]))[0]);
}

async function deleteTicket(kind: Kind, req: Request, res: Response) {
  if (!await allowed(req, kind, "admin")) return fail(res, 403, "Deleting a ticket needs Full access to the module");
  const reason = s(req.body?.reason) || s(req.query.reason);
  if (!reason || reason.length < 5) return fail(res, 400, "Give a reason for deleting (at least 5 characters)");
  const id = parseInt(String(req.params.id));
  const who = await actor(req);
  const [row]: any[] = await db.update(TABLE[kind]).set({ isActive: false, updatedBy: who.label, updatedAt: new Date() }).where(and(eq(TABLE[kind].id, id), eq(TABLE[kind].isActive, true))).returning();
  if (!row) return fail(res, 404, "Ticket not found");
  await history(kind, id, who.label, `Deleted: ${reason}`, row.status, "Deleted");
  await audit({ entityType: ENTITY[kind], entityId: id, action: "delete", performedBy: who.label, summary: `Deleted ${row[NO[kind][3]]} (${row.title}): ${reason}` });
  res.status(204).end();
}

async function bulkUpdate(kind: Kind, req: Request, res: Response) {
  const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
  if (!ids.length) return fail(res, 400, "Select at least one ticket");
  const results: { id: number; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    const fake: any = { ...req, params: { id: String(id) }, body: { ...(req.body.status ? { status: req.body.status } : {}), ...(req.body.assignedTo !== undefined ? { assignedTo: req.body.assignedTo } : {}), ...(req.body.assignedGroup !== undefined ? { assignedGroup: req.body.assignedGroup } : {}), ...(req.body.resolutionNotes ? { resolutionNotes: req.body.resolutionNotes } : {}), ...(req.body.reopenReason ? { reopenReason: req.body.reopenReason } : {}) } };
    const sink: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(_b: any) { return this; }, end() { return this; }, headersSent: false };
    try { await updateTicket(kind, fake, sink); results.push({ id, ok: sink.statusCode < 400 }); }
    catch (e: any) { results.push({ id, ok: false, error: e.message }); }
  }
  const failed = results.filter(r => !r.ok);
  res.json({ updated: results.length - failed.length, failed });
}

/** Assignee must be an active person in User Master; team must be one of the configured IT groups. */
async function validateAssignment(assignedTo: unknown, assignedGroup: unknown) {
  const who = s(assignedTo), team = s(assignedGroup);
  if (team && !await teamByName(team)) throw new Bad(`Team "${team}" is not an active ITSM team (ITSM Setup › Teams)`);
  if (who) {
    const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(and(sql`(lower(${usersTable.name}) = lower(${who}) OR lower(${usersTable.email}) = lower(${who}))`, eq(usersTable.isActive, true)));
    if (!u) throw new Bad(`Assignee "${who}" is not an active user in User Master`);
  }
}

const ROUTED: Kind[] = ["incident", "request"];

/** Who sees which tickets: admins, Full-access holders and team members see all; everyone else sees what they raised. */
async function visibleRows(req: Request, kind: Kind, rows: any[]) {
  const a = await getAccess(req); if (!a) return [];
  const me = await actor(req);
  const myTeams = await teamIdsOf(a.userId);
  const seeAll = a.isAdmin || a.perms[MODULE_OF[kind]] === "admin" || myTeams.length > 0;
  const mine = (r: any) => r.requesterUserId === a.userId || r.createdBy === me.label;
  let out = seeAll ? rows : rows.filter(mine);
  const view = String(req.query.view || "");
  if (view === "mine") out = out.filter(mine);
  if (view === "assigned") out = out.filter(r => (r.assignedTo || "").toLowerCase() === me.name.toLowerCase());
  if (view === "team") out = out.filter(r => r.teamId && myTeams.includes(r.teamId));
  return out;
}

/** Emails for routed tickets: new ticket → team; assignment → assignee; transfer → new team. Never throws. */
async function notifyTicket(kind: Kind, t: any, event: "created" | "assigned" | "transferred", reason?: string | null) {
  try {
    const { sendDirect, notify, htmlTable } = await import("../lib/mailer");
    const no = t[NO[kind][3]], type = TYPE_NAME[kind];
    const rows: [string, unknown][] = [["Ticket", no], ["Title", t.title], ["Category", [t.category, t.subcategory].filter(Boolean).join(" › ")], ["Priority", t.priority], ["Raised by", t.requestedBy || t.reportedBy || t.createdBy], ["Team", t.assignedGroup], ["Assigned to", t.assignedTo || "—"], ["Expected closure", t.expectedClosureDate || "—"]];
    let to: string[] = [], subject = "", intro = "";
    if (event === "assigned") { const u = t.assignedTo ? await userByName(t.assignedTo) : null; to = u?.email ? [u.email] : []; subject = `${no} assigned to you — ${t.title}`; intro = `${type} <b>${no}</b> has been assigned to you.`; }
    else { to = t.teamId ? await emailsOfTeam(t.teamId) : []; subject = event === "created" ? `New ${type.toLowerCase()} ${no} in ${t.assignedGroup} queue — ${t.title}` : `${no} passed to ${t.assignedGroup} — ${t.title}`; intro = event === "created" ? `A new ${type.toLowerCase()} is in the <b>${t.assignedGroup}</b> queue.` : `${type} <b>${no}</b> was passed to <b>${t.assignedGroup}</b>${reason ? `: ${reason}` : ""}.`; }
    const html = `<p>${intro}</p>${htmlTable(rows)}<p>Open it in IT Hub › ITSM.</p><p>Regards,</p>`;
    await sendDirect("itsm_assignment", to, subject, html);
    if (event !== "assigned") void notify("itsm_tickets", { subject, html });
  } catch (e) { console.error("notifyTicket failed", e); }
}

/* ─── PEOPLE (assignee / reporter pickers) ───────────────────────────────── */
router.get("/itsm-people", wrap(async (req, res) => {
  const a = await getAccess(req);
  if (!a || !(a.isAdmin || Object.entries(a.perms).some(([m, l]) => m.startsWith("itsm_") && l !== "none"))) return fail(res, 403, "No ITSM access");
  res.json(await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, employeeCode: usersTable.employeeCode, department: usersTable.department, userType: usersTable.userType })
    .from(usersTable).where(eq(usersTable.isActive, true)).orderBy(usersTable.name));
}));

/* ─── INCIDENTS ──────────────────────────────────────────────────────────── */
router.get("/incidents", wrap(async (req, res) => {
  const problemId = req.query.problemId ? parseInt(req.query.problemId as string) : null;
  let rows = await db.select().from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).orderBy(desc(itsmIncidentsTable.createdAt));
  if (problemId) rows = rows.filter(r => r.problemId === problemId);
  rows = await visibleRows(req, "incident", rows);
  res.json(await withSla("incident", rows));
}));
router.get("/incidents/stats", cachedGet("/incidents/stats", async () => {
  const where = eq(itsmIncidentsTable.isActive, true);
  const total = await db.select({ count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(where);
  const byStatus = await db.select({ status: itsmIncidentsTable.status, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(where).groupBy(itsmIncidentsTable.status);
  const byPriority = await db.select({ priority: itsmIncidentsTable.priority, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(where).groupBy(itsmIncidentsTable.priority);
  const bySeverity = await db.select({ severity: itsmIncidentsTable.severity, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(where).groupBy(itsmIncidentsTable.severity);
  const byCategory = await db.select({ category: itsmIncidentsTable.category, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(where).groupBy(itsmIncidentsTable.category);
  return { total: total[0]?.count || 0, byStatus, byPriority, bySeverity, byCategory, slaBreached: await computeSlaBreachCount() };
}));
router.post("/incidents/bulk-update", wrap((req, res) => bulkUpdate("incident", req, res)));
router.post("/incidents", wrap((req, res) => createTicket("incident", req, res)));
router.patch("/incidents/:id", wrap((req, res) => updateTicket("incident", req, res)));
router.delete("/incidents/:id", wrap((req, res) => deleteTicket("incident", req, res)));

/* ─── PROBLEMS ───────────────────────────────────────────────────────────── */
router.get("/problems", cachedGet("/problems", () => db.select().from(itsmProblemsTable).where(eq(itsmProblemsTable.isActive, true)).orderBy(desc(itsmProblemsTable.createdAt))));
router.post("/problems/bulk-update", wrap((req, res) => bulkUpdate("problem", req, res)));
router.post("/problems", wrap((req, res) => createTicket("problem", req, res)));
router.patch("/problems/:id", wrap((req, res) => updateTicket("problem", req, res)));
router.delete("/problems/:id", wrap((req, res) => deleteTicket("problem", req, res)));

/* ─── CHANGES ────────────────────────────────────────────────────────────── */
router.get("/changes", cachedGet("/changes", () => db.select().from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true)).orderBy(desc(itsmChangesTable.createdAt))));
router.get("/changes/stats", cachedGet("/changes/stats", async () => {
  const where = eq(itsmChangesTable.isActive, true);
  const total = await db.select({ count: sql<number>`count(*)::int` }).from(itsmChangesTable).where(where);
  const byStatus = await db.select({ status: itsmChangesTable.status, count: sql<number>`count(*)::int` }).from(itsmChangesTable).where(where).groupBy(itsmChangesTable.status);
  const byType = await db.select({ type: itsmChangesTable.type, count: sql<number>`count(*)::int` }).from(itsmChangesTable).where(where).groupBy(itsmChangesTable.type);
  return { total: total[0]?.count || 0, byStatus, byType };
}));
router.post("/changes/bulk-update", wrap((req, res) => bulkUpdate("change", req, res)));
router.post("/changes", wrap((req, res) => createTicket("change", req, res)));
router.patch("/changes/:id", wrap((req, res) => updateTicket("change", req, res)));
router.delete("/changes/:id", wrap((req, res) => deleteTicket("change", req, res)));

/* ─── SERVICE REQUESTS ───────────────────────────────────────────────────── */
router.get("/service-requests", wrap(async (req, res) => {
  const rows = await db.select().from(itsmServiceRequestsTable).where(eq(itsmServiceRequestsTable.isActive, true)).orderBy(desc(itsmServiceRequestsTable.createdAt));
  res.json(await withSla("request", await visibleRows(req, "request", rows)));
}));
router.post("/service-requests/bulk-update", wrap((req, res) => bulkUpdate("request", req, res)));
router.post("/service-requests", wrap((req, res) => createTicket("request", req, res)));
router.patch("/service-requests/:id", wrap((req, res) => updateTicket("request", req, res)));
router.delete("/service-requests/:id", wrap((req, res) => deleteTicket("request", req, res)));

/* ─── SLA POLICIES ───────────────────────────────────────────────────────── */
const slaSchema = z.object({
  name: z.string({ required_error: "Name is required" }).trim().min(2, "Name is required"),
  ticketType: z.enum(["Incident", "Service Request", "Problem"]).default("Incident"),
  priority: prio,
  responseTimeHours: z.coerce.number().int("Response time must be whole hours").positive("Response time must be more than 0"),
  resolutionTimeHours: z.coerce.number().int("Resolution time must be whole hours").positive("Resolution time must be more than 0"),
  slaType: z.enum(["24x7", "Business Hours"], { errorMap: () => ({ message: "SLA type must be 24x7 or Business Hours" }) }).default("24x7"),
}).passthrough().refine(v => v.resolutionTimeHours >= v.responseTimeHours, { message: "Resolution time cannot be shorter than response time" });
router.get("/sla-policies", cachedGet("/sla-policies", () => db.select().from(itsmSlaPoliciesTable).where(eq(itsmSlaPoliciesTable.isActive, true)).orderBy(itsmSlaPoliciesTable.priority)));
router.post("/sla-policies", wrap(async (req, res) => {
  const v: any = parse(slaSchema, clean(req.body));
  const [dup] = await db.select({ id: itsmSlaPoliciesTable.id }).from(itsmSlaPoliciesTable).where(and(eq(itsmSlaPoliciesTable.isActive, true), eq(itsmSlaPoliciesTable.ticketType, v.ticketType), eq(itsmSlaPoliciesTable.priority, v.priority)));
  if (dup) throw new Bad(`An active ${v.ticketType} SLA for ${v.priority} priority already exists — edit it instead`);
  const who = await actor(req);
  const [item] = await db.insert(itsmSlaPoliciesTable).values({ ...v, businessHours: v.slaType === "Business Hours" }).returning(); clearSlaCache();
  await audit({ entityType: "itsm_sla_policy", entityId: item.id, action: "create", performedBy: who.label, summary: `SLA ${item.name}: ${item.ticketType} ${item.priority} — respond ${item.responseTimeHours}h, resolve ${item.resolutionTimeHours}h` });
  res.status(201).json(item);
}));
router.patch("/sla-policies/:id", wrap(async (req, res) => {
  const id = parseInt(String(req.params.id));
  const [old] = await db.select().from(itsmSlaPoliciesTable).where(eq(itsmSlaPoliciesTable.id, id));
  if (!old) return fail(res, 404, "SLA policy not found");
  const v: any = parse(slaSchema, { ...old, ...clean(req.body) });
  const who = await actor(req);
  const [item] = await db.update(itsmSlaPoliciesTable).set({ ...clean(req.body), responseTimeHours: v.responseTimeHours, resolutionTimeHours: v.resolutionTimeHours, slaType: v.slaType, businessHours: v.slaType === "Business Hours", updatedAt: new Date() }).where(eq(itsmSlaPoliciesTable.id, id)).returning(); clearSlaCache();
  await audit({ entityType: "itsm_sla_policy", entityId: id, action: "update", performedBy: who.label, summary: `SLA ${item.name} updated — respond ${item.responseTimeHours}h, resolve ${item.resolutionTimeHours}h` });
  res.json(item);
}));
router.delete("/sla-policies/:id", wrap(async (req, res) => {
  const who = await actor(req);
  const [row] = await db.update(itsmSlaPoliciesTable).set({ isActive: false }).where(eq(itsmSlaPoliciesTable.id, parseInt(String(req.params.id)))).returning(); clearSlaCache();
  if (row) await audit({ entityType: "itsm_sla_policy", entityId: row.id, action: "delete", performedBy: who.label, summary: `SLA ${row.name} removed` });
  res.status(204).end();
}));

/* ─── TICKET HISTORY ─────────────────────────────────────────────────────── */
router.get("/ticket-history", wrap(async (req, res) => {
  const ticketId = req.query.ticketId ? parseInt(req.query.ticketId as string) : null;
  const ticketType = (req.query.ticketType as string) || null;
  const kind = Object.entries(HISTORY_TYPE).find(([, v]) => v === ticketType)?.[0];
  if (kind && !await allowed(req, kind, "read")) return fail(res, 403, "No access to these tickets");
  const items = ticketId && ticketType
    ? await db.select().from(itsmTicketHistoryTable).where(and(eq(itsmTicketHistoryTable.ticketId, ticketId), eq(itsmTicketHistoryTable.ticketType, ticketType))).orderBy(desc(itsmTicketHistoryTable.createdAt), desc(itsmTicketHistoryTable.id))
    : (await getAccess(req))?.isAdmin ? await db.select().from(itsmTicketHistoryTable).orderBy(desc(itsmTicketHistoryTable.createdAt)).limit(100) : [];
  res.json(items);
}));

/* ─── KNOWLEDGE BASE ─────────────────────────────────────────────────────── */
const kbSchema = z.object({ title, content: z.string({ required_error: "Content is required" }).trim().min(10, "Content must be at least 10 characters") }).passthrough();
router.get("/knowledge-base", cachedGet("/knowledge-base", async () => {
  const rows = await db.select().from(itsmKnowledgeBaseTable).where(eq(itsmKnowledgeBaseTable.isActive, true)).orderBy(desc(itsmKnowledgeBaseTable.createdAt));
  const used = rowsOf(await db.execute(sql`SELECT kb_article_id AS id, count(*)::int AS n, string_agg(ticket_no, ', ' ORDER BY id DESC) AS nos FROM itsm_incidents WHERE is_active AND kb_article_id IS NOT NULL GROUP BY kb_article_id`));
  return rows.map(r => { const u = used.find(x => x.id === r.id); return { ...r, usedIn: u?.n || 0, usedInTickets: u?.nos ? String(u.nos).split(", ").slice(0, 10) : [] }; });
}));
router.post("/knowledge-base", wrap(async (req, res) => {
  const v: any = parse(kbSchema, clean(req.body));
  const who = await actor(req);
  const [item] = await db.insert(itsmKnowledgeBaseTable).values({ ...v, authorName: who.name, createdBy: who.label, updatedBy: who.label }).returning();
  await audit({ entityType: "itsm_kb", entityId: item.id, action: "create", performedBy: who.label, summary: `KB article published: ${item.title}` });
  res.status(201).json(item);
}));
router.patch("/knowledge-base/:id", wrap(async (req, res) => {
  const id = parseInt(String(req.params.id));
  const [old] = await db.select().from(itsmKnowledgeBaseTable).where(eq(itsmKnowledgeBaseTable.id, id));
  if (!old) return fail(res, 404, "Article not found");
  const body = clean(req.body);
  if (body.title !== undefined || body.content !== undefined) parse(kbSchema, { ...old, ...body });
  const who = await actor(req);
  const [item] = await db.update(itsmKnowledgeBaseTable).set({ ...body, updatedBy: who.label, updatedAt: new Date() }).where(eq(itsmKnowledgeBaseTable.id, id)).returning();
  await audit({ entityType: "itsm_kb", entityId: id, action: "update", performedBy: who.label, summary: `KB article updated: ${item.title}` });
  res.json(item);
}));
router.post("/knowledge-base/:id/view", wrap(async (req, res) => {
  await db.update(itsmKnowledgeBaseTable).set({ views: sql`${itsmKnowledgeBaseTable.views} + 1` }).where(eq(itsmKnowledgeBaseTable.id, parseInt(String(req.params.id))));
  res.json({ ok: true });
}));
router.delete("/knowledge-base/:id", wrap(async (req, res) => {
  const who = await actor(req);
  const [row] = await db.update(itsmKnowledgeBaseTable).set({ isActive: false, updatedBy: who.label }).where(eq(itsmKnowledgeBaseTable.id, parseInt(String(req.params.id)))).returning();
  if (row) await audit({ entityType: "itsm_kb", entityId: row.id, action: "delete", performedBy: who.label, summary: `KB article removed: ${row.title}` });
  res.status(204).end();
}));

router.get("/itsm-metrics", async (_req, res) => {
  const [incidents, problems, changes, slas] = await Promise.all([
    db.select().from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)),
    db.select().from(itsmProblemsTable).where(eq(itsmProblemsTable.isActive, true)),
    db.select().from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true)),
    db.select().from(itsmSlaPoliciesTable).where(eq(itsmSlaPoliciesTable.isActive, true)),
  ]);

  // MTTR — mean time to resolve (hours) for resolved/closed incidents
  const resolved = incidents.filter(i => i.resolvedAt && i.createdAt);
  const mttr = resolved.length > 0
    ? resolved.reduce((sum, i) => sum + (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()) / 3600000, 0) / resolved.length
    : null;

  // Aging buckets (open/in-progress incidents)
  const open = incidents.filter(i => i.status !== "Resolved" && i.status !== "Closed");
  const now = Date.now();
  const aging = { "0-3d": 0, "4-7d": 0, "8-14d": 0, "15-30d": 0, "30d+": 0 };
  for (const i of open) {
    const days = (now - new Date(i.createdAt).getTime()) / 86400000;
    if (days <= 3) aging["0-3d"]++;
    else if (days <= 7) aging["4-7d"]++;
    else if (days <= 14) aging["8-14d"]++;
    else if (days <= 30) aging["15-30d"]++;
    else aging["30d+"]++;
  }

  // SLA (lib/itsm-sla.ts): incidents + service requests that have a policy
  const requests = await db.select().from(itsmServiceRequestsTable).where(eq(itsmServiceRequestsTable.isActive, true));
  const cfg = await slaConfig(); const nowD = new Date();
  const all = [...incidents.map(t => ({ kind: "incident", no: t.ticketNo, t })), ...requests.map(t => ({ kind: "request", no: t.requestNo, t }))]
    .map(x => ({ ...x, sla: slaInfo(x.kind, x.t, cfg, nowD) })).filter(x => x.sla.state !== "None");
  const measured = all.filter(x => ["Met", "Breached"].includes(x.sla.state));
  const slaBreachedCount = measured.filter(x => x.sla.state === "Breached").length;
  const slaCompliance = measured.length ? Math.round(((measured.length - slaBreachedCount) / measured.length) * 100) : null;
  const respMeasured = all.filter(x => ["Met", "Breached"].includes(x.sla.responseState));
  const responseCompliance = respMeasured.length ? Math.round(respMeasured.filter(x => x.sla.responseState === "Met").length / respMeasured.length * 100) : null;
  const openSla = all.filter(x => !["Met", "Breached"].includes(x.sla.state) || (x.sla.state === "Breached" && !["Resolved", "Closed", "Completed", "Cancelled", "Rejected"].includes(x.t.status)));
  const byPriority = ["Critical", "High", "Medium", "Low"].map(p => {
    const m = measured.filter(x => x.t.priority === p); const met = m.filter(x => x.sla.state === "Met").length;
    return { priority: p, measured: m.length, met, compliance: m.length ? Math.round(met / m.length * 100) : null, open: openSla.filter(x => x.t.priority === p).length, breachedOpen: openSla.filter(x => x.t.priority === p && x.sla.state === "Breached").length };
  });
  const watch = openSla.filter(x => ["Breached", "At risk"].includes(x.sla.state)).sort((x, y) => (x.sla.minutesLeft ?? 0) - (y.sla.minutesLeft ?? 0)).slice(0, 15)
    .map(x => ({ kind: x.kind, id: x.t.id, ticketNo: x.no, title: x.t.title, priority: x.t.priority, assignedTo: x.t.assignedTo, team: x.t.assignedGroup, state: x.sla.state, dueAt: x.sla.dueAt, minutesLeft: x.sla.minutesLeft, usedPct: x.sla.usedPct }));

  res.json({ mttr: mttr ? Math.round(mttr * 10) / 10 : null, slaCompliance, slaMeasured: measured.length, slaBreached: slaBreachedCount, responseCompliance, responseMeasured: respMeasured.length,
    slaOpenBreached: openSla.filter(x => x.sla.state === "Breached").length, slaAtRisk: openSla.filter(x => x.sla.state === "At risk").length, slaPaused: openSla.filter(x => x.sla.state === "Paused").length,
    slaByPriority: byPriority, slaWatch: watch, slaPolicies: slas.length, aging, totalOpen: open.length, openProblems: problems.filter(p => p.status !== "Closed").length, pendingChanges: changes.filter(c => c.approvalStatus === "Pending").length,
    pendingApprovals: (await db.select({ c: sql<number>`count(*)::int` }).from(itsmApprovalsTable).where(eq(itsmApprovalsTable.status, "Pending")))[0]?.c ?? 0 });
});

router.get("/approval-matrix", async (req, res) => {
  const ticketType = req.query.ticketType as string || null;
  let items;
  if (ticketType) {
    items = await db.select().from(itsmApprovalMatrixTable).where(and(eq(itsmApprovalMatrixTable.isActive, true), eq(itsmApprovalMatrixTable.ticketType, ticketType))).orderBy(itsmApprovalMatrixTable.sequence);
  } else {
    items = await db.select().from(itsmApprovalMatrixTable).where(eq(itsmApprovalMatrixTable.isActive, true)).orderBy(itsmApprovalMatrixTable.ticketType, itsmApprovalMatrixTable.sequence);
  }
  res.json(items);
});

const matrixSchema = z.object({
  ticketType: z.enum(["Incident", "Problem", "Change Request", "Service Request"], { errorMap: () => ({ message: "Ticket type must be Incident, Problem, Change Request or Service Request" }) }),
  approverLevel: z.string().trim().regex(/^L\d+$/, "Level must be L1, L2, …"),
  condition: z.string().trim().regex(/^(All|(Priority|Severity|Type|Risk|Category):[^:]+)$/, "Condition must be All, Priority:…, Severity:…, Type:…, Risk:… or Category:…").default("All"),
  sequence: z.coerce.number().int().min(1).default(1),
  approverRoleId: z.coerce.number().int().positive().nullable().optional(),
  approverUserIds: z.array(z.coerce.number().int().positive()).optional().default([]),
}).passthrough().refine(v => !!v.approverRoleId || (v.approverUserIds && v.approverUserIds.length > 0), { message: "Choose who approves: an IT Hub role or named people" });

/** Resolve the approver link and a readable label ("Change Manager" role / "Named: A, B"). */
async function approverLink(v: any) {
  let label = "";
  if (v.approverRoleId) {
    const r = rowsOf(await db.execute(sql`SELECT name FROM roles WHERE id = ${v.approverRoleId}`))[0];
    if (!r) throw new Bad("That IT Hub role no longer exists");
    label = r.name;
  }
  const ids: number[] = [...new Set<number>(v.approverUserIds || [])];
  if (ids.length) {
    const us = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(and(inArray(usersTable.id, ids), eq(usersTable.isActive, true)));
    if (us.length !== ids.length) throw new Bad("One of the named approvers is not an active user");
    label = label ? `${label} + ${us.map(u => u.name).join(", ")}` : us.map(u => u.name).join(", ");
  }
  return { approverRoleId: v.approverRoleId || null, approverUserIds: ids, approverRole: label };
}

router.post("/approval-matrix", wrap(async (req, res) => {
  const v: any = parse(matrixSchema, clean(req.body));
  const link = await approverLink(v);
  const who = await actor(req);
  const [item] = await db.insert(itsmApprovalMatrixTable).values({ ticketType: v.ticketType, approverLevel: v.approverLevel, condition: v.condition, sequence: v.sequence, isActive: true, ...link }).returning();
  await audit({ entityType: "itsm_approval_rule", entityId: item.id, action: "create", performedBy: who.label, summary: `Approval rule ${item.ticketType} ${item.approverLevel}: ${item.approverRole} (${item.condition})` });
  res.status(201).json(item);
}));
router.patch("/approval-matrix/:id", wrap(async (req, res) => {
  const id = parseInt(String(req.params.id));
  const [old] = await db.select().from(itsmApprovalMatrixTable).where(eq(itsmApprovalMatrixTable.id, id));
  if (!old) return fail(res, 404, "Rule not found");
  const v: any = parse(matrixSchema, { ...old, ...clean(req.body) });
  const link = await approverLink(v);
  const who = await actor(req);
  const [item] = await db.update(itsmApprovalMatrixTable).set({ ticketType: v.ticketType, approverLevel: v.approverLevel, condition: v.condition, sequence: v.sequence, ...link }).where(eq(itsmApprovalMatrixTable.id, id)).returning();
  await audit({ entityType: "itsm_approval_rule", entityId: id, action: "update", performedBy: who.label, summary: `Approval rule ${item.ticketType} ${item.approverLevel}: ${item.approverRole} (${item.condition}) — applies to new tickets` });
  res.json(item);
}));
router.delete("/approval-matrix/:id", wrap(async (req, res) => {
  const who = await actor(req);
  const [row] = await db.update(itsmApprovalMatrixTable).set({ isActive: false }).where(eq(itsmApprovalMatrixTable.id, parseInt(String(req.params.id)))).returning();
  if (row) await audit({ entityType: "itsm_approval_rule", entityId: row.id, action: "delete", performedBy: who.label, summary: `Approval rule removed: ${row.ticketType} ${row.approverLevel} ${row.approverRole}` });
  res.status(204).end();
}));

const KIND_OF: Record<string, Kind> = { "Incident": "incident", "Problem": "problem", "Change Request": "change", "Service Request": "request" };

router.get("/approvals/:ticketType/:ticketId", wrap(async (req, res) => {
  const kind = KIND_OF[String(req.params.ticketType)];
  if (!kind) return fail(res, 400, "Unknown ticket type");
  if (!await allowed(req, kind, "read")) return fail(res, 403, "No access to these tickets");
  const a = await approvalState(kind, parseInt(String(req.params.ticketId)));
  const out = [];
  for (const r of a.rows) {
    const pp = r.status === "Pending" ? await approversWithDelegates(r) : { base: [], delegates: [] as any[] };
    const d = r.status === "Pending" && a.next?.id === r.id && !a.rejected ? await canDecide(req, r) : { ok: false, override: false, onBehalfOf: null };
    out.push({ ...r, isNext: a.next?.id === r.id, approvers: pp.base.map(p => p.name), covering: pp.delegates.map(p => `${p.name} (for ${p.forNames.join(", ")})`), canAct: d.ok, asOverride: d.override, asDelegateFor: d.onBehalfOf || null });
  }
  res.json(out);
}));

/** My Approvals inbox: steps that are next in line and that I can decide. */
async function myInbox(req: Request) {
  const a = await getAccess(req);
  if (!a) return [];
  const me = await actor(req);
  const pend = await db.select().from(itsmApprovalsTable).where(eq(itsmApprovalsTable.status, "Pending")).orderBy(itsmApprovalsTable.createdAt);
  const roleIds = new Set(rowsOf(await db.execute(sql`SELECT role_id FROM user_roles WHERE user_id = ${a.userId}`)).map(r => r.role_id));
  const fullOn = new Set(Object.entries(a.perms).filter(([, l]) => l === "admin").map(([m]) => m));
  const byTicket = new Map<string, typeof pend>();
  for (const p of pend) { const k = `${p.ticketType}|${p.ticketId}`; byTicket.set(k, [...(byTicket.get(k) || []), p]); }
  const coverFor = (await activeDelegations()).filter(x => x.delegateUserId === a.userId).map(x => x.userId);
  const out: any[] = [];
  for (const [, list] of byTicket) {
    const kind = KIND_OF[list[0].ticketType]; if (!kind) continue;
    const st = await approvalState(kind, list[0].ticketId);
    if (!st.next || st.rejected) continue;
    const n: any = st.next;
    const mine = (n.approverUserIds || []).includes(a.userId) || (n.approverRoleId && roleIds.has(n.approverRoleId)) || (!n.approverRoleId && !(n.approverUserIds || []).length && fullOn.has(MODULE_OF[n.ticketType]));
    let onBehalfOf: string | null = null;
    if (!mine && coverFor.length) { const base = await approversOf(n); const f = base.filter(u => coverFor.includes(u.id)); if (f.length) onBehalfOf = f.map(u => u.name).join(", "); }
    if (!mine && !onBehalfOf && !(a.isAdmin && req.query.all === "1")) continue;
    const b = await ticketBrief(kind, n.ticketId); if (!b || !b.t.isActive) continue;
    if (b.t.createdBy === me.label) continue; // you cannot approve what you raised
    out.push({ approvalId: n.id, ticketType: n.ticketType, kind, ticketId: n.ticketId, ticketNo: b.no, title: b.t.title, priority: b.t.priority || b.t.riskLevel || null, changeType: b.t.type || null,
      status: b.t.status, raisedBy: b.requester || b.t.createdBy, raisedAt: b.t.createdAt, level: n.approverLevel, role: n.approverRole, levelOf: `${st.rows.findIndex(r => r.id === n.id) + 1} of ${st.rows.length}`,
      waitingSince: n.requestedAt || n.createdAt, previous: st.rows.filter(r => r.status === "Approved").map(r => `${r.approverLevel} ${r.approverName}`), mine: !!mine || !!onBehalfOf, onBehalfOf,
      reminders: n.reminderCount || 0, escalated: !!n.escalatedAt, description: (b.t.description || "").slice(0, 300), category: [b.t.category, b.t.subcategory].filter(Boolean).join(" › ") || null, page: PAGE_OF[kind] });
  }
  return out.sort((x, y) => new Date(x.waitingSince).getTime() - new Date(y.waitingSince).getTime());
}
router.get("/my-approvals", wrap(async (req, res) => { res.json(await myInbox(req)); }));
router.get("/my-approvals/count", wrap(async (req, res) => { res.json({ count: (await myInbox(req)).length }); }));

/**
 * Approve / reject one level. Levels go in order (L1, L2…); a rejection ends the flow. Only the step's approvers
 * (named users or members of its IT Hub role) can decide; base-role Admin can override (recorded). When the last
 * level approves, the ticket is approved; requester and next approvers are emailed.
 */
/** Decide one step. Throws Bad / Forbidden; returns the updated step. Used by single and bulk actions. */
async function decideStep(req: Request, id: number, action: string, notes: string | null) {
  if (!["Approved", "Rejected"].includes(action)) throw new Bad("Action must be Approved or Rejected");
  if (action === "Rejected" && (!notes || notes.length < 5)) throw new Bad("Give the reason for rejecting (at least 5 characters)");
  const [ap] = await db.select().from(itsmApprovalsTable).where(eq(itsmApprovalsTable.id, id));
  if (!ap) throw new NotFound("Approval step not found");
  const kind = KIND_OF[ap.ticketType];
  const st = await approvalState(kind, ap.ticketId);
  if (ap.status !== "Pending") throw new Bad(`This level is already ${ap.status.toLowerCase()}`);
  if (st.rejected) throw new Bad(`Already rejected at ${st.rejected.approverLevel} — the approval flow has ended`);
  if (st.next && st.next.id !== ap.id) throw new Bad(`${st.next.approverLevel} (${st.next.approverRole}) must decide first`);
  const d = await canDecide(req, ap);
  if (!d.ok) throw new Forbidden(`Only the ${ap.approverLevel} approvers (${ap.approverRole}) can decide this step`);
  const who = await actor(req);
  const [t]: any[] = await db.select().from(TABLE[kind]).where(eq(TABLE[kind].id, ap.ticketId));
  if (!t || !t.isActive) throw new NotFound("Ticket not found");
  if (t.createdBy === who.label) throw new Forbidden("You raised this ticket — a different person must approve it");
  const tag = d.override ? "[Admin override] " : d.onBehalfOf ? `[On behalf of ${d.onBehalfOf}] ` : "";
  const [updated] = await db.update(itsmApprovalsTable).set({ status: action, notes: `${tag}${notes || ""}`.trim() || null, approverName: who.label, actedByUserId: who.userId, adminOverride: d.override, onBehalfOf: d.onBehalfOf || null, actionAt: new Date() })
    .where(and(eq(itsmApprovalsTable.id, id), eq(itsmApprovalsTable.status, "Pending"))).returning();
  if (!updated) throw new Bad("Someone else decided this step just now — refresh");
  await history(kind, ap.ticketId, who.label, `${ap.approverLevel} (${ap.approverRole}) ${action.toLowerCase()} by ${who.name}${d.override ? " — admin override" : d.onBehalfOf ? ` on behalf of ${d.onBehalfOf}` : ""}${notes ? `: ${notes}` : ""}`, "Pending", action);
  const after = await approvalState(kind, ap.ticketId);
  const no = t[NO[kind][3]];
  if (after.state === "Rejected" || after.state === "Approved") {
    const approvers = after.rows.filter(r => r.status === "Approved").map(r => `${r.approverLevel} ${(r.approverName || "").replace(/ <.*>$/, "")}`).join("; ");
    const set: any = { updatedBy: who.label, updatedAt: new Date() };
    if (kind === "change") { set.approvalStatus = after.state; set.approvedBy = after.state === "Approved" ? approvers : null; if (["Draft", "Open", "Pending Approval"].includes(t.status)) set.status = after.state; }
    if (kind === "request" && ["Open", "Pending Approval"].includes(t.status)) set.status = after.state;
    if ((kind === "problem" || kind === "incident") && t.status === "Pending Approval") set.status = after.state === "Approved" ? (kind === "problem" ? "Under Investigation" : "In Progress") : t.status;
    if (SLA_KINDS.includes(kind) && set.status && set.status !== t.status) { const cfg = await slaConfig(); Object.assign(set, pauseColumns(kind, t, set.status, cfg)); Object.assign(set, slaColumns(kind, { ...t, ...set }, cfg)); }
    const [nt]: any[] = await db.update(TABLE[kind]).set(set).where(eq(TABLE[kind].id, ap.ticketId)).returning();
    await history(kind, ap.ticketId, who.label, after.state === "Approved" ? `Fully approved (${approvers})` : `Approval flow ended — rejected at ${after.rejected!.approverLevel}`, t.status, nt.status);
    void emailDecision(kind, ap.ticketId, after.state, who.name, notes);
  } else if (after.next) {
    await db.update(itsmApprovalsTable).set({ requestedAt: new Date() }).where(eq(itsmApprovalsTable.id, after.next.id));
    void emailNextApprovers(kind, ap.ticketId);
  }
  await audit({ entityType: "itsm_approval", entityId: id, action: action.toLowerCase(), performedBy: who.label, summary: `${no}: ${ap.approverLevel} ${ap.approverRole} ${action.toLowerCase()}${d.override ? " (admin override)" : d.onBehalfOf ? ` (on behalf of ${d.onBehalfOf})` : ""}${notes ? ` — ${notes}` : ""}${after.state !== "Pending" ? ` · ticket ${after.state.toLowerCase()}` : ""}` });
  return { ...updated, ticketNo: no, ticketApproval: after.state };
}

router.post("/approvals/:id/action", wrap(async (req, res) => {
  res.json(await decideStep(req, parseInt(String(req.params.id)), req.body?.action, s(req.body?.notes)));
}));

/** Approve / reject several steps at once (same comment). Each step is checked on its own; failures are listed. */
router.post("/approvals/bulk-action", wrap(async (req, res) => {
  const ids: number[] = Array.isArray(req.body?.ids) ? [...new Set<number>(req.body.ids.map(Number).filter(Number.isFinite))] : [];
  if (!ids.length) return fail(res, 400, "Select at least one approval");
  if (ids.length > 100) return fail(res, 400, "Maximum 100 approvals at a time");
  const action = req.body?.action, notes = s(req.body?.notes);
  if (!["Approved", "Rejected"].includes(action)) return fail(res, 400, "Action must be Approved or Rejected");
  if (action === "Rejected" && (!notes || notes.length < 5)) return fail(res, 400, "Give the reason for rejecting (at least 5 characters)");
  const done: any[] = [], failed: { id: number; error: string }[] = [];
  for (const id of ids) { try { done.push(await decideStep(req, id, action, notes)); } catch (e: any) { failed.push({ id, error: e?.message || String(e) }); } }
  res.json({ done: done.length, tickets: done.map(d => d.ticketNo), failed });
}));

/** Admin: run the SLA alert and approval reminder checks now (they also run every 5 minutes). */
router.post("/itsm-monitor/run", requireAdmin, wrap(async (_req, res) => {
  const { runItsmChecks } = await import("../lib/itsm-monitor");
  res.json((await runItsmChecks()) ?? { skipped: "Already running on another server" });
}));

/* ─── Approval delegation (out-of-office cover) ─────────────────────────── */
router.get("/approval-delegates", wrap(async (req, res) => {
  const a = await getAccess(req); if (!a) return fail(res, 401, "Sign in again");
  const all = a.isAdmin && req.query.all === "1";
  const rows = rowsOf(await db.execute(sql`SELECT d.id, d.user_id AS "userId", u.name AS "userName", d.delegate_user_id AS "delegateUserId", v.name AS "delegateName",
      d.start_date AS "startDate", d.end_date AS "endDate", d.reason, d.created_by AS "createdBy", d.created_at AS "createdAt",
      (d.start_date <= ${todayIst()}::date AND d.end_date >= ${todayIst()}::date) AS "activeNow"
    FROM itsm_approval_delegates d JOIN users u ON u.id = d.user_id JOIN users v ON v.id = d.delegate_user_id
    WHERE d.is_active ${all ? sql`` : sql`AND (d.user_id = ${a.userId} OR d.delegate_user_id = ${a.userId})`} AND d.end_date >= ${todayIst()}::date ORDER BY d.start_date`));
  res.json(rows);
}));
router.post("/approval-delegates", wrap(async (req, res) => {
  const a = await getAccess(req); if (!a) return fail(res, 401, "Sign in again");
  const userId = a.isAdmin && Number(req.body?.userId) ? Number(req.body.userId) : a.userId;
  const delegateUserId = Number(req.body?.delegateUserId);
  const start = s(req.body?.startDate), end = s(req.body?.endDate);
  if (!delegateUserId) return fail(res, 400, "Choose who will approve for you");
  if (delegateUserId === userId) return fail(res, 400, "Choose someone other than yourself");
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return fail(res, 400, "From and To dates are required");
  if (end < start) return fail(res, 400, "To date cannot be before the From date");
  if (end < todayIst()) return fail(res, 400, "The period has already ended");
  const [u] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(and(eq(usersTable.id, delegateUserId), eq(usersTable.isActive, true)));
  if (!u) return fail(res, 400, "The delegate is not an active user");
  const [clash] = rowsOf(await db.execute(sql`SELECT id FROM itsm_approval_delegates WHERE is_active AND user_id = ${userId} AND start_date <= ${end}::date AND end_date >= ${start}::date`));
  if (clash) return fail(res, 400, "A delegation already covers part of these dates — end it first");
  const who = await actor(req);
  const [row] = await db.insert(itsmApprovalDelegatesTable).values({ userId, delegateUserId, startDate: start, endDate: end, reason: s(req.body?.reason), createdBy: who.label }).returning();
  await inApp([delegateUserId], "You are covering approvals", `${who.name} has asked you to approve ITSM tickets for them from ${start} to ${end}`, "info", "/itsm-my-approvals");
  await audit({ entityType: "itsm_approval_delegate", entityId: row.id, action: "create", performedBy: who.label, summary: `Approval delegation: user #${userId} → ${u.name}, ${start} to ${end}` });
  res.status(201).json(row);
}));
router.delete("/approval-delegates/:id", wrap(async (req, res) => {
  const a = await getAccess(req); if (!a) return fail(res, 401, "Sign in again");
  const [d] = await db.select().from(itsmApprovalDelegatesTable).where(eq(itsmApprovalDelegatesTable.id, Number(req.params.id)));
  if (!d || !d.isActive) return fail(res, 404, "Delegation not found");
  if (d.userId !== a.userId && !a.isAdmin) return fail(res, 403, "Only the approver or an admin can end this delegation");
  await db.update(itsmApprovalDelegatesTable).set({ isActive: false }).where(eq(itsmApprovalDelegatesTable.id, d.id));
  const who = await actor(req);
  await audit({ entityType: "itsm_approval_delegate", entityId: d.id, action: "delete", performedBy: who.label, summary: `Approval delegation #${d.id} ended` });
  res.status(204).end();
}));

// ─── ITSM SETTINGS (attachment config) ───────────────────────
router.get("/itsm-settings", async (_req, res): Promise<void> => {
  const settings = await db.select().from(settingsTable).then(rows => {
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  });
  res.json({
    maxAttachmentSizeMB: parseInt(settings["itsm.maxAttachmentSizeMB"] ?? "20"),
    maxAttachmentsPerTicket: parseInt(settings["itsm.maxAttachmentsPerTicket"] ?? "10"),
    allowedFileTypes: JSON.parse(settings["itsm.allowedFileTypes"] ?? '["pdf","xlsx","xls","docx","doc","png","jpg","jpeg","zip","csv","txt","pptx","ppt","msg"]'),
  });
});

// ─── ITSM CONFIG (all admin-configurable lookup lists) ────────
const ITSM_CONFIG_DEFAULTS: Record<string, unknown> = {
  "itsm.urgencyLevels": ["Critical", "High", "Medium", "Low"],
  "itsm.impactLevels": ["Enterprise-wide", "Department", "Team", "Individual"],
  "itsm.incidentSources": ["Phone", "Email", "Self-Service Portal", "Walk-in", "Monitoring Alert", "Teams / Chat", "API / Integration", "Other"],
  "itsm.incidentCategories": ["Application", "Infrastructure", "Network", "Hardware", "Security", "Database", "Cloud", "End-User", "Operations", "Service Request"],
  "itsm.incidentSubcategories": {
    "Application": ["Performance", "Error / Exception", "Access Denied", "Data Issue", "Integration Failure", "Feature Request"],
    "Infrastructure": ["Server Down", "Disk Space", "CPU / Memory", "Backup Failure", "VM / Container Issue", "Storage"],
    "Network": ["Connectivity", "DNS", "VPN", "Firewall", "WiFi", "Bandwidth"],
    "Hardware": ["Printer", "Laptop / Desktop", "Monitor", "Peripherals", "Battery / Power", "Other"],
    "Security": ["Phishing", "Malware", "Unauthorized Access", "Data Leak", "Vulnerability", "MFA Issue"],
    "Database": ["Slow Query", "Connection Failure", "Corruption", "Backup", "Replication Lag"],
    "Cloud": ["Instance Down", "Storage", "Permissions", "Auto-scaling", "Cost Alert"],
    "End-User": ["Outlook / Email", "Teams", "SharePoint", "Printing", "VPN", "Account Lock"],
    "Operations": ["Scheduled Job", "Maintenance", "Deployment", "Monitoring Alert"],
    "Service Request": ["Account", "Software", "Hardware", "Access", "Other"],
  },
  "itsm.problemCategories": ["Application", "Infrastructure", "Network", "Hardware", "Security", "Process", "Database", "Cloud", "Operations"],
  "itsm.changeCategories": ["Software", "Hardware", "Network", "Security", "Process", "Infrastructure", "Database", "Cloud", "End-User"],
  "itsm.srCategories": ["Access Request", "Software Install", "Hardware Request", "Account Setup", "Password Reset", "VPN Access", "Email Setup", "Mobile Device", "Printer Setup", "Data Export / Report", "New Joinee Onboarding", "Offboarding / Exit", "Other"],
  "itsm.departments": ["IT", "Finance", "HR", "Operations", "Sales", "Marketing", "Legal", "Admin", "Executive"],
  "itsm.slaCalendar": { start: "09:30", end: "18:30", days: [1, 2, 3, 4, 5], holidays: [] },
  "itsm.slaWarnPercent": 75,
  "itsm.slaPauseStatuses": ["On Hold", "Pending Approval"],
  "itsm.approvalReminderHours": 24,
  "itsm.approvalEscalateAfter": 2,
  "itsm.autoApprove": { lowPriority: true, standardChange: true },
  "itsm.itGroups": ["IT Helpdesk", "Infrastructure Team", "Network Team", "Security Team", "Applications Team", "Database Team", "Cloud Team", "Desktop Support", "Development Team", "Operations Team"],
};

function safeParseJson(val: unknown): unknown {
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}

router.get("/itsm-config", async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const saved: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.key.startsWith("itsm.")) saved[row.key] = safeParseJson(row.value);
  }
  const config: Record<string, unknown> = { ...ITSM_CONFIG_DEFAULTS };
  for (const [key, value] of Object.entries(saved)) {
    if (key in config || key === "itsm.maxAttachmentSizeMB" || key === "itsm.maxAttachmentsPerTicket" || key === "itsm.allowedFileTypes") {
      config[key] = value;
    }
  }
  res.json(config);
});

router.put("/itsm-config", requireAdmin, async (req, res): Promise<void> => {
  responseCache.clear(); clearSlaCache();
  const body = req.body as Record<string, unknown>;
  { const bad = (m: string) => { res.status(400).json({ error: m }); return true; };
    const c: any = body["itsm.slaCalendar"];
    if (c !== undefined && (typeof c !== "object" || !/^\d{1,2}:\d{2}$/.test(c.start) || !/^\d{1,2}:\d{2}$/.test(c.end) || c.end <= c.start || !Array.isArray(c.days) || !c.days.length || !Array.isArray(c.holidays || []))) { bad("Working hours: give start / end as HH:MM (end after start) and at least one working day"); return; }
    const w = body["itsm.slaWarnPercent"]; if (w !== undefined && !(Number(w) >= 50 && Number(w) <= 95)) { bad("SLA alert % must be between 50 and 95"); return; }
    const r = body["itsm.approvalReminderHours"]; if (r !== undefined && !(Number(r) >= 1 && Number(r) <= 168)) { bad("Approval reminder must be every 1–168 hours"); return; }
    const e = body["itsm.approvalEscalateAfter"]; if (e !== undefined && !(Number(e) >= 1 && Number(e) <= 10)) { bad("Escalate after 1–10 reminders"); return; }
    const ps = body["itsm.slaPauseStatuses"]; if (ps !== undefined && (!Array.isArray(ps) || ps.some(x => !["On Hold", "Pending Approval", "Escalated"].includes(String(x))))) { bad("Pause statuses can be On Hold, Pending Approval or Escalated"); return; } }
  for (const [key, value] of Object.entries(body)) {
    if (!key.startsWith("itsm.")) continue;
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    await db.insert(settingsTable).values({ key, value: serialized })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: serialized } });
  }
  res.json({ ok: true });
});

// ─── ITSM ATTACHMENTS ─────────────────────────────────────────
router.get("/itsm-attachments/:ticketType/:ticketId", async (req, res): Promise<void> => {
  const ticketId = parseInt(req.params.ticketId);
  const ticketType = req.params.ticketType;
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticketId" }); return; }
  if (!MODULE_OF[ticketType] || !await allowed(req, ticketType, "read")) { res.status(403).json({ error: "No access to these tickets" }); return; }
  const rows = await db.select().from(itsmAttachmentsTable)
    .where(and(eq(itsmAttachmentsTable.ticketType, ticketType), eq(itsmAttachmentsTable.ticketId, ticketId)))
    .orderBy(desc(itsmAttachmentsTable.createdAt));
  res.json(rows);
});

router.post("/itsm-attachments", async (req, res): Promise<void> => {
  const body = z.object({
    ticketType: z.string().min(1),
    ticketId: z.number().int().positive(),
    fileName: z.string().min(1),
    fileSize: z.number().int().positive(),
    contentType: z.string().min(1),
    objectPath: z.string().min(1),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid attachment data" }); return; }
  if (!MODULE_OF[body.data.ticketType] || !await allowed(req, body.data.ticketType, "write")) { res.status(403).json({ error: "You need edit access to add attachments to this ticket" }); return; }

  const userId = (req.session as any)?.userId;
  const uploadedByName = await getPerformedBy(userId).catch(() => "Unknown");

  const [attachment] = await db.insert(itsmAttachmentsTable).values({
    ...body.data,
    uploadedBy: userId,
    uploadedByName,
  }).returning();
  await logAudit({ entityType: "itsm_attachment", entityId: attachment.id, action: "CREATE", performedBy: uploadedByName, summary: `Attachment uploaded: ${body.data.fileName} for ${body.data.ticketType} #${body.data.ticketId}` }).catch(() => {});
  res.status(201).json(attachment);
});

router.delete("/itsm-attachments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [cur] = await db.select().from(itsmAttachmentsTable).where(eq(itsmAttachmentsTable.id, id));
  if (cur && !await allowed(req, cur.ticketType, "write")) { res.status(403).json({ error: "You need edit access to remove attachments" }); return; }
  const [att] = await db.delete(itsmAttachmentsTable).where(eq(itsmAttachmentsTable.id, id)).returning();
  if (!att) { res.status(404).json({ error: "Attachment not found" }); return; }
  const actorName = await getPerformedBy((req.session as any)?.userId).catch(() => "Unknown");
  await logAudit({ entityType: "itsm_attachment", entityId: id, action: "DELETE", performedBy: actorName, summary: `Attachment deleted: ${att.fileName} for ${att.ticketType} #${att.ticketId}` }).catch(() => {});
  res.sendStatus(204);
});

// ─── ITSM MASTER REPORT ───────────────────────────────────────
router.get("/itsm-report", async (req, res): Promise<void> => {
  const type = (req.query.type as string) || "all";

  const allApprovals = await db.select().from(itsmApprovalsTable);
  const slas = await db.select().from(itsmSlaPoliciesTable).where(eq(itsmSlaPoliciesTable.isActive, true));

  function getCurrentStage(ticketId: number, ticketType: string) {
    const ticketApprovals = allApprovals.filter(a => a.ticketId === ticketId && a.ticketType === ticketType);
    if (!ticketApprovals.length) return { currentStage: "No Approval Required", pendingWith: "—" };
    const pending = ticketApprovals.filter(a => a.status === "Pending").sort((a, b) => (a.approverLevel || "").localeCompare(b.approverLevel || ""))[0];
    const approved = ticketApprovals.every(a => a.status === "Approved" || a.status === "Auto-Approved");
    const rejected = ticketApprovals.find(a => a.status === "Rejected");
    if (rejected) return { currentStage: `Rejected at ${rejected.approverLevel}`, pendingWith: rejected.approverRole || "—" };
    if (approved) return { currentStage: "Fully Approved", pendingWith: "—" };
    if (pending) return { currentStage: pending.approverLevel || "L1", pendingWith: `${pending.approverRole || ""}${pending.approverName ? " (" + pending.approverName + ")" : ""}` };
    return { currentStage: "—", pendingWith: "—" };
  }

  function getSLABreach(createdAt: Date | null, resolvedAt: Date | null, closedAt: Date | null, priority: string, ticketTypeName: string) {
    const sla = slas.find(s => s.priority === priority && s.ticketType === ticketTypeName);
    if (!sla) return "No SLA";
    if (resolvedAt || closedAt) return "No Breach";
    const ageHours = (Date.now() - new Date(createdAt || Date.now()).getTime()) / 3600000;
    return ageHours > sla.resolutionTimeHours ? `Breached (${Math.round(ageHours)}h / ${sla.resolutionTimeHours}h SLA)` : `Within SLA (${Math.round(ageHours)}h / ${sla.resolutionTimeHours}h)`;
  }

  function fmtDate(d: Date | string | null) {
    if (!d) return "";
    return new Date(d).toISOString().replace("T", " ").substring(0, 19) + " UTC";
  }

  const results: any[] = [];

  if (type === "all" || type === "incidents") {
    const rows = await db.select().from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).orderBy(desc(itsmIncidentsTable.createdAt));
    for (const r of rows) {
      const { currentStage, pendingWith } = getCurrentStage(r.id, "Incident");
      results.push({
        type: "Incident",
        ticketNo: r.ticketNo, title: r.title, description: r.description || "",
        status: r.status, priority: r.priority, severity: r.severity,
        category: r.category || "", subcategory: r.subcategory || "",
        assignedTo: r.assignedTo || "", assignedGroup: r.assignedGroup || "",
        reportedBy: r.reportedBy || "", reporterEmail: r.reporterEmail || "",
        affectedSystem: r.affectedSystem || "", resolutionNotes: r.resolutionNotes || "",
        resolvedAt: fmtDate(r.resolvedAt), closedAt: fmtDate(r.closedAt),
        currentApprovalStage: currentStage, pendingWithApprover: pendingWith,
        slaBreachStatus: getSLABreach(r.createdAt, r.resolvedAt, r.closedAt, r.priority, "Incident"),
        createdBy: r.createdBy || "", updatedBy: r.updatedBy || "",
        createdAt: fmtDate(r.createdAt), updatedAt: fmtDate(r.updatedAt),
      });
    }
  }

  if (type === "all" || type === "problems") {
    const rows = await db.select().from(itsmProblemsTable).where(eq(itsmProblemsTable.isActive, true)).orderBy(desc(itsmProblemsTable.createdAt));
    for (const r of rows) {
      const { currentStage, pendingWith } = getCurrentStage(r.id, "Problem");
      results.push({
        type: "Problem",
        ticketNo: r.problemNo, title: r.title, description: r.description || "",
        status: r.status, priority: r.priority, severity: "", category: "", subcategory: "",
        assignedTo: r.assignedTo || "", assignedGroup: "",
        reportedBy: "", reporterEmail: "", affectedSystem: r.affectedSystems || "",
        resolutionNotes: r.workaround || "", resolvedAt: "", closedAt: "",
        rootCause: r.rootCause || "", relatedIncidents: r.relatedIncidents || "",
        currentApprovalStage: currentStage, pendingWithApprover: pendingWith,
        slaBreachStatus: getSLABreach(r.createdAt, null, null, r.priority, "Problem"),
        createdBy: r.createdBy || "", updatedBy: r.updatedBy || "",
        createdAt: fmtDate(r.createdAt), updatedAt: fmtDate(r.updatedAt),
      });
    }
  }

  if (type === "all" || type === "changes") {
    const rows = await db.select().from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true)).orderBy(desc(itsmChangesTable.createdAt));
    for (const r of rows) {
      const { currentStage, pendingWith } = getCurrentStage(r.id, "Change Request");
      results.push({
        type: "Change Request",
        ticketNo: r.changeNo, title: r.title, description: r.description || "",
        status: r.status, priority: r.riskLevel, severity: "",
        category: r.type || "", subcategory: "",
        assignedTo: r.requestedBy || "", assignedGroup: "",
        reportedBy: r.requestedBy || "", reporterEmail: "",
        affectedSystem: r.impact || "", resolutionNotes: r.rollbackPlan || "",
        resolvedAt: r.implementationDate || "", closedAt: "",
        approvalStatus: r.approvalStatus || "", approvedBy: r.approvedBy || "",
        currentApprovalStage: currentStage, pendingWithApprover: pendingWith,
        slaBreachStatus: "N/A (Change Request)",
        createdBy: r.createdBy || "", updatedBy: r.updatedBy || "",
        createdAt: fmtDate(r.createdAt), updatedAt: fmtDate(r.updatedAt),
      });
    }
  }

  if (type === "all" || type === "service-requests") {
    const rows = await db.select().from(itsmServiceRequestsTable).where(eq(itsmServiceRequestsTable.isActive, true)).orderBy(desc(itsmServiceRequestsTable.createdAt));
    for (const r of rows) {
      const { currentStage, pendingWith } = getCurrentStage(r.id, "Service Request");
      results.push({
        type: "Service Request",
        ticketNo: r.requestNo, title: r.title, description: r.description || "",
        status: r.status, priority: r.priority, severity: "",
        category: r.category || "", subcategory: "",
        assignedTo: r.assignedTo || "", assignedGroup: "",
        reportedBy: r.requestedBy || "", reporterEmail: "",
        affectedSystem: "", resolutionNotes: "",
        resolvedAt: fmtDate(r.completedAt), closedAt: "",
        currentApprovalStage: currentStage, pendingWithApprover: pendingWith,
        slaBreachStatus: getSLABreach(r.createdAt, r.completedAt, null, r.priority, "Service Request"),
        createdBy: r.createdBy || "", updatedBy: r.updatedBy || "",
        createdAt: fmtDate(r.createdAt), updatedAt: fmtDate(r.updatedAt),
      });
    }
  }

  res.json(results);
});

export { approversWithDelegates, approvalState, ticketBrief, KIND_OF, PAGE_OF, TYPE_NAME };
export default router;
