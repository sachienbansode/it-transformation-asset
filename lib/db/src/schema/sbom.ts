import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sbomEntriesTable = pgTable("sbom_entries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version"),
  licenseType: text("license_type"),
  cve: text("cve"),
  severity: text("severity"),           // CVSS score or label: Critical/High/Medium/Low
  purl: text("purl"),                   // Package URL e.g. pkg:npm/lodash@4.17.21
  supplier: text("supplier"),           // Vendor / package supplier
  lastScan: text("last_scan"),          // Date of last scan
  usedIn: text("used_in"),              // Which apps/services use this
  riskLevel: text("risk_level").notNull(),
  actionRequired: text("action_required"),
  comments: text("comments"),           // Analyst notes
  createdBy: text("created_by"),
  modifiedBy: text("modified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSbomEntrySchema = createInsertSchema(sbomEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSbomEntry = z.infer<typeof insertSbomEntrySchema>;
export type SbomEntry = typeof sbomEntriesTable.$inferSelect;
