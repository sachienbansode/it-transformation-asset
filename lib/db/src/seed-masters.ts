import { db, mastersTable, usersTable, settingsTable } from "./index";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

const masters = [
  // ─── VENDOR ────────────────────────────────────────────────
  { category: "vendor", key: "infosys", label: "Infosys", sortOrder: 1 },
  { category: "vendor", key: "fis_global", label: "FIS Global", sortOrder: 2 },
  { category: "vendor", key: "ss_and_c", label: "SS&C Technologies", sortOrder: 3 },
  { category: "vendor", key: "tata_consultancy", label: "Tata Consultancy Services", sortOrder: 4 },
  { category: "vendor", key: "wipro", label: "Wipro", sortOrder: 5 },
  { category: "vendor", key: "hcl", label: "HCL Technologies", sortOrder: 6 },
  { category: "vendor", key: "intellect_design", label: "Intellect Design Arena", sortOrder: 7 },
  { category: "vendor", key: "ion_group", label: "ION Group (Fidessa)", sortOrder: 8 },
  { category: "vendor", key: "lseg", label: "LSEG (Reuters)", sortOrder: 9 },
  { category: "vendor", key: "amazon_aws", label: "Amazon AWS", sortOrder: 10 },
  { category: "vendor", key: "microsoft", label: "Microsoft", sortOrder: 11 },
  { category: "vendor", key: "broadcom", label: "Broadcom (Symantec)", sortOrder: 12 },
  { category: "vendor", key: "elastic", label: "Elastic", sortOrder: 13 },
  { category: "vendor", key: "cdsl", label: "CDSL", sortOrder: 14 },
  { category: "vendor", key: "nsdl", label: "NSDL", sortOrder: 15 },
  { category: "vendor", key: "npci", label: "NPCI", sortOrder: 16 },
  { category: "vendor", key: "digio", label: "Digio", sortOrder: 17 },
  { category: "vendor", key: "experian_india", label: "Experian India", sortOrder: 18 },
  { category: "vendor", key: "karvy_fintech", label: "Karvy Fintech", sortOrder: 19 },
  { category: "vendor", key: "nice_actimize", label: "NICE Actimize", sortOrder: 20 },
  { category: "vendor", key: "uipath", label: "UiPath", sortOrder: 21 },
  { category: "vendor", key: "factset", label: "FactSet Analytics", sortOrder: 22 },
  { category: "vendor", key: "evalueserve", label: "Evalueserve", sortOrder: 23 },
  { category: "vendor", key: "open_source", label: "Open Source / Community", sortOrder: 24 },
  { category: "vendor", key: "in_house", label: "In-house / Custom", sortOrder: 25 },
  { category: "vendor", key: "anthropic", label: "Anthropic (AWS Bedrock)", sortOrder: 26 },
  { category: "vendor", key: "openai_azure", label: "OpenAI (Azure)", sortOrder: 27 },
  { category: "vendor", key: "splunk", label: "Splunk", sortOrder: 28 },
  { category: "vendor", key: "oracle", label: "Oracle India", sortOrder: 29 },
  { category: "vendor", key: "sap", label: "SAP India", sortOrder: 30 },

  // ─── BUSINESS UNIT ─────────────────────────────────────────
  { category: "business", key: "broking", label: "Broking", color: "blue", sortOrder: 1 },
  { category: "business", key: "nbfc", label: "NBFC", color: "purple", sortOrder: 2 },
  { category: "business", key: "aif", label: "AIF", color: "teal", sortOrder: 3 },
  { category: "business", key: "institutional_equities", label: "Institutional Equities", color: "orange", sortOrder: 4 },
  { category: "business", key: "both", label: "Both (Broking + NBFC)", color: "yellow", sortOrder: 5 },
  { category: "business", key: "all", label: "All Business Units", color: "green", sortOrder: 6 },
  { category: "business", key: "corporate", label: "Corporate / IT", color: "gray", sortOrder: 7 },

  // ─── APPLICATION CATEGORY ──────────────────────────────────
  { category: "app_category", key: "core", label: "Core", color: "red", sortOrder: 1 },
  { category: "app_category", key: "supporting", label: "Supporting", color: "yellow", sortOrder: 2 },
  { category: "app_category", key: "integration", label: "Integration", color: "blue", sortOrder: 3 },
  { category: "app_category", key: "infrastructure", label: "Infrastructure", color: "gray", sortOrder: 4 },
  { category: "app_category", key: "analytics", label: "Analytics & BI", color: "purple", sortOrder: 5 },
  { category: "app_category", key: "security", label: "Security", color: "orange", sortOrder: 6 },
  { category: "app_category", key: "compliance", label: "Compliance & Regulatory", color: "teal", sortOrder: 7 },

  // ─── HOSTING ───────────────────────────────────────────────
  { category: "hosting", key: "on_premise", label: "On-Premise", color: "gray", sortOrder: 1 },
  { category: "hosting", key: "cloud", label: "Cloud (AWS)", color: "blue", sortOrder: 2 },
  { category: "hosting", key: "hybrid", label: "Hybrid", color: "yellow", sortOrder: 3 },
  { category: "hosting", key: "saas", label: "SaaS", color: "green", sortOrder: 4 },
  { category: "hosting", key: "private_cloud", label: "Private Cloud", color: "purple", sortOrder: 5 },
  { category: "hosting", key: "co_location", label: "Co-location (IDC)", color: "orange", sortOrder: 6 },

  // ─── CRITICALITY ───────────────────────────────────────────
  { category: "criticality", key: "critical", label: "Critical", color: "red", sortOrder: 1 },
  { category: "criticality", key: "high", label: "High", color: "orange", sortOrder: 2 },
  { category: "criticality", key: "medium", label: "Medium", color: "yellow", sortOrder: 3 },
  { category: "criticality", key: "low", label: "Low", color: "green", sortOrder: 4 },

  // ─── LICENSE TYPE ──────────────────────────────────────────
  { category: "license_type", key: "commercial", label: "Commercial", sortOrder: 1 },
  { category: "license_type", key: "mit", label: "MIT", sortOrder: 2 },
  { category: "license_type", key: "apache", label: "Apache 2.0", sortOrder: 3 },
  { category: "license_type", key: "gpl", label: "GPL v2/v3", sortOrder: 4 },
  { category: "license_type", key: "lgpl", label: "LGPL", sortOrder: 5 },
  { category: "license_type", key: "bsd", label: "BSD", sortOrder: 6 },
  { category: "license_type", key: "proprietary", label: "Proprietary", sortOrder: 7 },
  { category: "license_type", key: "open_core", label: "Open Core", sortOrder: 8 },
  { category: "license_type", key: "subscription", label: "Subscription (SaaS)", sortOrder: 9 },
  { category: "license_type", key: "per_user", label: "Per User License", sortOrder: 10 },
  { category: "license_type", key: "site_license", label: "Site License", sortOrder: 11 },
  { category: "license_type", key: "enterprise", label: "Enterprise Agreement", sortOrder: 12 },

  // ─── DATA CLASSIFICATION ───────────────────────────────────
  { category: "data_classification", key: "confidential", label: "Confidential", color: "red", sortOrder: 1 },
  { category: "data_classification", key: "restricted", label: "Restricted", color: "orange", sortOrder: 2 },
  { category: "data_classification", key: "internal", label: "Internal", color: "yellow", sortOrder: 3 },
  { category: "data_classification", key: "public", label: "Public", color: "green", sortOrder: 4 },
  { category: "data_classification", key: "pii", label: "PII / PDPA Sensitive", color: "red", sortOrder: 5 },
  { category: "data_classification", key: "financial", label: "Financial (SEBI/RBI)", color: "red", sortOrder: 6 },

  // ─── PRIORITY ──────────────────────────────────────────────
  { category: "priority", key: "critical", label: "Critical", color: "red", sortOrder: 1 },
  { category: "priority", key: "high", label: "High", color: "orange", sortOrder: 2 },
  { category: "priority", key: "medium", label: "Medium", color: "yellow", sortOrder: 3 },
  { category: "priority", key: "low", label: "Low", color: "green", sortOrder: 4 },

  // ─── CHECKLIST STATUS ──────────────────────────────────────
  { category: "checklist_status", key: "available", label: "Available", color: "green", sortOrder: 1 },
  { category: "checklist_status", key: "partial", label: "Partial", color: "yellow", sortOrder: 2 },
  { category: "checklist_status", key: "not_available", label: "Not Available", color: "red", sortOrder: 3 },
  { category: "checklist_status", key: "legacy", label: "Legacy", color: "orange", sortOrder: 4 },
  { category: "checklist_status", key: "planned", label: "Planned", color: "blue", sortOrder: 5 },

  // ─── CHECKLIST CATEGORY ────────────────────────────────────
  { category: "checklist_category", key: "trading_oms", label: "Trading & OMS", sortOrder: 1 },
  { category: "checklist_category", key: "settlement_clearing", label: "Settlement & Clearing", sortOrder: 2 },
  { category: "checklist_category", key: "client_onboarding", label: "Client Onboarding", sortOrder: 3 },
  { category: "checklist_category", key: "nbfc_lending", label: "NBFC & Lending", sortOrder: 4 },
  { category: "checklist_category", key: "aif_portfolio", label: "AIF & Portfolio", sortOrder: 5 },
  { category: "checklist_category", key: "institutional_equities", label: "Institutional Equities", sortOrder: 6 },
  { category: "checklist_category", key: "compliance_reporting", label: "Compliance & Reporting", sortOrder: 7 },
  { category: "checklist_category", key: "tech_infrastructure", label: "Technology Infrastructure", sortOrder: 8 },
  { category: "checklist_category", key: "cybersecurity", label: "Cybersecurity", sortOrder: 9 },
  { category: "checklist_category", key: "customer_experience", label: "Customer Experience", sortOrder: 10 },
  { category: "checklist_category", key: "data_analytics", label: "Data & Analytics", sortOrder: 11 },

  // ─── ROADMAP PHASE ─────────────────────────────────────────
  { category: "phase", key: "phase1", label: "Phase 1: Quick Wins", color: "yellow", sortOrder: 1 },
  { category: "phase", key: "phase2", label: "Phase 2: Core Transformation", color: "blue", sortOrder: 2 },
  { category: "phase", key: "phase3", label: "Phase 3: Innovation & Scale", color: "green", sortOrder: 3 },

  // ─── ROADMAP STATUS ────────────────────────────────────────
  { category: "roadmap_status", key: "planning", label: "Planning", color: "gray", sortOrder: 1 },
  { category: "roadmap_status", key: "in_progress", label: "In Progress", color: "blue", sortOrder: 2 },
  { category: "roadmap_status", key: "completed", label: "Completed", color: "green", sortOrder: 3 },
  { category: "roadmap_status", key: "blocked", label: "Blocked", color: "red", sortOrder: 4 },
  { category: "roadmap_status", key: "deferred", label: "Deferred", color: "orange", sortOrder: 5 },

  // ─── RETIREMENT REASON ─────────────────────────────────────
  { category: "retirement_reason", key: "legacy", label: "Legacy / End of Life", color: "orange", sortOrder: 1 },
  { category: "retirement_reason", key: "duplicate", label: "Duplicate / Redundant", color: "yellow", sortOrder: 2 },
  { category: "retirement_reason", key: "cost", label: "Cost Optimisation", color: "blue", sortOrder: 3 },
  { category: "retirement_reason", key: "risk", label: "Security / Compliance Risk", color: "red", sortOrder: 4 },
  { category: "retirement_reason", key: "consolidation", label: "Platform Consolidation", color: "purple", sortOrder: 5 },
  { category: "retirement_reason", key: "vendor_eol", label: "Vendor End of Support", color: "orange", sortOrder: 6 },

  // ─── RETIREMENT / GENERAL STATUS ───────────────────────────
  { category: "retirement_status", key: "planned", label: "Planned", color: "gray", sortOrder: 1 },
  { category: "retirement_status", key: "in_progress", label: "In Progress", color: "blue", sortOrder: 2 },
  { category: "retirement_status", key: "completed", label: "Completed", color: "green", sortOrder: 3 },
  { category: "retirement_status", key: "cancelled", label: "Cancelled", color: "red", sortOrder: 4 },

  // ─── MIGRATION EFFORT ──────────────────────────────────────
  { category: "migration_effort", key: "low", label: "Low (< 1 month)", color: "green", sortOrder: 1 },
  { category: "migration_effort", key: "medium", label: "Medium (1-3 months)", color: "yellow", sortOrder: 2 },
  { category: "migration_effort", key: "high", label: "High (3-6 months)", color: "orange", sortOrder: 3 },
  { category: "migration_effort", key: "very_high", label: "Very High (6+ months)", color: "red", sortOrder: 4 },

  // ─── SUPPORT STATUS ────────────────────────────────────────
  { category: "support_status", key: "active", label: "Active", color: "green", sortOrder: 1 },
  { category: "support_status", key: "extended", label: "Extended Support", color: "yellow", sortOrder: 2 },
  { category: "support_status", key: "eol", label: "EOL (End of Life)", color: "red", sortOrder: 3 },
  { category: "support_status", key: "no_support", label: "No Support", color: "red", sortOrder: 4 },

  // ─── AI TYPE ───────────────────────────────────────────────
  { category: "ai_type", key: "llm", label: "LLM (Large Language Model)", color: "purple", sortOrder: 1 },
  { category: "ai_type", key: "ml_model", label: "ML Model", color: "blue", sortOrder: 2 },
  { category: "ai_type", key: "chatbot", label: "Chatbot / Conversational AI", color: "green", sortOrder: 3 },
  { category: "ai_type", key: "rpa", label: "RPA (Robotic Process Automation)", color: "yellow", sortOrder: 4 },
  { category: "ai_type", key: "analytics", label: "Analytics / BI AI", color: "teal", sortOrder: 5 },
  { category: "ai_type", key: "nlp", label: "NLP / Text Analytics", color: "orange", sortOrder: 6 },
  { category: "ai_type", key: "computer_vision", label: "Computer Vision", color: "pink", sortOrder: 7 },
  { category: "ai_type", key: "recommendation", label: "Recommendation Engine", color: "indigo", sortOrder: 8 },

  // ─── RISK LEVEL ────────────────────────────────────────────
  { category: "risk_level", key: "critical", label: "Critical", color: "red", sortOrder: 1 },
  { category: "risk_level", key: "high", label: "High", color: "orange", sortOrder: 2 },
  { category: "risk_level", key: "medium", label: "Medium", color: "yellow", sortOrder: 3 },
  { category: "risk_level", key: "low", label: "Low", color: "green", sortOrder: 4 },

  // ─── COMPLIANCE STATUS ─────────────────────────────────────
  { category: "compliance_status", key: "compliant", label: "Compliant", color: "green", sortOrder: 1 },
  { category: "compliance_status", key: "review_needed", label: "Review Needed", color: "yellow", sortOrder: 2 },
  { category: "compliance_status", key: "non_compliant", label: "Non-Compliant", color: "red", sortOrder: 3 },
  { category: "compliance_status", key: "exempt", label: "Exempt", color: "gray", sortOrder: 4 },

  // ─── DEPARTMENT ────────────────────────────────────────────
  { category: "department", key: "it", label: "Technology", sortOrder: 1 },
  { category: "department", key: "risk", label: "Risk Management", sortOrder: 2 },
  { category: "department", key: "compliance", label: "Compliance & Legal", sortOrder: 3 },
  { category: "department", key: "operations", label: "Operations", sortOrder: 4 },
  { category: "department", key: "finance", label: "Finance & Accounts", sortOrder: 5 },
  { category: "department", key: "broking_ops", label: "Broking Operations", sortOrder: 6 },
  { category: "department", key: "nbfc_ops", label: "NBFC Operations", sortOrder: 7 },
  { category: "department", key: "aif_ops", label: "AIF Operations", sortOrder: 8 },
  { category: "department", key: "institutional", label: "Institutional Equities", sortOrder: 9 },
  { category: "department", key: "hr", label: "Human Resources", sortOrder: 10 },
  { category: "department", key: "management", label: "Senior Management", sortOrder: 11 },
];

