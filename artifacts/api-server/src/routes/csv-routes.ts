import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  checklistItemsTable,
  roadmapItemsTable,
  roadmapUploadBatchesTable,
  auditLogsTable,
  applicationsTable,
  retirementsTable,
  aibomEntriesTable,
  sbomEntriesTable,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "./auth";
import { getPerformedBy } from "./audit-logs";
import { fmtDate, fmtCell } from "../lib/dates";

const router = Router();

// ─── CSV Utilities ────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (raw: unknown): string => {
    const v = fmtCell(raw);
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = columns.join(",");
  const body = rows.map(r => columns.map(c => escape(r[c])).join(",")).join("\n");
  return header + "\n" + body;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? "").trim(); });
    return row;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function num(v: string): number { return v ? (parseInt(v, 10) || 0) : 0; }
function bool(v: string): boolean { return v?.toLowerCase() === "true" || v === "1"; }

/**
 * Normalise any date string to ISO YYYY-MM-DD for PostgreSQL date columns.
 * Accepts: dd-MMM-yyyy  DD-MM-YYYY  DD/MM/YYYY  YYYY-MM-DD  YYYY/MM/DD
 * Returns null when the input is empty or unparseable.
 */
function parseDate(v: string): string | null {
  if (!v?.trim()) return null;
  const s = v.trim();
  // Already ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // dd-MMM-yyyy (05-Nov-2026), "5 Nov 2026"
  const mon = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/, ]+(\d{4})$/);
  if (mon) { const mi = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(mon[2].toLowerCase()); if (mi >= 0) return `${mon[3]}-${String(mi + 1).padStart(2, "0")}-${mon[1].padStart(2, "0")}`; }
  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

// ─── CHECKLIST ────────────────────────────────────────────────────────────────

const CHECKLIST_COLS = ["category", "feature", "business", "currentApp", "status", "priority", "comments"];

router.get("/checklist/export", async (_req, res): Promise<void> => {
  const rows = await db.select().from(checklistItemsTable);
  const csv = toCSV(rows.map(r => ({
    category: r.category, feature: r.feature, business: r.business,
    currentApp: r.currentApp ?? "", status: r.status, priority: r.priority,
    comments: r.comments ?? "",
  })), CHECKLIST_COLS);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="checklist.csv"');
  res.send(csv);
});

router.post("/checklist/preview-import", requireAdmin, async (req, res): Promise<void> => {
  const { csv } = req.body as { csv: string };
  const rows = parseCSV(csv);
  const valid: typeof rows = [], errors: string[] = [];
  rows.forEach((r, i) => {
    if (!r.feature?.trim()) errors.push(`Row ${i + 2}: feature is required`);
    else valid.push(r);
  });
  res.json({ total: rows.length, valid: valid.length, errors, sample: valid.slice(0, 5) });
});

router.post("/checklist/import", requireAdmin, async (req, res): Promise<void> => {
  const { csv } = req.body as { csv: string };
  const rows = parseCSV(csv);
  const createdBy = await getPerformedBy((req.session as any).userId);
  let imported = 0, skipped = 0;
  for (const r of rows) {
    if (!r.feature?.trim()) { skipped++; continue; }
    await db.insert(checklistItemsTable).values({
      category: r.category || "General",
      feature: r.feature,
      business: r.business || "All",
      currentApp: r.currentApp || null,
      status: r.status || "Not Available",
      priority: r.priority || "Medium",
      comments: r.comments || null,
      createdBy,
      modifiedBy: createdBy,
    } as any);
    imported++;
  }
  res.json({ imported, skipped });
});

// ─── ROADMAP ──────────────────────────────────────────────────────────────────

const ROADMAP_COLS = ["title","description","phase","business","status","priority","budgetLakhs","startMonth","endMonth","startDate","endDate","isActive","owner"];

/** Convert ISO YYYY-MM-DD → dd-MMM-yyyy for export (re-import accepts it) */
function formatDateForExport(iso: unknown): string {
  return iso ? fmtDate(String(iso).slice(0, 10)) : "";
}

