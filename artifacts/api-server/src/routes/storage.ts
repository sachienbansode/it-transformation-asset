import express, { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { z } from "zod/v4";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { checkUpload, getUploadPolicy } from "../lib/upload-policy";
import { fileStore, keyOf, FOLDERS, safeName, stamp, yearMonth, putObject, getObject, deleteObject as cloudDelete, moveObject } from "../lib/file-store";
import type { StoreCfg } from "../lib/object-store";

/* 2.14 (ITH-151): when cloud file storage is set (Admin › Settings › File storage) uploads go to it — first into
   <main>/uploads/pending/YYYY/MM, then fileUpload() moves them into the folder of the record they are attached to.
   The objectPath the browser and the tables keep (/objects/uploads/<id>) does not change. */
const rowsOf = (r: any) => (r.rows ?? r) as any[];
async function cloudRow(id: string) { if (!ID_RE.test(id)) return null; return rowsOf(await db.execute(sql`SELECT * FROM stored_files WHERE id = ${id}::uuid`).catch(() => ({ rows: [] })))[0] || null; }
const cfgOf = (r: any): StoreCfg => (typeof r.store_cfg === "string" ? JSON.parse(r.store_cfg) : r.store_cfg);
/** Move an upload into its record's folder, e.g. fileUpload(path, FOLDERS.incident, ["INC-00012"]). Local files stay where they are. Never throws. */
export async function fileUpload(objectPath: string, folder: string, parts: string[] = [], ref?: string) {
  try {
    const id = String(objectPath).split("/").pop() || ""; const r = await cloudRow(id); if (!r || !r.uploaded) return;
    const c = cfgOf(r); const to = keyOf(c, folder, ...parts, `${stamp()}_${safeName(r.file_name)}`);
    await moveObject(c, r.object_key, to);
    await db.execute(sql`UPDATE stored_files SET object_key = ${to}, folder = ${folder}, ref = ${ref ?? parts.join("/")}, linked_at = now() WHERE id = ${id}::uuid`);
  } catch (e) { console.error("fileUpload: could not move", objectPath, e); }
}

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number(),
  contentType: z.string(),
});

const RequestUploadUrlResponse = z.object({
  uploadURL: z.string(),
  objectPath: z.string(),
  metadata: z.object({ name: z.string(), size: z.number(), contentType: z.string() }),
});

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/*
 * Storage driver. On Replit the sidecar object storage is used; everywhere else (AWS server) files are kept on the
 * server's disk under UPLOAD_DIR (default: <api-server>/uploads, outside git). Uploads still use the same two-step
 * flow (request URL → PUT file), so the browser code is unchanged. Downloads require a signed-in user.
 */
const DRIVER = process.env.STORAGE_DRIVER || (process.env.REPL_ID ? "replit" : "local");
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
const MAX_UPLOAD = Number(process.env.UPLOAD_MAX_MB || 25) * 1024 * 1024;
const ID_RE = /^[a-f0-9-]{36}$/;
if (DRIVER === "local") { try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* reported on first upload */ } }

