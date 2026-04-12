import { Router } from "express";
import { db, itsmIncidentsTable, itsmProblemsTable, itsmChangesTable, itsmSlaPoliciesTable, itsmTicketHistoryTable, itsmKnowledgeBaseTable, itsmServiceRequestsTable, itsmApprovalMatrixTable, itsmApprovalsTable, itsmAttachmentsTable, settingsTable } from "@workspace/db";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { z } from "zod";

const router = Router();

router.use(requireAuth);

const responseCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10000;
const inflightPromises = new Map<string, Promise<any>>();

router.use(async (req, res, next) => {
  if (req.method === "GET") {
    const cached = responseCache.get(req.path);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      res.json(cached.data);
      return;
    }
    const inflight = inflightPromises.get(req.path);
    if (inflight) {
      try {
        const data = await inflight;
        res.json(data);
      } catch {
        next();
      }
      return;
    }
  } else if (req.method !== "OPTIONS") {
    responseCache.clear();
  }
  next();
});

const DISALLOWED_CREATE_STATUSES = ["Resolved", "Closed"];

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
    if (r.condition.startsWith("Type:")) return true;
    return true;
  });

  const isLowPriority = priority === "Low";
  if (filtered.length > 0) {
    await db.insert(itsmApprovalsTable).values(
      filtered.map(r => ({
        ticketId,
        ticketType,
        approverLevel: r.approverLevel,
        approverRole: r.approverRole,
        status: isLowPriority ? "Auto-Approved" : "Pending",
        approverName: isLowPriority ? "System (Auto-Approval)" : null,
        actionAt: isLowPriority ? new Date() : null,
        notes: isLowPriority ? "Auto-approved: Low priority ticket" : null,
      }))
    );
  }

  if (isLowPriority && filtered.length > 0) {
    await db.insert(itsmTicketHistoryTable).values({
      ticketId,
      ticketType: ticketType.toLowerCase().replace(/ /g, "_"),
      oldStatus: "Pending",
      newStatus: "Auto-Approved",
      updatedBy: "System",
      notes: "All approval levels auto-approved for low priority ticket",
    });
    await logAudit({ entityType: `itsm_${ticketType.toLowerCase().replace(/ /g, "_")}`, entityId: ticketId, action: "auto_approve", summary: `Auto-approved all levels for low priority ${ticketType}` });
  }
}

async function computeSlaBreachCount() {
  const slas = await db.select().from(itsmSlaPoliciesTable).where(eq(itsmSlaPoliciesTable.isActive, true));
  const incidents = await db.select().from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true));
  let breached = 0;
  for (const inc of incidents) {
    if (inc.status === "Closed" || inc.status === "Resolved") continue;
    const sla = slas.find(s => s.ticketType === "Incident" && s.priority === inc.priority);
    if (!sla) continue;
    const createdAt = new Date(inc.createdAt).getTime();
    const now = Date.now();
    const hoursElapsed = (now - createdAt) / 3600000;
    if (hoursElapsed > sla.resolutionTimeHours) breached++;
  }
  return breached;
}

function cachedGet(path: string, handler: () => Promise<any>) {
  return async (req: any, res: any) => {
    const p = handler().then(data => {
      responseCache.set(path, { data, ts: Date.now() });
      inflightPromises.delete(path);
      return data;
    }).catch(err => {
      inflightPromises.delete(path);
      throw err;
    });
    inflightPromises.set(path, p);
    try {
      const data = await p;
      if (!res.headersSent) res.json(data);
    } catch (err: any) {
      if (!res.headersSent) res.status(500).json({ error: err.message || "Internal error" });
    }
  };
}

router.get("/incidents", requireAuth, cachedGet("/incidents", async () => {
  return db.select().from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).orderBy(desc(itsmIncidentsTable.createdAt));
}));

