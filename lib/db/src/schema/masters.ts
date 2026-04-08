import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mastersTable = pgTable("masters", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // vendor, business, category, hosting, criticality, license_type, data_classification, priority, status_checklist, phase, retirement_reason, ai_type, risk_level, compliance_status, support_status
  key: text("key").notNull(),
  label: text("label").notNull(),
  color: text("color"), // optional badge color hint e.g. "red","green","yellow","blue","orange","purple"
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMasterSchema = createInsertSchema(mastersTable).omit({ id: true, createdAt: true });
export type InsertMaster = z.infer<typeof insertMasterSchema>;
export type Master = typeof mastersTable.$inferSelect;
