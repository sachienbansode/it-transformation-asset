import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";

/*
 * Read-only previews of Office files (Word, Excel, PowerPoint …) as PDF, made with LibreOffice when it is installed on
 * the server (apt-get install libreoffice-writer libreoffice-calc libreoffice-impress). Results are cached by file id.
 * Without LibreOffice the viewer offers a download instead.
 */
export const OFFICE = /\.(docx?|xlsx?|xlsm|pptx?|odt|ods|odp|rtf|csv)$/i;
const CACHE = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"), "previews");
let soffice: string | null | undefined;
function findSoffice() {
  if (soffice !== undefined) return soffice;
  const c = [process.env.SOFFICE_PATH, "/usr/bin/soffice", "/usr/bin/libreoffice", "/usr/lib/libreoffice/program/soffice", "/opt/libreoffice/program/soffice"].filter(Boolean) as string[];
  soffice = c.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || null;
  return soffice;
}
export const previewAvailable = () => !!findSoffice();

let queue: Promise<unknown> = Promise.resolve();   // one conversion at a time
export async function officePreview(key: string, name: string, buf: Buffer): Promise<Buffer> {
  const bin = findSoffice(); if (!bin) throw Object.assign(new Error("Preview is not available on this server — download the file to open it"), { status: 415 });
  fs.mkdirSync(CACHE, { recursive: true });
  const out = path.join(CACHE, `${key.replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`);
  if (fs.existsSync(out)) return fs.readFileSync(out);
  const run = async () => {
    if (fs.existsSync(out)) return fs.readFileSync(out);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pv-"));
    const ext = (name.match(/\.([^.]+)$/)?.[1] || "bin").toLowerCase();
    const src = path.join(dir, `in.${ext}`); fs.writeFileSync(src, buf);
    try {
      await new Promise<void>((ok, ko) => execFile(bin, ["--headless", "--norestore", `-env:UserInstallation=file://${dir}/profile`, "--convert-to", "pdf", "--outdir", dir, src], { timeout: 90_000 }, e => (e ? ko(e) : ok())));
      const pdf = path.join(dir, "in.pdf"); if (!fs.existsSync(pdf)) throw new Error("conversion produced no file");
      fs.copyFileSync(pdf, out); return fs.readFileSync(out);
    } catch (e: any) { throw Object.assign(new Error("Could not make a preview of this file — download it to open"), { status: 422 }); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  const p = queue.then(run, run); queue = p.catch(() => {}); return p as Promise<Buffer>;
}

/** Convert any Office file to PDF (no cache), e.g. generated reports. */
export async function toPdf(name: string, buf: Buffer): Promise<Buffer> {
  const key = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try { return await officePreview(key, name, buf); } finally { try { fs.rmSync(path.join(CACHE, `${key}.pdf`), { force: true }); } catch { /* ignore */ } }
}
