import * as XLSX from "xlsx";

/*
 * Write values into an existing .xlsx without touching its formatting: the workbook is unzipped, only the
 * <c> elements of the target cells are replaced (keeping each cell's style index), and it is zipped again.
 * Formulas elsewhere (e.g. the auditor's Index sheet) are kept and Excel recalculates them on open.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const colNum = (letters: string) => letters.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const colName = (n: number) => { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export type CellWrite = { row: number; col: number; value: string | number | null; styleFrom?: { row: number; col: number } };

function cellXml(ref: string, style: string | null, value: string | number | null) {
  const s = style ? ` s="${style}"` : "";
  if (value === null || value === "") return `<c r="${ref}"${s}/>`;
  if (typeof value === "number" && isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
}

/** Patch one worksheet XML with cell writes (row/col 0-based). */
function patchSheet(xml: string, writes: CellWrite[]) {
  const sdStart = xml.indexOf("<sheetData"); const sdOpenEnd = xml.indexOf(">", sdStart) + 1;
  let selfClosing = xml[sdOpenEnd - 2] === "/";
  const sdEnd = selfClosing ? sdOpenEnd : xml.indexOf("</sheetData>", sdOpenEnd);
  let body = selfClosing ? "" : xml.slice(sdOpenEnd, sdEnd);
  // parse rows
  type Row = { r: number; open: string; cells: { c: number; xml: string; style: string | null }[] };
  const rows: Row[] = [];
  const rowRe = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g; let m: RegExpExecArray | null;
  while ((m = rowRe.exec(body))) {
    const attrs = m[1]; const r = Number(/\br="(\d+)"/.exec(attrs)?.[1]); const inner = m[3] ?? "";
    const cells: Row["cells"] = []; const cRe = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g; let cm: RegExpExecArray | null;
    while ((cm = cRe.exec(inner))) { const ref = /\br="([A-Z]+)\d+"/.exec(cm[1])?.[1]; if (!ref) continue; cells.push({ c: colNum(ref) - 1, xml: cm[0], style: /\bs="(\d+)"/.exec(cm[1])?.[1] ?? null }); }
    rows.push({ r, open: `<row${attrs.replace(/\s*\/$/, "")}>`, cells });
  }
  const styleAt = (r: number, c: number) => rows.find(x => x.r === r + 1)?.cells.find(x => x.c === c)?.style ?? null;
  for (const w of writes) {
    const rn = w.row + 1; const ref = colName(w.col) + rn;
    let row = rows.find(x => x.r === rn);
    if (!row) { row = { r: rn, open: `<row r="${rn}">`, cells: [] }; rows.push(row); rows.sort((a, b) => a.r - b.r); }
    const existing = row.cells.find(x => x.c === w.col);
    const style = existing?.style ?? (w.styleFrom ? styleAt(w.styleFrom.row, w.styleFrom.col) : null);
    const xmlC = cellXml(ref, style, w.value);
    if (existing) { existing.xml = xmlC; existing.style = style; }
    else { row.cells.push({ c: w.col, xml: xmlC, style }); row.cells.sort((a, b) => a.c - b.c); }
  }
  const newBody = rows.map(r => `${r.open.replace(/\sspans="[^"]*"/, "")}${r.cells.map(c => c.xml).join("")}</row>`).join("");
  // widen the sheet dimension so Excel shows added columns
  let out = selfClosing ? xml.slice(0, sdStart) + `<sheetData>${newBody}</sheetData>` + xml.slice(sdOpenEnd) : xml.slice(0, sdOpenEnd) + newBody + xml.slice(sdEnd);
  const maxC = Math.max(0, ...rows.flatMap(r => r.cells.map(c => c.c))), maxR = Math.max(1, ...rows.map(r => r.r));
  out = out.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${colName(maxC)}${maxR}"/>`);
  return out;
}

/** Fill a workbook (Buffer) — writes grouped by sheet name. Returns a new Buffer. */
export function fillWorkbook(buf: Buffer, writes: Record<string, CellWrite[]>) {
  const cfb = XLSX.CFB.read(buf, { type: "buffer" });
  const get = (p: string) => XLSX.CFB.find(cfb, p);
  const text = (p: string) => { const e: any = get(p); return e ? Buffer.from(e.content).toString("utf8") : null; };
  const put = (p: string, s: string) => { const e: any = get(p); e.content = Buffer.from(s, "utf8"); e.size = e.content.length; };
  const wbXml = text("/xl/workbook.xml")!; const relsXml = text("/xl/_rels/workbook.xml.rels")!;
  const rels = new Map<string, string>(); for (const r of relsXml.matchAll(/<Relationship\b[^>]*>/g)) { const id = /Id="([^"]+)"/.exec(r[0])?.[1], t = /Target="([^"]+)"/.exec(r[0])?.[1]; if (id && t) rels.set(id, t); }
  const sheetPath = new Map<string, string>();
  for (const s of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /name="([^"]+)"/.exec(s[0])?.[1]?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    const rid = /r:id="([^"]+)"/.exec(s[0])?.[1]; const t = rid ? rels.get(rid) : null;
    if (name && t) sheetPath.set(name, "/xl/" + t.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  for (const [sheet, ws] of Object.entries(writes)) {
    const p = sheetPath.get(sheet); if (!p || !ws.length) continue;
    const xml = text(p); if (!xml) continue;
    put(p, patchSheet(xml, ws));
  }
  // drop cached results of formulas so every reader (Excel, LibreOffice, viewers) recalculates the counts
  for (const p of sheetPath.values()) { const xml = text(p); if (xml && xml.includes("<f")) put(p, xml.replace(/(<c\b[^>]*>)(<f\b[^>]*(?:\/>|>[\s\S]*?<\/f>))<v>[\s\S]*?<\/v>/g, "$1$2")); }
  // recalculate formulas (Index counts) when opened
  let wb2 = wbXml;
  if (/<calcPr\b/.test(wb2)) wb2 = wb2.replace(/<calcPr\b([^>]*?)\/?>/, (_m, a) => `<calcPr${String(a).replace(/\s*fullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`);
  else if (wb2.includes("</definedNames>")) wb2 = wb2.replace("</definedNames>", `</definedNames><calcPr fullCalcOnLoad="1"/>`);
  else wb2 = wb2.replace("</sheets>", `</sheets><calcPr fullCalcOnLoad="1"/>`);
  put("/xl/workbook.xml", wb2);
  // drop the cached calculation chain so Excel rebuilds it
  const cc: any = get("/xl/calcChain.xml"); if (cc) { XLSX.CFB.utils.cfb_del(cfb, "/xl/calcChain.xml"); const ct = text("/[Content_Types].xml"); if (ct) put("/[Content_Types].xml", ct.replace(/<Override[^>]*calcChain[^>]*\/>/, "")); const r2 = text("/xl/_rels/workbook.xml.rels"); if (r2) put("/xl/_rels/workbook.xml.rels", r2.replace(/<Relationship[^>]*calcChain[^>]*\/>/, "")); }
  return Buffer.from(XLSX.CFB.write(cfb, { fileType: "zip", type: "buffer", compression: true }) as any);
}
