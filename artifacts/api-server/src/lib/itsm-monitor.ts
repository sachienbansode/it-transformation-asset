import { db, usersTable, settingsTable, itsmIncidentsTable, itsmServiceRequestsTable, itsmApprovalsTable, itsmTicketHistoryTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { slaConfig, slaInfo, fmtMins } from "./itsm-sla";
import { teamById, teamMembers, userByName } from "./itsm-routing";
import { fmtDateTime } from "./dates";

/*
 * ITSM background checks (every 5 minutes, one server at a time via an advisory lock):
 *  1. SLA: response overdue, resolution at risk (warn %), resolution breached → assignee + team lead (in-app + email),
 *     breach also to the whole team and admins. Each alert is sent once per ticket (reset when priority changes).
 *  2. Approvals: a step waiting longer than the reminder interval → reminder to its approvers (and delegates);
 *     after N reminders → escalated to admins and the ticket team's lead.
 */

const KINDS = [
  { kind: "incident", table: itsmIncidentsTable, no: "ticketNo", page: "/itsm-incidents", label: "Incident", hist: "incident" },
  { kind: "request", table: itsmServiceRequestsTable, no: "requestNo", page: "/itsm-requests", label: "Service request", hist: "service_request" },
] as const;
const DONE = ["Resolved", "Closed", "Completed", "Cancelled", "Rejected"];
const rowsOf = (r: any) => (r.rows ?? r) as any[];

async function inApp(ids: (number | null | undefined)[], title: string, message: string, type: string, link: string) {
  for (const id of [...new Set(ids.filter(Boolean))]) await db.execute(sql`INSERT INTO notifications (user_id, title, message, type, link) VALUES (${id}, ${title}, ${message}, ${type}, ${link})`);
}
async function mail(event: string, to: string[], subject: string, html: string) {
  try { const { sendDirect } = await import("./mailer"); if (to.length) await sendDirect(event, [...new Set(to)], subject, html); } catch (e) { console.error("itsm-monitor mail failed", e); }
}
async function admins() {
  return db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(and(eq(usersTable.isActive, true), eq(usersTable.role, "admin")));
}
async function setting(key: string, def: number) {
  const [r] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  let v: any = r?.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { /* keep */ } }
  const n = Number(v); return Number.isFinite(n) && n > 0 ? n : def;
}

