import { pgTable, text, serial, boolean, integer, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Financial Years ────────────────────────────────────────────────────────
export const kpiYearsTable = pgTable("kpi_years", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),           // e.g. "FY 2026-27"
  startDate: date("start_date").notNull(),   // e.g. "2026-04-01"
  endDate: date("end_date").notNull(),       // e.g. "2027-03-31"
  isActive: boolean("is_active").notNull().default(true),
  isCurrent: boolean("is_current").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKpiYearSchema = createInsertSchema(kpiYearsTable).omit({ id: true, createdAt: true });
export type InsertKpiYear = z.infer<typeof insertKpiYearSchema>;
export type KpiYear = typeof kpiYearsTable.$inferSelect;

// ─── KPI Categories ─────────────────────────────────────────────────────────
export const kpiCategoriesTable = pgTable("kpi_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),              // e.g. "Run", "Change", "Transform"
  description: text("description"),
  color: text("color"),                      // hex or tailwind color hint
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKpiCategorySchema = createInsertSchema(kpiCategoriesTable).omit({ id: true, createdAt: true });
export type InsertKpiCategory = z.infer<typeof insertKpiCategorySchema>;
export type KpiCategory = typeof kpiCategoriesTable.$inferSelect;

// ─── KPI Definitions ────────────────────────────────────────────────────────
export const kpisTable = pgTable("kpis", {
  id: serial("id").primaryKey(),
  yearId: integer("year_id").notNull(),      // FK → kpi_years.id
  type: text("type").notNull(),              // "CTO" | "Team"
  name: text("name").notNull(),
  description: text("description"),
  categoryId: integer("category_id"),        // FK → kpi_categories.id
  weightage: numeric("weightage", { precision: 5, scale: 2 }), // 0-100
  metric: text("metric"),                    // e.g. "% uptime", "count", "score"
  unit: text("unit"),                        // e.g. "%", "days", "₹ Lakhs"
  owner: text("owner"),                      // team lead / manager name
  ownerEmail: text("owner_email"),
  businessUnit: text("business_unit"),
  status: text("status").notNull().default("Draft"),  // Draft | Pending | Approved | Active | Closed
  approvalRequired: boolean("approval_required").notNull().default(false),
  createdBy: integer("created_by"),          // FK → users.id
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKpiSchema = createInsertSchema(kpisTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKpi = z.infer<typeof insertKpiSchema>;
export type Kpi = typeof kpisTable.$inferSelect;

// ─── KPI Targets (Annual + Quarterly) ───────────────────────────────────────
export const kpiTargetsTable = pgTable("kpi_targets", {
  id: serial("id").primaryKey(),
  kpiId: integer("kpi_id").notNull(),        // FK → kpis.id
  yearId: integer("year_id").notNull(),      // FK → kpi_years.id
  annualTarget: numeric("annual_target", { precision: 15, scale: 4 }),
  q1Target: numeric("q1_target", { precision: 15, scale: 4 }),
  q2Target: numeric("q2_target", { precision: 15, scale: 4 }),
  q3Target: numeric("q3_target", { precision: 15, scale: 4 }),
  q4Target: numeric("q4_target", { precision: 15, scale: 4 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKpiTargetSchema = createInsertSchema(kpiTargetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKpiTarget = z.infer<typeof insertKpiTargetSchema>;
export type KpiTarget = typeof kpiTargetsTable.$inferSelect;

// ─── KPI Actuals (Quarterly Performance Updates) ────────────────────────────
export const kpiActualsTable = pgTable("kpi_actuals", {
  id: serial("id").primaryKey(),
  kpiId: integer("kpi_id").notNull(),
  yearId: integer("year_id").notNull(),
  quarter: integer("quarter").notNull(),     // 1, 2, 3, 4
  actualValue: numeric("actual_value", { precision: 15, scale: 4 }),
  score: numeric("score", { precision: 5, scale: 2 }),       // auto or overridden
  scoreOverride: boolean("score_override").notNull().default(false),
  comments: text("comments"),
  evidenceUrl: text("evidence_url"),
  evidenceFileName: text("evidence_file_name"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKpiActualSchema = createInsertSchema(kpiActualsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKpiActual = z.infer<typeof insertKpiActualSchema>;
export type KpiActual = typeof kpiActualsTable.$inferSelect;

// ─── KPI Approvals ───────────────────────────────────────────────────────────
export const kpiApprovalsTable = pgTable("kpi_approvals", {
  id: serial("id").primaryKey(),
  kpiId: integer("kpi_id").notNull(),
  requestedBy: integer("requested_by"),
  reviewedBy: integer("reviewed_by"),
  status: text("status").notNull().default("Pending"), // Pending | Approved | Rejected
  comments: text("comments"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const insertKpiApprovalSchema = createInsertSchema(kpiApprovalsTable).omit({ id: true, requestedAt: true });
export type InsertKpiApproval = z.infer<typeof insertKpiApprovalSchema>;
export type KpiApproval = typeof kpiApprovalsTable.$inferSelect;

// ─── KPI Module Settings ─────────────────────────────────────────────────────
export const kpiSettingsTable = pgTable("kpi_settings", {
  id: serial("id").primaryKey(),
  approvalEnabled: boolean("approval_enabled").notNull().default(false),
  scoringModel: text("scoring_model").notNull().default("percentage"), // "percentage" | "points" | "rag"
  defaultWeightageType: text("default_weightage_type").notNull().default("equal"), // "equal" | "manual"
  allowCtoOverride: boolean("allow_cto_override").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KpiSettings = typeof kpiSettingsTable.$inferSelect;
