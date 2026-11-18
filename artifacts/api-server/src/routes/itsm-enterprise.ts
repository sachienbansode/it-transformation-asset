/** ITH-110 — ITSM enterprise pack: customer satisfaction (CSAT), related records, major incident banner,
 *  insights for the dashboard (teams, trend 7 / 30 / 90 days, CSAT, workflows, my work) and an Excel report. */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess } from "../lib/rbac";
import { isItsmAdmin, isItsmStaff } from "../lib/access-model";
import { slaConfig, slaInfo } from "../lib/itsm-sla";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const fail = (res: Response, code: number, error: string) => res.status(code).json({ error });
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => { try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); } };
const uid = (req: Request) => Number((req.session as any)?.userId) || 0;
type K = "incident" | "request" | "problem" | "change";
const KINDS: K[] = ["incident", "request", "problem", "change"];
const T: Record<K, { table: string; no: string; label: string; link: string; done: string[] }> = {
  incident: { table: "itsm_incidents", no: "ticket_no", label: "Incident", link: "/itsm-incidents", done: ["Resolved", "Closed"] },
  request: { table: "itsm_service_requests", no: "request_no", label: "Service Request", link: "/itsm-requests", done: ["Completed", "Cancelled", "Rejected"] },
  problem: { table: "itsm_problems", no: "problem_no", label: "Problem", link: "/itsm-problems", done: ["Resolved", "Closed"] },
  change: { table: "itsm_changes", no: "change_no", label: "Change", link: "/itsm-changes", done: ["Completed", "Closed", "Cancelled", "Failed", "Rolled Back"] },
};
const kindOf = (v: unknown) => { const k = String(v) as K; if (!KINDS.includes(k)) throw Object.assign(new Error("Unknown ticket type"), { status: 400 }); return k; };
async function row(k: K, id: number) { const [r] = rowsOf(await db.execute(sql.raw(`SELECT * FROM public.${T[k].table} WHERE id = ${Number(id)} AND coalesce(is_active, true)`))); return r || null; }
const camel = (r: any): any => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));

/* ── CSAT ─────────────────────────────────────────────────────────────── */
router.get("/itsm-csat/:kind/:id", requireAuth, wrap(async (req, res) => {
  const k = kindOf(req.params.kind); if (k !== "incident" && k !== "request") return res.json(null);
  const t = await row(k, Number(req.params.id)); if (!t) return fail(res, 404, "Ticket not found");
  const [c] = rowsOf(await db.execute(sql`SELECT rating, comment, user_name AS "by", created_at AS "at" FROM itsm_csat WHERE ticket_type = ${k} AND ticket_id = ${t.id}`));
  res.json({ rating: c || null, canRate: !c && T[k].done.includes(t.status) && t.status !== "Cancelled" && t.requester_user_id === uid(req) });
}));
router.post("/itsm-csat/:kind/:id", requireAuth, wrap(async (req, res) => {
  const k = kindOf(req.params.kind); if (k !== "incident" && k !== "request") return fail(res, 400, "Ratings are for incidents and service requests");
  const t = await row(k, Number(req.params.id)); if (!t) return fail(res, 404, "Ticket not found");
  if (t.requester_user_id !== uid(req)) return fail(res, 403, "Only the person who raised the ticket can rate it");
  if (!T[k].done.includes(t.status) || t.status === "Cancelled") return fail(res, 400, "You can rate the ticket once it is resolved / completed");
  const rating = Number(req.body?.rating); if (!(rating >= 1 && rating <= 5)) return fail(res, 400, "Choose 1 to 5 stars");
  const comment = String(req.body?.comment || "").trim().slice(0, 1000) || null;
  if (rating <= 2 && !comment) return fail(res, 400, "Please tell us what went wrong (comment needed for 1–2 stars)");
  const by = await getPerformedBy(uid(req));
  const r = rowsOf(await db.execute(sql`INSERT INTO itsm_csat (ticket_type, ticket_id, rating, comment, user_id, user_name) VALUES (${k}, ${t.id}, ${rating}, ${comment}, ${uid(req)}, ${by}) ON CONFLICT DO NOTHING RETURNING id`));
  if (!r.length) return fail(res, 409, "This ticket has already been rated");
  await db.execute(sql`INSERT INTO itsm_ticket_history (ticket_id, ticket_type, updated_by, notes) VALUES (${t.id}, ${k === "request" ? "service_request" : "incident"}, ${by}, ${`Requester rated the service ${rating}/5${comment ? ` — ${comment}` : ""}`})`);
  if (rating <= 2) {   // low score → tell the team lead / ITSM admins
    const ids = rowsOf(await db.execute(sql`SELECT DISTINCT u.id FROM users u WHERE u.is_active AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id WHERE ur.user_id = u.id AND rp.module = 'itsm_setup' AND rp.access_level = 'admin'))`)).map(x => x.id);
    for (const id of ids) await db.execute(sql`INSERT INTO notifications (user_id, title, message, type, link) VALUES (${id}, ${`Low satisfaction: ${t[T[k].no]}`}, ${`${rating}/5 — ${comment}`}, 'warning', ${`${T[k].link}?open=${t.id}`})`).catch(() => {});
  }
  await logAudit({ entityType: `itsm_${k}`, entityId: t.id, action: "csat", performedBy: by, summary: `${t[T[k].no]} rated ${rating}/5${comment ? ` — ${comment}` : ""}` });
  res.status(201).json({ ok: true });
}));

