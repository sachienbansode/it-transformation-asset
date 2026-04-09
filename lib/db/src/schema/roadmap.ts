import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Upload Batches (import history) ─────────────────────────────────────────
export const roadmapUploadBatchesTable = pgTable("roadmap_upload_batches", {
  id: serial("id").primaryKey(),
  fileName: text("file_name"),
  fileContent: text("file_content"),
  uploadedBy: text("uploaded_by"),
  rowCount: integer("row_count").notNull().default(0),
  importedCount: integer("imported_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  archivedCount: integer("archived_count").notNull().default(0),
  rowErrors: text("row_errors").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type RoadmapUploadBatch = typeof roadmapUploadBatchesTable.$inferSelect;

// ─── Roadmap Items ────────────────────────────────────────────────────────────
export const roadmapItemsTable = pgTable("roadmap_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  phase: text("phase").notNull(),
  business: text("business").notNull(),
  status: text("status").notNull().default("Planning"),
  priority: text("priority").notNull().default("Medium"),
  budgetLakhs: integer("budget_lakhs").notNull().default(0),
  startMonth: integer("start_month").notNull().default(1),
  endMonth: integer("end_month").notNull().default(6),
  startDate: text("start_date"),
  endDate: text("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  owner: text("owner"),
  uploadBatchId: integer("upload_batch_id"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedBy: text("archived_by"),
  createdBy: text("created_by"),
  modifiedBy: text("modified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRoadmapItemSchema = createInsertSchema(roadmapItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoadmapItem = z.infer<typeof insertRoadmapItemSchema>;
export type RoadmapItem = typeof roadmapItemsTable.$inferSelect;
