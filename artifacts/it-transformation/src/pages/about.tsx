import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { PageHero } from "@/components/workspace-ui";
import { Info, ShieldCheck, Laptop, Activity, MessageSquare, LayoutDashboard, ClipboardCheck, Users, FileCheck2, Cpu, History } from "lucide-react";

/* ITH-092 — About IT Hub: every module and feature, and what the NIYTRI device agent does and collects.
   Super Admin and IT Asset Admin only (checked by the server). */
const MODULES: { name: string; icon: React.ElementType; features: string[] }[] = [
  { name: "IT – Drishti (transformation)", icon: LayoutDashboard, features: ["Executive dashboard", "IT master checklist", "Transformation roadmap", "Application retirement plan", "Application inventory", "AI and software bills of materials", "PPT reports"] },
  { name: "Performance (KPIs)", icon: Activity, features: ["KPI dashboard", "KPI sets per department with upload, review and approval"] },
  { name: "IT Assets", icon: Laptop, features: ["Asset register with QR / barcode scan", "Handovers, transfers and returns with employee acknowledgement", "Employee asset view", "Vendors, contracts and AMC", "Licences and licence assignments", "Depreciation rules and finance maker-checker", "Physical audits", "Maintenance records", "Device Health (agent): live health, online status, Refresh now, items needing attention, ignore with reason, auto tickets", "Device data: hardware, security, installed software; usage (Super Admin only)", "Installation keys register with full activity log", "Device Policy: company end-user device policy with versions; every device checked against it; failed rules raise items and tickets", "Software & Licences: fleet software, software rules (Licensed / Free / Not allowed / Review), pirated or not-allowed software, licence seats and over-use, Windows activation"] },
  { name: "ITSM", icon: ClipboardCheck, features: ["Incidents, service requests, problems and change requests", "SLA policies with working hours and alerts", "Approval workflow with reminders and escalation", "Knowledge base", "Teams, categories and routing (ITSM Setup)", "Tickets raised from device warnings and closed automatically from device data, with the report reference", "Suggestions to close tickets when the device data shows the issue is fixed", "Closed tickets re-opened only by an ITSM Admin"] },
  { name: "Chats", icon: MessageSquare, features: ["Direct chats (private to the two people)", "Get IT support → the mapped support team's queue: pick up, take over, assign, back to queue", "User status: Online, Away, Do not disturb, Offline", "Files up to 10 MB of allowed types, encrypted at rest", "Screen sharing after the employee agrees, viewed in its own window", "Remote control through Windows Quick Assist with guided steps and a live timer", "Recordings in Amazon S3 or Azure Blob (encrypted); not recorded when storage is not set", "Recordings and session logs for IT and Super Admin only"] },
  { name: "Policies & consent", icon: FileCheck2, features: ["Policies, notices and consents with versions", "Mandatory acceptance with grace period and access lock", "Optional consents that can be withdrawn", "Decision history per person"] },
  { name: "Audit & compliance", icon: ShieldCheck, features: ["Compliance audits with checkpoints, evidence and auditor portal", "Audit trail of every change in every module, with export", "In-app confirmation before every change, naming the record and old → new values"] },
  { name: "Administration", icon: Users, features: ["Users, roles and module permissions (Super Admin, ITSM Admin / Agent, IT Asset Admin / Manager, Employee, External Auditor)", "Masters with paging, history, activate / deactivate (never deleted)", "Business units", "Settings: chats, attachments, recordings storage, push notifications", "Archive and notification rules"] },
];
/* ITH-099 — the agent as the engine behind IT Assets and ITSM */
const FLOW: { step: string; title: string; text: string }[] = [
  { step: "1", title: "Install", text: "IT creates an installation key (per employee or per asset) and runs install.cmd as administrator. The agent registers three scheduled tasks and the NIYTRI tray icon." },
  { step: "2", title: "Enrol", text: "The key is exchanged once for the device's own secret token. The device appears in Device Health and is linked to the asset in the register and to the employee." },
  { step: "3", title: "Report", text: "Every 15 minutes (or within a minute on Refresh now) it sends performance, storage, battery, security, updates, ports and access, and its own status; installed software once a day; an online signal every minute." },
  { step: "4", title: "Evaluate", text: "IT Hub checks each report against the health thresholds, the company device policy, the software rules and licence seats. The device gets a health state and a compliance state." },
  { step: "5", title: "Act", text: "Each problem becomes an item on the device. Items raise ITSM tickets automatically to the right team and category, and IT can chat, share screen or take control from the same device." },
  { step: "6", title: "Verify & close", text: "When a later report shows the problem is gone, the item closes and the ticket is closed with the report reference. Ignored items need a reason; closed tickets are re-opened only by an ITSM Admin." },
];
const HELPS: { title: string; icon: React.ElementType; items: string[] }[] = [
  { title: "For IT Assets", icon: Laptop, items: [
    "Asset register stays true: hostname, serial, maker, model, OS and the signed-in user come from the device itself, not from manual entry",
    "Live condition of every asset (health, battery wear, disk health, uptime) for refresh, repair and replacement decisions",
    "Device policy compliance per asset — encryption, antivirus, firewall, updates, USB, RDP, admin rights and more — with versions and history",
    "Software inventory across the fleet; not-allowed or pirated software (KMS tools, cracks, keygens) flagged; licence seats compared with real installs; Windows activation checked",
    "Physical audits and handovers backed by the agent's last report (who used it and when it was last seen online)",
    "Usage (active / idle and application names only, when allowed) to find idle or over-used assets — Super Admin only"] },
  { title: "For ITSM", icon: ClipboardCheck, items: [
    "Incidents raised before the employee notices: low disk, BitLocker off, antivirus stale, updates overdue, policy rules failed, not-allowed software",
    "Each ticket carries the device, the asset, the employee and the exact reading that raised it; routed to the mapped team and category",
    "Auto-close with evidence: the report that shows the fix is referenced on the ticket — no chasing the user for confirmation",
    "Suggestions to close tickets when the device data shows the issue is fixed, and re-raise when a hand-closed issue comes back",
    "Faster support: Get IT support chat from the tray, screen sharing and guided remote control, with the device's health open beside the chat",
    "Measurable SLAs and trends: how many devices fail which rule, how fast items close, which teams carry the load"] },
  { title: "For employees", icon: Users, items: ["My device health in the tray and in IT Hub, with plain-language next steps", "One click to Get IT support or open My Policies", "Nothing personal is collected: no keystrokes, screenshots, window titles, files or content"] },
  { title: "For management and audit", icon: ShieldCheck, items: ["A fleet-wide, evidence-based view of security posture and policy compliance", "Every change, ignore, ticket and closure in the audit trail with who, when and why", "Licence compliance and piracy exposure visible before an external audit"] },
];
const AGENT: { title: string; items: string[] }[] = [
  { title: "What it reports (every 15 minutes, or within a minute on Refresh now)", items: ["Performance: CPU, memory, uptime", "Storage: drives, free space, disk health", "Battery: health, charge, cycles (from WMI or the Windows battery report)", "Security: antivirus, firewall, BitLocker, Secure Boot, TPM, UAC, SMB1", "OS & updates: edition, build, activation, last Windows update and history, restart pending, update service", "Ports & access: USB storage allowed / blocked, USB disks, removable drives, Bluetooth, Remote Desktop, local administrators, guest account, shared folders, autorun, screen lock", "Installed software (once a day)", "Its own status: version, scheduled tasks, tray, errors"] },
  { title: "Usage (only as allowed per employee by the administrator)", items: ["Active and idle minutes per day and the foreground application name — no keystrokes, screenshots, window titles, files or content", "Visible to Super Admin only"] },
  { title: "How it is protected", items: ["HTTPS only; one secret token per device, encrypted on the computer for the system account only", "Every request signed (HMAC-SHA256 with time and a one-time nonce): copied, changed or replayed requests are refused", "Token replaced every 30 days; a different serial number under the same token raises a Critical item", "Values checked and kept in range before they are stored", "Updates itself only when the download matches the published SHA-256", "Only a local administrator can uninstall it, and IT is alerted", "Online signal every minute; follows IT Hub to a new address automatically", "Everything it sends is size-checked and stored as data, never run"] },
  { title: "On the computer", items: ["NIYTRI tray icon: My device health, Open IT Hub, My Policies", "Runs as three scheduled tasks: health report (SYSTEM), online signal (SYSTEM), usage & tray (signed-in user)", "Windows 10 / 11 and Windows Server 2016+, PowerShell 5.1"] },
];