/* ── related records ──────────────────────────────────────────────────── */
async function linksOf(k: K, id: number) {
  const ls = rowsOf(await db.execute(sql`SELECT id, a_type, a_id, b_type, b_id, relation, created_by AS "by", created_at AS "at" FROM itsm_links WHERE (a_type = ${k} AND a_id = ${id}) OR (b_type = ${k} AND b_id = ${id}) ORDER BY id`));
  const out: any[] = [];
  for (const l of ls) {
    const [ot, oid] = l.a_type === k && l.a_id === id ? [l.b_type as K, l.b_id] : [l.a_type as K, l.a_id];
    const t = await row(ot, oid); if (!t) continue;
    out.push({ linkId: l.id, type: ot, typeLabel: T[ot].label, id: oid, no: t[T[ot].no], title: t.title, status: t.status, priority: t.priority || null, link: `${T[ot].link}?open=${oid}`, by: l.by, at: l.at, relation: l.relation });
  }
  // implicit links already stored on the records (incident → problem, change → problem)
  const self = await row(k, id);
  if (self?.problem_id && !out.some(o => o.type === "problem" && o.id === self.problem_id)) { const p = await row("problem", self.problem_id); if (p) out.push({ linkId: null, type: "problem", typeLabel: "Problem", id: p.id, no: p.problem_no, title: p.title, status: p.status, link: `/itsm-problems?open=${p.id}`, relation: "caused by" }); }
  if (k === "problem") for (const t of ["incident", "change"] as K[]) for (const r of rowsOf(await db.execute(sql.raw(`SELECT id FROM public.${T[t].table} WHERE problem_id = ${id} AND coalesce(is_active, true) LIMIT 50`)))) {
    if (out.some(o => o.type === t && o.id === r.id)) continue; const x = await row(t, r.id); out.push({ linkId: null, type: t, typeLabel: T[t].label, id: x.id, no: x[T[t].no], title: x.title, status: x.status, link: `${T[t].link}?open=${x.id}`, relation: t === "incident" ? "caused by this problem" : "fixes this problem" });
  }
  return out;
}
router.get("/itsm-links/:kind/:id", requireAuth, wrap(async (req, res) => {
  const k = kindOf(req.params.kind); const a = await getAccess(req);
  res.json({ links: await linksOf(k, Number(req.params.id)), canEdit: await isItsmStaff(a) });
}));
router.post("/itsm-links/:kind/:id", requireAuth, wrap(async (req, res) => {
  const k = kindOf(req.params.kind); const id = Number(req.params.id); const a = await getAccess(req);
  if (!await isItsmStaff(a)) return fail(res, 403, "Only the service desk can link records");
  const no = String(req.body?.number || "").trim().toUpperCase(); if (!no) return fail(res, 400, "Enter the number of the record to link, e.g. PRB-00004");
  let target: { k: K; r: any } | null = null;
  for (const t of KINDS) { const [r] = rowsOf(await db.execute(sql`SELECT id, ${sql.raw(T[t].no)} AS no, title FROM ${sql.raw(`public.${T[t].table}`)} WHERE upper(${sql.raw(T[t].no)}) = ${no} AND coalesce(is_active, true)`)); if (r) { target = { k: t, r }; break; } }
  if (!target) return fail(res, 404, `No incident, request, problem or change numbered ${no}`);
  if (target.k === k && target.r.id === id) return fail(res, 400, "A record cannot be linked to itself");
  const me = await row(k, id); if (!me) return fail(res, 404, "Ticket not found");
  const relation = String(req.body?.relation || "related").slice(0, 40);
  const by = await getPerformedBy(uid(req));
  const ins = rowsOf(await db.execute(sql`INSERT INTO itsm_links (a_type, a_id, b_type, b_id, relation, created_by) VALUES (${k}, ${id}, ${target.k}, ${target.r.id}, ${relation}, ${by}) ON CONFLICT DO NOTHING RETURNING id`));
  if (!ins.length) return fail(res, 409, `${target.r.no} is already linked`);
  if (k === "incident" && target.k === "problem") await db.execute(sql`UPDATE itsm_incidents SET problem_id = ${target.r.id} WHERE id = ${id} AND problem_id IS NULL`);
  const ht = (x: K) => x === "request" ? "service_request" : x;
  await db.execute(sql`INSERT INTO itsm_ticket_history (ticket_id, ticket_type, updated_by, notes) VALUES (${id}, ${ht(k)}, ${by}, ${`Linked to ${target.r.no} (${relation})`}), (${target.r.id}, ${ht(target.k)}, ${by}, ${`Linked to ${me[T[k].no]} (${relation})`})`);
  await logAudit({ entityType: `itsm_${k}`, entityId: id, action: "link", performedBy: by, summary: `${me[T[k].no]} linked to ${target.r.no} (${relation})` });
  res.status(201).json({ ok: true, linked: target.r.no });
}));
router.delete("/itsm-links/:linkId", requireAuth, wrap(async (req, res) => {
  const a = await getAccess(req); if (!await isItsmStaff(a)) return fail(res, 403, "Only the service desk can unlink records");
  const [l] = rowsOf(await db.execute(sql`DELETE FROM itsm_links WHERE id = ${Number(req.params.linkId)} RETURNING *`)); if (!l) return fail(res, 404, "Link not found");
  const by = await getPerformedBy(uid(req)); const A = await row(l.a_type, l.a_id), B = await row(l.b_type, l.b_id);
  await logAudit({ entityType: `itsm_${l.a_type}`, entityId: l.a_id, action: "unlink", performedBy: by, summary: `${A?.[T[l.a_type as K].no] || "?"} unlinked from ${B?.[T[l.b_type as K].no] || "?"}` });
  res.json({ ok: true });
}));

