/** ITH-128 — this client's own names (Admin › Settings › Branding); never a built-in company name. */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
export async function getBrand(): Promise<{ appName: string; company: string; tagline: string }> {
  try {
    const r: any = await db.execute(sql`SELECT key, value FROM settings WHERE key IN ('app_name', 'company_name', 'app_tagline')`);
    const m: any = Object.fromEntries(((r.rows ?? r) as any[]).map(x => [x.key, x.value]));
    const tag = String(m.app_tagline || "");
    return { appName: String(m.app_name || "IT Hub"), tagline: tag, company: String(m.company_name || (tag.includes("—") ? tag.split("—").pop()!.trim() : "")) };
  } catch { return { appName: "IT Hub", company: "", tagline: "" }; }
}
