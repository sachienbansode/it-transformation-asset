import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
  createdBy: text("created_by"),
  modifiedBy: text("modified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRoadmapItemSchema = createInsertSchema(roadmapItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoadmapItem = z.infer<typeof insertRoadmapItemSchema>;
export type RoadmapItem = typeof roadmapItemsTable.$inferSelect;
