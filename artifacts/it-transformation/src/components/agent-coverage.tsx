import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import * as XLSX from "xlsx";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Cpu, Download, ArrowRight, KeyRound } from "lucide-react";

/* ITH-104 — Asset Dashboard › NIYTRI agent coverage: which assets should run the agent (desktops, laptops, servers),
   how many do, which are pending or not reporting, and agents not linked to an asset. Every number opens its list. */

type List = "applicable" | "installed" | "stale" | "pending" | "na" | "unlinked";
const TITLE: Record<List, string> = { applicable: "Assets that should run the agent", installed: "Agent installed and reporting", stale: "Agent installed, not reporting", pending: "Agent not installed yet", na: "Agent not applicable", unlinked: "Agents not linked to an asset" };

export function AgentCoverage() {
  const { data, error } = useQuery({ queryKey: ["agent-coverage"], queryFn: () => apiFetch<any>("/asset-agents/coverage"), retry: false });
  const [open, setOpen] = useState<{ list: List; type?: string } | null>(null);
  if (error || !data) return null;
  const t = data.totals;
  const tiles: [List, string, number, string, string][] = [
    ["applicable", "Should run the agent", t.applicable, "desktops, laptops, servers", "text-foreground"],
    ["installed", "Installed & reporting", t.installed, data.coveragePct === null ? "" : `${data.coveragePct}% covered`, "text-emerald-600"],
    ["stale", "Not reporting", t.stale, `no report for ${t.staleDays}+ days`, "text-amber-600"],
    ["pending", "Pending install", t.pending, "no agent on the asset", "text-red-600"],
    ["unlinked", "Agents not linked", t.unlinked, "running, no asset in the register", "text-blue-600"],
    ["na", "Not applicable", t.notApplicable, "monitors, phones, printers …", "text-muted-foreground"],
  ];
  const Num = ({ list, type, v, cls }: { list: List; type?: string; v: number; cls?: string }) =>
    v ? <button onClick={() => setOpen({ list, type })} className={cn("font-semibold hover:underline", cls)}>{v}</button> : <span className="text-muted-foreground">0</span>;
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-1.5"><Cpu className="w-4 h-4 text-primary" />NIYTRI agent coverage</h2>
        <span className="text-xs text-muted-foreground">assets in service · click a number to see the devices</span>
        <Link href="/asset-agents" className="ml-auto text-xs text-primary hover:underline flex items-center gap-1">Device Health <ArrowRight className="w-3 h-3" /></Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        {tiles.map(([list, label, v, sub, cls]) => (
          <button key={list} onClick={() => v && setOpen({ list })} disabled={!v} className={cn("rounded-xl border bg-card px-3 py-2.5 text-left transition", v && "hover:border-primary/50 hover:shadow-sm")}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
            <div className={cn("text-2xl font-bold mt-0.5", cls)}>{v}</div>
            <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
          </button>))}
      </div>
      {t.applicable > 0 && <div className="h-2 rounded-full bg-muted overflow-hidden flex" title="Installed · not reporting · pending">
        <div className="bg-emerald-500" style={{ width: `${(t.installed / t.applicable) * 100}%` }} /><div className="bg-amber-400" style={{ width: `${(t.stale / t.applicable) * 100}%` }} /><div className="bg-red-400" style={{ width: `${(t.pending / t.applicable) * 100}%` }} /></div>}
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b"><th className="py-2 pr-2">Asset type</th><th className="pr-2">Agent</th><th className="pr-2 text-right">In service</th><th className="pr-2 text-right">Installed</th><th className="pr-2 text-right">Not reporting</th><th className="pr-2 text-right">Pending</th><th className="text-right">Coverage</th></tr></thead>
        <tbody>{data.types.map((r: any) => (
          <tr key={r.type} className={cn("border-b", !r.applicable && "text-muted-foreground")}>
            <td className="py-1.5 pr-2">{r.type}</td><td className="pr-2 text-xs">{r.applicable ? "Applicable" : "Not applicable"}</td>
            <td className="pr-2 text-right"><Num list={r.applicable ? "applicable" : "na"} type={r.type} v={r.total} /></td>
            {r.applicable ? <>
              <td className="pr-2 text-right"><Num list="installed" type={r.type} v={r.installed} cls="text-emerald-600" /></td>
              <td className="pr-2 text-right"><Num list="stale" type={r.type} v={r.stale} cls="text-amber-600" /></td>
              <td className="pr-2 text-right"><Num list="pending" type={r.type} v={r.pending} cls="text-red-600" /></td>
              <td className="text-right">{Math.round(((r.installed + r.stale) / r.total) * 100)}%</td></> : <td colSpan={4} className="text-right text-xs">—</td>}
          </tr>))}</tbody></table></div>
      <CoverageList sel={open} onClose={() => setOpen(null)} />
    </CardContent></Card>
  );
}

