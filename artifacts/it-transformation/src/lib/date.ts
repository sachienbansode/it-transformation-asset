/*
 * One date format everywhere in IT Hub: dd-MMM-yyyy (05-Nov-2026); date-times dd-MMM-yyyy hh:mm AM/PM (India time).
 * Values are stored as ISO (yyyy-mm-dd); use these only for what people read (screens, exports).
 */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST = 330 * 60_000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const p2 = (n: number) => String(n).padStart(2, "0");

function toParts(v: unknown): { d: Date; dateOnly: boolean } | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(+v) ? null : { d: v, dateOnly: false };
  if (typeof v === "number") { const d = new Date(v); return isNaN(+d) ? null : { d, dateOnly: false }; }
  const s = String(v).trim(); const m = s.match(DATE_ONLY);
  if (m) return { d: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), dateOnly: true };
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00") : s);
  return isNaN(+d) ? null : { d, dateOnly: false };
}
/** 05-Nov-2026 */
export function fmtDate(v: unknown, empty = "—"): string {
  const x = toParts(v); if (!x) return v ? String(v) : empty;
  const d = x.dateOnly ? x.d : new Date(x.d.getTime() + IST);
  return `${p2(d.getUTCDate())}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}
/** 05-Nov-2026 02:30 PM */
export function fmtDateTime(v: unknown, empty = "—"): string {
  const x = toParts(v); if (!x) return v ? String(v) : empty;
  if (x.dateOnly) return fmtDate(v, empty);
  const d = new Date(x.d.getTime() + IST); const h = d.getUTCHours();
  return `${p2(d.getUTCDate())}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()} ${p2(h % 12 || 12)}:${p2(d.getUTCMinutes())} ${h < 12 ? "AM" : "PM"}`;
}
/** 02:30 PM */
export function fmtTime(v: unknown, empty = "—"): string {
  const x = toParts(v); if (!x) return empty;
  const d = new Date(x.d.getTime() + IST); const h = d.getUTCHours();
  return `${p2(h % 12 || 12)}:${p2(d.getUTCMinutes())} ${h < 12 ? "AM" : "PM"}`;
}
/** Nov-2026 (month labels) */
export function fmtMonth(v: unknown, empty = "—"): string {
  const x = toParts(v); if (!x) return empty;
  const d = x.dateOnly ? x.d : new Date(x.d.getTime() + IST);
  return `${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}
/** Parses what people type or paste: 05-Nov-2026, 5 Nov 2026, 05-11-2026, 05/11/2026, 2026-11-05 → 2026-11-05 ("" if not a date). */
export function parseDateInput(v: unknown): string {
  if (v instanceof Date) return isNaN(+v) ? "" : `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
  const s = String(v ?? "").trim(); if (!s) return "";
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return `${m[1]}-${p2(+m[2])}-${p2(+m[3])}`;
  m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/., ]+(\d{2,4})$/);
  if (m) { const mi = MON.findIndex(x => x.toLowerCase() === m![2].slice(0, 3).toLowerCase()); if (mi >= 0) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${p2(mi + 1)}-${p2(+m[1])}`; } }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); if (m) return `${m[3]}-${p2(+m[2])}-${p2(+m[1])}`;
  return "";
}
/** For downloads (CSV / Excel): ISO dates and timestamps become dd-MMM-yyyy (with time for timestamps); anything else unchanged. */
export function fmtCell(v: unknown): unknown {
  if (v instanceof Date) return fmtDateTime(v, "");
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (DATE_ONLY.test(s)) return fmtDate(s, "");
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/.test(s)) return fmtDateTime(s, "");
  return v;
}