router.get("/roadmap/export", async (_req, res): Promise<void> => {
  const rows = await db.select().from(roadmapItemsTable).where(eq(roadmapItemsTable.isActive, true));
  const csv = toCSV(rows.map(r => ({
    title: r.title, description: r.description ?? "", phase: r.phase,
    business: r.business, status: r.status, priority: r.priority,
    budgetLakhs: r.budgetLakhs, startMonth: r.startMonth, endMonth: r.endMonth,
    startDate: formatDateForExport(r.startDate), endDate: formatDateForExport(r.endDate),
    isActive: r.isActive, owner: r.owner ?? "",
  })), ROADMAP_COLS);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="roadmap.csv"');
  res.send(csv);
});

router.post("/roadmap/preview-import", requireAdmin, async (req, res): Promise<void> => {
  const { csv } = req.body as { csv: string };
  const rows = parseCSV(csv);
  const valid: typeof rows = [], errors: string[] = [];
  rows.forEach((r, i) => {
    if (!r.title?.trim()) errors.push(`Row ${i + 2}: title is required`);
    else if (!r.phase?.trim()) errors.push(`Row ${i + 2}: phase is required`);
    else valid.push(r);
  });
  res.json({ total: rows.length, valid: valid.length, errors, sample: valid.slice(0, 5) });
});

router.post("/roadmap/import", requireAdmin, async (req, res): Promise<void> => {
  const { csv, fileName } = req.body as { csv: string; fileName?: string };
  const rows = parseCSV(csv);
  const createdBy = await getPerformedBy((req.session as any).userId);

  // Archive all currently active records
  const now = new Date();
  const activeRows = await db.select({ id: roadmapItemsTable.id })
    .from(roadmapItemsTable)
    .where(eq(roadmapItemsTable.isActive, true));
  const archivedCount = activeRows.length;
  if (archivedCount > 0) {
    await db.update(roadmapItemsTable)
      .set({ isActive: false, archivedAt: now, archivedBy: createdBy, updatedAt: now } as any)
      .where(eq(roadmapItemsTable.isActive, true));
  }

  // Create upload batch record (stores the file content for history)
  const [batch] = await db.insert(roadmapUploadBatchesTable).values({
    fileName: fileName || "roadmap.csv",
    fileContent: csv,
    uploadedBy: createdBy,
    rowCount: rows.length,
    importedCount: 0,
    skippedCount: 0,
    archivedCount,
    rowErrors: "[]",
  } as any).returning();

  let imported = 0, skipped = 0;
  const rowErrors: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.title?.trim() || !r.phase?.trim()) { skipped++; continue; }
    try {
      await db.insert(roadmapItemsTable).values({
        title: r.title.trim(), description: r.description?.trim() || null,
        phase: r.phase.trim(), business: (r.business?.trim()) || "All",
        status: r.status?.trim() || "Planning", priority: r.priority?.trim() || "Medium",
        budgetLakhs: num(r.budgetLakhs),
        startMonth: num(r.startMonth) || 1,
        endMonth: num(r.endMonth) || 6,
        startDate: parseDate(r.startDate),
        endDate: parseDate(r.endDate),
        isActive: r.isActive !== undefined ? bool(r.isActive) : true,
        owner: r.owner?.trim() || null,
        uploadBatchId: batch.id,
        createdBy,
        modifiedBy: createdBy,
      } as any);
      imported++;
    } catch (err: any) {
      rowErrors.push(`Row ${i + 2}: ${err?.message ?? "Insert failed"}`);
      skipped++;
    }
  }

  // Update batch record with final counts
  await db.update(roadmapUploadBatchesTable)
    .set({ importedCount: imported, skippedCount: skipped, rowErrors: JSON.stringify(rowErrors) } as any)
    .where(eq(roadmapUploadBatchesTable.id, batch.id));

  // Audit log
  await db.insert(auditLogsTable).values({
    entityType: "roadmap", entityId: batch.id, action: "import",
    performedBy: createdBy,
    summary: `Roadmap CSV imported: ${imported} rows added, ${archivedCount} previous records archived`,
    newValues: { fileName: fileName || "roadmap.csv", imported, skipped, archivedCount, rowErrors } as any,
  });

  res.json({ imported, skipped, archivedCount, batchId: batch.id, rowErrors });
});

// ─── RETIREMENTS ──────────────────────────────────────────────────────────────

const RET_COLS = ["appName","status","retirementDate","reason","vendor","hostingType","owner","notes"];

