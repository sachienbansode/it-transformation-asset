import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/*
 * ITH-098 — end-user device policy. Each rule checks what the NIYTRI agent reports; a device is Compliant when every
 * switched-on rule passes. Rules that are not already health items raise "policy:<rule>" health items, so they get
 * tickets, auto close and the device report reference like any other item.
 * ITH-075 — software and licence compliance: applications matched to the software catalogue (Licensed / Free /
 * Not allowed / Review), licences checked against assignments, and Windows activation.
 */
const rowsOf = (r: any) => (r.rows ?? r) as any[];
type Sev = "Warning" | "Critical";
type Res = { ok: boolean | null; detail: string };   // ok null = not reported by this computer
export type PolicyRule = { key: string; label: string; group: string; severity: Sev; on: boolean; value?: number | string; unit?: string; covered?: boolean; hint: string; check: (h: any, v: any) => Res };

const has = (v: any) => v !== undefined && v !== null;
export const POLICY_RULES: PolicyRule[] = [
  { key: "bitlocker", label: "System drive encrypted (BitLocker)", group: "Security", severity: "Critical", on: true, covered: true, hint: "IT turns on BitLocker; keep the computer on the office network or VPN.",
    check: h => { const b = h?.security?.bitlocker; if (!Array.isArray(b) || !b.length) return { ok: null, detail: "not reported" }; const s = b.find((x: any) => /^c/i.test(x.drive || "")) || b[0]; return { ok: /on|encrypt/i.test(String(s.status)) && !/decrypt/i.test(String(s.status)), detail: `BitLocker ${s.drive} ${s.status}` }; } },
  { key: "antivirus", label: "Antivirus on and up to date", group: "Security", severity: "Critical", on: true, covered: true, hint: "Keep Windows Security on and connected to the internet.",
    check: h => { const av = h?.security?.av; if (!Array.isArray(av)) return { ok: null, detail: "not reported" }; const ok = av.some((a: any) => a.enabled && a.upToDate !== false); return { ok, detail: av.map((a: any) => `${a.name} ${a.enabled ? "on" : "off"}${a.upToDate === false ? " (old definitions)" : ""}`).join(", ") || "no antivirus" }; } },
  { key: "firewall", label: "Firewall on for all networks", group: "Security", severity: "Critical", on: true, covered: true, hint: "Do not switch off Windows Firewall.",
    check: h => { const f = h?.security?.firewall; if (!f) return { ok: null, detail: "not reported" }; const ok = [f.domain, f.private, f.public].every(Boolean); return { ok, detail: ok ? "on for domain, private, public" : `off for ${[["domain", f.domain], ["private", f.private], ["public", f.public]].filter(([, x]) => !x).map(([k]) => k).join(", ")}` }; } },
  { key: "patches", label: "Windows updates installed within", group: "Updates", severity: "Warning", on: true, value: 30, unit: "days", covered: true, hint: "Settings › Windows Update › Check for updates, then restart.",
    check: (h, v) => { const li = h?.patches?.lastInstalled; if (!li) return { ok: null, detail: "not reported" }; const d = Math.floor((Date.now() - new Date(li).getTime()) / 86400e3); return { ok: d <= Number(v), detail: `last update ${d} days ago` }; } },
  { key: "restart", label: "Restart pending no longer than", group: "Updates", severity: "Warning", on: true, value: 7, unit: "days", hint: "Save your work and restart the computer.",
    check: (h, v) => { if (!has(h?.patches?.pendingReboot)) return { ok: null, detail: "not reported" }; if (!h.patches.pendingReboot) return { ok: true, detail: "no restart pending" }; const up = Number(h.uptimeHours) / 24; return { ok: up <= Number(v), detail: `restart pending, up ${Math.floor(up)} days` }; } },
  { key: "activated", label: "Windows genuine and activated", group: "Licensing", severity: "Critical", on: true, hint: "IT will activate Windows with the company licence.",
    check: h => { const a = h?.os?.activation; if (!a) return { ok: null, detail: "not reported" }; return { ok: a.status === "Licensed", detail: `Windows ${a.status}${a.channel ? ` (${a.channel})` : ""}` }; } },
  { key: "min_build", label: "Windows build at least", group: "Updates", severity: "Warning", on: true, value: 19045, hint: "IT will upgrade Windows.",
    check: (h, v) => { const b = Number(h?.os?.build); if (!b) return { ok: null, detail: "not reported" }; return { ok: b >= Number(v), detail: `build ${b}` }; } },
  { key: "usb_blocked", label: "USB storage blocked", group: "Ports & access", severity: "Warning", on: false, hint: "USB drives are not allowed on company computers — IT will block them.",
    check: h => { const u = h?.access?.usbStorage; if (!u) return { ok: null, detail: "not reported" }; return { ok: u === "Blocked", detail: `USB storage ${u.toLowerCase()}` }; } },
  { key: "rdp_off", label: "Remote Desktop switched off", group: "Ports & access", severity: "Warning", on: true, hint: "IT will switch off Remote Desktop.",
    check: h => { const r = h?.access?.rdpEnabled; if (!has(r)) return { ok: null, detail: "not reported" }; return { ok: !r, detail: r ? "Remote Desktop allowed" : "Remote Desktop off" }; } },
  { key: "guest_off", label: "Guest account disabled", group: "Ports & access", severity: "Warning", on: true, hint: "IT will disable the guest account.",
    check: h => { const g = h?.access?.guestEnabled; if (!has(g)) return { ok: null, detail: "not reported" }; return { ok: !g, detail: g ? "guest account enabled" : "guest account disabled" }; } },
  { key: "admins", label: "Only approved local administrators", group: "Ports & access", severity: "Warning", on: true, value: "Administrator, Domain Admins, ITAdmin", hint: "IT will remove extra administrator rights.",
    check: (h, v) => { const a = h?.access?.localAdmins; if (!Array.isArray(a) || !a.length) return { ok: null, detail: "not reported" };
      const ok = String(v || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean); const extra = a.filter((n: string) => { const s = String(n).toLowerCase(); const short = s.split("\\").pop() || s; return !ok.some(o => s === o || short === o || s.endsWith("\\" + o)); });
      return { ok: !extra.length, detail: extra.length ? `not approved: ${extra.slice(0, 5).join(", ")}${extra.length > 5 ? ` +${extra.length - 5}` : ""}` : "only approved administrators" }; } },
  { key: "secure_boot", label: "Secure Boot on", group: "Security", severity: "Warning", on: true, hint: "IT will turn on Secure Boot.",
    check: h => { const s = h?.access?.secureBoot; if (!has(s)) return { ok: null, detail: "not reported" }; return { ok: !!s, detail: s ? "Secure Boot on" : "Secure Boot off" }; } },
  { key: "tpm", label: "TPM security chip ready", group: "Security", severity: "Warning", on: true, hint: "IT will enable the TPM.",
    check: h => { const t = h?.access?.tpm; if (!t) return { ok: null, detail: "not reported" }; return { ok: !!t.ready, detail: t.present ? (t.ready ? "TPM ready" : "TPM not ready") : "no TPM" }; } },
  { key: "uac", label: "User Account Control on", group: "Security", severity: "Warning", on: true, hint: "IT will turn on User Account Control.",
    check: h => { const u = h?.access?.uac; if (!has(u)) return { ok: null, detail: "not reported" }; return { ok: !!u, detail: u ? "UAC on" : "UAC off" }; } },
  { key: "smb1_off", label: "SMB1 (old file sharing) off", group: "Security", severity: "Warning", on: true, hint: "IT will switch off SMB1.",
    check: h => { const s = h?.access?.smb1; if (!has(s)) return { ok: null, detail: "not reported" }; return { ok: !s, detail: s ? "SMB1 on" : "SMB1 off" }; } },
  { key: "screen_lock", label: "Screen locks after at most", group: "Ports & access", severity: "Warning", on: true, value: 15, unit: "minutes", hint: "IT will set the screen to lock when you are away.",
    check: (h, v) => { const s = h?.access?.screenLockSecs; if (h?.access === undefined) return { ok: null, detail: "not reported" }; if (!s) return { ok: false, detail: "no screen-lock policy" }; return { ok: s <= Number(v) * 60, detail: `locks after ${Math.round(s / 60)} min` }; } },
  { key: "autorun_off", label: "Autorun for USB / CD off", group: "Ports & access", severity: "Warning", on: true, hint: "IT will switch off autorun.",
    check: h => { const a = h?.access?.autorunOff; if (!has(a)) return { ok: null, detail: "not reported" }; return { ok: !!a, detail: a ? "autorun off" : "autorun on" }; } },
  { key: "no_shares", label: "No shared folders", group: "Ports & access", severity: "Warning", on: false, hint: "Do not share folders from your computer; use OneDrive / SharePoint.",
    check: h => { const s = h?.access?.shares; if (!Array.isArray(s)) return { ok: null, detail: "not reported" }; return { ok: !s.length, detail: s.length ? `shared: ${s.join(", ")}` : "no shared folders" }; } },
  { key: "disk_free", label: "Free disk space at least", group: "Storage", severity: "Warning", on: true, value: 10, unit: "%", covered: true, hint: "Empty the Recycle Bin and Downloads folder.",
    check: (h, v) => { const d = (h?.disks || []).filter((x: any) => Number(x.sizeGb) >= 1); if (!d.length) return { ok: null, detail: "not reported" }; const m = Math.min(...d.map((x: any) => Number(x.freePct))); return { ok: m >= Number(v), detail: `lowest free ${Math.round(m)}%` }; } },
  { key: "agent_current", label: "NIYTRI agent up to date", group: "Agent", severity: "Warning", on: true, hint: "The agent updates itself; leave the computer on and connected.",
    check: (h, v) => { const cur = String(h?.agent?.version || h?.__agentVersion || ""); const want = String(v || ""); if (!cur || !want) return { ok: null, detail: "not reported" }; const a = cur.split(".").map(Number), b = want.split(".").map(Number); let lt = false; for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) { lt = (a[i] || 0) < (b[i] || 0); break; } } return { ok: !lt, detail: `agent ${cur}${lt ? ` (latest ${want})` : ""}` }; } },
];

