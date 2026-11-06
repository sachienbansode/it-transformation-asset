import express, { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, settingsTable } from "@workspace/db";
import { eq, like, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess, can } from "../lib/rbac";

/*
 * IT Hub device agent (Windows workstations and servers).
 *  Public (device token, no session):
 *    POST /agent/v1/enrol    { code, deviceId, hostname, serial, … }  → { token }  (code from IT Hub › Device Agents)
 *    POST /agent/v1/checkin  Authorization: Bearer <token>, health + daily usage (+ software once a day)
 *  Signed-in (Asset Registry access):
 *    enrolment codes, fleet list, per-asset health, revoke / link, agent package download.
 *  Privacy: the agent sends hardware / security health, signed-in user, active vs idle minutes and minutes per
 *  foreground application. Never keystrokes, screenshots, window titles, browsing or file contents.
 */

export const publicAgentRouter = Router();
const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const s = (v: unknown, max = 200) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim().slice(0, max));
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); }
};

/* ── settings ───────────────────────────────────────────────────────────── */
export type Thresholds = { diskFreePct: number; batteryHealthPct: number; patchDays: number; offlineDays: number; rebootDays: number; idleDays: number };
const DEF_T: Thresholds = { diskFreePct: 10, batteryHealthPct: 60, patchDays: 30, offlineDays: 7, rebootDays: 14, idleDays: 14 };
export async function agentSettings() {
  const rows = await db.select().from(settingsTable).where(like(settingsTable.key, "assetAgent.%"));
  const g = (k: string) => { let v: any = rows.find(r => r.key === k)?.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { /* keep */ } } return v; };
  const t = { ...DEF_T, ...(g("assetAgent.thresholds") || {}) };
  return { checkinMinutes: Math.min(240, Math.max(5, Number(g("assetAgent.checkinMinutes")) || 15)), retentionDays: Math.max(30, Number(g("assetAgent.retentionDays")) || 180), trackApps: g("assetAgent.trackApps") !== false, thresholds: t as Thresholds };
}

/* ── health rules → alerts + overall state ──────────────────────────────── */
export function evaluate(h: any, platform: string, t: Thresholds, now = new Date()) {
  const out: { kind: string; severity: "Warning" | "Critical"; message: string }[] = [];
  const days = (d: any) => d ? (now.getTime() - new Date(d).getTime()) / 86_400_000 : null;
  for (const d of (h?.disks || [])) {
    if ((num(d.sizeGb) ?? 0) < 1) continue;   // card readers, empty virtual / cloud drives report 0 GB
    const free = num(d.freePct);
    if (free !== null && free < t.diskFreePct) out.push({ kind: `disk:${d.drive}`, severity: free < t.diskFreePct / 2 ? "Critical" : "Warning", message: `Drive ${d.drive} has only ${free.toFixed(0)}% free (${num(d.freeGb)?.toFixed(1) ?? "?"} GB of ${num(d.sizeGb)?.toFixed(0) ?? "?"} GB)` });
  }
  for (const p of (h?.physicalDisks || [])) if (p.health && !/healthy/i.test(p.health)) out.push({ kind: `smart:${p.name}`, severity: /unhealthy|fail/i.test(p.health) ? "Critical" : "Warning", message: `Disk ${p.name} reports ${p.health}${p.opStatus ? ` (${p.opStatus})` : ""} — back up and plan replacement` });
  if (h?.battery?.present && num(h.battery.healthPct) !== null && h.battery.healthPct > 0 && h.battery.healthPct <= 150 && h.battery.healthPct < t.batteryHealthPct) out.push({ kind: "battery", severity: h.battery.healthPct < t.batteryHealthPct - 20 ? "Critical" : "Warning", message: `Battery holds ${Math.round(h.battery.healthPct)}% of its design capacity — replacement due` });
  const av = h?.security?.av;
  if (Array.isArray(av) && platform === "Workstation") {
    if (!av.length || !av.some((a: any) => a.enabled)) out.push({ kind: "antivirus", severity: "Critical", message: "No antivirus is switched on" });
    else if (!av.some((a: any) => a.enabled && a.upToDate !== false)) out.push({ kind: "antivirus-defs", severity: "Warning", message: "Antivirus definitions are out of date" });
  }
  const bl = h?.security?.bitlocker;
  if (Array.isArray(bl) && platform === "Workstation") { const sys = bl.find((b: any) => /^c/i.test(b.drive || "")) || bl[0]; if (sys && !/on|encrypt/i.test(String(sys.status))) out.push({ kind: "bitlocker", severity: "Warning", message: `System drive is not encrypted (BitLocker ${sys.status || "off"})` }); }
  const fw = h?.security?.firewall;
  if (fw && [fw.domain, fw.private, fw.public].some(v => v === false)) out.push({ kind: "firewall", severity: "Warning", message: `Windows Firewall is off for: ${[["domain", fw.domain], ["private", fw.private], ["public", fw.public]].filter(([, v]) => v === false).map(([k]) => k).join(", ")}` });
  const pd = days(h?.patches?.lastInstalled);
  if (pd !== null && pd > t.patchDays) out.push({ kind: "patches", severity: pd > t.patchDays * 2 ? "Critical" : "Warning", message: `No Windows update installed for ${Math.floor(pd)} days` });
  const up = num(h?.uptimeHours);
  if (up !== null && up / 24 > t.rebootDays) out.push({ kind: "reboot", severity: "Warning", message: `Not restarted for ${Math.floor(up / 24)} days${h?.patches?.pendingReboot ? " — updates are waiting for a restart" : ""}` });
  else if (h?.patches?.pendingReboot) out.push({ kind: "pending-reboot", severity: "Warning", message: "Restart pending to finish installing updates" });
  const cpu = num(h?.cpu?.pct), mem = num(h?.mem?.usedPct);
  if (mem !== null && mem >= 95) out.push({ kind: "memory", severity: "Warning", message: `Memory ${mem.toFixed(0)}% used` });
  if (cpu !== null && cpu >= 95) out.push({ kind: "cpu", severity: "Warning", message: `CPU ${cpu.toFixed(0)}% busy` });
  const state = out.some(a => a.severity === "Critical") ? "Critical" : out.length ? "Warning" : "Healthy";
  return { alerts: out, state };
}

async function syncAlerts(agentId: number, assetId: number | null, list: { kind: string; severity: string; message: string }[], keep: (k: string) => boolean = () => false) {
  const open = rowsOf(await db.execute(sql`SELECT id, kind, severity FROM asset_agent_alerts WHERE agent_id = ${agentId} AND closed_at IS NULL`));
  const kinds = new Set(list.map(a => a.kind));
  const closed: number[] = [];
  for (const o of open) if (!kinds.has(o.kind) && !keep(o.kind)) { await db.execute(sql`UPDATE asset_agent_alerts SET closed_at = now() WHERE id = ${o.id}`); closed.push(o.id); }
  if (closed.length) void import("./device-support").then(m => m.alertsClosed(closed)).catch(e => console.error(e));
  const fresh: typeof list = [];
  for (const a of list) {
    const ex = open.find(o => o.kind === a.kind);
    if (ex) await db.execute(sql`UPDATE asset_agent_alerts SET severity = ${a.severity}, message = ${a.message}, asset_id = ${assetId} WHERE id = ${ex.id}`);
    else { await db.execute(sql`INSERT INTO asset_agent_alerts (agent_id, asset_id, kind, severity, message) VALUES (${agentId}, ${assetId}, ${a.kind}, ${a.severity}, ${a.message}) ON CONFLICT DO NOTHING`); fresh.push(a); }
  }
  return fresh;
}

/** New Critical alerts → in-app notification to admins. */
async function notifyCritical(agent: any, fresh: { severity: string; message: string }[]) {
  const crit = fresh.filter(a => a.severity === "Critical"); if (!crit.length) return;
  const label = agent.assetTag ? `${agent.assetTag} (${agent.hostname})` : agent.hostname;
  const admins = rowsOf(await db.execute(sql`SELECT id FROM users WHERE is_active AND role = 'admin'`));
  for (const u of admins) await db.execute(sql`INSERT INTO notifications (user_id, title, message, type, link) VALUES (${u.id}, ${`Device health critical: ${label}`}, ${crit.map(c => c.message).join("; ").slice(0, 500)}, 'error', '/asset-agents')`);
}

/* ── matching a device to the register ──────────────────────────────────── */
async function matchAsset(serial: string | null, hostname: string | null) {
  if (serial && !/^(to be filled|default string|system serial number|0+|none|n\/a)$/i.test(serial)) {
    const r = rowsOf(await db.execute(sql`SELECT id, asset_tag FROM assets WHERE is_active AND lower(serial_number) = lower(${serial})`));
    if (r.length === 1) return { assetId: r[0].id, note: `Matched by serial ${serial}` };
    if (r.length > 1) return { assetId: null, note: `Serial ${serial} matches ${r.length} assets — link it manually` };
  }
  if (hostname) {
    const r = rowsOf(await db.execute(sql`SELECT id FROM assets WHERE is_active AND lower(asset_tag) = lower(${hostname})`));
    if (r.length === 1) return { assetId: r[0].id, note: `Matched by computer name ${hostname}` };
  }
  return { assetId: null, note: serial ? `No register asset with serial ${serial}` : "No serial number reported" };
}

