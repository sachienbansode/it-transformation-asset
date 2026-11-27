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
export type StoreCfg = { provider: "none" | "s3" | "azure"; bucket?: string; region?: string; prefix?: string; endpoint?: string; account?: string; container?: string; auth?: "managed-identity" | "key" | "sas"; root?: string };

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

/* ── Azure Blob — 2.14: managed identity of the VM (recommended, no secret), storage account key, or container SAS ──
 *   managed-identity: the VM's identity needs the role "Storage Blob Data Contributor" on the storage account
 *   key:  AZURE_STORAGE_KEY in the server settings file (Shared Key signing)
 *   sas:  FILE_STORAGE_AZURE_SAS (or the older RECORDINGS_AZURE_SAS) in the server settings file
 */
let miToken: { token: string; exp: number } | null = null;
async function azureToken() {
  if (miToken && miToken.exp - Date.now() > 5 * 60_000) return miToken.token;
  const cid = process.env.AZURE_CLIENT_ID ? `&client_id=${encodeURIComponent(process.env.AZURE_CLIENT_ID)}` : "";
  const r = await fetch(`http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=${encodeURIComponent("https://storage.azure.com/")}${cid}`, { headers: { Metadata: "true" }, signal: AbortSignal.timeout(3000) }).catch(() => null);
  if (!r || !r.ok) throw new Error("No managed identity on this server — turn on the VM's system-assigned identity (Azure Portal › VM › Identity) and give it the role Storage Blob Data Contributor on the storage account");
  const j: any = await r.json(); miToken = { token: j.access_token, exp: Number(j.expires_on) * 1000 }; return miToken.token;
}
export const azureAuth = (c: StoreCfg) => c.auth || (process.env.FILE_STORAGE_AZURE_SAS || process.env.RECORDINGS_AZURE_SAS ? "sas" : process.env.AZURE_STORAGE_KEY ? "key" : "managed-identity");
function sharedKey(c: StoreCfg, method: string, url: URL, headers: Record<string, string>, len: number) {
  const key = process.env.AZURE_STORAGE_KEY || ""; if (!key) throw new Error("Set AZURE_STORAGE_KEY (storage account key) in the server settings file, or use the managed identity");
  const h = (n: string) => headers[n] || "";
  const canonHeaders = Object.keys(headers).filter(k => k.startsWith("x-ms-")).sort().map(k => `${k}:${headers[k]}`).join("\n");
  const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `\n${k.toLowerCase()}:${v}`).join("");
  const canonRes = `/${c.account}${url.pathname}${params}`;
  const toSign = [method, "", "", len ? String(len) : "", "", h("content-type"), "", "", "", "", "", "", canonHeaders, canonRes].join("\n");
  return `SharedKey ${c.account}:${crypto.createHmac("sha256", Buffer.from(key, "base64")).update(toSign, "utf8").digest("base64")}`;
}
async function azureReq(method: "PUT" | "GET" | "DELETE" | "HEAD", c: StoreCfg, path: string, query: string, body?: Buffer, extra: Record<string, string> = {}) {
  if (!c.account || !c.container) throw new Error("Set the storage account and container");
  const origin = c.endpoint ? c.endpoint.replace(/\/$/, "") : `https://${c.account}.blob.core.windows.net`;
  const mode = azureAuth(c);
  const url = new URL(`${origin}${path}${query ? `?${query}` : ""}`);
  const headers: Record<string, string> = { "x-ms-version": "2021-08-06", "x-ms-date": new Date().toUTCString(), ...extra };
  if (mode === "sas") {
    const sas = String(process.env.FILE_STORAGE_AZURE_SAS || process.env.RECORDINGS_AZURE_SAS || "").replace(/^\?/, "");
    if (!sas) throw new Error("Set FILE_STORAGE_AZURE_SAS (a SAS token for the container) in the server settings file, or use the managed identity");
    for (const [k, v] of new URLSearchParams(sas)) url.searchParams.append(k, v);
  } else if (mode === "key") headers.authorization = sharedKey(c, method, url, headers, body?.length || 0);
  else headers.authorization = `Bearer ${await azureToken()}`;
  return fetch(url, { method, headers, body: body as any, signal: AbortSignal.timeout(120_000) });
}
async function azure(method: "PUT" | "GET" | "DELETE", c: StoreCfg, key: string, body?: Buffer) {
  const extra: Record<string, string> = method === "PUT" ? { "x-ms-blob-type": "BlockBlob", "content-type": "application/octet-stream" } : {};
  const r = await azureReq(method, c, `/${enc(c.container!)}/${keyPath(key)}`, "", body, extra);
  if (!r.ok && !(method === "DELETE" && r.status === 404)) throw new Error(`Azure Blob ${method} failed (${r.status}): ${azureWhy(r.status, await r.text(), azureAuth(c))}`);
  return method === "GET" ? Buffer.from(await r.arrayBuffer()) : null;
}
function azureWhy(status: number, text: string, mode = "") {
  const code = (text.match(/<Code>([^<]+)<\/Code>/) || [])[1] || "";
  if (status === 403 && code === "AuthorizationFailure") return "AuthorizationFailure — the storage account firewall blocked this server. In the storage account › Networking allow the server: if the VM is in the same Azure region, add its virtual network / subnet (Virtual networks › Add existing) — an IP rule does not work within the same region; otherwise add the server's outbound IP";
  if (status === 403 && code === "AuthenticationFailed") return mode === "key" ? "AuthenticationFailed — the storage account key is wrong (copy key1 again into AZURE_STORAGE_KEY and restart IT Hub)" : mode === "sas" ? "AuthenticationFailed — the SAS is wrong or expired" : "AuthenticationFailed";
  if (status === 403 && code === "KeyBasedAuthenticationNotPermitted") return "Storage account key access is turned off — Storage account › Configuration › Allow storage account key access: Enabled";
  if (status === 403 && code === "AuthorizationPermissionMismatch") return mode === "managed-identity" ? "The VM's managed identity has no access — give it the role Storage Blob Data Contributor on the storage account (wait ~5 minutes)" : mode === "sas" ? "The SAS is missing a permission (needs read, add, create, write, delete, list)" : code;
  if (status === 404 && /ContainerNotFound/.test(code)) return "ContainerNotFound — click Save & set up storage to create it";
  return code || text.slice(0, 200);
}
/** Create the container if it is missing (managed identity or account key; a container SAS cannot create containers). */
export async function ensureContainer(c: StoreCfg): Promise<"created" | "exists" | "skipped"> {
  if (c.provider !== "azure") return "skipped";
  if (azureAuth(c) === "sas") return "skipped";
  if (!/^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/.test(c.container || "")) throw new Error("Container name: 3–63 lowercase letters, digits and single hyphens");
  const r = await azureReq("PUT", c, `/${enc(c.container!)}`, "restype=container");
  if (r.status === 201) return "created";
  if (r.status === 409) return "exists";
  throw new Error(`Could not create the container (${r.status}): ${azureWhy(r.status, await r.text(), azureAuth(c))}`);
}

const call = (m: "PUT" | "GET" | "DELETE", c: StoreCfg, key: string, body?: Buffer) => c.provider === "s3" ? s3(m, c, key, body) : c.provider === "azure" ? azure(m, c, key, body) : Promise.reject(new Error("Cloud file storage is not configured"));
export const fullKey = (c: StoreCfg, name: string) => `${String(c.prefix || "it-hub/recordings").replace(/^\/+|\/+$/g, "")}/${name}`;
export async function putObject(c: StoreCfg, key: string, data: Buffer) { await call("PUT", c, key, data); }
export async function getObject(c: StoreCfg, key: string) { return (await call("GET", c, key)) as Buffer; }
export async function deleteObject(c: StoreCfg, key: string) { await call("DELETE", c, key); }
export function storeConfigured(c: StoreCfg | null | undefined): c is StoreCfg {
  return !!c && ((c.provider === "s3" && !!c.bucket && !!c.region) || (c.provider === "azure" && !!c.account && !!c.container));
}
export const storeLabel = (c: StoreCfg) => c.provider === "s3" ? `Amazon S3 (${c.bucket}, ${c.region})` : c.provider === "azure" ? `Azure Blob (${c.account}/${c.container})` : "not configured";
