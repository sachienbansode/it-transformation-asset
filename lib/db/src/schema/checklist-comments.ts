import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const checklistCommentsTable = pgTable("checklist_comments", {
  id: serial("id").primaryKey(),
  checklistItemId: integer("checklist_item_id").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChecklistComment = typeof checklistCommentsTable.$inferSelect;