const defaultSettings = [
  { key: "auth.selfRegistration", value: false, description: "Allow external users to self-register" },
  { key: "auth.mfaDefault", value: false, description: "Require MFA by default for all users" },
  { key: "auth.mfaRequired.internal", value: false, description: "Require MFA for internal users" },
  { key: "auth.mfaRequired.external", value: false, description: "Require MFA for external users" },
  { key: "auth.sessionTimeoutHours", value: 8, description: "Session timeout in hours" },
  { key: "sso.msEnabled", value: false, description: "Enable Microsoft SSO for internal users" },
  { key: "sso.clientId", value: "", description: "Azure AD Application (client) ID" },
  { key: "sso.tenantId", value: "", description: "Azure AD Directory (tenant) ID" },
  { key: "sso.clientSecret", value: "", description: "Azure AD client secret" },
  { key: "sso.redirectUri", value: "", description: "OAuth2 redirect URI (leave blank for auto-detect)" },
  { key: "ui.currencyUnit", value: "lakhs", description: "Default currency display unit: lakhs or millions" },
  { key: "ui.appName", value: "Ashika IT TransForm", description: "Application name displayed in header" },
  { key: "ui.companyName", value: "Ashika Group", description: "Company name" },
];

async function seedMasters() {
  console.log("Seeding master data...");
  await db.delete(mastersTable);
  
  // Insert in batches
  for (let i = 0; i < masters.length; i += 50) {
    await db.insert(mastersTable).values(masters.slice(i, i + 50).map(m => ({ ...m, isActive: true })));
  }
  console.log(`Inserted ${masters.length} master records`);

  // Seed settings (upsert)
  console.log("Seeding settings...");
  for (const setting of defaultSettings) {
    await db
      .insert(settingsTable)
      .values(setting)
      .onConflictDoNothing();
  }
  console.log(`Inserted ${defaultSettings.length} settings`);

  // Create default admin user
  console.log("Creating default admin user...");
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(sql`email = 'admin@ashikagroup.com'`);
  if (existing.length === 0) {
    const passwordHash = await bcrypt.hash("Ashika@2025", 12);
    await db.insert(usersTable).values({
      email: "admin@ashikagroup.com",
      passwordHash,
      name: "System Administrator",
      userType: "internal",
      role: "admin",
      department: "it",
      isActive: true,
    });
    console.log("Admin user created: admin@ashikagroup.com / Ashika@2025");
  } else {
    console.log("Admin user already exists");
  }

  console.log("Masters seed complete!");
}

seedMasters().catch(err => {
  console.error("Masters seed failed:", err);
  process.exit(1);
}).finally(() => process.exit(0));