export default function About() {
  const { data, error, isLoading } = useQuery({ queryKey: ["about"], queryFn: () => apiFetch<any>("/about"), retry: false });
  if (error) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground"><Info className="w-7 h-7 mx-auto mb-2 opacity-40" />{(error as Error).message}</CardContent></Card>;
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHero img={`${import.meta.env.BASE_URL}niytri-agent.png`} title="About IT Hub" subtitle="Everything IT Hub and the NIYTRI device agent do — for Super Admin and IT Asset Admin." />
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <Card><CardContent className="p-4">
        <h2 className="text-sm font-semibold mb-3">Application modules and features</h2>
        <div className="grid md:grid-cols-2 gap-3">{MODULES.map(m => (
          <div key={m.name} className="rounded-lg border p-3"><div className="font-semibold text-sm flex items-center gap-1.5 mb-1.5"><m.icon className="w-4 h-4 text-primary" />{m.name}</div>
            <ul className="text-xs space-y-1 list-disc pl-5 text-muted-foreground">{m.features.map(f => <li key={f}><span className="text-foreground">{f}</span></li>)}</ul></div>))}</div>
      </CardContent></Card>
      <Card><CardContent className="p-4 space-y-4">
        <div><h2 className="text-sm font-semibold flex items-center gap-1.5"><Cpu className="w-4 h-4" />The NIYTRI agent — the engine behind IT Assets and ITSM</h2>
          <p className="text-xs text-muted-foreground mt-1">The agent is a small, signed-request PowerShell program on every Windows computer. It turns each device into a live source of truth: IT Assets learns what the device is and how it is doing, and ITSM learns what is wrong before anyone calls — then confirms when it is fixed.</p></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{FLOW.map(f => (
          <div key={f.step} className="rounded-lg border p-3 flex gap-2.5"><div className="w-6 h-6 shrink-0 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{f.step}</div>
            <div><div className="font-semibold text-xs">{f.title}</div><div className="text-xs text-muted-foreground mt-0.5">{f.text}</div></div></div>))}</div>
        <div className="rounded-lg border bg-muted/30 p-3 text-xs overflow-x-auto"><div className="font-semibold mb-1.5">Data flow</div>
          <div className="flex items-center gap-1.5 flex-wrap whitespace-nowrap">
            {["Computer (agent, SYSTEM)", "Signed HTTPS request", "IT Hub: checks size, type, signature, nonce", "Health thresholds · Device policy · Software rules · Licence seats", "Items on the device", "ITSM ticket (auto-raise / auto-close)", "Dashboards, audit trail"].map((x, i, arr) =>
              <React.Fragment key={x}><span className="rounded-md border bg-card px-2 py-1">{x}</span>{i < arr.length - 1 && <span className="text-muted-foreground">→</span>}</React.Fragment>)}
          </div></div>
        <div className="grid md:grid-cols-2 gap-3">{HELPS.map(g => (
          <div key={g.title} className="rounded-lg border p-3"><div className="font-semibold text-sm flex items-center gap-1.5 mb-1.5"><g.icon className="w-4 h-4 text-primary" />How it helps — {g.title.replace(/^For /, "")}</div>
            <ul className="text-xs space-y-1 list-disc pl-5">{g.items.map(f => <li key={f}>{f}</li>)}</ul></div>))}</div>
      </CardContent></Card>
      <Card><CardContent className="p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Cpu className="w-4 h-4" />NIYTRI device agent — details</h2>
        <div className="grid md:grid-cols-2 gap-3">{AGENT.map(g => (
          <div key={g.title} className="rounded-lg border p-3"><div className="font-semibold text-xs mb-1.5">{g.title}</div>
            <ul className="text-xs space-y-1 list-disc pl-5">{g.items.map(f => <li key={f}>{f}</li>)}</ul></div>))}</div>
      </CardContent></Card>
      {data?.agent?.history?.length > 0 && <Card><CardContent className="p-4">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-1.5"><History className="w-4 h-4" />Agent version history</h2>
        <p className="text-xs text-muted-foreground mb-3">Devices upgrade themselves: at each check-in IT Hub offers the latest version, and the agent replaces itself only when the download matches the published SHA-256. Older devices show below their version.</p>
        <div className="space-y-2">{data.agent.history.map((h: any) => (
          <div key={h.version} className={cn("rounded-lg border p-3", h.version === data.agent.latest && "border-primary/40 bg-primary/5")}>
            <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-sm">v{h.version}</span>
              {h.version === data.agent.latest && <span className="rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-semibold">Latest</span>}
              <span className="text-sm">{h.title}</span><span className="text-xs text-muted-foreground ml-auto">{fmtDate(h.date)} · {h.devices} device{h.devices === 1 ? "" : "s"} on it</span></div>
            <ul className="text-xs list-disc pl-5 mt-1.5 space-y-0.5">{h.items.map((i: string) => <li key={i}>{i}</li>)}</ul>
            {h.upgrade && <div className="text-[11px] text-muted-foreground mt-1.5">Upgrade: {h.upgrade}</div>}
          </div>))}</div>
        {data.agent.older?.length > 0 && <div className="text-xs text-muted-foreground mt-2">Older or not reported: {data.agent.older.map((v: any) => `${v.version === "?" ? "not reported yet" : v.version} (${v.devices})`).join(", ")}</div>}
      </CardContent></Card>}
      {data?.app && <div className="text-[11px] text-muted-foreground">Server running since {fmtDateTime(data.app.started)} · Node {data.app.node}{data.app.build ? ` · build ${data.app.build}` : ""} · © NIYTRI Technologies</div>}
    </div>
  );
}
