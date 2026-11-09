/** ITH-092 — About page facts (live): who may see it, versions and counts. Super Admin and IT Asset Admin only. */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { getAccess } from "../lib/rbac";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
export async function canSeeAbout(req: Request) { const a = await getAccess(req); return !!a && (a.isAdmin || a.perms?.asset_registry === "admin"); }
router.get("/about", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!await canSeeAbout(req)) { res.status(403).json({ error: "The About page is for Super Admin and IT Asset Admin" }); return; }
    const { agentRelease } = await import("./asset-agent");
    const [c] = rowsOf(await db.execute(sql`SELECT (SELECT count(*)::int FROM users WHERE is_active) AS users, (SELECT count(*)::int FROM asset_agents WHERE status = 'Active') AS devices,
      (SELECT count(*)::int FROM assets) AS assets, (SELECT count(*)::int FROM itsm_incidents) AS incidents`));
    const versions = rowsOf(await db.execute(sql`SELECT coalesce(agent_version, '?') AS version, count(*)::int AS devices FROM asset_agents WHERE status = 'Active' GROUP BY 1 ORDER BY 1 DESC`));
    res.json({ app: { name: "IT Hub", build: process.env.APP_BUILD || null, started: new Date(Date.now() - process.uptime() * 1000).toISOString(), node: process.version },
      agent: { latest: agentRelease()?.version || null, versions }, counts: c });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
export default router;
