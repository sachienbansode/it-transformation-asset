/** ITH-120 — NIYTRI platform console. Active only in the console instance (PLATFORM_CONSOLE=1) for its Super Admins.
 *  - Clients: register existing instances, or create a new client (queued job → the root worker runs new-tenant.sh).
 *  - Releases: read from GitHub (GITHUB_REPO, optional GITHUB_TOKEN) — tags with their release notes.
 *  - Update a client: send a release notice into the client's own IT Hub (Admin › Updates); the client approves / defers /
 *    rejects; Deploy is allowed only after approval, or with an emergency reason that the client sees.
 *  The web app never runs anything as root: it only writes jobs; scripts/tenant/platform-worker.sh (systemd timer) runs them. */
import { Router, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { getAccess } from "../lib/rbac";
import { logAudit, getPerformedBy } from "./audit-logs";

const router = Router();
router.use("/platform", requireAuth);
const rowsOf = (r: any) => (r.rows ?? r) as any[];
export const consoleOn = () => process.env.PLATFORM_CONSOLE === "1";

async function guard(req: Request, res: Response) {
  if (!consoleOn()) { res.status(404).json({ error: "Not available on this instance" }); return null; }
  const a = await getAccess(req); if (!a?.isAdmin) { res.status(403).json({ error: "NIYTRI platform console is for its Super Admins" }); return null; }
  return { ...a, by: await getPerformedBy(a.userId).catch(() => "NIYTRI admin") };
}

/* one small pool per client database (same RDS server and login as this console; password from PGPASSWORD) */
const pools = new Map<string, any>();
function clientDb(dbName: string) {
  if (!/^[a-z][a-z0-9_-]{1,40}$/.test(dbName)) throw new Error("Bad database name");
  let p = pools.get(dbName);
  if (!p) {
    const url = String(process.env.DATABASE_URL || "").replace(/^(postgres(?:ql)?:\/\/[^/]+\/)[^?]+/, `$1${dbName}`);
    const Pool = (pool as any).constructor; p = new Pool({ connectionString: url, max: 2, idleTimeoutMillis: 20000, connectionTimeoutMillis: 5000 });
    p.on("error", () => { /* idle client dropped */ }); pools.set(dbName, p);
  }
  return p;
}
const cq = async (dbName: string, text: string, params: any[] = []) => (await clientDb(dbName).query(text, params)).rows as any[];

async function liveInfo(c: any) {
  try {
    const [d] = await cq(c.db_name, `SELECT version, git_commit AS "commit", status, started_at AS "at" FROM app_deployments ORDER BY started_at DESC LIMIT 1`).catch(() => [null]);
    const [u] = await cq(c.db_name, `SELECT id, version, status, decided_by AS "decidedBy", decided_at AS "decidedAt", defer_until AS "deferUntil", decision_note AS "note" FROM app_update_requests ORDER BY requested_at DESC LIMIT 1`).catch(() => [null]);
    const [n] = await cq(c.db_name, `SELECT (SELECT count(*)::int FROM users WHERE is_active) AS users, (SELECT count(*)::int FROM assets) AS assets, (SELECT count(*)::int FROM itsm_incidents) AS incidents`);
    return { reachable: true, lastDeployment: d || null, lastRequest: u || null, counts: n };
  } catch (e: any) { return { reachable: false, error: String(e?.message || e).slice(0, 200) }; }
}

/* ── releases: GitHub (GITHUB_REPO / GITHUB_TOKEN); when not set or not reachable, the tags in this server's repository ── */
let relCache: { at: number; list: any[]; source: string } | null = null;
async function gitHubReleases(repo: string) {
  const h: any = { Accept: "application/vnd.github+json", "User-Agent": "niytri-it-hub-console" }; if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const get = async (p: string) => { const r = await fetch(`https://api.github.com/repos/${repo}${p}`, { headers: h, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(`GitHub ${r.status}`); return r.json() as any; };
  const rel: any[] = await get("/releases?per_page=30").catch(() => []);
  const tags: any[] = await get("/tags?per_page=50");
  return tags.filter(t => /^v\d+\.\d+\.\d+/.test(t.name)).map(t => { const r = rel.find(x => x.tag_name === t.name);
    return { tag: t.name, version: t.name.replace(/^v/, ""), commit: String(t.commit?.sha || "").slice(0, 7), title: r?.name || t.name, notes: r?.body || "", publishedAt: r?.published_at || null }; });
}
async function localTags() {
  const { execFile } = await import("node:child_process"); const path = await import("node:path"); const fs = await import("node:fs");
  let dir = process.cwd(); for (let i = 0; i < 5 && !fs.existsSync(path.join(dir, ".git")); i++) dir = path.dirname(dir);
  await new Promise<void>(ok => execFile("git", ["-C", dir, "fetch", "-q", "--tags"], { timeout: 15000 }, () => ok()));
  const out = await new Promise<string>((ok, no) => execFile("git", ["-C", dir, "for-each-ref", "refs/tags/v*", "--sort=-creatordate", "--format=%(refname:short)%09%(objectname:short)%09%(creatordate:iso8601)%09%(subject)%09%(contents:body)%1e"], { timeout: 15000 }, (e, so) => e ? no(e) : ok(so)));
  return out.split("\x1e").map(x => x.trim()).filter(Boolean).map(l => { const [tag, commit, date, subject, ...body] = l.split("\t");
    return { tag, version: tag.replace(/^v/, ""), commit, title: subject || tag, notes: body.join("\t").trim(), publishedAt: date ? new Date(date).toISOString() : null }; });
}
async function releases(): Promise<any[]> {
  if (relCache && Date.now() - relCache.at < 120_000) return relCache.list;
  const repo = process.env.GITHUB_REPO || ""; let list: any[] = []; let source = "git tags on this server";
  if (/^[\w.-]+\/[\w.-]+$/.test(repo)) { try { list = await gitHubReleases(repo); source = `GitHub ${repo}`; } catch { /* fall back */ } }
  if (!list.length) list = await localTags();
  relCache = { at: Date.now(), list, source }; return list;
}

router.get("/platform/status", async (req, res) => { res.json({ console: consoleOn() && !!(await getAccess(req))?.isAdmin }); });

router.get("/platform/clients", async (req, res) => {
  if (!await guard(req, res)) return;
  const clients = rowsOf(await db.execute(sql`SELECT * FROM platform_clients ORDER BY code`));
  const out = []; for (const c of clients) out.push({ ...c, live: c.status === "Provisioning" ? null : await liveInfo(c) });
  const jobs = rowsOf(await db.execute(sql`SELECT j.id, j.kind, j.status, j.params, j.requested_by AS "by", j.requested_at AS "at", j.finished_at AS "finishedAt", right(coalesce(j.log, ''), 3000) AS log, c.code
    FROM platform_jobs j LEFT JOIN platform_clients c ON c.id = j.client_id ORDER BY j.id DESC LIMIT 30`));
  res.json({ clients: out, jobs });
});

router.get("/platform/releases", async (req, res) => {
  if (!await guard(req, res)) return;
  try { const list = await releases(); res.json({ source: relCache?.source, releases: list }); } catch (e: any) { res.status(502).json({ error: `Could not read releases: ${e.message}` }); }
});

const CODE = /^[a-z][a-z0-9-]{1,30}$/, DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/, DBN = /^[a-z][a-z0-9_]{1,40}$/, EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
router.post("/platform/clients", async (req, res) => {
  const g = await guard(req, res); if (!g) return;
  const b = req.body || {}; const code = String(b.code || "").trim().toLowerCase(), name = String(b.name || "").trim(), domain = String(b.domain || "").trim().toLowerCase(),
    dbName = String(b.dbName || "").trim().toLowerCase(), adminEmail = String(b.adminEmail || "").trim().toLowerCase(), contactEmail = String(b.contactEmail || "").trim().toLowerCase(), existing = !!b.existing;
  const bad = !CODE.test(code) ? "Client code: lower-case letters, digits, hyphen (e.g. ashikamf)" : !name ? "Client name is required" : !DOMAIN.test(domain) ? "Web address looks wrong" :
    !DBN.test(dbName) && !(existing && /^[a-z][a-z0-9_-]{1,40}$/.test(dbName)) ? "Database name: lower-case letters, digits, underscore" : !existing && !EMAIL.test(adminEmail) ? "First Super Admin email is required" : contactEmail && !EMAIL.test(contactEmail) ? "Contact email looks wrong" : null;
  if (bad) { res.status(400).json({ error: bad }); return; }
  const [dup] = rowsOf(await db.execute(sql`SELECT code FROM platform_clients WHERE code = ${code} OR lower(domain) = ${domain} OR db_name = ${dbName}`));
  if (dup) { res.status(409).json({ error: `Already registered (client ${dup.code}) — code, web address and database must be unique` }); return; }
  if (existing) { try { await cq(dbName, "SELECT 1 FROM users LIMIT 1"); } catch (e: any) { res.status(400).json({ error: `Cannot open database ${dbName}: ${String(e.message).slice(0, 120)}` }); return; } }
  const [c] = rowsOf(await db.execute(sql`INSERT INTO platform_clients (code, name, domain, db_name, folder, admin_email, contact_email, status, created_by)
    VALUES (${code}, ${name}, ${domain}, ${dbName}, ${String(b.folder || "") || null}, ${adminEmail || null}, ${contactEmail || null}, ${existing ? "Active" : "Provisioning"}, ${g.by}) RETURNING id`));
  if (!existing) await db.execute(sql`INSERT INTO platform_jobs (client_id, kind, params, requested_by) VALUES (${c.id}, 'new_client', ${JSON.stringify({ code, domain, dbName, adminEmail })}::jsonb, ${g.by})`);
  logAudit({ entityType: "platform_client", entityId: c.id, action: existing ? "register" : "create", performedBy: g.by, summary: `${existing ? "Registered existing" : "New"} client ${code} (${name}) — ${domain}, database ${dbName}` }).catch(() => {});
  res.status(201).json({ id: c.id, queued: !existing });
});

/** Send a release notice into the client's IT Hub (Admin › Updates) and tell its Super Admins. */
router.post("/platform/clients/:id/request-update", async (req, res) => {
  const g = await guard(req, res); if (!g) return;
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM platform_clients WHERE id = ${Number(req.params.id)}`)); if (!c) { res.status(404).json({ error: "Client not found" }); return; }
  const tag = String(req.body?.tag || ""); const rel = (await releases().catch(() => [])).find(r => r.tag === tag);
  if (!rel) { res.status(400).json({ error: "Choose a release (git tag) from the list" }); return; }
  const planned = req.body?.plannedAt ? new Date(String(req.body.plannedAt)) : null; if (planned && isNaN(planned.getTime())) { res.status(400).json({ error: "Planned date is not valid" }); return; }
  const notes = String(req.body?.notes || rel.notes || "").slice(0, 8000);
  const open = await cq(c.db_name, `SELECT id FROM app_update_requests WHERE version = $1 AND status IN ('Pending', 'Approved', 'Deferred')`, [rel.version]);
  if (open.length) { res.status(409).json({ error: `Version ${rel.version} has already been sent to ${c.code} and is waiting` }); return; }
  await cq(c.db_name, `UPDATE app_update_requests SET status = 'Withdrawn' WHERE status IN ('Pending', 'Deferred')`);   // a newer release replaces an older waiting one
  const [u] = await cq(c.db_name, `INSERT INTO app_update_requests (version, git_ref, title, notes, planned_at, requested_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [rel.version, rel.tag, rel.title, notes, planned, `NIYTRI (${g.by})`]);
  await cq(c.db_name, `INSERT INTO notifications (user_id, title, message, type, link) SELECT id, $1, $2, 'info', '/admin/updates' FROM users WHERE role = 'admin' AND is_active`,
    [`Update ${rel.version} needs your approval`, `NIYTRI plans to update IT Hub to version ${rel.version}${planned ? ` on ${planned.toISOString().slice(0, 10)}` : ""}. Review the release notes and approve, defer or reject.`]).catch(() => {});
  logAudit({ entityType: "platform_client", entityId: c.id, action: "request_update", performedBy: g.by, summary: `Asked ${c.code} to approve version ${rel.version}` }).catch(() => {});
  res.json({ ok: true, requestId: u.id });
});

/** Queue a deployment: needs the client's approval for that version, or an emergency reason (recorded in the client's IT Hub). */
router.post("/platform/clients/:id/deploy", async (req, res) => {
  const g = await guard(req, res); if (!g) return;
  const [c] = rowsOf(await db.execute(sql`SELECT * FROM platform_clients WHERE id = ${Number(req.params.id)}`)); if (!c) { res.status(404).json({ error: "Client not found" }); return; }
  if (c.status !== "Active") { res.status(400).json({ error: `Client is ${c.status}` }); return; }
  const tag = String(req.body?.tag || ""); const emergency = String(req.body?.emergencyReason || "").trim();
  const rel = (await releases().catch(() => [])).find(r => r.tag === tag); if (!rel) { res.status(400).json({ error: "Choose a release (git tag)" }); return; }
  const [ok] = await cq(c.db_name, `SELECT id, status FROM app_update_requests WHERE version = $1 ORDER BY id DESC LIMIT 1`, [rel.version]);
  const [cs] = await cq(c.db_name, `SELECT value FROM settings WHERE key = 'updates.consent_required'`);
  const consent = cs?.value === true || cs?.value === "true";
  const [last] = await cq(c.db_name, `SELECT version FROM app_deployments WHERE status = 'Done' ORDER BY started_at DESC LIMIT 1`).catch(() => [null]);
  const reinstall = last?.version === rel.version;   // same version again (e.g. after a server fix) needs no new approval
  if (consent && !reinstall && ok?.status !== "Approved") {
    if (emergency.length < 10) { res.status(409).json({ error: ok ? `${c.code} has not approved ${rel.version} (status: ${ok.status}). Deploy only after approval, or give an emergency reason (at least 10 characters).` : `Send ${rel.version} to ${c.code} for approval first, or give an emergency reason.` }); return; }
    if (ok) await cq(c.db_name, `UPDATE app_update_requests SET emergency_reason = $1 WHERE id = $2`, [emergency, ok.id]);
    else await cq(c.db_name, `INSERT INTO app_update_requests (version, git_ref, title, notes, status, requested_by, emergency_reason) VALUES ($1, $2, $3, $4, 'Pending', $5, $6)`, [rel.version, rel.tag, rel.title, rel.notes, `NIYTRI (${g.by})`, emergency]);
  }
  const [busy] = rowsOf(await db.execute(sql`SELECT id FROM platform_jobs WHERE client_id = ${c.id} AND status IN ('Queued', 'Running')`)); if (busy) { res.status(409).json({ error: "A job for this client is already queued or running" }); return; }
  const [j] = rowsOf(await db.execute(sql`INSERT INTO platform_jobs (client_id, kind, params, requested_by) VALUES (${c.id}, 'deploy', ${JSON.stringify({ code: c.code, folder: c.folder, ref: rel.tag, emergency: emergency || null })}::jsonb, ${g.by}) RETURNING id`));
  logAudit({ entityType: "platform_client", entityId: c.id, action: emergency ? "deploy_emergency" : "deploy", performedBy: g.by, summary: `Deploy ${rel.version} to ${c.code} queued${emergency ? ` — EMERGENCY: ${emergency}` : ""}` }).catch(() => {});
  res.json({ ok: true, jobId: j.id });
});

export default router;
