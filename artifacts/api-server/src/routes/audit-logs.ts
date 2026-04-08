import { Router } from "express";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { desc, eq, and, gte } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";

const router = Router();

export async function logAudit(params: {
  entityType: string;
  entityId?: number;
  action: string;
  performedBy?: string;
  summary: string;
  oldValues?: unknown;
  newValues?: unknown;
}) {
  await db.insert(auditLogsTable).values({
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    performedBy: params.performedBy,
    summary: params.summary,
    oldValues: params.oldValues as any,
    newValues: params.newValues as any,
  });
}

export async function getPerformedBy(userId?: number): Promise<string> {
  if (!userId) return "System";
  const [u] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  return u ? `${u.name} <${u.email}>` : String(userId);
}

router.get("/audit-logs", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { entityType, page = "1", limit = "50", days = "30" } = req.query as Record<string, string>;
  const limitNum = Math.min(100, parseInt(limit, 10) || 50);
  const offset = (parseInt(page, 10) - 1) * limitNum;

  const since = new Date();
  since.setDate(since.getDate() - (parseInt(days, 10) || 30));

  let logs = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.performedAt))
    .limit(limitNum + 1)
    .offset(offset);

  if (entityType && entityType !== "all") {
    logs = await db
      .select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.entityType, entityType))
      .orderBy(desc(auditLogsTable.performedAt))
      .limit(limitNum + 1)
      .offset(offset);
  }

  const hasMore = logs.length > limitNum;
  res.json({ logs: logs.slice(0, limitNum), hasMore, page: parseInt(page, 10) });
});

export default router;
