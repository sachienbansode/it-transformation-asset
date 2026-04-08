import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roadmapItemsTable = pgTable("roadmap_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  phase: text("phase").notNull(), // Phase 1: Quick Wins, Phase 2: Core Transformation, Phase 3: Innovation & Scale
  business: text("business").notNull(), // Broking, NBFC, AIF, Both, All
  status: text("status").notNull().default("Planning"), // Planning, In Progress, Completed, Blocked
  priority: text("priority").notNull().default("Medium"),
  budgetLakhs: integer("budget_lakhs").notNull().default(0),
  startMonth: integer("start_month").notNull().default(1),
  endMonth: integer("end_month").notNull().default(6),
  owner: text("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRoadmapItemSchema = createInsertSchema(roadmapItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoadmapItem = z.infer<typeof insertRoadmapItemSchema>;
export type RoadmapItem = typeof roadmapItemsTable.$inferSelect;