/* ═══ PUBLIC: device enrolment and check-in ═══════════════════════════════ */
const hits = new Map<string, { n: number; at: number }>();
const normCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
/* key kept encrypted so IT can re-download / re-share the installer (AES-256-GCM, key from SESSION_SECRET) */
const encKey = () => crypto.createHash("sha256").update(`ithub-agent:${process.env.SESSION_SECRET || process.env.DATABASE_URL || "ithub"}`).digest();
function enc(t: string) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", encKey(), iv); const d = Buffer.concat([c.update(t, "utf8"), c.final()]); return [iv, c.getAuthTag(), d].map(x => x.toString("base64")).join("."); }
function dec(t: string | null) { if (!t) return null; try { const [iv, tag, d] = t.split(".").map(x => Buffer.from(x, "base64")); const c = crypto.createDecipheriv("aes-256-gcm", encKey(), iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString("utf8"); } catch { return null; } }
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now(), h = hits.get(key);
  if (!h || now - h.at > windowMs) { hits.set(key, { n: 1, at: now }); return false; }
  h.n++; return h.n > max;
}

/**
 * Enrolment. Every install needs a valid key:
 *  - user key (default): one device, bound to an employee (and optionally an asset — then the computer's serial must match),
 *    expires; a second install with the same key is refused.
 *  - bulk key (admins, for Intune / SCCM rollouts): N devices, expires.
 */
/** One line in a key's activity log. */
async function keyEv(codeId: number, action: string, actor: string | null, req: Request | null, detail?: string | null) {
  try { await db.execute(sql`INSERT INTO asset_agent_code_events (code_id, action, actor, ip, user_agent, detail) VALUES (${codeId}, ${action}, ${actor}, ${req ? req.ip || null : null}, ${req ? String(req.get("user-agent") || "").slice(0, 300) || null : null}, ${detail ?? null})`); }
  catch (e) { console.error("key log failed", e); }
}

