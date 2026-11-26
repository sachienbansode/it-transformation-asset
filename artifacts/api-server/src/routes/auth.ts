import { Router, Request, Response, NextFunction } from "express";
import { getBrand } from "../lib/brand";
import { eq, inArray, sql } from "drizzle-orm";
const rowsOfAny = (r: any) => (r?.rows ?? r ?? []) as any[];
import { db, usersTable, settingsTable, userRolesTable, rolePermissionsTable, rolesTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { z } from "zod";
import { centralConfig } from "../lib/central-identity";
import crypto from "crypto";
import { sendDirect, loadMailConfig, esc } from "../lib/mailer";
import { getPolicy, policyProblems, policyMessage, reusedPassword, nextHistory } from "../lib/password-policy";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    pendingMfaUserId?: number;
    pendingMfaMethod?: "totp" | "email";
    emailOtp?: { h: string; exp: number; tries: number; uid: number; purpose: "login" | "enable" | "disable"; sentAt: number };
    mfaVerified?: boolean;
  }
}

export const router = Router();

// ─── MIDDLEWARE ───────────────────────────────────────────────

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select({ role: usersTable.role, isActive: usersTable.isActive }).from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user || !user.isActive || user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

// Helper: get setting value
async function getSetting(key: string): Promise<unknown> {
  const [row] = await db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, key));
  return row?.value ?? null;
}


// ─── r94: password policy, emailed one-time codes, MFA policy ─────────────────
const maskEmail = (e: string) => { const [u, d] = e.split("@"); return `${u.slice(0, 2)}${"•".repeat(Math.max(2, u.length - 2))}@${d}`; };
const hashCode = (c: string) => crypto.createHash("sha256").update(c).digest("hex");
async function mailReady() { try { const mc: any = await loadMailConfig(); return mc.provider === "smtp" ? !!(mc.smtp?.host && mc.smtp?.from) : mc.provider === "m365" ? !!(mc.m365?.tenantId && mc.m365?.clientId && mc.m365?.secret && mc.m365?.from) : false; } catch { return false; } }
async function sendEmailCode(req: Request, user: { id: number; email: string; name: string }, purpose: "login" | "enable" | "disable") {
  const prev = req.session.emailOtp;
  if (prev && prev.uid === user.id && Date.now() - prev.sentAt < 30_000) return { ok: false, error: "A code was sent less than 30 seconds ago — check your inbox" };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  req.session.emailOtp = { h: hashCode(code), exp: Date.now() + 10 * 60_000, tries: 0, uid: user.id, purpose, sentAt: Date.now() };
  const what = purpose === "login" ? "sign in" : purpose === "enable" ? "turn on email sign-in codes" : "turn off two-step sign-in";
  const b = await getBrand().catch(() => ({ appName: "IT Hub" } as any));
  const when = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const ua = String(req.get("user-agent") || ""); const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "a browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone / iPad" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const sent = await sendDirect(`mfa_${purpose}`, [user.email], `Your sign-in code: ${code}`,
    `<p style="margin:0 0 14px">Hello ${esc(user.name)},</p>
     <p style="margin:0 0 18px">Use this code to ${what} to <b>${esc(b.appName || "IT Hub")}</b>:</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 26px;font-family:Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:#1e3a8a">${code}</td></tr></table>
     <p style="margin:0 0 6px;color:#475569">The code expires in <b>10 minutes</b> and works once.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;font-size:12.5px;color:#475569"><tr><td style="padding:2px 14px 2px 0">Requested</td><td>${esc(when)} IST</td></tr>
       <tr><td style="padding:2px 14px 2px 0">From</td><td>${esc(browser)}${os ? ` on ${esc(os)}` : ""} · ${esc(String(req.ip || "").replace(/^::ffff:/, ""))}</td></tr></table>
     <p style="margin:14px 0 0;padding:10px 12px;background:#fff7ed;border-left:3px solid #f97316;color:#7c2d12;font-size:12.5px">Didn't try to ${what}? Do not share this code with anyone — change your password and tell the IT team.</p>`,
    `You received this because someone tried to ${what} with your account. IT staff will never ask you for this code.`);
  if (sent.status !== "Sent") {   // 2.01: never say "we emailed" when the email did not go
    delete req.session.emailOtp;
    console.error(`sign-in code for user ${user.id} not delivered: ${sent.error}`);
    return { ok: false, mailFailed: true, error: `We could not email your sign-in code (${String(sent.error || sent.status).slice(0, 160)}). Try again in a minute; if it keeps failing, ask the IT administrator to check Admin › Email, Alerts & Archive.` };
  }
  return { ok: true, to: maskEmail(user.email) };
}
function checkEmailCode(req: Request, uid: number, purpose: string, token: string): string | null {
  const o = req.session.emailOtp;
  if (!o || o.uid !== uid || o.purpose !== purpose) return "No code was sent — ask for a new code";
  if (Date.now() > o.exp) { delete req.session.emailOtp; return "The code has expired — ask for a new code"; }
  if (++o.tries > 5) { delete req.session.emailOtp; return "Too many wrong codes — ask for a new code"; }
  if (hashCode(token) !== o.h) return "Invalid code";
  delete req.session.emailOtp; return null;
}
// r98: session length from Admin › Settings (default 4 hours), applied at every completed sign-in
async function applySessionTimeout(req: Request) {
  const h = Number(await getSetting("auth.sessionTimeoutHours")) || 4;
  req.session.cookie.maxAge = Math.min(24, Math.max(1, h)) * 3600_000;
}
const ssoMfaOn = async () => (await getSetting("sso.mfaEmailOtp")) === true;
async function mfaRequiredFor(userType: string, user?: { id: number; role: string }) {
  if (user?.role === "admin") return true;   // r98: two-step sign-in is mandatory for Super Admin
  if ((await getSetting(`auth.mfaRequired.${userType === "external" ? "external" : "internal"}`)) === true) return true;
  // r97: Admin › Settings › "Require MFA for these roles" — "admin" = Super Admin (base role), numbers = access roles
  const roles = (await getSetting("auth.mfaRequired.roles")) as any;
  if (!user || !Array.isArray(roles) || !roles.length) return false;
  if (user.role === "admin" && roles.includes("admin")) return true;
  const ids = roles.map((r: any) => Number(r)).filter((n: number) => Number.isInteger(n) && n > 0);
  if (!ids.length) return false;
  const [hit] = rowsOfAny(await db.execute(sql`SELECT 1 FROM user_roles WHERE user_id = ${user.id} AND role_id IN (${sql.join(ids.map((i: number) => sql`${i}`), sql`, `)}) LIMIT 1`).catch(() => ({ rows: [] })));
  return !!hit;
}

