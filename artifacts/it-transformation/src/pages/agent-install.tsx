import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { EnrolDialog } from "@/pages/asset-agents";
import { Download, KeyRound, Copy, MonitorDown, Building2, Trash2, LifeBuoy, ShieldCheck, CheckCircle2, ArrowLeft } from "lucide-react";

/* 2.12 — IT Assets › Agent Download: download the NIYTRI agent (IT Hub Agent), how to install it on one computer or many,
   how to check it and how to uninstall it. For Asset Managers and system administrators. */

function Cmd({ c }: { c: string }) {
  const { toast } = useToast();
  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 font-mono text-[12px] break-all">
      <span className="flex-1">{c}</span>
      <button className="text-muted-foreground hover:text-foreground shrink-0" title="Copy" onClick={() => { navigator.clipboard?.writeText(c).then(() => toast({ title: "Copied" })).catch(() => {}); }}><Copy className="w-3.5 h-3.5" /></button>
    </div>
  );
}
function Section({ id, icon: Icon, title, children }: { id: string; icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-xl border bg-card p-4 sm:p-5 space-y-3 scroll-mt-20" data-testid={`agent-sec-${id}`}>
      <h2 className="text-base font-semibold flex items-center gap-2"><Icon className="w-4 h-4 text-[#2D7FF9]" />{title}</h2>
      {children}
    </section>
  );
}
const Steps = ({ items }: { items: React.ReactNode[] }) => <ol className="space-y-2 text-sm">{items.map((x, i) => <li key={i} className="flex gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2D7FF9]/10 text-[11px] font-bold text-[#2D7FF9]">{i + 1}</span><div className="flex-1 space-y-1.5">{x}</div></li>)}</ol>;