publicAgentRouter.post("/agent/v1/enrol", wrap(async (req, res) => {
  const ip = req.ip || "?";
  if (limited(`enrol:${ip}`, 30, 60_000)) return fail(res, 429, "Too many enrolment attempts — wait a minute");
  const b = req.body || {};
  const code = s(b.code, 40), deviceId = s(b.deviceId, 64);
  if (!code || !deviceId || !/^[A-Za-z0-9-]{8,64}$/.test(deviceId)) return fail(res, 400, "Installation key and device id are required");
  const [c] = rowsOf(await db.execute(sql`SELECT k.*, s.asset_tag, s.serial_number AS asset_serial, u.name AS user_name, u.is_active AS user_active
      FROM asset_agent_codes k LEFT JOIN assets s ON s.id = k.asset_id LEFT JOIN users u ON u.id = k.user_id WHERE k.code_hash = ${sha(normCode(code))}`));
  if (!c) return fail(res, 403, "Installation key is not valid — ask IT for a new one");
  const who = `Device ${s(b.hostname, 80) || deviceId}`;
  const refuse = async (msg: string) => { await keyEv(c.id, "refused", who, req, `Install refused on ${s(b.hostname, 80) || "?"} (serial ${s(b.serial, 80) || "?"}): ${msg}`); return fail(res, 403, msg); };
  if (!c.is_active) return refuse("Installation key is not valid — ask IT for a new one");
  if (new Date(c.expires_at) < new Date()) return refuse("Installation key has expired — ask IT for a new one");
  const hostname = s(b.hostname, 80), serial = s(b.serial, 80);
  const [ex] = rowsOf(await db.execute(sql`SELECT id, status FROM asset_agents WHERE device_id = ${deviceId}`));
  if (ex && ex.status === "Revoked") return refuse("This device was removed by IT — ask IT to re-enable it");
  if (c.kind === "user") {
    if (c.used_by_agent && (!ex || c.used_by_agent !== ex.id)) {
      const [u] = rowsOf(await db.execute(sql`SELECT hostname FROM asset_agents WHERE id = ${c.used_by_agent}`));
      return refuse(`This installation key was already used on ${u?.hostname || "another computer"} — each key installs one computer. Ask IT for a new key.`);
    }
    if (c.user_id && c.user_active === false) return refuse("The employee this key was issued to is no longer active");
    if (c.asset_id && c.asset_serial && (!serial || serial.toLowerCase() !== String(c.asset_serial).toLowerCase()))
      return refuse(`This key is for ${c.asset_tag} (serial ${c.asset_serial}), but this computer's serial is ${serial || "unknown"}. Install it on ${c.asset_tag}, or ask IT for a key for this computer.`);
  } else if (c.uses >= c.max_uses) return refuse("Installation key has been used up — ask IT for a new one");
  const token = crypto.randomBytes(32).toString("hex");
  const platform = /server/i.test(String(b.platform || b.osName || "")) ? "Server" : "Workstation";
  let m = c.asset_id ? { assetId: c.asset_id as number | null, note: `Installed with ${c.user_name ? `${c.user_name}'s` : "a"} key for ${c.asset_tag}` } : await matchAsset(serial, hostname);
  if (!c.asset_id && c.user_id && !m.assetId) m = { assetId: null, note: `Installed with ${c.user_name}'s key — no register asset with serial ${serial || "?"}` };
  let id: number;
  if (ex) {
    id = ex.id;
    await db.execute(sql`UPDATE asset_agents SET token_hash = ${sha(token)}, hostname = ${hostname}, serial_number = ${serial}, platform = ${platform}, os_name = ${s(b.osName)}, os_version = ${s(b.osVersion)}, agent_version = ${s(b.agentVersion, 20)},
      asset_id = coalesce(${c.asset_id ?? null}, asset_id, ${m.assetId}), match_note = CASE WHEN asset_id IS NULL OR ${!!c.asset_id} THEN ${m.note} ELSE match_note END, last_ip = ${ip},
      user_id = coalesce(${c.user_id ?? null}, user_id), enrolled_by_code = ${c.id} WHERE id = ${id}`);
  } else {
    const [r] = rowsOf(await db.execute(sql`INSERT INTO asset_agents (device_id, token_hash, asset_id, match_note, hostname, serial_number, manufacturer, model, platform, os_name, os_version, agent_version, last_ip, enrolled_by_code, user_id)
      VALUES (${deviceId}, ${sha(token)}, ${m.assetId}, ${m.note}, ${hostname}, ${serial}, ${s(b.manufacturer)}, ${s(b.model)}, ${platform}, ${s(b.osName)}, ${s(b.osVersion)}, ${s(b.agentVersion, 20)}, ${ip}, ${c.id}, ${c.user_id ?? null}) RETURNING id`));
    id = r.id;
  }
  await db.execute(sql`UPDATE asset_agent_alerts SET closed_at = now() WHERE agent_id = ${id} AND kind = 'uninstalled' AND closed_at IS NULL`);
  await keyEv(c.id, ex ? "reinstalled" : "installed", `Device ${hostname || deviceId}`, req, `${ex ? "Re-installed" : "Installed"} on ${hostname || "?"} (serial ${serial || "?"}, ${s(b.osName) || "Windows"}, agent ${s(b.agentVersion, 20) || "?"}) — ${m.note}`);
  await db.execute(sql`UPDATE asset_agent_codes SET uses = uses + 1, used_by_agent = coalesce(used_by_agent, ${c.kind === "user" ? id : null}), used_at = coalesce(used_at, now()) WHERE id = ${c.id}`);
  void logAudit({ entityType: "asset_agent", entityId: id, action: "enrol", performedBy: `Device ${hostname || deviceId}`, summary: `Device agent installed on ${hostname} (${serial || "no serial"}) with ${c.kind === "user" ? `${c.user_name || "user"}'s key …${c.code_hint}` : `bulk key "${c.label}"`} — ${m.note}` }).catch(() => {});
  const st = await agentSettings();
  res.status(201).json({ token, agentId: id, assetMatched: !!m.assetId, matchNote: m.note, checkinMinutes: st.checkinMinutes, trackApps: st.trackApps });
}));

async function agentFromToken(req: Request) {
  const t = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[a-f0-9]{64}$/.test(t)) return null;
  const [a] = rowsOf(await db.execute(sql`SELECT g.*, s.asset_tag AS "assetTag" FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE g.token_hash = ${sha(t)}`));
  return a || null;
}

publicAgentRouter.post("/agent/v1/checkin", wrap(async (req, res) => {
  const ag = await agentFromToken(req);
  if (!ag) return fail(res, 401, "Unknown device token — enrol again");
  if (ag.status === "Revoked") return fail(res, 410, "This device was removed from IT Hub — uninstall the agent");
  if (limited(`chk:${ag.id}`, 20, 60_000)) return fail(res, 429, "Checking in too often");
  const h = req.body?.health || {};
  const st = await agentSettings();
  const now = new Date();
  // keep the payload bounded
  for (const k of ["disks", "physicalDisks"]) if (Array.isArray(h[k])) h[k] = h[k].slice(0, 26);
  if (h.security?.av) h.security.av = h.security.av.slice(0, 10);
  const user = s(h.user, 120);
  const ev = evaluate(h, ag.platform, st.thresholds, now);
  // serial changed (motherboard swap / re-image) → try to match again if unlinked
  let assetId = ag.asset_id;
  if (!assetId) { const m = await matchAsset(s(h.serial, 80) || ag.serial_number, s(h.hostname, 80) || ag.hostname); if (m.assetId) { assetId = m.assetId; await db.execute(sql`UPDATE asset_agents SET asset_id = ${assetId}, match_note = ${m.note} WHERE id = ${ag.id}`); } }
  await db.execute(sql`UPDATE asset_agents SET latest = ${JSON.stringify(h)}::jsonb, health_state = ${ev.state}, last_seen_at = now(), last_user = coalesce(${user}, last_user), last_ip = ${req.ip || null},
      hostname = coalesce(${s(h.hostname, 80)}, hostname), os_name = coalesce(${s(h.os?.name)}, os_name), os_version = coalesce(${s(h.os?.version)}, os_version), agent_version = coalesce(${s(req.body?.agentVersion, 20)}, agent_version),
      manufacturer = coalesce(${s(h.manufacturer)}, manufacturer), model = coalesce(${s(h.model)}, model) WHERE id = ${ag.id}`);
  const minFree = Math.min(...(h.disks || []).map((d: any) => num(d.freePct)).filter((x: any) => x !== null), 100);
  await db.execute(sql`INSERT INTO asset_health_snapshots (agent_id, asset_id, cpu_pct, mem_pct, disk_min_free_pct, battery_health_pct, data)
    VALUES (${ag.id}, ${assetId}, ${num(h.cpu?.pct)}, ${num(h.mem?.usedPct)}, ${Number.isFinite(minFree) ? minFree : null}, ${h.battery?.present ? num(h.battery.healthPct) : null}, ${JSON.stringify(h)}::jsonb)`);
  // daily usage: the device sends today's (and unsent earlier days') running totals; keep the larger numbers
  const usage = Array.isArray(req.body?.usage) ? req.body.usage.slice(0, 31) : [];
  for (const u of usage) {
    const day = s(u.day, 10); const un = s(u.user, 120);
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !un) continue;
    const apps: Record<string, number> = {};
    if (st.trackApps && u.apps && typeof u.apps === "object") for (const [k, v] of Object.entries(u.apps).slice(0, 200)) { const n = Math.round(Number(v)); if (n > 0 && n <= 1440) apps[String(k).slice(0, 80)] = n; }
    const act = Math.min(1440, Math.max(0, Math.round(Number(u.activeMins) || 0))), idle = Math.min(1440, Math.max(0, Math.round(Number(u.idleMins) || 0)));
    await db.execute(sql`INSERT INTO asset_usage_daily (agent_id, day, user_name, asset_id, first_seen, last_seen, active_mins, idle_mins, apps)
      VALUES (${ag.id}, ${day}::date, ${un}, ${assetId}, ${s(u.firstSeen, 40)}::timestamptz, ${s(u.lastSeen, 40)}::timestamptz, ${act}, ${idle}, ${JSON.stringify(apps)}::jsonb)
      ON CONFLICT (agent_id, day, user_name) DO UPDATE SET asset_id = EXCLUDED.asset_id,
        first_seen = least(asset_usage_daily.first_seen, EXCLUDED.first_seen), last_seen = greatest(asset_usage_daily.last_seen, EXCLUDED.last_seen),
        active_mins = greatest(asset_usage_daily.active_mins, EXCLUDED.active_mins), idle_mins = greatest(asset_usage_daily.idle_mins, EXCLUDED.idle_mins),
        apps = (SELECT coalesce(jsonb_object_agg(k, greatest(coalesce((asset_usage_daily.apps->>k)::int, 0), coalesce((EXCLUDED.apps->>k)::int, 0))), '{}'::jsonb)
                FROM (SELECT jsonb_object_keys(asset_usage_daily.apps || EXCLUDED.apps) AS k) x)`);
  }
  // software inventory (once a day)
  if (Array.isArray(req.body?.software)) {
    const sw = req.body.software.slice(0, 3000).map((x: any) => ({ name: s(x.name, 200), version: s(x.version, 60) || "", publisher: s(x.publisher, 120), installDate: s(x.installDate, 20) })).filter((x: any) => x.name);
    await db.transaction(async tx => {
      await tx.execute(sql`DELETE FROM asset_software WHERE agent_id = ${ag.id}`);
      for (const x of sw) await tx.execute(sql`INSERT INTO asset_software (agent_id, name, version, publisher, install_date) VALUES (${ag.id}, ${x.name}, ${x.version}, ${x.publisher}, ${x.installDate}) ON CONFLICT DO NOTHING`);
      await tx.execute(sql`UPDATE asset_agents SET software_at = now() WHERE id = ${ag.id}`);
    });
  }
  const fresh = await syncAlerts(ag.id, assetId, ev.alerts, k => k === "idle"); // idle is evaluated by the daily sweep
  void notifyCritical(ag, fresh).catch(() => {});
  const ds = await import("./device-support");
  const state = await ds.recomputeState(ag.id);   // ignored items do not count
  void ds.autoTickets(ag.id).catch(e => console.error("auto tickets", e));
  const swDue = !ag.software_at || Date.now() - new Date(ag.software_at).getTime() > 23 * 3600_000;
  const latest = agentRelease();
  res.json({ ok: true, state, checkinMinutes: st.checkinMinutes, trackApps: st.trackApps, sendSoftware: swDue && !Array.isArray(req.body?.software),
    latestVersion: latest?.version || null, agentSha256: latest?.sha256 || null, serverUrl: agentServerUrl() });
}));

/** Self-update: the device downloads the current agent (and checks its SHA-256 before replacing itself). */
publicAgentRouter.get("/agent/v1/files/ITHubAgent.ps1", wrap(async (req, res) => {
  const ag = await agentFromToken(req);
  if (!ag || ag.status === "Revoked") return fail(res, 401, "Unknown device");
  const r = agentRelease(); if (!r) return fail(res, 404, "Agent not on this server");
  res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.setHeader("X-Agent-Version", r.version); res.setHeader("X-Agent-Sha256", r.sha256);
  res.send(r.body);
}));

/** The uninstaller reports who removed the agent (computer administrator only); IT gets a critical alert. */
publicAgentRouter.post("/agent/v1/uninstall", wrap(async (req, res) => {
  const ag = await agentFromToken(req);
  if (!ag) return fail(res, 401, "Unknown device");
  const by = s(req.body?.by, 120) || "unknown account", reason = s(req.body?.reason, 300);
  const label = ag.assetTag ? `${ag.assetTag} (${ag.hostname})` : ag.hostname;
  const msg = `Agent uninstalled by ${by} on ${s(req.body?.hostname, 80) || ag.hostname}${reason ? ` — ${reason}` : ""}`;
  await db.execute(sql`INSERT INTO asset_agent_alerts (agent_id, asset_id, kind, severity, message) VALUES (${ag.id}, ${ag.asset_id}, 'uninstalled', 'Critical', ${msg})
    ON CONFLICT (agent_id, kind) WHERE closed_at IS NULL DO UPDATE SET message = EXCLUDED.message, opened_at = now()`);
  const admins = rowsOf(await db.execute(sql`SELECT id FROM users WHERE is_active AND role = 'admin'`));
  for (const u of admins) await db.execute(sql`INSERT INTO notifications (user_id, title, message, type, link) VALUES (${u.id}, ${`Device agent removed: ${label}`}, ${msg}, 'error', '/asset-agents')`);
  void logAudit({ entityType: "asset_agent", entityId: ag.id, action: "uninstall", performedBy: by, summary: `${msg} (IP ${req.ip})` }).catch(() => {});
  if (ag.enrolled_by_code) await keyEv(ag.enrolled_by_code, "uninstalled", by, req, msg);
  void import("./device-support").then(m => m.autoTickets(ag.id)).catch(() => {});
  res.json({ ok: true });
}));

publicAgentRouter.get("/agent/v1/files/Uninstall-ITHubAgent.ps1", wrap(async (req, res) => {
  const ag = await agentFromToken(req);
  if (!ag || ag.status === "Revoked") return fail(res, 401, "Unknown device");
  res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.send(fileBuf("Uninstall-ITHubAgent.ps1"));
}));
publicAgentRouter.get(["/agent/v1/files/niytri.ico", "/agent/v1/files/tray.ico"], wrap(async (req, res) => {
  const ag = await agentFromToken(req);
  if (!ag || ag.status === "Revoked") return fail(res, 401, "Unknown device");
  res.setHeader("Content-Type", "image/x-icon"); res.send(fileBuf(req.path.endsWith("tray.ico") ? "tray.ico" : "niytri.ico"));
}));

/** Share link sent to the employee: downloads their personal installer (key inside) while the key is unused and valid. */
publicAgentRouter.get("/agent/v1/download/:token", wrap(async (req, res) => {
  const t = String(req.params.token || "");
  const page = (title: string, msg: string, code = 200) => res.status(code).type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="${ICON32}"><title>${title}</title><body style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#1f2937"><h2 style="display:flex;align-items:center;gap:10px"><img src="${ICON32}" width="28" height="28" alt="">${title}</h2><p>${msg}</p><p style="color:#6b7280;font-size:13px">IT Transformation Hub</p></body>`);
  if (!/^[a-f0-9]{48}$/.test(t)) return page("Link not valid", "This download link is not valid. Ask IT to send it again.", 404);
  if (limited(`dl:${req.ip}`, 20, 60_000)) return page("Too many attempts", "Wait a minute and try again.", 429);
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM asset_agent_codes WHERE download_hash = ${sha(t)}`));
  if (!c) return page("Link not valid", "This download link is not valid or was replaced by a newer one. Ask IT to send it again.", 404);
  if (!c.is_active || new Date(c.expires_at) < new Date()) { await keyEv(c.id, "link-refused", "Email link", req, c.is_active ? "Link opened after the key expired" : "Link opened after the key was disabled"); return page("Link expired", "This installation link has expired. Ask IT for a new one.", 410); }
  if (c.kind === "user" && c.used_by_agent) { await keyEv(c.id, "link-refused", "Email link", req, "Link opened after the agent was installed"); return page("Already installed", "The IT Hub agent has already been installed with this key. Nothing more to do.", 410); }
  const code = dec(c.code_enc); if (!code) return page("Link not valid", "Ask IT to create a new installation key.", 410);
  // the employee reads and accepts the device-monitoring notice before the installer downloads (recorded as consent)
  const notice = await agentNotice(c.user_id);
  if (notice && !notice.accepted) {
    await keyEv(c.id, "link-opened", "Email link", req, `Monitoring notice v${notice.version} shown`);
    const esc = (t: string) => String(t).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[ch]);
    return res.type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="${ICON32}"><title>${esc(notice.title)}</title>
<body style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#1f2937"><h2 style="margin-bottom:4px;display:flex;align-items:center;gap:10px"><img src="${ICON32}" width="28" height="28" alt="">${esc(notice.title)}</h2>
<div style="color:#6b7280;font-size:13px;margin-bottom:16px">For ${esc(c.user_name || "you")} · version ${notice.version}</div>
<div style="white-space:pre-wrap;line-height:1.5;border:1px solid #e5e7eb;border-radius:10px;padding:16px;background:#f9fafb">${esc(notice.body)}</div>
<form method="post" action="${esc(req.originalUrl.split("?")[0])}/accept" style="margin-top:16px"><input type="hidden" name="version" value="${notice.version}">
<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" name="confirm" value="yes" required> <span>I have read and understood this notice and agree to the IT Hub agent being installed on my office computer.</span></label>
<button type="submit" style="margin-top:14px;background:#2D7FF9;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer">Accept and download installer</button></form>
<p style="color:#6b7280;font-size:12px;margin-top:20px">Your acceptance is recorded with the date, time and this browser. Questions: contact IT. — IT Transformation Hub</p></body>`);
  }
  await db.execute(sql`UPDATE asset_agent_codes SET downloads = downloads + 1, last_download_at = now() WHERE id = ${c.id}`);
  const [eu] = rowsOf(await db.execute(sql`SELECT name FROM users WHERE id = ${c.user_id ?? 0}`));
  await keyEv(c.id, "downloaded", eu?.name || "Email link", req, "Installer downloaded from the emailed link");
  await sendPackage(req, res, c, code);
}));

