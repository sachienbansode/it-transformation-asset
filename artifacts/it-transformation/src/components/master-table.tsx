import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { getBadgeClass } from "@/hooks/use-masters";
import { confirmDialog, reasonDialog } from "@/components/confirm-dialog";
import { Plus, Pencil, Power, PowerOff, History, Search, Download, Loader2, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/* ITH-076 — one table for every master list: paged, searchable, Active / Inactive filter, add / edit with an in-app
   confirmation, deactivate (reason required) / activate, and the value's history. Values are never deleted. */

const COLORS = ["", "red", "orange", "yellow", "green", "blue", "purple", "teal", "gray", "indigo", "pink"];
const PAGE = 10;

export function MasterTable({ category, title, note, showColor = false, parentLabel }: { category: string; title: string; note?: string; showColor?: boolean; parentLabel?: string }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [q, setQ] = useState(""); const [term, setTerm] = useState(""); const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [parent, setParent] = useState(""); const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<any>(null); const [hist, setHist] = useState<any>(null); const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => { setPage(1); setQ(""); setTerm(""); setParent(""); setStatus("all"); }, [category]);
  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const key = ["masters-admin", category, term, status, parent, page];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => apiFetch<any>(`/masters-admin?${new URLSearchParams({ category, q: term, status, parent, page: String(page), pageSize: String(PAGE) })}`) });
  const rows: any[] = data?.rows || []; const parents: any[] = data?.parents || [];
  const refresh = () => { qc.invalidateQueries({ queryKey: ["masters-admin"] }); qc.invalidateQueries({ queryKey: ["masters"] }); qc.invalidateQueries({ queryKey: ["masters-admin-all"] }); qc.invalidateQueries({ queryKey: ["itsm-config"] }); qc.invalidateQueries({ queryKey: ["itsm-lists"] }); };

  async function toggle(m: any) {
    let reason: string | null = "";
    if (m.isActive) { reason = await reasonDialog(`Deactivate “${m.label}”${m.parent ? ` (${m.parent})` : ""} in ${title}? It disappears from drop-downs; records that already use it keep it. You can activate it again later.`, { title: "Deactivate value", confirmText: "Deactivate", label: "Reason", minLength: 5 }); if (reason === null) return; }
    else if (!await confirmDialog(`Activate “${m.label}”${m.parent ? ` (${m.parent})` : ""} in ${title}? It appears in drop-downs again.`, { title: "Activate value", confirmText: "Activate" })) return;
    setBusy(m.id);
    try { await apiFetch(`/masters/${m.id}/${m.isActive ? "deactivate" : "activate"}`, { method: "POST", body: JSON.stringify({ reason }), headers: { "X-No-Confirm": "1" } }); toast({ title: `“${m.label}” ${m.isActive ? "deactivated" : "activated"}` }); refresh(); }
    catch (e: any) { toast({ title: "Could not do that", description: e.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  function csv() {
    apiFetch<any>(`/masters-admin?${new URLSearchParams({ category, q: term, status, parent, page: "1", pageSize: "100" })}`).then(d => {
      const head = ["Value", ...(parentLabel ? [parentLabel] : []), ...(showColor ? ["Colour"] : []), "Order", "Status", "Reason", "Added by", "Added", "Last changed by", "Last changed"];
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [head.map(esc).join(","), ...d.rows.map((m: any) => [m.label, ...(parentLabel ? [m.parent] : []), ...(showColor ? [m.color] : []), m.sortOrder, m.isActive ? "Active" : "Inactive", m.statusReason, m.createdBy, m.createdAt ? fmtDateTime(m.createdAt) : "", m.updatedBy, m.updatedAt ? fmtDateTime(m.updatedAt) : ""].map(esc).join(","))];
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = `${category}.csv`; a.click();
    });
  }
  const cols = 5 + (parentLabel ? 1 : 0) + (showColor ? 1 : 0);
  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div><h3 className="text-sm font-semibold">{title} <span className="font-normal text-muted-foreground">· {data?.counts?.active ?? "…"} active{data?.counts?.inactive ? ` · ${data.counts.inactive} inactive` : ""}</span></h3>
          {note && <div className="text-xs text-muted-foreground">{note}</div>}</div>
        <div className="flex gap-2"><Button size="sm" variant="outline" className="gap-1" onClick={csv}><Download className="w-3.5 h-3.5" />CSV</Button>
          <Button size="sm" className="gap-1" onClick={() => setEdit({ label: "", color: "", parent: parent || "", sortOrder: "" })}><Plus className="w-3.5 h-3.5" />Add</Button></div>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" /><Input className="h-8 pl-8 text-xs" placeholder="Search values…" value={q} onChange={e => setQ(e.target.value)} /></div>
        {parentLabel && <select className="h-8 rounded-md border bg-background px-2 text-xs" value={parent} onChange={e => { setParent(e.target.value); setPage(1); }}>
          <option value="">All {parentLabel.toLowerCase()}s</option>{parents.map(p => <option key={p.label} value={p.label}>{p.label}{p.isActive ? "" : " (inactive)"}</option>)}</select>}
        <div className="inline-flex bg-muted rounded-md p-0.5 gap-0.5 text-xs">{(["all", "active", "inactive"] as const).map(s => <button key={s} onClick={() => { setStatus(s); setPage(1); }} className={cn("px-2.5 py-1 rounded", status === s ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{s === "all" ? "All" : s === "active" ? "Active" : "Inactive"}</button>)}</div>
      </div>
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr className="text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 w-12">#</th><th className="px-3 py-2">Value</th>{parentLabel && <th className="px-3 py-2">{parentLabel}</th>}{showColor && <th className="px-3 py-2">Colour</th>}
            <th className="px-3 py-2 w-16">Order</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Last change</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={cols + 1} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {error && <tr><td colSpan={cols + 1} className="px-3 py-6 text-center text-red-600">{(error as Error).message}</td></tr>}
            {!isLoading && !rows.length && !error && <tr><td colSpan={cols + 1} className="px-3 py-8 text-center text-muted-foreground">{term || status !== "all" || parent ? "No match." : "No values yet — use Add."}</td></tr>}
            {rows.map((m, i) => (
              <tr key={m.id} className={cn("border-t hover:bg-muted/30", !m.isActive && "bg-muted/20")}>
                <td className="px-3 py-2 text-xs text-muted-foreground">{(page - 1) * PAGE + i + 1}</td>
                <td className={cn("px-3 py-2 font-medium", !m.isActive && "text-muted-foreground line-through decoration-muted-foreground/40")}>{m.label}</td>
                {parentLabel && <td className="px-3 py-2 text-xs">{m.parent || "—"}</td>}
                {showColor && <td className="px-3 py-2">{m.color ? <span className={cn("text-xs px-2 py-0.5 rounded border", getBadgeClass(m.color))}>{m.color}</span> : <span className="text-muted-foreground">—</span>}</td>}
                <td className="px-3 py-2 text-xs text-muted-foreground">{m.sortOrder}</td>
                <td className="px-3 py-2"><span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", m.isActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>{m.isActive ? "Active" : "Inactive"}</span>
                  {!m.isActive && m.statusReason && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[220px] truncate" title={m.statusReason}>{m.statusReason}</div>}</td>
                <td className="px-3 py-2 text-[11px] text-muted-foreground whitespace-nowrap">{m.updatedAt ? <>{String(m.updatedBy || "").replace(/ <.*>$/, "")}<br />{fmtDateTime(m.updatedAt)}</> : m.createdBy ? <>Added by {String(m.createdBy).replace(/ <.*>$/, "")}<br />{fmtDateTime(m.createdAt)}</> : fmtDateTime(m.createdAt)}</td>
                <td className="px-3 py-2"><div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit" onClick={() => setEdit(m)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" className={cn("h-7 px-2", m.isActive ? "text-amber-700" : "text-emerald-700")} disabled={busy === m.id} title={m.isActive ? "Deactivate" : "Activate"} onClick={() => toggle(m)}>{busy === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : m.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" title="History" onClick={() => setHist(m)}><History className="w-3.5 h-3.5" /></Button>
                </div></td>
              </tr>))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={Math.max(1, Math.ceil((data?.total || 0) / PAGE))} totalItems={data?.total || 0} pageSize={PAGE} onPageChange={setPage} />
      <div className="text-[11px] text-muted-foreground">Values are never deleted. Deactivated values disappear from drop-downs; records that already use them keep them. Every change is in the audit trail.</div>
      {edit && <EditDialog m={edit} category={category} title={title} showColor={showColor} parentLabel={parentLabel} parents={parents} onClose={() => setEdit(null)} onDone={() => { setEdit(null); refresh(); }} />}
      {hist && <HistoryDialog m={hist} onClose={() => setHist(null)} />}
    </div>
  );
}

function EditDialog({ m, category, title, showColor, parentLabel, parents, onClose, onDone }: { m: any; category: string; title: string; showColor: boolean; parentLabel?: string; parents: any[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast(); const isNew = !m.id;
  const [label, setLabel] = useState(m.label || ""); const [color, setColor] = useState(m.color || ""); const [sort, setSort] = useState(m.sortOrder ?? "");
  const [parent, setParent] = useState(m.parent || ""); const [busy, setBusy] = useState(false);
  async function save() {
    const v = label.trim(); if (!v) return;
    const changes: string[] = [];
    if (isNew) changes.push(`Add “${v}”${parentLabel ? ` under ${parentLabel.toLowerCase()} “${parent}”` : ""} to ${title}${showColor && color ? `, colour ${color}` : ""}?`);
    else {
      if (v !== m.label) changes.push(`Value: “${m.label}” → “${v}” (records saved earlier keep “${m.label}”)`);
      if (showColor && (color || "") !== (m.color || "")) changes.push(`Colour: ${m.color || "none"} → ${color || "none"}`);
      if (String(sort) !== String(m.sortOrder)) changes.push(`Order: ${m.sortOrder} → ${sort}`);
      if (!changes.length) { onClose(); return; }
      changes.unshift(`Change “${m.label}” in ${title}?`);
    }
    if (!await confirmDialog(changes.join("\n"), { title: isNew ? "Confirm addition" : "Confirm change", confirmText: isNew ? "Add" : "Save" })) return;
    setBusy(true);
    try {
      const body: any = { label: v, ...(showColor ? { color: color || null } : {}), ...(sort !== "" ? { sortOrder: Number(sort) } : {}) };
      if (isNew) await apiFetch("/masters", { method: "POST", body: JSON.stringify({ ...body, category, parent: parentLabel ? parent : undefined }), headers: { "X-No-Confirm": "1" } });
      else await apiFetch(`/masters/${m.id}`, { method: "PATCH", body: JSON.stringify(body), headers: { "X-No-Confirm": "1" } });
      toast({ title: isNew ? `“${v}” added` : "Saved" }); onDone();
    } catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{isNew ? `Add to ${title}` : `Edit “${m.label}”`}</DialogTitle><DialogDescription>{isNew ? "The new value appears in drop-downs straight away." : "Renaming does not change records that were saved with the old text."}</DialogDescription></DialogHeader>
      <div className="space-y-3">
        {parentLabel && isNew && <div className="space-y-1"><div className="text-xs font-medium">{parentLabel} *</div>
          <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={parent} onChange={e => setParent(e.target.value)}><option value="">Choose…</option>{parents.filter(p => p.isActive).map(p => <option key={p.label}>{p.label}</option>)}</select></div>}
        {parentLabel && !isNew && <div className="text-xs text-muted-foreground">{parentLabel}: <b>{m.parent}</b></div>}
        <div className="space-y-1"><div className="text-xs font-medium">Value *</div><Input value={label} maxLength={120} onChange={e => setLabel(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && save()} /></div>
        <div className="grid grid-cols-2 gap-2">
          {showColor && <div className="space-y-1"><div className="text-xs font-medium">Colour</div><select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={color} onChange={e => setColor(e.target.value)}>{COLORS.map(c => <option key={c} value={c}>{c || "None"}</option>)}</select></div>}
          <div className="space-y-1"><div className="text-xs font-medium">Order</div><Input type="number" min={0} value={sort} placeholder="auto" onChange={e => setSort(e.target.value)} /></div>
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy || !label.trim() || (!!parentLabel && isNew && !parent)}>{isNew ? "Add" : "Save"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

function HistoryDialog({ m, onClose }: { m: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["master-history", m.id], queryFn: () => apiFetch<any>(`/masters/${m.id}/history`) });
  const list: any[] = data?.history || [];
  return (
    <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>History — {m.label}</DialogTitle><DialogDescription>Added {m.createdBy ? `by ${String(m.createdBy).replace(/ <.*>$/, "")} ` : ""}on {fmtDateTime(m.createdAt)}</DialogDescription></DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto border rounded-lg divide-y text-xs">
        {isLoading && <div className="p-3 text-muted-foreground">Loading…</div>}
        {!isLoading && !list.length && <div className="p-3 text-muted-foreground">No changes recorded since it was added.</div>}
        {list.map(h => <div key={h.id} className="px-3 py-2"><div className="flex justify-between gap-2"><span className="font-semibold capitalize">{h.action}</span><span className="text-muted-foreground">{fmtDateTime(h.at)}</span></div>
          <div>{h.summary}</div><div className="text-muted-foreground">by {String(h.performedBy || "").replace(/ <.*>$/, "")}</div></div>)}
      </div>
    </DialogContent></Dialog>
  );
}

/** ITSM lookup lists — pick a list on the left, manage its values in the table (ITH-076). */
export function ItsmListsPanel() {
  const { data: lists = [] } = useQuery({ queryKey: ["itsm-lists"], queryFn: () => apiFetch<any[]>("/masters-admin/itsm-lists") });
  const [sel, setSel] = useState("itsm.urgencyLevels");
  const l = lists.find((x: any) => x.key === sel);
  return (
    <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" />ITSM lookup lists</CardTitle>
      <CardDescription>Drop-down values used in Incident, Problem, Change and Service Request forms. Values are never deleted — deactivate them; every change is in the audit trail.</CardDescription></CardHeader>
      <CardContent className="flex flex-col md:flex-row gap-4">
        <div className="md:w-56 shrink-0 space-y-0.5">{lists.map((x: any) => (
          <button key={x.key} onClick={() => setSel(x.key)} className={cn("w-full text-left px-3 py-2 rounded-md text-xs flex items-center justify-between gap-2", sel === x.key ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted text-muted-foreground")}>
            <span>{x.label}</span><span className="text-[10px] opacity-70">{x.active}{x.inactive ? ` / ${x.inactive} off` : ""}</span></button>))}</div>
        <div className="flex-1 min-w-0">{l && <MasterTable category={l.key} title={l.label} note={`Used in: ${l.note}`} parentLabel={l.parentOf ? "Category" : undefined} />}</div>
      </CardContent></Card>
  );
}