router.get("/retirements/export", async (_req, res): Promise<void> => {
  const rows = await db.select().from(retirementsTable);
  const csv = toCSV(rows.map(r => ({
    appName: r.appName, status: r.status,
    retirementDate: r.retirementDate ?? "", reason: r.reason ?? "",
    vendor: r.vendor ?? "", hostingType: r.hostingType ?? "",
    owner: r.owner ?? "", notes: r.notes ?? "",
  })), RET_COLS);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="retirements.csv"');
  res.send(csv);
});

router.post("/retirements/preview-import", requireAdmin, async (req, res): Promise<void> => {
  const { csv } = req.body as { csv: string };
  const rows = parseCSV(csv);
  const valid: typeof rows = [], errors: string[] = [];
  rows.forEach((r, i) => {
    if (!r.appName?.trim()) errors.push(`Row ${i + 2}: appName is required`);
    else valid.push(r);
  });
  res.json({ total: rows.length, valid: valid.length, errors, sample: valid.slice(0, 5) });
});

router.post("/retirements/import", requireAdmin, async (req, res): Promise<void> => {
  const { csv } = req.body as { csv: string };
  const rows = parseCSV(csv);
  let imported = 0, skipped = 0;
  for (const r of rows) {
    if (!r.appName?.trim()) { skipped++; continue; }
    await db.insert(retirementsTable).values({
      appName: r.appName, status: r.status || "Planned",
      retirementDate: r.retirementDate || null,
      reason: r.reason || null, vendor: r.vendor || null,
      hostingType: r.hostingType || null, owner: r.owner || null,
      notes: r.notes || null,
    });
    imported++;
  }
  res.json({ imported, skipped });
});

// ─── APPLICATIONS ─────────────────────────────────────────────────────────────

const APP_COLS = ["name","description","category","vendor","lifecycle","hosting","department","criticalityLevel","supportStatus","licenseType","annualCostLakhs","dataClassification","userCount","owner","notes"];

router.get("/applications/export", async (_req, res): Promise<void> => {
  const rows = await db.select().from(applicationsTable);
  const csv = toCSV(rows.map(r => ({
    name: r.name, description: r.description ?? "",
    category: r.category ?? "", vendor: r.vendor ?? "",
    lifecycle: r.lifecycle ?? "", hosting: r.hosting ?? "",
    department: r.department ?? "", criticalityLevel: r.criticalityLevel ?? "",
    supportStatus: r.supportStatus ?? "", licenseType: r.licenseType ?? "",
    annualCostLakhs: r.annualCostLakhs ?? "",
    dataClassification: r.dataClassification ?? "",
    userCount: r.userCount ?? "", owner: r.owner ?? "", notes: r.notes ?? "",
  })), APP_COLS);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="applications.csv"');
  res.send(csv);
});

router.post("/applications/preview-import", requireAdmin, async (req, res): Promise<void> => {
  const { csv } = req.body as { csv: string };
  const rows = parseCSV(csv);
  const valid: typeof rows = [], errors: string[] = [];
  rows.forEach((r, i) => {
    if (!r.name?.trim()) errors.push(`Row ${i + 2}: name is required`);
    else valid.push(r);
  });
  res.json({ total: rows.length, valid: valid.length, errors, sample: valid.slice(0, 5) });
});

router.post("/applications/import", requireAdmin, async (req, res): Promise<void> => {
  const { csv } = req.body as { csv: string };
  const rows = parseCSV(csv);
  let imported = 0, skipped = 0;
  for (const r of rows) {
    if (!r.name?.trim()) { skipped++; continue; }
    await db.insert(applicationsTable).values({
      name: r.name, description: r.description || null,
      category: r.category || null, vendor: r.vendor || null,
      lifecycle: r.lifecycle || null, hosting: r.hosting || null,
      department: r.department || null, criticalityLevel: r.criticalityLevel || null,
      supportStatus: r.supportStatus || null, licenseType: r.licenseType || null,
      annualCostLakhs: r.annualCostLakhs ? num(r.annualCostLakhs) : null,
      dataClassification: r.dataClassification || null,
      userCount: r.userCount ? num(r.userCount) : null,
      owner: r.owner || null, notes: r.notes || null,
    });
    imported++;
  }
  res.json({ imported, skipped });
});

// ─── AIBOM ────────────────────────────────────────────────────────────────────

