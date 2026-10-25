import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "./auth";
import { logAudit, getPerformedBy, buildContext } from "./audit-logs";
import { ASSET_TABLES, batchSections, batchWorkbook, XLSX_TYPE } from "../lib/archive";
import { mailConfigured, mailFrom, parseRecipients, EMAIL_RE, sendTest, notify, htmlTable } from "../lib/mailer";

/* Admin › Archive (upload / clear batches, download, restore) and Admin › Notifications (email recipients per event). */

const router = Router();
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const handleError = (res: Response, e: unknown) => fail(res, 500, e instanceof Error ? e.message : String(e));
const rows = (r: any) => (r.rows ?? r) as any[];
const by = (req: Request) => getPerformedBy((req.session as any)?.userId).catch(() => "System");

router.get("/data-archive", requireAdmin, async (req, res) => {
  try {
    const kind = String(req.query.kind || "");
    const list = rows(await db.execute(sql`SELECT b.id, b.batch_no AS "batchNo", b.kind, b.module, b.title, b.file_name AS "fileName", b.row_count AS "rowCount", b.summary,
        b.created_by AS "createdBy", b.created_at AS "createdAt", b.restored_at AS "restoredAt", b.restored_by AS "restoredBy",
        (SELECT o.status FROM email_outbox o WHERE o.batch_id = b.id ORDER BY o.id DESC LIMIT 1) AS "emailStatus",
        (SELECT o.recipients FROM email_outbox o WHERE o.batch_id = b.id ORDER BY o.id DESC LIMIT 1) AS "emailTo"
      FROM data_archive_batches b ${kind ? sql`WHERE b.kind = ${kind}` : sql``} ORDER BY b.created_at DESC LIMIT 500`));
    res.json(list);
  } catch (e) { handleError(res, e); }
});

router.get("/data-archive/:id/excel", requireAdmin, async (req, res) => {
  try {
    const { buffer, name } = await batchWorkbook(Number(req.params.id));
    res.setHeader("Content-Type", XLSX_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(buffer);
  } catch (e) { handleError(res, e); }
});

/** Restore a "Clear all" batch: only into an empty asset module, with original ids, history and sequences. */
router.post("/data-archive/:id/restore", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [b] = rows(await db.execute(sql`SELECT * FROM data_archive_batches WHERE id = ${id}`));
    if (!b) return fail(res, 404, "Archive batch not found");
    if (b.kind !== "asset_clear") return fail(res, 400, "Only a 'Clear all' batch can be restored. Upload batches are kept for reference and download.");
    if (b.restored_at) return fail(res, 400, `Already restored on ${new Date(b.restored_at).toLocaleString("en-IN")} by ${b.restored_by}`);
    const [{ n }] = rows(await db.execute(sql`SELECT count(*)::int AS n FROM assets`));
    if (n > 0) return fail(res, 400, `The asset register is not empty (${n} assets). Clear it first — that is archived too — then restore this batch.`);
    const s = await batchSections(id);
    const who = await by(req);
    const counts: Record<string, number> = {};
    await db.transaction(async tx => {
      await tx.execute(sql.raw(`TRUNCATE TABLE ${ASSET_TABLES.map(t => "public." + t).join(", ")} RESTART IDENTITY`));
      for (const t of ASSET_TABLES) {
        const data = s[`table:${t}`] || [];
        counts[t] = data.length;
        if (data.length) await tx.execute(sql`INSERT INTO ${sql.raw("public." + t)} SELECT * FROM json_populate_recordset(NULL::${sql.raw("public." + t)}, ${JSON.stringify(data)}::json)`);
        await tx.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('public.${t}', 'id'), COALESCE((SELECT max(id) FROM public.${t}), 1), (SELECT max(id) IS NOT NULL FROM public.${t}))`));
      }
      await tx.execute(sql`UPDATE data_archive_batches SET restored_at = now(), restored_by = ${who} WHERE id = ${id}`);
    });
    try { await logAudit({ entityType: "data_archive", entityId: id, action: "restore", performedBy: who, summary: `Restored asset data from ${b.batch_no} (${counts.assets} assets)`, context: buildContext(req, "Archive") }); } catch { /* non-fatal */ }
    void notify("asset_clear", { subject: `Asset data restored from ${b.batch_no} (${counts.assets} assets)`, html: `<p>Archived asset data was restored to the live register.</p>${htmlTable([["Archive batch", b.batch_no], ["Restored by", who], ["Assets", counts.assets], ["Handovers", counts.asset_allocations], ["History entries", counts.asset_transactions]])}` });
    res.json({ ok: true, counts });
  } catch (e) { handleError(res, e); }
});

/* ─── Notification rules ────────────────────────────────────────────────── */

router.get("/notification-rules", requireAdmin, async (_req, res) => {
  try {
    const list = rows(await db.execute(sql`SELECT event_key AS "eventKey", label, module, description, recipients, enabled, attach_excel AS "attachExcel", updated_by AS "updatedBy", updated_at AS "updatedAt" FROM notification_rules ORDER BY sort_order, label`));
    res.json({ rules: list, mail: { configured: mailConfigured(), from: mailConfigured() ? mailFrom() : null } });
  } catch (e) { handleError(res, e); }
});

router.put("/notification-rules/:key", requireAdmin, async (req, res) => {
  try {
    const list = parseRecipients(req.body?.recipients);
    const bad = list.filter(a => !EMAIL_RE.test(a));
    if (bad.length) return fail(res, 400, `Not valid email address(es): ${bad.join(", ")}`);
    if (list.length > 50) return fail(res, 400, "Maximum 50 recipients per event");
    const who = await by(req);
    const r = rows(await db.execute(sql`UPDATE notification_rules SET recipients = ${list.join(", ")}, enabled = ${req.body?.enabled !== false}, attach_excel = ${req.body?.attachExcel !== false}, updated_by = ${who}, updated_at = now()
      WHERE event_key = ${req.params.key} RETURNING event_key`));
    if (!r.length) return fail(res, 404, "Unknown event");
    try { await logAudit({ entityType: "notification_rule", action: "update", performedBy: who, summary: `Email recipients for ${req.params.key}: ${list.join(", ") || "(none)"}${req.body?.enabled === false ? " — switched off" : ""}`, context: buildContext(req, "Notifications") }); } catch { /* non-fatal */ }
    res.json({ ok: true, recipients: list.join(", ") });
  } catch (e) { handleError(res, e); }
});

router.post("/notification-rules/test", requireAdmin, async (req, res) => {
  try {
    const to = parseRecipients(req.body?.to).filter(a => EMAIL_RE.test(a));
    if (!to.length) return fail(res, 400, "Give at least one valid email address");
    await sendTest(to);
    res.json({ ok: true });
  } catch (e) { fail(res, 400, e instanceof Error ? e.message : String(e)); }
});

router.get("/email-outbox", requireAdmin, async (_req, res) => {
  try {
    res.json(rows(await db.execute(sql`SELECT o.id, o.event_key AS "eventKey", o.recipients, o.subject, o.attachment_name AS "attachmentName", o.status, o.error, o.created_at AS "createdAt", o.sent_at AS "sentAt", b.batch_no AS "batchNo"
      FROM email_outbox o LEFT JOIN data_archive_batches b ON b.id = o.batch_id ORDER BY o.id DESC LIMIT 200`)));
  } catch (e) { handleError(res, e); }
});

export default router;
