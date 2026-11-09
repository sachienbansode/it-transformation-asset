import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Pagination } from "@/components/pagination";
import { PageHero } from "@/components/workspace-ui";
import { confirmHeader, reasonDialog } from "@/components/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { PackageSearch, Search, Plus, Pencil, Loader2, AlertTriangle } from "lucide-react";

/* ITH-075 — IT Assets › Software & Licences: what is installed across the fleet (from the agent), the company's software
   rules (Licensed / Free / Not allowed / Review), pirated or not-allowed software, licensed software without a seat,
   and Windows not activated. Not-allowed software and missing seats raise items on the device and automatic tickets. */

const ST_CLS: Record<string, string> = {
  Licensed: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
  Free: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
  "Not allowed": "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300",
  Review: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
  Unreviewed: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300",
};
const Pill = ({ s }: { s: string }) => <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium", ST_CLS[s] || ST_CLS.Unreviewed)}>{s}</span>;
const STATUSES = ["Licensed", "Free", "Not allowed", "Review"];

export default function SoftwareCompliance() {
  const [tab, setTab] = useState<"apps" | "issues" | "rules">("apps");
  const [rulePrefill, setRulePrefill] = useState<any>(null);
  const { data: cat, error } = useQuery({ queryKey: ["software-catalog"], queryFn: () => apiFetch<any>("/software/catalog"), retry: false });
  if (error) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{(error as Error).message}</CardContent></Card>;
  return (
    <div className="space-y-4 max-w-7xl">
      <PageHero icon={PackageSearch} tone="purple" title="Software & Licences" subtitle="Installed software reported by the NIYTRI agent, checked against the company's software rules and licence seats." />
      <div className="flex gap-1 border-b">
        {([["apps", "Applications"], ["issues", "Issues"], ["rules", "Software rules"]] as const).map(([k, l]) =>
          <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-2 text-sm border-b-2 -mb-px", tab === k ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</button>)}
      </div>
      {tab === "apps" && <Apps canEdit={!!cat?.canEdit} onRule={(a: any) => { setRulePrefill(a); setTab("rules"); }} />}
      {tab === "issues" && <Issues />}
      {tab === "rules" && cat && <Rules cat={cat} prefill={rulePrefill} clearPrefill={() => setRulePrefill(null)} />}
    </div>
  );
}

function Apps({ canEdit, onRule }: { canEdit: boolean; onRule: (a: any) => void }) {
  const [q, setQ] = useState(""); const [st, setSt] = useState(""); const [page, setPage] = useState(1); const [who, setWho] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["software-apps", q, st, page], queryFn: () => apiFetch<any>(`/software/apps?q=${encodeURIComponent(q)}&status=${encodeURIComponent(st)}&page=${page}`) });
  const c = data?.counts || {};
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        {["", "Not allowed", "Unreviewed", "Review", "Licensed", "Free"].map(k =>
          <Button key={k || "all"} size="sm" variant={st === k ? "default" : "outline"} onClick={() => { setSt(k); setPage(1); }}>{k || "All"}{k && c[k] ? ` (${c[k]})` : ""}</Button>)}
        <div className="relative ml-auto"><Search className="w-4 h-4 absolute left-2 top-2 text-muted-foreground" /><Input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Application or publisher" className="h-8 pl-7 w-60 text-sm" /></div>
      </div>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : !data?.rows?.length ? <div className="text-sm text-muted-foreground py-6 text-center">No applications reported yet. The agent sends installed software once a day.</div> :
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2 pr-2">Application</th><th className="pr-2">Devices</th><th className="pr-2">Status</th><th className="pr-2">Licence seats</th><th /></tr></thead>
          <tbody>{data.rows.map((a: any) => (
            <tr key={a.name} className="border-b">
              <td className="py-2 pr-2"><div className="font-medium">{a.name}</div><div className="text-[11px] text-muted-foreground">{a.publisher || "—"}{a.versions ? ` · ${a.versions.length > 60 ? a.versions.slice(0, 57) + "…" : a.versions}` : ""}</div></td>
              <td className="pr-2"><button className="text-primary hover:underline" onClick={() => setWho(a.name)}>{a.devices}</button></td>
              <td className="pr-2"><Pill s={a.status} />{a.rule && <div className="text-[11px] text-muted-foreground">rule “{a.rule}”</div>}</td>
              <td className="pr-2 text-xs">{a.license ? <span className={a.license.over ? "text-red-600 font-semibold" : ""}>{a.license.name}: {a.devices} installed / {a.license.seats} seats{a.license.over && <> <AlertTriangle className="w-3 h-3 inline" /> over</>}</span> : "—"}</td>
              <td className="text-right">{canEdit && !a.ruleId && <Button size="sm" variant="ghost" onClick={() => onRule(a)}><Plus className="w-3.5 h-3.5 mr-1" />Rule</Button>}</td>
            </tr>))}</tbody></table></div>}
      <Pagination page={page} totalPages={Math.ceil((data?.total || 0) / 10)} totalItems={data?.total || 0} pageSize={10} onPageChange={setPage} />
      <WhoHasIt name={who} onClose={() => setWho(null)} />
    </CardContent></Card>
  );
}