const AIBOM_COLS = ["name","category","vendor","version","purpose","dataClassification","riskLevel","complianceStatus","apiEndpoint","owner","notes"];

router.get("/aibom/export", async (_req, res): Promise<void> => {
  const rows = await db.select().from(aibomEntriesTable);
  const csv = toCSV(rows.map(r => ({
    name: r.name, category: r.category ?? "",
    vendor: r.vendor ?? "", version: r.version ?? "",
    purpose: r.purpose ?? "", dataClassification: r.dataClassification ?? "",
    riskLevel: r.riskLevel ?? "", complianceStatus: r.complianceStatus ?? "",
    apiEndpoint: r.apiEndpoint ?? "", owner: r.owner ?? "", notes: r.notes ?? "",
  })), AIBOM_COLS);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="aibom.csv"');
  res.send(csv);
});

router.post("/aibom/preview-import", requireAdmin, async (req, res): Promise<void> => {
  const { csv } = req.body as { csv: string };
  const rows = parseCSV(csv);
  const valid: typeof rows = [], errors: string[] = [];
  rows.forEach((r, i) => {
    if (!r.name?.trim()) errors.push(`Row ${i + 2}: name is required`);
    else valid.push(r);
  });
  res.json({ total: rows.length, valid: valid.length, errors, sample: valid.slice(0, 5) });
});

router.post("/aibom/import", requireAdmin, async (req, res): Promise<void> => {
  const { csv } = req.body as { csv: string };
  const rows = parseCSV(csv);
  let imported = 0, skipped = 0;
  for (const r of rows) {
    if (!r.name?.trim()) { skipped++; continue; }
    await db.insert(aibomEntriesTable).values({
      name: r.name, category: r.category || null,
      vendor: r.vendor || null, version: r.version || null,
      purpose: r.purpose || null, dataClassification: r.dataClassification || null,
      riskLevel: r.riskLevel || null, complianceStatus: r.complianceStatus || null,
      apiEndpoint: r.apiEndpoint || null, owner: r.owner || null, notes: r.notes || null,
    });
    imported++;
  }
  res.json({ imported, skipped });
});

// ─── SBOM ─────────────────────────────────────────────────────────────────────

const SBOM_COLS = ["packageName","version","vendor","license","riskLevel","cve","complianceStatus","patchStatus","usedIn","owner","notes"];

router.get("/sbom/export", async (_req, res): Promise<void> => {
  const rows = await db.select().from(sbomEntriesTable);
  const csv = toCSV(rows.map(r => ({
    packageName: r.packageName, version: r.version ?? "",
    vendor: r.vendor ?? "", license: r.license ?? "",
    riskLevel: r.riskLevel ?? "", cve: r.cve ?? "",
    complianceStatus: r.complianceStatus ?? "",
    patchStatus: r.patchStatus ?? "", usedIn: r.usedIn ?? "",
    owner: r.owner ?? "", notes: r.notes ?? "",
  })), SBOM_COLS);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="sbom.csv"');
  res.send(csv);
});

router.post("/sbom/preview-import", requireAdmin, async (req, res): Promise<void> => {
  const { csv } = req.body as { csv: string };
  const rows = parseCSV(csv);
  const valid: typeof rows = [], errors: string[] = [];
  rows.forEach((r, i) => {
    if (!r.packageName?.trim()) errors.push(`Row ${i + 2}: packageName is required`);
    else valid.push(r);
  });
  res.json({ total: rows.length, valid: valid.length, errors, sample: valid.slice(0, 5) });
});

router.post("/sbom/import", requireAdmin, async (req, res): Promise<void> => {
  const { csv } = req.body as { csv: string };
  const rows = parseCSV(csv);
  let imported = 0, skipped = 0;
  for (const r of rows) {
    if (!r.packageName?.trim()) { skipped++; continue; }
    await db.insert(sbomEntriesTable).values({
      packageName: r.packageName, version: r.version || null,
      vendor: r.vendor || null, license: r.license || null,
      riskLevel: r.riskLevel || null, cve: r.cve || null,
      complianceStatus: r.complianceStatus || null,
      patchStatus: r.patchStatus || null, usedIn: r.usedIn || null,
      owner: r.owner || null, notes: r.notes || null,
    });
    imported++;
  }
  res.json({ imported, skipped });
});

export default router;
