import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/** r98 — users keep the department NAME as shown in Masters (e.g. "Technology"), whatever was typed or sent:
 *  a master key ("it") or a name in any case ("technology") becomes the master's name; an unknown value is Title Cased. */
export async function deptLabel(v: string | null | undefined): Promise<string | null> {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const r: any = await db.execute(sql`SELECT label FROM masters WHERE category = 'department' AND (lower(key) = lower(${s}) OR lower(label) = lower(${s})) ORDER BY is_active DESC, id LIMIT 1`);
  const hit = (r.rows ?? r)[0]?.label;
  if (hit) return hit;
  const t: any = await db.execute(sql`SELECT public.ithub_title_case(${s}) AS t`).catch(() => null);
  return (t?.rows ?? t)?.[0]?.t || s;
}
