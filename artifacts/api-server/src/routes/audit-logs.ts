import { Router, Request } from "express";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { desc, eq, and, gte, or, ilike, SQL } from "drizzle-orm";
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

export async function logAudit(params: {
  entityType: string;
  entityId?: number;
  action: string;
  performedBy?: string;
  summary: string;
  newValues?: unknown;
  context?: AuditContext;
}) {
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

router.get("/audit-logs", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { entityType, page = "1", limit = "50", days = "90", search = "" } = req.query as Record<string, string>;
  const limitNum = Math.min(100, parseInt(limit, 10) || 50);
  const offset = (parseInt(page, 10) - 1) * limitNum;

  const since = new Date();
  since.setDate(since.getDate() - (parseInt(days, 10) || 90));

  const conditions: SQL[] = [gte(auditLogsTable.performedAt, since)];

  if (entityType && entityType !== "all") {
    conditions.push(eq(auditLogsTable.entityType, entityType));
  }

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
