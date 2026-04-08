import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aibomEntriesTable = pgTable("aibom_entries", {
  id: serial("id").primaryKey(),
  componentId: text("component_id").notNull().unique(),
  name: text("name").notNull(),
  version: text("version"),                    // Model / component version
  type: text("type").notNull(),                // LLM, ML Model, Chatbot, RPA, Analytics
  provider: text("provider").notNull(),
  endpoint: text("endpoint"),                  // API endpoint or deployment URL
  useCase: text("use_case"),
  dataUsed: text("data_used"),
  dataClassification: text("data_classification"), // Public, Internal, Confidential, Restricted
  riskLevel: text("risk_level").notNull(),
  complianceStatus: text("compliance_status").notNull(),
  governanceFramework: text("governance_framework"), // ISO 42001, EU AI Act, RBI AI Guidelines
  governanceReviewDate: text("governance_review_date"),
  lastAuditDate: text("last_audit_date"),
  comments: text("comments"),
  createdBy: text("created_by"),
  modifiedBy: text("modified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAibomEntrySchema = createInsertSchema(aibomEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAibomEntry = z.infer<typeof insertAibomEntrySchema>;
export type AibomEntry = typeof aibomEntriesTable.$inferSelect;
