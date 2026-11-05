import { db, settingsTable, itsmSlaPoliciesTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";

/*
 * ITSM SLA engine.
 *  - Policy = ticket type (Incident / Service Request) + priority → response and resolution targets (hours).
 *  - SLA type "24x7" counts every minute; "Business Hours" counts only the business calendar (IST, Admin › ITSM config).
 *  - The resolution clock stops while the ticket is in a pause status (On Hold, Pending Approval …) and while it is
 *    Resolved (a reopened ticket does not count the time it sat resolved).
 *  - Response = first action by the assigned team (assignment or status change).
 *  - State: On track → At risk (warn %) → Breached; Paused; Met / Breached once done.
 */

export type SlaCalendar = { start: string; end: string; days: number[]; holidays: string[] };
export type SlaConfig = { calendar: SlaCalendar; warnPct: number; pauseStatuses: string[]; policies: any[] };
export type SlaInfo = {
  policy: string | null; type: "24x7" | "Business Hours" | null;
  state: "None" | "On track" | "At risk" | "Breached" | "Paused" | "Met";
  responseState: "None" | "Pending" | "At risk" | "Met" | "Breached";
  resolutionHours: number | null; responseHours: number | null;
  dueAt: string | null; responseDueAt: string | null;
  usedPct: number | null; minutesLeft: number | null; elapsedMins: number | null; pausedMins: number;
};

const IST = 330 * 60_000;
const DEFAULT_CAL: SlaCalendar = { start: "09:30", end: "18:30", days: [1, 2, 3, 4, 5], holidays: [] };
export const TICKET_TYPE: Record<string, string> = { incident: "Incident", request: "Service Request" };
export const DONE_AT: Record<string, string[]> = { incident: ["Resolved", "Closed"], request: ["Completed", "Cancelled", "Rejected"] };

const parse = (v: unknown) => { if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } } return v; };
const hm = (t: string) => { const [h, m] = String(t || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

let cache: { at: number; cfg: SlaConfig } | null = null;
export function clearSlaCache() { cache = null; }

export async function slaConfig(): Promise<SlaConfig> {
  if (cache && Date.now() - cache.at < 30_000) return cache.cfg;
  const rows = await db.select().from(settingsTable).where(like(settingsTable.key, "itsm.%"));
  const get = (k: string) => parse(rows.find(r => r.key === k)?.value);
  const c: any = get("itsm.slaCalendar") || {};
  const calendar: SlaCalendar = {
    start: /^\d{1,2}:\d{2}$/.test(c.start) ? c.start : DEFAULT_CAL.start,
    end: /^\d{1,2}:\d{2}$/.test(c.end) ? c.end : DEFAULT_CAL.end,
    days: Array.isArray(c.days) && c.days.length ? c.days.map(Number).filter((d: number) => d >= 0 && d <= 6) : DEFAULT_CAL.days,
    holidays: Array.isArray(c.holidays) ? c.holidays.map(String) : [],
  };
  if (hm(calendar.end) <= hm(calendar.start)) { calendar.start = DEFAULT_CAL.start; calendar.end = DEFAULT_CAL.end; }
  const warn = Number(get("itsm.slaWarnPercent"));
  const pause = get("itsm.slaPauseStatuses");
  const policies = await db.select().from(itsmSlaPoliciesTable).where(eq(itsmSlaPoliciesTable.isActive, true));
  const cfg = { calendar, warnPct: warn > 0 && warn < 100 ? warn : 75, pauseStatuses: Array.isArray(pause) ? pause.map(String) : ["On Hold", "Pending Approval"], policies };
  cache = { at: Date.now(), cfg };
  return cfg;
}

export function policyFor(cfg: SlaConfig, kind: string, priority: string | null | undefined) {
  return cfg.policies.find(p => p.ticketType === TICKET_TYPE[kind] && p.priority === priority && (p.status || "Active") === "Active") || null;
}
const isBiz = (p: any) => p?.slaType === "Business Hours";

/* ── business-time arithmetic (IST) ─────────────────────────────────────── */
function dayWindow(cal: SlaCalendar, dayStartUtc: number): [number, number] | null {
  const d = new Date(dayStartUtc + IST);
  const ymd = d.toISOString().slice(0, 10);
  if (!cal.days.includes(d.getUTCDay()) || cal.holidays.includes(ymd)) return null;
  return [dayStartUtc + hm(cal.start) * 60_000, dayStartUtc + hm(cal.end) * 60_000];
}
/** UTC ms of 00:00 IST on the IST day containing t. */
function istMidnight(t: number) { const d = new Date(t + IST); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST; }

export function bizMinutes(cal: SlaCalendar, from: Date | number, to: Date | number): number {
  let a = +from, b = +to; if (!(b > a)) return 0;
  let total = 0;
  for (let day = istMidnight(a), n = 0; day < b && n < 3660; day += 86_400_000, n++) {
    const w = dayWindow(cal, day); if (!w) continue;
    const s = Math.max(a, w[0]), e = Math.min(b, w[1]);
    if (e > s) total += e - s;
  }
  return Math.round(total / 60_000);
}
export function addBizMinutes(cal: SlaCalendar, from: Date | number, mins: number): Date {
  let t = +from, left = Math.max(0, mins) * 60_000;
  for (let day = istMidnight(t), n = 0; n < 3660; day += 86_400_000, n++) {
    const w = dayWindow(cal, day); if (!w) continue;
    const s = Math.max(t, w[0]); if (s >= w[1]) continue;
    if (s + left <= w[1]) return new Date(s + left);
    left -= w[1] - s;
  }
  return new Date(t + mins * 60_000);
}
const minsBetween = (p: any, cal: SlaCalendar, a: Date | number, b: Date | number) => isBiz(p) ? bizMinutes(cal, a, b) : Math.max(0, Math.round((+b - +a) / 60_000));
const addMins = (p: any, cal: SlaCalendar, a: Date | number, m: number) => isBiz(p) ? addBizMinutes(cal, a, m) : new Date(+a + m * 60_000);

/** Time the ticket stopped (resolved / completed / closed) — the end of the resolution clock. */
function doneAt(kind: string, t: any): Date | null {
  if (!DONE_AT[kind]?.includes(t.status)) return null;
  return new Date(t.resolvedAt || t.completedAt || t.closedAt || t.updatedAt || Date.now());
}

export function slaInfo(kind: string, t: any, cfg: SlaConfig, now = new Date()): SlaInfo {
  const p = policyFor(cfg, kind, t.priority);
  const none: SlaInfo = { policy: null, type: null, state: "None", responseState: "None", resolutionHours: null, responseHours: null, dueAt: null, responseDueAt: null, usedPct: null, minutesLeft: null, elapsedMins: null, pausedMins: 0 };
  if (!p || !t.createdAt) return none;
  const cal = cfg.calendar, created = new Date(t.createdAt);
  const end = doneAt(kind, t) || now;
  const pausedNow = t.slaPausedAt && !doneAt(kind, t) ? minsBetween(p, cal, t.slaPausedAt, now) : 0;
  const pausedMins = (Number(t.slaPausedMins) || 0) + pausedNow;
  const target = Number(p.resolutionTimeHours) * 60;
  const elapsed = Math.max(0, minsBetween(p, cal, created, end) - pausedMins);
  const usedPct = target > 0 ? Math.round((elapsed / target) * 100) : null;
  const dueAt = addMins(p, cal, created, target + pausedMins);
  const done = !!doneAt(kind, t);
  const state: SlaInfo["state"] = done ? (elapsed <= target ? "Met" : "Breached")
    : elapsed > target ? "Breached" : t.slaPausedAt ? "Paused" : (usedPct ?? 0) >= cfg.warnPct ? "At risk" : "On track";
  const rTarget = Number(p.responseTimeHours) * 60;
  const responseDueAt = addMins(p, cal, created, rTarget);
  const rElapsed = minsBetween(p, cal, created, t.firstResponseAt ? new Date(t.firstResponseAt) : done ? end : now);
  const responseState: SlaInfo["responseState"] = t.firstResponseAt || done ? (rElapsed <= rTarget ? "Met" : "Breached")
    : rElapsed > rTarget ? "Breached" : rTarget > 0 && rElapsed / rTarget * 100 >= cfg.warnPct ? "At risk" : "Pending";
  return { policy: p.name, type: isBiz(p) ? "Business Hours" : "24x7", state, responseState, resolutionHours: Number(p.resolutionTimeHours), responseHours: Number(p.responseTimeHours),
    dueAt: dueAt.toISOString(), responseDueAt: responseDueAt.toISOString(), usedPct, minutesLeft: target - elapsed, elapsedMins: elapsed, pausedMins };
}

/** Columns to store on create / update: policy id, due dates (kept for sorting, reports and older screens). */
export function slaColumns(kind: string, t: any, cfg: SlaConfig) {
  const p = policyFor(cfg, kind, t.priority);
  if (!p) return { slaId: null, slaBreachAt: null, responseDueAt: null };
  const i = slaInfo(kind, t, cfg);
  return { slaId: p.id, slaBreachAt: i.dueAt ? new Date(i.dueAt) : null, responseDueAt: i.responseDueAt ? new Date(i.responseDueAt) : null };
}

/**
 * Pause bookkeeping for a status change. Returns the columns to update:
 *  - into a pause status (or Resolved) → start the pause
 *  - out of it → add the paused minutes and clear the pause
 */
export function pauseColumns(kind: string, old: any, toStatus: string, cfg: SlaConfig, now = new Date()) {
  const stops = (st: string) => cfg.pauseStatuses.includes(st) || (kind === "incident" && st === "Resolved");
  const out: any = {};
  if (stops(toStatus) && !old.slaPausedAt) out.slaPausedAt = now;
  if (!stops(toStatus) && old.slaPausedAt) {
    const p = policyFor(cfg, kind, old.priority);
    out.slaPausedMins = (Number(old.slaPausedMins) || 0) + (p ? minsBetween(p, cfg.calendar, old.slaPausedAt, now) : 0);
    out.slaPausedAt = null;
  }
  return out;
}

/** Human "2h 15m" / "1d 3h" for minutes (negative = overdue). */
export function fmtMins(m: number) {
  const a = Math.abs(Math.round(m)); const d = Math.floor(a / 1440), h = Math.floor((a % 1440) / 60), mm = a % 60;
  return (d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`);
}