router.put("/storage/local-upload/:id", express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const cr = await cloudRow(id);
  if (cr) {
    if (cr.uploaded) { res.status(409).json({ error: "Already uploaded" }); return; }
    const data: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? ""));
    try { await putObject(cfgOf(cr), cr.object_key, data); } catch (e: any) { res.status(502).json({ error: `Could not save the file to cloud storage: ${e.message}` }); return; }
    await db.execute(sql`UPDATE stored_files SET uploaded = true, size_bytes = ${data.length}, sha256 = ${crypto.createHash("sha256").update(data).digest("hex")}, content_type = ${String(req.headers["content-type"] || cr.content_type)} WHERE id = ${id}::uuid`);
    res.json({ ok: true }); return;
  }
  if (DRIVER !== "local" || !ID_RE.test(id)) { res.status(404).json({ error: "Not found" }); return; }
  const metaFile = path.join(UPLOAD_DIR, `${id}.json`);
  if (!fs.existsSync(metaFile)) { res.status(404).json({ error: "Upload URL expired — try again" }); return; }
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  if (meta.uploaded) { res.status(409).json({ error: "Already uploaded" }); return; }
  const data: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? ""));
  fs.writeFileSync(path.join(UPLOAD_DIR, id), data);
  fs.writeFileSync(metaFile, JSON.stringify({ ...meta, uploaded: true, bytes: data.length, contentType: req.headers["content-type"] || meta.contentType }));
  res.json({ ok: true });
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  {
    const bad = await checkUpload(parsed.data.name, parsed.data.size);
    if (bad) { res.status(400).json({ error: bad }); return; }
  }

  try {
    const { name, size, contentType } = parsed.data;
    if (size > MAX_UPLOAD) { res.status(400).json({ error: `File is larger than ${MAX_UPLOAD / 1024 / 1024} MB` }); return; }
    const cloud = await fileStore().catch(() => null);
    if (cloud) {
      const id = crypto.randomUUID();
      const key = keyOf(cloud, FOLDERS.pending, yearMonth(), `${id}_${safeName(name)}`);
      await db.execute(sql`INSERT INTO stored_files (id, object_key, store_cfg, file_name, size_bytes, content_type, folder, uploaded_by) VALUES (${id}::uuid, ${key}, ${JSON.stringify(cloud)}::jsonb, ${name}, ${size}, ${contentType}, ${FOLDERS.pending}, ${(req.session as any)?.userId ?? null})`);
      res.json({ uploadURL: `${(process.env.BASE_PATH || "").replace(/\/$/, "")}/api/storage/local-upload/${id}`, objectPath: `/objects/uploads/${id}`, metadata: { name, size, contentType } });
      return;
    }
    if (DRIVER === "local") {
      const id = crypto.randomUUID();
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.json`), JSON.stringify({ name, size, contentType, by: (req.session as any)?.userId ?? null, at: new Date().toISOString() }));
      res.json({ uploadURL: `${(process.env.BASE_PATH || "").replace(/\/$/, "")}/api/storage/local-upload/${id}`, objectPath: `/objects/uploads/${id}`, metadata: { name, size, contentType } });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    // Audit evidence is served only by /compliance-files (access-checked and logged)
    const guarded: any = await db.execute(sql`SELECT 1 FROM cmp_document_files WHERE object_path = ${objectPath} UNION ALL SELECT 1 FROM cmp_templates WHERE source_object = ${objectPath} LIMIT 1`).catch(() => ({ rows: [] }));
    if ((guarded.rows ?? guarded).length) { res.status(403).json({ error: "Open this file from Audit & Compliance" }); return; }
    {
      const cr = await cloudRow(wildcardPath.split("/").pop() || "");
      if (cr && cr.uploaded) {
        const data = await getObject(cfgOf(cr), cr.object_key);
        res.setHeader("Content-Type", cr.content_type || "application/octet-stream");
        res.setHeader("Content-Disposition", `inline; filename="${String(cr.file_name || "file").replace(/"/g, "")}"`); res.setHeader("Cache-Control", "private, no-store");
        res.send(data); return;
      }
    }
    if (DRIVER === "local") {
      const id = wildcardPath.split("/").pop() || "";
      const file = path.join(UPLOAD_DIR, id), metaFile = path.join(UPLOAD_DIR, `${id}.json`);
      if (!ID_RE.test(id) || !fs.existsSync(file)) { res.status(404).json({ error: "Object not found" }); return; }
      const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
      res.setHeader("Content-Type", meta.contentType || "application/octet-stream");
      if (meta.name) res.setHeader("Content-Disposition", `inline; filename="${String(meta.name).replace(/"/g, "")}"`);
      fs.createReadStream(file).pipe(res);
      return;
    }
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

/** Read a stored object (used by modules that serve files through their own access checks, e.g. Audit & Compliance). */
export async function readObject(objectPath: string): Promise<{ buffer: Buffer; contentType: string; name: string | null }> {
  const id = String(objectPath).split("/").pop() || "";
  const cr = await cloudRow(id);
  if (cr) { if (!cr.uploaded) throw new ObjectNotFoundError(); return { buffer: await getObject(cfgOf(cr), cr.object_key), contentType: cr.content_type || "application/octet-stream", name: cr.file_name || null }; }
  if (DRIVER === "local") {
    const file = path.join(UPLOAD_DIR, id), metaFile = path.join(UPLOAD_DIR, `${id}.json`);
    if (!ID_RE.test(id) || !fs.existsSync(file)) throw new ObjectNotFoundError();
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
    return { buffer: fs.readFileSync(file), contentType: meta.contentType || "application/octet-stream", name: meta.name || null };
  }
  const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
  const r = await objectStorageService.downloadObject(objectFile);
  return { buffer: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get("content-type") || "application/octet-stream", name: null };
}

/** Remove a stored object for good (local disk; previews too). Cloud objects are left to the bucket's lifecycle. Never throws. */
export async function deleteObject(objectPath: string): Promise<boolean> {
  const id = String(objectPath).split("/").pop() || "";
  const cr = await cloudRow(id);
  if (cr) { try { await cloudDelete(cfgOf(cr), cr.object_key); await db.execute(sql`DELETE FROM stored_files WHERE id = ${id}::uuid`); return true; } catch { return false; } }
  if (DRIVER !== "local" || !ID_RE.test(id)) return false;
  let ok = false;
  for (const f of [path.join(UPLOAD_DIR, id), path.join(UPLOAD_DIR, `${id}.json`)]) { try { fs.unlinkSync(f); ok = true; } catch { /* already gone */ } }
  try { for (const f of fs.readdirSync(path.join(UPLOAD_DIR, "previews"))) if (f.startsWith(id)) fs.unlinkSync(path.join(UPLOAD_DIR, "previews", f)); } catch { /* no previews */ }
  return ok;
}

/** Upload policy for the browser (allowed extensions, max size). */
router.get("/upload-policy", async (_req: Request, res: Response) => { res.json(await getUploadPolicy()); });

export default router;
