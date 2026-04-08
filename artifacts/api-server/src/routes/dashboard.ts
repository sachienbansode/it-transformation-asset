import { Router } from "express";
import { db, checklistItemsTable, roadmapItemsTable, applicationsTable, retirementsTable, aibomEntriesTable, sbomEntriesTable } from "@workspace/db";

const router = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [checklist, roadmap, apps, retirements, aibom, sbom] = await Promise.all([
    db.select().from(checklistItemsTable),
    db.select().from(roadmapItemsTable),
    db.select().from(applicationsTable),
    db.select().from(retirementsTable),
    db.select().from(aibomEntriesTable),
    db.select().from(sbomEntriesTable),
  ]);

  const groupBy = <T>(arr: T[], key: keyof T) => {
    const map: Record<string, number> = {};
    for (const item of arr) {
      const val = String(item[key] ?? "Unknown");
      map[val] = (map[val] ?? 0) + 1;
    }
    return Object.entries(map).map(([k, count]) => ({ key: k, count }));
  };

  const roadmapByPhase = (() => {
    const map: Record<string, { count: number; budgetLakhs: number }> = {};
    for (const item of roadmap) {
      const k = item.phase ?? "Unknown";
      if (!map[k]) map[k] = { count: 0, budgetLakhs: 0 };
      map[k].count++;
      map[k].budgetLakhs += item.budgetLakhs ?? 0;
    }
    return Object.entries(map).map(([key, v]) => ({ key, count: v.count, budgetLakhs: v.budgetLakhs }));
  })();

  const roadmapByStatus = groupBy(roadmap, "status");
  const retirementsByStatus = groupBy(retirements, "status");
  const appsByLifecycle = groupBy(apps, "lifecycle");
  const sbomByRisk = groupBy(sbom, "riskLevel");
  const aibomByCategory = groupBy(aibom, "category");

  const totalBudget = roadmap.reduce((sum, i) => sum + (i.budgetLakhs ?? 0), 0);
  const spentBudget = roadmap.filter(r => r.status === "Completed").reduce((s, i) => s + (i.budgetLakhs ?? 0), 0);
  const criticalCves = sbom.filter(s => s.cve && s.cve !== "None" && s.riskLevel === "Critical").length;
  const highCves = sbom.filter(s => s.cve && s.cve !== "None" && s.riskLevel === "High").length;
  const checklistCompleted = checklist.filter(c => c.status === "Available").length;

  const GENERIC_BUS = new Set(["All", "Both", "All Business Units", "all", "both"]);
  const businessUnits = [...new Set([
    ...checklist.map(c => c.business),
    ...apps.map(a => a.business),
    ...roadmap.map(r => r.business),
  ].filter((b): b is string => !!b && !GENERIC_BUS.has(b)))].sort();
  const phases = [...new Set(roadmap.map(r => r.phase).filter(Boolean))].sort();

  res.json({
    totalApplications: apps.length,
    appsToRetire: retirements.filter(r => r.status !== "Completed").length,
    appsRetired: retirements.filter(r => r.status === "Completed").length,
    checklistTotal: checklist.length,
    checklistAvailable: checklistCompleted,
    checklistNotAvailable: checklist.filter(c => c.status === "Not Available").length,
    checklistLegacy: checklist.filter(c => c.status === "Legacy").length,
    checklistCompletionPct: checklist.length ? Math.round((checklistCompleted / checklist.length) * 100) : 0,
    roadmapTotal: roadmap.length,
    roadmapBudgetLakhs: totalBudget,
    roadmapSpentLakhs: spentBudget,
    roadmapCompletedItems: roadmap.filter(r => r.status === "Completed").length,
    aibomTotal: aibom.length,
    sbomTotal: sbom.length,
    sbomCriticalCves: criticalCves,
    sbomHighCves: highCves,
    sbomTotalVulns: criticalCves + highCves,
    checklistByBusiness: groupBy(checklist, "business"),
    checklistByStatus: groupBy(checklist, "status"),
    roadmapByPhase,
    roadmapByStatus,
    retirementsByStatus,
    appsByLifecycle,
    sbomByRisk,
    aibomByCategory,
    businessUnits,
    phases,
    // Drill-down datasets
    roadmapItems: roadmap.map(r => ({
      id: r.id, title: r.title, phase: r.phase, status: r.status,
      priority: r.priority, budgetLakhs: r.budgetLakhs, owner: r.owner,
      business: r.business,
    })),
    applicationItems: apps.map(a => ({
      id: a.id, appId: a.appId, name: a.name, business: a.business,
      category: a.category, hosting: a.hosting, criticality: a.criticality,
      applicationStatus: (a as any).applicationStatus ?? "Active",
      lifecycle: a.lifecycle,
    })),
    retirementItems: retirements.map(r => ({
      id: r.id, appName: r.appName, status: r.status, business: r.business,
      retirementDate: r.retirementDate, reason: r.reason,
    })),
  });
});

export default router;
