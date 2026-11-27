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
let MAIL_BRAND = "IT Hub", MAIL_APP = "IT Hub", MAIL_CO = "", MAIL_LOGO = "";
/** subject prefix = this client's app name, e.g. "[IT Hub]" */
export const mailPrefix = () => `[${MAIL_APP}]`;
export async function loadMailConfig(): Promise<MailConfig> {
  if (cfgCache && Date.now() - cfgCache.at < 30_000) return cfgCache.cfg;
  let saved: any = null;
  try {   // email header = this client's app name and company (Admin › Settings › Branding)
    const b: any = await db.execute(sql`SELECT key, CASE WHEN key = 'logo_url' THEN to_jsonb(left(value #>> '{}', 12)) ELSE value END AS value FROM settings WHERE key IN ('app_name', 'company_name', 'app_tagline', 'logo_url')`); const m: any = Object.fromEntries(((b.rows ?? b) as any[]).map(x => [x.key, x.value]));
    const co = m.company_name || (String(m.app_tagline || "").includes("—") ? String(m.app_tagline).split("—").pop()!.trim() : "");
    MAIL_APP = m.app_name || "IT Hub"; MAIL_CO = co; MAIL_BRAND = [MAIL_APP, co].filter(Boolean).join(" — ");
    // logo: e-mail programs block embedded (data:) images, so the logo is served from the app at /api/brand/logo
    const base = String(process.env.APP_URL || "").replace(/\/$/, "");
    MAIL_LOGO = m.logo_url && /^https:\/\//.test(base) ? `${base}/api/brand/logo` : "";
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
    const subject = `${mailPrefix()} ${msg.subject}`;
    const html = wrapHtml(msg.html);
    if (!rule || !rule.enabled) return outbox(eventKey, to.join(", "), subject, html, att?.name ?? null, msg.batchId ?? null, "Skipped", "Notification switched off");
    if (!to.length) return outbox(eventKey, "", subject, html, att?.name ?? null, msg.batchId ?? null, "Skipped", "No recipients configured");
    const mc = await loadMailConfig(); if (!ready(mc)) return outbox(eventKey, to.join(", "), subject, html, att?.name ?? null, msg.batchId ?? null, "Skipped", notReady(mc));
    await deliver(to, subject, html, att ? [att] : []);
    return outbox(eventKey, to.join(", "), subject, html, att?.name ?? null, msg.batchId ?? null, "Sent", null);
  } catch (e: any) {
    console.error(`notify(${eventKey}) failed:`, e?.message || e);
    return outbox(eventKey, to.join(", "), `${mailPrefix()} ${msg.subject}`, msg.html, msg.attachment?.name ?? null, msg.batchId ?? null, "Failed", String(e?.message || e).slice(0, 500));
  }
}

/** Email specific people (e.g. the employee on a handover). Never throws — logged in email_outbox. */
export async function sendDirect(eventKey: string, to: string[], subject: string, html: string, note?: string): Promise<{ status: string; error: string | null }> {
  const list = to.map(x => x.trim().toLowerCase()).filter(a => EMAIL_RE.test(a));
  await loadMailConfig().catch(() => null);
  const subj = `${mailPrefix()} ${subject}`, body = wrapHtml(html, note);
  const done = async (status: string, error: string | null) => { await outbox(eventKey, list.join(", "), subj, body, null, null, status, error); return { status, error }; };
  if (!list.length) return done("Skipped", "No valid recipient");
  const mc = await loadMailConfig(); if (!ready(mc)) return done("Skipped", notReady(mc));
  try { await deliver(list, subj, body, []); return done("Sent", null); }
  catch (e: any) { return done("Failed", String(e?.message || e).slice(0, 500)); }
}

export async function sendTest(to: string[]) {
  const mc = await loadMailConfig(); if (!ready(mc)) throw new Error(notReady(mc));
  const subject = `${mailPrefix()} Test email`;
  const html = wrapHtml(`<p>This is a test email from ${esc(MAIL_BRAND)}, sent through <b>${mc.provider === "smtp" ? `SMTP (${esc(mc.smtp.host)}:${mc.smtp.port})` : "Microsoft 365"}</b>. Notifications are working.</p>`);
  try { await deliver(to, subject, html, []); await outbox("test", to.join(", "), subject, html, null, null, "Sent", null); }
  catch (e: any) { await outbox("test", to.join(", "), subject, html, null, null, "Failed", String(e?.message || e).slice(0, 500)); throw e; }
}

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
/** a call-to-action button that works in Outlook, Gmail and phones */
export const mailButton = (text: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 6px"><tr><td style="background:#2563eb;border-radius:8px">` +
  `<a href="${esc(url)}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${esc(text)}</a></td></tr></table>`;
/* 2.01 (ITH-168) — one branded layout for every email: logo + app + company header, white card, footer saying why the
   person received it. Table layout and inline styles so Outlook (desktop / web), Gmail and phone mail apps show it alike. */
function wrapHtml(inner: string, note?: string) {
  // ticket templates written as <a href="…">Open INC-1</a> become buttons
  const body = inner.replace(/<a href="([^"]+)">((?:Open|View) [^<]{1,60})<\/a>/g, (_m, u, t) => mailButton(t, u.replace(/&amp;/g, "&")));
  const logo = MAIL_LOGO ? `<td width="52" style="padding-right:12px;vertical-align:middle"><img src="${esc(MAIL_LOGO)}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:8px;background:#ffffff;padding:3px"></td>` : "";
  const why = note || `You receive this because of your role in ${MAIL_APP}${MAIL_CO ? ` at ${MAIL_CO}` : ""}.`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><style>@media only screen and (max-width:620px){.ith-pad{padding:20px 16px 18px!important}.ith-head{padding:14px 16px!important}.ith-foot{padding:12px 16px 16px!important}.ith-outer{padding:12px 6px!important}}</style></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" class="ith-outer" style="padding:24px 12px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b">
  <tr><td class="ith-head" style="background:#0f2a5c;padding:16px 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo}
   <td style="vertical-align:middle"><div style="font-size:17px;font-weight:700;color:#ffffff;line-height:1.2">${esc(MAIL_APP)}</div>${MAIL_CO ? `<div style="font-size:12px;color:#bfd3f5;line-height:1.4">${esc(MAIL_CO)}</div>` : ""}</td></tr></table></td></tr>
  <tr><td style="height:4px;background:#2d7ff9;font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td class="ith-pad" style="padding:26px 28px 22px;font-size:14px;line-height:1.6;color:#1e293b">${body}</td></tr>
  <tr><td class="ith-foot" style="padding:14px 28px 18px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:11.5px;line-height:1.5;color:#64748b">${esc(why)}<br>This is an automated message — please do not reply.</td></tr>
 </table>
 <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#94a3b8;padding-top:12px">${esc(MAIL_BRAND)}</div>
</td></tr></table></body></html>`;
}
export function htmlTable(rows: [string, unknown][]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;margin:12px 0;border:1px solid #e2e8f0">${rows.map(([k, v], i) =>
    `<tr style="background:${i % 2 ? "#ffffff" : "#f8fafc"}"><td style="padding:8px 12px;color:#64748b;width:34%;border-bottom:1px solid #e2e8f0">${esc(k)}</td><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0">${esc(v)}</td></tr>`).join("")}</table>`;
}