// ─── AUTH ROUTES ─────────────────────────────────────────────

// GET /auth/me — current session user
router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const [user] = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    userType: usersTable.userType,
    role: usersTable.role,
    department: usersTable.department,
    mobile: usersTable.mobile,
    mfaEnabled: usersTable.mfaEnabled,
    mfaMethod: usersTable.mfaMethod,
    status: usersTable.status,
    photoUrl: usersTable.photoUrl,
    mustChangePassword: usersTable.mustChangePassword,
  }).from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "User not found" });
    return;
  }

  const userRoleLinks = await db.select({ roleId: userRolesTable.roleId })
    .from(userRolesTable).where(eq(userRolesTable.userId, req.session.userId!));
  const roleIds = userRoleLinks.map(r => r.roleId);
  const effectivePermissions: Record<string, string> = {};
  let defaultDashboard = "/";
  if (roleIds.length > 0) {
    const [perms, roleRows] = await Promise.all([
      db.select().from(rolePermissionsTable).where(inArray(rolePermissionsTable.roleId, roleIds)),
      db.select({ defaultDashboard: rolesTable.defaultDashboard }).from(rolesTable).where(inArray(rolesTable.id, roleIds)),
    ]);
    const levels = ["none", "read", "write", "admin"];
    for (const p of perms) {
      const current = effectivePermissions[p.module] || "none";
      if (levels.indexOf(p.accessLevel) > levels.indexOf(current)) {
        effectivePermissions[p.module] = p.accessLevel;
      }
    }
    // Use the most specific default dashboard (non-root takes priority)
    for (const r of roleRows) {
      if (r.defaultDashboard && r.defaultDashboard !== "/") {
        defaultDashboard = r.defaultDashboard;
        break;
      }
    }
  }
  // Admin always gets /
  if (user.role === "admin") defaultDashboard = "/";
  const central = (req.session as any).central;
  res.json({ ...user, auditor: (req.session as any).auditor === true, effectivePermissions, defaultDashboard, identitySource: central ? "central" : "local", portalRole: central?.portalRole ?? null, ...(central ? { mfaEnabled: true } : {}) });
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, body.data.email.toLowerCase()));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  // With Central Identity on, passwords here are only for break-glass local administrators (CENTRAL_SSO_LOCAL_LOGIN)
  const cc = centralConfig();
  if (cc.enabled && (cc.localLogin === "off" || (cc.localLogin === "admin" && user.role !== "admin"))) {
    res.status(403).json({ error: "Please use the company portal sign-in button. Password sign-in here is reserved for IT administrators." });
    return;
  }
  if (!user.passwordHash) {
    res.status(401).json({ error: cc.enabled ? "This account signs in through the company portal." : "This account uses SSO. Please sign in with Microsoft." });
    return;
  }
  // External auditors sign in through the auditor portal (password + emailed code), never here
  if (user.userType === "external" && rowsOfAny(await db.execute(sql`SELECT 1 FROM cmp_audit_access WHERE user_id = ${user.id} LIMIT 1`).catch(() => ({ rows: [] }))).length) {
    res.status(403).json({ error: "Auditors sign in at /auditor/login" });
    return;
  }
  const valid = await bcrypt.compare(body.data.password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Auto-dormant: mark active users who haven't logged in for 30+ days
  if (user.status === "active" && user.lastLoginAt) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (new Date(user.lastLoginAt) < thirtyDaysAgo) {
      await db.update(usersTable).set({ status: "dormant" }).where(eq(usersTable.id, user.id));
      res.status(403).json({ error: "Your account has been marked dormant due to inactivity. Please contact your administrator." });
      return;
    }
  }

  // Status gate
  if (user.status === "dormant") {
    res.status(403).json({ error: "Account is dormant due to inactivity. Please contact your administrator." });
    return;
  }
  if (user.status === "inactive" || !user.isActive) {
    res.status(403).json({ error: "Your account has been deactivated. Please contact your administrator." });
    return;
  }

  // r98: each person signs in ONE way — Microsoft 365 or IT Hub password (Super Admin may use both)
  if (user.role !== "admin" && user.authMethod === "m365") {
    res.status(403).json({ error: "Your account signs in with Microsoft 365 — use 'Sign in with Microsoft'." });
    return;
  }
  // r99: password expiry (Admin › Settings › Password policy) → must set a new one after signing in
  { const pol = await getPolicy();
    const since = user.passwordChangedAt || user.createdAt;
    if (pol.expiryDays > 0 && !user.mustChangePassword && since && Date.now() - +new Date(since) > pol.expiryDays * 86400_000) {
      await db.update(usersTable).set({ mustChangePassword: true }).where(eq(usersTable.id, user.id)); (user as any).mustChangePassword = true;
    } }
  // Second step: authenticator app, or a code by email (chosen by the user, or forced by Admin › Settings › MFA required)
  const useTotp = user.mfaEnabled && user.mfaMethod !== "email" && !!user.mfaSecret;
  const useEmail = !useTotp && ((user.mfaEnabled && user.mfaMethod === "email") || await mfaRequiredFor(user.userType, user));
  if (useTotp) {
    req.session.pendingMfaUserId = user.id; req.session.pendingMfaMethod = "totp";
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    res.json({ requiresMfa: true, method: "totp" });
    return;
  }
  if (useEmail) {
    if (await mailReady()) {
      req.session.pendingMfaUserId = user.id; req.session.pendingMfaMethod = "email";
      const s: any = await sendEmailCode(req, user, "login");
      await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
      if (!s.ok) { delete req.session.pendingMfaUserId; res.status(s.mailFailed ? 503 : 429).json({ error: s.error }); return; }
      res.json({ requiresMfa: true, method: "email", to: s.to || maskEmail(user.email) });
      return;
    }
    // email not set up yet: do not lock everyone out — sign in and record it so the admin can see
    await db.execute(sql`INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary) VALUES ('User', ${user.id}, 'MFA_SKIPPED', ${user.email}, 'Two-step sign-in required but email delivery is not set up — signed in with password only')`).catch(() => {});
  }

  // Login complete — regenerate session ID to prevent session fixation
  // (if a different user was previously logged in, this discards their session)
  await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.userId = user.id;
  { const { ensureDefaultRole } = await import("../lib/default-role"); await ensureDefaultRole(user.id).catch(() => {}); }
  req.session.mfaVerified = true;
  await applySessionTimeout(req);
  await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
  await db.update(usersTable).set({ lastLoginAt: new Date(), status: "active" }).where(eq(usersTable.id, user.id));
  res.json({
    id: user.id, email: user.email, name: user.name,
    userType: user.userType, role: user.role, department: user.department,
    mobile: user.mobile, mfaEnabled: user.mfaEnabled, mfaMethod: user.mfaMethod,
    status: user.status, mustChangePassword: user.mustChangePassword,
  });
});

