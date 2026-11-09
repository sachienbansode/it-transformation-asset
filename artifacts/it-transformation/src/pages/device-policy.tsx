import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Pagination } from "@/components/pagination";
import { PageHero } from "@/components/workspace-ui";
import { confirmHeader } from "@/components/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, HelpCircle, RefreshCw, Save, Search, Loader2 } from "lucide-react";

/* ITH-098 — IT Assets › Device Policy: the company end-user device policy (rules the agent's data is checked against)
   and which devices comply. Editing: Super Admin and IT Asset Admin. Every save bumps the version and re-checks all devices. */

const STATE: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  compliant: { label: "Compliant", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300", icon: ShieldCheck },
  non_compliant: { label: "Not compliant", cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300", icon: ShieldAlert },
  unknown: { label: "Not checked yet", cls: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300", icon: HelpCircle },
  not_applicable: { label: "Not applicable (server)", cls: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300", icon: HelpCircle },
};
export function ComplianceBadge({ state }: { state?: string | null }) {
  const s = STATE[state || "unknown"] || STATE.unknown; const I = s.icon;
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", s.cls)}><I className="w-3 h-3" />{s.label}</span>;
}

export default function DevicePolicy() {
  const [tab, setTab] = useState<"policy" | "devices">("devices");
  const { data: pol, error } = useQuery({ queryKey: ["device-policy"], queryFn: () => apiFetch<any>("/device-policy"), retry: false });
  if (error) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{(error as Error).message}</CardContent></Card>;
  const c = pol?.counts || {};
  return (
    <div className="space-y-4 max-w-7xl">
      <PageHero icon={ShieldCheck} tone="green" title="Device Policy" subtitle={<>The company end-user device policy. The NIYTRI agent's data from every computer is checked against it; failed rules show on the device and raise tickets.</>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[["Compliant", c.compliant || 0, "text-emerald-600"], ["Not compliant", c.non_compliant || 0, "text-red-600"], ["Not checked yet", c.unknown || 0, "text-slate-500"], ["Servers (not applicable)", c.not_applicable || 0, "text-slate-500"]].map(([l, v, cl]) =>
          <div key={l as string} className="rounded-xl border bg-card px-3.5 py-3"><div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{l}</div><div className={cn("text-2xl font-bold mt-1", cl as string)}>{v as any}</div></div>)}
      </div>
      <div className="flex gap-1 border-b">
        {([["devices", "Compliance"], ["policy", "Policy rules"]] as const).map(([k, l]) =>
          <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-2 text-sm border-b-2 -mb-px", tab === k ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</button>)}
      </div>
      {pol && (tab === "policy" ? <PolicyRules pol={pol} /> : <Devices pol={pol} />)}
    </div>
  );
}

function PolicyRules({ pol }: { pol: any }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [draft, setDraft] = useState<Record<string, any>>({}); const [applies, setApplies] = useState(pol.appliesTo); const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft({}); setApplies(pol.appliesTo); }, [pol.version]);
  const val = (r: any, k: string) => (draft[r.key]?.[k] !== undefined ? draft[r.key][k] : r[k]);
  const set = (key: string, k: string, v: any) => setDraft(d => ({ ...d, [key]: { ...d[key], [k]: v } }));
  const groups = useMemo(() => { const m: Record<string, any[]> = {}; for (const r of pol.rules) (m[r.group] ||= []).push(r); return m; }, [pol.rules]);
  const changes = pol.rules.flatMap((r: any) => {
    const out: string[] = []; const d = draft[r.key] || {};
    if (d.on !== undefined && d.on !== r.on) out.push(`${r.label}: ${r.on ? "on" : "off"} → ${d.on ? "on" : "off"}`);
    if (d.severity !== undefined && d.severity !== r.severity) out.push(`${r.label}: ${r.severity} → ${d.severity}`);
    if (d.value !== undefined && String(d.value) !== String(r.value ?? "")) out.push(`${r.label}: ${r.value} → ${d.value}`);
    return out;
  }).concat(applies !== pol.appliesTo ? [`Applies to: ${pol.appliesTo} → ${applies}`] : []);
  async function save() {
    setBusy(true);
    try {
      const r = await apiFetch<any>("/device-policy", { method: "PUT", body: JSON.stringify({ rules: draft, appliesTo: applies }),
        headers: confirmHeader(`Change “${pol.name}” (v${pol.version} → v${pol.version + 1})?\n\n${changes.join("\n")}\n\nEvery device is checked again against the new version.`) });
      toast({ title: `Policy saved as v${r.version}`, description: `${r.rechecked} device(s) checked again.` }); qc.invalidateQueries({ queryKey: ["device-policy"] }); qc.invalidateQueries({ queryKey: ["device-compliance"] });
    } catch (e: any) { if (!e?.cancelled) toast({ title: "Not saved", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div><div className="font-semibold">{pol.name} <span className="text-xs text-muted-foreground font-normal">v{pol.version}</span></div>
          <div className="text-xs text-muted-foreground">{pol.updatedBy ? `Last changed by ${pol.updatedBy} on ${fmtDateTime(pol.updatedAt)}` : "Default rules"}</div></div>
        <label className="text-xs ml-auto flex items-center gap-2">Applies to
          <select disabled={!pol.canEdit} value={applies} onChange={e => setApplies(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
            <option value="Workstation">Desktops and laptops</option><option value="All">All devices including servers</option></select></label>
        {pol.canEdit && <Button size="sm" disabled={!changes.length || busy} onClick={save}>{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}Save {changes.length ? `(${changes.length})` : ""}</Button>}
      </div>
      {!pol.canEdit && <div className="text-xs text-muted-foreground">Read only — Super Admin or IT Asset Admin can change the policy.</div>}
      {Object.entries(groups).map(([g, rules]) => (
        <div key={g}>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{g}</div>
          <div className="rounded-lg border divide-y">
            {rules.map((r: any) => (
              <div key={r.key} className={cn("flex items-center gap-3 px-3 py-2 flex-wrap", !val(r, "on") && "opacity-60")}>
                <Switch disabled={!pol.canEdit} checked={!!val(r, "on")} onCheckedChange={v => set(r.key, "on", v)} aria-label={r.label} />
                <div className="flex-1 min-w-[220px]"><div className="text-sm">{r.label}{r.covered && <span className="ml-2 text-[10px] text-muted-foreground">(also a health item)</span>}</div><div className="text-[11px] text-muted-foreground">{r.hint}</div></div>
                {r.key === "agent_current" ? <span className="text-xs text-muted-foreground">Latest: {r.value || "—"}</span>
                  : r.value !== undefined && r.value !== null && <div className="flex items-center gap-1">
                    <Input disabled={!pol.canEdit} className={cn("h-8 text-sm", typeof r.value === "number" ? "w-24" : "w-72")} type={typeof r.value === "number" ? "number" : "text"} value={val(r, "value") ?? ""} onChange={e => set(r.key, "value", typeof r.value === "number" ? e.target.value : e.target.value)} />
                    {r.unit && <span className="text-xs text-muted-foreground">{r.unit}</span>}</div>}
                <select disabled={!pol.canEdit} value={val(r, "severity")} onChange={e => set(r.key, "severity", e.target.value)} className={cn("h-8 rounded-md border bg-background px-2 text-xs", val(r, "severity") === "Critical" ? "text-red-600" : "text-amber-600")}>
                  <option>Critical</option><option>Warning</option></select>
              </div>))}
          </div>
        </div>))}
    </CardContent></Card>
  );
}

function Devices({ pol }: { pol: any }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [state, setState] = useState("non_compliant"); const [q, setQ] = useState(""); const [page, setPage] = useState(1); const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["device-compliance", state, q, page], queryFn: () => apiFetch<any>(`/device-policy/compliance?state=${state}&q=${encodeURIComponent(q)}&page=${page}`) });
  async function recheck() {
    setBusy(true);
    try { const r = await apiFetch<any>("/device-policy/recheck", { method: "POST", headers: confirmHeader(`Check every device again against “${pol.name}” v${pol.version} using its latest report?`) });
      toast({ title: `${r.rechecked} device(s) checked` }); qc.invalidateQueries({ queryKey: ["device-compliance"] }); qc.invalidateQueries({ queryKey: ["device-policy"] }); }
    catch (e: any) { if (!e?.cancelled) toast({ title: "Not done", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <div className="grid lg:grid-cols-[1fr_260px] gap-3">
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          {[["non_compliant", "Not compliant"], ["compliant", "Compliant"], ["unknown", "Not checked"], ["", "All"]].map(([k, l]) =>
            <Button key={k} size="sm" variant={state === k ? "default" : "outline"} onClick={() => { setState(k); setPage(1); }}>{l}</Button>)}
          <div className="relative ml-auto"><Search className="w-4 h-4 absolute left-2 top-2 text-muted-foreground" /><Input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Device, asset, employee, rule" className="h-8 pl-7 w-60 text-sm" /></div>
          {pol.canEdit && <Button size="sm" variant="outline" disabled={busy} onClick={recheck}><RefreshCw className={cn("w-4 h-4 mr-1", busy && "animate-spin")} />Check all again</Button>}
        </div>
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : !data?.rows?.length ? <div className="text-sm text-muted-foreground py-6 text-center">No devices here.</div> :
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2 pr-2">Device</th><th className="pr-2">Employee</th><th className="pr-2">Status</th><th className="pr-2">Rules not met</th><th>Checked</th></tr></thead>
            <tbody>{data.rows.map((d: any) => (
              <tr key={d.id} className="border-b align-top">
                <td className="py-2 pr-2"><span className="font-medium">{d.hostname}</span><div className="text-[11px] text-muted-foreground">{d.assetTag || "Not linked"} · agent {d.agentVersion || "—"}</div></td>
                <td className="pr-2">{d.employee || "—"}{d.employeeCode && <div className="text-[11px] text-muted-foreground">{d.employeeCode}</div>}</td>
                <td className="pr-2"><ComplianceBadge state={d.state} />{d.compliance?.total ? <div className="text-[11px] text-muted-foreground mt-0.5">{d.compliance.passed} of {d.compliance.total} met</div> : null}</td>
                <td className="pr-2 text-xs">{(d.compliance?.failed || []).map((f: any) => <div key={f.key}><span className={f.severity === "Critical" ? "text-red-600" : "text-amber-600"}>●</span> {f.label}{f.detail ? <span className="text-muted-foreground"> — {f.detail}</span> : null}</div>)}
                  {!!d.compliance?.unknown?.length && <div className="text-muted-foreground">{d.compliance.unknown.length} not reported yet</div>}</td>
                <td className="text-xs text-muted-foreground whitespace-nowrap">{d.compliance?.at ? fmtDateTime(d.compliance.at) : "—"}{d.compliance?.version ? <div>policy v{d.compliance.version}</div> : null}</td>
              </tr>))}</tbody></table></div>}
        <Pagination page={page} totalPages={Math.ceil((data?.total || 0) / 10)} totalItems={data?.total || 0} pageSize={10} onPageChange={setPage} />
      </CardContent></Card>
      <Card><CardContent className="p-4">
        <div className="text-sm font-semibold mb-2">Rules most often not met</div>
        {!data?.top?.length ? <div className="text-xs text-muted-foreground">None — every checked device meets the policy.</div> :
          <div className="space-y-1.5">{data.top.map((t: any) => <div key={t.label} className="flex items-center gap-2 text-xs"><span className="flex-1">{t.label}</span><span className="font-semibold">{t.n}</span></div>)}</div>}
        <div className="text-[11px] text-muted-foreground mt-4">Rules that are also health items (BitLocker, antivirus, firewall, updates, disk space) raise their usual health warning; the others raise a “Policy” item on the device and an automatic ticket. When the next report meets the rule, the item and ticket close with the report reference.</div>
      </CardContent></Card>
    </div>
  );
}