router.post("/incidents", requireAuth, async (req, res) => {
  if (DISALLOWED_CREATE_STATUSES.includes(req.body.status)) {
    res.status(400).json({ error: "Cannot create a ticket with Resolved or Closed status" }); return;
  }
  const count = await db.select({ count: sql<number>`count(*)::int` }).from(itsmIncidentsTable);
  const ticketNo = `INC-${String((count[0]?.count || 0) + 1).padStart(5, "0")}`;
  const body = { ...req.body, ticketNo, status: "Open" };
  const [item] = await db.insert(itsmIncidentsTable).values(body).returning();
  await db.insert(itsmTicketHistoryTable).values({ ticketId: item.id, ticketType: "incident", oldStatus: null, newStatus: "Open", updatedBy: req.body.createdBy || "System", notes: "Incident created" });
  await createApprovalRecords(item.id, "Incident", item.priority, item.severity);
  if (item.priority === "Critical" && item.severity === "S1") {
    await db.insert(itsmTicketHistoryTable).values({ ticketId: item.id, ticketType: "incident", oldStatus: "Open", newStatus: "Escalated", updatedBy: "System", notes: "Auto-escalated: P1/S1 incident requires immediate attention" });
    await logAudit({ entityType: "itsm_incident", entityId: item.id, action: "auto_escalate", summary: `Auto-escalated P1/S1 incident: ${item.title}` });
  }
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

router.get("/incidents/stats", requireAuth, cachedGet("/incidents/stats", async () => {
  const total = await db.select({ count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true));
  const byStatus = await db.select({ status: itsmIncidentsTable.status, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).groupBy(itsmIncidentsTable.status);
  const byPriority = await db.select({ priority: itsmIncidentsTable.priority, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).groupBy(itsmIncidentsTable.priority);
  const bySeverity = await db.select({ severity: itsmIncidentsTable.severity, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).groupBy(itsmIncidentsTable.severity);
  const byCategory = await db.select({ category: itsmIncidentsTable.category, count: sql<number>`count(*)::int` }).from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).groupBy(itsmIncidentsTable.category);
  const slaBreached = await computeSlaBreachCount();
  return { total: total[0]?.count || 0, byStatus, byPriority, bySeverity, byCategory, slaBreached };
}));

router.get("/problems", requireAuth, cachedGet("/problems", async () => {
  return db.select().from(itsmProblemsTable).where(eq(itsmProblemsTable.isActive, true)).orderBy(desc(itsmProblemsTable.createdAt));
}));

router.post("/problems", requireAuth, async (req, res) => {
  if (DISALLOWED_CREATE_STATUSES.includes(req.body.status)) {
    res.status(400).json({ error: "Cannot create a ticket with Resolved or Closed status" }); return;
  }
  const count = await db.select({ count: sql<number>`count(*)::int` }).from(itsmProblemsTable);
  const problemNo = `PRB-${String((count[0]?.count || 0) + 1).padStart(5, "0")}`;
  const body = { ...req.body, problemNo, status: "Open" };
  const [item] = await db.insert(itsmProblemsTable).values(body).returning();
  await db.insert(itsmTicketHistoryTable).values({ ticketId: item.id, ticketType: "problem", oldStatus: null, newStatus: "Open", updatedBy: req.body.createdBy || "System", notes: "Problem created" });
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

router.get("/changes", requireAuth, cachedGet("/changes", async () => {
  return db.select().from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true)).orderBy(desc(itsmChangesTable.createdAt));
}));

router.post("/changes", requireAuth, async (req, res) => {
  if (DISALLOWED_CREATE_STATUSES.includes(req.body.status) || req.body.status === "Completed") {
    res.status(400).json({ error: "Cannot create a change request with Completed, Resolved, or Closed status" }); return;
  }
  const count = await db.select({ count: sql<number>`count(*)::int` }).from(itsmChangesTable);
  const changeNo = `CHG-${String((count[0]?.count || 0) + 1).padStart(5, "0")}`;
  const body = { ...req.body, changeNo, status: "Draft", approvalStatus: "Pending" };
  const [item] = await db.insert(itsmChangesTable).values(body).returning();
  await db.insert(itsmTicketHistoryTable).values({ ticketId: item.id, ticketType: "change", oldStatus: null, newStatus: "Draft", updatedBy: req.body.createdBy || "System", notes: "Change request created (mandatory approval required)" });
  await createApprovalRecords(item.id, "Change Request", undefined, undefined);
  await logAudit({ entityType: "itsm_change", entityId: item.id, action: "create", summary: `Created change request: ${item.title}`, newValues: item });
  res.status(201).json(item);
});

router.patch("/changes/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [old] = await db.select().from(itsmChangesTable).where(eq(itsmChangesTable.id, id));
  if (!old) { res.status(404).json({ error: "Not found" }); return; }
  if (req.body.status === "In Progress" && old.approvalStatus !== "Approved") {
    res.status(400).json({ error: "Change request must be approved before moving to In Progress" }); return;
  }
  const [item] = await db.update(itsmChangesTable).set({ ...req.body, updatedAt: new Date() }).where(eq(itsmChangesTable.id, id)).returning();
  if (old.status !== item.status) {
    await db.insert(itsmTicketHistoryTable).values({ ticketId: id, ticketType: "change", oldStatus: old.status, newStatus: item.status, updatedBy: req.body.updatedBy || "System", notes: `Status changed to ${item.status}` });
  }
  await logAudit({ entityType: "itsm_change", entityId: id, action: "update", summary: `Updated change request: ${item.title}`, oldValues: old, newValues: item });
  res.json(item);
});

router.delete("/changes/:id", requireAuth, async (req, res) => {
  await db.update(itsmChangesTable).set({ isActive: false }).where(eq(itsmChangesTable.id, parseInt(req.params.id)));
  res.status(204).end();
});

router.get("/changes/stats", requireAuth, cachedGet("/changes/stats", async () => {
  const total = await db.select({ count: sql<number>`count(*)::int` }).from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true));
  const byStatus = await db.select({ status: itsmChangesTable.status, count: sql<number>`count(*)::int` }).from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true)).groupBy(itsmChangesTable.status);
  const byType = await db.select({ type: itsmChangesTable.type, count: sql<number>`count(*)::int` }).from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true)).groupBy(itsmChangesTable.type);
  return { total: total[0]?.count || 0, byStatus, byType };
}));

