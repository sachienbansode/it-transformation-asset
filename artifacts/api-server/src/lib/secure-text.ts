import crypto from "node:crypto";

/* Encrypt free text at rest (AES-256-GCM). Keys are derived from secrets in the environment — never stored in the DB.
   Stored form: "enc:v1:<iv>.<tag>.<data>" (base64). Plain text from before encryption is returned as is.
   Key rotation (ITH-080): new data is sealed with the first key (CHAT_SECRET, else SESSION_SECRET …). Reading tries every
   key in turn — CHAT_SECRET, CHAT_SECRET_OLD (comma-separated earlier values), SESSION_SECRET, DATABASE_URL — so messages
   written before CHAT_SECRET was added (or before it was changed) stay readable. */
const derive = (s: string) => crypto.createHash("sha256").update(`ithub-chat:${s}`).digest();
let cache: { sig: string; keys: Buffer[] } | null = null;
function keys(): Buffer[] {
  const e = process.env;
  const sig = [e.CHAT_SECRET, e.CHAT_SECRET_OLD, e.SESSION_SECRET, e.DATABASE_URL].join("\u0000");
  if (cache?.sig === sig) return cache.keys;
  const list = [e.CHAT_SECRET, ...(e.CHAT_SECRET_OLD || "").split(","), e.SESSION_SECRET, e.DATABASE_URL, "ithub"].map(x => String(x || "").trim()).filter(Boolean);
  cache = { sig, keys: [...new Set(list)].map(derive) };
  return cache.keys;
}
const key = () => keys()[0];
export function sealText(t: string): string {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const d = Buffer.concat([c.update(t, "utf8"), c.final()]);
  return "enc:v1:" + [iv, c.getAuthTag(), d].map(x => x.toString("base64")).join(".");
}
export function openText(t: string | null | undefined): string {
  if (!t) return "";
  if (!t.startsWith("enc:v1:")) return t;
  const [iv, tag, d] = t.slice(7).split(".").map(x => Buffer.from(x, "base64"));
  for (const k of keys()) {
    try { const c = crypto.createDecipheriv("aes-256-gcm", k, iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString("utf8"); } catch { /* next key */ }
  }
  return "[message cannot be decrypted]";
}
export const fingerprint = (t: string) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 12);
/* Files: iv(12) | tag(16) | data — same keys, AES-256-GCM. */
export function sealBuf(b: Buffer): Buffer {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const d = Buffer.concat([c.update(b), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), d]);
}
export function openBuf(b: Buffer): Buffer {
  let err: any;
  for (const k of keys()) {
    try { const c = crypto.createDecipheriv("aes-256-gcm", k, b.subarray(0, 12)); c.setAuthTag(b.subarray(12, 28)); return Buffer.concat([c.update(b.subarray(28)), c.final()]); } catch (e) { err = e; }
  }
  throw err || new Error("File cannot be decrypted");
}
