/**
 * ITH-098 device policy & compliance · ITH-075 software and licence compliance.
 * View: IT with Asset Registry read. Change the policy: Super Admin or IT Asset Admin. Change software rules: also
 * IT staff with Licences write. Every change is confirmed in the app, audited with old → new, and re-checks all devices.
 */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess, can } from "../lib/rbac";
import { POLICY_RULES, activePolicy, catalog, classify } from "../lib/compliance";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); }
};
const uid = (req: Request) => Number((req.session as any)?.userId) || undefined;
const qs = (v: unknown) => String(Array.isArray(v) ? v[0] : v ?? "");
const canView = async (req: Request) => { const a = await getAccess(req); return !!a && (a.isAdmin || can(a, "asset_registry", "read")); };
const canPolicy = async (req: Request) => { const a = await getAccess(req); return !!a && (a.isAdmin || a.perms?.asset_registry === "admin"); };
const canSoftware = async (req: Request) => { const a = await getAccess(req); return !!a && (a.isAdmin || a.perms?.asset_registry === "admin" || can(a, "asset_licenses", "write")); };
const recheck = async () => { const { recheckDevices } = await import("./asset-agent"); return recheckDevices(); };

/* ── device policy ── */
router.get("/device-policy", requireAuth, wrap(async (req, res) => {
  if (!await canView(req)) return fail(res, 403, "No access to the device policy");
  const p = await activePolicy(); if (!p) return fail(res, 404, "No device policy");
  const counts = rowsOf(await db.execute(sql`SELECT coalesce(compliance_state, 'unknown') AS state, count(*)::int AS n FROM asset_agents WHERE status = 'Active' GROUP BY 1`));
  res.json({ ...p, rules: p.rules.map(({ check, ...r }) => r), canEdit: await canPolicy(req), counts: Object.fromEntries(counts.map(c => [c.state, c.n])) });
}));
router.put("/device-policy", requireAuth, wrap(async (req, res) => {
  if (!await canPolicy(req)) return fail(res, 403, "Only Super Admin or IT Asset Admin can change the device policy");
  const p = await activePolicy(); if (!p) return fail(res, 404, "No device policy");
  const body = req.body || {}; const next: Record<string, any> = {}; const changes: string[] = [];
  for (const r of POLICY_RULES) {
    const cur = p.rules.find(x => x.key === r.key)!; const inp = body.rules?.[r.key] || {};
    const on = inp.on === undefined ? cur.on : !!inp.on;
    const severity = inp.severity === "Critical" || inp.severity === "Warning" ? inp.severity : cur.severity;
    let value: any = r.key === "agent_current" ? undefined : inp.value === undefined ? cur.value : inp.value;
    if (typeof r.value === "number" && value !== undefined) { value = Number(value); if (!Number.isFinite(value) || value < 0 || value > 100000) return fail(res, 400, `${r.label}: enter a valid number`); }
    if (typeof r.value === "string" && value !== undefined) value = String(value).slice(0, 500);
    next[r.key] = { on, severity, ...(value !== undefined ? { value } : {}) };
    if (on !== cur.on) changes.push(`${r.label}: ${cur.on ? "on" : "off"} → ${on ? "on" : "off"}`);
    if (severity !== cur.severity) changes.push(`${r.label}: ${cur.severity} → ${severity}`);
    if (value !== undefined && String(value) !== String(cur.value ?? "")) changes.push(`${r.label}: ${cur.value} → ${value}`);
  }
  const appliesTo = body.appliesTo === "All" ? "All" : body.appliesTo === "Workstation" ? "Workstation" : p.appliesTo;
  if (appliesTo !== p.appliesTo) changes.push(`Applies to: ${p.appliesTo} → ${appliesTo}`);
  const name = String(body.name || p.name).trim().slice(0, 120); if (name !== p.name) changes.push(`Name: ${p.name} → ${name}`);
  if (!changes.length) return res.json({ ok: true, unchanged: true });
  const by = await getPerformedBy(uid(req));
  await db.execute(sql`UPDATE device_policies SET rules = ${JSON.stringify(next)}::jsonb, applies_to = ${appliesTo}, name = ${name}, version = version + 1, updated_by = ${by}, updated_at = now() WHERE id = ${p.id}`);
  await logAudit({ entityType: "device_policy", entityId: p.id, action: "update", performedBy: by, summary: `Device policy v${p.version + 1}: ${changes.join("; ")}`.slice(0, 2000), newValues: { changes } });
  const n = await recheck();
  res.json({ ok: true, version: p.version + 1, changes, rechecked: n });
}));
router.post("/device-policy/recheck", requireAuth, wrap(async (req, res) => {
  if (!await canPolicy(req) && !await canSoftware(req)) return fail(res, 403, "No access");
  res.json({ rechecked: await recheck() });
}));
/** Devices and their compliance: ?state=compliant|non_compliant|unknown&q&page */
router.get("/device-policy/compliance", requireAuth, wrap(async (req, res) => {
  if (!await canView(req)) return fail(res, 403, "No access");
  const st = qs(req.query.state); const q = qs(req.query.q).trim().toLowerCase(); const page = Math.max(1, Number(qs(req.query.page)) || 1); const size = 10;
  const where = sql`g.status = 'Active' AND (${st} = '' OR coalesce(g.compliance_state, 'unknown') = ${st})
    AND (${q} = '' OR lower(concat_ws(' ', g.hostname, s.asset_tag, e.name, e.employee_code, g.compliance::text)) LIKE ${"%" + q + "%"})`;
  const from = sql`FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id LEFT JOIN users e ON e.id = coalesce(CASE WHEN s.status = 'Allocated' THEN s.owner_id END, g.user_id)`;
  const [c] = rowsOf(await db.execute(sql`SELECT count(*)::int AS n ${from} WHERE ${where}`));
  const rows = rowsOf(await db.execute(sql`SELECT g.id, g.hostname, s.asset_tag AS "assetTag", e.name AS employee, e.employee_code AS "employeeCode", coalesce(g.compliance_state, 'unknown') AS state, g.compliance, g.last_seen_at AS "lastSeenAt", g.agent_version AS "agentVersion"
    ${from} WHERE ${where} ORDER BY CASE g.compliance_state WHEN 'non_compliant' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END, g.hostname LIMIT ${size} OFFSET ${(page - 1) * size}`));
  const top = rowsOf(await db.execute(sql`SELECT f->>'label' AS label, count(*)::int AS n FROM asset_agents g, jsonb_array_elements(coalesce(g.compliance->'failed', '[]'::jsonb)) f WHERE g.status = 'Active' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`));
  res.json({ rows, total: c.n, top });
}));

