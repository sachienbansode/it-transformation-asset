/**
 * ITH-070 — device online status, "Refresh now", and suggestions to close tickets from the latest device data.
 *
 *  Online      : the device was in contact in the last 3 minutes (agent 1.1.7 sends a tiny pulse every minute).
 *  Refresh now : IT (or the employee for their own computer) asks for fresh data; the next pulse runs a full collection
 *                (≈ 1 minute). Older agents send it at their next scheduled check-in.
 *  Suggestions : after every check-in the open tickets of that device (raised from a health item, naming the computer,
 *                or raised by its user in the last 60 days) are compared with the new data. When every problem the
 *                ticket is about now looks fixed (e.g. "restart required" and the device has restarted since), IT sees
 *                "Looks fixed — close?" with the evidence and report time. IT accepts (ticket resolved with that
 *                reference) or dismisses with a reason. Nothing is closed without a person, and every step is audited.
 */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess } from "../lib/rbac";
import { isSupportStaff, isItsmStaff } from "../lib/access-model";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); }
};
const uid = (req: Request) => Number((req.session as any)?.userId) || null;
const audit = (p: Parameters<typeof logAudit>[0]) => void logAudit(p).catch(() => {});
const MY_DEV = (u: number | null) => sql`g.status = 'Active' AND coalesce(CASE WHEN s.status = 'Allocated' THEN s.owner_id END, g.user_id) = ${u}`;
const ist = (d: any) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).replace(/ (\w{3}) /, "-$1-").replace(",", "") + " IST";
const verGte = (v: string | null | undefined, w: string) => { const a = String(v || "0").split(".").map(Number), b = w.split(".").map(Number); for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); } return true; };

/** Who may look at / refresh this device: support staff, or the employee whose computer it is. */
async function deviceFor(req: Request) {
  const id = Number(req.params.id); if (!Number.isInteger(id)) return { ag: null, staff: false, own: false };
  const a = await getAccess(req); const staff = await isSupportStaff(a);
  const [ag] = rowsOf(await db.execute(sql`SELECT g.id, g.hostname, g.status, g.agent_version AS "agentVersion", g.last_seen_at AS "lastSeenAt", g.last_pulse_at AS "lastPulseAt",
      g.refresh_requested_at AS "refreshRequestedAt", g.refresh_requested_by AS "refreshRequestedBy",
      (g.status = 'Active' AND greatest(coalesce(g.last_pulse_at, 'epoch'), coalesce(g.last_seen_at, 'epoch')) > now() - interval '3 minutes') AS online,
      (${MY_DEV(uid(req))}) AS own
    FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE g.id = ${id}`));
  return { ag: ag || null, staff, own: !!ag?.own };
}
function liveView(ag: any) {
  const fulfilled = !!ag.refreshRequestedAt && !!ag.lastSeenAt && new Date(ag.lastSeenAt) > new Date(ag.refreshRequestedAt);
  return { online: !!ag.online, lastPulseAt: ag.lastPulseAt, lastSeenAt: ag.lastSeenAt, lastContactAt: [ag.lastPulseAt, ag.lastSeenAt].filter(Boolean).sort().pop() || null,
    refreshRequestedAt: ag.refreshRequestedAt, refreshRequestedBy: ag.refreshRequestedBy, refreshPending: !!ag.refreshRequestedAt && !fulfilled, fulfilled,
    agentVersion: ag.agentVersion, fastRefresh: verGte(ag.agentVersion, "1.1.7") };
}

router.get("/asset-agents/:id/live", requireAuth, wrap(async (req, res) => {
  const { ag, staff, own } = await deviceFor(req); if (!ag || !(staff || own)) return fail(res, 404, "Device not found");
  const out: any = liveView(ag);
  out.suggestions = staff ? await suggestionsWhere(sql`t.agent_id = ${ag.id} AND t.status = 'Open'`) : [];
  res.json(out);
}));

