import { Router, Request, Response, NextFunction } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, settingsTable, userRolesTable, rolePermissionsTable, rolesTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { z } from "zod";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    pendingMfaUserId?: number;
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
  res.json({ ...user, effectivePermissions, defaultDashboard });
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
  if (!user.passwordHash) {
    res.status(401).json({ error: "This account uses SSO. Please sign in with Microsoft." });
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

  // Check if MFA is required
  if (user.mfaEnabled && user.mfaSecret) {
    req.session.pendingMfaUserId = user.id;
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    res.json({ requiresMfa: true });
    return;
  }

  // Login complete
  req.session.userId = user.id;
  req.session.mfaVerified = true;
  await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
  await db.update(usersTable).set({ lastLoginAt: new Date(), status: "active" }).where(eq(usersTable.id, user.id));
  res.json({
    id: user.id, email: user.email, name: user.name,
    userType: user.userType, role: user.role, department: user.department,
    mobile: user.mobile, mfaEnabled: user.mfaEnabled, mfaMethod: user.mfaMethod,
    status: user.status,
  });
});

// POST /auth/login/mfa — verify TOTP after password login
router.post("/auth/login/mfa", async (req, res): Promise<void> => {
  if (!req.session.pendingMfaUserId) {
    res.status(400).json({ error: "No pending MFA session" });
    return;
  }
  const body = z.object({ token: z.string().min(6).max(6) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid token" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.pendingMfaUserId));
  if (!user || !user.mfaSecret) {
    res.status(400).json({ error: "MFA not configured" });
    return;
  }

  const valid = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: "base32",
    token: body.data.token,
    window: 2,
  });
  if (!valid) {
    res.status(401).json({ error: "Invalid MFA code" });
    return;
  }

  delete req.session.pendingMfaUserId;
  req.session.userId = user.id;
  req.session.mfaVerified = true;
  await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  res.json({
    id: user.id, email: user.email, name: user.name,
    userType: user.userType, role: user.role, department: user.department,
    mfaEnabled: user.mfaEnabled,
  });
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
    name: `Ashika IT Suite (${user.email})`,
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

  await db.update(usersTable).set({ mfaEnabled: true, mfaSecret: secret }).where(eq(usersTable.id, req.session.userId!));
  delete (req.session as any).mfaSetupSecret;
  res.json({ ok: true, message: "MFA enabled successfully" });
});

// POST /auth/mfa/disable
router.post("/auth/mfa/disable", requireAuth, async (req, res): Promise<void> => {
  const body = z.object({ token: z.string().min(6).max(6) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid token" }); return; }

  const [user] = await db.select({ mfaSecret: usersTable.mfaSecret }).from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!user?.mfaSecret) { res.status(400).json({ error: "MFA not enabled" }); return; }

  const valid = speakeasy.totp.verify({ secret: user.mfaSecret, encoding: "base32", token: body.data.token, window: 2 });
  if (!valid) { res.status(401).json({ error: "Invalid code" }); return; }

  await db.update(usersTable).set({ mfaEnabled: false, mfaSecret: null }).where(eq(usersTable.id, req.session.userId!));
  res.json({ ok: true, message: "MFA disabled" });
});

// ─── MS SSO ──────────────────────────────────────────────────

// GET /config — public branding config (no auth required)
router.get("/config", async (_req, res): Promise<void> => {
  const appName = await getSetting("app_name");
  const appTagline = await getSetting("app_tagline");
  const logoUrl = await getSetting("logo_url");
  res.json({
    appName: appName || "Ashika Drishti Transform",
    appTagline: appTagline || "IT Transformation Planning Suite — Ashika Group",
    logoUrl: logoUrl || "",
  });
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

// GET /auth/sso/redirect — redirect to Microsoft login
router.get("/auth/sso/redirect", async (req, res): Promise<void> => {
  const enabled = await getSetting("sso.msEnabled");
  const clientId = await getSetting("sso.clientId") as string;
  const tenantId = await getSetting("sso.tenantId") as string;
  const redirectUri = await getSetting("sso.redirectUri") as string || `${req.protocol}://${req.get("host")}/api/auth/sso/callback`;

  if (!enabled || !clientId || !tenantId) {
    res.status(400).json({ error: "MS SSO is not configured" });
    return;
  }

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent("openid profile email")}` +
    `&response_mode=query` +
    `&state=sso`;

  res.json({ authUrl });
});

// GET /auth/sso/callback — handle MS SSO callback (token exchange)
router.get("/auth/sso/callback", async (req, res): Promise<void> => {
  const code = req.query.code as string;
  if (!code) { res.status(400).send("Missing code"); return; }

  const clientId = await getSetting("sso.clientId") as string;
  const tenantId = await getSetting("sso.tenantId") as string;
  const clientSecret = await getSetting("sso.clientSecret") as string;
  const redirectUri = await getSetting("sso.redirectUri") as string || `${req.protocol}://${req.get("host")}/api/auth/sso/callback`;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "openid profile email",
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenRes.ok) throw new Error(tokenData.error_description || "Token exchange failed");

    // Get user info
    const userRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const msUser = await userRes.json() as any;

    const email = (msUser.mail || msUser.userPrincipalName || "").toLowerCase();
    const azureId = msUser.id;
    const name = msUser.displayName || email;

    if (!email) throw new Error("Could not get email from Microsoft");

    // Find or create user
    let [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user) {
      [user] = await db.insert(usersTable).values({
        email, name, userType: "internal", role: "user", azureId, isActive: true,
      }).returning();
    } else {
      await db.update(usersTable).set({ azureId, lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    }

    if (!user.isActive) {
      res.redirect(`/?error=account_disabled`);
      return;
    }

    req.session.userId = user.id;
    res.redirect("/");
  } catch (err: any) {
    console.error("SSO callback error:", err);
    res.redirect(`/?error=sso_failed`);
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
  }).from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
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
