import { Router } from "express";
import { db, itsmIncidentsTable, itsmProblemsTable, itsmChangesTable, itsmSlaPoliciesTable, itsmTicketHistoryTable, itsmKnowledgeBaseTable, itsmServiceRequestsTable, itsmApprovalMatrixTable, itsmApprovalsTable } from "@workspace/db";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";
import { logAudit } from "./audit-logs";

const router = Router();

async function createApprovalRecords(ticketId: number, ticketType: string, priority?: string, severity?: string) {
  const rules = await db.select().from(itsmApprovalMatrixTable)
    .where(and(eq(itsmApprovalMatrixTable.ticketType, ticketType), eq(itsmApprovalMatrixTable.isActive, true)))
    .orderBy(itsmApprovalMatrixTable.sequence);
  const filtered = rules.filter(r => {
    if (!r.condition || r.condition === "All") return true;
    if (r.condition.startsWith("Priority:")) {
      const vals = r.condition.replace("Priority:", "").split(",").map(v => v.trim());
      return vals.includes(priority || "");
    }
    if (r.condition.startsWith("Severity:")) {
      const vals = r.condition.replace("Severity:", "").split(",").map(v => v.trim());
      return vals.includes(severity || "");
    }
    if (r.condition.startsWith("Type:")) {
      return true;
    }
    return true;
  });
  if (filtered.length > 0) {
    await db.insert(itsmApprovalsTable).values(
      filtered.map(r => ({
        ticketId,
        ticketType,
        approverLevel: r.approverLevel,
        approverRole: r.approverRole,
        status: "Pending",
      }))
    );
  }
}

router.get("/incidents", requireAuth, async (_req, res) => {
  const items = await db.select().from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).orderBy(desc(itsmIncidentsTable.createdAt));
  res.json(items);
});

router.post("/incidents", requireAuth, async (req, res) => {
  const count = await db.select({ count: sql<number>`count(*)::int` }).from(itsmIncidentsTable);
  const ticketNo = `INC-${String((count[0]?.count || 0) + 1).padStart(5, "0")}`;
  const body = { ...req.body, ticketNo, status: req.body.status || "Open" };
  const [item] = await db.insert(itsmIncidentsTable).values(body).returning();
  await db.insert(itsmTicketHistoryTable).values({ ticketId: item.id, ticketType: "incident", oldStatus: null, newStatus: item.status, updatedBy: req.body.createdBy || "System", notes: "Incident created" });
  await createApprovalRecords(item.id, "Incident", item.priority, item.severity);
  await logAudit({ entityType: "itsm_incident", entityId: item.id, action: "create", summary: `Created incident: ${item.title}`, newValues: item });
  res.status(201).json(item);
});

router.patch("/incidents/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [old] = await db.select().from(itsmIncidentsTable).where(eq(itsmIncidentsTable.id, id));
  if (!old) { res.status(404).json({ error: "Not found" }); return; }
  const updates: any = { ...req.body, updatedAt: new Date() };
  if (req.body.status === "Resolved" && !old.resolvedAt) updates.resolvedAt = new Date();
  if (req.body.status === "Closed" && !old.closedAt) updates.closedAt = new Date();
  const [item] = await db.update(itsmIncidentsTable).set(updates).where(eq(itsmIncidentsTable.id, id)).returning();
  if (old.status !== item.status) {
    await db.insert(itsmTicketHistoryTable).values({ ticketId: id, ticketType: "incident", oldStatus: old.status, newStatus: item.status, updatedBy: req.body.updatedBy || "System", notes: req.body.resolutionNotes || `Status changed to ${item.status}` });
  }
  await logAudit({ entityType: "itsm_incident", entityId: id, action: "update", summary: `Updated incident: ${item.title}`, oldValues: old, newValues: item });
  res.json(item);
});

