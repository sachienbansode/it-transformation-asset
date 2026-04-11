import { db, assetsTable, assetCategoriesTable, assetVendorsTable, assetLicensesTable, assetAllocationsTable, assetTransactionsTable, maintenanceRecordsTable, itsmIncidentsTable, itsmProblemsTable, itsmChangesTable, itsmSlaPoliciesTable, itsmKnowledgeBaseTable, itsmServiceRequestsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function seedAssetAndItsmModules() {
  const [{ count: assetCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(assetsTable);
  const [{ count: incidentCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(itsmIncidentsTable);

  if (assetCount > 0 && incidentCount > 0) return;

  await db.insert(assetCategoriesTable).values([
    { name: "Desktops", description: "Desktop computers and workstations" },
    { name: "Laptops", description: "Portable computing devices" },
    { name: "Servers", description: "Physical and virtual servers" },
    { name: "Networking", description: "Routers, switches, firewalls" },
    { name: "Printers", description: "Printers and MFDs" },
    { name: "Mobile Devices", description: "Tablets and smartphones" },
    { name: "Software", description: "Enterprise software licenses" },
    { name: "Peripherals", description: "Monitors, keyboards, mice" },
  ]);

  await db.insert(assetVendorsTable).values([
    { name: "Dell Technologies", contactPerson: "Rajesh Kumar", email: "rajesh@dell.com", phone: "+91 22 4567 8901", contractStart: "2024-01-01", contractEnd: "2026-12-31", rating: 4, status: "Active" },
    { name: "HP Enterprise", contactPerson: "Priya Sharma", email: "priya@hpe.com", phone: "+91 22 4567 8902", contractStart: "2024-03-01", contractEnd: "2026-02-28", rating: 5, status: "Active" },
    { name: "Cisco Systems", contactPerson: "Amit Patel", email: "amit@cisco.com", phone: "+91 22 4567 8903", contractStart: "2024-06-01", contractEnd: "2027-05-31", rating: 4, status: "Active" },
    { name: "Microsoft India", contactPerson: "Neha Gupta", email: "neha@microsoft.com", phone: "+91 22 4567 8904", contractStart: "2024-01-01", contractEnd: "2025-12-31", rating: 5, status: "Active" },
    { name: "Lenovo India", contactPerson: "Suresh Iyer", email: "suresh@lenovo.com", phone: "+91 22 4567 8905", contractStart: "2025-01-01", contractEnd: "2027-12-31", rating: 3, status: "Active" },
  ]);

  await db.insert(assetsTable).values([
    { assetTag: "AST-LAP-001", name: "Dell Latitude 5540", type: "Laptop", categoryId: 2, serialNumber: "DL5540-XK8J2", status: "Allocated", ownerName: "Vikram Shah", department: "Broking IT", location: "Mumbai HQ - 5th Floor", purchaseDate: "2024-03-15", cost: "89500.00", vendorName: "Dell Technologies", warrantyExpiry: "2027-03-14", osVersion: "Windows 11 Pro", configuration: "i7-1365U / 16GB / 512GB SSD" },
    { assetTag: "AST-LAP-002", name: "HP EliteBook 860 G10", type: "Laptop", categoryId: 2, serialNumber: "HP860-MN4R7", status: "Allocated", ownerName: "Priyanka Mehta", department: "NBFC Operations", location: "Mumbai HQ - 3rd Floor", purchaseDate: "2024-05-20", cost: "112000.00", vendorName: "HP Enterprise", warrantyExpiry: "2027-05-19", osVersion: "Windows 11 Pro", configuration: "i7-1370P / 32GB / 1TB SSD" },
    { assetTag: "AST-SRV-001", name: "Dell PowerEdge R760", type: "Server", categoryId: 3, serialNumber: "DPE760-QW3K9", status: "In Use", ownerName: "IT Infrastructure", department: "Technology", location: "Navi Mumbai DC - Rack A3", purchaseDate: "2024-01-10", cost: "850000.00", vendorName: "Dell Technologies", warrantyExpiry: "2029-01-09", configuration: "Xeon Gold 6448Y / 256GB / 8TB RAID" },
    { assetTag: "AST-SRV-002", name: "HP ProLiant DL380 Gen11", type: "Server", categoryId: 3, serialNumber: "HPL380-RT5P2", status: "In Use", ownerName: "IT Infrastructure", department: "Technology", location: "Navi Mumbai DC - Rack B1", purchaseDate: "2024-02-15", cost: "720000.00", vendorName: "HP Enterprise", warrantyExpiry: "2029-02-14", configuration: "Xeon Silver 4416+ / 128GB / 4TB RAID" },
    { assetTag: "AST-NET-001", name: "Cisco Catalyst 9300-48P", type: "Network Switch", categoryId: 4, serialNumber: "C9300-WQ7N3", status: "In Use", department: "Technology", location: "Mumbai HQ - Server Room", purchaseDate: "2024-04-01", cost: "345000.00", vendorName: "Cisco Systems", warrantyExpiry: "2029-03-31", configuration: "48-port PoE+ / 10G Uplinks" },
    { assetTag: "AST-NET-002", name: "Cisco ASA 5525-X Firewall", type: "Firewall", categoryId: 4, serialNumber: "ASA5525-JP8M1", status: "In Use", department: "Technology", location: "Navi Mumbai DC", purchaseDate: "2024-01-15", cost: "485000.00", vendorName: "Cisco Systems", warrantyExpiry: "2027-01-14", configuration: "Next-Gen Firewall / IPS / VPN" },
    { assetTag: "AST-DES-001", name: "Dell OptiPlex 7010", type: "Desktop", categoryId: 1, serialNumber: "DO7010-LK6H4", status: "Allocated", ownerName: "Rahul Desai", department: "Institutional Equities", location: "Mumbai HQ - 7th Floor", purchaseDate: "2024-06-10", cost: "65000.00", vendorName: "Dell Technologies", warrantyExpiry: "2027-06-09", configuration: "i5-13600 / 16GB / 256GB SSD" },
    { assetTag: "AST-DES-002", name: "HP ProDesk 400 G9", type: "Desktop", categoryId: 1, serialNumber: "HPD400-BV2N8", status: "In Stock", department: "IT Stores", location: "Mumbai HQ - IT Store", purchaseDate: "2025-01-20", cost: "58000.00", vendorName: "HP Enterprise", warrantyExpiry: "2028-01-19", configuration: "i5-12500 / 8GB / 256GB SSD" },
    { assetTag: "AST-PRN-001", name: "HP LaserJet Pro MFP M428fdw", type: "Printer", categoryId: 5, serialNumber: "HPM428-XR4W6", status: "In Use", department: "Admin", location: "Mumbai HQ - 4th Floor", purchaseDate: "2024-08-15", cost: "42000.00", vendorName: "HP Enterprise", warrantyExpiry: "2026-08-14" },
    { assetTag: "AST-LAP-003", name: "Lenovo ThinkPad X1 Carbon Gen 11", type: "Laptop", categoryId: 2, serialNumber: "LNX1C-TP3J5", status: "Allocated", ownerName: "Anita Krishnan", department: "AIF", location: "Mumbai HQ - 6th Floor", purchaseDate: "2024-09-01", cost: "145000.00", vendorName: "Lenovo India", warrantyExpiry: "2027-08-31", osVersion: "Windows 11 Pro", configuration: "i7-1365U / 32GB / 1TB SSD" },
    { assetTag: "AST-MOB-001", name: "Samsung Galaxy Tab S9 FE", type: "Tablet", categoryId: 6, serialNumber: "SGT9-KM5L2", status: "Allocated", ownerName: "Sunil Joshi", department: "Sales", location: "Mumbai HQ", purchaseDate: "2025-02-10", cost: "38000.00", warrantyExpiry: "2026-02-09" },
    { assetTag: "AST-SRV-003", name: "Dell PowerEdge R650xs", type: "Server", categoryId: 3, serialNumber: "DPE650-NQ1R8", status: "Under Maintenance", department: "Technology", location: "DR Site - Pune", purchaseDate: "2023-06-15", cost: "620000.00", vendorName: "Dell Technologies", warrantyExpiry: "2026-06-14", configuration: "Xeon Silver 4314 / 128GB / 4TB RAID" },
    { assetTag: "AST-LAP-004", name: "Dell Latitude 7440", type: "Laptop", categoryId: 2, serialNumber: "DL7440-PX9K7", status: "In Stock", department: "IT Stores", location: "Mumbai HQ - IT Store", purchaseDate: "2025-03-01", cost: "95000.00", vendorName: "Dell Technologies", warrantyExpiry: "2028-02-28", configuration: "i7-1365U / 16GB / 512GB SSD" },
    { assetTag: "AST-NET-003", name: "Cisco Meraki MR46", type: "Access Point", categoryId: 4, serialNumber: "MR46-HN3V9", status: "In Use", department: "Technology", location: "Mumbai HQ - All Floors", purchaseDate: "2024-07-01", cost: "78000.00", vendorName: "Cisco Systems", warrantyExpiry: "2029-06-30", configuration: "Wi-Fi 6 / Cloud Managed" },
    { assetTag: "AST-DES-003", name: "Dell OptiPlex 5000", type: "Desktop", categoryId: 1, serialNumber: "DO5000-FY8T3", status: "Retired", department: "Technology", location: "IT Disposal", purchaseDate: "2020-03-15", cost: "52000.00", vendorName: "Dell Technologies", notes: "End of life - scheduled for disposal" },
  ]);

  await db.insert(assetLicensesTable).values([
    { productName: "Microsoft 365 E3", vendorName: "Microsoft India", licenseType: "Subscription", expiryDate: "2026-03-31", seatsTotal: 500, seatsUsed: 423, cost: "1800000.00", status: "Active" },
    { productName: "Windows Server 2022 DC", vendorName: "Microsoft India", licenseType: "Perpetual", seatsTotal: 20, seatsUsed: 14, cost: "450000.00", status: "Active" },
    { productName: "VMware vSphere Enterprise Plus", vendorName: "VMware/Broadcom", licenseType: "Subscription", expiryDate: "2025-12-31", seatsTotal: 12, seatsUsed: 10, cost: "680000.00", status: "Active" },
    { productName: "Symantec Endpoint Protection", vendorName: "Broadcom", licenseType: "Subscription", expiryDate: "2025-09-30", seatsTotal: 600, seatsUsed: 478, cost: "320000.00", status: "Active" },
    { productName: "ServiceNow ITSM", vendorName: "ServiceNow", licenseType: "Subscription", expiryDate: "2026-06-30", seatsTotal: 50, seatsUsed: 35, cost: "950000.00", status: "Active" },
    { productName: "Adobe Creative Cloud", vendorName: "Adobe", licenseType: "Subscription", expiryDate: "2025-08-15", seatsTotal: 15, seatsUsed: 12, cost: "180000.00", status: "Expiring Soon" },
    { productName: "Oracle Database SE2", vendorName: "Oracle India", licenseType: "Perpetual", seatsTotal: 4, seatsUsed: 4, cost: "1200000.00", status: "Active" },
    { productName: "Zoom Business", vendorName: "Zoom", licenseType: "Subscription", expiryDate: "2025-07-31", seatsTotal: 200, seatsUsed: 167, cost: "240000.00", status: "Active" },
  ]);

  await db.insert(assetAllocationsTable).values([
    { assetId: 1, userName: "Vikram Shah", department: "Broking IT", startDate: "2024-03-20", status: "Active" },
    { assetId: 2, userName: "Priyanka Mehta", department: "NBFC Operations", startDate: "2024-05-25", status: "Active" },
    { assetId: 7, userName: "Rahul Desai", department: "Institutional Equities", startDate: "2024-06-15", status: "Active" },
    { assetId: 10, userName: "Anita Krishnan", department: "AIF", startDate: "2024-09-05", status: "Active" },
    { assetId: 11, userName: "Sunil Joshi", department: "Sales", startDate: "2025-02-15", status: "Active" },
  ]);

  const [{ count: incCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(itsmIncidentsTable);
  if (incCount > 0) return;

  await db.insert(itsmSlaPoliciesTable).values([
    { name: "Critical SLA", priority: "Critical", responseTimeHours: 1, resolutionTimeHours: 4, escalationEnabled: true },
    { name: "High SLA", priority: "High", responseTimeHours: 2, resolutionTimeHours: 8, escalationEnabled: true },
    { name: "Medium SLA", priority: "Medium", responseTimeHours: 4, resolutionTimeHours: 24, escalationEnabled: true },
    { name: "Low SLA", priority: "Low", responseTimeHours: 8, resolutionTimeHours: 72, escalationEnabled: false },
  ]);

  await db.insert(itsmIncidentsTable).values([
    { ticketNo: "INC-00001", title: "Trading platform login failure", description: "Multiple broking users unable to login to NSE trading terminal during market hours", status: "Resolved", priority: "Critical", severity: "S1", category: "Application", assignedTo: "Deepak Verma", assignedGroup: "L2 Support", reportedBy: "Vikram Shah", affectedSystem: "NSE Trading Terminal", resolutionNotes: "SSL certificate renewed and load balancer restarted", resolvedAt: new Date("2025-03-15T10:30:00Z") },
    { ticketNo: "INC-00002", title: "Email service intermittent outage", description: "Exchange Online emails delayed by 15+ minutes for NBFC division", status: "Open", priority: "High", severity: "S2", category: "Infrastructure", assignedTo: "Sandeep Rao", assignedGroup: "L2 Support", reportedBy: "Priyanka Mehta", affectedSystem: "Microsoft 365" },
    { ticketNo: "INC-00003", title: "VPN connectivity issues from Kolkata office", description: "Kolkata branch users unable to connect via Cisco AnyConnect VPN", status: "In Progress", priority: "High", severity: "S2", category: "Network", assignedTo: "Ravi Kumar", assignedGroup: "Network Team", reportedBy: "Arun Ghosh", affectedSystem: "Cisco VPN" },
    { ticketNo: "INC-00004", title: "Printer not responding on 4th floor", description: "HP MFP on 4th floor Mumbai HQ shows offline status", status: "Open", priority: "Low", severity: "S4", category: "Hardware", assignedTo: "Help Desk", assignedGroup: "L1 Support", reportedBy: "Kavita Nair", affectedSystem: "HP Printer" },
    { ticketNo: "INC-00005", title: "Core banking application slow response", description: "CBS response time exceeding 10 seconds for account queries during peak hours", status: "In Progress", priority: "Critical", severity: "S1", category: "Application", assignedTo: "Manoj Pillai", assignedGroup: "L3 Support", reportedBy: "Rajesh Agarwal", affectedSystem: "Core Banking System" },
    { ticketNo: "INC-00006", title: "Data backup failure on DR site", description: "Nightly incremental backup to Pune DR site failed with storage error", status: "Resolved", priority: "High", severity: "S2", category: "Infrastructure", assignedTo: "Deepak Verma", assignedGroup: "L2 Support", reportedBy: "System Alert", affectedSystem: "Backup Infrastructure", resolutionNotes: "Storage LUN expanded and backup rescheduled", resolvedAt: new Date("2025-03-20T06:00:00Z") },
    { ticketNo: "INC-00007", title: "Two-factor auth not sending OTP", description: "MFA OTP SMS not delivered to users in AIF department", status: "Open", priority: "Medium", severity: "S3", category: "Security", assignedTo: "Sandeep Rao", assignedGroup: "L2 Support", reportedBy: "Anita Krishnan", affectedSystem: "MFA System" },
    { ticketNo: "INC-00008", title: "File server access denied error", description: "Shared drive \\\\fs01\\compliance shows access denied for compliance team", status: "Resolved", priority: "Medium", severity: "S3", category: "Infrastructure", assignedTo: "Help Desk", assignedGroup: "L1 Support", reportedBy: "Sunita Das", affectedSystem: "File Server", resolutionNotes: "AD group membership updated", resolvedAt: new Date("2025-04-01T14:00:00Z") },
    { ticketNo: "INC-00009", title: "Website SSL certificate expiring", description: "Public website SSL cert expires in 7 days", status: "In Progress", priority: "High", severity: "S2", category: "Security", assignedTo: "Ravi Kumar", assignedGroup: "Network Team", reportedBy: "System Alert", affectedSystem: "Public Website" },
    { ticketNo: "INC-00010", title: "New employee laptop setup request", description: "Provision laptop for new joiner in Mutual Fund division", status: "Closed", priority: "Low", severity: "S4", category: "Service Request", assignedTo: "Help Desk", assignedGroup: "L1 Support", reportedBy: "HR Team", affectedSystem: "N/A", resolutionNotes: "Dell Latitude provisioned and configured", resolvedAt: new Date("2025-03-25T16:00:00Z"), closedAt: new Date("2025-03-26T10:00:00Z") },
  ]);

  await db.insert(itsmProblemsTable).values([
    { problemNo: "PRB-00001", title: "Recurring VPN disconnections from remote offices", description: "Pattern of VPN drops across multiple branch offices during peak hours", rootCause: "ISP bandwidth throttling during peak hours + VPN concentrator session limits", workaround: "Split tunnel configuration applied as temporary fix", status: "Known Error", priority: "High", assignedTo: "Ravi Kumar", relatedIncidents: "INC-00003", affectedSystems: "Cisco VPN, WAN Links" },
    { problemNo: "PRB-00002", title: "Intermittent Exchange Online delays", description: "Email delivery delays recurring weekly", rootCause: "Investigation in progress - suspected mail flow rules conflict", status: "Under Investigation", priority: "High", assignedTo: "Sandeep Rao", relatedIncidents: "INC-00002", affectedSystems: "Microsoft 365 Exchange" },
    { problemNo: "PRB-00003", title: "Core banking application performance degradation", description: "CBS slow during peak trading hours 9:15-10:30 AM", rootCause: "Database query optimization needed + connection pool exhaustion", workaround: "Increased connection pool size temporarily", status: "Root Cause Identified", priority: "Critical", assignedTo: "Manoj Pillai", relatedIncidents: "INC-00005", affectedSystems: "Core Banking, Oracle DB" },
    { problemNo: "PRB-00004", title: "Print spooler crashes on Windows 11 machines", description: "Print spooler service crashes intermittently after Windows 11 23H2 update", rootCause: "Known Windows 11 bug with HP Universal Print Driver", workaround: "Use HP specific driver instead of universal driver", status: "Known Error", priority: "Low", assignedTo: "Help Desk", relatedIncidents: "INC-00004", affectedSystems: "Windows 11, HP Printers" },
    { problemNo: "PRB-00005", title: "SSL certificate management gaps", description: "Multiple SSL certs approaching expiry without alerts", rootCause: "No centralized certificate lifecycle management tool", status: "Open", priority: "Medium", assignedTo: "Deepak Verma", relatedIncidents: "INC-00009", affectedSystems: "Public-facing websites, Internal apps" },
  ]);

  await db.insert(itsmChangesTable).values([
    { changeNo: "CHG-00001", title: "Upgrade Core Banking System to v12.5", description: "Major version upgrade of CBS including new regulatory reporting modules", type: "Major", riskLevel: "High", impact: "All banking operations", approvalStatus: "Approved", requestedBy: "Manoj Pillai", approvedBy: "CTO", implementationDate: "2025-05-15", rollbackPlan: "Database snapshot + application rollback to v12.0", status: "Scheduled" },
    { changeNo: "CHG-00002", title: "Network switch firmware upgrade - Mumbai HQ", description: "Upgrade Cisco Catalyst 9300 switches to firmware 17.12.3", type: "Standard", riskLevel: "Medium", impact: "Brief network disruption during maintenance window", approvalStatus: "Approved", requestedBy: "Ravi Kumar", approvedBy: "IT Admin", implementationDate: "2025-04-20", rollbackPlan: "Rollback to previous firmware version", status: "Approved" },
    { changeNo: "CHG-00003", title: "Deploy new endpoint protection solution", description: "Replace Symantec with CrowdStrike Falcon across all endpoints", type: "Major", riskLevel: "High", impact: "All user workstations and servers", approvalStatus: "Pending", requestedBy: "Deepak Verma", implementationDate: "2025-06-01", rollbackPlan: "Reinstall Symantec if CrowdStrike causes issues", status: "Under Review" },
    { changeNo: "CHG-00004", title: "Add DR replication for trading database", description: "Set up real-time Oracle DataGuard replication to Pune DR site", type: "Normal", riskLevel: "Low", impact: "No production impact - new replication", approvalStatus: "Approved", requestedBy: "Sandeep Rao", approvedBy: "CTO", implementationDate: "2025-04-25", rollbackPlan: "Remove replication configuration", status: "Implementation" },
    { changeNo: "CHG-00005", title: "Microsoft 365 tenant migration", description: "Consolidate two M365 tenants into single tenant for unified management", type: "Emergency", riskLevel: "High", impact: "Email and Teams disruption during cutover", approvalStatus: "Rejected", requestedBy: "IT Admin", status: "Rejected" },
  ]);

  await db.insert(itsmKnowledgeBaseTable).values([
    { title: "VPN Setup Guide for Remote Users", content: "Step-by-step guide for configuring Cisco AnyConnect VPN client on Windows and macOS. Includes troubleshooting tips for common connection issues.", category: "Network", tags: "vpn,remote,anyconnect,cisco", authorName: "Ravi Kumar", views: 342, status: "Published" },
    { title: "Password Reset Procedure", content: "Self-service password reset via Azure AD portal. For locked accounts, contact L1 Help Desk with employee ID verification.", category: "Identity", tags: "password,reset,azure,ad", authorName: "Help Desk Team", views: 1205, status: "Published" },
    { title: "Printer Setup - Mumbai HQ", content: "Instructions for adding network printers on each floor. Includes printer IP addresses and driver download links.", category: "Hardware", tags: "printer,setup,hp,network", authorName: "Help Desk Team", views: 567, status: "Published" },
    { title: "Core Banking System Troubleshooting", content: "Common CBS error codes and resolution steps. Includes database connection verification and session management.", category: "Application", tags: "cbs,banking,oracle,troubleshooting", authorName: "Manoj Pillai", views: 89, status: "Published" },
    { title: "Security Incident Response Playbook", content: "Procedures for handling security incidents: identification, containment, eradication, recovery, and lessons learned.", category: "Security", tags: "security,incident,response,playbook", authorName: "Deepak Verma", views: 45, status: "Published" },
  ]);

  await db.insert(itsmServiceRequestsTable).values([
    { requestNo: "SR-00001", title: "New laptop for VP - Investment Banking", description: "High-spec laptop required for VP joining IB division", category: "Hardware", status: "In Progress", priority: "High", requestedBy: "HR Team", assignedTo: "IT Procurement" },
    { requestNo: "SR-00002", title: "Software installation - Bloomberg Terminal", description: "Install Bloomberg Terminal on 3 new desktops in Equity Research", category: "Software", status: "Completed", priority: "Medium", requestedBy: "Equity Research Head", assignedTo: "L1 Support", completedAt: new Date("2025-03-28T12:00:00Z") },
    { requestNo: "SR-00003", title: "Meeting room video conferencing upgrade", description: "Upgrade 5th floor conference room with Poly Studio X50", category: "Hardware", status: "Approved", priority: "Medium", requestedBy: "Admin Team", assignedTo: "IT Infrastructure" },
    { requestNo: "SR-00004", title: "Access request - Compliance shared drive", description: "New compliance officer needs read/write access to \\\\fs01\\compliance", category: "Access", status: "Submitted", priority: "Low", requestedBy: "Compliance Head", assignedTo: "L1 Support" },
    { requestNo: "SR-00005", title: "Mobile device enrollment - MDM", description: "Enroll 10 new iPads in Intune MDM for sales team", category: "Mobile", status: "In Progress", priority: "Medium", requestedBy: "Sales Manager", assignedTo: "IT Infrastructure" },
  ]);

  console.log("[Seed] Asset Management and ITSM modules seeded successfully");
}
