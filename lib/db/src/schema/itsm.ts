import { sql } from "drizzle-orm";
import { pgTable, text, serial, timestamp, integer, boolean, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const itsmIncidentsTable = pgTable("itsm_incidents", {
  id: serial("id").primaryKey(),
  ticketNo: text("ticket_no").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("Open"),
  priority: text("priority").notNull().default("Medium"),
  severity: text("severity").notNull().default("S3"),
  urgency: text("urgency"),
  impactLevel: text("impact_level"),
  source: text("source"),
  category: text("category"),
  subcategory: text("subcategory"),
  assignedTo: text("assigned_to"),
  assignedGroup: text("assigned_group"),
  reportedBy: text("reported_by"),
  reporterEmail: text("reporter_email"),
  affectedSystem: text("affected_system"),
  slaId: integer("sla_id"),
  slaBreachAt: timestamp("sla_breach_at", { withTimezone: true }),
  problemId: integer("problem_id"),
  resolutionNotes: text("resolution_notes"),
  teamId: integer("team_id"),
  requesterUserId: integer("requester_user_id"),
  expectedClosureDate: date("expected_closure_date", { mode: "string" }),
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const itsmProblemsTable = pgTable("itsm_problems", {
  id: serial("id").primaryKey(),
  problemNo: text("problem_no").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  rootCause: text("root_cause"),
  workaround: text("workaround"),
  status: text("status").notNull().default("Open"),
  priority: text("priority").notNull().default("Medium"),
  category: text("category"),
  impactLevel: text("impact_level"),
  assignedTo: text("assigned_to"),
  assignedGroup: text("assigned_group"),
  relatedIncidents: text("related_incidents"),
  affectedSystems: text("affected_systems"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const itsmChangesTable = pgTable("itsm_changes", {
  id: serial("id").primaryKey(),
  changeNo: text("change_no").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("Normal"),
  category: text("category"),
  riskLevel: text("risk_level").notNull().default("Medium"),
  impact: text("impact"),
  approvalStatus: text("approval_status").notNull().default("Pending"),
  requestedBy: text("requested_by"),
  approvedBy: text("approved_by"),
  implementationDate: text("implementation_date"),
  rollbackPlan: text("rollback_plan"),
  testPlan: text("test_plan"),
  backoutDuration: text("backout_duration"),
  status: text("status").notNull().default("Draft"),
  problemId: integer("problem_id"),
  affectedAssets: text("affected_assets"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const itsmSlaPoliciesTable = pgTable("itsm_sla_policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ticketType: text("ticket_type").notNull().default("Incident"),
  priority: text("priority").notNull(),
  responseTimeHours: integer("response_time_hours").notNull(),
  resolutionTimeHours: integer("resolution_time_hours").notNull(),
  escalationEnabled: boolean("escalation_enabled").notNull().default(true),
  escalationPolicy: text("escalation_policy"),
  businessHours: boolean("business_hours").notNull().default(true),
  slaType: text("sla_type").notNull().default("24x7"),
  status: text("status").notNull().default("Active"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const itsmTicketHistoryTable = pgTable("itsm_ticket_history", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  ticketType: text("ticket_type").notNull(),
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  updatedBy: text("updated_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itsmKnowledgeBaseTable = pgTable("itsm_knowledge_base", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  category: text("category"),
  tags: text("tags"),
  authorName: text("author_name"),
  views: integer("views").notNull().default(0),
  status: text("status").notNull().default("Published"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const itsmServiceRequestsTable = pgTable("itsm_service_requests", {
  id: serial("id").primaryKey(),
  requestNo: text("request_no").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  status: text("status").notNull().default("Submitted"),
  priority: text("priority").notNull().default("Medium"),
  urgency: text("urgency"),
  requestedBy: text("requested_by"),
  assignedTo: text("assigned_to"),
  assignedGroup: text("assigned_group"),
  department: text("department"),
  dueDate: text("due_date"),
  fulfillmentNotes: text("fulfillment_notes"),
  subcategory: text("subcategory"),
  teamId: integer("team_id"),
  requesterUserId: integer("requester_user_id"),
  expectedClosureDate: date("expected_closure_date", { mode: "string" }),
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const itsmApprovalMatrixTable = pgTable("itsm_approval_matrix", {
  id: serial("id").primaryKey(),
  ticketType: text("ticket_type").notNull(),
  condition: text("condition"),
  approverRole: text("approver_role").notNull(),
  approverLevel: text("approver_level").notNull(),
  sequence: integer("sequence").notNull().default(1),
  approverRoleId: integer("approver_role_id"),
  approverUserIds: integer("approver_user_ids").array().notNull().default(sql`'{}'::integer[]`),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itsmApprovalsTable = pgTable("itsm_approvals", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  ticketType: text("ticket_type").notNull(),
  approverLevel: text("approver_level").notNull(),
  approverRole: text("approver_role").notNull(),
  approverName: text("approver_name"),
  status: text("status").notNull().default("Pending"),
  notes: text("notes"),
  actionAt: timestamp("action_at", { withTimezone: true }),
  approverRoleId: integer("approver_role_id"),
  approverUserIds: integer("approver_user_ids").array().notNull().default(sql`'{}'::integer[]`),
  actedByUserId: integer("acted_by_user_id"),
  adminOverride: boolean("admin_override").notNull().default(false),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIncidentSchema = createInsertSchema(itsmIncidentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProblemSchema = createInsertSchema(itsmProblemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertChangeSchema = createInsertSchema(itsmChangesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSlaPolicySchema = createInsertSchema(itsmSlaPoliciesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertKnowledgeBaseSchema = createInsertSchema(itsmKnowledgeBaseTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceRequestSchema = createInsertSchema(itsmServiceRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertApprovalMatrixSchema = createInsertSchema(itsmApprovalMatrixTable).omit({ id: true, createdAt: true });
export const insertApprovalSchema = createInsertSchema(itsmApprovalsTable).omit({ id: true, createdAt: true });

export const itsmAttachmentsTable = pgTable("itsm_attachments", {
  id: serial("id").primaryKey(),
  ticketType: text("ticket_type").notNull(),
  ticketId: integer("ticket_id").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedBy: integer("uploaded_by"),
  uploadedByName: text("uploaded_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAttachmentSchema = createInsertSchema(itsmAttachmentsTable).omit({ id: true, createdAt: true });

export type ItsmIncident = typeof itsmIncidentsTable.$inferSelect;
export type ItsmProblem = typeof itsmProblemsTable.$inferSelect;
export type ItsmChange = typeof itsmChangesTable.$inferSelect;
export type ItsmSlaPolicy = typeof itsmSlaPoliciesTable.$inferSelect;
export type ItsmTicketHistory = typeof itsmTicketHistoryTable.$inferSelect;
export type ItsmKnowledgeBase = typeof itsmKnowledgeBaseTable.$inferSelect;
export type ItsmServiceRequest = typeof itsmServiceRequestsTable.$inferSelect;
export type ItsmApprovalMatrix = typeof itsmApprovalMatrixTable.$inferSelect;
export type ItsmApproval = typeof itsmApprovalsTable.$inferSelect;

/* Assignment groups with members, and the category / sub-category catalog that routes tickets to them. */
export const itsmTeamsTable = pgTable("itsm_teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  email: text("email"),
  leadUserId: integer("lead_user_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const itsmTeamMembersTable = pgTable("itsm_team_members", {
  teamId: integer("team_id").notNull(),
  userId: integer("user_id").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});
export const itsmCatalogTable = pgTable("itsm_catalog", {
  id: serial("id").primaryKey(),
  ticketType: text("ticket_type").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  teamId: integer("team_id"),
  resolutionDays: integer("resolution_days"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
