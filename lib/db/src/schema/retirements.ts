import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const retirementsTable = pgTable("retirements", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id"),
  appName: text("app_name").notNull(),
  business: text("business").notNull(),
  reason: text("reason").notNull(), // Legacy, Duplicate, Cost, Risk
  targetDate: text("target_date"),
  successor: text("successor"),
  migrationEffort: text("migration_effort").notNull(), // Low, Medium, High
  budgetLakhs: integer("budget_lakhs"),
  status: text("status").notNull().default("Planned"), // Planned, In Progress, Completed
  comments: text("comments"),
  createdBy: text("created_by"),
  modifiedBy: text("modified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRetirementSchema = createInsertSchema(retirementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRetirement = z.infer<typeof insertRetirementSchema>;
export type Retirement = typeof retirementsTable.$inferSelect;
