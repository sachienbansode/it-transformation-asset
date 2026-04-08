import { Router } from "express";
import { db, checklistItemsTable, roadmapItemsTable, applicationsTable, retirementsTable, aibomEntriesTable, sbomEntriesTable, settingsTable } from "@workspace/db";
import { requireAuth } from "./auth";
import PptxGenJS from "pptxgenjs";

const router = Router();

// ─── Brand colors ─────────────────────────────────────────────────────────────
const BRAND = {
  primary: "B8860B",       // dark gold
  primaryLight: "F5DEB3",  // wheat
  dark: "1E293B",          // slate-800
  darkAlt: "334155",       // slate-700
  accent: "2563EB",        // blue
  success: "16A34A",       // green
  warning: "D97706",       // amber
  danger: "DC2626",        // red
  purple: "9333EA",        // purple
  light: "F8FAFC",         // very light gray
  white: "FFFFFF",
  muted: "94A3B8",         // slate-400
  border: "E2E8F0",        // slate-200
};

const W = 13.33; // slide width in inches (widescreen 16:9)
const H = 7.5;   // slide height in inches

// ─── Helpers ─────────────────────────────────────────────────────────────────
function groupBy<T>(arr: T[], key: keyof T) {
  const map: Record<string, number> = {};
  for (const item of arr) {
    const val = String((item as any)[key] ?? "Unknown");
    map[val] = (map[val] ?? 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function addBrandedSlide(pptx: PptxGenJS, config: { logo?: string }) {
  const slide = pptx.addSlide();
  // Top bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: W, h: 0.45, fill: { color: BRAND.dark }, line: { color: BRAND.dark }
  });
  // Bottom bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: H - 0.3, w: W, h: 0.3, fill: { color: BRAND.primary }, line: { color: BRAND.primary }
  });
  // Brand name in top bar
  slide.addText("ASHIKA GROUP", {
    x: 0.2, y: 0.05, w: 4, h: 0.35,
    fontSize: 10, bold: true, color: BRAND.primaryLight, fontFace: "Calibri",
  });
  // Date in top bar (right)
  slide.addText(new Date().toLocaleDateString("en-IN", { dateStyle: "long" }), {
    x: W - 3.5, y: 0.05, w: 3.3, h: 0.35, align: "right",
    fontSize: 9, color: BRAND.muted, fontFace: "Calibri",
  });
  // Confidential footer
  slide.addText("CONFIDENTIAL – Ashika Group Internal Use Only", {
    x: 0, y: H - 0.28, w: W, h: 0.26, align: "center",
    fontSize: 8, color: BRAND.white, fontFace: "Calibri",
  });
  return slide;
}

function addSectionHeading(slide: any, title: string, subtitle?: string) {
  slide.addShape("rect", {
    x: 0.35, y: 0.55, w: 0.06, h: subtitle ? 0.9 : 0.55,
    fill: { color: BRAND.primary }, line: { color: BRAND.primary }
  });
  slide.addText(title, {
    x: 0.55, y: 0.55, w: W - 0.8, h: 0.45,
    fontSize: 18, bold: true, color: BRAND.dark, fontFace: "Calibri",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.55, y: 1.0, w: W - 0.8, h: 0.35,
      fontSize: 11, color: BRAND.muted, fontFace: "Calibri",
    });
  }
}

function kpiBox(slide: any, x: number, y: number, w: number, h: number, label: string, value: string, color: string, sub?: string) {
  slide.addShape("rect", {
    x, y, w, h, fill: { color: BRAND.white },
    line: { color: color, width: 1.5 }, shadow: { type: "outer", blur: 3, offset: 1, angle: 45, color: "D1D5DB", opacity: 0.5 }
  });
  slide.addShape("rect", { x, y, w: 0.06, h, fill: { color }, line: { color } });
  slide.addText(value, {
    x: x + 0.15, y: y + 0.1, w: w - 0.2, h: h * 0.5,
    fontSize: 24, bold: true, color, fontFace: "Calibri",
  });
  slide.addText(label, {
    x: x + 0.15, y: y + h * 0.55, w: w - 0.2, h: h * 0.28,
    fontSize: 9, bold: true, color: BRAND.dark, fontFace: "Calibri",
  });
  if (sub) {
    slide.addText(sub, {
      x: x + 0.15, y: y + h * 0.78, w: w - 0.2, h: h * 0.2,
      fontSize: 8, color: BRAND.muted, fontFace: "Calibri",
    });
  }
}

