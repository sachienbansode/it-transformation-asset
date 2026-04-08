const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const API = `${BASE}/api`;

export async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as T;
}
