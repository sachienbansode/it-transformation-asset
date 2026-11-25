import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

/** r99 (ITH-160) — password policy set by the Super Admin in Admin › Settings › Password policy. */
export type PasswordPolicy = { minLength: number; upper: boolean; lower: boolean; number: boolean; symbol: boolean; notEmailName: boolean; expiryDays: number; history: number };
export const DEFAULT_POLICY: PasswordPolicy = { minLength: 12, upper: true, lower: true, number: true, symbol: true, notEmailName: true, expiryDays: 90, history: 3 };

export async function getPolicy(): Promise<PasswordPolicy> {
  const [r] = await db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, "auth.passwordPolicy"));
  let v: any = r?.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const p = { ...DEFAULT_POLICY, ...(v && typeof v === "object" ? v : {}) };
  p.minLength = Math.min(64, Math.max(8, Number(p.minLength) || 12));
  p.expiryDays = Math.min(365, Math.max(0, Number(p.expiryDays) || 0));
  p.history = Math.min(10, Math.max(0, Number(p.history) || 0));
  for (const k of ["upper", "lower", "number", "symbol", "notEmailName"] as const) p[k] = p[k] !== false;
  return p;
}

/** what is missing — empty list = the password meets the policy */
export function policyProblems(pw: string, p: PasswordPolicy, email?: string): string[] {
  const out: string[] = [];
  if (pw.length < p.minLength) out.push(`at least ${p.minLength} characters`);
  if (p.lower && !/[a-z]/.test(pw)) out.push("a lower-case letter");
  if (p.upper && !/[A-Z]/.test(pw)) out.push("an upper-case letter");
  if (p.number && !/[0-9]/.test(pw)) out.push("a number");
  if (p.symbol && !/[^A-Za-z0-9]/.test(pw)) out.push("a symbol");
  const local = String(email || "").split("@")[0].toLowerCase();
  if (p.notEmailName && local.length >= 4 && pw.toLowerCase().includes(local)) out.push("NOEMAIL");
  return out;
}
export function policyMessage(probs: string[]) {
  const need = probs.filter(x => x !== "NOEMAIL");
  return [need.length ? `The password needs ${need.join(", ")}` : "", probs.includes("NOEMAIL") ? "It must not contain the email name" : ""].filter(Boolean).join(". ");
}

/** true when the password matches the current or one of the last N (policy.history) passwords */
export async function reusedPassword(pw: string, currentHash: string | null, history: unknown, keep: number) {
  if (currentHash && await bcrypt.compare(pw, currentHash)) return true;
  const list = Array.isArray(history) ? (history as string[]).slice(0, keep) : [];
  for (const h of list) if (await bcrypt.compare(pw, h)) return true;
  return false;
}
/** new history list after a change: the old current hash goes in front, trimmed to N */
export const nextHistory = (oldHash: string | null, history: unknown, keep: number) =>
  keep > 0 ? [oldHash, ...(Array.isArray(history) ? history as string[] : [])].filter(Boolean).slice(0, keep) as string[] : [];
