import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { smtpSend, type SmtpConfig } from "./smtp";
import { openText } from "./secure-text";

/*
 * Email notifications through Microsoft 365 (Microsoft Graph sendMail, app-only / client-credentials).
 *
 * Server configuration (/etc/it-hub.env — secrets never stored in the database):
 *   MAIL_M365_TENANT_ID=<Directory (tenant) ID>
 *   MAIL_M365_CLIENT_ID=<Application (client) ID>
 *   MAIL_M365_CLIENT_SECRET=<client secret>
 *   MAIL_FROM=it-hub@ashikagroup.com          (a licensed mailbox or shared mailbox the app may send as)
 * Azure app registration needs Microsoft Graph application permission Mail.Send (admin consent). Restrict it to
 * the sender mailbox with an Exchange application access policy.
 *
 * Who receives what is configured in the app (Admin › Notifications → notification_rules). Every attempt is
 * recorded in email_outbox (Sent / Failed / Skipped) so nothing fails silently.
 */

const env = (k: string) => (process.env[k] || "").trim();

/* ITH-113 — delivery is chosen by the admin (Admin › Notifications › Email delivery): Microsoft 365 or SMTP.
   Settings live in settings key "mail.config"; passwords / client secrets are stored encrypted (AES-256-GCM, key from
   the server environment) and never returned to the browser. With no saved settings the MAIL_M365_* environment
   values are used as before. */
export type MailConfig = { provider: "m365" | "smtp" | "off"; m365: { tenantId: string; clientId: string; secret: string; from: string }; smtp: SmtpConfig };
let cfgCache: { at: number; cfg: MailConfig } | null = null;
export function clearMailCache() { cfgCache = null; cached = null; }
let MAIL_BRAND = "IT Hub";
export async function loadMailConfig(): Promise<MailConfig> {
  if (cfgCache && Date.now() - cfgCache.at < 30_000) return cfgCache.cfg;
  let saved: any = null;
  try {   // email header = this client's app name and company (Admin › Settings › Branding)
    const b: any = await db.execute(sql`SELECT key, value FROM settings WHERE key IN ('app_name', 'company_name', 'app_tagline')`); const m: any = Object.fromEntries(((b.rows ?? b) as any[]).map(x => [x.key, x.value]));
    const co = m.company_name || (String(m.app_tagline || "").includes("—") ? String(m.app_tagline).split("—").pop()!.trim() : "");
    MAIL_BRAND = [m.app_name || "IT Hub", co].filter(Boolean).join(" — ");
  } catch { /* keep last */ }
  try { const r: any = await db.execute(sql`SELECT value FROM settings WHERE key = 'mail.config'`); const v = (r.rows ?? r)[0]?.value; saved = typeof v === "string" ? JSON.parse(v) : v; } catch { /* no table / value */ }
  const cfg: MailConfig = saved?.provider ? {
    provider: saved.provider,
    m365: { tenantId: saved.m365?.tenantId || env("MAIL_M365_TENANT_ID"), clientId: saved.m365?.clientId || env("MAIL_M365_CLIENT_ID"), secret: saved.m365?.secretSealed ? openText(saved.m365.secretSealed) : env("MAIL_M365_CLIENT_SECRET"), from: saved.m365?.from || env("MAIL_FROM") },
    smtp: { host: saved.smtp?.host || "", port: Number(saved.smtp?.port) || 587, security: saved.smtp?.security || "starttls", user: saved.smtp?.user || "", pass: saved.smtp?.passSealed ? openText(saved.smtp.passSealed) : "", from: saved.smtp?.from || "", fromName: saved.smtp?.fromName || "IT Hub", rejectUnauthorized: saved.smtp?.rejectUnauthorized !== false },
  } : { provider: "m365", m365: { tenantId: env("MAIL_M365_TENANT_ID"), clientId: env("MAIL_M365_CLIENT_ID"), secret: env("MAIL_M365_CLIENT_SECRET"), from: env("MAIL_FROM") }, smtp: { host: "", port: 587, security: "starttls", from: "", fromName: "IT Hub" } };
  cfgCache = { at: Date.now(), cfg }; return cfg;
}
const ready = (c: MailConfig) => c.provider === "m365" ? !!(c.m365.tenantId && c.m365.clientId && c.m365.secret && c.m365.from) : c.provider === "smtp" ? !!(c.smtp.host && c.smtp.port && c.smtp.from) : false;
/** Sync check from the last loaded settings (call loadMailConfig first when it matters). */
export const mailConfigured = () => !!cfgCache && ready(cfgCache.cfg) || (!cfgCache && !!(env("MAIL_M365_TENANT_ID") && env("MAIL_M365_CLIENT_ID") && env("MAIL_M365_CLIENT_SECRET") && env("MAIL_FROM")));
export const mailFrom = () => cfgCache ? (cfgCache.cfg.provider === "smtp" ? cfgCache.cfg.smtp.from : cfgCache.cfg.m365.from) : env("MAIL_FROM");
const notReady = (c: MailConfig) => c.provider === "off" ? "Email is switched off (Admin › Notifications › Email delivery)" : c.provider === "smtp" ? "SMTP is not fully configured (Admin › Notifications › Email delivery)" : "Microsoft 365 mail is not configured (Admin › Notifications › Email delivery)";
async function deliver(to: string[], subject: string, html: string, attachments: Attachment[]) {
  const c = await loadMailConfig();
  if (!ready(c)) throw Object.assign(new Error(notReady(c)), { skip: true });
  if (c.provider === "smtp") return smtpSend(c.smtp, to, subject, html, attachments);
  return sendGraph(to, subject, html, attachments);
}

