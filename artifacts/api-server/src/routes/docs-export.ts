import { Router, Request, Response } from "express";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, Table, TableRow, TableCell,
  WidthType, ShadingType, PageBreak, Header, Footer,
  ImageRun, Tab, TabStopPosition, TabStopType,
} from "docx";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { fmtDate } from "../lib/dates";

const router = Router();

const BRAND = {
  primary: "D4A843",
  dark: "1A1A2E",
  text: "333333",
  light: "F5F0E8",
  white: "FFFFFF",
  company: "NIYTRI Technologies Pvt. Ltd.",
  copyright: `© ${new Date().getFullYear()} NIYTRI Technologies Pvt. Ltd. All rights reserved.`,
  confidential: "CONFIDENTIAL — For Internal Use Only",
};

function brandedHeader(title: string) {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: title, font: "Calibri", size: 16, color: BRAND.primary, italics: true }),
          new TextRun({ text: "  |  ", font: "Calibri", size: 16, color: "999999" }),
          new TextRun({ text: BRAND.company, font: "Calibri", size: 16, color: BRAND.dark }),
        ],
      }),
    ],
  });
}

function brandedFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: BRAND.confidential, font: "Calibri", size: 14, color: "999999", italics: true }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: BRAND.copyright, font: "Calibri", size: 14, color: "999999" }),
        ],
      }),
    ],
  });
}

function titlePage(title: string, subtitle: string, version: string) {
  return [
    new Paragraph({ spacing: { before: 4000 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: BRAND.company, font: "Calibri", size: 28, color: BRAND.primary, bold: true })],
    }),
    new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", color: BRAND.primary, size: 20 }),
    ]}),
    new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: title, font: "Calibri", size: 52, bold: true, color: BRAND.dark }),
    ]}),
    new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: subtitle, font: "Calibri", size: 28, color: BRAND.text, italics: true }),
    ]}),
    new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", color: BRAND.primary, size: 20 }),
    ]}),
    new Paragraph({ spacing: { before: 800 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: `Version: ${version}`, font: "Calibri", size: 22, color: BRAND.text }),
    ]}),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: `Date: ${fmtDate()}`, font: "Calibri", size: 22, color: BRAND.text }),
    ]}),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: `Classification: ${BRAND.confidential}`, font: "Calibri", size: 20, color: "CC0000", bold: true }),
    ]}),
  ];
}

function sectionHeading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, font: "Calibri", size: 28, bold: true, color: BRAND.dark })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: BRAND.primary } },
  });
}

function subHeading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 100 },
    children: [new TextRun({ text, font: "Calibri", size: 24, bold: true, color: BRAND.primary })],
  });
}

function bodyText(text: string) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text, font: "Calibri", size: 22, color: BRAND.text })],
  });
}

function bulletText(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: "Calibri", size: 22, color: BRAND.text })],
  });
}

function makeTable(headers: string[], rows: string[][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(h => new TableCell({
          shading: { type: ShadingType.SOLID, color: BRAND.dark },
          children: [new Paragraph({ children: [new TextRun({ text: h, font: "Calibri", size: 20, bold: true, color: BRAND.white })] })],
          width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
        })),
      }),
      ...rows.map((row, idx) => new TableRow({
        children: row.map(cell => new TableCell({
          shading: idx % 2 === 0 ? { type: ShadingType.SOLID, color: BRAND.light } : undefined,
          children: [new Paragraph({ children: [new TextRun({ text: cell || "—", font: "Calibri", size: 20, color: BRAND.text })] })],
        })),
      })),
    ],
  });
}

