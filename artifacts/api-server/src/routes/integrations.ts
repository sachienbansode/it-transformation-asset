import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "./auth";
import { loadMailConfig, EMAIL_RE } from "../lib/mailer";
import { smtpSend } from "../lib/smtp";
import { centralConfig } from "../lib/central-identity";
import { putObject, getObject, deleteObject, fullKey, storeConfigured, storeLabel, type StoreCfg } from "../lib/object-store";
import { vapidKeys, pushToUser } from "../lib/webpush";
import { previewAvailable, toPdf } from "../lib/preview";

/* r100 (ITH-161) — Admin › Integrations: one "Test" per connection IT Hub uses. Tests never change settings; email tests
 * can use the values typed on screen (not yet saved). Every result lists the checks with ✓ / ✕ and a plain reason. */
const router = Router();
type Step = { step: string; ok: boolean; detail: string };
const T = (ms = 10_000) => AbortSignal.timeout(ms);
const getSetting = async (k: string) => { const [r] = await db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, k)); let v: any = r?.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { /* text */ } } return v; };
const why = (e: any) => { const c = String(e?.cause?.code || e?.code || ""); if (c === "ENOTFOUND") return "server name not found (DNS)"; if (String(e?.name) === "TimeoutError") return "no answer within 10 seconds (firewall / proxy?)";
  const m = String(e?.message || e); return (m === "fetch failed" && e?.cause ? `cannot connect: ${e.cause.code || e.cause.message}` : m).slice(0, 300); };
const jwtRoles = (t: string) => { try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).roles || []; } catch { return []; } };

