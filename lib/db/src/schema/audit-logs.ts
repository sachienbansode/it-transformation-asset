import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  action: text("action").notNull(),
  performedBy: text("performed_by"),
  performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
  summary: text("summary"),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
