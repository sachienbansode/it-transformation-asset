/** 2.14 (ITH-151) — Admin › Settings › File storage: one cloud storage for all files, container created automatically. Super Admin only. */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { getAccess } from "../lib/rbac";
import { isSuperAdmin } from "../lib/access-model";
import { fileStore, setupAndTest, defaultRoot, FOLDER_LABELS, azureAuth, storeLabel } from "../lib/file-store";
import { storeConfigured, type StoreCfg } from "../lib/object-store";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const fail = (res: Response, code: number, error: string) => res.status(code).json({ error });
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => { try { await fn(req, res); } catch (e: any) { if (!res.headersSent) fail(res, e?.status || 500, e?.message || String(e)); } };
const sa = async (req: Request) => isSuperAdmin(await getAccess(req));
const s = (v: unknown, n = 120) => (typeof v === "string" ? v.trim() : "").slice(0, n);

function clean(b: any): StoreCfg {
  const provider = ["azure", "s3"].includes(b?.provider) ? b.provider : "none";
  const root = s(b?.root, 40).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || defaultRoot();
  if (provider === "azure") {
    const account = s(b.account, 24).toLowerCase(); const container = s(b.container, 63).toLowerCase() || "it-hub";
    if (!/^[a-z0-9]{3,24}$/.test(account)) throw Object.assign(new Error("Storage account: 3–24 lowercase letters and digits (as in the Azure Portal)"), { status: 400 });
    if (!/^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/.test(container)) throw Object.assign(new Error("Container: 3–63 lowercase letters, digits and single hyphens"), { status: 400 });
    const auth = ["managed-identity", "key", "sas"].includes(b.auth) ? b.auth : "managed-identity";
    const endpoint = s(b.endpoint, 200); if (endpoint && !/^https:\/\//.test(endpoint) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(endpoint)) throw Object.assign(new Error("Endpoint must start with https://"), { status: 400 });
    return { provider, account, container, auth, root, ...(endpoint ? { endpoint } : {}) };
  }
  if (provider === "s3") {
    const bucket = s(b.bucket, 63).toLowerCase(); const region = s(b.region, 30);
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || !/^[a-z]{2}-[a-z]+-\d$/.test(region)) throw Object.assign(new Error("S3: give the bucket name and region (e.g. ap-south-1)"), { status: 400 });
    return { provider, bucket, region, root };
  }
  return { provider: "none", root };
}

router.get("/file-storage", requireAuth, wrap(async (req, res) => {
  if (!await sa(req)) return fail(res, 403, "Super Admin only");
  const [row] = rowsOf(await db.execute(sql`SELECT value FROM settings WHERE key = 'storage.config'`));
  const saved: any = row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null;
  const active = await fileStore();
  const counts = rowsOf(await db.execute(sql`SELECT
      (SELECT count(*) FROM stored_files WHERE uploaded)::int AS uploads,
      (SELECT count(*) FROM policy_documents WHERE object_key IS NOT NULL)::int AS policies,
      (SELECT count(*) FROM chat_attachments WHERE coalesce(storage, 'db') <> 'db')::int AS chats`).catch(() => ({ rows: [{}] })))[0];
  return res.json({ config: saved || (active ? { ...active, fromOldSetting: true } : { provider: "none", root: defaultRoot(), container: "it-hub", auth: "managed-identity" }),
    active: active ? storeLabel(active) : null, defaultRoot: defaultRoot(), folders: FOLDER_LABELS,
    server: { sas: !!(process.env.FILE_STORAGE_AZURE_SAS || process.env.RECORDINGS_AZURE_SAS), key: !!process.env.AZURE_STORAGE_KEY, s3keys: !!(process.env.RECORDINGS_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) },
    inCloud: counts });
}));
router.post("/file-storage/test", requireAuth, wrap(async (req, res) => {
  if (!await sa(req)) return fail(res, 403, "Super Admin only");
  const c = req.body?.provider ? clean(req.body) : await fileStore();
  if (!c || c.provider === "none") return res.json({ ok: false, steps: [{ step: "Settings complete", ok: false, detail: "Choose Azure Blob or Amazon S3" }] });
  return res.json(await setupAndTest(c));
}));
router.put("/file-storage", requireAuth, wrap(async (req, res) => {
  if (!await sa(req)) return fail(res, 403, "Super Admin only");
  const c = clean(req.body); const by = await getPerformedBy(Number((req.session as any).userId));
  let result: any = { ok: true, steps: [] };
  if (c.provider !== "none") { result = await setupAndTest(c); if (!result.ok && req.body?.force !== true) return res.status(400).json({ error: "Storage set-up failed — nothing saved. Fix the step marked ✗ and try again.", ...result }); }
  await db.execute(sql`INSERT INTO settings (key, value) VALUES ('storage.config', ${JSON.stringify(c)}::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
  await logAudit({ entityType: "setting", entityId: 0, action: "file_storage", performedBy: by, summary: c.provider === "none" ? "File storage turned off — new files stay on the server" : `File storage set: ${storeLabel(c)}, main folder “${c.root}”${c.provider === "azure" ? `, sign-in ${azureAuth(c)}` : ""}` });
  return res.json({ ...result, saved: true });
}));
export default router;
