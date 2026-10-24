import crypto from "node:crypto";

/*
 * Central Identity — Ashika API Portal ("Portal") as identity provider (Integration Guide v1.1, Option A).
 *
 *   browser → GET {base}/authorize?client_id&redirect_uri&state      (Portal login: password+OTP or Microsoft 365)
 *   Portal  → GET /api/auth/central/callback?code&state               (code: single use, 60 s)
 *   backend → POST {base}/token      client_id, client_secret, code   → access_token + identity + app-scoped permissions
 *   backend → POST {base}/introspect client_id, client_secret, token  → LIVE active flag + role + permissions
 *
 * Configuration (backend only, /etc/it-hub.env — the client secret never reaches the browser):
 *   CENTRAL_SSO_ENABLED=true
 *   CENTRAL_SSO_BASE_URL=https://<portal-host>/api/sso
 *   CENTRAL_SSO_CLIENT_ID=it-hub
 *   CENTRAL_SSO_CLIENT_SECRET=<plaintext secret given by the Portal admin>
 *   CENTRAL_SSO_REDIRECT_URI=https://ithub-uat.niytri.com/api/auth/central/callback   (must be in the Portal allow-list)
 *   CENTRAL_SSO_LOCAL_LOGIN=admin        admin = only local admins may use a password (break-glass) | all | off
 *   CENTRAL_SSO_INTROSPECT_SECONDS=60    how often a session is re-validated against the Portal (writes: every 15 s)
 *   CENTRAL_SSO_BUTTON_LABEL=Sign in with Ashika Portal
 *
 * Permission model: the Portal role's { pages, access, full_access } are scoped to this app. Page keys = this
 * app's module keys (see MODULES in routes/roles.ts), e.g. "asset_registry". access[key] "edit" = write, else read.
 */

export type CentralPerms = { fullAccess: boolean; pages: string[]; access: Record<string, string>; piiView: boolean; actions: string[]; role: string | null };
export type CentralSession = { token: string; sub: string; email: string; perms: CentralPerms; checkedAt: number; okAt: number; expiresAt: number };

const env = (k: string, d = "") => (process.env[k] ?? d).trim();
export const centralConfig = () => ({
  enabled: /^(1|true|yes|on)$/i.test(env("CENTRAL_SSO_ENABLED")) && !!env("CENTRAL_SSO_BASE_URL") && !!env("CENTRAL_SSO_CLIENT_ID") && !!env("CENTRAL_SSO_CLIENT_SECRET"),
  baseUrl: env("CENTRAL_SSO_BASE_URL").replace(/\/+$/, ""),
  clientId: env("CENTRAL_SSO_CLIENT_ID"),
  clientSecret: env("CENTRAL_SSO_CLIENT_SECRET"),
  redirectUri: env("CENTRAL_SSO_REDIRECT_URI"),
  localLogin: (["admin", "all", "off"].includes(env("CENTRAL_SSO_LOCAL_LOGIN", "admin").toLowerCase()) ? env("CENTRAL_SSO_LOCAL_LOGIN", "admin").toLowerCase() : "admin") as "admin" | "all" | "off",
  introspectSeconds: Math.max(5, Number(env("CENTRAL_SSO_INTROSPECT_SECONDS", "60")) || 60),
  buttonLabel: env("CENTRAL_SSO_BUTTON_LABEL", "Sign in with Ashika Portal"),
  timeoutMs: 8000,
});

export const newState = () => crypto.randomBytes(24).toString("base64url");
export const safeEqual = (a: string, b: string) => { const x = Buffer.from(a || ""), y = Buffer.from(b || ""); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Normalise the Portal's permission payload (token / introspect responses). */
export function toPerms(j: any): CentralPerms {
  const p = j?.permissions && typeof j.permissions === "object" ? j.permissions : {};
  const pages: string[] = Array.isArray(j?.pages) ? j.pages : Array.isArray(p.pages) ? p.pages : [];
  const access: Record<string, string> = (j?.access && typeof j.access === "object" ? j.access : p.access) || {};
  const fullAccess = j?.full_access === true || pages.includes("*");
  return { fullAccess, pages: pages.filter(x => x !== "*"), access, piiView: p.pii_view === true, actions: Array.isArray(p.actions) ? p.actions : [], role: j?.role ?? null };
}

/** Portal permissions → this app's effective module permissions (none | read | write | admin). */
export function toEffective(perms: CentralPerms, moduleKeys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of moduleKeys) {
    if (perms.fullAccess) out[k] = "admin";
    else if (perms.pages.includes(k)) out[k] = perms.access[k] === "edit" ? "write" : "read";
  }
  return out;
}

async function post(path: string, form: Record<string, string>) {
  const c = centralConfig();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), c.timeoutMs);
  try {
    const r = await fetch(`${c.baseUrl}${path}`, {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...form }),
    });
    const text = await r.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { ok: r.ok, status: r.status, json };
  } finally { clearTimeout(t); }
}

export function authorizeUrl(state: string) {
  const c = centralConfig();
  const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: c.redirectUri, state });
  return `${c.baseUrl}/authorize?${q.toString()}`;
}

export async function exchangeCode(code: string) {
  const r = await post("/token", { code });
  if (!r.ok || !r.json?.access_token) throw new Error(r.json?.error_description || r.json?.error || `Portal token exchange failed (HTTP ${r.status})`);
  return r.json;
}

/** Returns { active:false } when the token is invalid/expired or the account is disabled; throws on network error. */
export async function introspect(token: string) {
  const r = await post("/introspect", { token });
  if (r.status >= 500 || !r.json) throw new Error(`Portal introspection unavailable (HTTP ${r.status})`);
  return r.json;
}
