/** 2.19 — (1) one-time move of files kept on the server / in the database into the cloud file storage, into the right
 *  folders with readable names; (2) clean-up of uploads that were never attached to a record.
 *  Every moved file is read back and checked (SHA-256) before the server copy is let go. Server files are not deleted:
 *  they are moved to <uploads>/_moved-to-cloud/ so nothing is lost (remove that folder later to free the disk). */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { fileStore, keyOf, FOLDERS, safeName, stamp, yearMonth, putObject, getObject, deleteObject } from "./file-store";
import type { StoreCfg } from "./object-store";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
const MOVED = path.join(UPLOAD_DIR, "_moved-to-cloud");
const ID_RE = /^[a-f0-9-]{36}$/;
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const idOf = (p: string) => String(p || "").split("/").pop() || "";
const TICKET: Record<string, [string, string, string]> = { "Incident": ["itsm_incidents", "ticket_no", FOLDERS.incident], "Problem": ["itsm_problems", "problem_no", FOLDERS.problem], "Change Request": ["itsm_changes", "change_no", FOLDERS.change], "Service Request": ["itsm_service_requests", "request_no", FOLDERS.request] };

type Item = { kind: string; ref: string; name: string; do: (c: StoreCfg) => Promise<string> };

/** local upload (on disk, no cloud row yet) for an /objects/uploads/<id> path */
function local(objectPath: string) {
  const id = idOf(objectPath); if (!ID_RE.test(id)) return null;
  const file = path.join(UPLOAD_DIR, id); if (!fs.existsSync(file)) return null;
  const metaFile = path.join(UPLOAD_DIR, `${id}.json`);
  const meta = fs.existsSync(metaFile) ? (() => { try { return JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch { return {}; } })() : {};
  return { id, file, metaFile, meta };
}
async function moveLocal(c: StoreCfg, objectPath: string, folder: string, parts: string[], name: string, at: Date | null) {
  const l = local(objectPath); if (!l) throw new Error("file not found on the server");
  const buf = fs.readFileSync(l.file); const key = keyOf(c, folder, ...parts, `${stamp(at || new Date())}_${safeName(name || l.meta.name || "file")}`);
  await putObject(c, key, buf);
  if (sha(await getObject(c, key)) !== sha(buf)) throw new Error("read-back check failed");
  await db.execute(sql`INSERT INTO stored_files (id, object_key, store_cfg, file_name, size_bytes, content_type, sha256, folder, ref, uploaded, uploaded_by, created_at, linked_at)
    VALUES (${l.id}::uuid, ${key}, ${JSON.stringify(c)}::jsonb, ${name || l.meta.name || null}, ${buf.length}, ${l.meta.contentType || null}, ${sha(buf)}, ${folder}, ${parts.join("/") || null}, true, ${l.meta.by ?? null}, coalesce(${at ? at.toISOString() : null}::timestamptz, now()), now())
    ON CONFLICT (id) DO NOTHING`);
  fs.mkdirSync(MOVED, { recursive: true });
  for (const f of [l.file, l.metaFile]) if (fs.existsSync(f)) fs.renameSync(f, path.join(MOVED, path.basename(f)));
  return key;
}

/** everything still on the server / in the database that belongs in the cloud storage */
async function pending(): Promise<Item[]> {
  const items: Item[] = [];
  const notCloud = (p: string) => sql`NOT EXISTS (SELECT 1 FROM stored_files s WHERE s.id::text = regexp_replace(${sql.raw(p)}, '^.*/', ''))`;
  for (const a of rowsOf(await db.execute(sql`SELECT id, ticket_type, ticket_id, file_name, object_path, created_at FROM itsm_attachments WHERE object_path LIKE '/objects/uploads/%' AND ${notCloud("object_path")}`))) {
    const t = TICKET[a.ticket_type]; if (!t || !local(a.object_path)) continue;
    items.push({ kind: "Ticket attachments", ref: `${a.ticket_type} #${a.ticket_id}`, name: a.file_name, do: async c => {
      const [r] = rowsOf(await db.execute(sql.raw(`SELECT ${t[1]} AS no FROM public.${t[0]} WHERE id = ${Number(a.ticket_id)}`)));
      return moveLocal(c, a.object_path, t[2], [String(r?.no || `${a.ticket_type}-${a.ticket_id}`)], a.file_name, a.created_at ? new Date(a.created_at) : null); } });
  }
  for (const f of rowsOf(await db.execute(sql`SELECT object_path, file_name, uploaded_at FROM cmp_document_files WHERE object_path LIKE '/objects/uploads/%' AND ${notCloud("object_path")}`))) {
    if (!local(f.object_path)) continue;
    items.push({ kind: "Audit & compliance evidence", ref: f.file_name, name: f.file_name, do: c => moveLocal(c, f.object_path, FOLDERS.compliance, [yearMonth(new Date(f.uploaded_at || Date.now()))], f.file_name, f.uploaded_at ? new Date(f.uploaded_at) : null) });
  }
  for (const t of rowsOf(await db.execute(sql`SELECT source_object, source_file, created_at FROM cmp_templates WHERE source_object LIKE '/objects/uploads/%' AND ${notCloud("source_object")}`))) {
    if (!local(t.source_object)) continue;
    items.push({ kind: "Audit checklist templates", ref: t.source_file || "template", name: t.source_file, do: c => moveLocal(c, t.source_object, FOLDERS.complianceTemplates, [], t.source_file || "template.xlsx", t.created_at ? new Date(t.created_at) : null) });
  }
  for (const u of rowsOf(await db.execute(sql`SELECT id, employee_code, photo_url FROM users WHERE photo_url LIKE '/objects/uploads/%' AND ${notCloud("photo_url")}`))) {
    const l = local(u.photo_url); if (!l) continue;
    items.push({ kind: "Profile photos", ref: u.employee_code || `user ${u.id}`, name: l.meta.name || "photo", do: c => moveLocal(c, u.photo_url, FOLDERS.userPhotos, [String(u.employee_code || `user-${u.id}`)], l.meta.name || "photo.png", null) });
  }
  for (const d of rowsOf(await db.execute(sql`SELECT d.id, d.file_name, d.uploaded_at, p.code FROM policy_documents d JOIN policies p ON p.id = d.policy_id WHERE d.data IS NOT NULL AND d.object_key IS NULL`))) {
    items.push({ kind: "Policy documents", ref: d.code, name: d.file_name, do: async c => {
      const [r] = rowsOf(await db.execute(sql`SELECT data FROM policy_documents WHERE id = ${d.id}`)); const buf = Buffer.from(r.data);
      const key = keyOf(c, FOLDERS.policies, d.code, `${d.code}_${stamp(new Date(d.uploaded_at || Date.now()))}_${safeName(d.file_name)}`);
      await putObject(c, key, buf); if (sha(await getObject(c, key)) !== sha(buf)) throw new Error("read-back check failed");
      await db.execute(sql`UPDATE policy_documents SET object_key = ${key}, store_cfg = ${JSON.stringify(c)}::jsonb, data = NULL WHERE id = ${d.id}`); return key; } });
  }
  for (const a of rowsOf(await db.execute(sql`SELECT id, chat_id, file_name, at FROM chat_attachments WHERE coalesce(storage, 'db') = 'db' AND data IS NOT NULL`))) {
    items.push({ kind: "Chat files (encrypted)", ref: `CHAT-${a.chat_id}`, name: a.file_name, do: async c => {
      const [r] = rowsOf(await db.execute(sql`SELECT data FROM chat_attachments WHERE id = ${a.id}`)); const buf = Buffer.from(r.data);   // already encrypted — copied as is
      const at = new Date(a.at || Date.now());
      const key = keyOf(c, FOLDERS.chatAttachments, yearMonth(at), `CHAT-${a.chat_id}`, `${stamp(at)}_${safeName(a.file_name)}.enc`);
      await putObject(c, key, buf); if (sha(await getObject(c, key)) !== sha(buf)) throw new Error("read-back check failed");
      await db.execute(sql`UPDATE chat_attachments SET storage = ${c.provider}, object_key = ${key}, store_cfg = ${JSON.stringify(c)}::jsonb, data = NULL WHERE id = ${a.id}`); return key; } });
  }
  return items;
}

export async function migrationSummary() {
  const items = await pending(); const by: Record<string, number> = {};
  for (const i of items) by[i.kind] = (by[i.kind] || 0) + 1;
  return { total: items.length, byKind: by };
}
/** move up to `limit` files; call again until remaining is 0 */
export async function migrateBatch(limit = 50) {
  const c = await fileStore(); if (!c) throw Object.assign(new Error("Set up the file storage first"), { status: 400 });
  const items = await pending(); const moved: any[] = [], failed: any[] = [];
  for (const i of items.slice(0, limit)) {
    try { moved.push({ kind: i.kind, ref: i.ref, name: i.name, key: await i.do(c) }); }
    catch (e: any) { failed.push({ kind: i.kind, ref: i.ref, name: i.name, error: e?.message || String(e) }); }
  }
  return { moved, failed, remaining: Math.max(0, items.length - moved.length) };
}

/* ── uploads never attached to a record ── */
const ORPHAN = (days: number) => sql`FROM stored_files s WHERE s.folder = ${FOLDERS.pending} AND s.linked_at IS NULL AND s.created_at < now() - make_interval(days => ${days})
  AND NOT EXISTS (SELECT 1 FROM itsm_attachments x WHERE x.object_path = '/objects/uploads/' || s.id::text)
  AND NOT EXISTS (SELECT 1 FROM cmp_document_files x WHERE x.object_path = '/objects/uploads/' || s.id::text)
  AND NOT EXISTS (SELECT 1 FROM cmp_templates x WHERE x.source_object = '/objects/uploads/' || s.id::text)
  AND NOT EXISTS (SELECT 1 FROM users x WHERE x.photo_url = '/objects/uploads/' || s.id::text)`;
export const PENDING_DAYS = 7;
export async function orphanCount(days = PENDING_DAYS) { return Number(rowsOf(await db.execute(sql`SELECT count(*)::int AS n ${ORPHAN(days)}`))[0]?.n || 0); }
/** delete uploads older than `days` that no record points to (cloud file + row). */
export async function cleanPending(days = PENDING_DAYS) {
  let removed = 0, failed = 0;
  for (const r of rowsOf(await db.execute(sql`SELECT s.id, s.object_key, s.store_cfg, s.file_name ${ORPHAN(days)} LIMIT 500`))) {
    try { await deleteObject(typeof r.store_cfg === "string" ? JSON.parse(r.store_cfg) : r.store_cfg, r.object_key); await db.execute(sql`DELETE FROM stored_files WHERE id = ${r.id}::uuid`); removed++; }
    catch { failed++; }
  }
  if (removed) await db.execute(sql`INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary) VALUES ('file_storage', 0, 'cleanup', 'System', ${"Removed " + removed + " upload(s) never attached to a record (older than " + days + " days)"})`).catch(() => {});
  return { removed, failed };
}
let started = false;
/** daily clean-up (first run 10 minutes after start) */
export function startPendingSweep() {
  if (started) return; started = true;
  const run = () => cleanPending().catch(e => console.error("pending upload clean-up", e?.message));
  setTimeout(run, 10 * 60_000).unref?.(); setInterval(run, 24 * 3600_000).unref?.();
}