function CoverageList({ sel, onClose }: { sel: { list: List; type?: string } | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["agent-coverage-list", sel?.list, sel?.type], enabled: !!sel, queryFn: () => apiFetch<any>(`/asset-agents/coverage?list=${sel!.list}&type=${encodeURIComponent(sel!.type || "")}`) });
  const rows: any[] = data?.rows || []; const unl = sel?.list === "unlinked";
  const state = (r: any) => r.coverage === "installed" ? "Reporting" : r.coverage === "stale" ? "Not reporting" : r.coverage === "pending" ? "Not installed" : r.coverage === "na" ? "Not applicable" : "";
  function excel() {
    const out = rows.map(r => unl ? { Device: r.hostname, Type: r.type, Serial: r.serialNumber, Employee: r.owner || "", "Employee code": r.employeeCode || "", "Agent version": r.agentVersion || "", "Last report": r.lastSeenAt ? fmtDateTime(r.lastSeenAt) : "", Health: r.healthState || "" }
      : { "Asset tag": r.assetTag, Name: r.name, Type: r.type, Status: r.status, Employee: r.owner || "", "Employee code": r.employeeCode || "", Department: r.department || "", Location: r.location || "", Agent: state(r), Device: r.hostname || "", "Agent version": r.agentVersion || "", "Last report": r.lastSeenAt ? fmtDateTime(r.lastSeenAt) : "" });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), "Devices");
    XLSX.writeFile(wb, `Agent_${sel!.list}${sel!.type ? "_" + sel!.type : ""}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  return (
    <Dialog open={!!sel} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>{sel ? TITLE[sel.list] : ""}{sel?.type ? ` — ${sel.type}` : ""}</DialogTitle>
          <DialogDescription>{isLoading ? "Loading…" : `${rows.length} ${rows.length === 1 ? "record" : "records"}`}{sel?.list === "pending" && " · create an installation key for each in Device Health › Installation keys"}</DialogDescription></DialogHeader>
        <div className="flex gap-2 justify-end">
          {sel?.list === "pending" && <Link href="/asset-agents/keys"><Button size="sm" variant="outline" className="gap-1"><KeyRound className="w-4 h-4" />Installation keys</Button></Link>}
          {unl && <Link href="/asset-agents"><Button size="sm" variant="outline">Link them in Device Health</Button></Link>}
          <Button size="sm" variant="outline" className="gap-1" disabled={!rows.length} onClick={excel}><Download className="w-4 h-4" />Excel</Button>
        </div>
        <div className="max-h-[60vh] overflow-auto"><table className="w-full text-sm">
          <thead className="sticky top-0 bg-background"><tr className="text-left text-xs text-muted-foreground border-b">
            {unl ? <><th className="py-1.5 pr-2">Device</th><th className="pr-2">Type</th><th className="pr-2">Serial</th><th className="pr-2">Employee</th><th className="pr-2">Agent</th><th>Last report</th></>
              : <><th className="py-1.5 pr-2">Asset</th><th className="pr-2">Type</th><th className="pr-2">Employee</th><th className="pr-2">Department / location</th><th className="pr-2">Agent</th><th>Last report</th></>}</tr></thead>
          <tbody>{rows.map((r: any) => unl ? (
            <tr key={r.agentId} className="border-b"><td className="py-1.5 pr-2 font-medium">{r.hostname}</td><td className="pr-2">{r.type}</td><td className="pr-2 text-xs">{r.serialNumber || "—"}</td><td className="pr-2">{r.owner || "—"}</td><td className="pr-2 text-xs">{r.agentVersion || "—"}</td><td className="text-xs">{r.lastSeenAt ? fmtDateTime(r.lastSeenAt) : "never"}</td></tr>
          ) : (
            <tr key={r.id} className="border-b">
              <td className="py-1.5 pr-2"><Link href={`/asset-registry?q=${encodeURIComponent(r.assetTag)}`} className="font-medium text-primary hover:underline">{r.assetTag}</Link><div className="text-[11px] text-muted-foreground">{r.name} · {r.status}</div></td>
              <td className="pr-2">{r.type}</td><td className="pr-2">{r.owner || "—"}{r.employeeCode && <div className="text-[11px] text-muted-foreground">{r.employeeCode}</div>}</td>
              <td className="pr-2 text-xs">{r.department || "—"}<div className="text-muted-foreground">{r.location || ""}</div></td>
              <td className="pr-2 text-xs"><span className={r.coverage === "installed" ? "text-emerald-600" : r.coverage === "stale" ? "text-amber-600" : r.coverage === "pending" ? "text-red-600" : ""}>{state(r)}</span>{r.hostname && <div className="text-muted-foreground">{r.hostname} · {r.agentVersion || "—"}</div>}</td>
              <td className="text-xs">{r.lastSeenAt ? fmtDateTime(r.lastSeenAt) : "—"}</td>
            </tr>))}</tbody></table></div>
      </DialogContent>
    </Dialog>
  );
}
