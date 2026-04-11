import { Router } from "express";
import { db, notificationsTable, roadmapItemsTable } from "@workspace/db";
import { desc, eq, or, isNull, and, lte } from "drizzle-orm";
import { requireAuth } from "./auth";

const router = Router();

async function seedNotificationsFromRoadmap() {
  try {
    const now = new Date();
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(now.getDate() + 30);

    const items = await db.select().from(roadmapItemsTable).where(
      and(isNull(roadmapItemsTable.archivedAt))
    );

    for (const item of items) {
      if (!item.endDate) continue;
      if (item.status === "Completed") continue;

      const targetDate = new Date(item.endDate);
      if (isNaN(targetDate.getTime())) continue;

      if (targetDate <= now) {
        const existingCheck = await db.select().from(notificationsTable).where(
          and(
            isNull(notificationsTable.userId),
            eq(notificationsTable.title, `Overdue: ${item.title}`)
          )
        ).limit(1);
        if (existingCheck.length === 0) {
          await db.insert(notificationsTable).values({
            userId: null,
            title: `Overdue: ${item.title}`,
            message: `Roadmap item "${item.title}" (${item.business}, ${item.phase}) was due in ${item.targetEndYear}/${item.targetEndMonth} but is still ${item.status}.`,
            type: "warning",
            link: "/roadmap",
          });
        }
      } else if (targetDate <= thirtyDaysLater) {
        const existingCheck = await db.select().from(notificationsTable).where(
          and(
            isNull(notificationsTable.userId),
            eq(notificationsTable.title, `Due Soon: ${item.title}`)
          )
        ).limit(1);
        if (existingCheck.length === 0) {
          await db.insert(notificationsTable).values({
            userId: null,
            title: `Due Soon: ${item.title}`,
            message: `Roadmap item "${item.title}" (${item.business}) is due within 30 days. Current status: ${item.status}.`,
            type: "info",
            link: "/roadmap",
          });
        }
      }
    }
  } catch {}
}

export function seedNotifications() {
  return seedNotificationsFromRoadmap();
}

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).user?.id;
  const items = await db
    .select()
    .from(notificationsTable)
    .where(or(isNull(notificationsTable.userId), eq(notificationsTable.userId, userId)))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  const unreadCount = items.filter(n => !n.read).length;
  res.json({ notifications: items, unreadCount });
});

router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.id, id));
  res.json({ ok: true });
});

router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).user?.id;
  const all = await db.select().from(notificationsTable).where(
    or(isNull(notificationsTable.userId), eq(notificationsTable.userId, userId))
  );
  for (const n of all) {
    if (!n.read) {
      await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.id, n.id));
    }
  }
  res.json({ ok: true });
});

router.delete("/notifications/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(notificationsTable).where(eq(notificationsTable.id, id));
  res.json({ ok: true });
});

export default router;
