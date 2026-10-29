import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/*
 * File-upload policy for the whole IT Hub (Admin › Settings › File uploads):
 *  uploads.allowedFileTypes — list of extensions, e.g. ["pdf","xlsx","docx","jpeg"]
 *  uploads.maxSizeMB        — per-file limit (never above the server's UPLOAD_MAX_MB)
 * Executable and script types are always refused, whatever the list says.
 */
export const DEFAULT_TYPES = ["pdf", "xlsx", "xls", "csv", "docx", "doc", "pptx", "ppt", "txt", "jpg", "jpeg", "png", "msg", "eml", "zip"];
export const BLOCKED = ["exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "js", "mjs", "jar", "sh", "dll", "html", "htm", "xhtml", "svg", "php", "asp", "aspx", "hta", "lnk", "reg"];
const SERVER_MAX = Number(process.env.UPLOAD_MAX_MB || 25);

const unwrap = (v: any) => { let x = v; for (let i = 0; i < 3 && typeof x === "string"; i++) { try { x = JSON.parse(x); } catch { break; } } return x; };
export const cleanExt = (s: string) => String(s).trim().toLowerCase().replace(/^\*?\./, "").replace(/[^a-z0-9]/g, "");

let cache: { at: number; v: { types: string[]; maxMB: number } } | null = null;
export async function getUploadPolicy() {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  let types = DEFAULT_TYPES, maxMB = Math.min(20, SERVER_MAX);
  try {
    const r: any = await db.execute(sql`SELECT key, value FROM settings WHERE key IN ('uploads.allowedFileTypes', 'uploads.maxSizeMB')`);
    for (const row of (r.rows ?? r)) {
      const v = unwrap(row.value);
      if (row.key === "uploads.allowedFileTypes") { const list = (Array.isArray(v) ? v : String(v ?? "").split(/[,;\s]+/)).map(cleanExt).filter(Boolean); if (list.length) types = [...new Set(list)]; }
      if (row.key === "uploads.maxSizeMB" && Number(v) > 0) maxMB = Math.min(Number(v), SERVER_MAX);
    }
  } catch { /* defaults */ }
  const v = { types: types.filter(t => !BLOCKED.includes(t)), maxMB, serverMaxMB: SERVER_MAX } as any;
  cache = { at: Date.now(), v }; return v as { types: string[]; maxMB: number };
}
export const clearUploadPolicyCache = () => { cache = null; };

/** Returns an error message, or null when the file is allowed. */
export async function checkUpload(name: string, size: number) {
  const p = await getUploadPolicy();
  const ext = (String(name).match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
  if (!ext) return `The file needs an extension. Allowed: ${p.types.map(t => "." + t).join(", ")}`;
  if (BLOCKED.includes(ext) || !p.types.includes(ext)) return `.${ext} files are not allowed. Allowed: ${p.types.map(t => "." + t).join(", ")} (Admin › Settings › File uploads)`;
  if (size > p.maxMB * 1024 * 1024) return `File is larger than ${p.maxMB} MB`;
  return null;
}