publicAgentRouter.post("/agent/v1/download/:token/accept", express.urlencoded({ extended: false }), wrap(async (req, res) => {
  const t = String(req.params.token || "");
  if (!/^[a-f0-9]{48}$/.test(t)) return fail(res, 404, "Link not valid");
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM asset_agent_codes WHERE download_hash = ${sha(t)}`));
  if (!c || !c.is_active || new Date(c.expires_at) < new Date() || (c.kind === "user" && c.used_by_agent) || !c.user_id) return fail(res, 410, "This link has expired — ask IT for a new one");
  if (req.body?.confirm !== "yes") return fail(res, 400, "Tick the box to accept the notice");
  const [p] = rowsOf(await db.execute(sql`SELECT * FROM policies WHERE system_key = 'device_agent' AND status = 'Published'`));
  if (p) {
    if (Number(req.body?.version) !== Number(p.version)) return res.redirect(303, req.originalUrl.replace(/\/accept$/, ""));
    const { recordDecision } = await import("./policies");
    await recordDecision(p, c.user_id, "Accepted", { method: "agent-link", ip: req.ip, userAgent: req.get("user-agent"), note: `Installer key …${c.code_hint}` });
    const [eu] = rowsOf(await db.execute(sql`SELECT name FROM users WHERE id = ${c.user_id}`));
    await keyEv(c.id, "notice-accepted", eu?.name || "Employee", req, `Accepted monitoring notice v${p.version}`);
  }
  res.redirect(303, req.originalUrl.replace(/\/accept$/, ""));
}));

/** The device-agent notice for a user: current version and whether they accepted it. */
async function agentNotice(userId: number | null) {
  if (!userId) return null;
  const [p] = rowsOf(await db.execute(sql`SELECT p.id, p.version, v.title, v.body FROM policies p JOIN policy_versions v ON v.policy_id = p.id AND v.version = p.version WHERE p.system_key = 'device_agent' AND p.status = 'Published'`));
  if (!p) return null;
  const [d] = rowsOf(await db.execute(sql`SELECT decision FROM policy_acceptances WHERE policy_id = ${p.id} AND user_id = ${userId} AND version = ${p.version} ORDER BY at DESC, id DESC LIMIT 1`));
  return { ...p, accepted: d?.decision === "Accepted" };
}

/* ═══ SIGNED-IN: fleet, health, enrolment codes ═══════════════════════════ */
async function canManage(req: Request) { const a = await getAccess(req); return !!a && (a.isAdmin || can(a, "asset_registry", "write")); }

router.get("/asset-agents", requireAuth, wrap(async (_req, res) => {
  const st = await agentSettings();
  const rows = rowsOf(await db.execute(sql`
    SELECT g.id, g.device_id AS "deviceId", g.hostname, g.serial_number AS "serialNumber", g.manufacturer, g.model, g.platform, g.os_name AS "osName", g.os_version AS "osVersion",
           g.agent_version AS "agentVersion", g.last_user AS "lastUser", g.last_ip AS "lastIp", g.health_state AS "healthState", g.enrolled_at AS "enrolledAt", g.last_seen_at AS "lastSeenAt",
           g.status, g.match_note AS "matchNote", g.asset_id AS "assetId", s.asset_tag AS "assetTag", s.name AS "assetName", s.owner_name AS "ownerName", s.department, s.location,
           g.latest->'cpu'->>'pct' AS cpu, g.latest->'mem'->>'usedPct' AS mem, g.latest->>'uptimeHours' AS "uptimeHours",
           (SELECT min((d->>'freePct')::numeric) FROM jsonb_array_elements(coalesce(g.latest->'disks','[]'::jsonb)) d WHERE coalesce((d->>'sizeGb')::numeric, 0) >= 1) AS "diskFreePct",
           CASE WHEN (g.latest->'battery'->>'healthPct')::numeric > 0 AND (g.latest->'battery'->>'healthPct')::numeric <= 150 THEN g.latest->'battery'->>'healthPct' END AS "batteryHealthPct",
           g.user_id AS "keyUserId", ku.name AS "keyUserName", ku.employee_code AS "keyEmployeeCode", ku.department AS "keyDepartment",
           s.owner_id AS "ownerId", s.owner_employee_code AS "ownerEmployeeCode", s.status AS "assetStatus", s.type AS "assetType",
           ou.department AS "ownerDepartment",
           (SELECT count(*)::int FROM asset_agent_alerts x WHERE x.agent_id = g.id AND x.closed_at IS NULL AND NOT (x.ignored_at IS NOT NULL AND (x.ignore_until IS NULL OR x.ignore_until > now()))) AS "openAlerts",
           (SELECT count(*)::int FROM asset_agent_alerts x WHERE x.agent_id = g.id AND x.closed_at IS NULL AND x.ignored_at IS NOT NULL AND (x.ignore_until IS NULL OR x.ignore_until > now())) AS "ignoredAlerts",
           (SELECT string_agg(x.ticket_no, ', ') FROM asset_agent_alerts x WHERE x.agent_id = g.id AND x.closed_at IS NULL AND x.ticket_no IS NOT NULL) AS "tickets",
           (SELECT count(*)::int FROM device_chats c WHERE c.agent_id = g.id AND c.status IN ('Waiting on employee', 'Waiting on IT')) AS "openChats",
           (SELECT string_agg(x.message, ' · ' ORDER BY x.severity, x.opened_at) FROM asset_agent_alerts x WHERE x.agent_id = g.id AND x.closed_at IS NULL AND NOT (x.ignored_at IS NOT NULL AND (x.ignore_until IS NULL OR x.ignore_until > now()))) AS "alertText",
           (SELECT coalesce(sum(u.active_mins), 0)::int FROM asset_usage_daily u WHERE u.agent_id = g.id AND u.day >= (now() AT TIME ZONE 'Asia/Kolkata')::date - 6) AS "active7d",
           (SELECT max(u.day) FROM asset_usage_daily u WHERE u.agent_id = g.id AND u.active_mins > 0) AS "lastActiveDay",
           (SELECT max(u.last_seen) FROM asset_usage_daily u WHERE u.agent_id = g.id AND u.active_mins > 0) AS "lastActiveAt"
    FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id LEFT JOIN users ku ON ku.id = g.user_id LEFT JOIN users ou ON ou.id = s.owner_id
    ORDER BY (g.status = 'Active') DESC, CASE g.health_state WHEN 'Critical' THEN 0 WHEN 'Offline' THEN 1 WHEN 'Warning' THEN 2 ELSE 3 END, g.hostname`));
  const off = st.thresholds.offlineDays * 86_400_000;
  for (const r of rows) if (r.status === "Active" && (!r.lastSeenAt || Date.now() - new Date(r.lastSeenAt).getTime() > off)) r.healthState = "Offline";
  const act = rows.filter(r => r.status === "Active");
  res.json({ agents: rows, summary: { total: act.length, healthy: act.filter(r => r.healthState === "Healthy").length, warning: act.filter(r => r.healthState === "Warning").length, critical: act.filter(r => r.healthState === "Critical").length,
    offline: act.filter(r => r.healthState === "Offline").length, unlinked: act.filter(r => !r.assetId).length, servers: act.filter(r => r.platform === "Server").length }, settings: st });
}));

/** Health, usage and software for one register asset (Asset Registry › view › Health). */
const AG_COLS = sql`id, hostname, serial_number AS "serialNumber", platform, os_name AS "osName", os_version AS "osVersion", agent_version AS "agentVersion", last_user AS "lastUser",
      last_seen_at AS "lastSeenAt", enrolled_at AS "enrolledAt", health_state AS "healthState", latest, status, software_at AS "softwareAt", manufacturer, model, asset_id AS "assetId", user_id AS "userId"`;
router.get("/asset-agents/:id/health", requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id)) return fail(res, 400, "Invalid device");
  const [ag] = rowsOf(await db.execute(sql`SELECT ${AG_COLS} FROM asset_agents WHERE id = ${id}`));
  if (!ag) return res.json({ agent: null });
  res.json(await healthOf(ag));
}));
router.get("/assets/:id/health", requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id)) return fail(res, 400, "Invalid asset");
  const [ag] = rowsOf(await db.execute(sql`SELECT ${AG_COLS} FROM asset_agents WHERE asset_id = ${id} AND status = 'Active' ORDER BY last_seen_at DESC NULLS LAST LIMIT 1`));
  if (!ag) return res.json({ agent: null });
  res.json(await healthOf(ag));
}));
async function healthOf(ag: any) {
  const st = await agentSettings();
  if (!ag.lastSeenAt || Date.now() - new Date(ag.lastSeenAt).getTime() > st.thresholds.offlineDays * 86_400_000) ag.healthState = "Offline";
  const trend = rowsOf(await db.execute(sql`SELECT date_trunc('hour', at) AS at, round(avg(cpu_pct), 1)::float AS cpu, round(avg(mem_pct), 1)::float AS mem, round(min(disk_min_free_pct), 1)::float AS disk
      FROM asset_health_snapshots WHERE agent_id = ${ag.id} AND at > now() - interval '7 days' GROUP BY 1 ORDER BY 1`));
  const usage = rowsOf(await db.execute(sql`SELECT to_char(day, 'YYYY-MM-DD') AS day, sum(active_mins)::int AS active, sum(idle_mins)::int AS idle, string_agg(DISTINCT user_name, ', ') AS users, min(first_seen) AS "firstSeen", max(last_seen) AS "lastSeen"
      FROM asset_usage_daily WHERE agent_id = ${ag.id} AND day >= (now() AT TIME ZONE 'Asia/Kolkata')::date - 29 GROUP BY day ORDER BY day`));
  const apps = rowsOf(await db.execute(sql`SELECT k AS app, sum(v::int)::int AS mins FROM asset_usage_daily u, jsonb_each_text(u.apps) AS e(k, v)
      WHERE u.agent_id = ${ag.id} AND u.day >= (now() AT TIME ZONE 'Asia/Kolkata')::date - 29 GROUP BY k ORDER BY mins DESC LIMIT 12`));
  const users = rowsOf(await db.execute(sql`SELECT user_name AS "user", count(*)::int AS days, sum(active_mins)::int AS active, max(day) AS "lastDay" FROM asset_usage_daily WHERE agent_id = ${ag.id} AND day >= (now() AT TIME ZONE 'Asia/Kolkata')::date - 29 GROUP BY 1 ORDER BY active DESC`));
  const alerts = rowsOf(await db.execute(sql`SELECT id, kind, severity, message, opened_at AS "openedAt", closed_at AS "closedAt", incident_id AS "incidentId", ticket_no AS "ticketNo", ticket_auto AS "ticketAuto",
      ignored_at AS "ignoredAt", ignored_by AS "ignoredBy", ignore_reason AS "ignoreReason", ignore_until AS "ignoreUntil",
      (ignored_at IS NOT NULL AND (ignore_until IS NULL OR ignore_until > now())) AS ignored,
      (SELECT status FROM itsm_incidents i WHERE i.id = asset_agent_alerts.incident_id) AS "ticketStatus"
    FROM asset_agent_alerts WHERE agent_id = ${ag.id} ORDER BY closed_at IS NULL DESC, opened_at DESC LIMIT 30`));
  const software = rowsOf(await db.execute(sql`SELECT name, version, publisher, install_date AS "installDate" FROM asset_software WHERE agent_id = ${ag.id} ORDER BY name`));
  return { agent: ag, trend, usage, apps, users, alerts, software, settings: { trackApps: st.trackApps, thresholds: st.thresholds } };
}

/** Link a device to an employee and a register asset (existing, or registered from what the device reports) and,
 *  if asked, issue the asset to the employee in the register (handover HO-…, employee acknowledges in My Assets). */
router.post("/asset-agents/:id/assign", requireAuth, wrap(async (req, res) => {
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  const id = Number(req.params.id); const b = req.body || {};
  const [ag] = rowsOf(await db.execute(sql`SELECT * FROM asset_agents WHERE id = ${id}`)); if (!ag) return fail(res, 404, "Device not found");
  const { resolveHolder, issueOrReassign, actor } = await import("./asset-lifecycle");
  const { nextTag } = await import("./assets");
  const { assetsTable, assetTransactionsTable } = await import("@workspace/db");
  let emp: any = null;
  if (b.userId) { emp = await resolveHolder({ userId: b.userId }); if (typeof emp === "string") return fail(res, 400, emp); }
  const who = await actor(req);
  if (b.issue && !emp) return fail(res, 400, "Choose the employee to issue the asset to");
  try {
    const out = await db.transaction(async (tx: any) => {
      let assetId: number | null = b.assetId ? Number(b.assetId) : null; let created: any = null;
      if (!assetId && b.newAsset) {
        const n = b.newAsset; const type = ["Laptop", "Desktop", "Server"].includes(n.type) ? n.type : (ag.platform === "Server" ? "Server" : /book|laptop|notebook/i.test(`${ag.model}`) ? "Laptop" : "Desktop");
        const serial = s(ag.serial_number, 80); if (!serial) throw new Error("This computer did not report a serial number — add the asset in Asset Registry");
        const [dup] = rowsOf(await tx.execute(sql`SELECT asset_tag FROM assets WHERE is_active AND lower(serial_number) = lower(${serial})`));
        if (dup) throw new Error(`Serial ${serial} is already in the register as ${dup.asset_tag} — pick it instead`);
        const tag = (await nextTag(type)).tag;
        const name = s(n.name, 120) || [ag.manufacturer, ag.model].filter(Boolean).join(" ") || ag.hostname;
        [created] = await tx.insert(assetsTable).values({ assetTag: tag, name, type, serialNumber: serial, status: "In Stock", osVersion: [ag.os_name, ag.os_version].filter(Boolean).join(" ") || null,
          location: s(n.location, 80), configuration: [ag.manufacturer, ag.model, ag.hostname && `Computer name ${ag.hostname}`].filter(Boolean).join(" · "),
          notes: `Registered from Device Health (agent on ${ag.hostname})`, createdBy: who.performedBy, updatedBy: who.performedBy }).returning();
        await tx.insert(assetTransactionsTable).values({ assetId: created.id, action: "Registered", newStatus: "In Stock", userName: who.performedBy, notes: `Registered from Device Health — ${ag.hostname}, serial ${serial}` });
        assetId = created.id;
      }
      if (assetId) {
        const [other] = rowsOf(await tx.execute(sql`SELECT hostname FROM asset_agents WHERE asset_id = ${assetId} AND status = 'Active' AND id <> ${id}`));
        if (other) throw new Error(`That asset already reports as ${other.hostname} — remove or unlink that device first`);
      }
      const [a] = assetId ? rowsOf(await tx.execute(sql`SELECT asset_tag, serial_number FROM assets WHERE id = ${assetId} AND is_active`)) : [null];
      if (assetId && !a) throw new Error("Asset not found in the register");
      await tx.execute(sql`UPDATE asset_agents SET asset_id = ${assetId}, user_id = ${emp ? emp.userId : sql`user_id`},
        match_note = ${assetId ? `Linked by ${who.name}${created ? " (registered from the device)" : ""}` : "Unlinked"} WHERE id = ${id}`);
      let issued: any = null;
      if (b.issue && assetId && emp) issued = await issueOrReassign(tx, assetId, emp, { condition: "Good", allocationType: "Permanent", notes: s(b.notes, 300) || `Matched by IT Hub agent on ${ag.hostname}` }, who, !!b.reassign, "Device Health");
      return { assetId, assetTag: a?.asset_tag || null, created: !!created, issued };
    });
    void logAudit({ entityType: "asset_agent", entityId: id, action: "assign", performedBy: who.performedBy,
      summary: `${ag.hostname}: ${out.assetTag ? `linked to ${out.assetTag}${out.created ? " (new asset)" : ""}` : "unlinked"}${emp ? ` · employee ${emp.userName} (${emp.employeeCode})` : ""}${out.issued ? ` · ${out.issued.action}${out.issued.handoverNo ? ` ${out.issued.handoverNo}` : ""}` : ""}` }).catch(() => {});
    res.json(out);
  } catch (e: any) { return fail(res, 400, e?.message || String(e)); }
}));

/** One employee: devices, register assets, usage across their devices, apps and issues. */
router.get("/asset-agents/employee/:userId", requireAuth, wrap(async (req, res) => {
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  const uidp = Number(req.params.userId);
  const [u] = rowsOf(await db.execute(sql`SELECT id, name, email, employee_code AS "employeeCode", department, designation, coalesce(user_type, 'internal') AS "userType", is_active AS "isActive", last_login_at AS "lastLoginAt" FROM users WHERE id = ${uidp}`));
  if (!u) return fail(res, 404, "Employee not found");
  const devices = rowsOf(await db.execute(sql`SELECT g.id, g.hostname, g.serial_number AS "serialNumber", g.model, g.platform, g.health_state AS "healthState", g.last_seen_at AS "lastSeenAt", g.agent_version AS "agentVersion", g.status, s.asset_tag AS "assetTag",
      (SELECT string_agg(x.message, ' · ') FROM asset_agent_alerts x WHERE x.agent_id = g.id AND x.closed_at IS NULL) AS "alertText"
    FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE g.user_id = ${uidp} OR s.owner_id = ${uidp} ORDER BY g.last_seen_at DESC NULLS LAST`));
  const ids = devices.map((d: any) => d.id);
  const assets = rowsOf(await db.execute(sql`SELECT a.id, a.asset_tag AS "assetTag", a.name, a.type, a.serial_number AS "serialNumber", a.status,
      (SELECT g.hostname FROM asset_agents g WHERE g.asset_id = a.id AND g.status = 'Active' LIMIT 1) AS "reportsAs" FROM assets a WHERE a.is_active AND a.owner_id = ${uidp} ORDER BY a.asset_tag`));
  const inIds = ids.length ? sql`agent_id IN (${sql.join(ids.map((x: number) => sql`${x}`), sql`, `)})` : sql`false`;
  const inIdsX = ids.length ? sql`x.agent_id IN (${sql.join(ids.map((x: number) => sql`${x}`), sql`, `)})` : sql`false`;
  const usage = rowsOf(await db.execute(sql`SELECT to_char(day, 'YYYY-MM-DD') AS day, sum(active_mins)::int AS active, sum(idle_mins)::int AS idle, min(first_seen) AS "firstSeen", max(last_seen) AS "lastSeen"
    FROM asset_usage_daily WHERE ${inIds} AND day >= (now() AT TIME ZONE 'Asia/Kolkata')::date - 29 GROUP BY day ORDER BY day`));
  const apps = rowsOf(await db.execute(sql`SELECT k AS app, sum(v::int)::int AS mins FROM asset_usage_daily d, jsonb_each_text(d.apps) AS e(k, v) WHERE ${inIds} AND d.day >= (now() AT TIME ZONE 'Asia/Kolkata')::date - 29 GROUP BY k ORDER BY mins DESC LIMIT 12`));
  const alerts = rowsOf(await db.execute(sql`SELECT x.severity, x.message, x.opened_at AS "openedAt", x.closed_at AS "closedAt", g.hostname FROM asset_agent_alerts x JOIN asset_agents g ON g.id = x.agent_id WHERE ${inIdsX} ORDER BY x.closed_at IS NULL DESC, x.opened_at DESC LIMIT 30`));
  res.json({ employee: u, devices, assets, usage, apps, alerts });
}));

router.patch("/asset-agents/:id", requireAuth, wrap(async (req, res) => {
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  const id = Number(req.params.id);
  const [ag] = rowsOf(await db.execute(sql`SELECT * FROM asset_agents WHERE id = ${id}`)); if (!ag) return fail(res, 404, "Device not found");
  const by = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
  if (req.body?.assetId !== undefined) {
    const assetId = req.body.assetId === null ? null : Number(req.body.assetId);
    if (assetId !== null) {
      const [a] = rowsOf(await db.execute(sql`SELECT id, asset_tag FROM assets WHERE id = ${assetId} AND is_active`)); if (!a) return fail(res, 400, "Asset not found in the register");
      const [other] = rowsOf(await db.execute(sql`SELECT hostname FROM asset_agents WHERE asset_id = ${assetId} AND id <> ${id} AND status = 'Active'`));
      if (other) return fail(res, 400, `${a.asset_tag} is already linked to device ${other.hostname}`);
      await db.execute(sql`UPDATE asset_agents SET asset_id = ${assetId}, match_note = ${`Linked by ${by.replace(/ <.*>$/, "")}`} WHERE id = ${id}`);
      await db.execute(sql`UPDATE asset_usage_daily SET asset_id = ${assetId} WHERE agent_id = ${id}`);
      await db.execute(sql`UPDATE asset_health_snapshots SET asset_id = ${assetId} WHERE agent_id = ${id}`);
      void logAudit({ entityType: "asset_agent", entityId: id, action: "link", performedBy: by, summary: `Device ${ag.hostname} linked to ${a.asset_tag}` }).catch(() => {});
    } else await db.execute(sql`UPDATE asset_agents SET asset_id = NULL, match_note = 'Unlinked' WHERE id = ${id}`);
  }
  if (req.body?.status === "Revoked" || req.body?.status === "Active") {
    await db.execute(sql`UPDATE asset_agents SET status = ${req.body.status}, revoked_at = ${req.body.status === "Revoked" ? new Date() : null}, revoked_by = ${req.body.status === "Revoked" ? by : null} WHERE id = ${id}`);
    if (req.body.status === "Revoked") await db.execute(sql`UPDATE asset_agent_alerts SET closed_at = now() WHERE agent_id = ${id} AND closed_at IS NULL`);
    void logAudit({ entityType: "asset_agent", entityId: id, action: req.body.status === "Revoked" ? "revoke" : "restore", performedBy: by, summary: `Device ${ag.hostname} ${req.body.status === "Revoked" ? "removed" : "re-enabled"}` }).catch(() => {});
  }
  res.json({ ok: true });
}));

const CODE_COLS = sql`k.id, k.kind, k.code_hint AS "codeHint", k.label, k.max_uses AS "maxUses", k.uses, k.expires_at AS "expiresAt", k.is_active AS "isActive", k.created_by AS "createdBy", k.created_at AS "createdAt",
  k.user_id AS "userId", u.name AS "userName", u.email AS "userEmail", k.asset_id AS "assetId", s.asset_tag AS "assetTag", s.serial_number AS "assetSerial",
  k.used_at AS "usedAt", g.hostname AS "usedOn", k.shared_at AS "sharedAt", k.shared_by AS "sharedBy", k.downloads,
  u.employee_code AS "employeeCode", u.department, g.serial_number AS "usedSerial", g.id AS "usedAgentId", k.disabled_at AS "disabledAt", k.disabled_by AS "disabledBy", k.disable_reason AS "disableReason", k.last_download_at AS "lastDownloadAt",
  (SELECT max(at) FROM asset_agent_code_events e WHERE e.code_id = k.id) AS "lastActivityAt", (SELECT count(*)::int FROM asset_agent_code_events e WHERE e.code_id = k.id AND e.action = 'refused') AS refusals,
  CASE WHEN NOT k.is_active THEN 'Disabled' WHEN k.kind = 'user' AND k.used_by_agent IS NOT NULL THEN 'Installed' WHEN k.expires_at < now() THEN 'Expired'
       WHEN k.kind = 'bulk' AND k.uses >= k.max_uses THEN 'Used up' ELSE 'Ready' END AS state`;
const CODE_FROM = sql`FROM asset_agent_codes k LEFT JOIN users u ON u.id = k.user_id LEFT JOIN assets s ON s.id = k.asset_id LEFT JOIN asset_agents g ON g.id = k.used_by_agent`;

router.get("/asset-agent-codes", requireAuth, wrap(async (req, res) => {
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  res.json(rowsOf(await db.execute(sql`SELECT ${CODE_COLS} ${CODE_FROM} ORDER BY k.created_at DESC LIMIT 200`)));
}));

/** Full key register (with filters) and the activity log. */
router.get("/asset-agent-codes/register", requireAuth, wrap(async (req, res) => {
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || "")) ? String(req.query.from) : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || "")) ? String(req.query.to) : null;
  res.json(rowsOf(await db.execute(sql`SELECT ${CODE_COLS} ${CODE_FROM} WHERE (${from}::date IS NULL OR k.created_at >= ${from}::date) AND (${to}::date IS NULL OR k.created_at < ${to}::date + 1) ORDER BY k.created_at DESC LIMIT 5000`)));
}));
router.get("/asset-agent-codes/:id/events", requireAuth, wrap(async (req, res) => {
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  res.json(rowsOf(await db.execute(sql`SELECT id, action, actor, ip, user_agent AS "userAgent", detail, at FROM asset_agent_code_events WHERE code_id = ${Number(req.params.id)} ORDER BY at DESC, id DESC`)));
}));
router.get("/asset-agent-code-events", requireAuth, wrap(async (req, res) => {
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || "")) ? String(req.query.from) : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || "")) ? String(req.query.to) : null;
  res.json(rowsOf(await db.execute(sql`SELECT e.id, e.action, e.actor, e.ip, e.user_agent AS "userAgent", e.detail, e.at, k.code_hint AS "codeHint", k.kind, k.label, u.name AS "userName", u.employee_code AS "employeeCode"
    FROM asset_agent_code_events e JOIN asset_agent_codes k ON k.id = e.code_id LEFT JOIN users u ON u.id = k.user_id
    WHERE (${from}::date IS NULL OR e.at >= ${from}::date) AND (${to}::date IS NULL OR e.at < ${to}::date + 1) ORDER BY e.at DESC, e.id DESC LIMIT 10000`)));
}));

/** New installation key. kind "user" (default): one computer, for one employee (optionally one asset). kind "bulk": admins only. */
router.post("/asset-agent-codes", requireAuth, wrap(async (req, res) => {
  const a = await getAccess(req);
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  const kind = req.body?.kind === "bulk" ? "bulk" : "user";
  const days = Math.round(Number(req.body?.validDays) || (kind === "user" ? 7 : 30));
  if (days < 1 || days > (kind === "user" ? 30 : 365)) return fail(res, 400, kind === "user" ? "A personal key can be valid for 1–30 days" : "Valid for 1–365 days");
  let label = s(req.body?.label, 80), userId: number | null = null, assetId: number | null = null, maxUses = 1;
  let replaced: any[] = [];
  if (kind === "bulk") {
    if (!a?.isAdmin) return fail(res, 403, "Only an administrator can create a bulk key (for Intune / SCCM rollouts)");
    if (!label) return fail(res, 400, "Give the bulk key a name (e.g. Intune rollout, Pune office)");
    maxUses = Math.round(Number(req.body?.maxUses) || 100); if (maxUses < 2 || maxUses > 10000) return fail(res, 400, "Number of devices must be 2–10,000");
  } else {
    userId = Number(req.body?.userId) || null;
    if (!userId) return fail(res, 400, "Choose the employee the key is for");
    const [u] = rowsOf(await db.execute(sql`SELECT id, name, is_active FROM users WHERE id = ${userId}`));
    if (!u || !u.is_active) return fail(res, 400, "The employee is not an active user");
    if (req.body?.assetId) {
      assetId = Number(req.body.assetId);
      const [as] = rowsOf(await db.execute(sql`SELECT id, asset_tag, serial_number FROM assets WHERE id = ${assetId} AND is_active`));
      if (!as) return fail(res, 400, "Asset not found in the register");
      if (!as.serial_number) return fail(res, 400, `${as.asset_tag} has no serial number in the register — add it first (the installer checks it)`);
      const [other] = rowsOf(await db.execute(sql`SELECT hostname FROM asset_agents WHERE asset_id = ${assetId} AND status = 'Active'`));
      if (other) return fail(res, 400, `${as.asset_tag} already reports as ${other.hostname}`);
    }
    // one open key per employee + asset: older unused keys are disabled
    replaced = rowsOf(await db.execute(sql`UPDATE asset_agent_codes SET is_active = false, download_hash = NULL, disabled_at = now(), disabled_by = 'System', disable_reason = 'Replaced by a newer key'
      WHERE kind = 'user' AND is_active AND used_by_agent IS NULL AND user_id = ${userId} AND coalesce(asset_id, 0) = ${assetId ?? 0} RETURNING id`));
    label = label || `${u.name}${assetId ? "" : " (any computer)"}`;
  }
  const raw = Array.from(crypto.randomBytes(16)).map(x => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");
  const code = raw.match(/.{4}/g)!.join("-");
  const by = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
  const [r] = rowsOf(await db.execute(sql`INSERT INTO asset_agent_codes (code_hash, code_hint, label, max_uses, expires_at, created_by, kind, user_id, asset_id, code_enc)
    VALUES (${sha(raw)}, ${raw.slice(-4)}, ${label}, ${maxUses}, now() + (${days} || ' days')::interval, ${by}, ${kind}, ${userId}, ${assetId}, ${enc(raw)}) RETURNING id`));
  await keyEv(r.id, "created", by, req, kind === "user" ? `Personal key for ${label}, 1 computer, valid ${days} days` : `Bulk key "${label}" for ${maxUses} devices, valid ${days} days`);
  for (const o of replaced) await keyEv(o.id, "disabled", "System", null, `Replaced by newer key …${raw.slice(-4)} (created by ${by})`);
  void logAudit({ entityType: "asset_agent_code", entityId: r.id, action: "create", performedBy: by, summary: `Agent ${kind} key "${label}" created (…${raw.slice(-4)}, ${kind === "user" ? "1 computer" : `${maxUses} devices`}, ${days} days)` }).catch(() => {});
  const [row] = rowsOf(await db.execute(sql`SELECT ${CODE_COLS} ${CODE_FROM} WHERE k.id = ${r.id}`));
  res.status(201).json({ ...row, code });
}));

router.delete("/asset-agent-codes/:id", requireAuth, wrap(async (req, res) => {
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  const id = Number(req.params.id);
  const [c] = rowsOf(await db.execute(sql`SELECT id, is_active, code_hint, label FROM asset_agent_codes WHERE id = ${id}`)); if (!c) return fail(res, 404, "Key not found");
  if (!c.is_active) return res.status(204).end();
  const by = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
  const reason = s(req.body?.reason, 300) || null;
  await db.execute(sql`UPDATE asset_agent_codes SET is_active = false, download_hash = NULL, disabled_at = now(), disabled_by = ${by}, disable_reason = ${reason} WHERE id = ${id}`);
  await keyEv(id, "disabled", by, req, reason ? `Disabled: ${reason}` : "Disabled");
  void logAudit({ entityType: "asset_agent_code", entityId: id, action: "disable", performedBy: by, summary: `Agent key …${c.code_hint} (${c.label}) disabled${reason ? ` — ${reason}` : ""}` }).catch(() => {});
  res.status(204).end();
}));

/** IT downloads the ready-to-run installer for a key (zip with the key inside). */
router.get("/asset-agent-codes/:id/package", requireAuth, wrap(async (req, res) => {
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  const [c] = rowsOf(await db.execute(sql`SELECT k.*, u.name AS user_name FROM asset_agent_codes k LEFT JOIN users u ON u.id = k.user_id WHERE k.id = ${Number(req.params.id)}`));
  if (!c) return fail(res, 404, "Key not found");
  if (!c.is_active || new Date(c.expires_at) < new Date()) return fail(res, 400, "This key is disabled or expired — create a new one");
  if (c.kind === "user" && c.used_by_agent) return fail(res, 400, "This key has already been used — create a new one for another computer");
  const code = dec(c.code_enc); if (!code) return fail(res, 400, "This key was created before installers could be rebuilt — create a new one");
  await db.execute(sql`UPDATE asset_agent_codes SET downloads = downloads + 1, last_download_at = now() WHERE id = ${c.id}`);
  await keyEv(c.id, "downloaded", await getPerformedBy((req.session as any)?.userId).catch(() => "IT"), req, "Installer zip downloaded in IT Hub");
  await sendPackage(req, res, c, code);
}));

/** Email the employee a personal download link (and an in-app notice). The link works until the key is used or expires. */
router.post("/asset-agent-codes/:id/share", requireAuth, wrap(async (req, res) => {
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  const [c] = rowsOf(await db.execute(sql`SELECT k.*, u.name AS user_name, u.email AS user_email, s.asset_tag FROM asset_agent_codes k LEFT JOIN users u ON u.id = k.user_id LEFT JOIN assets s ON s.id = k.asset_id WHERE k.id = ${Number(req.params.id)}`));
  if (!c) return fail(res, 404, "Key not found");
  if (c.kind !== "user" || !c.user_id) return fail(res, 400, "Only a personal key can be shared with an employee");
  if (!c.is_active || new Date(c.expires_at) < new Date()) return fail(res, 400, "This key is disabled or expired — create a new one");
  if (c.used_by_agent) return fail(res, 400, "This key has already been used");
  if (!c.user_email) return fail(res, 400, `${c.user_name} has no email address in User Master`);
  const t = crypto.randomBytes(24).toString("hex");
  const by = await getPerformedBy((req.session as any)?.userId).catch(() => "System");
  await db.execute(sql`UPDATE asset_agent_codes SET download_hash = ${sha(t)}, shared_at = now(), shared_by = ${by} WHERE id = ${c.id}`);
  const base = (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  const link = `${base}/api/agent/v1/download/${t}`;
  const till = new Date(c.expires_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).replace(/ /g, "-");
  const { sendDirect } = await import("../lib/mailer");
  const html = `<p>Dear ${c.user_name},</p><p>Please install the IT Hub device agent on ${c.asset_tag ? `your computer <b>${c.asset_tag}</b>` : "your office computer"}. It reports the computer's health (disk, battery, updates, antivirus) and how long it is in use, so IT can fix problems early. It does not record keystrokes, screenshots or the content of your work.</p>
    <ol><li>Download your installer: <a href="${link}">${link}</a></li><li>Unzip it, then double-click <b>Install IT Hub Agent.cmd</b> and click <b>Yes</b> when Windows asks.</li><li>Wait for the "installed" message. That's all.</li></ol>
    <p>The link is personal, works for one computer only and expires on <b>${till}</b>. If you need administrator rights to install, reply to IT and we will install it for you.</p><p>Regards,</p>`;
  const mail: any = await sendDirect("asset_agent_install", [c.user_email], `Install the IT Hub agent${c.asset_tag ? ` on ${c.asset_tag}` : ""}`, html);
  await db.execute(sql`INSERT INTO notifications (user_id, title, message, type, link) VALUES (${c.user_id}, 'Install the IT Hub device agent', ${`IT has sent you a personal installer${c.asset_tag ? ` for ${c.asset_tag}` : ""} — check your email (valid till ${till}).`}, 'info', '/my-assets')`);
  await keyEv(c.id, "emailed", by, req, `Installer link emailed to ${c.user_email}${mail?.status && mail.status !== "Sent" ? ` (email ${String(mail.status).toLowerCase()})` : ""}`);
  void logAudit({ entityType: "asset_agent_code", entityId: c.id, action: "share", performedBy: by, summary: `Agent installer link emailed to ${c.user_name} <${c.user_email}>` }).catch(() => {});
  res.json({ ok: true, link, emailedTo: c.user_email, mailStatus: mail?.status || null });
}));

/* ── agent files on this server (always the current release) ─────────────── */
const PKG = ["ITHubAgent.ps1", "Install-ITHubAgent.ps1", "Uninstall-ITHubAgent.ps1", "install.cmd", "README.txt", "niytri.ico", "tray.ico"];
const isBin = (f: string) => /\.ico$/i.test(f);
const ICON32 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACxUlEQVR42s2XO2gVQRSGvzO7e58xkItvDFgImkKJRlBErdJqra1iJWonFiKCIGIZsbSN9rbpoqLgI2CRYFJEFB8JJJDkPnd2jsVukuvj5ubG3CQHDjPsHOb/58yZnX8ADLEVgPvAOGABB+g6uUvmHE8wCgnmIjY9wOg6Ajbz0QRzaeUTyUBtnVf+r0zUkv4EUPCAO8B5IAQCQGifCeAlWNsBFeAz0F0XsBGmSftFkrQ0BDYSe705jb1ZbKO4eiJSx2ZTzF9p5U6hd6dP7+4Aa2Oevi+8+FJjYjZaillsT+wJ6NnhE1ol8IWRHyEjU3ZpfE0ELvZkuNnfCaUoHsgYhscqnH06+1fslSNZLp/ugHkL23weDs0xMrWwIgHTLEXFULElx1xJKVWUhdmIM/tTnDuQxil4dTMsJLEz5bgths13tykBI+CbZfcMqMLdU3n8pN8o1qziTJlWi8YTKFeVY90pLhzK4BR8s/bT2zIBI3EWolC5fSpP1hes0/YTcBpX9tBkjemSwznl4C6fS4czWMdGEABJCa+/hTz+UCbIGGpV5dbJPF0ZgwAi7d4Chc608Ohdidn5CHWwr+BxvS+LJvXRdgJZXyiGysDbEumsUC0rN47nyAdC2WrLt0nLRRglGAPvynydiRADXds8rvXlmKtuAAHV+PKYqTgevC6SSgthxXH1aJaTewO0prRyKs1aq9c38ORjhU8/LcYIO3KG/v0pQquYFqrxPwgIFavce1XEC4TINb1615eAdXGqn41VeP+1RjYtRO0g4BSsW/b6VYrE3+6+LCICkWscu2YC+UDwc4ZCNm47guX9jVz8a34+UWV4skZHl0cuI3Tm4th80LwWGiqiPwXJosgYnba8+R7+JUYOdHmc7k79JlxWI0i2hCTTVkTpagVpK6J0U2W5AQYTYLuBmbcJ5uCmP822xON0U5/nvwBN0srVTb80AwAAAABJRU5ErkJggg==";
function agentDir() {
  for (const d of [path.resolve(process.cwd(), "agent"), path.resolve(process.cwd(), "artifacts/api-server/agent"), path.resolve(process.cwd(), "../api-server/agent"), "/opt/it-hub/artifacts/api-server/agent", ...(process.env.AGENT_DIR ? [process.env.AGENT_DIR] : [])]) if (fs.existsSync(path.join(d, "ITHubAgent.ps1"))) return d;
  return null;
}
/** Current agent release: version from ITHubAgent.ps1 and its SHA-256 (re-read when the file changes, e.g. after deploy). */
let rel: { mtime: number; version: string; sha256: string; body: Buffer } | null = null;
export function agentRelease() {
  const d = agentDir(); if (!d) return null;
  const f = path.join(d, "ITHubAgent.ps1"); const mt = fs.statSync(f).mtimeMs;
  if (!rel || rel.mtime !== mt) { const body = fs.readFileSync(f); rel = { mtime: mt, body, sha256: crypto.createHash("sha256").update(body).digest("hex"), version: (body.toString("utf8").match(/\$AgentVersion\s*=\s*'([^']+)'/) || [])[1] || "0" }; }
  return { version: rel.version, sha256: rel.sha256, body: rel.body };
}
function fileText(req: Request, f: string) {
  const d = agentDir(); if (!d) throw Object.assign(new Error("Agent package is not on this server"), { status: 404 });
  const base = (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  return fs.readFileSync(path.join(d, f), "utf8").replace(/__ITHUB_URL__/g, base);
}
function fileBuf(f: string) { const d = agentDir(); if (!d) throw Object.assign(new Error("Agent package is not on this server"), { status: 404 }); return fs.readFileSync(path.join(d, f)); }
/** Address agents should report to (AGENT_SERVER_URL, else APP_URL). Agents switch to it after confirming it accepts their token. */
function agentServerUrl() { const u = String(process.env.AGENT_SERVER_URL || process.env.APP_URL || "").trim().replace(/\/$/, ""); return /^https:\/\/[^\s/]+/.test(u) ? u : null; }
/** Zip: agent files + the key + a double-click installer that asks for admin rights. */
async function sendPackage(req: Request, res: Response, c: any, code: string) {
  const { ZipStream } = await import("../lib/zip");
  const who = c.kind === "user" ? String(c.user_name || "user").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") : String(c.label || "bulk").replace(/[^A-Za-z0-9]+/g, "-");
  const folder = `ITHubAgent-${who}`;
  res.setHeader("Content-Type", "application/zip"); res.setHeader("Content-Disposition", `attachment; filename="${folder}.zip"`); res.setHeader("Cache-Control", "no-store");
  const zip = new ZipStream(res);
  for (const f of PKG) await zip.add(`${folder}/${f}`, isBin(f) ? fileBuf(f) : Buffer.from(fileText(req, f), "utf8"));
  await zip.add(`${folder}/installation-key.txt`, Buffer.from(code.match(/.{4}/g)!.join("-") + "\r\n", "utf8"));
  const dbl = [
    "@echo off",
    "REM Double-click to install the IT Hub device agent with the key in installation-key.txt (asks for administrator rights).",
    "net session >nul 2>&1",
    "if %errorlevel% neq 0 (",
    "  powershell -NoProfile -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\"",
    "  exit /b",
    ")",
    "set /p KEY=<\"%~dp0installation-key.txt\"",
    "\"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -NoProfile -ExecutionPolicy Bypass -File \"%~dp0Install-ITHubAgent.ps1\" -Code %KEY%",
    "echo.",
    "pause",
  ].join("\r\n") + "\r\n";
  await zip.add(`${folder}/Install IT Hub Agent.cmd`, Buffer.from(dbl, "utf8"));
  await zip.finish(); res.end();
}

/** Plain agent files (without a key) for IT. */
router.get("/asset-agents/package/:file", requireAuth, wrap(async (req, res) => {
  if (!await canManage(req)) return fail(res, 403, "You need edit access to the Asset Registry");
  const f = String(req.params.file); if (!PKG.includes(f)) return fail(res, 404, "Unknown file");
  res.setHeader("Content-Type", "application/octet-stream"); res.setHeader("Content-Disposition", `attachment; filename="${f}"`);
  res.send(isBin(f) ? fileBuf(f) : fileText(req, f));
}));
router.get("/asset-agents/release", requireAuth, wrap(async (_req, res) => {
  const r = agentRelease(); if (!r) return res.json({ version: null });
  const n = rowsOf(await db.execute(sql`SELECT count(*) FILTER (WHERE agent_version = ${r.version})::int AS current, count(*)::int AS total FROM asset_agents WHERE status = 'Active'`))[0];
  res.json({ version: r.version, sha256: r.sha256, upToDate: n.current, devices: n.total });
}));

/* ── sweep: offline / idle devices, retention (hourly) ─────────────────── */
export async function agentSweep() {
  const st = await agentSettings(), t = st.thresholds;
  const agents = rowsOf(await db.execute(sql`SELECT g.*, s.asset_tag AS "assetTag" FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE g.status = 'Active'`));
  let offline = 0, idle = 0;
  for (const a of agents) {
    const seenDays = a.last_seen_at ? (Date.now() - new Date(a.last_seen_at).getTime()) / 86_400_000 : 999;
    if (seenDays > t.offlineDays) {
      offline++;
      await db.execute(sql`INSERT INTO asset_agent_alerts (agent_id, asset_id, kind, severity, message) VALUES (${a.id}, ${a.asset_id}, 'offline', 'Warning', ${`Not reported for ${Math.floor(seenDays)} days — device off, lost, or agent removed`}) ON CONFLICT DO NOTHING`);
      await db.execute(sql`UPDATE asset_agents SET health_state = 'Offline' WHERE id = ${a.id}`);
    } else await db.execute(sql`UPDATE asset_agent_alerts SET closed_at = now() WHERE agent_id = ${a.id} AND kind = 'offline' AND closed_at IS NULL`);
    if (a.platform === "Workstation" && seenDays <= t.offlineDays && (Date.now() - new Date(a.enrolled_at).getTime()) / 86_400_000 > t.idleDays) {
      const [u] = rowsOf(await db.execute(sql`SELECT max(day) AS d FROM asset_usage_daily WHERE agent_id = ${a.id} AND active_mins >= 15`));
      const idleDays = u?.d ? Math.floor((Date.now() - new Date(u.d).getTime()) / 86_400_000) : t.idleDays + 1;
      if (idleDays > t.idleDays) { idle++; await db.execute(sql`INSERT INTO asset_agent_alerts (agent_id, asset_id, kind, severity, message) VALUES (${a.id}, ${a.asset_id}, 'idle', 'Warning', ${`Not used for ${idleDays} days — candidate for reallocation`}) ON CONFLICT (agent_id, kind) WHERE closed_at IS NULL DO UPDATE SET message = EXCLUDED.message`); }
      else await db.execute(sql`UPDATE asset_agent_alerts SET closed_at = now() WHERE agent_id = ${a.id} AND kind = 'idle' AND closed_at IS NULL`);
    }
  }
  await db.execute(sql`DELETE FROM asset_health_snapshots WHERE at < now() - (${st.retentionDays} || ' days')::interval`);
  await db.execute(sql`DELETE FROM asset_usage_daily WHERE day < (now() - (${st.retentionDays} || ' days')::interval)::date`);
  return { agents: agents.length, offline, idle };
}
router.post("/asset-agents/sweep", requireAuth, wrap(async (req, res) => { if (!await canManage(req)) return fail(res, 403, "No access"); res.json(await agentSweep()); }));
export function startAgentSweep() {
  if (process.env.ITSM_MONITOR === "off") return;
  setTimeout(() => agentSweep().catch(e => console.error("agent sweep failed", e)), 90_000);
  setInterval(() => agentSweep().catch(e => console.error("agent sweep failed", e)), 3600_000).unref?.();
}

export default router;
