import { db, checklistItemsTable, roadmapItemsTable, applicationsTable, retirementsTable, aibomEntriesTable, sbomEntriesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  // Truncate all tables first
  await db.execute(sql`TRUNCATE checklist_items, roadmap_items, applications, retirements, aibom_entries, sbom_entries RESTART IDENTITY CASCADE`);

  // === CHECKLIST ITEMS (60+) ===
  await db.insert(checklistItemsTable).values([
    // Trading & Order Management
    { category: "Trading & OMS", feature: "Order Management System (OMS)", business: "Broking", currentApp: "Finacle OMS", status: "Available", priority: "High", comments: "Core trading system, upgrade needed" },
    { category: "Trading & OMS", feature: "Smart Order Routing (SOR)", business: "Broking", currentApp: "Custom SOR", status: "Partial", priority: "High", comments: "NSE/BSE routing exists, BSE DMA needed" },
    { category: "Trading & OMS", feature: "Algorithmic Trading Engine", business: "Broking", currentApp: "AlgoNXT", status: "Available", priority: "High", comments: "SEBI-compliant algo platform" },
    { category: "Trading & OMS", feature: "Fix Protocol Gateway (4.4)", business: "Broking", currentApp: "Fidessa FIX", status: "Available", priority: "High", comments: "FIX 4.4 live, FIX 5.0 pending" },
    { category: "Trading & OMS", feature: "Risk Management Engine", business: "Broking", currentApp: "RiskShield Pro", status: "Available", priority: "High", comments: "Real-time margining, VaR calculation" },
    { category: "Trading & OMS", feature: "Market Data Feed (NSE/BSE)", business: "Broking", currentApp: "Reuters Tick", status: "Available", priority: "High", comments: "Level 1 & 2 data" },
    { category: "Trading & OMS", feature: "Basket Order & Portfolio Trading", business: "Broking", currentApp: "Custom", status: "Partial", priority: "Medium", comments: "Basic implementation only" },
    { category: "Trading & OMS", feature: "MTF (Margin Trade Funding)", business: "Broking", currentApp: "Manual", status: "Not Available", priority: "High", comments: "SEBI MTF circular compliance required" },
    { category: "Trading & OMS", feature: "After Market Orders (AMO)", business: "Broking", currentApp: "Finacle OMS", status: "Available", priority: "Medium", comments: "Stable" },
    { category: "Trading & OMS", feature: "Multi-Exchange Connectivity (NSE/BSE/MCX)", business: "Broking", currentApp: "Custom", status: "Available", priority: "High", comments: "All three exchanges live" },

    // Settlement & Clearing
    { category: "Settlement & Clearing", feature: "T+1 Settlement Processing", business: "Broking", currentApp: "Finacle Settlement", status: "Available", priority: "High", comments: "SEBI T+1 mandate compliant" },
    { category: "Settlement & Clearing", feature: "CDSL/NSDL DP Integration", business: "Broking", currentApp: "CDSL EDDIS", status: "Available", priority: "High", comments: "Both depositories integrated" },
    { category: "Settlement & Clearing", feature: "Payout/Payin Reconciliation", business: "Broking", currentApp: "Manual + Excel", status: "Legacy", priority: "High", comments: "Critical gap — automation needed" },
    { category: "Settlement & Clearing", feature: "Funds Settlement (UPI/NACH/RTGS)", business: "Broking", currentApp: "Axis Bank API", status: "Available", priority: "High", comments: "All modes live" },
    { category: "Settlement & Clearing", feature: "Obligation Netting", business: "Broking", currentApp: "Custom", status: "Partial", priority: "Medium", comments: "NSE only, BSE pending" },
    { category: "Settlement & Clearing", feature: "Exchange Margin Reporting", business: "Broking", currentApp: "Finacle OMS", status: "Available", priority: "High", comments: "Automated EOD reporting" },

    // Client Onboarding
    { category: "Client Onboarding", feature: "Digital KYC (Video + OTP)", business: "Broking", currentApp: "KarvyKYC Pro", status: "Available", priority: "High", comments: "SEBI-approved VKYC flow" },
    { category: "Client Onboarding", feature: "Aadhaar-based eKYC (UIDAI)", business: "All", currentApp: "Digio API", status: "Available", priority: "High", comments: "OTP-based, no biometric" },
    { category: "Client Onboarding", feature: "PAN Verification", business: "All", currentApp: "NSDL PAN API", status: "Available", priority: "High", comments: "Real-time verification" },
    { category: "Client Onboarding", feature: "Account Opening (Digital DMAT)", business: "Broking", currentApp: "KarvyKYC Pro", status: "Available", priority: "High", comments: "Paperless DMAT opening" },
    { category: "Client Onboarding", feature: "IPV (In-Person Verification) Automation", business: "Broking", currentApp: "Manual + Camera", status: "Legacy", priority: "Medium", comments: "Not scalable" },
    { category: "Client Onboarding", feature: "Nominee & KYC Updates", business: "Broking", currentApp: "Portal (custom)", status: "Partial", priority: "Medium", comments: "Nominee update flow buggy" },
    { category: "Client Onboarding", feature: "FATCA/CRS Declaration", business: "Both", currentApp: "Manual", status: "Not Available", priority: "High", comments: "Regulatory requirement" },
    { category: "Client Onboarding", feature: "AML / Fraud Screening at Onboarding", business: "All", currentApp: "Custom rules", status: "Legacy", priority: "High", comments: "SEBI/RBI AML mandate" },

    // NBFC & Lending
    { category: "NBFC & Lending", feature: "Loan Origination System (LOS)", business: "NBFC", currentApp: "Nucleus LOS", status: "Available", priority: "High", comments: "Retail loan origination" },
    { category: "NBFC & Lending", feature: "Loan Management System (LMS)", business: "NBFC", currentApp: "Nucleus LMS", status: "Available", priority: "High", comments: "Full lifecycle management" },
    { category: "NBFC & Lending", feature: "Credit Scoring Engine", business: "NBFC", currentApp: "Internal Model v2", status: "Partial", priority: "High", comments: "CIBIL + bureau data integrated" },
    { category: "NBFC & Lending", feature: "CIBIL / Experian Bureau Integration", business: "NBFC", currentApp: "Experian API", status: "Available", priority: "High", comments: "Live pull on origination" },
    { category: "NBFC & Lending", feature: "Loan against Securities (LAS)", business: "Both", currentApp: "Manual", status: "Not Available", priority: "High", comments: "Key product gap" },
    { category: "NBFC & Lending", feature: "NACH Auto-debit Setup", business: "NBFC", currentApp: "NPCI NACH", status: "Available", priority: "High", comments: "Active EMI collections" },
    { category: "NBFC & Lending", feature: "Collections & Delinquency Management", business: "NBFC", currentApp: "Nucleus LMS", status: "Partial", priority: "High", comments: "Basic workflows only" },
    { category: "NBFC & Lending", feature: "RBI Regulatory Reporting (NRC)", business: "NBFC", currentApp: "Manual + Excel", status: "Legacy", priority: "High", comments: "Automation critical" },
    { category: "NBFC & Lending", feature: "Co-lending Integration", business: "NBFC", currentApp: "Not Available", status: "Not Available", priority: "High", comments: "RBI co-lending circular compliance" },

    // AIF & Portfolio
    { category: "AIF & Portfolio", feature: "Fund Accounting System", business: "AIF", currentApp: "Advent Geneva", status: "Available", priority: "High", comments: "Category II AIF" },
    { category: "AIF & Portfolio", feature: "Portfolio Management System (PMS)", business: "AIF", currentApp: "Advent Geneva", status: "Available", priority: "High", comments: "Multi-strategy support" },
    { category: "AIF & Portfolio", feature: "NAV Calculation Engine", business: "AIF", currentApp: "Custom + Geneva", status: "Available", priority: "High", comments: "Daily NAV compute" },
    { category: "AIF & Portfolio", feature: "Investor Portal (AIF Reporting)", business: "AIF", currentApp: "Portal (custom)", status: "Partial", priority: "Medium", comments: "Basic reports only" },
    { category: "AIF & Portfolio", feature: "SEBI AIF Reporting (Form A/B)", business: "AIF", currentApp: "Manual", status: "Legacy", priority: "High", comments: "Quarterly SEBI filing" },
    { category: "AIF & Portfolio", feature: "Performance Attribution", business: "AIF", currentApp: "Geneva Reports", status: "Partial", priority: "Medium", comments: "Attribution limited to top level" },
    { category: "AIF & Portfolio", feature: "FII/FPI Exposure Tracking", business: "Both", currentApp: "Manual", status: "Not Available", priority: "High", comments: "SEBI FPI limit monitoring" },

    // Institutional Equities
    { category: "Institutional Equities", feature: "Research & Recommendation Platform", business: "Broking", currentApp: "Evalueserve", status: "Partial", priority: "Medium", comments: "Basic report distribution" },
    { category: "Institutional Equities", feature: "Client Commission Tracking (FIX)", business: "Broking", currentApp: "Custom", status: "Available", priority: "High", comments: "CSA tracking active" },
    { category: "Institutional Equities", feature: "Block Deal / Bulk Deal Execution", business: "Broking", currentApp: "Custom OMS", status: "Available", priority: "High", comments: "SEBI block deal window" },
    { category: "Institutional Equities", feature: "Soft Dollar Tracking", business: "Broking", currentApp: "Manual", status: "Not Available", priority: "Low", comments: "Low priority" },

    // Compliance & Reporting
    { category: "Compliance & Reporting", feature: "SEBI STR / SAR Filing (AML)", business: "All", currentApp: "Manual + FIU portal", status: "Legacy", priority: "High", comments: "FIU-IND reporting critical" },
    { category: "Compliance & Reporting", feature: "Exchange Surveillance Integration", business: "Broking", currentApp: "NSE SURV", status: "Available", priority: "High", comments: "Circular trading, wash trades" },
    { category: "Compliance & Reporting", feature: "Insider Trading Monitoring", business: "Both", currentApp: "Custom rules", status: "Partial", priority: "High", comments: "SEBI PIT norms" },
    { category: "Compliance & Reporting", feature: "PMLA Reporting Automation", business: "All", currentApp: "Manual", status: "Not Available", priority: "High", comments: "Regulatory mandate" },
    { category: "Compliance & Reporting", feature: "GST TDS on Brokerage Automation", business: "Broking", currentApp: "Finacle", status: "Available", priority: "High", comments: "Automated TDS + GST" },
    { category: "Compliance & Reporting", feature: "Client P&L Statement (Capital Gains)", business: "Broking", currentApp: "Custom", status: "Available", priority: "High", comments: "LTCG/STCG tax reports" },

    // Technology Infrastructure
    { category: "Technology Infrastructure", feature: "Disaster Recovery (DR) Site — Active-Passive", business: "All", currentApp: "AWS Mumbai DR", status: "Partial", priority: "High", comments: "DR tests not conducted Q3-Q4" },
    { category: "Technology Infrastructure", feature: "API Gateway & Rate Limiting", business: "All", currentApp: "AWS API GW", status: "Available", priority: "High", comments: "Kong planned" },
    { category: "Technology Infrastructure", feature: "Data Warehouse (Analytics)", business: "All", currentApp: "Redshift", status: "Available", priority: "High", comments: "Daily ETL pipelines" },
    { category: "Technology Infrastructure", feature: "SIEM / Security Monitoring", business: "All", currentApp: "Splunk", status: "Available", priority: "High", comments: "ISO 27001 aligned" },
    { category: "Technology Infrastructure", feature: "Microservices Migration", business: "All", currentApp: "Monolith (legacy)", status: "Not Available", priority: "High", comments: "3-year roadmap item" },
    { category: "Technology Infrastructure", feature: "CI/CD Pipeline (DevSecOps)", business: "All", currentApp: "Jenkins + Git", status: "Partial", priority: "High", comments: "Security scanning not integrated" },
    { category: "Technology Infrastructure", feature: "Service Mesh (Istio/Envoy)", business: "All", currentApp: "Not Available", status: "Not Available", priority: "Medium", comments: "Dependency on microservices" },
    { category: "Technology Infrastructure", feature: "Centralised Logging (ELK Stack)", business: "All", currentApp: "ELK + Splunk", status: "Available", priority: "Medium", comments: "Redundant — consolidation needed" },
    { category: "Technology Infrastructure", feature: "Container Orchestration (EKS)", business: "All", currentApp: "AWS EKS", status: "Partial", priority: "High", comments: "Some workloads containerised" },
    { category: "Technology Infrastructure", feature: "Data Loss Prevention (DLP)", business: "All", currentApp: "Symantec DLP", status: "Available", priority: "High", comments: "Email + endpoint coverage" },
    { category: "Technology Infrastructure", feature: "Zero Trust Network Architecture", business: "All", currentApp: "Not Available", status: "Not Available", priority: "High", comments: "RBI cybersecurity guideline requirement" },
    { category: "Technology Infrastructure", feature: "Multi-Factor Authentication (MFA)", business: "All", currentApp: "Microsoft ADFS", status: "Available", priority: "High", comments: "All internal apps covered" },
  ]);

  // === ROADMAP ITEMS ===
  await db.insert(roadmapItemsTable).values([
    { title: "T+1 Settlement Automation", description: "Automate end-to-end T+1 settlement including payout/payin reconciliation eliminating manual Excel processes", phase: "Phase 1: Quick Wins", business: "Broking", status: "In Progress", priority: "High", budgetLakhs: 45, startMonth: 1, endMonth: 3, owner: "Rajesh Mehta" },
    { title: "Digital KYC Overhaul", description: "Replace KarvyKYC Pro with in-house VKYC pipeline with Aadhaar/PAN/DigiLocker integration", phase: "Phase 1: Quick Wins", business: "All", status: "In Progress", priority: "High", budgetLakhs: 60, startMonth: 1, endMonth: 4, owner: "Priya Nair" },
    { title: "MTF Module Implementation", description: "Build SEBI-compliant Margin Trade Funding module with automated pledging and interest calculation", phase: "Phase 1: Quick Wins", business: "Broking", status: "Planning", priority: "High", budgetLakhs: 35, startMonth: 2, endMonth: 5, owner: "Sunil Kapoor" },
    { title: "RBI NRC Automation", description: "Automate NBFC regulatory reporting to RBI — NRC-1, NRC-2, NRC-3 filings with data validation", phase: "Phase 1: Quick Wins", business: "NBFC", status: "Planning", priority: "High", budgetLakhs: 25, startMonth: 2, endMonth: 4, owner: "Anita Sharma" },
    { title: "SEBI AIF Reporting Portal", description: "Build investor-facing and SEBI-facing AIF reporting portal with Form A/B automation", phase: "Phase 1: Quick Wins", business: "AIF", status: "In Progress", priority: "High", budgetLakhs: 20, startMonth: 1, endMonth: 3, owner: "Vivek Rao" },
    { title: "CI/CD DevSecOps Integration", description: "Integrate SAST, DAST, and SCA into Jenkins pipeline; shift-left security across all development teams", phase: "Phase 1: Quick Wins", business: "All", status: "In Progress", priority: "High", budgetLakhs: 15, startMonth: 1, endMonth: 2, owner: "Amit Singh" },
    { title: "Loan against Securities (LAS)", description: "Build end-to-end LAS product covering pledge creation, monitoring, margin calls, and liquidation", phase: "Phase 2: Core Transformation", business: "Both", status: "Planning", priority: "High", budgetLakhs: 120, startMonth: 4, endMonth: 9, owner: "Rohit Verma" },
    { title: "Core Banking System Migration", description: "Migrate from Finacle legacy to cloud-native CBS on AWS — phased approach starting with NBFC", phase: "Phase 2: Core Transformation", business: "NBFC", status: "Planning", priority: "High", budgetLakhs: 350, startMonth: 3, endMonth: 12, owner: "Rajesh Mehta" },
    { title: "Microservices Architecture Migration", description: "Decompose monolithic trading and lending stacks into event-driven microservices on EKS", phase: "Phase 2: Core Transformation", business: "All", status: "Planning", priority: "High", budgetLakhs: 280, startMonth: 5, endMonth: 12, owner: "Vivek Rao" },
    { title: "Zero Trust Network Implementation", description: "Implement Zero Trust across all internal and external access, replacing legacy VPN-based access", phase: "Phase 2: Core Transformation", business: "All", status: "Planning", priority: "High", budgetLakhs: 75, startMonth: 4, endMonth: 8, owner: "Sunil Kapoor" },
    { title: "Unified Data Platform (AWS Redshift)", description: "Consolidate all business data into Redshift with real-time streaming from core systems via Kafka", phase: "Phase 2: Core Transformation", business: "All", status: "In Progress", priority: "High", budgetLakhs: 90, startMonth: 3, endMonth: 8, owner: "Priya Nair" },
    { title: "Co-lending API Integration", description: "Build co-lending integration with 3 partner banks per RBI co-lending model circular guidelines", phase: "Phase 2: Core Transformation", business: "NBFC", status: "Planning", priority: "High", budgetLakhs: 65, startMonth: 5, endMonth: 9, owner: "Anita Sharma" },
    { title: "AI-powered Credit Decisioning", description: "Deploy ML-based credit scoring model using bureau + behavioral data replacing rule-based engine", phase: "Phase 3: Innovation & Scale", business: "NBFC", status: "Planning", priority: "High", budgetLakhs: 150, startMonth: 7, endMonth: 12, owner: "Amit Singh" },
    { title: "SEBI-Compliant AI Trading Signals", description: "Build explainable AI trading recommendation engine compliant with SEBI algo trading regulations", phase: "Phase 3: Innovation & Scale", business: "Broking", status: "Planning", priority: "Medium", budgetLakhs: 95, startMonth: 9, endMonth: 12, owner: "Rohit Verma" },
    { title: "AI Chatbot — Financial Assistant", description: "Customer-facing AI chatbot for account queries, trade execution help, and compliance self-service", phase: "Phase 3: Innovation & Scale", business: "All", status: "Planning", priority: "Medium", budgetLakhs: 55, startMonth: 8, endMonth: 12, owner: "Priya Nair" },
    { title: "Institutional Research Platform (GenAI)", description: "AI-powered institutional research summarisation and distribution platform for equities team", phase: "Phase 3: Innovation & Scale", business: "Broking", status: "Planning", priority: "Low", budgetLakhs: 40, startMonth: 10, endMonth: 12, owner: "Vivek Rao" },
  ]);

  // === APPLICATIONS ===
  await db.insert(applicationsTable).values([
    { appId: "APP-001", name: "Finacle OMS", vendor: "Infosys", version: "11.8", business: "Broking", category: "Core", hosting: "On-Premise", criticality: "Critical", licenseType: "Commercial", licenseExpiry: "2025-12-31", annualCostLakhs: 185, dataClassification: "Confidential", owner: "Rajesh Mehta", supportStatus: "Extended", comments: "EOL extended for 12 months; migration critical" },
    { appId: "APP-002", name: "Nucleus LOS", vendor: "FIS Global", version: "7.2", business: "NBFC", category: "Core", hosting: "On-Premise", criticality: "Critical", licenseType: "Commercial", licenseExpiry: "2026-03-31", annualCostLakhs: 120, dataClassification: "Confidential", owner: "Anita Sharma", supportStatus: "Active", comments: "Version 8.0 upgrade planned" },
    { appId: "APP-003", name: "Nucleus LMS", vendor: "FIS Global", version: "7.2", business: "NBFC", category: "Core", hosting: "On-Premise", criticality: "Critical", licenseType: "Commercial", licenseExpiry: "2026-03-31", annualCostLakhs: 95, dataClassification: "Confidential", owner: "Anita Sharma", supportStatus: "Active", comments: "Paired with LOS deployment" },
    { appId: "APP-004", name: "Advent Geneva", vendor: "SS&C", version: "2022.1", business: "AIF", category: "Core", hosting: "SaaS", criticality: "Critical", licenseType: "Commercial", licenseExpiry: "2026-12-31", annualCostLakhs: 145, dataClassification: "Confidential", owner: "Vivek Rao", supportStatus: "Active", comments: "Annual SaaS; renewal negotiation in Q4" },
    { appId: "APP-005", name: "AlgoNXT", vendor: "Tata Consultancy", version: "5.1", business: "Broking", category: "Core", hosting: "Hybrid", criticality: "Critical", licenseType: "Commercial", licenseExpiry: "2025-06-30", annualCostLakhs: 75, dataClassification: "Confidential", owner: "Sunil Kapoor", supportStatus: "Active", comments: "License renewal due June — critical path" },
    { appId: "APP-006", name: "RiskShield Pro", vendor: "Intellect Design", version: "9.4", business: "Broking", category: "Core", hosting: "On-Premise", criticality: "Critical", licenseType: "Commercial", licenseExpiry: "2025-09-30", annualCostLakhs: 65, dataClassification: "Confidential", owner: "Rajesh Mehta", supportStatus: "Active", comments: "Margin engine upgrade needed for F&O" },
    { appId: "APP-007", name: "Reuters Tick Data", vendor: "LSEG", version: "Tick 3.0", business: "Broking", category: "Core", hosting: "SaaS", criticality: "High", licenseType: "Commercial", licenseExpiry: "2026-01-31", annualCostLakhs: 110, dataClassification: "Internal", owner: "Sunil Kapoor", supportStatus: "Active", comments: "L1/L2 data. Bloomberg evaluated as replacement." },
    { appId: "APP-008", name: "CDSL EDDIS", vendor: "CDSL", version: "3.1", business: "Broking", category: "Integration", hosting: "On-Premise", criticality: "Critical", licenseType: "Commercial", licenseExpiry: "2026-03-31", annualCostLakhs: 20, dataClassification: "Confidential", owner: "Rajesh Mehta", supportStatus: "Active", comments: "CDSL API migration Q2" },
    { appId: "APP-009", name: "Digio eSign & KYC", vendor: "Digio", version: "API v4", business: "All", category: "Integration", hosting: "SaaS", criticality: "High", licenseType: "Commercial", licenseExpiry: "2025-12-31", annualCostLakhs: 18, dataClassification: "Confidential", owner: "Priya Nair", supportStatus: "Active", comments: "Per-transaction pricing; evaluate CKYC" },
    { appId: "APP-010", name: "Experian Credit Bureau API", vendor: "Experian India", version: "v2.5", business: "NBFC", category: "Integration", hosting: "SaaS", criticality: "High", licenseType: "Commercial", licenseExpiry: "2025-10-31", annualCostLakhs: 32, dataClassification: "Confidential", owner: "Anita Sharma", supportStatus: "Active", comments: "CIBIL+ Experian dual bureau" },
    { appId: "APP-011", name: "Splunk SIEM", vendor: "Splunk", version: "9.2", business: "All", category: "Infrastructure", hosting: "On-Premise", criticality: "High", licenseType: "Commercial", licenseExpiry: "2026-06-30", annualCostLakhs: 55, dataClassification: "Internal", owner: "Amit Singh", supportStatus: "Active", comments: "SOC integration active. Cloud migration Q3." },
    { appId: "APP-012", name: "Jenkins CI/CD", vendor: "Open Source", version: "2.440", business: "All", category: "Infrastructure", hosting: "On-Premise", criticality: "High", licenseType: "MIT", licenseExpiry: "N/A", annualCostLakhs: 8, dataClassification: "Internal", owner: "Amit Singh", supportStatus: "Active", comments: "GitHub Actions migration being evaluated" },
    { appId: "APP-013", name: "AWS EKS Cluster", vendor: "Amazon AWS", version: "1.29", business: "All", category: "Infrastructure", hosting: "Cloud", criticality: "Critical", licenseType: "Commercial", licenseExpiry: "N/A", annualCostLakhs: 85, dataClassification: "Internal", owner: "Vivek Rao", supportStatus: "Active", comments: "Multi-AZ Mumbai region; DR in Hyderabad" },
    { appId: "APP-014", name: "Fidessa FIX Gateway", vendor: "ION Group", version: "6.1", business: "Broking", category: "Integration", hosting: "On-Premise", criticality: "Critical", licenseType: "Commercial", licenseExpiry: "2025-12-31", annualCostLakhs: 90, dataClassification: "Confidential", owner: "Sunil Kapoor", supportStatus: "Active", comments: "FIX 5.0 upgrade being tested" },
    { appId: "APP-015", name: "Symantec DLP", vendor: "Broadcom", version: "16.1", business: "All", category: "Infrastructure", hosting: "On-Premise", criticality: "High", licenseType: "Commercial", licenseExpiry: "2026-01-31", annualCostLakhs: 40, dataClassification: "Internal", owner: "Amit Singh", supportStatus: "Active", comments: "Covers email, web, endpoint channels" },
    { appId: "APP-016", name: "KarvyKYC Pro", vendor: "Karvy Fintech", version: "3.2", business: "Broking", category: "Supporting", hosting: "On-Premise", criticality: "High", licenseType: "Commercial", licenseExpiry: "2025-06-30", annualCostLakhs: 22, dataClassification: "Confidential", owner: "Priya Nair", supportStatus: "EOL", comments: "EOL from June 2025. Migration to in-house VKYC." },
    { appId: "APP-017", name: "Microsoft ADFS", vendor: "Microsoft", version: "4.0", business: "All", category: "Infrastructure", hosting: "On-Premise", criticality: "High", licenseType: "Commercial", licenseExpiry: "2026-10-31", annualCostLakhs: 12, dataClassification: "Internal", owner: "Amit Singh", supportStatus: "Active", comments: "Azure AD migration evaluating" },
    { appId: "APP-018", name: "NPCI NACH Platform", vendor: "NPCI", version: "API 2.0", business: "NBFC", category: "Integration", hosting: "SaaS", criticality: "High", licenseType: "Commercial", licenseExpiry: "2026-03-31", annualCostLakhs: 5, dataClassification: "Confidential", owner: "Anita Sharma", supportStatus: "Active", comments: "e-NACH mandates for EMI collections" },
    { appId: "APP-019", name: "ELK Stack", vendor: "Elastic", version: "8.12", business: "All", category: "Infrastructure", hosting: "On-Premise", criticality: "Medium", licenseType: "LGPL", licenseExpiry: "N/A", annualCostLakhs: 10, dataClassification: "Internal", owner: "Vivek Rao", supportStatus: "Active", comments: "Overlaps with Splunk. Evaluate consolidation." },
    { appId: "APP-020", name: "Evalueserve Research Platform", vendor: "Evalueserve", version: "SaaS", business: "Broking", category: "Supporting", hosting: "SaaS", criticality: "Low", licenseType: "Commercial", licenseExpiry: "2025-12-31", annualCostLakhs: 30, dataClassification: "Internal", owner: "Rohit Verma", supportStatus: "Active", comments: "Equities research distribution only" },
  ]);

  // === RETIREMENTS ===
  await db.insert(retirementsTable).values([
    { appName: "KarvyKYC Pro", business: "Broking", reason: "Legacy", targetDate: "2025-06-30", successor: "In-house VKYC Platform", migrationEffort: "High", budgetLakhs: 60, status: "In Progress", comments: "EOL confirmed. VKYC build in progress." },
    { appName: "Finacle OMS", business: "Broking", reason: "Legacy", targetDate: "2025-12-31", successor: "Cloud-native OMS (AWS)", migrationEffort: "High", budgetLakhs: 185, status: "Planned", comments: "Extended support purchased. Migration starts Q3." },
    { appName: "ELK Stack", business: "All", reason: "Duplicate", targetDate: "2025-09-30", successor: "Splunk (consolidated)", migrationEffort: "Low", budgetLakhs: 5, status: "Planned", comments: "Redundant with Splunk. Migrate all ELK log sources." },
    { appName: "Manual Settlement Process (Excel)", business: "Broking", reason: "Risk", targetDate: "2025-06-30", successor: "Finacle Settlement Automation", migrationEffort: "Medium", budgetLakhs: 20, status: "In Progress", comments: "SEBI T+1 risk. Automation live for NSE; BSE Q2." },
    { appName: "Legacy IPV Camera System", business: "Broking", reason: "Legacy", targetDate: "2025-12-31", successor: "VKYC Integration", migrationEffort: "Low", budgetLakhs: 3, status: "Planned", comments: "Non-scalable manual process." },
    { appName: "FIU Manual STR Reporting", business: "All", reason: "Risk", targetDate: "2025-09-30", successor: "Automated AML System", migrationEffort: "High", budgetLakhs: 45, status: "Planned", comments: "FIU-IND penalty risk. Automation critical." },
    { appName: "Evalueserve Research Platform", business: "Broking", reason: "Cost", targetDate: "2026-03-31", successor: "GenAI Research Platform (in-house)", migrationEffort: "Medium", budgetLakhs: 40, status: "Planned", comments: "Replace with AI-powered research tool." },
    { appName: "Microsoft ADFS (On-Prem)", business: "All", reason: "Legacy", targetDate: "2026-06-30", successor: "Azure Entra ID", migrationEffort: "Medium", budgetLakhs: 15, status: "Planned", comments: "Move to cloud IAM. Evaluate Okta vs Azure." },
  ]);

  // === AIBOM ENTRIES ===
  await db.insert(aibomEntriesTable).values([
    { componentId: "AI-001", name: "CreditGPT-India", type: "LLM", provider: "OpenAI (Azure)", useCase: "Credit memo summarisation and lending decision rationale for NBFC underwriters", dataUsed: "Loan applications, bureau data, P&L statements (masked PII)", riskLevel: "High", complianceStatus: "Review Needed", governanceReviewDate: "2025-06-30", comments: "SEBI/RBI AI governance framework review pending. Data residency India." },
    { componentId: "AI-002", name: "TradeSignal ML v3", type: "ML Model", provider: "Internal (AWS SageMaker)", useCase: "Equity trading signal generation for institutional clients", dataUsed: "Historical price, volume, options OI, FII/DII data", riskLevel: "High", complianceStatus: "Review Needed", governanceReviewDate: "2025-08-31", comments: "SEBI algo trading circular SEBI/HO/MRD/2022 review required. Explainability needed." },
    { componentId: "AI-003", name: "KYC Liveness Detection", type: "ML Model", provider: "AWS Rekognition", useCase: "VKYC face liveness check and PAN card matching", dataUsed: "Customer video stream, PAN card image", riskLevel: "High", complianceStatus: "Compliant", governanceReviewDate: "2025-12-31", comments: "SEBI VKYC master circular compliant. Annual review." },
    { componentId: "AI-004", name: "ChatAshika Assistant", type: "Chatbot", provider: "Internal + GPT-4o", useCase: "Customer self-service — account queries, portfolio view, KYC status", dataUsed: "Account data, portfolio holdings, KYC status (no trading data)", riskLevel: "Medium", complianceStatus: "Compliant", governanceReviewDate: "2025-09-30", comments: "Limited to read-only data. SEBI chatbot guidelines compliant." },
    { componentId: "AI-005", name: "NACH Delinquency Predictor", type: "ML Model", provider: "Internal (AWS SageMaker)", useCase: "Predict NACH bounce probability 30 days ahead for collections prioritisation", dataUsed: "EMI history, account balance, payment patterns", riskLevel: "Medium", complianceStatus: "Compliant", governanceReviewDate: "2025-10-31", comments: "Used internally. RBI MFIN data guidelines adhered." },
    { componentId: "AI-006", name: "AML Transaction Monitoring", type: "Analytics", provider: "NICE Actimize", useCase: "Real-time AML transaction monitoring and STR trigger generation", dataUsed: "All transaction data, account profiles, KYC data", riskLevel: "High", complianceStatus: "Compliant", governanceReviewDate: "2025-12-31", comments: "PMLA/FEMA compliant. FIU-IND integration active." },
    { componentId: "AI-007", name: "RPA Reconciliation Bot", type: "RPA", provider: "UiPath", useCase: "Automated daily reconciliation of settlements, brokerage, and bank statements", dataUsed: "Settlement files, bank statements, exchange reports", riskLevel: "Low", complianceStatus: "Compliant", governanceReviewDate: "2026-03-31", comments: "12 bots in production. Reduces 8 FTE equivalent manual effort." },
    { componentId: "AI-008", name: "Fraud Detection Engine", type: "ML Model", provider: "Internal (XGBoost on AWS)", useCase: "Real-time trading fraud detection — wash trades, circular trading, front-running", dataUsed: "Order flow, execution data, client patterns", riskLevel: "High", complianceStatus: "Review Needed", governanceReviewDate: "2025-07-31", comments: "NSE surveillance co-development. SEBI report submission required." },
    { componentId: "AI-009", name: "Research GenAI Summarizer", type: "LLM", provider: "Anthropic Claude (AWS Bedrock)", useCase: "Summarise equity research reports for institutional sales desk", dataUsed: "Internal research reports, public company filings", riskLevel: "Low", complianceStatus: "Compliant", governanceReviewDate: "2026-03-31", comments: "MNPI controls in place. Not used for trading decisions." },
    { componentId: "AI-010", name: "Portfolio Risk Analytics", type: "Analytics", provider: "FactSet Analytics Cloud", useCase: "Multi-factor risk model for AIF portfolio — VaR, CVaR, stress testing", dataUsed: "Portfolio holdings, market data, macro indicators", riskLevel: "Medium", complianceStatus: "Compliant", governanceReviewDate: "2025-12-31", comments: "SEBI AIF risk management framework aligned." },
  ]);

  // === SBOM ENTRIES ===
  await db.insert(sbomEntriesTable).values([
    { name: "log4j-core", version: "2.14.1", licenseType: "Apache", cve: "CVE-2021-44228", lastScan: "2025-04-01", usedIn: "Finacle OMS, Nucleus LOS", riskLevel: "Critical", actionRequired: "Immediate patch to 2.17.2. Upgrade blocker for Finacle." },
    { name: "spring-framework", version: "5.3.18", licenseType: "Apache", cve: "CVE-2022-22965", lastScan: "2025-04-01", usedIn: "Custom Trading APIs, RiskShield Pro", riskLevel: "Critical", actionRequired: "Spring4Shell patch. Upgrade to 5.3.27 urgently." },
    { name: "jackson-databind", version: "2.13.0", licenseType: "Apache", cve: "CVE-2022-42003", lastScan: "2025-04-01", usedIn: "Multiple internal microservices", riskLevel: "High", actionRequired: "Upgrade to 2.15.3. Check all API deserialization endpoints." },
    { name: "openssl", version: "1.1.1q", licenseType: "Apache", cve: "CVE-2022-3786", lastScan: "2025-04-01", usedIn: "Nginx, AWS EKS nodes, API gateway", riskLevel: "High", actionRequired: "Upgrade to 3.0.7. Infra team patch in next maintenance window." },
    { name: "lodash", version: "4.17.20", licenseType: "MIT", cve: "CVE-2021-23337", lastScan: "2025-04-01", usedIn: "Frontend (React), Node.js APIs", riskLevel: "High", actionRequired: "Upgrade to 4.17.21. Fix prototype pollution vulnerability." },
    { name: "axios", version: "0.21.1", licenseType: "MIT", cve: "CVE-2021-3749", lastScan: "2025-04-01", usedIn: "All React frontends, Node.js services", riskLevel: "High", actionRequired: "Upgrade to 1.6.0. SSRF vulnerability in redirects." },
    { name: "react", version: "18.2.0", licenseType: "MIT", cve: "None", lastScan: "2025-04-01", usedIn: "Customer portal, trading dashboard", riskLevel: "Low", actionRequired: "None. Current stable release." },
    { name: "node", version: "18.19.0", licenseType: "MIT", cve: "CVE-2024-21892", lastScan: "2025-04-01", usedIn: "All Node.js microservices", riskLevel: "Medium", actionRequired: "Upgrade to Node 20 LTS. CVE in HTTP/2 rapid reset." },
    { name: "postgresql", version: "14.10", licenseType: "MIT", cve: "None", lastScan: "2025-04-01", usedIn: "All databases (AWS RDS)", riskLevel: "Low", actionRequired: "Plan upgrade to PG16 in next RDS maintenance window." },
    { name: "nginx", version: "1.24.0", licenseType: "BSD", cve: "None", lastScan: "2025-04-01", usedIn: "API gateway, reverse proxy", riskLevel: "Low", actionRequired: "None. Monitor NGINX security bulletins." },
    { name: "elasticsearch", version: "7.17.9", licenseType: "LGPL", cve: "CVE-2023-31419", lastScan: "2025-04-01", usedIn: "ELK Stack (logging)", riskLevel: "Medium", actionRequired: "Upgrade to 8.x. Stack overflow DoS vulnerability." },
    { name: "python", version: "3.10.12", licenseType: "MIT", cve: "CVE-2023-24329", lastScan: "2025-04-01", usedIn: "ML models, SageMaker pipelines", riskLevel: "Medium", actionRequired: "Upgrade to 3.12. URL parsing bypass vulnerability." },
    { name: "kafka-clients", version: "3.4.0", licenseType: "Apache", cve: "None", lastScan: "2025-04-01", usedIn: "Event streaming (settlement, trading events)", riskLevel: "Low", actionRequired: "None. Stable version." },
    { name: "jwt", version: "8.5.1", licenseType: "MIT", cve: "CVE-2022-23529", lastScan: "2025-04-01", usedIn: "Auth middleware, API security", riskLevel: "High", actionRequired: "Upgrade to 9.0.0. Secret exposure vulnerability." },
    { name: "commons-text", version: "1.9.0", licenseType: "Apache", cve: "CVE-2022-42889", lastScan: "2025-04-01", usedIn: "Finacle OMS, Nucleus LOS backend", riskLevel: "Critical", actionRequired: "Text4Shell vulnerability. Upgrade to 1.10.0 immediately." },
  ]);

  console.log("Database seeded successfully!");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
