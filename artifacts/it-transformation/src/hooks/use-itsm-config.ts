import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface ItsmConfig {
  "itsm.urgencyLevels": string[];
  "itsm.impactLevels": string[];
  "itsm.incidentSources": string[];
  "itsm.incidentCategories": string[];
  "itsm.incidentSubcategories": Record<string, string[]>;
  "itsm.problemCategories": string[];
  "itsm.changeCategories": string[];
  "itsm.srCategories": string[];
  "itsm.departments": string[];
  "itsm.itGroups": string[];
  "itsm.maxAttachmentSizeMB": number;
  "itsm.maxAttachmentsPerTicket": number;
  "itsm.allowedFileTypes": string[];
}

export const ITSM_CONFIG_DEFAULT: ItsmConfig = {
  "itsm.urgencyLevels": ["Critical", "High", "Medium", "Low"],
  "itsm.impactLevels": ["Enterprise-wide", "Department", "Team", "Individual"],
  "itsm.incidentSources": ["Phone", "Email", "Self-Service Portal", "Walk-in", "Monitoring Alert", "Teams / Chat", "API / Integration", "Other"],
  "itsm.incidentCategories": ["Application", "Infrastructure", "Network", "Hardware", "Security", "Database", "Cloud", "End-User", "Operations", "Service Request"],
  "itsm.incidentSubcategories": {
    "Application": ["Performance", "Error / Exception", "Access Denied", "Data Issue", "Integration Failure", "Feature Request"],
    "Infrastructure": ["Server Down", "Disk Space", "CPU / Memory", "Backup Failure", "VM / Container Issue", "Storage"],
    "Network": ["Connectivity", "DNS", "VPN", "Firewall", "WiFi", "Bandwidth"],
    "Hardware": ["Printer", "Laptop / Desktop", "Monitor", "Peripherals", "Battery / Power", "Other"],
    "Security": ["Phishing", "Malware", "Unauthorized Access", "Data Leak", "Vulnerability", "MFA Issue"],
    "Database": ["Slow Query", "Connection Failure", "Corruption", "Backup", "Replication Lag"],
    "Cloud": ["Instance Down", "Storage", "Permissions", "Auto-scaling", "Cost Alert"],
    "End-User": ["Outlook / Email", "Teams", "SharePoint", "Printing", "VPN", "Account Lock"],
    "Operations": ["Scheduled Job", "Maintenance", "Deployment", "Monitoring Alert"],
    "Service Request": ["Account", "Software", "Hardware", "Access", "Other"],
  },
  "itsm.problemCategories": ["Application", "Infrastructure", "Network", "Hardware", "Security", "Process", "Database", "Cloud", "Operations"],
  "itsm.changeCategories": ["Software", "Hardware", "Network", "Security", "Process", "Infrastructure", "Database", "Cloud", "End-User"],
  "itsm.srCategories": ["Access Request", "Software Install", "Hardware Request", "Account Setup", "Password Reset", "VPN Access", "Email Setup", "Mobile Device", "Printer Setup", "Data Export / Report", "New Joinee Onboarding", "Offboarding / Exit", "Other"],
  "itsm.departments": ["IT", "Finance", "HR", "Operations", "Sales", "Marketing", "Legal", "Admin", "Executive"],
  "itsm.itGroups": ["IT Helpdesk", "Infrastructure Team", "Network Team", "Security Team", "Applications Team", "Database Team", "Cloud Team", "Desktop Support", "Development Team", "Operations Team"],
  "itsm.maxAttachmentSizeMB": 20,
  "itsm.maxAttachmentsPerTicket": 10,
  "itsm.allowedFileTypes": ["pdf", "xlsx", "xls", "docx", "doc", "png", "jpg", "jpeg", "zip", "csv", "txt", "pptx", "ppt", "msg"],
};

export function useItsmConfig(): ItsmConfig {
  const { data } = useQuery<ItsmConfig>({
    queryKey: ["itsm-config"],
    queryFn: () => apiFetch<ItsmConfig>("/itsm-config"),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? ITSM_CONFIG_DEFAULT;
}