/* ── major incident banner: open S1 incidents (service desk only) ──────── */
router.get("/itsm-major", requireAuth, wrap(async (req, res) => {
  const a = await getAccess(req); if (!a || !(await isItsmStaff(a))) return res.json([]);
  res.json(rowsOf(await db.execute(sql`SELECT id, ticket_no AS "ticketNo", title, status, assigned_group AS team, assigned_to AS "assignedTo", created_at AS "createdAt" FROM itsm_incidents
    WHERE coalesce(is_active, true) AND severity = 'S1' AND status NOT IN ('Resolved', 'Closed') ORDER BY created_at LIMIT 5`)));
}));

/* ── insights for the dashboard ───────────────────────────────────────── */
router.get("/itsm-insights", requireAuth, wrap(async (req, res) => {
  const a = await getAccess(req); if (!a) return fail(res, 401, "Sign in");
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const cfg = await slaConfig(); const now = new Date(); const since = new Date(Date.now() - days * 86400e3);
  const inc = rowsOf(await db.execute(sql`SELECT * FROM itsm_incidents WHERE coalesce(is_active, true)`)).map(camel);
  const req_ = rowsOf(await db.execute(sql`SELECT * FROM itsm_service_requests WHERE coalesce(is_active, true)`)).map(camel);
  const all: any[] = [...inc.map(t => ({ ...t, kind: "incident", done: ["Resolved", "Closed"].includes(t.status) })), ...req_.map(t => ({ ...t, kind: "request", done: ["Completed", "Cancelled", "Rejected"].includes(t.status) }))]
    .map(t => ({ ...t, sla: slaInfo(t.kind, t, cfg, now) }));
  // teams
  const teams: Record<string, any> = {};
  for (const t of all) {
    const n = t.assignedGroup || "Unassigned"; const x = (teams[n] ||= { team: n, open: 0, breached: 0, atRisk: 0, resolved: 0, met: 0, measured: 0, hours: 0 });
    if (!t.done) { x.open++; if (t.sla.state === "Breached") x.breached++; if (t.sla.state === "At risk") x.atRisk++; }
    const end = t.resolvedAt || t.completedAt; if (t.done && end && new Date(end) >= since) { x.resolved++; x.hours += (new Date(end).getTime() - new Date(t.createdAt).getTime()) / 3600e3; if (t.sla.state !== "None") { x.measured++; if (t.sla.state === "Met") x.met++; } }
  }
  const teamRows = Object.values(teams).map((x: any) => ({ team: x.team, open: x.open, breached: x.breached, atRisk: x.atRisk, resolved: x.resolved, avgHours: x.resolved ? Math.round(x.hours / x.resolved * 10) / 10 : null, slaPct: x.measured ? Math.round(x.met / x.measured * 100) : null }))
    .sort((p: any, q: any) => q.open - p.open || q.resolved - p.resolved);
  // daily trend
  const trend: any[] = []; const day = (d: Date) => new Date(d.getTime() + 330 * 60e3).toISOString().slice(0, 10);
  for (let i = days - 1; i >= 0; i--) trend.push({ day: day(new Date(Date.now() - i * 86400e3)), created: 0, resolved: 0, breached: 0 });
  const byDay = Object.fromEntries(trend.map(d => [d.day, d]));
  for (const t of all) { const c = byDay[day(new Date(t.createdAt))]; if (c) c.created++; const end = t.resolvedAt || t.completedAt; if (t.done && end) { const r = byDay[day(new Date(end))]; if (r) { r.resolved++; if (t.sla.state === "Breached") r.breached++; } } }
  // CSAT
  const cs = rowsOf(await db.execute(sql`SELECT rating, comment, ticket_type AS "type", ticket_id AS "ticketId", user_name AS "by", created_at AS "at" FROM itsm_csat WHERE created_at >= ${since} ORDER BY created_at DESC`));
  const dist = [1, 2, 3, 4, 5].map(s => ({ stars: s, n: cs.filter(c => c.rating === s).length }));
  const csat = { count: cs.length, avg: cs.length ? Math.round(cs.reduce((s, c) => s + c.rating, 0) / cs.length * 10) / 10 : null, satisfiedPct: cs.length ? Math.round(cs.filter(c => c.rating >= 4).length / cs.length * 100) : null, dist, recent: cs.slice(0, 5) };
  // workflows & approvals
  const wf = rowsOf(await db.execute(sql`SELECT w.name, count(*) FILTER (WHERE i.state NOT IN ('Finished', 'Stopped'))::int AS running, count(*) FILTER (WHERE i.state = 'Waiting approval')::int AS waiting, count(*)::int AS total
    FROM itsm_ticket_workflows i JOIN itsm_workflows w ON w.id = i.workflow_id WHERE i.started_at >= ${since} OR i.state NOT IN ('Finished', 'Stopped') GROUP BY w.name ORDER BY running DESC, total DESC LIMIT 8`).catch(() => ({ rows: [] })));
  const [ap] = rowsOf(await db.execute(sql`SELECT count(*) FILTER (WHERE status = 'Pending')::int AS pending, count(*) FILTER (WHERE status = 'Pending' AND created_at < now() - interval '1 day')::int AS overdue,
      round(avg(extract(epoch FROM decided_at - created_at) / 3600) FILTER (WHERE decided_at >= ${since})::numeric, 1)::float AS "avgDecisionHours" FROM itsm_workflow_tasks`).catch(() => ({ rows: [{}] })));
  // my work
  const me = uid(req); const [u] = rowsOf(await db.execute(sql`SELECT name FROM users WHERE id = ${me}`));
  const myTeams = rowsOf(await db.execute(sql`SELECT t.name FROM itsm_team_members m JOIN itsm_teams t ON t.id = m.team_id WHERE m.user_id = ${me}`)).map(x => x.name);
  const open = all.filter(t => !t.done);
  const pick = (t: any) => ({ kind: t.kind, id: t.id, no: t.ticketNo || t.requestNo, title: t.title, status: t.status, priority: t.priority, sla: { state: t.sla.state, minutesLeft: t.sla.minutesLeft } });
  const mine = open.filter(t => t.assignedTo && u && t.assignedTo === u.name).sort((x, y) => (x.sla.minutesLeft ?? 1e9) - (y.sla.minutesLeft ?? 1e9));
  const queue = open.filter(t => !t.assignedTo && myTeams.includes(t.assignedGroup)).sort((x, y) => (x.sla.minutesLeft ?? 1e9) - (y.sla.minutesLeft ?? 1e9));
  const raised = open.filter(t => t.requesterUserId === me);
  const [myAp] = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM itsm_workflow_tasks WHERE status = 'Pending' AND ${me} = ANY(approver_ids)`).catch(() => ({ rows: [{ n: 0 }] })));
  const kpi = { open: open.length, breached: open.filter(t => t.sla.state === "Breached").length, atRisk: open.filter(t => t.sla.state === "At risk").length,
    createdInPeriod: all.filter(t => new Date(t.createdAt) >= since).length, resolvedInPeriod: all.filter(t => t.done && new Date(t.resolvedAt || t.completedAt || 0) >= since).length,
    majorOpen: inc.filter(t => t.severity === "S1" && !["Resolved", "Closed"].includes(t.status)).length };
  res.json({ days, kpi, teams: teamRows, trend, csat, workflows: { list: wf, pendingApprovals: ap?.pending || 0, overdueApprovals: ap?.overdue || 0, avgDecisionHours: ap?.avgDecisionHours ?? null },
    mine: { assigned: mine.slice(0, 8).map(pick), assignedCount: mine.length, queue: queue.slice(0, 8).map(pick), queueCount: queue.length, raised: raised.slice(0, 5).map(pick), raisedCount: raised.length, approvals: myAp?.n || 0, teams: myTeams } });
}));

/* ── Excel report ─────────────────────────────────────────────────────── */
router.get("/itsm-report.xlsx", requireAuth, wrap(async (req, res) => {
  const a = await getAccess(req); if (!a || !(isItsmAdmin(a) || await isItsmStaff(a))) return fail(res, 403, "The ITSM report is for the service desk");
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 90; const since = new Date(Date.now() - days * 86400e3);
  const XLSX = await import("xlsx"); const cfg = await slaConfig();
  const d = (v: any) => (v ? new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const csat = new Map(rowsOf(await db.execute(sql`SELECT ticket_type || ':' || ticket_id AS k, rating, comment FROM itsm_csat`)).map(c => [c.k, c]));
  const sheet = async (k: "incident" | "request"): Promise<any[]> => rowsOf(await db.execute(sql.raw(`SELECT * FROM public.${T[k].table} WHERE coalesce(is_active, true) AND (created_at >= '${since.toISOString()}' OR status NOT IN (${T[k].done.map(x => `'${x}'`).join(",")})) ORDER BY created_at DESC`))).map(camel).map(t => {
    const s = slaInfo(k, t, cfg); const c: any = csat.get(`${k}:${t.id}`);
    return { Number: t.ticketNo || t.requestNo, Title: t.title, Status: t.status, Priority: t.priority, ...(k === "incident" ? { Severity: t.severity } : {}), Category: t.category, "Sub-category": t.subcategory, Team: t.assignedGroup, "Assigned to": t.assignedTo,
      "Raised by": t.reportedBy || t.requestedBy, Raised: d(t.createdAt), "First response": d(t.firstResponseAt), [k === "incident" ? "Resolved" : "Completed"]: d(t.resolvedAt || t.completedAt),
      "SLA policy": s.policy || "", "SLA state": s.state, "Response": s.responseState, "Time used %": s.usedPct ?? "", "CSAT (1-5)": c?.rating ?? "", "CSAT comment": c?.comment ?? "" };
  });
  const inc = await sheet("incident"), rq = await sheet("request");
  const pr = rowsOf(await db.execute(sql`SELECT problem_no AS "Number", title AS "Title", status AS "Status", priority AS "Priority", category AS "Category", assigned_to AS "Assigned to", root_cause AS "Root cause", created_at FROM itsm_problems WHERE coalesce(is_active, true) ORDER BY created_at DESC`)).map(r => { const { created_at, ...x } = r; return { ...x, Raised: d(created_at) }; });
  const ch = rowsOf(await db.execute(sql`SELECT change_no AS "Number", title AS "Title", type AS "Type", status AS "Status", risk_level AS "Risk", approval_status AS "Approval", implementation_date AS "Planned", created_at FROM itsm_changes WHERE coalesce(is_active, true) ORDER BY created_at DESC`)).map(r => { const { created_at, ...x } = r; return { ...x, Raised: d(created_at) }; });
  const met = [...inc, ...rq].filter(x => x["SLA state"] === "Met").length, measured = [...inc, ...rq].filter(x => ["Met", "Breached"].includes(x["SLA state"]) && (x.Resolved || x.Completed)).length;
  const cs = [...inc, ...rq].filter(x => x["CSAT (1-5)"] !== "");
  const summary = [["IT Hub — ITSM report", ""], ["Period", `last ${days} days (open tickets of any age included)`], ["Generated", d(new Date())], [], ["Incidents", inc.length], ["Service requests", rq.length], ["Problems", pr.length], ["Change requests", ch.length],
    ["Open now", [...inc, ...rq].filter(x => !["Resolved", "Closed", "Completed", "Cancelled", "Rejected"].includes(x.Status)).length], ["SLA met (closed tickets)", measured ? `${Math.round(met / measured * 100)}% (${met} of ${measured})` : "—"],
    ["Breached open", [...inc, ...rq].filter(x => x["SLA state"] === "Breached" && !(x.Resolved || x.Completed)).length], ["CSAT average", cs.length ? (cs.reduce((s, x) => s + Number(x["CSAT (1-5)"]), 0) / cs.length).toFixed(1) + ` (${cs.length} ratings)` : "—"]];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
  for (const [n, rows] of [["Incidents", inc], ["Service requests", rq], ["Problems", pr], ["Changes", ch]] as const) { const ws = XLSX.utils.json_to_sheet(rows.length ? rows as any[] : [{ Number: "None" }]); ws["!autofilter"] = { ref: ws["!ref"] as string }; XLSX.utils.book_append_sheet(wb, ws, n); }
  await logAudit({ entityType: "itsm", action: "export", performedBy: await getPerformedBy(uid(req)), summary: `ITSM report downloaded (last ${days} days)` });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="IT_Hub_ITSM_Report_${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}));
export default router;
