import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { PageHero } from "@/components/workspace-ui";
import { Info, ShieldCheck, Laptop, Activity, MessageSquare, LayoutDashboard, ClipboardCheck, Users, FileCheck2, Cpu } from "lucide-react";

/* ITH-092 — About IT Hub: every module and feature, and what the NIYTRI device agent does and collects.
   Super Admin and IT Asset Admin only (checked by the server). */
const MODULES: { name: string; icon: React.ElementType; features: string[] }[] = [
  { name: "IT – Drishti (transformation)", icon: LayoutDashboard, features: ["Executive dashboard", "IT master checklist", "Transformation roadmap", "Application retirement plan", "Application inventory", "AI and software bills of materials", "PPT reports"] },
  { name: "Performance (KPIs)", icon: Activity, features: ["KPI dashboard", "KPI sets per department with upload, review and approval"] },
  { name: "IT Assets", icon: Laptop, features: ["Asset register with QR / barcode scan", "Handovers, transfers and returns with employee acknowledgement", "Employee asset view", "Vendors, contracts and AMC", "Licences and licence assignments", "Depreciation rules and finance maker-checker", "Physical audits", "Maintenance records", "Device Health (agent): live health, online status, Refresh now, items needing attention, ignore with reason, auto tickets", "Device data: hardware, security, installed software; usage (Super Admin only)", "Installation keys register with full activity log"] },
  { name: "ITSM", icon: ClipboardCheck, features: ["Incidents, service requests, problems and change requests", "SLA policies with working hours and alerts", "Approval workflow with reminders and escalation", "Knowledge base", "Teams, categories and routing (ITSM Setup)", "Tickets raised from device warnings and closed automatically from device data, with the report reference", "Suggestions to close tickets when the device data shows the issue is fixed", "Closed tickets re-opened only by an ITSM Admin"] },
  { name: "Chats", icon: MessageSquare, features: ["Direct chats (private to the two people)", "Get IT support → the mapped support team's queue: pick up, take over, assign, back to queue", "User status: Online, Away, Do not disturb, Offline", "Files up to 10 MB of allowed types, encrypted at rest", "Screen sharing after the employee agrees, viewed in its own window", "Remote control through Windows Quick Assist with guided steps and a live timer", "Recordings in Amazon S3 or Azure Blob (encrypted); not recorded when storage is not set", "Recordings and session logs for IT and Super Admin only"] },
  { name: "Policies & consent", icon: FileCheck2, features: ["Policies, notices and consents with versions", "Mandatory acceptance with grace period and access lock", "Optional consents that can be withdrawn", "Decision history per person"] },
  { name: "Audit & compliance", icon: ShieldCheck, features: ["Compliance audits with checkpoints, evidence and auditor portal", "Audit trail of every change in every module, with export", "In-app confirmation before every change, naming the record and old → new values"] },
  { name: "Administration", icon: Users, features: ["Users, roles and module permissions (Super Admin, ITSM Admin / Agent, IT Asset Admin / Manager, Employee, External Auditor)", "Masters with paging, history, activate / deactivate (never deleted)", "Business units", "Settings: chats, attachments, recordings storage, push notifications", "Archive and notification rules"] },
];
const AGENT: { title: string; items: string[] }[] = [
  { title: "What it reports (every 15 minutes, or within a minute on Refresh now)", items: ["Performance: CPU, memory, uptime", "Storage: drives, free space, disk health", "Battery: health, charge, cycles (from WMI or the Windows battery report)", "Security: antivirus, firewall, BitLocker, Secure Boot, TPM, UAC, SMB1", "OS & updates: edition, build, activation, last Windows update and history, restart pending, update service", "Ports & access: USB storage allowed / blocked, USB disks, removable drives, Bluetooth, Remote Desktop, local administrators, guest account, shared folders, autorun, screen lock", "Installed software (once a day)", "Its own status: version, scheduled tasks, tray, errors"] },
  { title: "Usage (only as allowed per employee by the administrator)", items: ["Active and idle minutes per day and the foreground application name — no keystrokes, screenshots, window titles, files or content", "Visible to Super Admin only"] },
  { title: "How it is protected", items: ["HTTPS only; one secret token per device, encrypted on the computer for the system account only", "Updates itself only when the download matches the published SHA-256", "Only a local administrator can uninstall it, and IT is alerted", "Online signal every minute; follows IT Hub to a new address automatically", "Everything it sends is size-checked and stored as data, never run"] },
  { title: "On the computer", items: ["NIYTRI tray icon: My device health, Open IT Hub, My Policies", "Runs as three scheduled tasks: health report (SYSTEM), online signal (SYSTEM), usage & tray (signed-in user)", "Windows 10 / 11 and Windows Server 2016+, PowerShell 5.1"] },
];

export default function About() {
  const { data, error, isLoading } = useQuery({ queryKey: ["about"], queryFn: () => apiFetch<any>("/about"), retry: false });
  if (error) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground"><Info className="w-7 h-7 mx-auto mb-2 opacity-40" />{(error as Error).message}</CardContent></Card>;
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHero img={`${import.meta.env.BASE_URL}niytri-agent.png`} title="About IT Hub" subtitle="Everything IT Hub and the NIYTRI device agent do — for Super Admin and IT Asset Admin." />
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : data && <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[["Active users", data.counts?.users], ["Devices with the agent", data.counts?.devices], ["Assets", data.counts?.assets], ["Incidents", data.counts?.incidents], ["Latest agent", data.agent?.latest || "—"]].map(([l, v]) =>
          <div key={l as string} className="rounded-xl border bg-card px-3.5 py-3"><div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{l}</div><div className="text-2xl font-bold mt-1">{v as any}</div></div>)}
      </div>}
      <Card><CardContent className="p-4">
        <h2 className="text-sm font-semibold mb-3">Application modules and features</h2>
        <div className="grid md:grid-cols-2 gap-3">{MODULES.map(m => (
          <div key={m.name} className="rounded-lg border p-3"><div className="font-semibold text-sm flex items-center gap-1.5 mb-1.5"><m.icon className="w-4 h-4 text-primary" />{m.name}</div>
            <ul className="text-xs space-y-1 list-disc pl-5 text-muted-foreground">{m.features.map(f => <li key={f}><span className="text-foreground">{f}</span></li>)}</ul></div>))}</div>
      </CardContent></Card>
      <Card><CardContent className="p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Cpu className="w-4 h-4" />NIYTRI device agent</h2>
        <div className="grid md:grid-cols-2 gap-3">{AGENT.map(g => (
          <div key={g.title} className="rounded-lg border p-3"><div className="font-semibold text-xs mb-1.5">{g.title}</div>
            <ul className="text-xs space-y-1 list-disc pl-5">{g.items.map(f => <li key={f}>{f}</li>)}</ul></div>))}</div>
        {data?.agent?.versions?.length > 0 && <div className="mt-3 text-xs"><div className="font-semibold mb-1">Agent versions in use</div>
          <div className="flex gap-2 flex-wrap">{data.agent.versions.map((v: any) => <span key={v.version} className="rounded-full border px-2.5 py-0.5">{v.version} · {v.devices} device{v.devices === 1 ? "" : "s"}</span>)}</div></div>}
      </CardContent></Card>
      {data?.app && <div className="text-[11px] text-muted-foreground">Server running since {fmtDateTime(data.app.started)} · Node {data.app.node}{data.app.build ? ` · build ${data.app.build}` : ""} · © NIYTRI Technologies</div>}
    </div>
  );
}