router.post("/asset-agents/:id/refresh", requireAuth, wrap(async (req, res) => {
  const { ag, staff, own } = await deviceFor(req); if (!ag || !(staff || own)) return fail(res, 404, "Device not found");
  if (ag.status !== "Active") return fail(res, 400, "This device is not active");
  const v = liveView(ag);
  if (v.refreshPending && Date.now() - new Date(ag.refreshRequestedAt).getTime() < 60_000) return res.json(v);   // already asked a moment ago
  const by = await getPerformedBy(uid(req) || undefined);
  const [r] = rowsOf(await db.execute(sql`UPDATE asset_agents SET refresh_requested_at = now(), refresh_requested_by = ${by} WHERE id = ${ag.id} RETURNING refresh_requested_at AS "at"`));
  audit({ entityType: "asset_agent", entityId: ag.id, action: "refresh_request", performedBy: by, summary: `Asked ${ag.hostname} for its latest data (${v.online ? "online" : "offline — it will send when it is back"})` });
  res.json({ ...v, refreshRequestedAt: r.at, refreshRequestedBy: by, refreshPending: true, fulfilled: false });
}));

/* ── suggestions to close tickets ────────────────────────────────────────── */
type Rule = { rule: string; label: string; kinds: string[]; re: RegExp; test: (h: any, t: any, th: any) => { ok: boolean; evidence: string } };
const pct = (v: any) => Math.round(Number(v));
const RULES: Rule[] = [
  { rule: "reboot", label: "Restart", kinds: ["reboot", "pending-reboot"], re: /\b(restart|re-?boot|rebooted|uptime)\b/i,
    test: (h, t) => { const lb = h?.os?.lastBoot; const ok = !h?.patches?.pendingReboot && !!lb && new Date(lb) > new Date(t.created_at); return { ok, evidence: lb ? `restarted ${ist(lb)}${h?.patches?.pendingReboot ? ", but a restart is still pending" : ", no restart pending"}` : "restart time not reported" }; } },
  { rule: "disk", label: "Disk space / disk health", kinds: ["disk:", "smart:"], re: /\b(disk|storage|space|drive|c:|ssd|hdd)\b/i,
    test: (h, _t, th) => { const d = (h?.disks || []).filter((x: any) => Number(x.sizeGb) >= 1); const bad = (h?.physicalDisks || []).filter((p: any) => p.health && !/healthy/i.test(p.health));
      return { ok: d.length > 0 && d.every((x: any) => Number(x.freePct) >= th.diskFreePct) && !bad.length, evidence: d.map((x: any) => `${x.drive} ${pct(x.freePct)}% free`).join(", ") + (bad.length ? `; disk ${bad[0].name} ${bad[0].health}` : "") }; } },
  { rule: "battery", label: "Battery", kinds: ["battery"], re: /\bbattery\b/i,
    test: (h, _t, th) => { const b = h?.battery; return { ok: !!b && (!b.present || Number(b.healthPct) >= th.batteryHealthPct), evidence: b?.present ? `battery health ${pct(b.healthPct)}%` : "no battery reported" }; } },
  { rule: "antivirus", label: "Antivirus", kinds: ["antivirus", "antivirus-defs"], re: /\b(anti-?virus|defender|virus|malware)\b/i,
    test: h => { const av = h?.security?.av || []; return { ok: av.some((a: any) => a.enabled && a.upToDate !== false), evidence: av.map((a: any) => `${a.name} ${a.enabled ? "on" : "off"}${a.upToDate === false ? " (old definitions)" : ""}`).join(", ") || "no antivirus reported" }; } },
  { rule: "bitlocker", label: "BitLocker", kinds: ["bitlocker"], re: /\b(bitlocker|encrypt(ion|ed)?)\b/i,
    test: h => { const bl = h?.security?.bitlocker || []; const sys = bl.find((b: any) => /^c/i.test(b.drive || "")) || bl[0]; return { ok: !!sys && /on|encrypt/i.test(String(sys.status)) && !/decrypt/i.test(String(sys.status)), evidence: sys ? `BitLocker ${sys.drive} ${sys.status}` : "BitLocker not reported" }; } },
  { rule: "firewall", label: "Firewall", kinds: ["firewall"], re: /\bfirewall\b/i,
    test: h => { const f = h?.security?.firewall || {}; return { ok: [f.domain, f.private, f.public].every(v => v === true), evidence: `firewall domain ${f.domain ? "on" : "off"}, private ${f.private ? "on" : "off"}, public ${f.public ? "on" : "off"}` }; } },
  { rule: "patches", label: "Windows updates", kinds: ["patches"], re: /\b(patch(es|ing)?|windows update|updates?)\b/i,
    test: (h, _t, th) => { const li = h?.patches?.lastInstalled; const days = li ? (Date.now() - new Date(li).getTime()) / 86_400_000 : Infinity;
      return { ok: days <= th.patchDays && !h?.patches?.pendingReboot, evidence: `last update ${li || "—"}${h?.patches?.pendingReboot ? ", restart pending" : ""}` }; } },
  { rule: "performance", label: "Slow / memory / CPU (check with the user)", kinds: ["memory", "cpu"], re: /\b(slow|hang(s|ing)?|freez\w*|memory|ram|cpu|performance|lag\w*)\b/i,
    test: h => { const m = Number(h?.mem?.usedPct), c = Number(h?.cpu?.pct); return { ok: Number.isFinite(m) && Number.isFinite(c) && m < 85 && c < 80, evidence: `memory ${pct(m)}% used, CPU ${pct(c)}% busy` }; } },
];