// POST /auth/login/mfa — verify TOTP after password login
router.post("/auth/login/mfa", async (req, res): Promise<void> => {
  if (!req.session.pendingMfaUserId) {
    res.status(400).json({ error: "No pending MFA session" });
    return;
  }
  const body = z.object({ token: z.string().trim().regex(/^\d{6}$/) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Enter the 6-digit code" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.pendingMfaUserId));
  if (!user) { res.status(400).json({ error: "Sign in again" }); return; }
  if (req.session.pendingMfaMethod === "email") {
    const err = checkEmailCode(req, user.id, "login", body.data.token);
    if (err) { await new Promise<void>(r => req.session.save(() => r())); res.status(401).json({ error: err }); return; }
  } else {
    if (!user.mfaSecret) { res.status(400).json({ error: "MFA not configured" }); return; }
    const valid = speakeasy.totp.verify({ secret: user.mfaSecret, encoding: "base32", token: body.data.token, window: 2 });
    if (!valid) { res.status(401).json({ error: "Invalid MFA code" }); return; }
  }

  // Regenerate session ID after MFA to prevent session fixation
  await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.userId = user.id;
  { const { ensureDefaultRole } = await import("../lib/default-role"); await ensureDefaultRole(user.id).catch(() => {}); }
  req.session.mfaVerified = true;
  await applySessionTimeout(req);
  await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  res.json({
    id: user.id, email: user.email, name: user.name,
    userType: user.userType, role: user.role, department: user.department,
    mfaEnabled: user.mfaEnabled, mustChangePassword: user.mustChangePassword,
  });
});

// POST /auth/login/mfa/resend — a new emailed code during sign-in
router.post("/auth/login/mfa/resend", async (req, res): Promise<void> => {
  const uid = req.session.pendingMfaUserId;
  if (!uid || req.session.pendingMfaMethod !== "email") { res.status(400).json({ error: "Sign in again" }); return; }
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid));
  if (!user) { res.status(400).json({ error: "Sign in again" }); return; }
  const s: any = await sendEmailCode(req, user, "login");
  await new Promise<void>(r => req.session.save(() => r()));
  if (!s.ok) { res.status(s.mailFailed ? 503 : 429).json({ error: s.error }); return; }
  res.json({ ok: true, to: s.to });
});