/* ── 1. SLA alerts ─────────────────────────────────────────────────────── */
export async function checkSla(now = new Date()) {
  const cfg = await slaConfig();
  const out = { warned: 0, breached: 0, responseBreached: 0 };
  let adminList: Awaited<ReturnType<typeof admins>> | null = null;
  for (const K of KINDS) {
    const rows: any[] = await db.select().from(K.table as any).where(and(eq((K.table as any).isActive, true), sql`status NOT IN ('Resolved','Closed','Completed','Cancelled','Rejected')`));
    for (const t of rows) {
      if (DONE.includes(t.status)) continue;
      const i = slaInfo(K.kind, t, cfg, now);
      if (i.state === "None") continue;
      const no = t[K.no];
      const assignee = t.assignedTo ? await userByName(t.assignedTo) : null;
      const team = t.teamId ? await teamById(t.teamId) : null;
      const lead = team?.leadUserId ? (await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, team.leadUserId)))[0] : null;
      const facts = `<table cellpadding="4" style="border-collapse:collapse;font-size:13px">${[["Ticket", no], ["Title", t.title], ["Priority", t.priority], ["Team", t.assignedGroup || "—"], ["Assigned to", t.assignedTo || "Not assigned"], ["Raised", fmtDateTime(t.createdAt)], ["Resolve by", i.dueAt ? fmtDateTime(i.dueAt) : "—"], ["SLA", `${i.policy} (${i.type}, respond ${i.responseHours}h / resolve ${i.resolutionHours}h)`]].map(([k, v]) => `<tr><td style="color:#666">${k}</td><td><b>${v ?? "—"}</b></td></tr>`).join("")}</table>`;
      const set: any = {};
      // response overdue: nobody picked it up in time
      if (i.responseState === "Breached" && !t.firstResponseAt && !t.responseBreachSentAt) {
        const members = team ? await teamMembers(team.id) : [];
        const people = [...members, ...(lead ? [lead] : [])];
        await inApp(people.map(p => p.id), `Response overdue: ${no}`, `${t.title} — not picked up within ${i.responseHours}h`, "warning", K.page);
        await mail("itsm_sla_alert", people.map(p => p.email).filter(Boolean) as string[], `Response overdue: ${no} — ${t.title}`, `<p>${K.label} <b>${no}</b> has not been picked up within the ${i.responseHours}h response target. Please assign it now.</p>${facts}<p>Regards,</p>`);
        set.responseBreachSentAt = now; out.responseBreached++;
        await db.insert(itsmTicketHistoryTable).values({ ticketId: t.id, ticketType: K.hist, updatedBy: "System", notes: `SLA: response target (${i.responseHours}h) missed — team${lead ? " and lead" : ""} alerted` });
      }
      if (i.state === "At risk" && !t.slaWarnSentAt) {
        const people = [assignee, lead].filter(Boolean) as any[];
        const target = people.length ? people : team ? await teamMembers(team.id) : [];
        await inApp(target.map(p => p.id), `SLA at risk: ${no}`, `${t.title} — ${i.usedPct}% of the time used, ${fmtMins(i.minutesLeft || 0)} left`, "warning", K.page);
        await mail("itsm_sla_alert", target.map(p => p.email).filter(Boolean) as string[], `SLA at risk: ${no} — ${fmtMins(i.minutesLeft || 0)} left`, `<p>${K.label} <b>${no}</b> has used <b>${i.usedPct}%</b> of its resolution time — <b>${fmtMins(i.minutesLeft || 0)}</b> left.</p>${facts}<p>Regards,</p>`);
        set.slaWarnSentAt = now; out.warned++;
      }
      if (i.state === "Breached" && !t.slaBreachSentAt) {
        adminList ||= await admins();
        const members = team ? await teamMembers(team.id) : [];
        const people = [...(assignee ? [assignee] : []), ...(lead ? [lead] : []), ...members, ...adminList];
        await inApp(people.map(p => p.id), `SLA breached: ${no}`, `${t.title} — overdue by ${fmtMins(-(i.minutesLeft || 0))}`, "error", K.page);
        await mail("itsm_sla_alert", people.map(p => p.email).filter(Boolean) as string[], `SLA breached: ${no} — ${t.title}`, `<p>${K.label} <b>${no}</b> has <b>breached</b> its resolution SLA (overdue by ${fmtMins(-(i.minutesLeft || 0))}).</p>${facts}<p>Please resolve it or update the requester.</p><p>Regards,</p>`);
        set.slaBreachSentAt = now; set.slaWarnSentAt = t.slaWarnSentAt || now; out.breached++;
        await db.insert(itsmTicketHistoryTable).values({ ticketId: t.id, ticketType: K.hist, updatedBy: "System", notes: `SLA breached (${i.resolutionHours}h resolution) — escalated to ${lead ? `${lead.name} (team lead), ` : ""}team and admins` });
      }
      if (Object.keys(set).length) await db.update(K.table as any).set(set).where(eq((K.table as any).id, t.id));
    }
  }
  return out;
}