export default function AgentInstall() {
  const [enrol, setEnrol] = useState(false);
  const { canAccess } = useAuth(); const canEdit = canAccess("asset_registry", "write");
  const { data: rel } = useQuery({ queryKey: ["agent-release"], queryFn: () => apiFetch<any>("/asset-agents/release") });
  const url = window.location.origin;
  return (
    <div className="space-y-5 max-w-4xl" data-testid="agent-install-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/asset-agents" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Device Health</Link>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><img src={`${import.meta.env.BASE_URL}niytri-agent.png`} alt="" className="w-7 h-7 rounded-md" />Agent Download</h1>
          <p className="text-sm text-muted-foreground">Download the NIYTRI agent (shown on computers as “IT Hub Agent”), install it on one computer or many, check it and uninstall it.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit ? <>
            <Button className="gap-1.5 bg-[#2D7FF9] hover:bg-[#1B63D6] text-white" onClick={() => setEnrol(true)} data-testid="agent-download"><Download className="w-4 h-4" />Download installer</Button>
            <Link href="/asset-agents/keys"><Button variant="outline" className="gap-1.5"><KeyRound className="w-4 h-4" />Installation keys</Button></Link>
          </> : <div className="text-xs text-muted-foreground max-w-[260px]">Downloading needs edit access to the Asset Registry (Asset Manager or administrator).</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">Current agent version</div><div className="font-semibold">{rel?.version || "—"}</div><div className="text-[11px] text-muted-foreground">{rel?.devices != null ? `${rel.upToDate} of ${rel.devices} devices on it` : ""}</div></div>
        <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">Supported</div><div className="font-semibold">Windows 10 / 11, Server 2016+</div><div className="text-[11px] text-muted-foreground">Administrator rights to install</div></div>
        <div className="rounded-lg border p-3"><div className="text-[11px] text-muted-foreground">Connects to</div><div className="font-semibold break-all">{url}</div><div className="text-[11px] text-muted-foreground">Outbound HTTPS (443) only</div></div>
      </div>

      <nav className="flex flex-wrap gap-1.5 text-xs">{[["download", "1. Download"], ["one", "2. Install — one computer"], ["many", "3. Install — many computers"], ["check", "4. Check it works"], ["uninstall", "5. Uninstall"], ["help", "Troubleshooting"]].map(([h, l]) => <a key={h} href={`#${h}`} className="rounded-full border px-2.5 py-1 hover:bg-muted">{l}</a>)}</nav>

      <Section id="download" icon={MonitorDown} title="1. Download the installer">
        <p className="text-sm text-muted-foreground">Every installer carries an installation key. IT Hub refuses a used, expired or disabled key.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border p-3 space-y-1"><div className="font-semibold">Personal key</div><div className="text-muted-foreground text-xs">For one employee and one computer. If issued for an asset, it installs only on the computer with that serial number. Valid 1–30 days. Can be emailed to the employee.</div></div>
          <div className="rounded-lg border p-3 space-y-1"><div className="font-semibold">Bulk key (administrators)</div><div className="text-muted-foreground text-xs">For Intune, SCCM, an RMM tool or a Group Policy start-up script — many computers, up to the number of devices you set; expires.</div></div>
        </div>
        <Steps items={[
          <>Click <b>Download installer</b> above (or IT Assets › Device Health › Install agent).</>,
          <>Choose <b>Personal</b> (pick the employee, optionally the asset) or <b>Bulk</b>, set how many days it is valid, and create the key.</>,
          <>Download the zip (or email it to the employee). The zip holds <span className="font-mono text-xs">Install IT Hub Agent.cmd</span>, <span className="font-mono text-xs">install.cmd</span>, the scripts and <span className="font-mono text-xs">installation-key.txt</span>.</>,
        ]} />
      </Section>

      <Section id="one" icon={MonitorDown} title="2. Install on one computer">
        <Steps items={[
          <>Copy the zip to the computer and <b>unzip</b> it (right-click › Extract All). Do not run it from inside the zip.</>,
          <>Double-click <b>Install IT Hub Agent.cmd</b> and allow the administrator prompt. The employee notice is shown; the agent installs and checks in.</>,
          <>Or, from an <b>Administrator Command Prompt</b> in the unzipped folder (the key is in installation-key.txt):<Cmd c="install.cmd" /><span className="text-xs text-muted-foreground">or give the key directly:</span><Cmd c="install.cmd ABCD-EFGH-JKLM-NPQR" /></>,
          <>Within a minute the device appears in <Link href="/asset-agents" className="underline">Device Health</Link> and the key shows <b>Installed</b>.</>,
        ]} />
      </Section>

      <Section id="many" icon={Building2} title="3. Install on many computers (Intune / SCCM / Group Policy)">
        <div className="text-sm font-semibold">Microsoft Intune (Win32 app)</div>
        <Steps items={[
          <>Download the <b>bulk key</b> installer and unzip it into a folder.</>,
          <>Package the folder with the Microsoft Win32 Content Prep Tool:<Cmd c="IntuneWinAppUtil.exe -c <folder> -s install.cmd -o <output folder>" /></>,
          <>Intune › Apps › Windows › Add › Windows app (Win32), upload the .intunewin file and set:
            <div className="grid grid-cols-1 gap-1.5 text-xs">
              <div><b>Install command</b><Cmd c="install.cmd" /></div>
              <div><b>Uninstall command</b><Cmd c="powershell.exe -ExecutionPolicy Bypass -File Uninstall-ITHubAgent.ps1" /></div>
              <div><b>Install behaviour:</b> System · <b>Detection rule:</b> File exists <span className="font-mono">C:\ProgramData\ITHubAgent\ITHubAgent.ps1</span></div>
            </div></>,
          <>Assign it to the device group(s) as <b>Required</b>. Watch progress in Device Health and in the key's device count.</>,
        ]} />
        <div className="text-sm font-semibold pt-1">SCCM, RMM tool or Group Policy start-up script</div>
        <p className="text-sm">Put the unzipped bulk-key folder on a network share that computers can read, and run as SYSTEM:</p>
        <Cmd c={"\\\\server\\share\\ITHubAgent\\install.cmd"} />
        <p className="text-xs text-muted-foreground">The agent updates itself afterwards: IT Hub holds the current version and devices replace their copy after checking its SHA-256 fingerprint. No re-deployment is needed for updates.</p>
      </Section>

      <Section id="check" icon={CheckCircle2} title="4. Check it works">
        <ul className="text-sm space-y-1.5 list-disc ml-5">
          <li>IT Hub: the device shows in Device Health as <b>Online</b>, with the employee and asset linked.</li>
          <li>On the computer: Task Scheduler › “IT Hub Agent” and “IT Hub Agent Usage”; the NIYTRI icon sits in the system tray.</li>
          <li>Run a check-in now (Administrator Command Prompt):<Cmd c={'schtasks /run /tn "IT Hub Agent"'} /></li>
          <li>Log file: <span className="font-mono text-xs">C:\ProgramData\ITHubAgent\agent.log</span></li>
        </ul>
      </Section>

      <Section id="uninstall" icon={Trash2} title="5. Uninstall">
        <p className="text-sm text-muted-foreground">Removing the agent needs administrator rights on the computer — a standard user is asked for an administrator's password and cannot remove it. IT Hub is told who removed it and when.</p>
        <Steps items={[
          <><b>From Windows:</b> Settings › Apps › Installed apps › <b>IT Hub Agent</b> (publisher NIYTRI Technologies) › Uninstall.</>,
          <><b>Or from an Administrator Command Prompt / PowerShell:</b><Cmd c="powershell -ExecutionPolicy Bypass -File C:\ProgramData\ITHubAgent\Uninstall-ITHubAgent.ps1" /><span className="text-xs text-muted-foreground">with a reason recorded in IT Hub:</span><Cmd c={'powershell -ExecutionPolicy Bypass -File C:\\ProgramData\\ITHubAgent\\Uninstall-ITHubAgent.ps1 -Reason "Laptop returned"'} /></>,
          <><b>Many computers:</b> in Intune set the app assignment to <b>Uninstall</b> (it runs the uninstall command above); with SCCM / RMM run the same command as SYSTEM.</>,
          <>In IT Hub › <Link href="/asset-agents" className="underline">Device Health</Link>, open the device and remove (or retire) it so it no longer counts as offline. Disable any unused key in <Link href="/asset-agents/keys" className="underline">Installation keys</Link>.</>,
        ]} />
        <p className="text-xs text-muted-foreground">The uninstaller stops the agent, removes its scheduled tasks, the folder C:\ProgramData\ITHubAgent and the Apps entry.</p>
      </Section>

      <Section id="help" icon={LifeBuoy} title="Troubleshooting">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[["“Key refused”", "The key is used, expired or disabled, or a personal key issued for an asset is run on a computer with a different serial number. Create a new key."],
            ["Nothing appears in Device Health", `Check the computer can open ${url} in a browser (proxy / firewall must allow HTTPS to it), then run the check-in command and read agent.log.`],
            ["Installer closes at once", "Unzip first, then run as administrator. On a locked-down PC use the Administrator Command Prompt method."],
            ["Moved to a new user", "No re-install needed — change the employee / asset link on the device in Device Health."]].map(([t, d]) =>
            <div key={t} className="rounded-lg border p-3"><div className="font-semibold">{t}</div><div className="text-xs text-muted-foreground mt-0.5">{d}</div></div>)}
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/10 p-3 text-xs"><ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /><span><b>Privacy (DPDP):</b> the agent records device health and how long the device is actively used, including which applications are in use. It never collects keystrokes, screenshots, window titles, browsing history or file contents. Employees see a notice at installation.</span></div>
      </Section>

      {enrol && <EnrolDialog onClose={() => setEnrol(false)} />}
    </div>
  );
}
