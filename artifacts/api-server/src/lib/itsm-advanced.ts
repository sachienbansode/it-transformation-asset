/** 2.11 — advanced change management (risk score, implementation window, clash check, freeze windows, review after go-live)
 *  and advanced problem management (root cause analysis, known errors published to the knowledge base). */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
class Bad extends Error { status = 400; }
const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v)).slice(0, 4000);

/* ───────────── change risk ───────────── */
export const RISK_QUESTIONS = [
  { key: "users", label: "Who is affected while the change is done?", options: [["One team / a few users", 0], ["One department", 2], ["Whole company", 3], ["Clients, trading or regulatory reporting", 4]] },
  { key: "downtime", label: "Downtime needed", options: [["None", 0], ["Under 30 minutes", 1], ["30 minutes – 2 hours", 2], ["More than 2 hours", 3]] },
  { key: "tested", label: "Tested before production?", options: [["Tested in UAT with sign-off", 0], ["Tested in UAT, no sign-off", 1], ["Not tested", 3]] },
  { key: "rollback", label: "Rollback", options: [["Rollback tested and quick", 0], ["Rollback possible, not tested", 1], ["Hard or no rollback", 3]] },
  { key: "experience", label: "Has the team done this before?", options: [["Yes, successfully", 0], ["Yes, with problems", 1], ["First time", 2]] },
  { key: "vendor", label: "Who does the work?", options: [["Our team only", 0], ["Vendor / third party involved", 1]] },
] as const;
const ENV_POINTS: Record<string, number> = { prod: 2, production: 2, uat: 1, dr: 2 };
const MAX = RISK_QUESTIONS.reduce((n, q) => n + Math.max(...q.options.map(o => o[1] as number)), 0) + 2;

