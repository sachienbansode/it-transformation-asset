/** ITH-118 — client instance facts. One database per client; each instance runs from its own folder with its own config.
 *  SEED_PROFILE=blank (set by scripts/tenant/new-tenant.sh) = a new client: nothing is pre-loaded except the system
 *  configuration and the first Super Admin. TENANT = short client code. The app version comes from the VERSION file. */
import fs from "node:fs";
import path from "node:path";

export const tenantCode = () => (process.env.TENANT || "main").toLowerCase();
export const isBlankTenant = () => (process.env.SEED_PROFILE || "").toLowerCase() === "blank";

let ver: string | null | undefined;
export function appVersion(): string | null {
  if (ver !== undefined) return ver;
  ver = null;
  for (let d = process.cwd(), i = 0; i < 5; i++, d = path.dirname(d)) {
    try { const v = fs.readFileSync(path.join(d, "VERSION"), "utf8").trim(); if (v) { ver = v; break; } } catch { /* look higher */ }
  }
  return ver;
}

/** 2.02 — main changes per version (RELEASE_NOTES.json next to VERSION) */
let notes: Record<string, string[]> | undefined;
export function releaseNotes(): Record<string, string[]> {
  if (notes) return notes; notes = {};
  for (let d = process.cwd(), i = 0; i < 5; i++, d = path.dirname(d)) {
    try { notes = JSON.parse(fs.readFileSync(path.join(d, "RELEASE_NOTES.json"), "utf8")); break; } catch { /* look higher */ }
  }
  return notes!;
}
