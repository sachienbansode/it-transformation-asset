import crypto from "node:crypto";

/*
 * ITH-088 — where screen-session recordings are kept: Amazon S3 or Azure Blob Storage, set by the administrator.
 * No recording is captured unless one is configured. Files are encrypted by IT Hub before upload (AES-256-GCM,
 * same keys as chats), so the bucket / container only ever holds ciphertext.
 *
 * Settings (Admin › Settings › Chats, stored in the DB — no secrets):
 *   chat.recordingStorage = { provider: "none" | "s3" | "azure", bucket, region, prefix, endpoint?, account, container }
 * Secrets (only in /etc/it-hub.env):
 *   S3:    instance role of the server (recommended on EC2), or RECORDINGS_S3_ACCESS_KEY_ID + RECORDINGS_S3_SECRET_ACCESS_KEY
 *   Azure: RECORDINGS_AZURE_SAS — a SAS token for the container (read, create, write, delete)
 */
export type StoreCfg = { provider: "none" | "s3" | "azure"; bucket?: string; region?: string; prefix?: string; endpoint?: string; account?: string; container?: string };

const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
const hmac = (k: Buffer | string, s: string) => crypto.createHmac("sha256", k).update(s).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const keyPath = (k: string) => k.split("/").map(enc).join("/");

/* ── S3 credentials: env keys, else the EC2 instance role (IMDSv2), cached until shortly before expiry ── */
let roleCreds: { id: string; secret: string; token?: string; exp: number } | null = null;
async function s3Creds() {
  const e = process.env;
  const id = e.RECORDINGS_S3_ACCESS_KEY_ID || e.AWS_ACCESS_KEY_ID, secret = e.RECORDINGS_S3_SECRET_ACCESS_KEY || e.AWS_SECRET_ACCESS_KEY;
  if (id && secret) return { id, secret, token: e.RECORDINGS_S3_SESSION_TOKEN || e.AWS_SESSION_TOKEN };
  if (roleCreds && roleCreds.exp - Date.now() > 5 * 60_000) return roleCreds;
  const md = "http://169.254.169.254/latest";
  const t = await fetch(`${md}/api/token`, { method: "PUT", headers: { "X-aws-ec2-metadata-token-ttl-seconds": "21600" }, signal: AbortSignal.timeout(2000) }).then(r => r.text()).catch(() => "");
  const h = t ? { "X-aws-ec2-metadata-token": t } : {};
  const role = (await fetch(`${md}/meta-data/iam/security-credentials/`, { headers: h, signal: AbortSignal.timeout(2000) }).then(r => r.ok ? r.text() : "").catch(() => "")).split("\n")[0].trim();
  if (!role) throw new Error("No S3 credentials: give the server an IAM role with access to the bucket, or set RECORDINGS_S3_ACCESS_KEY_ID / RECORDINGS_S3_SECRET_ACCESS_KEY in /etc/it-hub.env");
  const j: any = await fetch(`${md}/meta-data/iam/security-credentials/${role}`, { headers: h, signal: AbortSignal.timeout(2000) }).then(r => r.json());
  roleCreds = { id: j.AccessKeyId, secret: j.SecretAccessKey, token: j.Token, exp: new Date(j.Expiration).getTime() };
  return roleCreds;
}
async function s3(method: "PUT" | "GET" | "DELETE", c: StoreCfg, key: string, body?: Buffer) {
  if (!c.bucket || !c.region) throw new Error("Set the S3 bucket and region");
  const cr = await s3Creds();
  const base = c.endpoint ? new URL(c.endpoint) : new URL(`https://${c.bucket}.s3.${c.region}.amazonaws.com`);
  const path = c.endpoint ? `/${enc(c.bucket)}/${keyPath(key)}` : `/${keyPath(key)}`;
  const now = new Date(); const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, ""); const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body || "");
  const headers: Record<string, string> = { host: base.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (method === "PUT") { headers["content-type"] = "application/octet-stream"; headers["x-amz-server-side-encryption"] = "AES256"; }
  if (cr.token) headers["x-amz-security-token"] = cr.token;
  const names = Object.keys(headers).sort();
  const canonical = [method, path, "", names.map(n => `${n}:${headers[n]}`).join("\n") + "\n", names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const kSign = hmac(hmac(hmac(hmac("AWS4" + cr.secret, day), c.region), "s3"), "aws4_request");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${cr.id}/${scope}, SignedHeaders=${names.join(";")}, Signature=${hmac(kSign, toSign).toString("hex")}`;
  const { host: _h, ...send } = headers;
  const r = await fetch(`${base.origin}${path}`, { method, headers: send, body: body as any, signal: AbortSignal.timeout(120_000) });
  if (!r.ok && !(method === "DELETE" && r.status === 404)) throw new Error(`S3 ${method} failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return method === "GET" ? Buffer.from(await r.arrayBuffer()) : null;
}

/* ── Azure Blob with a container SAS token ── */
async function azure(method: "PUT" | "GET" | "DELETE", c: StoreCfg, key: string, body?: Buffer) {
  const sas = String(process.env.RECORDINGS_AZURE_SAS || "").replace(/^\?/, "");
  if (!sas) throw new Error("Set RECORDINGS_AZURE_SAS (a SAS token for the container) in /etc/it-hub.env");
  if (!c.account || !c.container) throw new Error("Set the storage account and container");
  const origin = c.endpoint ? c.endpoint.replace(/\/$/, "") : `https://${c.account}.blob.core.windows.net`;
  const url = `${origin}/${enc(c.container)}/${keyPath(key)}?${sas}`;
  const headers: Record<string, string> = { "x-ms-version": "2021-08-06" };
  if (method === "PUT") { headers["x-ms-blob-type"] = "BlockBlob"; headers["content-type"] = "application/octet-stream"; }
  const r = await fetch(url, { method, headers, body: body as any, signal: AbortSignal.timeout(120_000) });
  if (!r.ok && !(method === "DELETE" && r.status === 404)) throw new Error(`Azure Blob ${method} failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return method === "GET" ? Buffer.from(await r.arrayBuffer()) : null;
}

const call = (m: "PUT" | "GET" | "DELETE", c: StoreCfg, key: string, body?: Buffer) => c.provider === "s3" ? s3(m, c, key, body) : c.provider === "azure" ? azure(m, c, key, body) : Promise.reject(new Error("Recording storage is not configured"));
export const fullKey = (c: StoreCfg, name: string) => `${String(c.prefix || "it-hub/recordings").replace(/^\/+|\/+$/g, "")}/${name}`;
export async function putObject(c: StoreCfg, key: string, data: Buffer) { await call("PUT", c, key, data); }
export async function getObject(c: StoreCfg, key: string) { return (await call("GET", c, key)) as Buffer; }
export async function deleteObject(c: StoreCfg, key: string) { await call("DELETE", c, key); }
export function storeConfigured(c: StoreCfg | null | undefined): c is StoreCfg {
  return !!c && ((c.provider === "s3" && !!c.bucket && !!c.region) || (c.provider === "azure" && !!c.account && !!c.container));
}
export const storeLabel = (c: StoreCfg) => c.provider === "s3" ? `Amazon S3 (${c.bucket}, ${c.region})` : c.provider === "azure" ? `Azure Blob (${c.account}/${c.container})` : "not configured";
