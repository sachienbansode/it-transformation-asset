import crypto from "node:crypto";

/* Encrypt free text at rest (AES-256-GCM). Key derived from SESSION_SECRET (or CHAT_SECRET when set) — never stored in the DB.
   Stored form: "enc:v1:<iv>.<tag>.<data>" (base64). Plain text from before encryption is returned as is. */
const key = () => crypto.createHash("sha256").update(`ithub-chat:${process.env.CHAT_SECRET || process.env.SESSION_SECRET || process.env.DATABASE_URL || "ithub"}`).digest();
export function sealText(t: string): string {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const d = Buffer.concat([c.update(t, "utf8"), c.final()]);
  return "enc:v1:" + [iv, c.getAuthTag(), d].map(x => x.toString("base64")).join(".");
}
export function openText(t: string | null | undefined): string {
  if (!t) return "";
  if (!t.startsWith("enc:v1:")) return t;
  try {
    const [iv, tag, d] = t.slice(7).split(".").map(x => Buffer.from(x, "base64"));
    const c = crypto.createDecipheriv("aes-256-gcm", key(), iv); c.setAuthTag(tag);
    return Buffer.concat([c.update(d), c.final()]).toString("utf8");
  } catch { return "[message cannot be decrypted]"; }
}
export const fingerprint = (t: string) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 12);