export async function activePolicy() {
  const [p] = rowsOf(await db.execute(sql`SELECT * FROM device_policies WHERE is_active ORDER BY id LIMIT 1`));
  if (!p) return null;
  const saved = typeof p.rules === "string" ? JSON.parse(p.rules) : (p.rules || {});
  const { agentRelease } = await import("../routes/asset-agent");
  const rules = POLICY_RULES.map(r => { const s = saved[r.key] || {}; return { ...r, on: s.on ?? r.on, severity: (s.severity || r.severity) as Sev, value: r.key === "agent_current" ? (agentRelease()?.version || null) : (s.value ?? r.value) }; });
  return { id: p.id, name: p.name, description: p.description, appliesTo: p.applies_to, version: p.version, updatedBy: p.updated_by, updatedAt: p.updated_at, rules };
}

/** Evaluate a device report against the policy. */
export async function evaluatePolicy(h: any, platform: string, agentVersion?: string | null) {
  const p = await activePolicy(); if (!p) return null;
  if (p.appliesTo !== "All" && platform && platform !== "Workstation") return { policyId: p.id, version: p.version, state: "not_applicable", failed: [], passed: 0, unknown: 0, at: new Date().toISOString() };
  const hh = { ...h, __agentVersion: agentVersion };
  const failed: any[] = []; const unknown: any[] = []; let passed = 0;
  for (const r of p.rules.filter(r => r.on)) {
    let res: Res; try { res = r.check(hh, r.value); } catch { res = { ok: null, detail: "could not be checked" }; }
    if (res.ok === true) passed++; else if (res.ok === null) unknown.push({ key: r.key, label: r.label, detail: res.detail });
    else failed.push({ key: r.key, label: r.label + (r.unit ? ` ${r.value} ${r.unit}` : r.key === "min_build" ? ` ${r.value}` : ""), detail: res.detail, severity: r.severity, hint: r.hint, covered: !!r.covered });
  }
  return { policyId: p.id, version: p.version, name: p.name, state: failed.length ? "non_compliant" : passed ? "compliant" : "unknown", failed, unknown, passed, total: p.rules.filter(r => r.on).length, at: new Date().toISOString() };
}

