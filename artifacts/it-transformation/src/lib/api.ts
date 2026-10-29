const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const API = `${BASE}/api`;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* Raw validation errors from the server (a JSON list of issues) become one readable line, e.g.
   [{"path":["email"],"message":"Invalid email"}] → "Login email: enter a full email address, e.g. name@ashikagroup.com" */
const FIELD: Record<string, string> = { email: "Login email", employeeCode: "Employee code", name: "Name", mobile: "Mobile number", password: "Password", designation: "Designation", department: "Department" };
const words = (k: string) => FIELD[k] || k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_.]/g, " ").replace(/^./, c => c.toUpperCase());
function friendly(issue: any) {
  const field = Array.isArray(issue?.path) && issue.path.length ? words(String(issue.path[issue.path.length - 1])) : "";
  let m = String(issue?.message || "is not valid");
  if (/invalid email/i.test(m) || issue?.validation === "email" || issue?.format === "email") m = "enter a full email address, e.g. name@ashikagroup.com";
  else if (issue?.code === "too_small" && issue?.minimum) m = issue.type === "string" || issue.origin === "string" ? `at least ${issue.minimum} characters` : `at least ${issue.minimum}`;
  else if (issue?.code === "too_big" && issue?.maximum) m = issue.type === "string" || issue.origin === "string" ? `at most ${issue.maximum} characters` : `at most ${issue.maximum}`;
  else if (/^Required$/i.test(m) || (issue?.code === "invalid_type" && /undefined/.test(m))) m = "is required";
  return field ? (/^(is|enter|at) /.test(m) ? `${field} ${m.startsWith("enter") ? "— " + m : m}` : `${field}: ${m}`) : m;
}
export function readableError(msg: unknown): string {
  const t = String(msg ?? "").trim();
  if (t.startsWith("[") || t.startsWith("{")) {
    try { const j = JSON.parse(t); const list = Array.isArray(j) ? j : j?.issues || j?.errors; if (Array.isArray(list) && list.length) return list.map(friendly).join(" · "); } catch { /* not JSON */ }
  }
  return t;
}

export async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    // Session ended (disabled in the Ashika Portal or IT Hub, IT Hub role removed, or expired): go back to sign-in
    if (res.status === 401 && /^central_/.test((err as any).code || "") && !window.location.pathname.startsWith("/login")) {
      try { sessionStorage.setItem("ashika-after-login", window.location.pathname + window.location.search); } catch { /* ignore */ }
      window.location.href = "/login?sso_error=session_ended";
    }
    const raw = (err as any).error ?? (err as any).message ?? res.statusText;
    throw new ApiError(readableError(typeof raw === "string" ? raw : JSON.stringify(raw)) || `Request failed (${res.status})`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as T;
}
