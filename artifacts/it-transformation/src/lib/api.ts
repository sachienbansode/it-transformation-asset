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
    throw new ApiError((err as any).error || res.statusText, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as T;
}