/** Health items for failed rules that are not already health items of their own. */
export function policyAlerts(c: any) {
  if (!c || !Array.isArray(c.failed)) return [];
  return c.failed.filter((f: any) => !f.covered).map((f: any) => ({ kind: `policy:${f.key}`, severity: f.severity as Sev, message: `Device policy: ${f.label} — ${f.detail}` }));
}

/* ── ITH-075 software ── */
export async function catalog() {
  return rowsOf(await db.execute(sql`SELECT c.id, c.match, c.publisher, c.status, c.license_id AS "licenseId", l.product_name AS "licenseName", c.notes FROM software_catalog c LEFT JOIN asset_licenses l ON l.id = c.license_id WHERE c.is_active ORDER BY length(c.match) DESC`));
}
export function classify(name: string, publisher: string | null, cat: any[]) {
  const n = String(name || "").toLowerCase(), p = String(publisher || "").toLowerCase();
  const hits = cat.filter(c => { const pat = String(c.match).toLowerCase().split("*").map(x => x.trim()).filter(Boolean); return pat.length && pat.every(x => n.includes(x)) && (!c.publisher || p.includes(String(c.publisher).toLowerCase())); });
  return hits.find(c => c.status === "Not allowed") || hits[0] || null;   // never-allowed first, then the most specific
}
/** Software health items for one device: not-allowed software, licensed software without an assigned licence. */
export async function softwareAlerts(agentId: number) {
  const [ag] = rowsOf(await db.execute(sql`SELECT g.id, g.asset_id, coalesce(CASE WHEN s.status = 'Allocated' THEN s.owner_id END, g.user_id) AS uid FROM asset_agents g LEFT JOIN assets s ON s.id = g.asset_id WHERE g.id = ${agentId}`));
  if (!ag) return [];
  const cat = await catalog(); const sw = rowsOf(await db.execute(sql`SELECT name, version, publisher FROM asset_software WHERE agent_id = ${agentId}`));
  const out: { kind: string; severity: Sev; message: string }[] = []; const seen = new Set<string>();
  const assigned = new Set(rowsOf(await db.execute(sql`SELECT license_id FROM asset_license_assignments WHERE status = 'Active' AND ((${ag.uid}::int IS NOT NULL AND user_id = ${ag.uid}) OR (${ag.asset_id}::int IS NOT NULL AND asset_id = ${ag.asset_id}))`)).map(r => Number(r.license_id)));
  for (const x of sw) {
    const c = classify(x.name, x.publisher, cat); if (!c) continue;
    if (c.status === "Not allowed" && !seen.has(`s${c.id}`)) { seen.add(`s${c.id}`); out.push({ kind: `software:${c.id}`, severity: "Critical", message: `Not allowed software installed: ${x.name}${x.version ? ` ${x.version}` : ""}${c.notes ? ` (${c.notes})` : ""}` }); }
    if (c.status === "Licensed" && c.licenseId && !assigned.has(Number(c.licenseId)) && !seen.has(`l${c.id}`)) { seen.add(`l${c.id}`); out.push({ kind: `licence:${c.id}`, severity: "Warning", message: `${x.name} installed without an assigned ${c.licenseName || "licence"}` }); }
  }
  return out;
}
