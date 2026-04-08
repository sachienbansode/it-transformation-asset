import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const checklistItemsTable = pgTable("checklist_items", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  feature: text("feature").notNull(),
  business: text("business").notNull(), // Broking, NBFC, AIF, Both, All
  currentApp: text("current_app"),
  status: text("status").notNull().default("Not Available"), // Available, Partial, Not Available, Legacy
  priority: text("priority").notNull().default("Medium"), // High, Medium, Low
  comments: text("comments"),
  createdBy: text("created_by"),
  modifiedBy: text("modified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertChecklistItemSchema = createInsertSchema(checklistItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChecklistItem = z.infer<typeof insertChecklistItemSchema>;
export type ChecklistItem = typeof checklistItemsTable.$inferSelect;