function WhoHasIt({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { data = [], isLoading } = useQuery({ queryKey: ["software-who", name], enabled: !!name, queryFn: () => apiFetch<any[]>(`/software/apps/devices?name=${encodeURIComponent(name!)}`) });
  return (
    <Dialog open={!!name} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Who has it</DialogTitle><DialogDescription>{name}</DialogDescription></DialogHeader>
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
          <div className="max-h-[60vh] overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-1.5 pr-2">Device</th><th className="pr-2">Employee</th><th className="pr-2">Version</th><th>Installed</th></tr></thead>
            <tbody>{data.map((d: any) => <tr key={d.id + (d.version || "")} className="border-b"><td className="py-1.5 pr-2">{d.hostname}<div className="text-[11px] text-muted-foreground">{d.assetTag || "Not linked"}</div></td><td className="pr-2">{d.employee || "—"}</td><td className="pr-2">{d.version || "—"}</td><td>{d.installDate ? (/^\d{8}$/.test(d.installDate) ? `${d.installDate.slice(6)}-${d.installDate.slice(4, 6)}-${d.installDate.slice(0, 4)}` : d.installDate) : "—"}</td></tr>)}</tbody></table></div>}
      </DialogContent>
    </Dialog>
  );
}

function Issues() {
  const { data = [], isLoading } = useQuery({ queryKey: ["software-issues"], queryFn: () => apiFetch<any[]>("/software/issues") });
  const label = (k: string) => k.startsWith("software:") ? "Not-allowed software" : k.startsWith("licence:") ? "No licence seat" : k === "policy:activated" ? "Windows not activated" : k;
  return (
    <Card><CardContent className="p-4">
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : !data.length ? <div className="text-sm text-muted-foreground py-6 text-center">No open software or licence issues.</div> :
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2 pr-2">Issue</th><th className="pr-2">Device</th><th className="pr-2">Employee</th><th className="pr-2">Since</th><th>Ticket</th></tr></thead>
          <tbody>{data.map((x: any) => (
            <tr key={x.id} className={cn("border-b", x.ignored && "opacity-60")}>
              <td className="py-2 pr-2"><div className={cn("text-xs font-semibold", x.severity === "Critical" ? "text-red-600" : "text-amber-600")}>{label(x.kind)}{x.ignored ? " · ignored" : ""}</div><div>{x.message}</div></td>
              <td className="pr-2">{x.hostname}</td><td className="pr-2">{x.employee || "—"}</td>
              <td className="pr-2 text-xs whitespace-nowrap">{fmtDateTime(x.openedAt)}</td><td className="text-xs">{x.ticketNo || "—"}</td>
            </tr>))}</tbody></table></div>}
      <div className="text-[11px] text-muted-foreground mt-3">Each issue is raised from the agent's daily software list and closes on its own, with the report reference, when the software is removed, a seat is assigned, or Windows is activated.</div>
    </CardContent></Card>
  );
}

