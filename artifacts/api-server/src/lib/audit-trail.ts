import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { getPerformedBy } from "../routes/audit-logs";

/*
 * Every change made through the API is in the audit log. Modules that write their own detailed entry (logAudit) mark the
 * request as audited; any other successful change (POST / PUT / PATCH / DELETE) gets a generic entry here: who, what
 * (module, record, action), when, from where, and the submitted fields with secrets removed. Access refusals (403) too.
 */
const als = new AsyncLocalStorage<{ audited: boolean }>();
export function markAudited() { const s = als.getStore(); if (s) s.audited = true; }

const SKIP = [/^\/presence\/heartbeat$/, /^\/notifications(\/|$)/, /^\/agent\/v1\/(checkin|files)/, /\/chats\/\d+\/messages$/, /^\/my-it-chats\/\d+\/messages$/, /^\/healthz$/, /^\/auth\/(me|session|keepalive)/];
const SECRET = /pass(word)?|token|secret|otp|mfa|totp|p256dh|^auth$|private|api.?key|^code$|^keys$|cookie/i;
const NAMES: Record<string, string> = {
  assets: "asset", "asset-agents": "device", "asset-agent-codes": "installation_key", "asset-allocations": "asset_allocation", "asset-handovers": "asset_allocation",
  "asset-licenses": "asset_license", "asset-license-assignments": "asset_license", "asset-vendors": "asset_vendor", "asset-contracts": "asset_contract", "asset-audits": "asset_audit",
  "maintenance-records": "maintenance", "asset-depreciation": "asset_depreciation", incidents: "incident", problems: "problem", changes: "change", "service-requests": "service_request",
  "knowledge-base": "knowledge_base", "sla-policies": "sla_policy", "approval-matrix": "approval_matrix", approvals: "approval", "my-approvals": "approval", policies: "policy", "my-policies": "policy_decision",
  users: "user", admin: "admin", roles: "role", "user-roles": "role", applications: "application", roadmap: "roadmap", checklist: "checklist", kpis: "kpi", settings: "setting", push: "push", "my-it-chats": "device_chat", auth: "auth",
};
const CHAT = /chats|my-it-chats/;   // chat text is never copied into the audit log (it stays encrypted in the chat)
const CHAT_FIELDS = /^(message|body|subject|resolution|note|reason)$/i;
function clean(v: any, depth = 0, chat = false): any {
  if (Buffer.isBuffer(v)) return { bytes: v.length };
  if (v === null || typeof v !== "object") return typeof v === "string" && v.length > 500 ? v.slice(0, 500) + "…" : v;
  if (Array.isArray(v)) return v.length > 20 ? { items: v.length, first: clean(v[0], depth + 1, chat) } : v.map(x => clean(x, depth + 1, chat));
  if (depth > 3) return "…";
  const o: any = {};
  for (const [k, x] of Object.entries(v)) o[k] = SECRET.test(k) ? "[hidden]" : chat && CHAT_FIELDS.test(k) ? `[${String(x ?? "").length} characters — not stored]` : clean(x, depth + 1, chat);
  return o;
}
function describe(method: string, path: string) {
  const parts = path.split("/").filter(Boolean);
  const entityType = NAMES[parts[0]] || (parts[0] || "api").replace(/-/g, "_");
  const id = parts.find(p => /^\d+$/.test(p));
  const verb = [...parts].reverse().find(p => !/^\d+$/.test(p) && p !== parts[0]);
  const action = method === "DELETE" ? "delete" : verb ? verb.replace(/-/g, "_") : method === "POST" ? "create" : "update";
  return { entityType, entityId: id ? Number(id) : undefined, action };
}

export function auditTrail(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS" || SKIP.some(r => r.test(req.path))) return next();
  const store = { audited: false };
  const started = Date.now(); const path = req.path; const method = req.method;
  res.on("finish", () => {
    const ok = res.statusCode < 400, denied = res.statusCode === 403;
    if ((!ok && !denied) || (ok && store.audited)) return;
    const userId = Number((req.session as any)?.userId) || undefined;
    const d = describe(method, path);
    void (async () => {
      const who = userId ? await getPerformedBy(userId).catch(() => `User #${userId}`) : (/^\/agent\//.test(path) ? "Device agent" : "Not signed in");
      let body: any = clean(req.body && typeof req.body === "object" ? req.body : undefined, 0, CHAT.test(path));
      if (body && JSON.stringify(body).length > 6000) body = { fields: Object.keys(req.body || {}), note: "large request — details not stored" };
      await db.insert(auditLogsTable).values({
        entityType: d.entityType, entityId: d.entityId, action: denied ? `denied_${d.action}` : d.action, performedBy: who,
        summary: `${denied ? "Refused" : "Changed"}: ${method} ${path}${d.entityId ? "" : ""} → ${res.statusCode} (${Date.now() - started} ms)`,
        newValues: body ?? null,
        context: { ip: req.ip, userAgent: String(req.get("user-agent") || "").slice(0, 200), pageContext: String(req.get("x-page") || req.get("referer") || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 200), timestamp: new Date().toISOString(), method, path, status: res.statusCode, generic: true } as any,
      }).catch((e: unknown) => console.error("audit trail failed", e));
    })();
  });
  als.run(store, next);
}
