import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/*
 * Department and Location are master-driven drop-downs. Uploads may bring values that are not in the masters yet:
 * they are matched case-insensitively to an existing value, otherwise added to the master list automatically.
 */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "value";

export async function existingMasters(category: string, ex: any = db) {
  const r: any = await ex.execute(sql`SELECT key, label FROM masters WHERE category = ${category}`);
  return new Map<string, string>(((r.rows ?? r) as any[]).flatMap(m => [[String(m.label).toLowerCase(), m.label], [String(m.key).toLowerCase(), m.label]]));
}

/** Values not yet in the master list (for the upload preview). */
export async function missingMasters(category: string, values: (string | null | undefined)[]) {
  const have = await existingMasters(category);
  return [...new Set(values.filter((v): v is string => !!v && !!v.trim()).map(v => v.trim()))].filter(v => !have.has(v.toLowerCase()));
}

/** Ensure every value exists in the master list; returns lower(value) → canonical label. */
export async function ensureMasters(tx: any, category: string, values: (string | null | undefined)[]) {
  const have = await existingMasters(category, tx);
  const added: string[] = [];
  for (const v of new Set(values.filter((x): x is string => !!x && !!x.trim()).map(x => x.trim()))) {
    if (have.has(v.toLowerCase())) continue;
    let key = slug(v), n = 1;
    while (have.has(key)) key = `${slug(v)}_${++n}`;
    await tx.execute(sql`INSERT INTO masters (category, key, label, sort_order, is_active)
      VALUES (${category}, ${key}, ${v}, (SELECT COALESCE(max(sort_order), 0) + 1 FROM masters WHERE category = ${category}), true)`);
    have.set(v.toLowerCase(), v); have.set(key, v); added.push(v);
  }
  return { map: have, added };
}
