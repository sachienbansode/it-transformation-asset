import crypto from "node:crypto";
import { db, settingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/*
 * Browser push notifications (Web Push: RFC 8030 / 8291 aes128gcm / 8292 VAPID) — no external dependency.
 *  - VAPID keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (base64url) from the environment, else generated once and kept in settings.
 *  - Every in-app notification (table notifications) is pushed to the user's subscribed browsers by a small dispatcher,
 *    so all modules get push without changes. Users opt in per device (Profile › Notifications, or the bell).
 */

const b64u = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const rowsOf = (r: any) => (r.rows ?? r) as any[];

let vapid: { publicKey: string; privateKey: crypto.KeyObject } | null = null;
export async function vapidKeys() {
  if (vapid) return vapid;
  let pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    const [r] = await db.select().from(settingsTable).where(eq(settingsTable.key, "push.vapid"));
    let v: any = r?.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
    if (v?.publicKey && v?.privateKey) { pub = v.publicKey; priv = v.privateKey; }
    else {
      const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
      pub = b64u(ecdh.getPublicKey()); priv = b64u(ecdh.getPrivateKey());
      await db.insert(settingsTable).values({ key: "push.vapid", value: JSON.stringify({ publicKey: pub, privateKey: priv }) as any, description: "Web Push VAPID keys (generated; override with VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)" })
        .onConflictDoNothing();
      const [again] = await db.select().from(settingsTable).where(eq(settingsTable.key, "push.vapid"));
      let w: any = again?.value; if (typeof w === "string") w = JSON.parse(w);
      pub = w.publicKey; priv = w.privateKey;
    }
  }
  const P = unb64u(pub!);
  const privateKey = crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: priv!, x: b64u(P.subarray(1, 33)), y: b64u(P.subarray(33, 65)) }, format: "jwk" });
  vapid = { publicKey: pub!, privateKey };
  return vapid;
}

function vapidAuth(endpoint: string, keys: { publicKey: string; privateKey: crypto.KeyObject }) {
  const aud = new URL(endpoint).origin;
  const sub = process.env.VAPID_SUBJECT || `mailto:${process.env.MAIL_FROM || "it-hub@localhost"}`;
  const h = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const c = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })));
  const sig = crypto.sign("sha256", Buffer.from(`${h}.${c}`), { key: keys.privateKey, dsaEncoding: "ieee-p1363" });
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${keys.publicKey}`;
}

/** RFC 8291 payload encryption (aes128gcm, one record). */
export function encryptPayload(payload: Buffer, p256dh: string, auth: string, salt = crypto.randomBytes(16), asKeys?: crypto.ECDH) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const as = asKeys || crypto.createECDH("prime256v1"); if (!asKeys) as.generateKeys();
  const asPub = as.getPublicKey();
  const shared = as.computeSecret(ua);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, secret, Buffer.concat([Buffer.from("WebPush: info\0"), ua, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const ci = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([ci.update(Buffer.concat([payload, Buffer.from([2])])), ci.final(), ci.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(4096, 16); header.writeUInt8(asPub.length, 20);
  return Buffer.concat([header, asPub, body]);
}

export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, msg: { title: string; body?: string; url?: string; tag?: string }) {
  const keys = await vapidKeys();
  const body = encryptPayload(Buffer.from(JSON.stringify(msg).slice(0, 3000), "utf8"), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, { method: "POST", headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal", Authorization: vapidAuth(sub.endpoint, keys) }, body, signal: AbortSignal.timeout(15000) });
  return r.status;
}

/** Push to all of a user's browsers; expired subscriptions (404 / 410) are removed. */
export async function pushToUser(userId: number, msg: { title: string; body?: string; url?: string; tag?: string }) {
  const subs = rowsOf(await db.execute(sql`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}`));
  let sent = 0;
  for (const s of subs) {
    try {
      const st = await sendPush(s, msg);
      if (st === 404 || st === 410) await db.execute(sql`DELETE FROM push_subscriptions WHERE id = ${s.id}`);
      else if (st >= 200 && st < 300) { sent++; await db.execute(sql`UPDATE push_subscriptions SET last_ok_at = now(), failures = 0 WHERE id = ${s.id}`); }
      else await db.execute(sql`UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ${s.id}`);
    } catch { await db.execute(sql`UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ${s.id}`); }
  }
  await db.execute(sql`DELETE FROM push_subscriptions WHERE failures >= 20`);
  return sent;
}

/** Dispatcher: pushes new in-app notifications (all modules) to subscribed users. */
export async function pushNewNotifications() {
  const [en] = rowsOf(await db.execute(sql`SELECT value FROM settings WHERE key = 'push.enabled'`));
  if (en && (en.value === false || en.value === "false")) return 0;
  return db.transaction(async tx => {
    const ok = rowsOf(await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext('push-dispatch')) AS ok`))[0]?.ok;
    if (!ok) return 0;
    const [st] = rowsOf(await tx.execute(sql`SELECT value FROM settings WHERE key = 'push.lastNotificationId'`));
    let last = Number(typeof st?.value === "string" ? JSON.parse(st.value) : st?.value) || 0;
    if (!last) { const [m] = rowsOf(await tx.execute(sql`SELECT coalesce(max(id), 0)::int AS m FROM notifications`)); last = m.m; }
    const [mx] = rowsOf(await tx.execute(sql`SELECT coalesce(max(id), ${last})::int AS m FROM notifications`));
    const rows = rowsOf(await tx.execute(sql`SELECT n.id, n.user_id, n.title, n.message, n.link FROM notifications n
      WHERE n.id > ${last} AND n.id <= ${mx.m} AND n.user_id IN (SELECT user_id FROM push_subscriptions) ORDER BY n.id LIMIT 200`));
    let sent = 0;
    for (const n of rows) sent += await pushToUser(n.user_id, { title: n.title, body: n.message, url: n.link || "/", tag: `n${n.id}` });
    await tx.execute(sql`INSERT INTO settings (key, value) VALUES ('push.lastNotificationId', ${JSON.stringify(rows.length === 200 ? rows[rows.length - 1].id : mx.m)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    return sent;
  });
}
export function startPushDispatcher(everyMs = 15_000) {
  if (process.env.ITSM_MONITOR === "off") return;
  setInterval(() => { pushNewNotifications().catch(e => console.error("push dispatch failed", e)); }, everyMs).unref?.();
}
