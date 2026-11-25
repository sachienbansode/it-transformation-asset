import { pgTable, text, serial, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  userType: text("user_type").notNull().default("internal"),
  role: text("role").notNull().default("user"),
  department: text("department"),
  designation: text("designation"),
  reportingManagerId: integer("reporting_manager_id"),   // ITH-109: approvals by the reporting manager
  employeeCode: text("employee_code"),
  mobile: text("mobile"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"),
  mfaMethod: text("mfa_method").notNull().default("totp"),       // totp (authenticator app) | email (code by email)
  mustChangePassword: boolean("must_change_password").notNull().default(false),   // r94: temporary password → change at next sign-in
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  passwordHistory: jsonb("password_history").$type<string[]>().notNull().default([]),   // r99: hashes of the last N passwords (policy)
  authMethod: text("auth_method").notNull().default("password"),   // r98: password (IT Hub) | m365 (Microsoft) — Super Admin may use both
  azureId: text("azure_id"),
  isActive: boolean("is_active").notNull().default(true),
  status: text("status").notNull().default("active"),
  photoUrl: text("photo_url"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  identitySource: text("identity_source").notNull().default("local"), // local | central (Ashika Portal SSO)
  centralSub: text("central_sub"),
  centralRole: text("central_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