// GET /auth/password-policy — the rules shown live while typing a new password
router.get("/auth/password-policy", requireAuth, async (_req, res): Promise<void> => { res.json(await getPolicy()); });

// POST /auth/change-password — signed-in user changes own password (current password needed)
router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const body = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1).max(200) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Enter your current and new password" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!user?.passwordHash) { res.status(400).json({ error: "This account signs in through the company portal — change the password there" }); return; }
  if (!await bcrypt.compare(body.data.currentPassword, user.passwordHash)) { res.status(400).json({ error: "Current password is not correct" }); return; }
  const pol = await getPolicy();
  const probs = policyProblems(body.data.newPassword, pol, user.email);
  if (probs.length) { res.status(400).json({ error: policyMessage(probs) }); return; }
  if (await reusedPassword(body.data.newPassword, user.passwordHash, user.passwordHistory, pol.history)) { res.status(400).json({ error: pol.history ? `Choose a password you have not used for your last ${pol.history + 1} passwords` : "The new password must be different from the current one" }); return; }
  await db.update(usersTable).set({ passwordHash: await bcrypt.hash(body.data.newPassword, 12), mustChangePassword: false, passwordChangedAt: new Date(), passwordHistory: nextHistory(user.passwordHash, user.passwordHistory, pol.history) }).where(eq(usersTable.id, user.id));
  await db.execute(sql`INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary) VALUES ('User', ${user.id}, 'PASSWORD_CHANGED', ${user.email}, 'Password changed by the user')`).catch(() => {});
  res.json({ ok: true });
});