router.delete("/incidents/:id", requireAuth, async (req, res) => {
  await db.update(itsmIncidentsTable).set({ isActive: false }).where(eq(itsmIncidentsTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

router.get("/incidents/stats", requireAuth, async (_req, res) => {
  const total = await db.select({ count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true));
  const byStatus = await db.select({ status: itsmIncidentsTable.status, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).groupBy(itsmIncidentsTable.status);
  const byPriority = await db.select({ priority: itsmIncidentsTable.priority, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).groupBy(itsmIncidentsTable.priority);
  const bySeverity = await db.select({ severity: itsmIncidentsTable.severity, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).groupBy(itsmIncidentsTable.severity);
  const byCategory = await db.select({ category: itsmIncidentsTable.category, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).groupBy(itsmIncidentsTable.category);
  res.json({ total: total[0]?.count || 0, byStatus, byPriority, bySeverity, byCategory });
});

router.get("/problems", requireAuth, async (_req, res) => {
  const items = await db.select().from(itsmProblemsTable).where(eq(itsmProblemsTable.isActive, true)).orderBy(desc(itsmProblemsTable.createdAt));
  res.json(items);
});

router.post("/problems", requireAuth, async (req, res) => {
  const count = await db.select({ count: sql<number>`count(*)::int` }).from(itsmProblemsTable);
  const problemNo = `PRB-${String((count[0]?.count || 0) + 1).padStart(5, "0")}`;
  const body = { ...req.body, problemNo, status: req.body.status || "Open" };
  const [item] = await db.insert(itsmProblemsTable).values(body).returning();
  await db.insert(itsmTicketHistoryTable).values({ ticketId: item.id, ticketType: "problem", oldStatus: null, newStatus: item.status, updatedBy: req.body.createdBy || "System", notes: "Problem created" });
  await createApprovalRecords(item.id, "Problem", item.priority);
  await logAudit({ entityType: "itsm_problem", entityId: item.id, action: "create", summary: `Created problem: ${item.title}`, newValues: item });
  res.status(201).json(item);
});

router.patch("/problems/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [old] = await db.select().from(itsmProblemsTable).where(eq(itsmProblemsTable.id, id));
  if (!old) { res.status(404).json({ error: "Not found" }); return; }
  const [item] = await db.update(itsmProblemsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(itsmProblemsTable.id, id)).returning();
  if (old.status !== item.status) {
    await db.insert(itsmTicketHistoryTable).values({ ticketId: id, ticketType: "problem", oldStatus: old.status, newStatus: item.status, updatedBy: req.body.updatedBy || "System", notes: `Status changed to ${item.status}` });
  }
  await logAudit({ entityType: "itsm_problem", entityId: id, action: "update", summary: `Updated problem: ${item.title}`, oldValues: old, newValues: item });
  res.json(item);
});

router.delete("/problems/:id", requireAuth, async (req, res) => {
  await db.update(itsmProblemsTable).set({ isActive: false }).where(eq(itsmProblemsTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

router.get("/changes", requireAuth, async (_req, res) => {
  const items = await db.select().from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true)).orderBy(desc(itsmChangesTable.createdAt));
  res.json(items);
});

router.post("/changes", requireAuth, async (req, res) => {
  const count = await db.select({ count: sql<number>`count(*)::int` }).from(itsmChangesTable);
  const changeNo = `CHG-${String((count[0]?.count || 0) + 1).padStart(5, "0")}`;
  const body = { ...req.body, changeNo, status: req.body.status || "Open" };
  const [item] = await db.insert(itsmChangesTable).values(body).returning();
  await db.insert(itsmTicketHistoryTable).values({ ticketId: item.id, ticketType: "change", oldStatus: null, newStatus: item.status, updatedBy: req.body.createdBy || "System", notes: "Change request created" });
  await createApprovalRecords(item.id, "Change Request", undefined, undefined);
  await logAudit({ entityType: "itsm_change", entityId: item.id, action: "create", summary: `Created change request: ${item.title}`, newValues: item });
  res.status(201).json(item);
});

router.patch("/changes/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [old] = await db.select().from(itsmChangesTable).where(eq(itsmChangesTable.id, id));
  if (!old) { res.status(404).json({ error: "Not found" }); return; }
  const [item] = await db.update(itsmChangesTable).set({ ...req.body, updatedAt: new Date() }).where(eq(itsmChangesTable.id, id)).returning();
  if (old.status !== item.status) {
    await db.insert(itsmTicketHistoryTable).values({ ticketId: id, ticketType: "change", oldStatus: old.status, newStatus: item.status, updatedBy: req.body.updatedBy || "System" });
  }
  await logAudit({ entityType: "itsm_change", entityId: id, action: "update", summary: `Updated change request: ${item.title}`, oldValues: old, newValues: item });
  res.json(item);
});

router.delete("/changes/:id", requireAuth, async (req, res) => {
  await db.update(itsmChangesTable).set({ isActive: false }).where(eq(itsmChangesTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

router.get("/changes/stats", requireAuth, async (_req, res) => {
  const total = await db.select({ count: sql<number>`count(*)::int` }).from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true));
  const byStatus = await db.select({ status: itsmChangesTable.status, count: sql<number>`count(*)::int` }).from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true)).groupBy(itsmChangesTable.status);
  const byType = await db.select({ type: itsmChangesTable.type, count: sql<number>`count(*)::int` }).from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true)).groupBy(itsmChangesTable.type);
  res.json({ total: total[0]?.count || 0, byStatus, byType });
});

router.get("/sla-policies", requireAuth, async (req, res) => {
  const ticketType = req.query.ticketType as string || null;
  let q;
  if (ticketType) {
    q = db.select().from(itsmSlaPoliciesTable).where(and(eq(itsmSlaPoliciesTable.isActive, true), eq(itsmSlaPoliciesTable.ticketType, ticketType))).orderBy(itsmSlaPoliciesTable.priority);
  } else {
    q = db.select().from(itsmSlaPoliciesTable).where(eq(itsmSlaPoliciesTable.isActive, true)).orderBy(itsmSlaPoliciesTable.priority);
  }
  const items = await q;
  res.json(items);
});

router.post("/sla-policies", requireAuth, async (req, res) => {
  const [item] = await db.insert(itsmSlaPoliciesTable).values(req.body).returning();
  res.status(201).json(item);
});

router.patch("/sla-policies/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [item] = await db.update(itsmSlaPoliciesTable).set(req.body).where(eq(itsmSlaPoliciesTable.id, id)).returning();
  res.json(item);
});

router.delete("/sla-policies/:id", requireAuth, async (req, res) => {
  await db.update(itsmSlaPoliciesTable).set({ isActive: false }).where(eq(itsmSlaPoliciesTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

router.get("/ticket-history", requireAuth, async (req, res) => {
  const ticketId = req.query.ticketId ? parseInt(req.query.ticketId as string) : null;
  const ticketType = req.query.ticketType as string || null;
  let q;
  if (ticketId && ticketType) {
    q = db.select().from(itsmTicketHistoryTable).where(and(eq(itsmTicketHistoryTable.ticketId, ticketId), eq(itsmTicketHistoryTable.ticketType, ticketType))).orderBy(desc(itsmTicketHistoryTable.createdAt));
  } else {
    q = db.select().from(itsmTicketHistoryTable).orderBy(desc(itsmTicketHistoryTable.createdAt)).limit(100);
  }
  const items = await q;
  res.json(items);
});

router.get("/knowledge-base", requireAuth, async (_req, res) => {
  const items = await db.select().from(itsmKnowledgeBaseTable).where(eq(itsmKnowledgeBaseTable.isActive, true)).orderBy(desc(itsmKnowledgeBaseTable.createdAt));
  res.json(items);
});

router.post("/knowledge-base", requireAuth, async (req, res) => {
  const [item] = await db.insert(itsmKnowledgeBaseTable).values(req.body).returning();
  res.status(201).json(item);
});

router.patch("/knowledge-base/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [item] = await db.update(itsmKnowledgeBaseTable).set({ ...req.body, updatedAt: new Date() }).where(eq(itsmKnowledgeBaseTable.id, id)).returning();
  res.json(item);
});

router.delete("/knowledge-base/:id", requireAuth, async (req, res) => {
  await db.update(itsmKnowledgeBaseTable).set({ isActive: false }).where(eq(itsmKnowledgeBaseTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

router.get("/service-requests", requireAuth, async (_req, res) => {
  const items = await db.select().from(itsmServiceRequestsTable).where(eq(itsmServiceRequestsTable.isActive, true)).orderBy(desc(itsmServiceRequestsTable.createdAt));
  res.json(items);
});

router.post("/service-requests", requireAuth, async (req, res) => {
  const count = await db.select({ count: sql<number>`count(*)::int` }).from(itsmServiceRequestsTable);
  const requestNo = `SR-${String((count[0]?.count || 0) + 1).padStart(5, "0")}`;
  const body = { ...req.body, requestNo, status: req.body.status || "Open" };
  const [item] = await db.insert(itsmServiceRequestsTable).values(body).returning();
  await db.insert(itsmTicketHistoryTable).values({ ticketId: item.id, ticketType: "service_request", oldStatus: null, newStatus: item.status, updatedBy: req.body.createdBy || "System", notes: "Service request created" });
  await createApprovalRecords(item.id, "Service Request", item.priority);
  await logAudit({ entityType: "itsm_service_request", entityId: item.id, action: "create", summary: `Created service request: ${item.title}`, newValues: item });
  res.status(201).json(item);
});

router.patch("/service-requests/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [old] = await db.select().from(itsmServiceRequestsTable).where(eq(itsmServiceRequestsTable.id, id));
  if (!old) { res.status(404).json({ error: "Not found" }); return; }
  const [item] = await db.update(itsmServiceRequestsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(itsmServiceRequestsTable.id, id)).returning();
  if (old.status !== item.status) {
    await db.insert(itsmTicketHistoryTable).values({ ticketId: id, ticketType: "service_request", oldStatus: old.status, newStatus: item.status, updatedBy: req.body.updatedBy || "System", notes: `Status changed to ${item.status}` });
  }
  await logAudit({ entityType: "itsm_service_request", entityId: id, action: "update", summary: `Updated service request: ${item.title}`, oldValues: old, newValues: item });
  res.json(item);
});

router.delete("/service-requests/:id", requireAuth, async (req, res) => {
  await db.update(itsmServiceRequestsTable).set({ isActive: false }).where(eq(itsmServiceRequestsTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

router.get("/approval-matrix", requireAuth, async (req, res) => {
  const ticketType = req.query.ticketType as string || null;
  let items;
  if (ticketType) {
    items = await db.select().from(itsmApprovalMatrixTable).where(and(eq(itsmApprovalMatrixTable.isActive, true), eq(itsmApprovalMatrixTable.ticketType, ticketType))).orderBy(itsmApprovalMatrixTable.sequence);
  } else {
    items = await db.select().from(itsmApprovalMatrixTable).where(eq(itsmApprovalMatrixTable.isActive, true)).orderBy(itsmApprovalMatrixTable.ticketType, itsmApprovalMatrixTable.sequence);
  }
  res.json(items);
});

router.post("/approval-matrix", requireAdmin, async (req, res) => {
  const [item] = await db.insert(itsmApprovalMatrixTable).values(req.body).returning();
  res.status(201).json(item);
});

router.patch("/approval-matrix/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [item] = await db.update(itsmApprovalMatrixTable).set(req.body).where(eq(itsmApprovalMatrixTable.id, id)).returning();
  res.json(item);
});

router.delete("/approval-matrix/:id", requireAdmin, async (req, res) => {
  await db.update(itsmApprovalMatrixTable).set({ isActive: false }).where(eq(itsmApprovalMatrixTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

router.get("/approvals/:ticketType/:ticketId", requireAuth, async (req, res) => {
  const ticketId = parseInt(req.params.ticketId);
  const ticketType = req.params.ticketType;
  const items = await db.select().from(itsmApprovalsTable)
    .where(and(eq(itsmApprovalsTable.ticketId, ticketId), eq(itsmApprovalsTable.ticketType, ticketType)))
    .orderBy(itsmApprovalsTable.createdAt);
  res.json(items);
});

router.post("/approvals/:id/action", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { action, notes } = req.body;
  if (!["Approved", "Rejected"].includes(action)) { res.status(400).json({ error: "Invalid action" }); return; }
  const [approval] = await db.select().from(itsmApprovalsTable).where(eq(itsmApprovalsTable.id, id));
  if (!approval) { res.status(404).json({ error: "Not found" }); return; }
  const approverName = (req as any).user?.name || (req as any).user?.email || "Admin";
  const [updated] = await db.update(itsmApprovalsTable).set({
    status: action,
    notes: notes || null,
    approverName,
    actionAt: new Date(),
  }).where(eq(itsmApprovalsTable.id, id)).returning();
  const ticketTypeMap: Record<string, string> = { "Incident": "incident", "Problem": "problem", "Change Request": "change", "Service Request": "service_request" };
  await db.insert(itsmTicketHistoryTable).values({
    ticketId: approval.ticketId,
    ticketType: ticketTypeMap[approval.ticketType] || approval.ticketType.toLowerCase().replace(/ /g, "_"),
    oldStatus: "Pending",
    newStatus: action,
    updatedBy: approverName,
    notes: `${approval.approverLevel} (${approval.approverRole}): ${action}${notes ? " - " + notes : ""}`,
  });
  res.json(updated);
});

export default router;
