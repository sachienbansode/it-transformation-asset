import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const applicationsTable = pgTable("applications", {
  id: serial("id").primaryKey(),
  appId: text("app_id").notNull().unique(),
  name: text("name").notNull(),
  vendor: text("vendor"),
  version: text("version"),
  business: text("business").notNull(),
  category: text("category").notNull(), // Core, Supporting, Integration, Infrastructure
  hosting: text("hosting").notNull(), // On-Premise, Cloud, Hybrid, SaaS
  criticality: text("criticality").notNull(), // Critical, High, Medium, Low
  licenseType: text("license_type"),
  licenseExpiry: text("license_expiry"),
  annualCostLakhs: integer("annual_cost_lakhs"),
  dataClassification: text("data_classification"), // Confidential, Internal, Public
  owner: text("owner"),
  supportStatus: text("support_status").notNull().default("Active"), // Active, Extended, EOL
  comments: text("comments"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertApplicationSchema = createInsertSchema(applicationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;