// POST /auth/mfa/email/start — send a code to the signed-in user (to turn email codes on, or MFA off)
router.post("/auth/mfa/email/start", requireAuth, async (req, res): Promise<void> => {
  const purpose = req.body?.purpose === "disable" ? "disable" : "enable";
  if (!await mailReady()) { res.status(400).json({ error: "Email delivery is not set up yet — ask the admin (Admin › Email, alerts & archive)" }); return; }
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.session.userId!));
  const s: any = await sendEmailCode(req, user, purpose);
  await new Promise<void>(r => req.session.save(() => r()));
  if (!s.ok) { res.status(s.mailFailed ? 503 : 429).json({ error: s.error }); return; }
  res.json({ ok: true, to: s.to });
});

// POST /auth/mfa/email/enable — confirm the emailed code → email codes on
router.post("/auth/mfa/email/enable", requireAuth, async (req, res): Promise<void> => {
  const token = String(req.body?.token || "").trim();
  const err = checkEmailCode(req, req.session.userId!, "enable", token);
  await new Promise<void>(r => req.session.save(() => r()));
  if (err) { res.status(401).json({ error: err }); return; }
  await db.update(usersTable).set({ mfaEnabled: true, mfaMethod: "email", mfaSecret: null }).where(eq(usersTable.id, req.session.userId!));
  await db.execute(sql`INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary) SELECT 'User', id, 'MFA_ENABLED', email, 'Two-step sign-in turned on (code by email)' FROM users WHERE id = ${req.session.userId!}`).catch(() => {});
  res.json({ ok: true });
});

// POST /auth/logout
router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("ashika.sid");
    res.json({ ok: true });
  });
});

// POST /auth/register (admin creates users; self-registration only for external if enabled)
router.post("/auth/register", async (req, res): Promise<void> => {
  const selfRegEnabled = await getSetting("auth.selfRegistration");
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
    userType: z.enum(["internal", "external"]).default("external"),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  if (!selfRegEnabled && body.data.userType === "external") {
    // allow external self-registration only if enabled
    if (!selfRegEnabled) {
      res.status(403).json({ error: "Self-registration is disabled. Contact your administrator." });
      return;
    }
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, body.data.email.toLowerCase()));
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(body.data.password, 12);
  const [user] = await db.insert(usersTable).values({
    email: body.data.email.toLowerCase(),
    passwordHash,
    name: body.data.name,
    userType: body.data.userType,
    role: "user",
  }).returning({ id: usersTable.id, email: usersTable.email, name: usersTable.name, userType: usersTable.userType });
  res.status(201).json(user);
});

// ─── MFA SETUP ───────────────────────────────────────────────

// GET /auth/mfa/setup — generate TOTP secret + QR code
router.get("/auth/mfa/setup", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.session.userId!));
  const secret = speakeasy.generateSecret({
    name: `${(await getBrand()).appName} (${user.email})`,
    length: 32,
  });
  // Store secret temporarily in session
  (req.session as any).mfaSetupSecret = secret.base32;
  const otpauthUrl = secret.otpauth_url!;
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  res.json({ secret: secret.base32, qrCode: qrDataUrl });
});

