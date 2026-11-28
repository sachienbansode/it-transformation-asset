/** 2.20 (ITH-208) — modules can be switched off by the Super Admin (Admin › Settings › Modules). A switched-off module
 *  is gone for everyone, Super Admin included: not in the menu, and its API answers 403, whatever the roles say.
 *  Data is kept; switching it back on restores everything. The device agent keeps reporting either way. */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const MODULES = [
  { key: "drishti", label: "IT – Drishti", what: "Executive dashboard, master checklist, roadmap, retirements, application inventory, AI / software BOM, PPT reports" },
  { key: "performance", label: "Performance (KPIs)", what: "KPI dashboard, KPI management, targets and approvals" },
  { key: "assets", label: "IT Assets", what: "Asset registry, vendors, licences, contracts, handovers, device health, device policy, software, maintenance, physical audit, My Assets / My Device" },
  { key: "itsm", label: "ITSM", what: "Incidents, service requests, problems, changes, knowledge base, SLAs, approvals, workflows, ITSM setup" },
  { key: "chats", label: "Chats & remote support", what: "IT support chats, direct chats, screen sessions" },
  { key: "audit", label: "Audit & Compliance", what: "Audits, evidence library, auditor portal" },
  { key: "policies", label: "Policies & Consent", what: "Policy register, My Policies, acceptance tracking and the access lock for overdue mandatory policies" },
] as const;
export type ModuleKey = typeof MODULES[number]["key"];

/** API path (after /api) → module */
const PATHS: [RegExp, ModuleKey][] = [
  [/^\/(dashboard|checklist|roadmap|retirements|applications|aibom|sbom|reports)(\/|$)/, "drishti"],
  [/^\/kpi/, "performance"],
  [/^\/(assets?(-|\/|$)|maintenance-records|my-assets|my-devices|device-policy|software)/, "assets"],
  [/^\/(incidents|problems|changes|service-requests|itsm|knowledge-base|sla-policies|approval|approvals|my-approvals|request-tasks|ticket-)/, "itsm"],
  [/^\/(chats?(-|\/|$)|my-it-chats)/, "chats"],
  [/^\/(compliance|auditor-)/, "audit"],
  [/^\/(polic|my-policies)/, "policies"],
];
export const moduleOfPath = (p: string): ModuleKey | null => PATHS.find(([re]) => re.test(p))?.[1] ?? null;

let cache: { at: number; off: Set<string> } | null = null;
export async function disabledModules(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < 15_000) return cache.off;
  const r: any = await db.execute(sql`SELECT value FROM settings WHERE key = 'modules.disabled'`).catch(() => ({ rows: [] }));
  let v: any = (r.rows ?? r)[0]?.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = []; } }
  cache = { at: Date.now(), off: new Set(Array.isArray(v) ? v.filter((k: string) => MODULES.some(m => m.key === k)) : []) };
  return cache.off;
}
export const clearModulesCache = () => { cache = null; };
export async function moduleOn(k: ModuleKey) { return !(await disabledModules()).has(k); }
