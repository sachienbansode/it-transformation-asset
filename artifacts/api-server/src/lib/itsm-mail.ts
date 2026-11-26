import { db, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { teamById, teamMembers } from "./itsm-routing";
import { sendDirect, esc, htmlTable, EMAIL_RE } from "./mailer";
import { fmtDate } from "./dates";

/*
 * r101 (ITH-163/164) — ITSM email alerts. Each event (ticket received, new in queue, assigned, passed on, status changed,
 * resolved, reopened, response overdue, SLA at risk / breached) has a rule kept in itsm_email_rules: who receives it
 * (requester, assignee, team, team lead, escalation level 1 / 2, admins, extra addresses), and an editable subject + body.
 * Only those people get it; the person who made the change is left out; each person gets their own email.
 */
export type ItsmKind = "incident" | "request";
export type MailCtx = { actorEmail?: string | null; reason?: string | null; slaLeft?: string | null };
type Rule = { event_key: string; enabled: boolean; to_requester: boolean; to_assignee: boolean; to_team: boolean; to_lead: boolean; to_escalation1: boolean; to_escalation2: boolean; to_admins: boolean; extra: string | null; skip_actor: boolean; subject: string; body: string };

const rowsOf = (r: any) => (r?.rows ?? r ?? []) as any[];
let cache: { at: number; rules: Map<string, Rule> } | null = null;
export const clearItsmMailCache = () => { cache = null; };
async function rules() {
  if (cache && Date.now() - cache.at < 30_000) return cache.rules;
  const m = new Map<string, Rule>(); for (const r of rowsOf(await db.execute(sql`SELECT * FROM itsm_email_rules`).catch(() => ({ rows: [] })))) m.set(r.event_key, r);
  cache = { at: Date.now(), rules: m }; return m;
}
const userById = async (id?: number | null) => id ? (await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, isActive: usersTable.isActive }).from(usersTable).where(eq(usersTable.id, id)))[0] || null : null;

export const TYPE = { incident: "Incident", request: "Service request" } as const;
const NOF = (k: ItsmKind, t: any) => k === "incident" ? t.ticketNo ?? t.ticket_no : t.requestNo ?? t.request_no;
const PAGE = { incident: "/itsm-incidents", request: "/itsm-requests" } as const;

/** placeholder values for one ticket — also used by the template preview */
export async function ticketValues(kind: ItsmKind, t: any, ctx: MailCtx = {}) {
  const no = NOF(kind, t);
  const base = String(process.env.APP_URL || "").replace(/\/$/, "");
  const requester = t.requesterUserId ? await userById(t.requesterUserId) : null;
  const team = t.teamId ? await teamById(t.teamId) : null;
  const details = htmlTable([["Ticket", no], ["Title", t.title], ["Category", [t.category, t.subcategory].filter(Boolean).join(" › ") || "—"], ["Priority", t.priority || "—"],
    ["Status", t.status], ["Team", t.assignedGroup || team?.name || "—"], ["Assigned to", t.assignedTo || "Not assigned yet"], ["Raised by", requester?.name || t.reportedBy || t.requestedBy || "—"]]);
  return {
    type: TYPE[kind], no, title: t.title || "", priority: t.priority || "—", status: t.status || "", team: t.assignedGroup || team?.name || "IT team",
    assignee: t.assignedTo || "the team", requester: requester?.name || t.reportedBy || t.requestedBy || "there", category: [t.category, t.subcategory].filter(Boolean).join(" › "),
    expectedClosure: t.expectedClosureDate ? fmtDate(t.expectedClosureDate) : "as per SLA", resolution: t.resolutionNotes || t.fulfillmentNotes || "—",
    reason: ctx.reason || "—", slaLeft: ctx.slaLeft || "—", assigneeLine: t.assignedTo ? ` and is with ${t.assignedTo}` : "",
    link: `${base}${PAGE[kind]}?q=${encodeURIComponent(no)}`, details,
  } as Record<string, string>;
}
/** {{name}} → value; values are HTML-escaped except the prepared details table */
export const render = (tpl: string, v: Record<string, string>, html = true) =>
  tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => k in v ? (k === "details" || !html ? v[k] : esc(v[k])) : "");

/** who gets this event for this ticket (deduplicated, valid emails, actor removed) */
export async function recipients(rule: Rule, kind: ItsmKind, t: any, ctx: MailCtx = {}) {
  const out: { email: string; why: string }[] = [];
  const add = (email: string | null | undefined, why: string) => { const e = String(email || "").trim().toLowerCase(); if (EMAIL_RE.test(e) && !out.some(x => x.email === e)) out.push({ email: e, why }); };
  const team = t.teamId ? await teamById(t.teamId) : null;
  if (rule.to_requester) { const u = await userById(t.requesterUserId); add(u?.isActive !== false ? u?.email || t.reporterEmail : null, "raised it"); }
  if (rule.to_assignee && t.assignedTo) {   // same name twice? prefer the person who is in the ticket's team
    const r = rowsOf(await db.execute(sql`SELECT u.email FROM users u WHERE u.is_active AND (lower(u.name) = lower(${t.assignedTo}) OR lower(u.email) = lower(${t.assignedTo}))
      ORDER BY (EXISTS (SELECT 1 FROM itsm_team_members m WHERE m.user_id = u.id AND m.team_id = ${t.teamId ?? 0})) DESC, u.id DESC LIMIT 1`));
    add(r[0]?.email, "assigned to"); }
  if (rule.to_lead && team?.leadUserId) { const u = await userById(team.leadUserId); if (u?.isActive) add(u.email, "team lead"); }
  if (rule.to_escalation1 && (team as any)?.escalation1UserId) { const u = await userById((team as any).escalation1UserId); if (u?.isActive) add(u.email, "escalation level 1"); }
  if (rule.to_escalation2 && (team as any)?.escalation2UserId) { const u = await userById((team as any).escalation2UserId); if (u?.isActive) add(u.email, "escalation level 2"); }
  if (rule.to_team && team) { if (team.email) add(team.email, "team mailbox"); for (const m of await teamMembers(team.id)) add(m.email, "team member"); }
  if (rule.to_admins) for (const a of await db.select({ email: usersTable.email }).from(usersTable).where(and(eq(usersTable.role, "admin"), eq(usersTable.isActive, true)))) add(a.email, "Super Admin");
  for (const e of String(rule.extra || "").split(/[,;\s]+/)) add(e, "always copied");
  const actor = String(ctx.actorEmail || "").toLowerCase();
  return rule.skip_actor && actor ? out.filter(x => x.email !== actor) : out;
}

/** send one ITSM event. Never throws; returns who it went to (for tests and the history). */
export async function itsmMail(event: string, kind: ItsmKind, t: any, ctx: MailCtx = {}) {
  try {
    const rule = (await rules()).get(event); if (!rule || !rule.enabled) return [];
    const to = await recipients(rule, kind, t, ctx); if (!to.length) return [];
    const v = await ticketValues(kind, t, ctx);
    const subject = render(rule.subject, v, false), html = render(rule.body, v);
    for (const r of to) await sendDirect(`itsm_${event}`, [r.email], subject, html);   // one email each — people never see each other's addresses
    return to;
  } catch (e) { console.error(`itsmMail(${event}) failed`, e); return []; }
}
