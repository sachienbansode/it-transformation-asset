/** ITH-120 — Admin › Updates (in every client instance): NIYTRI announces a new version with release notes; the client's
 *  Super Admin approves, defers (to a date) or rejects it. deploy.sh will not update a client without an Approved request
 *  for that version (unless NIYTRI records an emergency reason, which the client sees here). */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { getAccess } from "../lib/rbac";
import { logAudit, getPerformedBy } from "./audit-logs";
import { appVersion } from "../lib/tenant";

const router = Router();
router.use("/updates", requireAuth);
const rowsOf = (r: any) => (r.rows ?? r) as any[];

router.get("/updates", async (req, res) => {
  const a = await getAccess(req); if (!a?.isAdmin) { res.status(403).json({ error: "Updates are for Super Admin" }); return; }
  const [s] = rowsOf(await db.execute(sql`SELECT value FROM settings WHERE key = 'updates.consent_required'`));
  const requests = rowsOf(await db.execute(sql`SELECT id, version, git_ref AS "ref", title, notes, planned_at AS "plannedAt", status, requested_by AS "requestedBy", requested_at AS "requestedAt",
    decided_by AS "decidedBy", decided_at AS "decidedAt", decision_note AS "note", defer_until AS "deferUntil", deployed_at AS "deployedAt", emergency_reason AS "emergency" FROM app_update_requests ORDER BY requested_at DESC LIMIT 50`));
  const deployments = rowsOf(await db.execute(sql`SELECT version, git_commit AS "commit", status, started_at AS "at" FROM app_deployments ORDER BY started_at DESC LIMIT 10`).catch(() => ({ rows: [] })));
  res.json({ current: appVersion(), consentRequired: s?.value === true || s?.value === "true", requests, deployments });
});

router.post("/updates/:id/decision", async (req, res) => {
  const a = await getAccess(req); if (!a?.isAdmin) { res.status(403).json({ error: "Only a Super Admin can decide on updates" }); return; }
  const id = Number(req.params.id); const decision = String(req.body?.decision || ""); const note = String(req.body?.note || "").trim().slice(0, 1000);
  const deferUntil = String(req.body?.deferUntil || "");
  if (!["Approved", "Deferred", "Rejected"].includes(decision)) { res.status(400).json({ error: "Choose Approve, Defer or Reject" }); return; }
  if (decision === "Rejected" && !note) { res.status(400).json({ error: "Please give a reason for rejecting" }); return; }
  if (decision === "Deferred" && !/^\d{4}-\d{2}-\d{2}$/.test(deferUntil)) { res.status(400).json({ error: "Choose the date until which the update should wait" }); return; }
  if (decision === "Deferred" && deferUntil <= new Date().toISOString().slice(0, 10)) { res.status(400).json({ error: "The defer date must be in the future" }); return; }
  const [r] = rowsOf(await db.execute(sql`SELECT * FROM app_update_requests WHERE id = ${id}`));
  if (!r) { res.status(404).json({ error: "Update request not found" }); return; }
  if (!["Pending", "Deferred"].includes(r.status)) { res.status(409).json({ error: `This update is already ${r.status}` }); return; }
  const by = await getPerformedBy(a.userId).catch(() => "Administrator");
  await db.execute(sql`UPDATE app_update_requests SET status = ${decision}, decided_by = ${by}, decided_by_id = ${a.userId}, decided_at = now(), decision_note = ${note || null},
    defer_until = ${decision === "Deferred" ? deferUntil : null} WHERE id = ${id}`);
  logAudit({ entityType: "app_update", entityId: id, action: decision.toLowerCase(), performedBy: by,
    summary: `Update to version ${r.version} ${decision.toLowerCase()}${decision === "Deferred" ? ` until ${deferUntil}` : ""}${note ? ` — ${note}` : ""}` }).catch(() => {});
  res.json({ ok: true });
});

export default router;
