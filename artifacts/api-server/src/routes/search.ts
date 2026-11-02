import { Router } from "express";
import { db, checklistItemsTable, roadmapItemsTable, applicationsTable, aibomEntriesTable, sbomEntriesTable } from "@workspace/db";
import { ilike, or, isNull, eq, and, sql } from "drizzle-orm";
import { getAccess, can } from "../lib/rbac";

const router = Router();

router.get("/search", async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").replace(/\s+/g, " ").trim();
  const EMPTY = { checklist: [], roadmap: [], applications: [], aibom: [], sbom: [], assets: [], people: [], vendors: [], licenses: [], contracts: [], handovers: [] };
  if (!q || q.length < 2) { res.json(EMPTY); return; }

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

  // IT Assets — only the modules this user can read
  const acc = await getAccess(req).catch(() => null);
  const may = (m: string) => !!acc && can(acc, m, "read");
  const rows = (r: any) => (r.rows ?? r) as any[];
  const run = async (m: string, query: any) => (may(m) ? rows(await db.execute(query)) : []);
  const like = `%${q.toLowerCase()}%`;
  const [assets, people, vendors, licenses, contracts, handovers] = await Promise.all([
    run("asset_registry", sql`SELECT id, asset_tag AS tag, name AS title, concat_ws(' · ', asset_tag, type, serial_number, coalesce(owner_name, 'in stock'), location) AS sub, department AS business, status
      FROM assets WHERE is_active AND (lower(asset_tag) LIKE ${like} OR lower(name) LIKE ${like} OR lower(coalesce(serial_number,'')) LIKE ${like} OR lower(coalesce(owner_name,'')) LIKE ${like}
      OR lower(coalesce(owner_employee_code,'')) LIKE ${like} OR lower(coalesce(location,'')) LIKE ${like} OR lower(coalesce(vendor_name,'')) LIKE ${like} OR lower(coalesce(configuration,'')) LIKE ${like}
      OR lower(coalesce(ip_address,'')) LIKE ${like} OR lower(type) LIKE ${like}) ORDER BY (lower(asset_tag) = ${q.toLowerCase()}) DESC, asset_tag LIMIT 8`),
    run("asset_allocations", sql`SELECT min(id) AS id, coalesce(employee_code, user_name) AS code, user_name AS title, concat_ws(' · ', employee_code, designation, email) AS sub, max(department) AS business,
      count(*) FILTER (WHERE status = 'Active')::text || ' with them' AS status
      FROM asset_allocations WHERE lower(coalesce(user_name,'')) LIKE ${like} OR lower(coalesce(employee_code,'')) LIKE ${like} OR lower(coalesce(email,'')) LIKE ${like}
      GROUP BY coalesce(employee_code, user_name), user_name, employee_code, designation, email ORDER BY user_name LIMIT 6`),
    run("asset_vendors", sql`SELECT id, name AS title, concat_ws(' · ', contact_person, email, phone) AS sub, NULL AS business, status FROM asset_vendors WHERE is_active AND (lower(name) LIKE ${like} OR lower(coalesce(contact_person,'')) LIKE ${like} OR lower(coalesce(email,'')) LIKE ${like}) ORDER BY name LIMIT 6`),
    run("asset_licenses", sql`SELECT id, product_name AS title, concat_ws(' · ', edition, vendor_name, seats_used || '/' || seats_total || ' seats') AS sub, NULL AS business, status FROM asset_licenses WHERE is_active AND (lower(product_name) LIKE ${like} OR lower(coalesce(vendor_name,'')) LIKE ${like}) ORDER BY product_name LIMIT 6`),
    run("asset_contracts", sql`SELECT id, title, concat_ws(' · ', contract_no, contract_type, vendor_name) AS sub, NULL AS business, status FROM asset_contracts WHERE is_active AND (lower(title) LIKE ${like} OR lower(coalesce(contract_no,'')) LIKE ${like} OR lower(coalesce(vendor_name,'')) LIKE ${like}) ORDER BY contract_no LIMIT 6`),
    run("asset_allocations", sql`SELECT al.id, al.handover_no AS code, concat_ws(' — ', al.handover_no, a.asset_tag) AS title, concat_ws(' · ', al.user_name, a.name) AS sub, NULL AS business, al.status
      FROM asset_allocations al JOIN assets a ON a.id = al.asset_id WHERE lower(coalesce(al.handover_no,'')) LIKE ${like} ORDER BY al.id DESC LIMIT 6`),
  ]);
  res.json({ checklist, roadmap, applications, aibom, sbom, assets, people, vendors, licenses, contracts, handovers });
});

export default router;
