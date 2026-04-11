import { Router } from "express";
import { db, itsmIncidentsTable, itsmProblemsTable, itsmChangesTable, itsmSlaPoliciesTable, itsmTicketHistoryTable, itsmKnowledgeBaseTable, itsmServiceRequestsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit } from "./audit-logs";

const router = Router();

router.get("/incidents", requireAuth, async (_req, res) => {
  const items = await db.select().from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).orderBy(desc(itsmIncidentsTable.createdAt));
  res.json(items);
});

router.post("/incidents", requireAuth, async (req, res) => {
  const count = await db.select({ count: sql<number>`count(*)::int` }).from(itsmIncidentsTable);
  const ticketNo = `INC-${String((count[0]?.count || 0) + 1).padStart(5, "0")}`;
  const [item] = await db.insert(itsmIncidentsTable).values({ ...req.body, ticketNo }).returning();
  await db.insert(itsmTicketHistoryTable).values({ ticketId: item.id, ticketType: "incident", oldStatus: null, newStatus: item.status, updatedBy: req.body.createdBy || "System", notes: "Incident created" });
  await logAudit(req, "itsm_incident", item.id, "create", null, item, `Created incident: ${item.title}`);
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
  await logAudit(req, "itsm_incident", id, "update", old, item, `Updated incident: ${item.title}`);
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
  res.json({ total: total[0]?.count || 0, byStatus, byPriority, bySeverity });
});

router.get("/problems", requireAuth, async (_req, res) => {
  const items = await db.select().from(itsmProblemsTable).where(eq(itsmProblemsTable.isActive, true)).orderBy(desc(itsmProblemsTable.createdAt));
  res.json(items);
});

router.post("/problems", requireAuth, async (req, res) => {
  const count = await db.select({ count: sql<number>`count(*)::int` }).from(itsmProblemsTable);
  const problemNo = `PRB-${String((count[0]?.count || 0) + 1).padStart(5, "0")}`;
  const [item] = await db.insert(itsmProblemsTable).values({ ...req.body, problemNo }).returning();
  await logAudit(req, "itsm_problem", item.id, "create", null, item, `Created problem: ${item.title}`);
  res.status(201).json(item);
});

router.patch("/problems/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [old] = await db.select().from(itsmProblemsTable).where(eq(itsmProblemsTable.id, id));
  if (!old) { res.status(404).json({ error: "Not found" }); return; }
  const [item] = await db.update(itsmProblemsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(itsmProblemsTable.id, id)).returning();
  await logAudit(req, "itsm_problem", id, "update", old, item, `Updated problem: ${item.title}`);
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
  const [item] = await db.insert(itsmChangesTable).values({ ...req.body, changeNo }).returning();
  await db.insert(itsmTicketHistoryTable).values({ ticketId: item.id, ticketType: "change", oldStatus: null, newStatus: item.status, updatedBy: req.body.createdBy || "System", notes: "Change request created" });
  await logAudit(req, "itsm_change", item.id, "create", null, item, `Created change: ${item.title}`);
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
  await logAudit(req, "itsm_change", id, "update", old, item, `Updated change: ${item.title}`);
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

router.get("/sla-policies", requireAuth, async (_req, res) => {
  const items = await db.select().from(itsmSlaPoliciesTable).where(eq(itsmSlaPoliciesTable.isActive, true)).orderBy(itsmSlaPoliciesTable.priority);
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
  const [item] = await db.insert(itsmServiceRequestsTable).values({ ...req.body, requestNo }).returning();
  res.status(201).json(item);
});

router.patch("/service-requests/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [item] = await db.update(itsmServiceRequestsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(itsmServiceRequestsTable.id, id)).returning();
  res.json(item);
});

router.delete("/service-requests/:id", requireAuth, async (req, res) => {
  await db.update(itsmServiceRequestsTable).set({ isActive: false }).where(eq(itsmServiceRequestsTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

export default router;