router.get("/export/asset-management-doc", async (req: Request, res: Response) => {
  try {
    const assets = await db.execute(sql`SELECT * FROM assets ORDER BY id`);
    const vendors = await db.execute(sql`SELECT * FROM asset_vendors ORDER BY id`);
    const licenses = await db.execute(sql`SELECT * FROM asset_licenses ORDER BY id`);
    const allocations = await db.execute(sql`SELECT * FROM asset_allocations ORDER BY id`);
    const categories = await db.execute(sql`SELECT * FROM asset_categories ORDER BY id`);

    const assetRows = (assets.rows as any[]).map(a => [a.asset_tag, a.name, a.type, a.status, a.owner_name || "", a.department || "", a.location || "", `₹${Number(a.cost || 0).toLocaleString("en-IN")}`]);
    const vendorRows = (vendors.rows as any[]).map(v => [v.name, v.contact_person || "", v.email || "", v.phone || "", v.status]);
    const licenseRows = (licenses.rows as any[]).map(l => [l.product_name, l.vendor_name || "", l.license_type, `${l.seats_used}/${l.seats_total}`, l.expiry_date || "Perpetual", `₹${Number(l.cost || 0).toLocaleString("en-IN")}`, l.status]);

    const doc = new Document({
      sections: [{
        headers: { default: brandedHeader("IT Asset Management") },
        footers: { default: brandedFooter() },
        children: [
          ...titlePage("IT Asset Management", "Comprehensive Asset Lifecycle Documentation", "1.0"),
          new Paragraph({ children: [new PageBreak()] }),

          sectionHeading("1. Executive Summary"),
          bodyText(`This document provides a comprehensive overview of the IT Asset Management module deployed as part of the ${BRAND.company} Ashika Drishti Transform platform. The module covers full lifecycle management of hardware and software assets including procurement, allocation, maintenance, and disposal tracking.`),
          bodyText(`Total assets registered: ${assets.rows.length}. Active vendors: ${vendors.rows.length}. Software licenses tracked: ${licenses.rows.length}.`),

          sectionHeading("2. Scope & Objectives"),
          bulletText("Centralized IT asset registry with unique asset tagging (AST-XXX-NNN format)"),
          bulletText("Hardware lifecycle tracking: procurement → allocation → maintenance → retirement → disposal"),
          bulletText("Software license management with seat utilization monitoring"),
          bulletText("Vendor contract and SLA management"),
          bulletText("Real-time dashboard with asset status, type distribution, and license utilization charts"),
          bulletText("Integration with ITSM module for incident-to-asset correlation"),
          bulletText("Role-based access: Asset Manager, Compliance Officer, Auditor, Vendor roles"),

          sectionHeading("3. Asset Registry"),
          bodyText("The following table lists all registered IT assets in the system:"),
          makeTable(["Asset Tag", "Name", "Type", "Status", "Owner", "Department", "Location", "Cost"], assetRows),

          new Paragraph({ children: [new PageBreak()] }),
          sectionHeading("4. Vendor Directory"),
          bodyText("Registered vendors providing IT assets and maintenance services:"),
          makeTable(["Vendor Name", "Contact Person", "Email", "Phone", "Status"], vendorRows),

          sectionHeading("5. Software Licenses"),
          bodyText("Software license inventory with utilization tracking:"),
          makeTable(["Product", "Vendor", "Type", "Usage", "Expiry", "Cost", "Status"], licenseRows),

          new Paragraph({ children: [new PageBreak()] }),
          sectionHeading("6. Asset Categories"),
          bodyText("Asset categorization follows industry-standard ITIL practices with the following hierarchy:"),
          bulletText("Hardware: Laptops, Desktops, Servers, Network Equipment, Peripherals"),
          bulletText("Software: Operating Systems, Productivity Suites, Development Tools, Security Software"),
          bulletText("Network: Switches, Routers, Firewalls, Access Points, Load Balancers"),
          bulletText("Mobile: Tablets, Smartphones, IoT Devices"),

          sectionHeading("7. Lifecycle Management Workflow"),
          bodyText("Assets follow a standardized lifecycle: Procurement → Receiving & Tagging → Configuration → Allocation → Active Use → Maintenance → Retirement → Disposal/Recycling."),
          bodyText("Each transition is logged in the asset_transactions table with timestamp, responsible party, and notes."),

          sectionHeading("8. KPIs & Metrics"),
          bulletText("Asset Utilization Rate: % of assets in Active/In Use status"),
          bulletText("License Compliance: seats used vs. seats purchased ratio"),
          bulletText("Mean Time Between Failures (MTBF) for hardware assets"),
          bulletText("Vendor Performance Score based on SLA adherence"),
          bulletText("Asset Depreciation tracking per category"),

          sectionHeading("9. Security & Compliance"),
          bodyText("All asset data is protected with role-based access control (RBAC). Audit trails are maintained for all CRUD operations. The module supports export for compliance reporting and regulatory audits."),

          new Paragraph({ children: [new PageBreak()] }),
          sectionHeading("10. Document Control"),
          makeTable(
            ["Field", "Value"],
            [
              ["Document Title", "IT Asset Management — Module Documentation"],
              ["Version", "1.0"],
              ["Author", "NIYTRI Technologies"],
              ["Classification", "Confidential"],
              ["Date", fmtDate()],
              ["Approved By", "CTO, Ashika Group"],
              ["Review Cycle", "Quarterly"],
            ]
          ),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", "attachment; filename=NIYTRI_IT_Asset_Management_v1.0.docx");
    res.send(buffer);
  } catch (err: any) {
    console.error("Asset doc export error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/export/itsm-doc", async (req: Request, res: Response) => {
  try {
    const incidents = await db.execute(sql`SELECT * FROM itsm_incidents ORDER BY id`);
    const problems = await db.execute(sql`SELECT * FROM itsm_problems ORDER BY id`);
    const changes = await db.execute(sql`SELECT * FROM itsm_changes ORDER BY id`);
    const slas = await db.execute(sql`SELECT * FROM itsm_sla_policies ORDER BY id`);
    const kbArticles = await db.execute(sql`SELECT * FROM itsm_knowledge_base ORDER BY id`);
    const serviceRequests = await db.execute(sql`SELECT * FROM itsm_service_requests ORDER BY id`);

    const incidentRows = (incidents.rows as any[]).map(i => [i.ticket_no, i.title, i.priority, i.severity, i.status, i.assigned_to || "", i.category || ""]);
    const problemRows = (problems.rows as any[]).map(p => [p.problem_no, p.title, p.priority, p.status, p.root_cause || "TBD", p.assigned_to || ""]);
    const changeRows = (changes.rows as any[]).map(c => [c.change_no, c.title, c.type, c.risk_level, c.approval_status, c.status, c.requested_by || ""]);
    const slaRows = (slas.rows as any[]).map(s => [s.name, s.priority, `${s.response_time_hours}h`, `${s.resolution_time_hours}h`, s.escalation_enabled ? "Yes" : "No"]);
    const kbRows = (kbArticles.rows as any[]).map(k => [k.title, k.category || "", k.author_name || "", `${k.views || 0} views`, k.status]);

    const doc = new Document({
      sections: [{
        headers: { default: brandedHeader("IT Service Management") },
        footers: { default: brandedFooter() },
        children: [
          ...titlePage("IT Service Management (ITSM)", "ITIL-Aligned Service Delivery Documentation", "1.0"),
          new Paragraph({ children: [new PageBreak()] }),

          sectionHeading("1. Executive Summary"),
          bodyText(`This document covers the IT Service Management (ITSM) module of the ${BRAND.company} Ashika Drishti Transform platform. The module implements ITIL v4 best practices for Incident Management, Problem Management, Change Management, Knowledge Management, and Service Request fulfillment.`),
          bodyText(`Current statistics: ${incidents.rows.length} incidents tracked, ${problems.rows.length} problems under investigation, ${changes.rows.length} change requests processed, ${kbArticles.rows.length} knowledge base articles published.`),

          sectionHeading("2. ITIL Process Framework"),
          subHeading("2.1 Incident Management"),
          bodyText("Incidents follow the lifecycle: Detection → Logging → Classification → Investigation → Resolution → Closure. Each incident is assigned a unique ticket number (INC-XXXXX), priority (Critical/High/Medium/Low), and severity (S1-S4)."),
          bulletText("SLA-driven response and resolution times per priority level"),
          bulletText("Automatic escalation for breached SLAs"),
          bulletText("Root cause linkage to Problem Management"),

          subHeading("2.2 Problem Management"),
          bodyText("Problems represent underlying root causes of one or more incidents. The process covers: Problem Detection → Root Cause Analysis → Workaround Documentation → Known Error Database → Resolution."),

          subHeading("2.3 Change Management"),
          bodyText("All changes to the IT environment follow a structured approval process: RFC Submission → Impact Assessment → CAB Review → Approval → Scheduling → Implementation → Post-Implementation Review."),
          bulletText("Change types: Standard (pre-approved), Normal (CAB review), Major (senior approval), Emergency (expedited)"),
          bulletText("Risk assessment: Low, Medium, High with mandatory rollback plans for High risk"),

          subHeading("2.4 Knowledge Management"),
          bodyText("The Knowledge Base (KB) provides searchable solutions, troubleshooting guides, and best practices. Articles are categorized, tagged, and tracked by views and helpfulness ratings."),

          subHeading("2.5 Service Request Management"),
          bodyText("Service requests cover standard fulfillment activities: software installation, access provisioning, equipment requests, and account management."),

          new Paragraph({ children: [new PageBreak()] }),
          sectionHeading("3. Incident Register"),
          bodyText("Current incident log:"),
          makeTable(["Ticket #", "Title", "Priority", "Severity", "Status", "Assigned To", "Category"], incidentRows),

          sectionHeading("4. Problem Register"),
          bodyText("Active and resolved problems:"),
          makeTable(["Problem #", "Title", "Priority", "Status", "Root Cause", "Assigned To"], problemRows),

          new Paragraph({ children: [new PageBreak()] }),
          sectionHeading("5. Change Register"),
          bodyText("Change request log:"),
          makeTable(["Change #", "Title", "Type", "Risk", "Approval", "Status", "Requested By"], changeRows),

          sectionHeading("6. SLA Policies"),
          bodyText("Service Level Agreement policies governing incident response and resolution:"),
          makeTable(["Policy Name", "Priority", "Response Time", "Resolution Time", "Escalation"], slaRows),

          new Paragraph({ children: [new PageBreak()] }),
          sectionHeading("7. Knowledge Base"),
          bodyText("Published knowledge articles:"),
          makeTable(["Title", "Category", "Author", "Views", "Status"], kbRows),

          sectionHeading("8. Service Requests"),
          bodyText(`Total service requests: ${serviceRequests.rows.length}. Categories include: Software Installation, Access Provisioning, Hardware Request, Account Management, Training.`),

          sectionHeading("9. Roles & Responsibilities"),
          makeTable(
            ["Role", "Responsibilities"],
            [
              ["Service Desk L1", "First contact, ticket logging, initial triage, known issue resolution"],
              ["L2/L3 Support", "Advanced troubleshooting, root cause analysis, major incident handling"],
              ["Change Manager", "RFC review, CAB coordination, change scheduling, PIR oversight"],
              ["Problem Manager", "Root cause analysis, known error database, proactive problem management"],
              ["Compliance Officer", "SLA monitoring, audit reporting, process compliance"],
              ["Business User", "Raise service requests and view own tickets"],
            ]
          ),

          sectionHeading("10. KPIs & Metrics"),
          bulletText("Mean Time to Acknowledge (MTTA): avg time from incident creation to first response"),
          bulletText("Mean Time to Resolve (MTTR): avg resolution time per priority level"),
          bulletText("First Call Resolution Rate (FCR): % resolved at L1 without escalation"),
          bulletText("SLA Compliance Rate: % of incidents resolved within SLA targets"),
          bulletText("Change Success Rate: % of changes implemented without rollback"),
          bulletText("Problem Resolution Rate: % of problems with identified root cause"),
          bulletText("Knowledge Article Utilization: avg views and linked incident resolutions"),

          new Paragraph({ children: [new PageBreak()] }),
          sectionHeading("11. Document Control"),
          makeTable(
            ["Field", "Value"],
            [
              ["Document Title", "IT Service Management (ITSM) — Module Documentation"],
              ["Version", "1.0"],
              ["Author", "NIYTRI Technologies"],
              ["Classification", "Confidential"],
              ["Date", fmtDate()],
              ["Approved By", "CTO, Ashika Group"],
              ["Review Cycle", "Quarterly"],
              ["ITIL Alignment", "ITIL v4 Foundation"],
            ]
          ),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", "attachment; filename=NIYTRI_ITSM_Documentation_v1.0.docx");
    res.send(buffer);
  } catch (err: any) {
    console.error("ITSM doc export error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
