/** ITH-113 — minimal SMTP client (no extra package): implicit TLS (465) or STARTTLS (587 / 25), AUTH LOGIN / PLAIN,
 *  HTML body and attachments (MIME, base64). One connection per message; 30-second timeout. */
import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";

export type SmtpConfig = { host: string; port: number; security: "tls" | "starttls" | "none"; user?: string; pass?: string; from: string; fromName?: string; rejectUnauthorized?: boolean };
export type SmtpAttachment = { name: string; content: Buffer; contentType?: string };

class Conn {
  private buf = ""; private waiters: ((line: string) => void)[] = []; private lines: string[] = [];
  constructor(public sock: net.Socket) { this.attach(sock); }
  attach(s: net.Socket) {
    this.sock = s; s.setEncoding("utf8");
    s.on("data", (d: string) => { this.buf += d; let i; while ((i = this.buf.indexOf("\r\n")) >= 0) { const l = this.buf.slice(0, i); this.buf = this.buf.slice(i + 2); this.lines.push(l); this.flush(); } });
  }
  private flush() { while (this.waiters.length && this.lines.length) this.waiters.shift()!(this.lines.shift()!); }
  private line() { return new Promise<string>(r => { this.waiters.push(r); this.flush(); }); }
  /** Read a full (possibly multi-line) reply. */
  async reply(): Promise<{ code: number; text: string }> {
    const out: string[] = [];
    for (;;) { const l = await this.line(); out.push(l.slice(4)); if (l[3] !== "-") return { code: Number(l.slice(0, 3)), text: out.join("\n") }; }
  }
  async cmd(c: string, expect: number[], show = c) {
    this.sock.write(c + "\r\n"); const r = await this.reply();
    if (!expect.includes(r.code)) throw new Error(`SMTP ${show.split(" ")[0]} refused: ${r.code} ${r.text.split("\n")[0]}`);
    return r;
  }
}
const enc = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;
const b64lines = (b: Buffer) => b.toString("base64").replace(/.{1,76}/g, "$&\r\n");
const addr = (s: string) => s.replace(/[<>\r\n]/g, "");

export function buildMime(c: SmtpConfig, to: string[], subject: string, html: string, attachments: SmtpAttachment[] = []) {
  const b = "=_ithub_" + crypto.randomBytes(12).toString("hex"); const domain = c.from.split("@")[1] || "ithub.local";
  const head = [`From: ${c.fromName ? `${enc(c.fromName)} ` : ""}<${addr(c.from)}>`, `To: ${to.map(addr).join(", ")}`, `Subject: ${enc(subject)}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`, "MIME-Version: 1.0"];
  const htmlPart = ["Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64lines(Buffer.from(html, "utf8"))].join("\r\n");
  if (!attachments.length) return [...head, htmlPart].join("\r\n");
  const parts = [`--${b}\r\n${htmlPart}`, ...attachments.map(a => `--${b}\r\nContent-Type: ${a.contentType || "application/octet-stream"}; name="${enc(a.name)}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${enc(a.name)}"\r\n\r\n${b64lines(a.content)}`)];
  return [...head, `Content-Type: multipart/mixed; boundary="${b}"`, "", ...parts, `--${b}--`, ""].join("\r\n");
}

export async function smtpSend(c: SmtpConfig, to: string[], subject: string, html: string, attachments: SmtpAttachment[] = []) {
  if (!c.host || !c.port || !c.from) throw new Error("SMTP is not fully configured (host, port and from address are required)");
  const sni = net.isIP(c.host) ? undefined : c.host;
  const opts = { host: c.host, port: c.port, servername: sni, rejectUnauthorized: c.rejectUnauthorized !== false };
  const sock: net.Socket = c.security === "tls" ? tls.connect(opts) : net.connect({ host: c.host, port: c.port });
  sock.setTimeout(30_000);
  const conn = new Conn(sock);
  const failed = new Promise<never>((_, rej) => { sock.on("error", (e: any) => { const why = ({ ECONNREFUSED: "connection refused (no SMTP service on that port)", ENOTFOUND: "server name not found", ETIMEDOUT: "timed out", ECONNRESET: "connection reset by the server", EHOSTUNREACH: "host unreachable" } as any)[e.code] || String(e.message).replace(/E[A-Z]{4,}/g, "").trim(); rej(new Error(`SMTP connection to ${c.host}:${c.port} failed: ${why}`)); }); sock.on("timeout", () => { sock.destroy(); rej(new Error(`SMTP server ${c.host}:${c.port} did not answer within 30 seconds`)); }); });
  const run = async () => {
    let r = await conn.reply(); if (r.code !== 220) throw new Error(`SMTP greeting: ${r.code} ${r.text}`);
    const me = "ithub.local";
    r = await conn.cmd(`EHLO ${me}`, [250]);
    if (c.security === "starttls") {
      if (!/STARTTLS/i.test(r.text)) throw new Error("The SMTP server does not offer STARTTLS — choose SSL/TLS (port 465) or no encryption");
      await conn.cmd("STARTTLS", [220]);
      sock.removeAllListeners("data");
      const t = tls.connect({ socket: sock, servername: sni, rejectUnauthorized: c.rejectUnauthorized !== false });
      await new Promise<void>((res, rej) => { t.once("secureConnect", () => res()); t.once("error", e => rej(new Error(`STARTTLS failed: ${e.message}`))); });
      conn.attach(t);
      r = await conn.cmd(`EHLO ${me}`, [250]);
    }
    if (c.user) {
      if (/AUTH[^\n]*PLAIN/i.test(r.text)) await conn.cmd(`AUTH PLAIN ${Buffer.from(`\0${c.user}\0${c.pass || ""}`).toString("base64")}`, [235], "AUTH PLAIN");
      else { await conn.cmd("AUTH LOGIN", [334]); await conn.cmd(Buffer.from(c.user).toString("base64"), [334], "AUTH user"); await conn.cmd(Buffer.from(c.pass || "").toString("base64"), [235], "AUTH password"); }
    }
    await conn.cmd(`MAIL FROM:<${addr(c.from)}>`, [250]);
    for (const a of to) await conn.cmd(`RCPT TO:<${addr(a)}>`, [250, 251]);
    await conn.cmd("DATA", [354]);
    const mime = buildMime(c, to, subject, html, attachments).replace(/\r\n\./g, "\r\n..");
    await conn.cmd(`${mime}\r\n.`, [250], "DATA body");
    await conn.cmd("QUIT", [221]).catch(() => {});
    conn.sock.end();
  };
  return Promise.race([run(), failed]);
}