function Rules({ cat, prefill, clearPrefill }: { cat: any; prefill: any; clearPrefill: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [edit, setEdit] = useState<any>(prefill ? { match: prefill.name, publisher: prefill.publisher || "", status: "Review", licenseId: "", notes: "" } : null);
  const [busy, setBusy] = useState(false); const [showInactive, setShowInactive] = useState(false);
  const rows = (cat.rows || []).filter((r: any) => showInactive || r.isActive);
  const lic = (id: any) => cat.licenses.find((l: any) => String(l.id) === String(id))?.name;
  async function save() {
    setBusy(true);
    try {
      const body = { match: edit.match, publisher: edit.publisher, status: edit.status, licenseId: edit.licenseId || null, notes: edit.notes };
      const say = edit.id ? `Change the software rule “${edit.match}”: ${[edit._o.status !== edit.status && `status ${edit._o.status} → ${edit.status}`, String(edit._o.licenseId || "") !== String(edit.licenseId || "") && `licence ${lic(edit._o.licenseId) || "—"} → ${lic(edit.licenseId) || "—"}`, (edit._o.notes || "") !== (edit.notes || "") && `notes “${edit._o.notes || "—"}” → “${edit.notes || "—"}”`, (edit._o.publisher || "") !== (edit.publisher || "") && `publisher ${edit._o.publisher || "—"} → ${edit.publisher || "—"}`].filter(Boolean).join("; ") || "no change"}?\n\nEvery device's software is checked again.`
        : `Add the software rule: applications named like “${edit.match}” are ${edit.status}${edit.status === "Licensed" ? ` under ${lic(edit.licenseId) || "—"}` : ""}?\n\nEvery device's software is checked again.`;
      const r = await apiFetch<any>(edit.id ? `/software/catalog/${edit.id}` : "/software/catalog", { method: edit.id ? "PATCH" : "POST", body: JSON.stringify(body), headers: confirmHeader(say) });
      toast({ title: "Rule saved", description: r.rechecked !== undefined ? `${r.rechecked} device(s) checked again.` : undefined }); setEdit(null); clearPrefill();
      qc.invalidateQueries({ queryKey: ["software-catalog"] }); qc.invalidateQueries({ queryKey: ["software-apps"] }); qc.invalidateQueries({ queryKey: ["software-issues"] });
    } catch (e: any) { if (!e?.cancelled) toast({ title: "Not saved", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  async function toggle(r: any) {
    const reason = r.isActive ? await reasonDialog(`Why is the rule “${r.match}” being deactivated?`, { title: "Deactivate software rule", confirmText: "Deactivate" }) : "";
    if (r.isActive && reason === null) return;
    try {
      await apiFetch(`/software/catalog/${r.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !r.isActive, reason }), headers: confirmHeader(r.isActive ? `Deactivate the software rule “${r.match}” (${r.status})? Reason: ${reason}` : `Activate the software rule “${r.match}” (${r.status}) again?`) });
      toast({ title: r.isActive ? "Rule deactivated" : "Rule activated" }); qc.invalidateQueries({ queryKey: ["software-catalog"] }); qc.invalidateQueries({ queryKey: ["software-apps"] }); qc.invalidateQueries({ queryKey: ["software-issues"] });
    } catch (e: any) { if (!e?.cancelled) toast({ title: "Not changed", description: e.message, variant: "destructive" }); }
  }
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground flex-1">A rule matches every application whose name contains the text. “Not allowed” wins over the others; otherwise the longest match is used. Rules are never deleted — deactivate them with a reason.</div>
        <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />Show inactive</label>
        {cat.canEdit && <Button size="sm" onClick={() => setEdit({ match: "", publisher: "", status: "Review", licenseId: "", notes: "" })}><Plus className="w-4 h-4 mr-1" />Add rule</Button>}
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2 pr-2">Name contains</th><th className="pr-2">Status</th><th className="pr-2">Licence</th><th className="pr-2">Notes</th><th className="pr-2">Changed</th><th /></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id} className={cn("border-b", !r.isActive && "opacity-50")}>
            <td className="py-2 pr-2 font-medium">{r.match}{r.publisher && <div className="text-[11px] text-muted-foreground font-normal">{r.publisher}</div>}</td>
            <td className="pr-2"><Pill s={r.status} />{!r.isActive && <span className="ml-1 text-[11px]">inactive</span>}</td>
            <td className="pr-2 text-xs">{r.licenseName || "—"}</td><td className="pr-2 text-xs">{r.notes || "—"}</td>
            <td className="pr-2 text-[11px] text-muted-foreground whitespace-nowrap">{r.updatedBy || r.createdBy || "System"}<div>{fmtDate(r.updatedAt || r.createdAt)}</div></td>
            <td className="text-right whitespace-nowrap">{cat.canEdit && <>
              {r.isActive && <Button size="sm" variant="ghost" onClick={() => setEdit({ ...r, licenseId: r.licenseId || "", _o: r })}><Pencil className="w-3.5 h-3.5" /></Button>}
              <Button size="sm" variant="ghost" onClick={() => toggle(r)}>{r.isActive ? "Deactivate" : "Activate"}</Button></>}</td>
          </tr>))}</tbody></table></div>
      <Dialog open={!!edit} onOpenChange={o => { if (!o) { setEdit(null); clearPrefill(); } }}>
        <DialogContent><DialogHeader><DialogTitle>{edit?.id ? "Edit software rule" : "Add software rule"}</DialogTitle><DialogDescription>Applications whose name contains this text get the status below.</DialogDescription></DialogHeader>
          {edit && <div className="space-y-3 text-sm">
            <label className="block">Name contains<Input disabled={!!edit.id} value={edit.match} onChange={e => setEdit({ ...edit, match: e.target.value })} placeholder="e.g. Adobe Acrobat" /></label>
            <label className="block">Publisher (optional)<Input value={edit.publisher || ""} onChange={e => setEdit({ ...edit, publisher: e.target.value })} /></label>
            <label className="block">Status<select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })} className="w-full h-9 rounded-md border bg-background px-2">{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
            {edit.status === "Licensed" && <label className="block">Licence that covers it<select value={edit.licenseId} onChange={e => setEdit({ ...edit, licenseId: e.target.value })} className="w-full h-9 rounded-md border bg-background px-2"><option value="">Choose…</option>{cat.licenses.map((l: any) => <option key={l.id} value={l.id}>{l.name} ({l.seats} seats)</option>)}</select>
              <div className="text-[11px] text-muted-foreground mt-1">Devices with it installed but no active assignment of this licence (for the employee or the asset) get a “No licence seat” item.</div></label>}
            {edit.status === "Not allowed" && <div className="text-[11px] text-red-600">Devices with it installed get a Critical item and an automatic ticket.</div>}
            <label className="block">Notes<Input value={edit.notes || ""} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></label>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => { setEdit(null); clearPrefill(); }}>Cancel</Button><Button disabled={busy || !edit?.match || edit.match.trim().length < 3} onClick={save}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
}
