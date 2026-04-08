import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sbomEntriesTable = pgTable("sbom_entries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version"),
  licenseType: text("license_type"), // MIT, Apache, GPL, Commercial, LGPL
  cve: text("cve"),
  lastScan: text("last_scan"),
  usedIn: text("used_in"),
  riskLevel: text("risk_level").notNull(), // Critical, High, Medium, Low
  actionRequired: text("action_required"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSbomEntrySchema = createInsertSchema(sbomEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSbomEntry = z.infer<typeof insertSbomEntrySchema>;
export type SbomEntry = typeof sbomEntriesTable.$inferSelect;