// ─── Generate PPT ─────────────────────────────────────────────────────────────
router.get("/reports/ppt", requireAuth, async (req, res): Promise<void> => {
  const { business, phase, includeModules } = req.query as Record<string, string>;
  const modules = includeModules ? includeModules.split(",") : ["apps", "roadmap", "checklist", "retirement", "security"];

  // Fetch all data
  const [checklistRaw, roadmapRaw, appsRaw, retirementsRaw, aibomRaw, sbomRaw, settings] = await Promise.all([
    db.select().from(checklistItemsTable),
    db.select().from(roadmapItemsTable),
    db.select().from(applicationsTable),
    db.select().from(retirementsTable),
    db.select().from(aibomEntriesTable),
    db.select().from(sbomEntriesTable),
    db.select().from(settingsTable),
  ]);

  // Apply filters
  const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
  const appName = settingsMap["app_name"] || "Ashika Group";
  const logoUrl = settingsMap["logo_url"] || "";

  const checklist = business
    ? checklistRaw.filter(c => c.business === business)
    : checklistRaw;

  const roadmap = (business
    ? roadmapRaw.filter(r => r.business === business)
    : roadmapRaw).filter(r =>
      !phase || phase === "all" || r.phase === phase
    );

  const apps = business
    ? appsRaw.filter(a => a.business === business)
    : appsRaw;

  const retirements = business
    ? retirementsRaw.filter(r => r.business === business)
    : retirementsRaw;

  // ─── Build PPT ─────────────────────────────────────────────────────────────
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = appName;
  pptx.company = appName;
  pptx.subject = "IT Transformation Planning Suite";
  (pptx as any).title = `${appName} – IT Transformation Report`;

  // ── SLIDE 1: Title ─────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    // Full dark background
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: W, h: H, fill: { color: BRAND.dark }, line: { color: BRAND.dark }
    });
    // Gold accent bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: H * 0.55, w: W, h: 0.08, fill: { color: BRAND.primary }, line: { color: BRAND.primary }
    });
    // Company name
    slide.addText(appName.toUpperCase(), {
      x: 0.8, y: 1.6, w: W - 1.6, h: 0.8,
      fontSize: 36, bold: true, color: BRAND.primaryLight, fontFace: "Calibri", align: "center",
    });
    // Report title
    slide.addText("IT Transformation\nPlanning Report", {
      x: 0.8, y: 2.5, w: W - 1.6, h: 1.2,
      fontSize: 44, bold: true, color: BRAND.white, fontFace: "Calibri", align: "center",
    });
    // Date + filters
    const filterText = [
      business ? `Business Unit: ${business}` : "All Business Units",
      phase && phase !== "all" ? `Phase: ${phase}` : "All Phases",
    ].join("  ·  ");
    slide.addText(filterText, {
      x: 0.8, y: 4.0, w: W - 1.6, h: 0.4,
      fontSize: 13, color: BRAND.muted, fontFace: "Calibri", align: "center",
    });
    slide.addText(new Date().toLocaleDateString("en-IN", { dateStyle: "full" }), {
      x: 0.8, y: 4.45, w: W - 1.6, h: 0.4,
      fontSize: 13, color: BRAND.muted, fontFace: "Calibri", align: "center",
    });
    // Confidential
    slide.addText("CONFIDENTIAL – FOR INTERNAL USE ONLY", {
      x: 0.8, y: H - 0.6, w: W - 1.6, h: 0.3,
      fontSize: 9, color: BRAND.muted, fontFace: "Calibri", align: "center",
    });
  }

  // ── SLIDE 2: Agenda ─────────────────────────────────────────────────────────
  {
    const slide = addBrandedSlide(pptx, { logo: logoUrl });
    addSectionHeading(slide, "Agenda", "Topics covered in this presentation");

    const agendaItems = [
      { n: "01", title: "Executive Summary", desc: "KPI overview and programme highlights" },
      modules.includes("apps") ? { n: "02", title: "Current IT Landscape", desc: "Application inventory, hosting, criticality breakdown" } : null,
      modules.includes("roadmap") ? { n: "03", title: "Transformation Roadmap", desc: "Phase-wise initiatives, budget, and status" } : null,
      modules.includes("checklist") ? { n: "04", title: "Digital Readiness Checklist", desc: "Business unit readiness scores" } : null,
      modules.includes("retirement") ? { n: "05", title: "Application Retirement Pipeline", desc: "Legacy decommissioning plan" } : null,
      modules.includes("security") ? { n: "06", title: "Security Posture", desc: "SBOM vulnerabilities and AI risk landscape" } : null,
      { n: "07", title: "Proposed IT Landscape", desc: "Target state and strategic direction" },
      { n: "08", title: "Key Actions & Next Steps", desc: "Immediate priorities and owners" },
    ].filter(Boolean) as { n: string; title: string; desc: string }[];

    const cols = 2;
    const itemW = (W - 1.1) / cols;
    const itemH = 0.9;
    const startY = 1.5;

    agendaItems.forEach((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = 0.45 + col * (itemW + 0.1);
      const y = startY + row * (itemH + 0.12);

      slide.addShape("rect", {
        x, y, w: itemW, h: itemH,
        fill: { color: BRAND.light }, line: { color: BRAND.border },
      });
      slide.addShape("rect", {
        x, y, w: 0.06, h: itemH,
        fill: { color: BRAND.primary }, line: { color: BRAND.primary },
      });
      slide.addText(item.n, {
        x: x + 0.12, y: y + 0.05, w: 0.5, h: 0.4,
        fontSize: 22, bold: true, color: BRAND.primary, fontFace: "Calibri",
      });
      slide.addText(item.title, {
        x: x + 0.65, y: y + 0.08, w: itemW - 0.75, h: 0.35,
        fontSize: 12, bold: true, color: BRAND.dark, fontFace: "Calibri",
      });
      slide.addText(item.desc, {
        x: x + 0.65, y: y + 0.45, w: itemW - 0.75, h: 0.35,
        fontSize: 9, color: BRAND.muted, fontFace: "Calibri",
      });
    });
  }

  // ── SLIDE 3: Executive Summary ──────────────────────────────────────────────
  {
    const slide = addBrandedSlide(pptx, { logo: logoUrl });
    addSectionHeading(slide, "Executive Summary", "Programme KPIs at a glance");

    const totalBudget = roadmap.reduce((s, i) => s + (i.budgetLakhs ?? 0), 0);
    const completedRoadmap = roadmap.filter(r => r.status === "Completed").length;
    const checklistAvailable = checklist.filter(c => c.status === "Available").length;
    const completionPct = checklist.length ? Math.round((checklistAvailable / checklist.length) * 100) : 0;
    const critCves = sbomRaw.filter(s => s.cve && s.cve !== "None" && s.riskLevel === "Critical").length;

    const kpis = [
      { label: "Total Applications", value: String(apps.length), color: BRAND.accent, sub: "in inventory" },
      { label: "Roadmap Initiatives", value: String(roadmap.length), color: BRAND.warning, sub: `${completedRoadmap} completed` },
      { label: "Total Budget", value: `₹ ${totalBudget}L`, color: BRAND.primary, sub: "allocated" },
      { label: "Checklist Progress", value: `${completionPct}%`, color: BRAND.success, sub: `${checklistAvailable}/${checklist.length} available` },
      { label: "Pending Retirements", value: String(retirements.filter(r => r.status !== "Completed").length), color: "EA580C", sub: "apps to decommission" },
      { label: "Critical CVEs", value: String(critCves), color: BRAND.danger, sub: "security vulnerabilities" },
    ];

    const boxW = (W - 0.8) / 3;
    const boxH = 1.35;
    const row1Y = 1.6, row2Y = 3.15;
    kpis.slice(0, 3).forEach((k, i) => kpiBox(slide, 0.35 + i * (boxW + 0.05), row1Y, boxW, boxH, k.label, k.value, k.color, k.sub));
    kpis.slice(3, 6).forEach((k, i) => kpiBox(slide, 0.35 + i * (boxW + 0.05), row2Y, boxW, boxH, k.label, k.value, k.color, k.sub));

    // Summary text
    slide.addText(`This report covers the IT Transformation programme for ${appName}${business ? ` – ${business} business unit` : ""}. The roadmap spans ${[...new Set(roadmap.map(r => r.phase))].length} phases with a total budget of ₹${totalBudget} Lakhs across ${roadmap.length} strategic initiatives.`, {
      x: 0.35, y: 4.7, w: W - 0.7, h: 0.7,
      fontSize: 10, color: BRAND.muted, fontFace: "Calibri", align: "justify",
    });
  }

  // ── SLIDE 4: Current IT Landscape ──────────────────────────────────────────
  if (modules.includes("apps") && apps.length > 0) {
    const slide = addBrandedSlide(pptx, { logo: logoUrl });
    addSectionHeading(slide, "Current IT Landscape", `${apps.length} applications in inventory`);

    // By hosting
    const byHosting = groupBy(apps, "hosting").slice(0, 5);
    // By criticality
    const byCrit = groupBy(apps, "criticality").slice(0, 5);
    // By category
    const byCat = groupBy(apps, "category").slice(0, 5);
    // By status
    const byStatus = groupBy(apps, "applicationStatus" as any).slice(0, 4);

    const critColors: Record<string, string> = { Critical: BRAND.danger, High: "EA580C", Medium: BRAND.warning, Low: BRAND.success };

    // Table: Top apps
    const topApps = apps.slice(0, 10);
    const tableData: PptxGenJS.TableRow[] = [
      [
        { text: "App ID", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Name", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Business", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Hosting", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Criticality", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Status", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
      ],
      ...topApps.map((a, i) => [
        { text: a.appId || "", options: { fontSize: 8, fontFace: "Calibri Mono", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        { text: a.name || "", options: { fontSize: 8, bold: true, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        { text: a.business || "", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        { text: a.hosting || "", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        { text: a.criticality || "", options: { fontSize: 8, fontFace: "Calibri", color: critColors[a.criticality] || BRAND.muted, fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        { text: (a as any).applicationStatus || "Active", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
      ] as PptxGenJS.TableCell[]),
    ];

    slide.addTable(tableData, {
      x: 0.35, y: 1.5, w: W - 0.7, h: 4.5,
      colW: [1.2, 2.4, 1.6, 1.4, 1.2, 1.0],
      border: { type: "solid", color: BRAND.border, pt: 0.5 },
      autoPage: false,
    });

    if (apps.length > 10) {
      slide.addText(`+ ${apps.length - 10} more applications not shown`, {
        x: 0.35, y: 6.15, w: W - 0.7, h: 0.25,
        fontSize: 8, color: BRAND.muted, align: "right", fontFace: "Calibri",
      });
    }
  }

  // ── SLIDE 5: Application Breakdown ─────────────────────────────────────────
  if (modules.includes("apps") && apps.length > 0) {
    const slide = addBrandedSlide(pptx, { logo: logoUrl });
    addSectionHeading(slide, "Application Portfolio Analysis", "Breakdown by hosting, criticality and category");

    const byHosting = groupBy(apps, "hosting").slice(0, 6);
    const byCrit = groupBy(apps, "criticality").slice(0, 5);
    const byCat = groupBy(apps, "category").slice(0, 6);

    const sectionY = 1.6;
    const sectionH = 4.8;

    // Hosting column
    slide.addText("By Hosting", { x: 0.35, y: sectionY, w: 4, h: 0.3, fontSize: 11, bold: true, color: BRAND.dark, fontFace: "Calibri" });
    byHosting.forEach(([label, count], i) => {
      const pct = Math.round((count / apps.length) * 100);
      const barW = ((W * 0.28) - 0.4) * (pct / 100);
      const y = sectionY + 0.4 + i * 0.65;
      slide.addText(`${label}`, { x: 0.35, y, w: 2, h: 0.3, fontSize: 9, color: BRAND.dark, fontFace: "Calibri" });
      slide.addShape("rect", { x: 0.35, y: y + 0.28, w: (W * 0.28) - 0.4, h: 0.2, fill: { color: BRAND.border }, line: { color: BRAND.border } });
      slide.addShape("rect", { x: 0.35, y: y + 0.28, w: Math.max(0.1, barW), h: 0.2, fill: { color: BRAND.accent }, line: { color: BRAND.accent } });
      slide.addText(`${count} (${pct}%)`, { x: 0.35 + (W * 0.28) - 0.3, y, w: 1.2, h: 0.3, fontSize: 8, color: BRAND.muted, fontFace: "Calibri" });
    });

    // Criticality column
    const c2x = 0.35 + W * 0.3;
    slide.addText("By Criticality", { x: c2x, y: sectionY, w: 4, h: 0.3, fontSize: 11, bold: true, color: BRAND.dark, fontFace: "Calibri" });
    const critColorsMap: Record<string, string> = { Critical: BRAND.danger, High: "EA580C", Medium: BRAND.warning, Low: BRAND.success };
    byCrit.forEach(([label, count], i) => {
      const pct = Math.round((count / apps.length) * 100);
      const barW = ((W * 0.28) - 0.4) * (pct / 100);
      const y = sectionY + 0.4 + i * 0.65;
      slide.addText(`${label}`, { x: c2x, y, w: 2, h: 0.3, fontSize: 9, color: BRAND.dark, fontFace: "Calibri" });
      slide.addShape("rect", { x: c2x, y: y + 0.28, w: (W * 0.28) - 0.4, h: 0.2, fill: { color: BRAND.border }, line: { color: BRAND.border } });
      slide.addShape("rect", { x: c2x, y: y + 0.28, w: Math.max(0.1, barW), h: 0.2, fill: { color: critColorsMap[label] || BRAND.accent }, line: { color: critColorsMap[label] || BRAND.accent } });
      slide.addText(`${count} (${pct}%)`, { x: c2x + (W * 0.28) - 0.3, y, w: 1.2, h: 0.3, fontSize: 8, color: BRAND.muted, fontFace: "Calibri" });
    });

    // Category column
    const c3x = 0.35 + W * 0.6;
    slide.addText("By Category", { x: c3x, y: sectionY, w: 4, h: 0.3, fontSize: 11, bold: true, color: BRAND.dark, fontFace: "Calibri" });
    byCat.forEach(([label, count], i) => {
      const pct = Math.round((count / apps.length) * 100);
      const barW = ((W * 0.34) - 0.5) * (pct / 100);
      const y = sectionY + 0.4 + i * 0.65;
      slide.addText(`${label}`, { x: c3x, y, w: 2.5, h: 0.3, fontSize: 9, color: BRAND.dark, fontFace: "Calibri" });
      slide.addShape("rect", { x: c3x, y: y + 0.28, w: (W * 0.34) - 0.5, h: 0.2, fill: { color: BRAND.border }, line: { color: BRAND.border } });
      slide.addShape("rect", { x: c3x, y: y + 0.28, w: Math.max(0.1, barW), h: 0.2, fill: { color: BRAND.purple }, line: { color: BRAND.purple } });
      slide.addText(`${count} (${pct}%)`, { x: c3x + (W * 0.34) - 0.4, y, w: 1.2, h: 0.3, fontSize: 8, color: BRAND.muted, fontFace: "Calibri" });
    });
  }

  // ── SLIDE 6: Transformation Roadmap ────────────────────────────────────────
  if (modules.includes("roadmap") && roadmap.length > 0) {
    const slide = addBrandedSlide(pptx, { logo: logoUrl });
    addSectionHeading(slide, "Transformation Roadmap", `${roadmap.length} strategic initiatives across ${[...new Set(roadmap.map(r => r.phase))].length} phases`);

    const phases = [...new Set(roadmap.map(r => r.phase).filter(Boolean))].sort();
    const phaseColors: Record<string, string> = {
      "Phase 1: Quick Wins": BRAND.success,
      "Phase 2: Core Transformation": BRAND.accent,
      "Phase 3: Innovation & Scale": BRAND.purple,
    };
    const statusColors: Record<string, string> = {
      "Completed": BRAND.success, "In Progress": BRAND.accent, "Planned": BRAND.warning, "On Hold": BRAND.muted,
    };

    let tableRows: PptxGenJS.TableRow[] = [
      [
        { text: "Initiative", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Phase", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Status", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Priority", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Budget (₹L)", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Owner", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
      ],
      ...roadmap.slice(0, 15).map((r, i) => [
        { text: r.title || "", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        { text: (r.phase || "").split(":")[0] || "", options: { fontSize: 8, fontFace: "Calibri", color: phaseColors[r.phase || ""] || BRAND.dark, fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        { text: r.status || "", options: { fontSize: 8, fontFace: "Calibri", color: statusColors[r.status || ""] || BRAND.muted, fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        { text: r.priority || "", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        { text: String(r.budgetLakhs || 0), options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        { text: r.owner || "—", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
      ] as PptxGenJS.TableCell[]),
    ];

    slide.addTable(tableRows, {
      x: 0.35, y: 1.5, w: W - 0.7, h: 5,
      colW: [3.2, 1.8, 1.2, 1.0, 1.2, 1.7],
      border: { type: "solid", color: BRAND.border, pt: 0.5 },
      autoPage: false,
    });

    // Phase budget summary at right
    const totalBudget = roadmap.reduce((s, r) => s + (r.budgetLakhs ?? 0), 0);
    slide.addText(`Total Budget: ₹${totalBudget.toLocaleString()} Lakhs`, {
      x: W - 3.5, y: H - 0.55, w: 3.1, h: 0.25,
      fontSize: 9, bold: true, color: BRAND.primary, fontFace: "Calibri", align: "right",
    });
  }

  // ── SLIDE 7: Checklist / Digital Readiness ─────────────────────────────────
  if (modules.includes("checklist") && checklist.length > 0) {
    const slide = addBrandedSlide(pptx, { logo: logoUrl });
    addSectionHeading(slide, "Digital Readiness Checklist", `${checklist.length} capabilities assessed`);

    const byBusiness = (() => {
      const map: Record<string, { total: number; available: number }> = {};
      checklist.forEach(c => {
        const bu = c.business || "Unknown";
        if (!map[bu]) map[bu] = { total: 0, available: 0 };
        map[bu].total++;
        if (c.status === "Available") map[bu].available++;
      });
      return Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
    })();

    const totalAvailable = checklist.filter(c => c.status === "Available").length;
    const completionPct = Math.round((totalAvailable / checklist.length) * 100);

    // Overall progress bar
    slide.addText(`Overall Readiness: ${completionPct}%`, {
      x: 0.35, y: 1.55, w: 6, h: 0.3, fontSize: 12, bold: true, color: BRAND.dark, fontFace: "Calibri",
    });
    slide.addShape("rect", { x: 0.35, y: 1.9, w: W - 0.7, h: 0.25, fill: { color: BRAND.border }, line: { color: BRAND.border } });
    slide.addShape("rect", { x: 0.35, y: 1.9, w: Math.max(0.1, (W - 0.7) * (completionPct / 100)), h: 0.25, fill: { color: BRAND.success }, line: { color: BRAND.success } });

    // Status breakdown
    const byStatus = groupBy(checklist, "status");
    const statusCols: Record<string, string> = { Available: BRAND.success, "Not Available": BRAND.danger, Legacy: BRAND.warning, Partial: "EA580C" };
    byStatus.forEach(([status, count], i) => {
      const x = 0.35 + i * (W - 0.7) / 4 * ((W - 0.7) / ((W - 0.7) / 4 / 1));
      const boxW = (W - 0.7) / 4 - 0.1;
      kpiBox(slide, 0.35 + i * (boxW + 0.1), 2.3, boxW, 1.1, status, String(count), statusCols[status] || BRAND.muted);
    });

    // Business unit table
    const tableRows: PptxGenJS.TableRow[] = [
      [
        { text: "Business Unit", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Total", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Available", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "% Ready", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
      ],
      ...byBusiness.map(([bu, { total, available }], i) => {
        const pct = Math.round((available / total) * 100);
        return [
          { text: bu, options: { fontSize: 9, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
          { text: String(total), options: { fontSize: 9, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
          { text: String(available), options: { fontSize: 9, color: BRAND.success, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
          { text: `${pct}%`, options: { fontSize: 9, bold: true, color: pct >= 70 ? BRAND.success : pct >= 40 ? BRAND.warning : BRAND.danger, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        ] as PptxGenJS.TableCell[];
      }),
    ];

    slide.addTable(tableRows, {
      x: 0.35, y: 3.65, w: W - 0.7, h: 3,
      colW: [4.5, 1.5, 1.8, 1.8],
      border: { type: "solid", color: BRAND.border, pt: 0.5 },
      autoPage: false,
    });
  }

  // ── SLIDE 8: Retirement Pipeline ───────────────────────────────────────────
  if (modules.includes("retirement") && retirements.length > 0) {
    const slide = addBrandedSlide(pptx, { logo: logoUrl });
    addSectionHeading(slide, "Application Retirement Pipeline", `${retirements.length} applications planned for decommissioning`);

    const pending = retirements.filter(r => r.status !== "Completed");
    const completed = retirements.filter(r => r.status === "Completed");
    const totalBudget = retirements.reduce((s, r) => s + (r.budgetLakhs ?? 0), 0);

    // Summary KPIs
    kpiBox(slide, 0.35, 1.6, 2.8, 1.1, "Planned Retirements", String(retirements.length), BRAND.dark, "total");
    kpiBox(slide, 3.35, 1.6, 2.8, 1.1, "Pending", String(pending.length), "EA580C", "in progress or planned");
    kpiBox(slide, 6.35, 1.6, 2.8, 1.1, "Completed", String(completed.length), BRAND.success, "decommissioned");
    kpiBox(slide, 9.35, 1.6, 2.8, 1.1, "Total Budget", `₹${totalBudget}L`, BRAND.primary, "migration cost");

    // Table
    const tableRows: PptxGenJS.TableRow[] = [
      [
        { text: "Application", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Business", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Reason", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Target Date", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Effort", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
        { text: "Status", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark }, fontFace: "Calibri" } },
      ],
      ...retirements.slice(0, 12).map((r, i) => {
        const stColors: Record<string, string> = { Completed: BRAND.success, "In Progress": BRAND.accent, Planned: BRAND.warning };
        return [
          { text: r.appName || "", options: { fontSize: 8, bold: true, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
          { text: r.business || "—", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
          { text: r.reason || "—", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
          { text: r.targetDate || "—", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
          { text: r.migrationEffort || "—", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
          { text: r.status || "", options: { fontSize: 8, color: stColors[r.status || ""] || BRAND.muted, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
        ] as PptxGenJS.TableCell[];
      }),
    ];

    slide.addTable(tableRows, {
      x: 0.35, y: 2.85, w: W - 0.7, h: 4,
      colW: [2.5, 1.8, 1.8, 1.4, 1.2, 1.4],
      border: { type: "solid", color: BRAND.border, pt: 0.5 },
      autoPage: false,
    });
  }

  // ── SLIDE 9: Security Posture ──────────────────────────────────────────────
  if (modules.includes("security")) {
    const slide = addBrandedSlide(pptx, { logo: logoUrl });
    addSectionHeading(slide, "Security & Compliance Posture", `${sbomRaw.length} SBOM entries · ${aibomRaw.length} AI components`);

    const critCves = sbomRaw.filter(s => s.cve && s.cve !== "None" && s.riskLevel === "Critical").length;
    const highCves = sbomRaw.filter(s => s.cve && s.cve !== "None" && s.riskLevel === "High").length;
    const highRiskAi = aibomRaw.filter(a => a.riskLevel === "High" || a.riskLevel === "Critical").length;
    const nonCompliantAi = aibomRaw.filter(a => a.complianceStatus === "Non-Compliant").length;

    kpiBox(slide, 0.35, 1.6, 2.9, 1.1, "Critical CVEs", String(critCves), BRAND.danger, "immediate action");
    kpiBox(slide, 3.45, 1.6, 2.9, 1.1, "High Severity CVEs", String(highCves), "EA580C", "review required");
    kpiBox(slide, 6.55, 1.6, 2.9, 1.1, "High Risk AI", String(highRiskAi), BRAND.purple, "AI components");
    kpiBox(slide, 9.65, 1.6, 2.7, 1.1, "Non-Compliant AI", String(nonCompliantAi), BRAND.warning, "AI compliance");

    // SBOM top CVEs
    const cveEntries = sbomRaw.filter(s => s.cve && s.cve !== "None").slice(0, 8);
    if (cveEntries.length > 0) {
      slide.addText("Known CVE Entries", { x: 0.35, y: 2.9, w: 6, h: 0.3, fontSize: 11, bold: true, color: BRAND.dark, fontFace: "Calibri" });
      const cveRows: PptxGenJS.TableRow[] = [
        [
          { text: "Package", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark } } },
          { text: "Version", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark } } },
          { text: "CVE", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark } } },
          { text: "Risk", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark } } },
          { text: "Action", options: { bold: true, color: BRAND.white, fontSize: 9, fill: { color: BRAND.dark } } },
        ],
        ...cveEntries.map((e, i) => {
          const riskCols: Record<string, string> = { Critical: BRAND.danger, High: "EA580C", Medium: BRAND.warning };
          return [
            { text: e.name || "", options: { fontSize: 8, fontFace: "Calibri Mono", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
            { text: e.version || "", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
            { text: e.cve || "", options: { fontSize: 8, fontFace: "Calibri Mono", color: BRAND.danger, fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
            { text: e.riskLevel || "", options: { fontSize: 8, color: riskCols[e.riskLevel] || BRAND.muted, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
            { text: e.actionRequired || "Review", options: { fontSize: 8, fontFace: "Calibri", fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
          ] as PptxGenJS.TableCell[];
        }),
      ];
      slide.addTable(cveRows, {
        x: 0.35, y: 3.25, w: W - 0.7, h: 3.3,
        colW: [2.8, 1.5, 2.2, 1.4, 2.4],
        border: { type: "solid", color: BRAND.border, pt: 0.5 },
        autoPage: false,
      });
    }
  }

  // ── SLIDE 10: Proposed IT Landscape ────────────────────────────────────────
  {
    const slide = addBrandedSlide(pptx, { logo: logoUrl });
    addSectionHeading(slide, "Proposed IT Landscape", "Target state after transformation");

    const inProgress = roadmap.filter(r => r.status === "In Progress");
    const planned = roadmap.filter(r => r.status === "Planned");
    const completed = roadmap.filter(r => r.status === "Completed");

    // Three column layout: Current → Transition → Target
    const cols = [
      { title: "Current State", color: BRAND.danger, items: apps.filter((a: any) => a.applicationStatus !== "Active").length > 0 ? [`${apps.length} applications in inventory`, `${retirements.length} planned for retirement`, `${aibomRaw.length} AI components identified`, `${sbomRaw.filter(s => s.cve && s.cve !== "None").length} known vulnerabilities`] : [`${apps.length} applications in inventory`, `Legacy systems identified`, `Manual processes dominant`, "Siloed data and systems"] },
      { title: "In Transition", color: BRAND.warning, items: inProgress.slice(0, 5).map(r => r.title) },
      { title: "Target State", color: BRAND.success, items: [...planned.slice(0, 3).map(r => r.title), "Automated workflows", "Cloud-native architecture", "Zero-trust security posture", "Data-driven decision making"] },
    ];

    cols.forEach((col, i) => {
      const x = 0.35 + i * ((W - 0.7) / 3 + 0.05);
      const w = (W - 0.7) / 3;
      // Header
      slide.addShape("rect", { x, y: 1.55, w, h: 0.45, fill: { color: col.color }, line: { color: col.color } });
      slide.addText(col.title, {
        x, y: 1.55, w, h: 0.45, align: "center", valign: "middle",
        fontSize: 12, bold: true, color: BRAND.white, fontFace: "Calibri",
      });
      // Items
      col.items.slice(0, 7).forEach((item, j) => {
        slide.addShape("rect", {
          x: x + 0.05, y: 2.1 + j * 0.65, w: w - 0.1, h: 0.55,
          fill: { color: BRAND.light }, line: { color: BRAND.border },
        });
        slide.addShape("rect", {
          x: x + 0.05, y: 2.1 + j * 0.65, w: 0.05, h: 0.55,
          fill: { color: col.color }, line: { color: col.color },
        });
        slide.addText(item, {
          x: x + 0.15, y: 2.1 + j * 0.65, w: w - 0.25, h: 0.55,
          fontSize: 9, color: BRAND.dark, fontFace: "Calibri", valign: "middle",
        });
      });
      // Arrow between cols
      if (i < 2) {
        slide.addText("→", {
          x: x + w - 0.01, y: 1.8, w: 0.3, h: 0.3,
          fontSize: 20, bold: true, color: BRAND.muted, fontFace: "Calibri", align: "center",
        });
      }
    });
  }

  // ── SLIDE 11: Key Actions & Next Steps ─────────────────────────────────────
  {
    const slide = addBrandedSlide(pptx, { logo: logoUrl });
    addSectionHeading(slide, "Key Actions & Next Steps", "Priority actions for the next 90 days");

    const inProgressItems = roadmap.filter(r => r.status === "In Progress").slice(0, 5);
    const plannedItems = roadmap.filter(r => r.status === "Planned").slice(0, 5);

    const sections = [
      { title: "🔴 Immediate (0–30 days)", items: inProgressItems.length > 0 ? inProgressItems.map(r => `${r.title}${r.owner ? ` — ${r.owner}` : ""}`) : ["Review all in-progress initiatives", "Resolve critical CVEs identified in SBOM", "Complete pending retirements"] },
      { title: "🟡 Short-term (30–60 days)", items: plannedItems.length > 0 ? plannedItems.map(r => r.title) : ["Kick off Phase 2 initiatives", "Complete AIBOM compliance review", "Finalize migration effort estimates"] },
      { title: "🟢 Medium-term (60–90 days)", items: ["Achieve Q3 readiness targets", "Deploy cloud-native components", "Conduct security audit", "Update transformation roadmap", "Stakeholder progress review"] },
    ];

    sections.forEach((sec, i) => {
      const y = 1.6 + i * 1.75;
      slide.addText(sec.title, { x: 0.35, y, w: W - 0.7, h: 0.35, fontSize: 12, bold: true, color: BRAND.dark, fontFace: "Calibri" });
      sec.items.slice(0, 4).forEach((item, j) => {
        slide.addShape("rect", {
          x: 0.35, y: y + 0.4 + j * 0.28, w: W - 0.7, h: 0.26,
          fill: { color: j % 2 === 0 ? BRAND.light : BRAND.white }, line: { color: BRAND.border },
        });
        slide.addText(`• ${item}`, {
          x: 0.45, y: y + 0.4 + j * 0.28, w: W - 0.9, h: 0.26,
          fontSize: 9, color: BRAND.dark, fontFace: "Calibri",
        });
      });
    });
  }

  // ── SLIDE 12: Thank You ────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: BRAND.dark }, line: { color: BRAND.dark } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: H * 0.6, w: W, h: 0.06, fill: { color: BRAND.primary }, line: { color: BRAND.primary } });
    slide.addText("Thank You", {
      x: 0.8, y: 2.0, w: W - 1.6, h: 1.0, align: "center",
      fontSize: 52, bold: true, color: BRAND.white, fontFace: "Calibri",
    });
    slide.addText(`${appName} | IT Transformation Planning Suite`, {
      x: 0.8, y: 3.2, w: W - 1.6, h: 0.4, align: "center",
      fontSize: 14, color: BRAND.primaryLight, fontFace: "Calibri",
    });
    slide.addText("For queries, contact the IT Strategy team", {
      x: 0.8, y: 3.8, w: W - 1.6, h: 0.3, align: "center",
      fontSize: 11, color: BRAND.muted, fontFace: "Calibri",
    });
  }

  // ── Write to buffer & send ─────────────────────────────────────────────────
  const buffer = await pptx.write({ outputType: "nodebuffer" });

  const filename = `Ashika_IT_Transformation_${new Date().toISOString().split("T")[0]}.pptx`;
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": (buffer as Buffer).length,
  });
  res.end(buffer);
});

// ── GET /reports/summary — JSON summary for filter preview ─────────────────
router.get("/reports/summary", requireAuth, async (req, res): Promise<void> => {
  const { business, phase } = req.query as Record<string, string>;
  const [apps, roadmap, checklist, retirements, aibom, sbom] = await Promise.all([
    db.select().from(applicationsTable),
    db.select().from(roadmapItemsTable),
    db.select().from(checklistItemsTable),
    db.select().from(retirementsTable),
    db.select().from(aibomEntriesTable),
    db.select().from(sbomEntriesTable),
  ]);

  const filtApps = business ? apps.filter(a => a.business === business) : apps;
  const filtRoadmap = (business ? roadmap.filter(r => r.business === business) : roadmap)
    .filter(r => !phase || phase === "all" || r.phase === phase);
  const filtChecklist = business ? checklist.filter(c => c.business === business) : checklist;
  const filtRetirements = business ? retirements.filter(r => r.business === business) : retirements;

  const businesses = [...new Set(apps.map(a => a.business).filter(Boolean))].sort();
  const phases = [...new Set(roadmap.map(r => r.phase).filter(Boolean))].sort();

  res.json({
    businesses,
    phases,
    counts: {
      apps: filtApps.length,
      roadmap: filtRoadmap.length,
      checklist: filtChecklist.length,
      retirements: filtRetirements.length,
      aibom: aibom.length,
      sbom: sbom.length,
    },
    totalBudget: filtRoadmap.reduce((s, r) => s + (r.budgetLakhs ?? 0), 0),
    criticalCves: sbom.filter(s => s.cve && s.cve !== "None" && s.riskLevel === "Critical").length,
  });
});

export default router;
