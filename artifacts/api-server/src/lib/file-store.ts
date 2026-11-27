/** 2.14 (ITH-151) — one cloud storage for all IT Hub files (Azure Blob or Amazon S3), set in Admin › Settings › File storage.
 *  Inside the container every file goes into a folder of the main folder by purpose, with a readable name:
 *    <main>/chats/recordings/2026/11/CHAT-12_session-4_2026-11-27_15-30.webm.enc
 *    <main>/chats/attachments/2026/11/CHAT-12/2026-11-27_15-31-05_error-log.txt.enc
 *    <main>/itsm/incidents/INC-00012/2026-11-27_15-32-10_screenshot.png
 *    <main>/policies/POL-0001/v2/POL-0001_v2_information-security-policy.pdf
 *    <main>/compliance/evidence/2026/11/2026-11-27_15-33-00_access-review.xlsx
 *    <main>/users/photos/EMP-001_2026-11-27.png
 *    <main>/uploads/pending/2026/11/<id>_<name>   (uploaded, not yet attached to a record)
 *    <main>/_system/connection-tests/…
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { putObject, getObject, deleteObject, storeConfigured, storeLabel, ensureContainer, azureAuth, type StoreCfg } from "./object-store";
import { tenantCode } from "./tenant";

const rowsOf = (r: any) => (r.rows ?? r) as any[];

export const FOLDERS = {
  chatRecordings: "chats/recordings",
  chatAttachments: "chats/attachments",
  incident: "itsm/incidents",
  problem: "itsm/problems",
  change: "itsm/changes",
  request: "itsm/service-requests",
  policies: "policies",
  compliance: "compliance/evidence",
  complianceTemplates: "compliance/templates",
  userPhotos: "users/photos",
  pending: "uploads/pending",
  system: "_system/connection-tests",
} as const;
export const FOLDER_LABELS: [string, string][] = [
  [FOLDERS.chatRecordings, "Screen-session recordings (encrypted)"], [FOLDERS.chatAttachments, "Chat files (encrypted)"],
  [FOLDERS.incident, "Incident attachments"], [FOLDERS.problem, "Problem attachments"], [FOLDERS.change, "Change request attachments"], [FOLDERS.request, "Service request attachments"],
  [FOLDERS.policies, "Policy documents (per policy and version)"], [FOLDERS.compliance, "Audit & compliance evidence"], [FOLDERS.complianceTemplates, "Audit checklist templates (Excel)"], [FOLDERS.userPhotos, "Profile photos"],
  [FOLDERS.pending, "Uploads not yet attached to a record"], [FOLDERS.system, "Connection tests"],
];

/** Readable, safe file name part: "Error Log (1).TXT" → "error-log-1.txt" */
export function safeName(name: string, max = 80) {
  const n = String(name || "file").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const dot = n.lastIndexOf("."); const ext = dot > 0 ? n.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) : "";
  const base = (dot > 0 ? n.slice(0, dot) : n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "file";
  return ext ? `${base}.${ext}` : base;
}
const pad = (n: number) => String(n).padStart(2, "0");
/** IST time stamp for names: 2026-11-27_15-30-05 */
export function stamp(d = new Date(), seconds = true) {
  const t = new Date(+d + 330 * 60_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}_${pad(t.getUTCHours())}-${pad(t.getUTCMinutes())}${seconds ? `-${pad(t.getUTCSeconds())}` : ""}`;
}
export const yearMonth = (d = new Date()) => { const t = new Date(+d + 330 * 60_000); return `${t.getUTCFullYear()}/${pad(t.getUTCMonth() + 1)}`; };
const seg = (s: string) => String(s).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "x";

export const defaultRoot = () => seg(tenantCode() === "main" ? "it-hub" : tenantCode()).toLowerCase();

/** The storage set by the administrator (falls back to the older recording-storage setting). null = not configured. */
export async function fileStore(): Promise<StoreCfg | null> {
  const get = async (k: string) => { const r = rowsOf(await db.execute(sql`SELECT value FROM settings WHERE key = ${k}`))[0]?.value; return typeof r === "string" ? (() => { try { return JSON.parse(r); } catch { return null; } })() : r; };
  let c: any = await get("storage.config");
  if (!c || !c.provider) { const old: any = await get("chat.recordingStorage"); if (old?.provider && old.provider !== "none") c = { ...old, root: String(old.prefix || "").replace(/\/?recordings\/?$/, "").replace(/^\/+|\/+$/g, "") || defaultRoot() }; }
  if (!c || !storeConfigured(c)) return null;
  return { ...c, root: seg(c.root || defaultRoot()).toLowerCase() };
}
/** Full object key: <main folder>/<folder>/<parts…> */
export const keyOf = (c: StoreCfg, folder: string, ...parts: string[]) => [c.root || defaultRoot(), folder, ...parts.map(p => p.split("/").map(seg).join("/"))].join("/");

export { putObject, getObject, deleteObject, storeLabel, ensureContainer, azureAuth };

/** Move a file inside the storage (copy + delete), used when an upload is attached to a record. */
export async function moveObject(c: StoreCfg, from: string, to: string) {
  if (from === to) return;
  const data = await getObject(c, from); await putObject(c, to, data); await deleteObject(c, from).catch(() => {});
}

/** Set-up + test: creates the container when allowed, then writes, reads back and removes a test file in <main>/_system/connection-tests. */
export async function setupAndTest(c: StoreCfg) {
  const steps: { step: string; ok: boolean; detail: string }[] = [];
  const add = (step: string, ok: boolean, detail: string) => { steps.push({ step, ok, detail }); return ok; };
  if (!add("Settings complete", storeConfigured(c), storeConfigured(c) ? storeLabel(c) : "Choose the provider and fill in the storage account and container (or S3 bucket and region)")) return { ok: false, steps };
  if (c.provider === "azure") add("Sign-in method", true, ({ "managed-identity": "Managed identity of the server (no secret)", key: "Storage account key (AZURE_STORAGE_KEY)", sas: "Container SAS (FILE_STORAGE_AZURE_SAS)" } as any)[azureAuth(c)]);
  try {
    const r = await ensureContainer(c);
    add("Container", true, r === "created" ? `Created “${c.container}”` : r === "exists" ? `“${c.container}” already exists` : c.provider === "azure" ? "Not checked — a SAS cannot create containers; create it in the Azure Portal" : "Bucket must already exist");
  } catch (e: any) { add("Container", false, e.message); return { ok: false, steps }; }
  const key = keyOf(c, FOLDERS.system, `${stamp()}_test.txt`); const probe = Buffer.from(`IT Hub storage test ${new Date().toISOString()}`);
  try { await putObject(c, key, probe); add("Write a test file", true, key); } catch (e: any) { add("Write a test file", false, e.message); return { ok: false, steps }; }
  try { const back = await getObject(c, key); add("Read it back", back.equals(probe), back.equals(probe) ? "Same content" : "Different content"); } catch (e: any) { add("Read it back", false, e.message); }
  try { await deleteObject(c, key); add("Remove it", true, "Removed"); } catch (e: any) { add("Remove it", false, e.message); }
  return { ok: steps.every(s => s.ok), steps };
}