// POST /auth/mfa/enable — verify and enable MFA
router.post("/auth/mfa/enable", requireAuth, async (req, res): Promise<void> => {
  const secret = (req.session as any).mfaSetupSecret;
  if (!secret) { res.status(400).json({ error: "No MFA setup in progress" }); return; }
  const body = z.object({ token: z.string().min(6).max(6) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid token" }); return; }

  const valid = speakeasy.totp.verify({ secret, encoding: "base32", token: body.data.token, window: 2 });
  if (!valid) { res.status(401).json({ error: "Invalid code. Try again." }); return; }

  await db.update(usersTable).set({ mfaEnabled: true, mfaSecret: secret, mfaMethod: "totp" }).where(eq(usersTable.id, req.session.userId!));
  await db.execute(sql`INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary) SELECT 'User', id, 'MFA_ENABLED', email, 'Two-step sign-in turned on (authenticator app)' FROM users WHERE id = ${req.session.userId!}`).catch(() => {});
  delete (req.session as any).mfaSetupSecret;
  res.json({ ok: true, message: "MFA enabled successfully" });
});

// POST /auth/mfa/disable
router.post("/auth/mfa/disable", requireAuth, async (req, res): Promise<void> => {
  const body = z.object({ token: z.string().min(6).max(6) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid token" }); return; }

  const [user] = await db.select({ id: usersTable.id, role: usersTable.role, mfaSecret: usersTable.mfaSecret, mfaMethod: usersTable.mfaMethod, mfaEnabled: usersTable.mfaEnabled, userType: usersTable.userType }).from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!user?.mfaEnabled) { res.status(400).json({ error: "MFA not enabled" }); return; }
  if (await mfaRequiredFor(user.userType, user)) { res.status(400).json({ error: "Two-step sign-in is required by your organisation — you can switch the method, but not turn it off" }); return; }
  if (user.mfaMethod === "email") {
    const err = checkEmailCode(req, req.session.userId!, "disable", body.data.token);
    await new Promise<void>(r => req.session.save(() => r()));
    if (err) { res.status(401).json({ error: err }); return; }
  } else {
    const valid = speakeasy.totp.verify({ secret: user.mfaSecret || "", encoding: "base32", token: body.data.token, window: 2 });
    if (!valid) { res.status(401).json({ error: "Invalid code" }); return; }
  }

  await db.update(usersTable).set({ mfaEnabled: false, mfaSecret: null, mfaMethod: "totp" }).where(eq(usersTable.id, req.session.userId!));
  await db.execute(sql`INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary) SELECT 'User', id, 'MFA_DISABLED', email, 'Two-step sign-in turned off by the user' FROM users WHERE id = ${req.session.userId!}`).catch(() => {});
  res.json({ ok: true, message: "MFA disabled" });
});

// ─── MS SSO ──────────────────────────────────────────────────

// GET /config — public branding config (no auth required)
router.get("/config", async (_req, res): Promise<void> => {
  const appName = await getSetting("app_name");
  const appTagline = await getSetting("app_tagline");
  const logoUrl = await getSetting("logo_url");
  res.json({
    appName: appName || "IT Hub",
    appTagline: appTagline || "IT Service & Asset Management",
    companyName: (await getSetting("company_name")) || (String(appTagline || "").includes("—") ? String(appTagline).split("—").pop()!.trim() : ""),
    emailDomain: (await getSetting("email_domain")) || "company.com",
    logoUrl: logoUrl || "",
    confirmChanges: (await getSetting("ui.confirmChanges")) !== false,   // ask before every change (Admin › Settings)
  });
});

// GET /brand/logo — the uploaded logo as an image (public; used by emails, which block embedded images)
router.get("/brand/logo", async (_req, res): Promise<void> => {
  const v = String((await getSetting("logo_url")) || "");
  const m = v.match(/^data:(image\/(?:png|jpe?g|gif|webp|svg\+xml));base64,(.+)$/);
  if (m) { res.set({ "Content-Type": m[1], "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" }).send(Buffer.from(m[2], "base64")); return; }
  if (/^https:\/\//.test(v)) { res.redirect(302, v); return; }
  res.status(404).end();
});

// GET /auth/sso/config — check if SSO is configured & enabled
router.get("/auth/sso/config", async (_req, res): Promise<void> => {
  const enabled = await getSetting("sso.msEnabled");
  const clientId = await getSetting("sso.clientId");
  const tenantId = await getSetting("sso.tenantId");
  res.json({
    enabled: !!enabled && !!clientId && !!tenantId,
    configured: !!clientId && !!tenantId,
  });
});

// GET /auth/sso/redirect — Microsoft Entra ID (Azure AD) sign-in. r95: one-time state + nonce, fixed redirect URI.
async function ssoRedirectUri(req: Request) {
  const saved = String((await getSetting("sso.redirectUri")) || "").trim();
  if (saved) return saved;
  const base = String(process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  return `${base}/api/auth/sso/callback`;
}
router.get("/auth/sso/redirect", async (req, res): Promise<void> => {
  const enabled = await getSetting("sso.msEnabled");
  const clientId = String((await getSetting("sso.clientId")) || "").trim();
  const tenantId = String((await getSetting("sso.tenantId")) || "").trim();
  if (!enabled || !clientId || !tenantId) { res.status(400).json({ error: "Microsoft sign-in is not configured" }); return; }
  const state = crypto.randomBytes(24).toString("base64url"); const nonce = crypto.randomBytes(16).toString("base64url");
  (req.session as any).msSso = { state, nonce, at: Date.now() };
  await new Promise<void>(r => req.session.save(() => r()));
  const authUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize?` + new URLSearchParams({
    client_id: clientId, response_type: "code", redirect_uri: await ssoRedirectUri(req), response_mode: "query",
    scope: "openid profile email User.Read", state, nonce, prompt: "select_account",
  }).toString();
  res.json({ authUrl });
});

// GET /auth/sso/callback — code → tokens → Microsoft Graph /me → IT Hub user
router.get("/auth/sso/callback", async (req, res): Promise<void> => {
  const fail = (why: string, log?: unknown) => { if (log) console.error("Microsoft sign-in:", log); res.redirect(`/login?sso_error=${why}`); };
  const pend = (req.session as any).msSso; delete (req.session as any).msSso;
  if (req.query.error) return fail("access_denied", `${req.query.error}: ${req.query.error_description || ""}`);
  const code = String(req.query.code || "");
  if (!code || !pend || pend.state !== String(req.query.state || "") || Date.now() - pend.at > 10 * 60_000) return fail("invalid_state");
  const clientId = String((await getSetting("sso.clientId")) || "").trim();
  const tenantId = String((await getSetting("sso.tenantId")) || "").trim();
  const { openText } = await import("../lib/secure-text");
  const clientSecret = openText(String((await getSetting("sso.clientSecret")) || ""));
  if (!clientId || !tenantId || !clientSecret) return fail("not_configured");
  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: await ssoRedirectUri(req), grant_type: "authorization_code", scope: "openid profile email User.Read" }),
    });
    const tok = await tokenRes.json() as any;
    if (!tokenRes.ok) return fail("portal_error", tok.error_description || tok.error);
    // the ID token came straight from Microsoft over TLS: check it is for this app, this tenant and this sign-in
    const claims = JSON.parse(Buffer.from(String(tok.id_token || "").split(".")[1] || "", "base64url").toString() || "{}");
    if (claims.aud !== clientId || (claims.tid && tenantId.match(/^[0-9a-f-]{36}$/i) && claims.tid.toLowerCase() !== tenantId.toLowerCase()) || claims.nonce !== pend.nonce) return fail("invalid_state", "ID token check failed");
    const me = await (await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,jobTitle,department,employeeId", { headers: { Authorization: `Bearer ${tok.access_token}` } })).json() as any;
    const email = String(me.mail || me.userPrincipalName || claims.preferred_username || "").toLowerCase();
    if (!email) return fail("portal_error", "no email from Microsoft");

    let [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user) {
      // Admin › Settings › Microsoft SSO: create users on first sign-in, or only allow users already in IT Hub
      if ((await getSetting("sso.autoCreateUsers")) === false) return fail("not_registered");
      const { deptLabel } = await import("../lib/dept");
      [user] = await db.insert(usersTable).values({ email, name: me.displayName || email, userType: "internal", role: "user", azureId: me.id, isActive: true, status: "active", identitySource: "local", authMethod: "m365", designation: me.jobTitle || null, employeeCode: me.employeeId || null, department: me.department ? await deptLabel(me.department) : null }).returning();
      await db.execute(sql`INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary) VALUES ('User', ${user.id}, 'CREATE', 'Microsoft sign-in', ${`User created at first Microsoft sign-in: ${email}`})`).catch(() => {});
    }
    if (!user.isActive || user.status === "inactive") return fail("account_disabled");
    if (user.role !== "admin" && user.authMethod === "password") return fail("password_only");
    await db.update(usersTable).set({ azureId: me.id }).where(eq(usersTable.id, user.id));
    // r98: second step after Microsoft — when switched on in Admin › Settings › Microsoft SSO, or required for this person
    if (await ssoMfaOn() || await mfaRequiredFor(user.userType, user)) {
      const totp = user.mfaEnabled && user.mfaMethod !== "email" && !!user.mfaSecret;
      if (totp || await mailReady()) {
        await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
        req.session.pendingMfaUserId = user.id; req.session.pendingMfaMethod = totp ? "totp" : "email";
        const s: any = totp ? { ok: true, to: "" } : await sendEmailCode(req, user, "login");
        await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
        if (!s.ok) return void res.redirect(`/login?sso_error=${s.mailFailed ? "mfa_mail" : "mfa_wait"}`);
        return void res.redirect(`/login?mfa=${totp ? "totp" : "email"}${s.to ? `&to=${encodeURIComponent(s.to)}` : ""}`);
      }
      await db.execute(sql`INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary) VALUES ('User', ${user.id}, 'MFA_SKIPPED', ${email}, 'Second step after Microsoft sign-in required but email delivery is not set up')`).catch(() => {});
    }
    await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.userId = user.id; req.session.mfaVerified = true;   // Microsoft did the sign-in (and its own MFA / Conditional Access)
    { const { ensureDefaultRole } = await import("../lib/default-role"); await ensureDefaultRole(user.id).catch(() => {}); }
    await applySessionTimeout(req);
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    await db.update(usersTable).set({ azureId: me.id, lastLoginAt: new Date(), status: "active" }).where(eq(usersTable.id, user.id));
    await db.execute(sql`INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary) VALUES ('User', ${user.id}, 'LOGIN', ${email}, 'Signed in with Microsoft')`).catch(() => {});
    res.redirect("/");
  } catch (err: any) {
    return fail("portal_error", err?.message || err);
  }
});

// GET /auth/profile — get current user profile (all user master fields)
router.get("/auth/profile", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select({
    id: usersTable.id, email: usersTable.email, name: usersTable.name,
    userType: usersTable.userType, role: usersTable.role, department: usersTable.department,
    designation: usersTable.designation, employeeCode: usersTable.employeeCode,
    mobile: usersTable.mobile, status: usersTable.status,
    mfaEnabled: usersTable.mfaEnabled, lastLoginAt: usersTable.lastLoginAt,
    createdAt: usersTable.createdAt, photoUrl: usersTable.photoUrl,
    mfaMethod: usersTable.mfaMethod, mustChangePassword: usersTable.mustChangePassword, passwordChangedAt: usersTable.passwordChangedAt,
    hasPassword: sql<boolean>`${usersTable.passwordHash} IS NOT NULL`,
  }).from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  // show the department NAME (users keep the master key, e.g. "it" → "IT")
  const [dep] = rowsOfAny(await db.execute(sql`SELECT label FROM masters WHERE category = 'department' AND (key = ${user.department} OR lower(label) = lower(${user.department})) ORDER BY is_active DESC LIMIT 1`).catch(() => ({ rows: [] })));
  res.json({ ...user, department: dep?.label || user.department, mfaRequired: await mfaRequiredFor(user.userType, user), emailReady: await mailReady() });
});

// PATCH /auth/profile — update display name (read-only: designation, employeeCode, department, etc.)
router.patch("/auth/profile", requireAuth, async (req, res): Promise<void> => {
  const body = z.object({
    photoUrl: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const update: Record<string, unknown> = {};
  if (body.data.photoUrl !== undefined) update.photoUrl = body.data.photoUrl;

  const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, req.session.userId!)).returning({
    id: usersTable.id, email: usersTable.email, name: usersTable.name,
    userType: usersTable.userType, department: usersTable.department,
    photoUrl: usersTable.photoUrl,
  });
  res.json(user);
});

export { router as authRouter };
export default router;