/** ITH-107 — compliance report for every device and user: one row per device, one column per policy rule. ?format=csv|xlsx */
router.get("/device-policy/report", requireAuth, wrap(async (req, res) => {
  if (!await canView(req)) return fail(res, 403, "No access to the compliance report");
  const p = await activePolicy(); if (!p) return fail(res, 404, "No device policy");
  const rules = p.rules.filter((r: any) => r.on);
  const rows = rowsOf(await db.execute(sql`SELECT g.hostname, g.platform, g.serial_number, g.agent_version, g.last_seen_at, g.last_user, coalesce(g.compliance_state, 'unknown') AS state, g.compliance,
      s.asset_tag, s.location, s.department AS asset_dept, e.name AS employee, e.employee_code, e.email, e.department, e.designation
    FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id LEFT JOIN users e ON e.id = coalesce(CASE WHEN s.status = 'Allocated' THEN s.owner_id END, g.user_id)
    WHERE g.status = 'Active' ORDER BY CASE g.compliance_state WHEN 'non_compliant' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END, g.hostname`));
  const d = (v: any) => (v ? new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const STATE: Record<string, string> = { compliant: "Compliant", non_compliant: "Not compliant", unknown: "Not checked yet", not_applicable: "Not applicable (server)" };
  const out = rows.map(g => {
    const c = g.compliance || {}; const failed = new Map((c.failed || []).map((f: any) => [f.key, f])); const unknown = new Set((c.unknown || []).map((u: any) => u.key));
    const row: Record<string, any> = { "Device": g.hostname, "Asset tag": g.asset_tag || "Not linked", "Employee": g.employee || "", "Employee code": g.employee_code || "", "Email": g.email || "",
      "Department": g.department || g.asset_dept || "", "Designation": g.designation || "", "Location": g.location || "", "Signed-in user": g.last_user || "", "Type": g.platform || "", "Serial number": g.serial_number || "",
      "Agent version": g.agent_version || "", "Last report": d(g.last_seen_at), "Compliance": STATE[g.state] || g.state, "Rules met": c.total ? `${c.passed} of ${c.total}` : "",
      "Rules not met": (c.failed || []).map((f: any) => f.label).join("; "), "Policy version": c.version ? `v${c.version}` : "", "Checked": d(c.at) };
    for (const r of rules) {
      const f: any = failed.get(r.key);
      row[r.label + (r.unit && r.value !== undefined ? ` (${r.value} ${r.unit})` : "")] = g.state === "not_applicable" ? "N/A" : !c.at ? "Not checked" : f ? `Fail${f.detail ? ": " + f.detail : ""}` : unknown.has(r.key) ? "Not reported" : "Pass";
    }
    return row;
  });
  const by = await getPerformedBy(uid(req)).catch(() => "System");
  const fmt = qs(req.query.format) === "xlsx" ? "xlsx" : "csv"; const name = `IT_Hub_Device_Compliance_${new Date().toISOString().slice(0, 10)}.${fmt}`;
  void logAudit({ entityType: "device_policy", entityId: p.id, action: "export", performedBy: by, summary: `Compliance report downloaded (${out.length} devices, ${fmt.toUpperCase()}, policy v${p.version})` }).catch(() => {});
  const XLSX = await import("xlsx"); const ws = XLSX.utils.json_to_sheet(out.length ? out : [{ Device: "No devices" }]);
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  if (fmt === "csv") { res.setHeader("Content-Type", "text/csv; charset=utf-8"); return res.send("\uFEFF" + XLSX.utils.sheet_to_csv(ws)); }
  ws["!cols"] = Object.keys(out[0] || { Device: 1 }).map(k => ({ wch: Math.min(36, Math.max(10, k.length + 2)) })); ws["!autofilter"] = { ref: ws["!ref"] as string };
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Compliance");
  const sum = [["Policy", p.name], ["Version", `v${p.version}`], ["Devices", out.length], ...Object.entries(STATE).map(([k, l]) => [l, rows.filter(r => r.state === k).length])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Summary");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}));

/* ── software & licences ── */
router.get("/software/apps", requireAuth, wrap(async (req, res) => {
  if (!await canView(req)) return fail(res, 403, "No access");
  const q = qs(req.query.q).trim().toLowerCase(); const st = qs(req.query.status); const page = Math.max(1, Number(qs(req.query.page)) || 1); const size = 10;
  const apps = rowsOf(await db.execute(sql`SELECT x.name, max(x.publisher) AS publisher, count(DISTINCT x.agent_id)::int AS devices, string_agg(DISTINCT x.version, ', ') AS versions
    FROM asset_software x JOIN asset_agents g ON g.id = x.agent_id AND g.status = 'Active' WHERE (${q} = '' OR lower(x.name || ' ' || coalesce(x.publisher, '')) LIKE ${"%" + q + "%"}) GROUP BY x.name ORDER BY count(DISTINCT x.agent_id) DESC, x.name LIMIT 5000`));
  const cat = await catalog();
  const lic = rowsOf(await db.execute(sql`SELECT l.id, l.product_name AS name, l.seats_total AS seats, (SELECT count(*)::int FROM asset_license_assignments a WHERE a.license_id = l.id AND a.status = 'Active') AS assigned FROM asset_licenses l`));
  const all = apps.map(a => { const c = classify(a.name, a.publisher, cat); const l = c?.licenseId ? lic.find(x => x.id === c.licenseId) : null;
    return { ...a, status: c?.status || "Unreviewed", ruleId: c?.id || null, rule: c?.match || null, notes: c?.notes || null, license: l ? { id: l.id, name: l.name, seats: l.seats, assigned: l.assigned, over: a.devices > l.seats } : null }; });
  const counts = all.reduce((m: any, a) => { m[a.status] = (m[a.status] || 0) + 1; return m; }, {});
  const list = st ? all.filter(a => a.status === st) : all;
  res.json({ rows: list.slice((page - 1) * size, page * size), total: list.length, counts });
}));
router.get("/software/apps/devices", requireAuth, wrap(async (req, res) => {
  if (!await canView(req)) return fail(res, 403, "No access");
  const name = qs(req.query.name);
  res.json(rowsOf(await db.execute(sql`SELECT g.id, g.hostname, s.asset_tag AS "assetTag", e.name AS employee, e.employee_code AS "employeeCode", x.version, x.install_date AS "installDate"
    FROM asset_software x JOIN asset_agents g ON g.id = x.agent_id AND g.status = 'Active' LEFT JOIN assets s ON s.id = g.asset_id LEFT JOIN users e ON e.id = coalesce(CASE WHEN s.status = 'Allocated' THEN s.owner_id END, g.user_id)
    WHERE x.name = ${name} ORDER BY g.hostname LIMIT 500`)));
}));
router.get("/software/issues", requireAuth, wrap(async (req, res) => {
  if (!await canView(req)) return fail(res, 403, "No access");
  res.json(rowsOf(await db.execute(sql`SELECT x.id, x.kind, x.severity, x.message, x.opened_at AS "openedAt", x.ticket_no AS "ticketNo", g.id AS "agentId", g.hostname, e.name AS employee, e.employee_code AS "employeeCode",
      (x.ignored_at IS NOT NULL AND (x.ignore_until IS NULL OR x.ignore_until > now())) AS ignored
    FROM asset_agent_alerts x JOIN asset_agents g ON g.id = x.agent_id LEFT JOIN assets s ON s.id = g.asset_id LEFT JOIN users e ON e.id = coalesce(CASE WHEN s.status = 'Allocated' THEN s.owner_id END, g.user_id)
    WHERE x.closed_at IS NULL AND (x.kind LIKE 'software:%' OR x.kind LIKE 'licence:%' OR x.kind = 'policy:activated') ORDER BY x.severity, x.opened_at DESC LIMIT 500`)));
}));
router.get("/software/catalog", requireAuth, wrap(async (req, res) => {
  if (!await canView(req)) return fail(res, 403, "No access");
  res.json({ rows: rowsOf(await db.execute(sql`SELECT c.id, c.match, c.publisher, c.status, c.license_id AS "licenseId", l.product_name AS "licenseName", c.notes, c.is_active AS "isActive", c.created_by AS "createdBy", c.created_at AS "createdAt", c.updated_by AS "updatedBy", c.updated_at AS "updatedAt"
    FROM software_catalog c LEFT JOIN asset_licenses l ON l.id = c.license_id ORDER BY c.is_active DESC, c.status, c.match`)),
    licenses: rowsOf(await db.execute(sql`SELECT id, product_name AS name, seats_total AS seats FROM asset_licenses WHERE is_active ORDER BY product_name`)), canEdit: await canSoftware(req) });
}));
const STATUSES = ["Licensed", "Free", "Not allowed", "Review"];
router.post("/software/catalog", requireAuth, wrap(async (req, res) => {
  if (!await canSoftware(req)) return fail(res, 403, "No access to change software rules");
  const match = String(req.body?.match || "").trim().slice(0, 120); const status = String(req.body?.status || "");
  if (match.length < 3) return fail(res, 400, "Enter at least 3 characters of the application name");
  if (!STATUSES.includes(status)) return fail(res, 400, "Choose Licensed, Free, Not allowed or Review");
  const licenseId = Number(req.body?.licenseId) || null; if (status === "Licensed" && !licenseId) return fail(res, 400, "Choose the licence that covers it");
  const [d] = rowsOf(await db.execute(sql`SELECT id, is_active FROM software_catalog WHERE lower(match) = ${match.toLowerCase()}`));
  if (d) return fail(res, 409, d.is_active ? "A rule for this name already exists — edit it" : "A rule for this name exists but is inactive — activate it");
  const by = await getPerformedBy(uid(req));
  const [r] = rowsOf(await db.execute(sql`INSERT INTO software_catalog (match, publisher, status, license_id, notes, created_by) VALUES (${match}, ${String(req.body?.publisher || "").trim() || null}, ${status}, ${licenseId}, ${String(req.body?.notes || "").trim() || null}, ${by}) RETURNING id`));
  await logAudit({ entityType: "software_rule", entityId: r.id, action: "create", performedBy: by, summary: `Software rule “${match}” → ${status}` });
  res.status(201).json({ id: r.id, rechecked: await recheck() });
}));
router.patch("/software/catalog/:id", requireAuth, wrap(async (req, res) => {
  if (!await canSoftware(req)) return fail(res, 403, "No access to change software rules");
  const id = Number(req.params.id); const [o] = rowsOf(await db.execute(sql`SELECT * FROM software_catalog WHERE id = ${id}`)); if (!o) return fail(res, 404, "Not found");
  const b = req.body || {};
  const next = { status: b.status ?? o.status, license_id: b.licenseId === undefined ? o.license_id : (Number(b.licenseId) || null), notes: b.notes === undefined ? o.notes : (String(b.notes).trim() || null), is_active: b.isActive === undefined ? o.is_active : !!b.isActive, publisher: b.publisher === undefined ? o.publisher : (String(b.publisher).trim() || null) };
  if (!STATUSES.includes(next.status)) return fail(res, 400, "Choose Licensed, Free, Not allowed or Review");
  if (next.status === "Licensed" && !next.license_id) return fail(res, 400, "Choose the licence that covers it");
  if (o.is_active && !next.is_active && String(b.reason || "").trim().length < 5) return fail(res, 400, "Give a reason for deactivating the rule");
  const ch = (["status", "license_id", "notes", "is_active", "publisher"] as const).filter(k => String((next as any)[k] ?? "") !== String(o[k] ?? "")).map(k => `${k}: ${o[k] ?? "—"} → ${(next as any)[k] ?? "—"}`);
  if (!ch.length) return res.json({ ok: true, unchanged: true });
  const by = await getPerformedBy(uid(req));
  await db.execute(sql`UPDATE software_catalog SET status = ${next.status}, license_id = ${next.license_id}, notes = ${next.notes}, is_active = ${next.is_active}, publisher = ${next.publisher}, updated_by = ${by}, updated_at = now() WHERE id = ${id}`);
  await logAudit({ entityType: "software_rule", entityId: id, action: "update", performedBy: by, summary: `Software rule “${o.match}”: ${ch.join("; ")}${b.reason ? ` — ${b.reason}` : ""}` });
  res.json({ ok: true, rechecked: await recheck() });
}));
router.delete("/software/catalog/:id", requireAuth, (_req, res) => { fail(res, 405, "Software rules cannot be deleted — deactivate them instead"); });

export default router;
