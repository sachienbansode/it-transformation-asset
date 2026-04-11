import { Router } from "express";
import { db, checklistCommentsTable, usersTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "./auth";

const router = Router();

router.get("/checklist/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const comments = await db
    .select()
    .from(checklistCommentsTable)
    .where(eq(checklistCommentsTable.checklistItemId, id))
    .orderBy(desc(checklistCommentsTable.createdAt));
  res.json(comments);
});

router.post("/checklist/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const checklistItemId = parseInt(req.params.id, 10);
  const { content } = req.body;
  const userId = (req as any).session?.userId;
  let authorName = "Unknown";
  if (userId) {
    const [u] = await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
    if (u) authorName = u.name || u.email || "Unknown";
  }

  if (!content || !String(content).trim()) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  const [comment] = await db.insert(checklistCommentsTable).values({
    checklistItemId,
    authorName,
    content: String(content).trim(),
  }).returning();

  res.status(201).json(comment);
});

router.delete("/checklist/comments/:commentId", requireAuth, async (req, res): Promise<void> => {
  const commentId = parseInt(req.params.commentId, 10);
  await db.delete(checklistCommentsTable).where(eq(checklistCommentsTable.id, commentId));
  res.json({ ok: true });
});

export default router;
