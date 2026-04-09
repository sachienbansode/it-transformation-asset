import { pgTable, serial, text, boolean, timestamp, integer, primaryKey } from "drizzle-orm/pg-core";

export const rolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Role = typeof rolesTable.$inferSelect;

export const rolePermissionsTable = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull(),
  module: text("module").notNull(),
  accessLevel: text("access_level").notNull().default("none"),
});
export type RolePermission = typeof rolePermissionsTable.$inferSelect;

export const userRolesTable = pgTable("user_roles", {
  userId: integer("user_id").notNull(),
  roleId: integer("role_id").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  assignedBy: integer("assigned_by"),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.roleId] }),
}));
export type UserRole = typeof userRolesTable.$inferSelect;
