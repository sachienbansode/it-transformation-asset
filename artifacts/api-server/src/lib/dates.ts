/*
 * One date format for everything the server writes for people: dd-MMM-yyyy (e.g. 05-Nov-2026),
 * date-times as dd-MMM-yyyy hh:mm AM/PM, in India time. Used by CSV / Excel / Word / PDF exports and emails.
 * Logic and storage keep ISO dates (yyyy-mm-dd); only what people read is formatted.
 */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST = 330 * 60_000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const STAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;
const p2 = (n: number) => String(n).padStart(2, "0");

function parts(v: unknown): { d: Date; dateOnly: boolean } | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(+v) ? null : { d: v, dateOnly: false };
  const s = String(v).trim(); const m = s.match(DATE_ONLY);
  if (m) return { d: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), dateOnly: true };
  if (STAMP.test(s)) { const d = new Date(s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")); return isNaN(+d) ? null : { d, dateOnly: false }; }
  return null;
}
/** 05-Nov-2026 (date-only values are taken as-is; timestamps are shown on their India date) */
export function fmtDate(v: unknown, empty = ""): string {
  const x = parts(v); if (!x) return v ? String(v) : empty;
  const d = x.dateOnly ? x.d : new Date(x.d.getTime() + IST);
  return `${p2(d.getUTCDate())}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}
/** 05-Nov-2026 02:30 PM (India time) */
export function fmtDateTime(v: unknown, empty = ""): string {
  const x = parts(v); if (!x) return v ? String(v) : empty;
  if (x.dateOnly) return fmtDate(v, empty);
  const d = new Date(x.d.getTime() + IST); const h = d.getUTCHours();
  return `${p2(d.getUTCDate())}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()} ${p2(h % 12 || 12)}:${p2(d.getUTCMinutes())} ${h < 12 ? "AM" : "PM"}`;
}
export const nowStamp = () => fmtDateTime(new Date());
export const todayStamp = () => fmtDate(new Date());
/** For row exports: any Date / ISO date / timestamp value becomes dd-MMM-yyyy (with time for timestamps); other values unchanged. */
export function fmtCell(v: unknown): unknown {
  if (v instanceof Date) return fmtDateTime(v);
  if (typeof v === "string" && (DATE_ONLY.test(v.trim()) || STAMP.test(v.trim()))) return DATE_ONLY.test(v.trim()) ? fmtDate(v) : fmtDateTime(v);
  return v;
}
export const fmtRow = <T extends Record<string, any>>(r: T): T => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fmtCell(v)])) as T;