export async function suggestClosures(agentId: number, h: any, at: Date) {
  const [ag] = rowsOf(await db.execute(sql`SELECT g.id, g.hostname, coalesce(CASE WHEN s.status = 'Allocated' THEN s.owner_id END, g.user_id) AS uid FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE g.id = ${agentId}`));
  if (!ag) return;
  const { agentSettings } = await import("./asset-agent"); const th = (await agentSettings()).thresholds;
  const openKinds = rowsOf(await db.execute(sql`SELECT kind FROM asset_agent_alerts WHERE agent_id = ${agentId} AND closed_at IS NULL`)).map(r => String(r.kind));
  const host = String(ag.hostname || "").toLowerCase();
  const tickets = rowsOf(await db.execute(sql`SELECT i.id, i.ticket_no, i.title, i.description, i.category, i.subcategory, i.created_at,
      (SELECT string_agg(x.kind, ',') FROM asset_agent_alerts x WHERE x.incident_id = i.id AND x.agent_id = ${agentId}) AS kinds
    FROM itsm_incidents i WHERE i.is_active AND i.status NOT IN ('Resolved', 'Closed', 'Cancelled')
      AND (i.id IN (SELECT incident_id FROM asset_agent_alerts WHERE agent_id = ${agentId} AND incident_id IS NOT NULL)
        OR (${host} <> '' AND lower(coalesce(i.affected_system, '')) LIKE ${"%" + host + "%"})
        OR (${ag.uid}::int IS NOT NULL AND i.requester_user_id = ${ag.uid} AND i.created_at > now() - interval '60 days'))
    ORDER BY i.id DESC LIMIT 50`));
  for (const t of tickets) {
    const text = [t.title, t.description, t.category, t.subcategory].filter(Boolean).join(" ");
    const linked = String(t.kinds || "").split(",").filter(Boolean);
    const rules = RULES.filter(r => linked.some(k => r.kinds.some(p => k === p || k.startsWith(p))) || r.re.test(text));
    if (!rules.length) continue;
    const checks = rules.map(r => ({ r, still: openKinds.some(k => r.kinds.some(p => k === p || k.startsWith(p))), ...r.test(h, t, th) }));
    const allOk = checks.every(c => c.ok && !c.still);
    const key = rules.map(r => r.rule).join("+");
    if (!allOk) { await db.execute(sql`UPDATE ticket_close_suggestions SET status = 'Expired', decided_at = now(), decision_note = 'No longer supported by the latest device report' WHERE incident_id = ${t.id} AND status = 'Open'`); continue; }
    const [dismissed] = rowsOf(await db.execute(sql`SELECT 1 FROM ticket_close_suggestions WHERE incident_id = ${t.id} AND rule = ${key} AND status = 'Dismissed' LIMIT 1`));
    if (dismissed) continue;
    await db.execute(sql`UPDATE ticket_close_suggestions SET status = 'Expired', decided_at = now(), decision_note = 'Replaced by a newer suggestion' WHERE incident_id = ${t.id} AND status = 'Open' AND rule <> ${key}`);
    const reason = `${rules.map(r => r.label).join(" + ")}: the device report of ${ist(at)} from ${ag.hostname} shows this is fixed`;
    const evidence = checks.map(c => c.evidence).join("; ");
    await db.execute(sql`INSERT INTO ticket_close_suggestions (incident_id, agent_id, rule, reason, evidence, report_at, hostname) VALUES (${t.id}, ${agentId}, ${key}, ${reason}, ${evidence}, ${at}, ${ag.hostname})
      ON CONFLICT (incident_id, rule) WHERE status = 'Open' DO UPDATE SET reason = EXCLUDED.reason, evidence = EXCLUDED.evidence, report_at = EXCLUDED.report_at`);
  }
}

