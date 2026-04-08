import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aibomEntriesTable = pgTable("aibom_entries", {
  id: serial("id").primaryKey(),
  componentId: text("component_id").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(), // LLM, ML Model, Chatbot, RPA, Analytics
  provider: text("provider").notNull(),
  useCase: text("use_case"),
  dataUsed: text("data_used"),
  riskLevel: text("risk_level").notNull(), // High, Medium, Low
  complianceStatus: text("compliance_status").notNull(), // Compliant, Review Needed, Non-Compliant
  governanceReviewDate: text("governance_review_date"),
  comments: text("comments"),
  createdBy: text("created_by"),
  modifiedBy: text("modified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAibomEntrySchema = createInsertSchema(aibomEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAibomEntry = z.infer<typeof insertAibomEntrySchema>;
export type AibomEntry = typeof aibomEntriesTable.$inferSelect;
