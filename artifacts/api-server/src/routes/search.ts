import { Router } from "express";
import { db, checklistItemsTable, roadmapItemsTable, applicationsTable, aibomEntriesTable, sbomEntriesTable } from "@workspace/db";
import { ilike, or, isNull, eq, and } from "drizzle-orm";

const router = Router();

router.get("/search", async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) {
    res.json({ checklist: [], roadmap: [], applications: [], aibom: [], sbom: [] });
    return;
  }

  const pat = `%${q}%`;

  const [checklist, roadmap, applications, aibom, sbom] = await Promise.all([
    db.select({
      id: checklistItemsTable.id,
      title: checklistItemsTable.feature,
      sub: checklistItemsTable.category,
      business: checklistItemsTable.business,
      status: checklistItemsTable.status,
    }).from(checklistItemsTable).where(
      or(ilike(checklistItemsTable.feature, pat), ilike(checklistItemsTable.category, pat), ilike(checklistItemsTable.currentApp, pat))
    ).limit(6),

    db.select({
      id: roadmapItemsTable.id,
      title: roadmapItemsTable.title,
      sub: roadmapItemsTable.phase,
      business: roadmapItemsTable.business,
      status: roadmapItemsTable.status,
    }).from(roadmapItemsTable).where(
      and(
        isNull(roadmapItemsTable.archivedAt),
        or(ilike(roadmapItemsTable.title, pat), ilike(roadmapItemsTable.description, pat), ilike(roadmapItemsTable.owner, pat))
      )
    ).limit(6),

    db.select({
      id: applicationsTable.id,
      title: applicationsTable.name,
      sub: applicationsTable.category,
      business: applicationsTable.business,
      status: applicationsTable.applicationStatus,
    }).from(applicationsTable).where(
      and(
        eq(applicationsTable.isActive, true),
        or(ilike(applicationsTable.name, pat), ilike(applicationsTable.category, pat), ilike(applicationsTable.vendor, pat), ilike(applicationsTable.appId, pat))
      )
    ).limit(6),

    db.select({
      id: aibomEntriesTable.id,
      title: aibomEntriesTable.name,
      sub: aibomEntriesTable.type,
      business: aibomEntriesTable.provider,
      status: aibomEntriesTable.complianceStatus,
    }).from(aibomEntriesTable).where(
      or(ilike(aibomEntriesTable.name, pat), ilike(aibomEntriesTable.type, pat), ilike(aibomEntriesTable.useCase, pat), ilike(aibomEntriesTable.provider, pat))
    ).limit(6),

    db.select({
      id: sbomEntriesTable.id,
      title: sbomEntriesTable.name,
      sub: sbomEntriesTable.licenseType,
      business: sbomEntriesTable.supplier,
      status: sbomEntriesTable.riskLevel,
    }).from(sbomEntriesTable).where(
      or(ilike(sbomEntriesTable.name, pat), ilike(sbomEntriesTable.supplier, pat), ilike(sbomEntriesTable.cve, pat))
    ).limit(6),
  ]);

  res.json({ checklist, roadmap, applications, aibom, sbom });
});

export default router;
