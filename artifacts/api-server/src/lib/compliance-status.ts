import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { STATUSES, CLOSED, TEAM_STATUSES, AUDITOR_STATUSES } from "./compliance-template";

/*
 * Checkpoint status master (cmp_statuses, Admin › Master Data › Audit & Compliance).
 * The exported arrays in compliance-template are refreshed in place from the table (cached 15 s), so every
 * validation, dashboard, export and the auditor portal use the same list. Inactive statuses stay valid for
 * items that already carry them but are not offered in dropdowns.
 */
export type StatusRow = { name: string; stage: "team" | "auditor"; grp: "pending" | "inprog" | "submitted" | "review" | "closed"; color: string; sortOrder: number; isActive: boolean; isSystem: boolean; description: string | null };
let rows: StatusRow[] = [];
let at = 0;
let autoShare = true;
const set = (arr: string[], v: string[]) => { arr.splice(0, arr.length, ...v); };

export async function refreshStatuses(force = false) {
  if (!force && Date.now() - at < 15_000 && rows.length) return rows;
  try {
    const r: any = await db.execute(sql`SELECT name, stage, grp, color, sort_order, is_active, is_system, description FROM cmp_statuses ORDER BY sort_order, name`);
    const list = ((r.rows ?? r) as any[]).map(x => ({ name: x.name, stage: x.stage, grp: x.grp, color: x.color, sortOrder: x.sort_order, isActive: x.is_active, isSystem: x.is_system, description: x.description }));
    if (list.length) {
      rows = list;
      set(STATUSES, list.map(x => x.name));
      set(CLOSED, list.filter(x => x.grp === "closed").map(x => x.name));
      set(TEAM_STATUSES, list.filter(x => x.stage === "team").map(x => x.name));
      set(AUDITOR_STATUSES, list.filter(x => x.stage === "auditor").map(x => x.name));
    }
    const s: any = await db.execute(sql`SELECT value FROM settings WHERE key = 'compliance.autoShareOnSubmit'`);
    const v = ((s.rows ?? s) as any[])[0]?.value;
    autoShare = v === undefined ? true : !(v === false || v === "false");
  } catch { /* table not there yet: keep built-in defaults */ }
  at = Date.now();
  return rows;
}
export const statusRows = () => rows;
export const autoShareOn = () => autoShare;
export const groupOf = (s: string) => rows.find(r => r.name === s)?.grp ?? (CLOSED.includes(s) ? "closed" : s === "Submitted" ? "submitted" : s === "Under Review" ? "review" : s === "Pending" ? "pending" : "inprog");