async function testMail(b: any, steps: Step[]) {
  const add = (step: string, ok: boolean, detail: string) => { steps.push({ step, ok, detail }); return ok; };
  const saved: any = await loadMailConfig().catch(() => null);
  const provider = b.provider || saved?.provider;
  const to = String(b.to || "").trim();
  if (to && !add("Test recipient", EMAIL_RE.test(to), EMAIL_RE.test(to) ? to : "Not a valid email address")) return;
  if (provider === "smtp") {
    const s = { ...(saved?.smtp || {}), ...(b.smtp || {}) };
    s.port = Number(s.port) || 587; s.pass = b.smtp?.password || saved?.smtp?.pass || "";
    if (!add("Values entered", !!s.host && !!s.from, s.host && s.from ? `${s.host}:${s.port} (${s.security}), from ${s.from}` : "Server and From address are required")) return;
    try {
      await Promise.race([smtpSend(s, [], "", ""), new Promise((_, rej) => setTimeout(() => rej(new Error("the server did not finish the login within 15 seconds — check the user / password, SMTP AUTH for the mailbox, or a firewall")), 15_000))]);
      add("Connect, encryption and sign-in", true, `${s.host}:${s.port} accepted the connection${s.security !== "none" ? " over TLS" : ""}${s.user ? ` and the login of ${s.user}` : ""}`);
    } catch (e: any) {
      const m = why(e); add("Connect, encryption and sign-in", false, /535|auth/i.test(m) ? `${m} — wrong user / password, or SMTP AUTH is switched off for this mailbox (Exchange admin › mailbox › Authenticated SMTP)` : m); return;
    }
    if (to) { try { await smtpSend(s, [to], "[IT Hub] Test email (SMTP)", `<p>This is a test email from IT Hub through <b>${s.host}:${s.port}</b>.</p>`); add("Send a test email", true, `Sent to ${to} — check the inbox (and spam)`); } catch (e: any) { add("Send a test email", false, why(e)); } }
    return;
  }
  if (provider === "m365") {
    const m = { ...(saved?.m365 || {}), ...(b.m365 || {}) }; m.secret = b.m365?.secret || saved?.m365?.secret || "";
    if (!add("Values entered", !!(m.tenantId && m.clientId && m.secret && m.from), m.tenantId && m.clientId && m.secret && m.from ? `Send as ${m.from}` : "Tenant ID, Client ID, Client secret and Send-as mailbox are required")) return;
    try {
      const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(m.tenantId)}/oauth2/v2.0/token`, { method: "POST", signal: T(), headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: m.clientId, client_secret: m.secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }) });
      const j: any = await r.json().catch(() => ({}));
      const code = String(j.error_description || "").match(/AADSTS(\d+)/)?.[1];
      const reason: Record<string, string> = { "7000215": "Client secret is wrong — use the secret VALUE, not the Secret ID", "7000222": "Client secret has expired", "700016": "App (client) ID not found in this tenant", "90002": "Tenant not found" };
      if (!add("App sign-in to Microsoft 365", r.ok, r.ok ? "Microsoft accepted the tenant, app ID and secret" : (code && reason[code]) || String(j.error_description || j.error || r.status).split("\r")[0])) return;
      const roles = jwtRoles(j.access_token);
      add("Permission Mail.Send (application, admin consent)", roles.includes("Mail.Send"), roles.includes("Mail.Send") ? "Granted" : "Missing — App registration › API permissions › Microsoft Graph › Application › Mail.Send, then Grant admin consent");
      if (to) {
        const s = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(m.from)}/sendMail`, { method: "POST", signal: T(), headers: { Authorization: `Bearer ${j.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { subject: "[IT Hub] Test email (Microsoft 365)", body: { contentType: "HTML", content: `<p>This is a test email from IT Hub sent as <b>${m.from}</b> through Microsoft 365.</p>` }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: false }) });
        const sj: any = s.ok ? {} : await s.json().catch(() => ({}));
        add("Send a test email", s.ok, s.ok ? `Sent to ${to} as ${m.from}` : `${sj?.error?.message || s.status}${s.status === 404 ? " — the Send-as mailbox does not exist or has no Exchange licence" : ""}`);
      }
    } catch (e: any) { add("Reach Microsoft 365", false, why(e)); }
    return;
  }
  add("Email delivery", false, "Choose Microsoft 365 or SMTP first");
}

router.post("/admin/integrations/test", requireAdmin, async (req, res): Promise<void> => {
  const kind = String(req.body?.kind || ""); const steps: Step[] = [];
  const add = (step: string, ok: boolean, detail: string) => { steps.push({ step, ok, detail }); return ok; };
  try {
    if (kind === "mail") await testMail(req.body || {}, steps);
    else if (kind === "central") {
      const c = centralConfig();
      if (add("Configured", !!(c.baseUrl && c.clientId && c.clientSecret), c.baseUrl ? `${c.baseUrl} (${c.enabled ? "on" : "off"})` : "Not set up on this server (CENTRAL_SSO_* in the settings file)")) {
        try { const r = await fetch(c.baseUrl, { signal: T(), redirect: "manual" }); add("Portal reachable from this server", r.status < 500, `HTTP ${r.status}`); } catch (e) { add("Portal reachable from this server", false, why(e)); }
      }
    } else if (kind === "storage") {   // 2.14: one file storage for everything
      const { fileStore, setupAndTest } = await import("../lib/file-store");
      const c = await fileStore();
      if (add("Configured", !!c, c ? storeLabel(c) : "Not set (Admin › Settings › File storage)") && c) { const r = await setupAndTest(c); for (const x of r.steps.slice(1)) add(x.step, x.ok, x.detail); }
    } else if (kind === "push") {
      const k: any = await vapidKeys().catch(() => null);
      add("Server keys (VAPID)", !!k?.publicKey, k?.publicKey ? "Present" : "Missing");
      const subs: any = await db.execute(sql`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = ${(req.session as any).userId}`).catch(() => ({ rows: [{ n: 0 }] }));
      const n = Number((subs.rows ?? subs)[0]?.n || 0);
      if (add("This browser / your devices subscribed", n > 0, n ? `${n} device(s)` : "Allow notifications in this browser first (banner at the top), then test again")) {
        await pushToUser(Number((req.session as any).userId), { title: "IT Hub test notification", body: "Push notifications work on this device.", url: "/admin/integrations", tag: "push-test" });
        add("Send a test notification", true, "Sent — it should appear on your devices within a few seconds");
      }
    } else if (kind === "preview") {
      if (add("LibreOffice installed (Word / Excel previews)", previewAvailable(), previewAvailable() ? "Found" : "Not installed — documents can still be downloaded; to preview: sudo apt-get install -y libreoffice-core libreoffice-writer libreoffice-calc")) {
        try { const pdf = await toPdf("test.csv", Buffer.from("a,b\n1,2\n")); add("Convert a test file to PDF", pdf.subarray(0, 4).toString() === "%PDF", `${pdf.length} bytes`); } catch (e) { add("Convert a test file to PDF", false, why(e)); }
      }
    } else if (kind === "address") {
      const url = String(process.env.APP_URL || "").replace(/\/$/, "");
      if (add("App address set (APP_URL)", !!url, url || "Missing in the settings file — links in emails and the device agent need it")) {
        try { const r = await fetch(`${url}/api/healthz`, { signal: T() }); add("Reachable over HTTPS from this server", r.status < 500, `HTTP ${r.status}`); } catch (e) { add("Reachable over HTTPS from this server", false, why(e)); }
      }
    } else if (kind === "sso") {
      add("Microsoft SSO", true, "Use “Test SSO settings” in Admin › Settings › Microsoft SSO");
    } else { res.status(400).json({ error: "Unknown test" }); return; }
  } catch (e) { add("Test", false, why(e)); }
  res.json({ ok: steps.length > 0 && steps.every(s => s.ok), steps });
});

/** what is set up, for the Integrations page (no secrets) */
router.get("/admin/integrations", requireAdmin, async (_req, res): Promise<void> => {
  const mc: any = await loadMailConfig().catch(() => null);
  const store: StoreCfg = (await (await import("../lib/file-store")).fileStore()) || { provider: "none" };
  const c = centralConfig();
  res.json([
    { kind: "mail", name: "Email delivery", what: "Sign-in codes, ITSM / asset / policy emails, reports", status: mc?.provider && mc.provider !== "off" ? (mc.provider === "smtp" ? `SMTP ${mc.smtp?.host || ""}` : `Microsoft 365 (${mc.m365?.from || ""})`) : "Off", setup: "/admin/archive" },
    { kind: "sso", name: "Microsoft SSO", what: "Sign in with Microsoft", status: (await getSetting("sso.msEnabled")) === true ? "On" : "Off", setup: "/admin" },
    { kind: "central", name: "Company portal sign-in", what: "Sign in through the central portal", status: c.enabled ? "On" : c.baseUrl ? "Set, off" : "Not set", setup: null },
    { kind: "storage", name: "File storage", what: "All files: attachments, policy PDFs, chat files, recordings (Azure Blob / Amazon S3)", status: storeConfigured(store) ? storeLabel(store) : "Not set — files stay on the server", setup: "/admin?tab=settings&section=storage" },
    { kind: "push", name: "Push notifications", what: "Browser / phone notifications", status: "Built in", setup: null },
    { kind: "preview", name: "Document preview", what: "Word / Excel previews (LibreOffice)", status: previewAvailable() ? "Installed" : "Not installed", setup: null },
    { kind: "address", name: "App address", what: "Links in emails, device agent", status: process.env.APP_URL || "Not set", setup: null },
  ]);
});

export default router;
