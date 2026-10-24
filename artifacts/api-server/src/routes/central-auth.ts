import { Router, Request, Response, NextFunction } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { centralConfig, newState, safeEqual, authorizeUrl, exchangeCode, introspect, toPerms, CentralSession } from "../lib/central-identity";
import { logAudit } from "./audit-logs";

/* Central Identity (Ashika API Portal) sign-in — see lib/central-identity.ts for the flow and configuration. */

const router = Router();
const WRITE_RECHECK_MS = 15_000;      // writes re-validate at least this often
const OUTAGE_GRACE_MS = 5 * 60_000;    // if the Portal is unreachable, keep a recently-validated session this long
const STATE_TTL_MS = 10 * 60_000;

const safeNext = (n: unknown) => { const s = String(n || "/"); return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/api/") ? s : "/"; };
const fail = (res: Response, code: string) => res.redirect(`/login?sso_error=${encodeURIComponent(code)}`);
const redirectUri = (req: Request) => centralConfig().redirectUri || `${req.protocol}://${req.get("host")}/api/auth/central/callback`;
async function audit(action: string, summary: string, performedBy = "Central SSO", entityId?: number) {
  try { await logAudit({ entityType: "auth", entityId, action, performedBy, summary } as any); } catch { /* non-fatal */ }
}

// Public: tells the login page whether to show "Sign in with Ashika Portal" and whether passwords are allowed
router.get("/auth/central/config", (_req, res) => {
  const c = centralConfig();
  res.json({ enabled: c.enabled, buttonLabel: c.buttonLabel, localLogin: c.enabled ? c.localLogin : "all" });
});

router.get("/auth/central/login", async (req, res) => {
  const c = centralConfig();
  if (!c.enabled) return fail(res, "not_configured");
  const state = newState();
  (req.session as any).centralState = { state, next: safeNext(req.query.next), at: Date.now() };
  await new Promise<void>((ok, ko) => req.session.save(e => e ? ko(e) : ok()));
  const url = new URL(authorizeUrl(state));
  if (!c.redirectUri) url.searchParams.set("redirect_uri", redirectUri(req));
  res.redirect(url.toString());
});

router.get("/auth/central/callback", async (req, res) => {
  const c = centralConfig();
  if (!c.enabled) return fail(res, "not_configured");
  const pending = (req.session as any).centralState as { state: string; next: string; at: number } | undefined;
  delete (req.session as any).centralState;
  if (req.query.error) { await audit("login_denied", `Portal denied sign-in: ${String(req.query.error)}`); return fail(res, String(req.query.error) === "access_denied" ? "access_denied" : "portal_error"); }
  const code = String(req.query.code || ""), state = String(req.query.state || "");
  if (!pending || !state || !safeEqual(state, pending.state) || Date.now() - pending.at > STATE_TTL_MS) return fail(res, "invalid_state");
  if (!code) return fail(res, "missing_code");
  try {
    const t = await exchangeCode(code);
    const email = String(t.email || "").trim().toLowerCase();
    if (!email) return fail(res, "no_email");
    const perms = toPerms(t);
    const name = [t.first_name, t.last_name].filter(Boolean).join(" ").trim() || email.split("@")[0];
    let [user] = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`);
    if (!user) {
      [user] = await db.insert(usersTable).values({
        email, name, userType: "internal", role: "user", isActive: true, status: "active",
        identitySource: "central", centralSub: String(t.sub ?? ""), centralRole: perms.role, lastLoginAt: new Date(),
      }).returning();
      await audit("provision", `Provisioned ${email} from Ashika Portal (role ${perms.role || "—"})`, email, user.id);
    } else {
      if (!user.isActive || user.status === "inactive") { await audit("login_denied", `${email}: disabled in IT Hub`, email, user.id); return fail(res, "account_disabled"); }
      await db.update(usersTable).set({ identitySource: "central", centralSub: String(t.sub ?? ""), centralRole: perms.role, status: "active", lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    }
    const now = Date.now();
    const central: CentralSession = { token: t.access_token, sub: String(t.sub ?? ""), email, perms, checkedAt: now, okAt: now, expiresAt: now + (Number(t.expires_in) || 28_800) * 1000 };
    const next = pending.next;
    await new Promise<void>((ok, ko) => req.session.regenerate(e => e ? ko(e) : ok()));
    req.session.userId = user.id;
    req.session.mfaVerified = true;           // MFA is enforced by the Portal / Entra
    (req.session as any).central = central;
    await new Promise<void>((ok, ko) => req.session.save(e => e ? ko(e) : ok()));
    await audit("login", `${email} signed in via Ashika Portal (role ${perms.role || "—"}${perms.fullAccess ? ", full access" : ""})`, email, user.id);
    res.redirect(next);
  } catch (e: any) {
    console.error("Central SSO callback error:", e?.message || e);
    return fail(res, "portal_error");
  }
});

/**
 * Re-validates Portal sessions: on every request older than CENTRAL_SSO_INTROSPECT_SECONDS (writes: 15 s), asks the
 * Portal whether the token is still active and refreshes the role/permissions. Disabled user or changed role in the
 * Portal → reflected here on the next check. Portal outage → recently validated sessions continue for 5 minutes.
 */
export async function centralSessionGuard(req: Request, res: Response, next: NextFunction) {
  const s = (req.session as any)?.central as CentralSession | undefined;
  if (!s || !req.session.userId) return next();
  const now = Date.now();
  const end = (msg: string, code: string) => req.session.destroy(() => res.status(401).json({ error: msg, code }));
  if (now > s.expiresAt) return end("Your Ashika Portal session has expired. Please sign in again.", "central_expired");
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const age = now - s.checkedAt;
  if (age < centralConfig().introspectSeconds * 1000 && !(isWrite && age > WRITE_RECHECK_MS)) return next();
  try {
    const j = await introspect(s.token);
    if (!j?.active) { await audit("session_revoked", `${s.email}: Portal reports the session inactive`, s.email, req.session.userId); return end("Your access was ended by the Ashika Portal. Please sign in again.", "central_inactive"); }
    s.perms = toPerms(j); s.checkedAt = s.okAt = now;
    db.update(usersTable).set({ centralRole: s.perms.role }).where(eq(usersTable.id, req.session.userId)).catch(() => {});
    return next();
  } catch (e: any) {
    if (now - s.okAt < OUTAGE_GRACE_MS) { s.checkedAt = now; console.warn("Central SSO introspection failed, within grace:", e?.message); return next(); }
    res.status(503).json({ error: "Cannot reach the Ashika Portal to verify your session. Please try again shortly.", code: "central_unreachable" });
  }
}

export default router;
