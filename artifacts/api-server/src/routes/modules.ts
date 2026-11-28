/** 2.20 (ITH-208) — Admin › Settings › Modules: switch whole modules on / off (Super Admin). */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess } from "../lib/rbac";
import { isSuperAdmin } from "../lib/access-model";
import { MODULES, disabledModules, clearModulesCache } from "../lib/modules";

const router = Router();
router.get("/modules", requireAuth, async (_req: Request, res: Response) => {
  const off = await disabledModules();
  res.json(MODULES.map(m => ({ ...m, enabled: !off.has(m.key) })));
});
router.put("/modules/:key", requireAuth, async (req: Request, res: Response) => {
  if (!isSuperAdmin(await getAccess(req))) { res.status(403).json({ error: "Only the Super Admin can switch modules on or off" }); return; }
  const m = MODULES.find(x => x.key === req.params.key); if (!m) { res.status(404).json({ error: "Unknown module" }); return; }
  const enabled = req.body?.enabled === true; const reason = String(req.body?.reason || "").trim();
  if (!enabled && reason.length < 5) { res.status(400).json({ error: "Give a reason for switching the module off (at least 5 characters)" }); return; }
  const off = new Set(await disabledModules()); enabled ? off.delete(m.key) : off.add(m.key);
  await db.execute(sql`INSERT INTO settings (key, value) VALUES ('modules.disabled', ${JSON.stringify([...off])}::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
  clearModulesCache();
  await logAudit({ entityType: "setting", entityId: 0, action: enabled ? "module_on" : "module_off", performedBy: await getPerformedBy(Number((req.session as any).userId)), summary: `Module ${m.label} switched ${enabled ? "on" : "off"}${reason ? ` — ${reason}` : ""}` });
  res.json({ ok: true, disabled: [...off] });
});
export default router;
