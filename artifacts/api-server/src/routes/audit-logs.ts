import { Router, Request } from "express";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { desc, eq, and, gte, or, ilike, sql, SQL } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";

const router = Router();

export interface AuditContext {
  ip?: string;
  userAgent?: string;
  pageContext?: string;
  timestamp?: string;
}

export function buildContext(req: Request, pageContext?: string): AuditContext {
  return {
    ip: req.ip || (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || "unknown",
    userAgent: (req.headers["user-agent"] as string) || "unknown",
    pageContext: pageContext || req.path,
    timestamp: new Date().toISOString(),
  };
}

import { markAudited } from "../lib/audit-trail";
export async function logAudit(params: {
  entityType: string;
  entityId?: number;
  action: string;
  performedBy?: string;
  summary: string;
  newValues?: unknown;
  context?: AuditContext;
}) {
  markAudited();
  await db.insert(auditLogsTable).values({
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    performedBy: params.performedBy,
    summary: params.summary,
    newValues: params.newValues as any,
    context: params.context as any,
  });
}

export async function getPerformedBy(userId?: number): Promise<string> {
  if (!userId) return "System";
  const [u] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  return u ? `${u.name} <${u.email}>` : String(userId);
}

/** Modules / record types present in the log, with counts (for the filter). */
router.get("/audit-logs/entity-types", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const r: any = await db.execute(sql`SELECT entity_type AS "entityType", count(*)::int AS n FROM audit_logs GROUP BY 1 ORDER BY 1`);
  res.json(r.rows ?? r);
});
/** CSV of the filtered log (max 50,000 rows); the export itself is audited. */
router.get("/audit-logs/export", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const q = req.query as Record<string, string>;
  const since = new Date(); since.setDate(since.getDate() - (parseInt(q.days, 10) || 90));
  const conds: SQL[] = [gte(auditLogsTable.performedAt, since)];
  if (q.entityType && q.entityType !== "all") conds.push(eq(auditLogsTable.entityType, q.entityType));
  if (q.entityId) conds.push(eq(auditLogsTable.entityId, Number(q.entityId)));
  if (q.search?.trim()) { const p = `%${q.search.trim()}%`; conds.push(or(ilike(auditLogsTable.summary, p), ilike(auditLogsTable.performedBy, p), ilike(auditLogsTable.entityType, p), ilike(auditLogsTable.action, p)) as SQL); }
  const rows = await db.select().from(auditLogsTable).where(and(...conds)).orderBy(desc(auditLogsTable.performedAt)).limit(50000);
  const e = (v: any) => { const x = String(v ?? "").replace(/"/g, '""'); return /[,"\n]/.test(x) ? `"${x}"` : x; };
  const ist = (d: any) => d ? new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" }) : "";
  const csv = ["Record,When (IST),Module / record type,Record id,Action,By,Summary,IP,Details",
    ...rows.map(r => [`AUD-${String(r.id).padStart(6, "0")}`, ist(r.performedAt), r.entityType, r.entityId ?? "", r.action, r.performedBy, r.summary, (r.context as any)?.ip || "", r.newValues ? JSON.stringify(r.newValues).slice(0, 2000) : ""].map(e).join(","))].join("\r\n");
  await logAudit({ entityType: "audit_log", action: "export", performedBy: await getPerformedBy((req.session as any)?.userId).catch(() => "Admin"), summary: `Audit log exported (${rows.length} records${q.entityType && q.entityType !== "all" ? `, ${q.entityType}` : ""}, last ${q.days || 90} days)` });
  res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="audit_log_${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("\ufeff" + csv);
});

router.get("/audit-logs", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { entityType, page = "1", limit = "50", days = "90", search = "", entityId = "" } = req.query as Record<string, string>;
  const limitNum = Math.min(100, parseInt(limit, 10) || 50);
  const offset = (parseInt(page, 10) - 1) * limitNum;

  const since = new Date();
  since.setDate(since.getDate() - (parseInt(days, 10) || 90));

  const conditions: SQL[] = [gte(auditLogsTable.performedAt, since)];

  if (entityType && entityType !== "all") {
    conditions.push(eq(auditLogsTable.entityType, entityType));
  }
  if (entityId) conditions.push(eq(auditLogsTable.entityId, Number(entityId)));

  if (search.trim()) {
    const s = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(auditLogsTable.summary, s),
        ilike(auditLogsTable.performedBy, s),
        ilike(auditLogsTable.entityType, s),
        ilike(auditLogsTable.action, s),
      ) as SQL
    );
  }

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(and(...conditions))
    .orderBy(desc(auditLogsTable.performedAt))
    .limit(limitNum + 1)
    .offset(offset);

  const hasMore = logs.length > limitNum;
  res.json({ logs: logs.slice(0, limitNum), hasMore, page: parseInt(page, 10) });
});

export default router;