router.get("/sla-policies", requireAuth, cachedGet("/sla-policies", async () => {
  return db.select().from(itsmSlaPoliciesTable).where(eq(itsmSlaPoliciesTable.isActive, true)).orderBy(itsmSlaPoliciesTable.priority);
}));

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

router.get("/knowledge-base", requireAuth, cachedGet("/knowledge-base", async () => {
  return db.select().from(itsmKnowledgeBaseTable).where(eq(itsmKnowledgeBaseTable.isActive, true)).orderBy(desc(itsmKnowledgeBaseTable.createdAt));
}));

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

router.get("/service-requests", requireAuth, cachedGet("/service-requests", async () => {
  return db.select().from(itsmServiceRequestsTable).where(eq(itsmServiceRequestsTable.isActive, true)).orderBy(desc(itsmServiceRequestsTable.createdAt));
}));

router.post("/service-requests", requireAuth, async (req, res) => {
  if (DISALLOWED_CREATE_STATUSES.includes(req.body.status) || req.body.status === "Completed") {
    res.status(400).json({ error: "Cannot create a service request with Completed or Closed status" }); return;
  }
  const count = await db.select({ count: sql<number>`count(*)::int` }).from(itsmServiceRequestsTable);
  const requestNo = `SR-${String((count[0]?.count || 0) + 1).padStart(5, "0")}`;
  const body = { ...req.body, requestNo, status: "Open" };
  const [item] = await db.insert(itsmServiceRequestsTable).values(body).returning();
  await db.insert(itsmTicketHistoryTable).values({ ticketId: item.id, ticketType: "service_request", oldStatus: null, newStatus: "Open", updatedBy: req.body.createdBy || "System", notes: "Service request created" });
  await createApprovalRecords(item.id, "Service Request", item.priority);
  await logAudit({ entityType: "itsm_service_request", entityId: item.id, action: "create", summary: `Created service request: ${item.title}`, newValues: item });
  res.status(201).json(item);
});

