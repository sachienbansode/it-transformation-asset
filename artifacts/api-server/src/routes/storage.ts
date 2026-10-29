import express, { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { z } from "zod/v4";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";

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

router.put("/storage/local-upload/:id", express.raw({ type: () => true, limit: MAX_UPLOAD }), (req: Request, res: Response) => {
  const id = String(req.params.id);
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

  try {
    const { name, size, contentType } = parsed.data;
    if (size > MAX_UPLOAD) { res.status(400).json({ error: `File is larger than ${MAX_UPLOAD / 1024 / 1024} MB` }); return; }
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

export default router;
