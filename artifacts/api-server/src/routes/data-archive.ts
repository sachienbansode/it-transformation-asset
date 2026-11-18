import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "./auth";
import { logAudit, getPerformedBy, buildContext } from "./audit-logs";
import { ASSET_TABLES, batchSections, batchWorkbook, XLSX_TYPE } from "../lib/archive";
import { mailConfigured, mailFrom, parseRecipients, EMAIL_RE, sendTest, notify, htmlTable, loadMailConfig, clearMailCache } from "../lib/mailer";
import { sealText } from "../lib/secure-text";
import { fmtDateTime } from "../lib/dates";

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
    if (b.restored_at) return fail(res, 400, `Already restored on ${fmtDateTime(b.restored_at)} by ${b.restored_by}`);
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
    const mc = await loadMailConfig();
    res.json({ rules: list, mail: { configured: mailConfigured(), from: mailConfigured() ? mailFrom() : null, provider: mc.provider } });
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

/* ─── ITH-113 Email delivery: Microsoft 365 or SMTP, chosen and configured by the admin ─────────────── */
router.get("/mail-settings", requireAdmin, async (_req, res) => {
  try {
    clearMailCache(); const c = await loadMailConfig();
    const r = rows(await db.execute(sql`SELECT value FROM settings WHERE key = 'mail.config'`)); const raw: any = r[0] ? (typeof r[0].value === "string" ? JSON.parse(r[0].value) : r[0].value) : null;
    res.json({ provider: c.provider, fromEnvironment: !raw,
      m365: { tenantId: c.m365.tenantId, clientId: c.m365.clientId, from: c.m365.from, hasSecret: !!c.m365.secret },
      smtp: { host: c.smtp.host, port: c.smtp.port, security: c.smtp.security, user: c.smtp.user || "", from: c.smtp.from, fromName: c.smtp.fromName || "", rejectUnauthorized: c.smtp.rejectUnauthorized !== false, hasPassword: !!c.smtp.pass },
      configured: mailConfigured() });
  } catch (e) { handleError(res, e); }
});
router.put("/mail-settings", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {}; const provider = ["m365", "smtp", "off"].includes(b.provider) ? b.provider : null; if (!provider) return fail(res, 400, "Choose Microsoft 365, SMTP or Off");
    const r = rows(await db.execute(sql`SELECT value FROM settings WHERE key = 'mail.config'`)); const old: any = r[0] ? (typeof r[0].value === "string" ? JSON.parse(r[0].value) : r[0].value) : {};
    const s = (v: any, n = 200) => String(v ?? "").trim().slice(0, n);
    const next: any = { provider, m365: { ...(old.m365 || {}) }, smtp: { ...(old.smtp || {}) } };
    if (b.m365) { next.m365.tenantId = s(b.m365.tenantId, 64); next.m365.clientId = s(b.m365.clientId, 64); next.m365.from = s(b.m365.from).toLowerCase(); if (b.m365.secret) next.m365.secretSealed = sealText(String(b.m365.secret)); }
    if (b.smtp) {
      const port = Number(b.smtp.port); if (b.smtp.port !== undefined && !(port > 0 && port < 65536)) return fail(res, 400, "Enter a valid SMTP port (e.g. 587 or 465)");
      next.smtp.host = s(b.smtp.host); next.smtp.port = port || 587; next.smtp.security = ["tls", "starttls", "none"].includes(b.smtp.security) ? b.smtp.security : "starttls";
      next.smtp.user = s(b.smtp.user); next.smtp.from = s(b.smtp.from).toLowerCase(); next.smtp.fromName = s(b.smtp.fromName, 80); next.smtp.rejectUnauthorized = b.smtp.rejectUnauthorized !== false;
      if (b.smtp.password) next.smtp.passSealed = sealText(String(b.smtp.password)); if (b.smtp.clearPassword) delete next.smtp.passSealed;
    }
    if (provider === "smtp" && (!next.smtp.host || !EMAIL_RE.test(next.smtp.from || ""))) return fail(res, 400, "SMTP needs the server host and a valid From address");
    if (provider === "m365" && (!next.m365.tenantId || !next.m365.clientId || !EMAIL_RE.test(next.m365.from || "") || !(next.m365.secretSealed || process.env.MAIL_M365_CLIENT_SECRET))) return fail(res, 400, "Microsoft 365 needs the tenant ID, client ID, client secret and a valid From mailbox");
    await db.execute(sql`INSERT INTO settings (key, value) VALUES ('mail.config', ${JSON.stringify(next)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    clearMailCache();
    const ch: string[] = []; const was = old.provider || "m365 (environment)"; if (was !== provider) ch.push(`provider: ${was} → ${provider}`);
    for (const [k, v] of Object.entries({ ...next.smtp, passSealed: undefined })) if (v !== undefined && String(v) !== String((old.smtp || {})[k] ?? "")) ch.push(`smtp.${k}: ${(old.smtp || {})[k] ?? "—"} → ${v}`);
    for (const k of ["tenantId", "clientId", "from"]) if (String(next.m365[k] ?? "") !== String((old.m365 || {})[k] ?? "")) ch.push(`m365.${k}: ${(old.m365 || {})[k] ?? "—"} → ${next.m365[k]}`);
    if (b.smtp?.password) ch.push("SMTP password changed"); if (b.m365?.secret) ch.push("Microsoft 365 client secret changed");
    try { await logAudit({ entityType: "mail_settings", action: "update", performedBy: await by(req), summary: `Email delivery settings: ${ch.join("; ") || "no change"}` }); } catch { /* audit is best effort */ }
    res.json({ ok: true, changes: ch });
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