let cached: { token: string; exp: number } | null = null;
async function graphToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const m = (await loadMailConfig()).m365;
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(m.tenantId)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: m.clientId, client_secret: m.secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Microsoft 365 sign-in failed: ${j.error_description || j.error || r.status}`);
  cached = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return cached.token;
}

export type Attachment = { name: string; content: Buffer; contentType?: string };
export const parseRecipients = (s: string | null | undefined) => [...new Set(String(s || "").split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean))];
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function sendGraph(to: string[], subject: string, html: string, attachments: Attachment[]) {
  const token = await graphToken();
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent((await loadMailConfig()).m365.from)}/sendMail`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      saveToSentItems: true,
      message: {
        subject, body: { contentType: "HTML", content: html },
        toRecipients: to.map(a => ({ emailAddress: { address: a } })),
        attachments: attachments.map(a => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.contentType || "application/octet-stream", contentBytes: a.content.toString("base64") })),
      },
    }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`Microsoft Graph sendMail ${r.status}: ${t.slice(0, 300)}`); }
}

async function outbox(eventKey: string, to: string, subject: string, html: string, attachmentName: string | null, batchId: number | null, status: string, error: string | null) {
  try {
    await db.execute(sql`INSERT INTO email_outbox (event_key, recipients, subject, body_html, attachment_name, batch_id, status, error, sent_at)
      VALUES (${eventKey}, ${to}, ${subject}, ${html}, ${attachmentName}, ${batchId}, ${status}, ${error}, ${status === "Sent" ? new Date() : null})`);
  } catch (e) { console.error("email_outbox insert failed", e); }
}

/**
 * Send the email for an event to the recipients configured in Admin › Notifications. Never throws — the outcome is
 * written to email_outbox. Call without awaiting when the user should not wait for the mail server.
 */
export async function notify(eventKey: string, msg: { subject: string; html: string; attachment?: Attachment | null; batchId?: number | null }) {
  let to: string[] = [];
  try {
    const r: any = await db.execute(sql`SELECT recipients, enabled, attach_excel FROM notification_rules WHERE event_key = ${eventKey}`);
    const rule = (r.rows ?? r)[0];
    to = parseRecipients(rule?.recipients).filter(a => EMAIL_RE.test(a));
    const att = rule?.attach_excel === false ? null : msg.attachment || null;
    await loadMailConfig().catch(() => null);   // also refreshes the email header (brand)
    const subject = `[IT Hub] ${msg.subject}`;
    const html = wrapHtml(msg.html);
    if (!rule || !rule.enabled) return outbox(eventKey, to.join(", "), subject, html, att?.name ?? null, msg.batchId ?? null, "Skipped", "Notification switched off");
    if (!to.length) return outbox(eventKey, "", subject, html, att?.name ?? null, msg.batchId ?? null, "Skipped", "No recipients configured");
    const mc = await loadMailConfig(); if (!ready(mc)) return outbox(eventKey, to.join(", "), subject, html, att?.name ?? null, msg.batchId ?? null, "Skipped", notReady(mc));
    await deliver(to, subject, html, att ? [att] : []);
    return outbox(eventKey, to.join(", "), subject, html, att?.name ?? null, msg.batchId ?? null, "Sent", null);
  } catch (e: any) {
    console.error(`notify(${eventKey}) failed:`, e?.message || e);
    return outbox(eventKey, to.join(", "), `[IT Hub] ${msg.subject}`, msg.html, msg.attachment?.name ?? null, msg.batchId ?? null, "Failed", String(e?.message || e).slice(0, 500));
  }
}

/** Email specific people (e.g. the employee on a handover). Never throws — logged in email_outbox. */
export async function sendDirect(eventKey: string, to: string[], subject: string, html: string) {
  const list = to.map(x => x.trim().toLowerCase()).filter(a => EMAIL_RE.test(a));
  await loadMailConfig().catch(() => null);
  const subj = `[IT Hub] ${subject}`, body = wrapHtml(html);
  if (!list.length) return outbox(eventKey, "", subj, body, null, null, "Skipped", "No valid recipient");
  const mc = await loadMailConfig(); if (!ready(mc)) return outbox(eventKey, list.join(", "), subj, body, null, null, "Skipped", notReady(mc));
  try { await deliver(list, subj, body, []); return outbox(eventKey, list.join(", "), subj, body, null, null, "Sent", null); }
  catch (e: any) { return outbox(eventKey, list.join(", "), subj, body, null, null, "Failed", String(e?.message || e).slice(0, 500)); }
}

export async function sendTest(to: string[]) {
  const mc = await loadMailConfig(); if (!ready(mc)) throw new Error(notReady(mc));
  const subject = "[IT Hub] Test email";
  const html = wrapHtml(`<p>This is a test email from ${esc(MAIL_BRAND)}, sent through <b>${mc.provider === "smtp" ? `SMTP (${esc(mc.smtp.host)}:${mc.smtp.port})` : "Microsoft 365"}</b>. Notifications are working.</p>`);
  try { await deliver(to, subject, html, []); await outbox("test", to.join(", "), subject, html, null, null, "Sent", null); }
  catch (e: any) { await outbox("test", to.join(", "), subject, html, null, null, "Failed", String(e?.message || e).slice(0, 500)); throw e; }
}

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
function wrapHtml(inner: string) {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;max-width:680px">
    <div style="border-bottom:3px solid #2D7FF9;padding-bottom:8px;margin-bottom:14px;font-weight:600;color:#1F4E9E">${esc(MAIL_BRAND)}</div>
    ${inner}
    <p style="color:#6b7280;font-size:12px;margin-top:20px">Automated message. Recipients are set in IT Hub › Admin › Notifications.</p></div>`;
}
export function htmlTable(rows: [string, unknown][]) {
  return `<table style="border-collapse:collapse;font-size:13px">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${esc(k)}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`).join("")}</table>`;
}