router.patch("/service-requests/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [old] = await db.select().from(itsmServiceRequestsTable).where(eq(itsmServiceRequestsTable.id, id));
  if (!old) { res.status(404).json({ error: "Not found" }); return; }
  const updates: any = { ...req.body, updatedAt: new Date() };
  if (req.body.status === "Completed" && !old.completedAt) updates.completedAt = new Date();
  const [item] = await db.update(itsmServiceRequestsTable).set(updates).where(eq(itsmServiceRequestsTable.id, id)).returning();
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
  await logAudit({ entityType: `itsm_approval`, entityId: id, action: action.toLowerCase(), summary: `${action} ${approval.ticketType} #${approval.ticketId} at ${approval.approverLevel}`, performedBy: approverName });
  res.json(updated);
});

// ─── ITSM SETTINGS (attachment config) ───────────────────────
router.get("/itsm-settings", async (_req, res): Promise<void> => {
  const settings = await db.select().from(settingsTable).then(rows => {
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  });
  res.json({
    maxAttachmentSizeMB: parseInt(settings["itsm.maxAttachmentSizeMB"] ?? "20"),
    maxAttachmentsPerTicket: parseInt(settings["itsm.maxAttachmentsPerTicket"] ?? "5"),
    allowedFileTypes: JSON.parse(settings["itsm.allowedFileTypes"] ?? '["pdf","xlsx","xls","docx","doc","png","jpg","jpeg"]'),
  });
});

// ─── ITSM ATTACHMENTS ─────────────────────────────────────────
router.get("/itsm-attachments/:ticketType/:ticketId", async (req, res): Promise<void> => {
  const ticketId = parseInt(req.params.ticketId);
  const ticketType = req.params.ticketType;
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticketId" }); return; }
  const rows = await db.select().from(itsmAttachmentsTable)
    .where(and(eq(itsmAttachmentsTable.ticketType, ticketType), eq(itsmAttachmentsTable.ticketId, ticketId)))
    .orderBy(desc(itsmAttachmentsTable.createdAt));
  res.json(rows);
});

