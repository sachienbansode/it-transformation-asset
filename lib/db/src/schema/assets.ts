import { pgTable, text, serial, timestamp, integer, boolean, numeric, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assetCategoriesTable = pgTable("asset_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const assetVendorsTable = pgTable("asset_vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  contractStart: text("contract_start"),
  contractEnd: text("contract_end"),
  rating: integer("rating"),
  status: text("status").notNull().default("Active"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  assetTag: text("asset_tag").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  categoryId: integer("category_id"),
  serialNumber: text("serial_number"),
  status: text("status").notNull().default("In Stock"),
  ownerId: integer("owner_id"),
  ownerName: text("owner_name"),
  department: text("department"),
  location: text("location"),
  purchaseDate: text("purchase_date"),
  purchaseOrderNo: text("purchase_order_no"),
  cost: numeric("cost", { precision: 12, scale: 2 }),
  vendorId: integer("vendor_id"),
  vendorName: text("vendor_name"),
  warrantyExpiry: text("warranty_expiry"),
  ipAddress: text("ip_address"),
  macAddress: text("mac_address"),
  osVersion: text("os_version"),
  configuration: text("configuration"),
  notes: text("notes"),
  ownerEmail: text("owner_email"),
  ownerEmployeeCode: text("owner_employee_code"),
  disposalDate: text("disposal_date"),
  disposalMethod: text("disposal_method"),
  disposalReference: text("disposal_reference"),
  disposalValue: numeric("disposal_value", { precision: 12, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const assetLicensesTable = pgTable("asset_licenses", {
  id: serial("id").primaryKey(),
  productName: text("product_name").notNull(),
  vendorName: text("vendor_name"),
  vendorId: integer("vendor_id"),
  licenseKey: text("license_key"),
  licenseType: text("license_type").notNull().default("Perpetual"),
  expiryDate: text("expiry_date"),
  seatsTotal: integer("seats_total").notNull().default(1),
  seatsUsed: integer("seats_used").notNull().default(0),
  cost: numeric("cost", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("Active"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const assetAllocationsTable = pgTable("asset_allocations", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  userId: integer("user_id"),
  userName: text("user_name"),
  employeeCode: text("employee_code"),
  designation: text("designation"),
  department: text("department"),
  location: text("location"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  status: text("status").notNull().default("Active"),
  notes: text("notes"),
  // Handover (issue) details
  handoverNo: text("handover_no"),
  email: text("email"),
  allocationType: text("allocation_type").notNull().default("Permanent"),
  expectedReturnDate: text("expected_return_date"),
  issueCondition: text("issue_condition"),
  accessories: text("accessories"),
  issuedBy: text("issued_by"),
  // Employee acknowledgement
  ackStatus: text("ack_status").notNull().default("Pending"),
  ackAt: timestamp("ack_at", { withTimezone: true }),
  ackBy: text("ack_by"),
  ackMethod: text("ack_method"),
  // Return details
  returnCondition: text("return_condition"),
  returnAccessories: text("return_accessories"),
  returnRemarks: text("return_remarks"),
  receivedBy: text("received_by"),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const assetTransactionsTable = pgTable("asset_transactions", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  action: text("action").notNull(),
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  userId: integer("user_id"),
  userName: text("user_name"),
  notes: text("notes"),
  comment: text("comment"),          // user's own comment / reason for the change
  changes: jsonb("changes"),         // field-level diff: [{ field, label, from, to }]
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const maintenanceRecordsTable = pgTable("maintenance_records", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  type: text("type").notNull().default("Preventive"),
  description: text("description"),
  scheduledDate: text("scheduled_date"),
  completedDate: text("completed_date"),
  cost: numeric("cost", { precision: 12, scale: 2 }),
  vendorId: integer("vendor_id"),
  vendorName: text("vendor_name"),
  status: text("status").notNull().default("Scheduled"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAssetCategorySchema = createInsertSchema(assetCategoriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAssetVendorSchema = createInsertSchema(assetVendorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAssetSchema = createInsertSchema(assetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAssetLicenseSchema = createInsertSchema(assetLicensesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAssetAllocationSchema = createInsertSchema(assetAllocationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMaintenanceRecordSchema = createInsertSchema(maintenanceRecordsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type AssetCategory = typeof assetCategoriesTable.$inferSelect;
export type AssetVendor = typeof assetVendorsTable.$inferSelect;
export type Asset = typeof assetsTable.$inferSelect;
export type AssetLicense = typeof assetLicensesTable.$inferSelect;
export type AssetAllocation = typeof assetAllocationsTable.$inferSelect;
export type AssetTransaction = typeof assetTransactionsTable.$inferSelect;
export type MaintenanceRecord = typeof maintenanceRecordsTable.$inferSelect;