/** Score 0–100 and level from the answers (+ environment). null when not every question is answered. */
export function riskOf(answers: Record<string, string> | null | undefined, environment?: string | null) {
  const a = answers || {};
  let pts = 0;
  for (const q of RISK_QUESTIONS) {
    const o = q.options.find(o => o[0] === a[q.key]); if (!o) return null;
    pts += o[1] as number;
  }
  pts += ENV_POINTS[String(environment || "").toLowerCase()] ?? 0;
  const score = Math.round((100 * pts) / MAX);
  return { score, level: score >= 60 ? "High" : score >= 30 ? "Medium" : "Low" };
}
export function cleanRiskAnswers(v: any) {
  if (v == null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw new Bad("riskAnswers must be the answers to the risk questions");
  const out: Record<string, string> = {};
  for (const q of RISK_QUESTIONS) if (v[q.key] != null && v[q.key] !== "") {
    if (!q.options.some(o => o[0] === v[q.key])) throw new Bad(`Risk question "${q.label}": choose one of the answers`);
    out[q.key] = v[q.key];
  }
  const n = Object.keys(out).length;
  if (n && n < RISK_QUESTIONS.length) throw new Bad(`Answer all ${RISK_QUESTIONS.length} risk questions (${RISK_QUESTIONS.length - n} left)`);
  return out;
}

/* ───────────── implementation window, clashes, freezes ───────────── */
const OPEN_CHANGE = ["Draft", "Open", "Pending Approval", "Approved", "Scheduled", "In Progress"];
export function toTs(v: unknown, label: string) {
  if (v === null || v === "") return null; if (v === undefined) return undefined;
  const d = new Date(String(v)); if (isNaN(+d)) throw new Bad(`${label}: not a valid date and time`); return d;
}
/** Other open changes overlapping the window (same environment, a shared application or the same team) and freeze windows. */
export async function clashesOf(o: { id?: number | null; start: Date | string | null; end: Date | string | null; environment?: string | null; apps?: string[] | null; teamId?: number | null }) {
  if (!o.start || !o.end) return { changes: [], freezes: [] };
  const st = new Date(o.start).toISOString(), en = new Date(o.end).toISOString();
  const rows = rowsOf(await db.execute(sql`SELECT id, change_no AS "changeNo", title, status, type, risk_level AS "riskLevel", environment, affected_apps AS "affectedApps", team_id AS "teamId", assigned_group AS "assignedGroup", planned_start AS "plannedStart", planned_end AS "plannedEnd"
    FROM itsm_changes WHERE is_active AND id <> ${o.id || 0} AND status IN (${sql.join(OPEN_CHANGE.map(x => sql`${x}`), sql`, `)})
      AND planned_start < ${en}::timestamptz AND planned_end > ${st}::timestamptz ORDER BY planned_start`));
  const apps = (o.apps || []).map(a => a.toLowerCase());
  const changes = rows.map(r => {
    const shared = ((r.affectedApps || []) as string[]).filter(a => apps.includes(a.toLowerCase()));
    const sameEnv = !!o.environment && !!r.environment && r.environment.toLowerCase() === o.environment.toLowerCase();
    const sameTeam = !!o.teamId && r.teamId === o.teamId;
    const why = [shared.length ? `same application${shared.length > 1 ? "s" : ""}: ${shared.join(", ")}` : "", sameEnv ? `same environment (${r.environment})` : "", sameTeam ? `same team (${r.assignedGroup})` : ""].filter(Boolean);
    return { ...r, reasons: why, level: shared.length && (sameEnv || !o.environment || !r.environment) ? "Conflict" : why.length ? "Overlap" : "Same time" };
  }).filter(r => r.reasons.length);
  const freezes = rowsOf(await db.execute(sql`SELECT id, name, starts_at AS "startsAt", ends_at AS "endsAt", environment, reason FROM itsm_change_freezes
    WHERE is_active AND starts_at < ${en}::timestamptz AND ends_at > ${st}::timestamptz AND (environment IS NULL OR ${o.environment || null}::text IS NULL OR lower(environment) = lower(${o.environment || ""})) ORDER BY starts_at`));
  return { changes, freezes };
}
const fmt = (d: any) => new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
/** Freeze windows block every change except Emergency. */
export function assertNoFreeze(type: string, freezes: any[]) {
  if (type === "Emergency" || !freezes.length) return;
  const f = freezes[0];
  throw new Bad(`The implementation window falls in the change freeze "${f.name}" (${fmt(f.startsAt)} – ${fmt(f.endsAt)}${f.environment ? `, ${f.environment}` : ""}). Pick another window, or raise it as an Emergency change.`);
}
export const istDate = (d: Date) => new Date(+d + 330 * 60_000).toISOString().slice(0, 10);

/* ───────────── review after go-live (PIR) ───────────── */
export const PIR_OUTCOMES = ["Successful", "Successful with issues", "Failed", "Rolled back"];
export const PIR_FROM = ["Completed", "Failed", "Rolled Back"];
/** Normal and Emergency changes, and any change that failed or was rolled back, need the review before closing. */
export const needsPir = (t: any) => t.type !== "Standard" || ["Failed", "Rolled Back"].includes(t.status);

/* ───────────── problem: root cause analysis ───────────── */
export const RCA_METHODS = ["5 Whys", "Fishbone", "Timeline"];
export const ROOT_CAUSE_CATEGORIES = ["Hardware failure", "Software bug", "Configuration error", "Capacity / performance", "Change-related", "Human error", "Process gap", "Vendor / third party", "Network", "Security", "Data issue", "Environment / facility", "Unknown"];
export const FISHBONE = ["People", "Process", "Technology", "Vendor", "Environment", "Data"];
const list = (v: any, n: number) => (Array.isArray(v) ? v : []).map(x => s(x)).filter(Boolean).slice(0, n);
export function cleanRca(v: any) {
  if (v == null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) throw new Bad("rca must be the analysis (whys, fishbone, timeline)");
  const fishbone: Record<string, string[]> = {};
  for (const k of FISHBONE) { const l = list(v.fishbone?.[k], 10); if (l.length) fishbone[k] = l; }
  const timeline = (Array.isArray(v.timeline) ? v.timeline : []).slice(0, 30).map((t: any) => ({ at: s(t?.at).slice(0, 40), what: s(t?.what) })).filter((t: any) => t.what);
  return { whys: list(v.whys, 7), fishbone, timeline };
}

/* ───────────── known errors → knowledge base ───────────── */
/** Create or refresh the Known Error article for a problem. Returns the article id. */
export async function publishKnownError(problemId: number, by: string) {
  const [p] = rowsOf(await db.execute(sql`SELECT * FROM itsm_problems WHERE id = ${problemId} AND is_active`));
  if (!p) throw new Bad("Problem not found");
  if (s(p.root_cause).length < 10) throw new Bad("Write the root cause first (at least 10 characters)");
  if (s(p.workaround).length < 10) throw new Bad("Write the workaround first (at least 10 characters) — it is what the service desk will use");
  const apps = (p.affected_apps || []) as string[];
  const fixed = ["Resolved", "Closed"].includes(p.status);
  const content = [`Problem ${p.problem_no}${fixed ? " — fixed" : " — open"}`, "", "Symptoms", s(p.description) || p.title, "", "Workaround", s(p.workaround), "", "Root cause", `${p.root_cause_category ? `[${p.root_cause_category}] ` : ""}${s(p.root_cause)}`,
    ...(s(p.permanent_fix) ? ["", "Permanent fix", s(p.permanent_fix)] : [])].join("\n");
  const tags = [p.category, p.subcategory, p.environment, ...apps, "known error"].filter(Boolean).join(", ");
  const title = `Known error: ${p.title}`.slice(0, 200);
  let kbId = p.kb_article_id as number | null;
  if (kbId) {
    const r = rowsOf(await db.execute(sql`UPDATE itsm_knowledge_base SET title = ${title}, content = ${content}, category = 'Known Error', tags = ${tags}, article_type = 'Known Error', problem_id = ${p.id}, symptoms = ${s(p.description) || p.title},
      workaround = ${s(p.workaround)}, root_cause = ${s(p.root_cause)}, permanent_fix = ${s(p.permanent_fix) || null}, status = 'Published', is_active = true, updated_by = ${by}, updated_at = now() WHERE id = ${kbId} RETURNING id`));
    if (!r.length) kbId = null;
  }
  if (!kbId) {
    const [r] = rowsOf(await db.execute(sql`INSERT INTO itsm_knowledge_base (title, content, category, tags, author_name, status, article_type, problem_id, symptoms, workaround, root_cause, permanent_fix, created_by, updated_by)
      VALUES (${title}, ${content}, 'Known Error', ${tags}, ${by.replace(/ <.*>$/, "")}, 'Published', 'Known Error', ${p.id}, ${s(p.description) || p.title}, ${s(p.workaround)}, ${s(p.root_cause)}, ${s(p.permanent_fix) || null}, ${by}, ${by}) RETURNING id`));
    kbId = r.id;
  }
  await db.execute(sql`UPDATE itsm_problems SET known_error = true, known_error_at = coalesce(known_error_at, now()), kb_article_id = ${kbId} WHERE id = ${p.id}`);
  return kbId!;
}

const STOP = new Set("the a an and or of to in on for is are was not with from at by it this that be cannot can't unable error issue problem".split(" "));
/** Known errors that look like the given incident text (for the service desk). */
export async function matchKnownErrors(o: { text?: string; category?: string | null; apps?: string[] }) {
  const words = [...new Set(s(o.text).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)))].slice(0, 12);
  if (!words.length && !o.category && !(o.apps || []).length) return [];
  const rows = rowsOf(await db.execute(sql`SELECT k.id, k.title, k.symptoms, k.workaround, k.permanent_fix AS "permanentFix", k.tags, k.updated_at AS "updatedAt", p.id AS "problemId", p.problem_no AS "problemNo", p.status AS "problemStatus", p.category, p.affected_apps AS "affectedApps"
    FROM itsm_knowledge_base k LEFT JOIN itsm_problems p ON p.id = k.problem_id WHERE k.is_active AND k.article_type = 'Known Error' AND k.status = 'Published' ORDER BY k.updated_at DESC LIMIT 500`));
  const apps = (o.apps || []).map(a => a.toLowerCase());
  return rows.map(r => {
    const hay = `${r.title} ${r.symptoms || ""} ${r.tags || ""}`.toLowerCase();
    const hits = words.filter(w => hay.includes(w)).length;
    const appHit = ((r.affectedApps || []) as string[]).some(a => apps.includes(a.toLowerCase()));
    const catHit = !!o.category && (r.category || "").toLowerCase() === o.category.toLowerCase();
    return { ...r, score: hits * 2 + (appHit ? 3 : 0) + (catHit ? 1 : 0), hits };
  }).filter(r => r.hits >= 1 && r.score >= 3).sort((a, b) => b.score - a.score).slice(0, 5);
}
