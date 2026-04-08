import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const businessUnitsTable = pgTable("business_units", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BusinessUnit = typeof businessUnitsTable.$inferSelect;