async function suggestionsWhere(where: any) {
  return rowsOf(await db.execute(sql`SELECT t.id, t.incident_id AS "incidentId", i.ticket_no AS "ticketNo", i.title, i.status AS "ticketStatus", i.assigned_to AS "assignedTo", i.priority,
      t.agent_id AS "agentId", t.hostname, t.rule, t.reason, t.evidence, t.report_at AS "reportAt", t.status, t.decided_by AS "decidedBy", t.decided_at AS "decidedAt", t.decision_note AS "decisionNote", t.created_at AS "createdAt"
    FROM ticket_close_suggestions t JOIN itsm_incidents i ON i.id = t.incident_id WHERE ${where} ORDER BY t.report_at DESC LIMIT 200`));
}
router.get("/ticket-suggestions", requireAuth, wrap(async (req, res) => {
  if (!await isSupportStaff(await getAccess(req))) return fail(res, 403, "Only IT can see these");
  const st = String(req.query.status || "Open"); const inc = Number(req.query.incidentId) || null; const ag = Number(req.query.agentId) || null;
  res.json(await suggestionsWhere(sql`(${st} = 'all' OR t.status = ${st}) AND (${inc}::int IS NULL OR t.incident_id = ${inc}) AND (${ag}::int IS NULL OR t.agent_id = ${ag})`));
}));
router.post("/ticket-suggestions/:id/:action", requireAuth, (req, _res, next) => ["accept", "dismiss"].includes(String(req.params.action)) ? next() : next("route"), wrap(async (req, res) => {
  if (!await isItsmStaff(await getAccess(req))) return fail(res, 403, "Only ITSM staff can close or keep tickets");
  const [t] = await suggestionsWhere(sql`t.id = ${Number(req.params.id)}`); if (!t) return fail(res, 404, "Suggestion not found");
  if (t.status !== "Open") return fail(res, 400, `Already ${t.status.toLowerCase()}`);
  const by = await getPerformedBy(uid(req) || undefined); const note = String(req.body?.note || "").trim().slice(0, 500);
  const { noteIncident } = await import("./itsm");
  if (req.params.action === "accept") {
    if (["Resolved", "Closed"].includes(t.ticketStatus)) return fail(res, 400, "The ticket is already resolved");
    const text = `Resolved from the device report of ${ist(t.reportAt)} (${t.hostname}): ${t.evidence}.${note ? ` ${note}` : ""} — confirmed by ${by}`;
    await noteIncident(t.incidentId, by, text, "any");
    await db.execute(sql`UPDATE ticket_close_suggestions SET status = 'Accepted', decided_by = ${by}, decided_at = now(), decision_note = ${note || null} WHERE id = ${t.id}`);
    audit({ entityType: "incident", entityId: t.incidentId, action: "resolve_from_device", performedBy: by, summary: `${t.ticketNo} resolved on the device suggestion (${t.rule}) — ${t.evidence}` });
  } else {
    if (note.length < 5) return fail(res, 400, "Give a reason (at least 5 characters) for keeping the ticket open");
    await noteIncident(t.incidentId, by, `Kept open although the device report of ${ist(t.reportAt)} looked fixed (${t.evidence}). Reason: ${note}`, false);
    await db.execute(sql`UPDATE ticket_close_suggestions SET status = 'Dismissed', decided_by = ${by}, decided_at = now(), decision_note = ${note} WHERE id = ${t.id}`);
    audit({ entityType: "incident", entityId: t.incidentId, action: "keep_open", performedBy: by, summary: `${t.ticketNo}: device suggestion to close dismissed — ${note}` });
  }
  const [x] = await suggestionsWhere(sql`t.id = ${t.id}`); res.json(x);
}));

export default router;