/* ── 2. Approval reminders / escalation ───────────────────────────────── */
export async function checkApprovals(now = new Date()) {
  const { approversWithDelegates, approvalState, ticketBrief, KIND_OF, PAGE_OF, TYPE_NAME } = await import("../routes/itsm");
  const every = await setting("itsm.approvalReminderHours", 24);
  const escalateAfter = await setting("itsm.approvalEscalateAfter", 2);
  const out = { reminded: 0, escalated: 0 };
  const pend = await db.select().from(itsmApprovalsTable).where(eq(itsmApprovalsTable.status, "Pending"));
  let adminList: Awaited<ReturnType<typeof admins>> | null = null;
  for (const ap of pend) {
    const kind = KIND_OF[ap.ticketType]; if (!kind) continue;
    const st = await approvalState(kind, ap.ticketId);
    if (!st.next || st.next.id !== ap.id || st.rejected) continue; // only the step that is waiting now
    const since = new Date(ap.lastRemindedAt || ap.requestedAt || ap.createdAt);
    if (+now - +since < every * 3600_000) continue;
    const b = await ticketBrief(kind as any, ap.ticketId); if (!b || !b.t.isActive) continue;
    const waited = fmtMins((+now - +new Date(ap.requestedAt || ap.createdAt)) / 60_000);
    const { base, delegates } = await approversWithDelegates(ap);
    const people = [...base, ...delegates];
    const n = (ap.reminderCount || 0) + 1;
    await inApp(people.map(p => p.id), `Reminder: approval pending ${b.no}`, `${b.t.title} — waiting ${waited} (${ap.approverLevel} ${ap.approverRole})`, "warning", "/itsm-my-approvals");
    await mail("itsm_approval_reminder", people.map(p => p.email).filter(Boolean) as string[], `Reminder ${n}: approval pending — ${b.no} ${b.t.title}`,
      `<p>${TYPE_NAME[kind]} <b>${b.no}</b> has been waiting for your approval for <b>${waited}</b> (${ap.approverLevel} — ${ap.approverRole}).</p><p><b>${b.t.title}</b><br>Raised by ${b.requester || b.t.createdBy || "—"} on ${fmtDateTime(b.t.createdAt)}</p><p>Approve or reject it in <b>IT Hub › ITSM › My Approvals</b>.</p><p>Regards,</p>`);
    const set: any = { reminderCount: n, lastRemindedAt: now };
    out.reminded++;
    if (n >= escalateAfter && !ap.escalatedAt) {
      adminList ||= await admins();
      const team = b.t.teamId ? await teamById(b.t.teamId) : null;
      const lead = team?.leadUserId ? (await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, team.leadUserId)))[0] : null;
      const esc = [...adminList, ...(lead ? [lead] : [])];
      await inApp(esc.map(p => p.id), `Approval overdue: ${b.no}`, `${ap.approverLevel} ${ap.approverRole} has not decided in ${waited} (${people.map(p => p.name).join(", ") || "no approver"})`, "error", PAGE_OF[kind]);
      await mail("itsm_approval_escalation", esc.map(p => p.email).filter(Boolean) as string[], `Approval overdue: ${b.no} — waiting ${waited}`,
        `<p>${TYPE_NAME[kind]} <b>${b.no}</b> (${b.t.title}) has waited <b>${waited}</b> for ${ap.approverLevel} — ${ap.approverRole}, after ${n} reminders.</p><p>Approvers: ${people.map(p => p.name).join(", ") || "none configured"}</p><p>Follow up with them, set a delegate, or decide it as admin (override) in IT Hub › ITSM › My Approvals.</p><p>Regards,</p>`);
      set.escalatedAt = now; out.escalated++;
      await db.insert(itsmTicketHistoryTable).values({ ticketId: ap.ticketId, ticketType: kind === "request" ? "service_request" : kind, updatedBy: "System", notes: `Approval ${ap.approverLevel} overdue (${waited}) — escalated to admins${lead ? ` and ${lead.name}` : ""}` });
    }
    await db.update(itsmApprovalsTable).set(set).where(eq(itsmApprovalsTable.id, ap.id));
  }
  return out;
}

/** One run of all checks; skipped when another server is already running them (transaction-scoped lock). */
export async function runItsmChecks() {
  return db.transaction(async tx => {
    const r = rowsOf(await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext('itsm-monitor')) AS ok`));
    if (!r[0]?.ok) return null;
    return { sla: await checkSla(), approvals: await checkApprovals() };
  });
}

export function startItsmMonitor(everyMs = 5 * 60_000) {
  if (process.env.ITSM_MONITOR === "off") return;
  const tick = () => { runItsmChecks().catch(e => console.error("ITSM monitor failed", e)); };
  setTimeout(tick, 60_000);
  setInterval(tick, everyMs).unref?.();
}