router.post("/itsm-attachments", async (req, res): Promise<void> => {
  const body = z.object({
    ticketType: z.string().min(1),
    ticketId: z.number().int().positive(),
    fileName: z.string().min(1),
    fileSize: z.number().int().positive(),
    contentType: z.string().min(1),
    objectPath: z.string().min(1),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid attachment data" }); return; }

  const userId = (req as any).user?.id;
  const uploadedByName = await getPerformedBy(userId).catch(() => "Unknown");

  const [attachment] = await db.insert(itsmAttachmentsTable).values({
    ...body.data,
    uploadedBy: userId,
    uploadedByName,
  }).returning();
  await logAudit({ entityType: "itsm_attachment", entityId: attachment.id, action: "CREATE", performedBy: uploadedByName, summary: `Attachment uploaded: ${body.data.fileName} for ${body.data.ticketType} #${body.data.ticketId}` }).catch(() => {});
  res.status(201).json(attachment);
});

router.delete("/itsm-attachments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [att] = await db.delete(itsmAttachmentsTable).where(eq(itsmAttachmentsTable.id, id)).returning();
  if (!att) { res.status(404).json({ error: "Attachment not found" }); return; }
  const actorName = await getPerformedBy((req as any).user?.id).catch(() => "Unknown");
  await logAudit({ entityType: "itsm_attachment", entityId: id, action: "DELETE", performedBy: actorName, summary: `Attachment deleted: ${att.fileName} for ${att.ticketType} #${att.ticketId}` }).catch(() => {});
  res.sendStatus(204);
});

// ─── ITSM MASTER REPORT ───────────────────────────────────────
router.get("/itsm-report", requireAuth, async (req, res): Promise<void> => {
  const type = (req.query.type as string) || "all";

  const allApprovals = await db.select().from(itsmApprovalsTable);
  const slas = await db.select().from(itsmSlaPoliciesTable).where(eq(itsmSlaPoliciesTable.isActive, true));

  function getCurrentStage(ticketId: number, ticketType: string) {
    const ticketApprovals = allApprovals.filter(a => a.ticketId === ticketId && a.ticketType === ticketType);
    if (!ticketApprovals.length) return { currentStage: "No Approval Required", pendingWith: "—" };
    const pending = ticketApprovals.filter(a => a.status === "Pending").sort((a, b) => (a.approverLevel || "").localeCompare(b.approverLevel || ""))[0];
    const approved = ticketApprovals.every(a => a.status === "Approved");
    const rejected = ticketApprovals.find(a => a.status === "Rejected");
    if (rejected) return { currentStage: `Rejected at ${rejected.approverLevel}`, pendingWith: rejected.approverRole || "—" };
    if (approved) return { currentStage: "Fully Approved", pendingWith: "—" };
    if (pending) return { currentStage: pending.approverLevel || "L1", pendingWith: `${pending.approverRole || ""}${pending.approverName ? " (" + pending.approverName + ")" : ""}` };
    return { currentStage: "—", pendingWith: "—" };
  }

  function getSLABreach(createdAt: Date | null, resolvedAt: Date | null, closedAt: Date | null, priority: string, ticketTypeName: string) {
    const sla = slas.find(s => s.priority === priority && s.ticketType === ticketTypeName);
    if (!sla) return "No SLA";
    if (resolvedAt || closedAt) return "No Breach";
    const ageHours = (Date.now() - new Date(createdAt || Date.now()).getTime()) / 3600000;
    return ageHours > sla.resolutionTimeHours ? `Breached (${Math.round(ageHours)}h / ${sla.resolutionTimeHours}h SLA)` : `Within SLA (${Math.round(ageHours)}h / ${sla.resolutionTimeHours}h)`;
  }

  function fmtDate(d: Date | string | null) {
    if (!d) return "";
    return new Date(d).toISOString().replace("T", " ").substring(0, 19) + " UTC";
  }

  const results: any[] = [];

  if (type === "all" || type === "incidents") {
    const rows = await db.select().from(itsmIncidentsTable).where(eq(itsmIncidentsTable.isActive, true)).orderBy(desc(itsmIncidentsTable.createdAt));
    for (const r of rows) {
      const { currentStage, pendingWith } = getCurrentStage(r.id, "Incident");
      results.push({
        type: "Incident",
        ticketNo: r.ticketNo, title: r.title, description: r.description || "",
        status: r.status, priority: r.priority, severity: r.severity,
        category: r.category || "", subcategory: r.subcategory || "",
        assignedTo: r.assignedTo || "", assignedGroup: r.assignedGroup || "",
        reportedBy: r.reportedBy || "", reporterEmail: r.reporterEmail || "",
        affectedSystem: r.affectedSystem || "", resolutionNotes: r.resolutionNotes || "",
        resolvedAt: fmtDate(r.resolvedAt), closedAt: fmtDate(r.closedAt),
        currentApprovalStage: currentStage, pendingWithApprover: pendingWith,
        slaBreachStatus: getSLABreach(r.createdAt, r.resolvedAt, r.closedAt, r.priority, "Incident"),
        createdBy: r.createdBy || "", updatedBy: r.updatedBy || "",
        createdAt: fmtDate(r.createdAt), updatedAt: fmtDate(r.updatedAt),
      });
    }
  }

  if (type === "all" || type === "problems") {
    const rows = await db.select().from(itsmProblemsTable).where(eq(itsmProblemsTable.isActive, true)).orderBy(desc(itsmProblemsTable.createdAt));
    for (const r of rows) {
      const { currentStage, pendingWith } = getCurrentStage(r.id, "Problem");
      results.push({
        type: "Problem",
        ticketNo: r.problemNo, title: r.title, description: r.description || "",
        status: r.status, priority: r.priority, severity: "", category: "", subcategory: "",
        assignedTo: r.assignedTo || "", assignedGroup: "",
        reportedBy: "", reporterEmail: "", affectedSystem: r.affectedSystems || "",
        resolutionNotes: r.workaround || "", resolvedAt: "", closedAt: "",
        rootCause: r.rootCause || "", relatedIncidents: r.relatedIncidents || "",
        currentApprovalStage: currentStage, pendingWithApprover: pendingWith,
        slaBreachStatus: getSLABreach(r.createdAt, null, null, r.priority, "Problem"),
        createdBy: r.createdBy || "", updatedBy: r.updatedBy || "",
        createdAt: fmtDate(r.createdAt), updatedAt: fmtDate(r.updatedAt),
      });
    }
  }

  if (type === "all" || type === "changes") {
    const rows = await db.select().from(itsmChangesTable).where(eq(itsmChangesTable.isActive, true)).orderBy(desc(itsmChangesTable.createdAt));
    for (const r of rows) {
      const { currentStage, pendingWith } = getCurrentStage(r.id, "Change Request");
      results.push({
        type: "Change Request",
        ticketNo: r.changeNo, title: r.title, description: r.description || "",
        status: r.status, priority: r.riskLevel, severity: "",
        category: r.type || "", subcategory: "",
        assignedTo: r.requestedBy || "", assignedGroup: "",
        reportedBy: r.requestedBy || "", reporterEmail: "",
        affectedSystem: r.impact || "", resolutionNotes: r.rollbackPlan || "",
        resolvedAt: r.implementationDate || "", closedAt: "",
        approvalStatus: r.approvalStatus || "", approvedBy: r.approvedBy || "",
        currentApprovalStage: currentStage, pendingWithApprover: pendingWith,
        slaBreachStatus: "N/A (Change Request)",
        createdBy: r.createdBy || "", updatedBy: r.updatedBy || "",
        createdAt: fmtDate(r.createdAt), updatedAt: fmtDate(r.updatedAt),
      });
    }
  }

  if (type === "all" || type === "service-requests") {
    const rows = await db.select().from(itsmServiceRequestsTable).where(eq(itsmServiceRequestsTable.isActive, true)).orderBy(desc(itsmServiceRequestsTable.createdAt));
    for (const r of rows) {
      const { currentStage, pendingWith } = getCurrentStage(r.id, "Service Request");
      results.push({
        type: "Service Request",
        ticketNo: r.requestNo, title: r.title, description: r.description || "",
        status: r.status, priority: r.priority, severity: "",
        category: r.category || "", subcategory: "",
        assignedTo: r.assignedTo || "", assignedGroup: "",
        reportedBy: r.requestedBy || "", reporterEmail: "",
        affectedSystem: "", resolutionNotes: "",
        resolvedAt: fmtDate(r.completedAt), closedAt: "",
        currentApprovalStage: currentStage, pendingWithApprover: pendingWith,
        slaBreachStatus: getSLABreach(r.createdAt, r.completedAt, null, r.priority, "Service Request"),
        createdBy: r.createdBy || "", updatedBy: r.updatedBy || "",
        createdAt: fmtDate(r.createdAt), updatedAt: fmtDate(r.updatedAt),
      });
    }
  }

  res.json(results);
});

export default router;
