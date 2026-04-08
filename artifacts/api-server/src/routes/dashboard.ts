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

  const totalBudget = roadmap.reduce((sum, i) => sum + (i.budgetLakhs ?? 0), 0);
  const criticalCves = sbom.filter(s => s.cve && s.cve !== "None" && s.riskLevel === "Critical").length;

  res.json({
    totalApplications: apps.length,
    appsToRetire: retirements.filter(r => r.status !== "Completed").length,
    checklistTotal: checklist.length,
    checklistAvailable: checklist.filter(c => c.status === "Available").length,
    checklistNotAvailable: checklist.filter(c => c.status === "Not Available").length,
    checklistLegacy: checklist.filter(c => c.status === "Legacy").length,
    roadmapTotal: roadmap.length,
    roadmapBudgetLakhs: totalBudget,
    aibomTotal: aibom.length,
    sbomTotal: sbom.length,
    sbomCriticalCves: criticalCves,
    checklistByBusiness: groupBy(checklist, "business"),
    checklistByStatus: groupBy(checklist, "status"),
    roadmapByPhase,
  });
});

export default router;
