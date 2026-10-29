import zlib from "zlib";
import type { Writable } from "stream";

/* Minimal streaming ZIP writer (deflate, no external dependency). Files are added one at a time and written straight
   to the response, so memory holds only the current file. Limits: < 4 GB total, < 65 535 entries (no ZIP64). */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function dosTime(d: Date) { return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }

export class ZipStream {
  private offset = 0; private central: Buffer[] = []; private count = 0; private names = new Set<string>();
  constructor(private out: Writable) {}
  private write(b: Buffer) { return new Promise<void>((ok, ko) => { this.out.write(b, e => (e ? ko(e) : ok())); }); }
  /** Unique, safe path inside the zip ("a/b.pdf" → "a/b (2).pdf" when taken) */
  name(path: string) {
    let p = path.replace(/[\\:*?"<>|\u0000-\u001f]+/g, "_").replace(/\/{2,}/g, "/").replace(/^\/+/, "").slice(0, 240);
    if (!this.names.has(p.toLowerCase())) { this.names.add(p.toLowerCase()); return p; }
    const m = p.match(/^(.*?)(\.[^./]+)?$/)!; for (let i = 2; ; i++) { const q = `${m[1]} (${i})${m[2] || ""}`; if (!this.names.has(q.toLowerCase())) { this.names.add(q.toLowerCase()); return q; } }
  }
  /** Adds a file; returns the path actually used (a number is added when the name is taken). */
  async add(path: string, data: Buffer, when = new Date()): Promise<string> {
    const used = this.name(path); const name = Buffer.from(used, "utf8");
    const store = /\.(zip|png|jpe?g|gif|webp|docx|xlsx|pptx|mp4|gz|7z|rar)$/i.test(path) || data.length < 64;
    const body = store ? data : zlib.deflateRawSync(data, { level: 6 });
    const crc = crc32(data); const { time, date } = dosTime(when); const method = store ? 0 : 8;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8); h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10); c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(this.offset, 42);
    this.central.push(Buffer.concat([c, name])); this.count++;
    await this.write(Buffer.concat([h, name])); await this.write(body); this.offset += 30 + name.length + body.length;
    return used;
  }
  async finish() {
    const cd = Buffer.concat(this.central); const e = Buffer.alloc(22);
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(this.count, 8); e.writeUInt16LE(this.count, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(this.offset, 16);
    await this.write(cd); await this.write(e);
  }
}
