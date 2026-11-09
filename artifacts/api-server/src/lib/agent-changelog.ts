/** ITH-100 — NIYTRI agent version history: what is new in each version and how devices are upgraded.
 *  Add a new entry at the top whenever $AgentVersion in agent/ITHubAgent.ps1 changes. */
export type AgentChange = { version: string; date: string; title: string; items: string[]; upgrade?: string };
export const AGENT_CHANGES: AgentChange[] = [
  { version: "1.2.0", date: "2026-11-09", title: "Signed requests and token rotation",
    items: ["Every call to IT Hub is signed (HMAC-SHA256 with the time and a one-time nonce); copied, changed or replayed requests are refused",
      "Device token replaced every 30 days and saved machine-protected (DPAPI)", "Uninstaller signs its notice to IT", "Data checked against the company device policy and software rules"],
    upgrade: "Automatic. After every device runs 1.2.0, IT can switch on “require signed requests”." },
  { version: "1.1.9", date: "2026-11-09", title: "Full device data",
    items: ["Battery health from the Windows battery report when WMI has none", "Windows activation, update history and update service",
      "Ports & access: USB storage, USB disks, removable drives, Bluetooth, Remote Desktop, local administrators, guest, shares, autorun, screen lock",
      "Secure Boot, TPM, UAC, SMB1", "Reports its own status: scheduled tasks, tray, errors"], upgrade: "Automatic" },
  { version: "1.1.8", date: "2026-11-09", title: "Correct last Windows update",
    items: ["Last update read from the Windows Update history, not only the hotfix list (newest wins)"], upgrade: "Automatic" },
  { version: "1.1.7", date: "2026-11-08", title: "Online status and Refresh now",
    items: ["1-minute online signal (pulse task, SYSTEM)", "Refresh now: fresh data within a minute", "Follows IT Hub to a new address automatically"], upgrade: "Automatic; adds the pulse task" },
  { version: "1.1.4", date: "2026-11-06", title: "Baseline",
    items: ["Health every 15 minutes: CPU, memory, disks, antivirus, firewall, BitLocker, updates", "Installed software once a day", "Active / idle usage (as allowed)",
      "NIYTRI tray icon; self-update checked by SHA-256; admin-only uninstall that tells IT"], upgrade: "Installed with install.cmd" },
];
