import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch, API } from "@/lib/api";
import { ArrowLeft, Download, Pencil, Loader2, Search, Paperclip, MessageSquare, CalendarClock, Save, ChevronLeft, ChevronRight, Plus, Table2, History, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUSES, CLOSED, StatusBadge, PersonPicker, Progress, fmtDate, d10, isOverdue, refOf, usePeople } from "@/components/compliance-shared";
import { EvidencePanel } from "@/components/compliance-evidence";
import { AuditDialog } from "@/pages/compliance";

type Tab = "overview" | "checklist" | "policy" | "schedules" | "scope";

export default function ComplianceAudit() {
  const { id } = useParams<{ id: string }>();
  const { canAccess } = useAuth(); const canEdit = canAccess("compliance", "write");
  const { data: a, isLoading } = useQuery<any>({ queryKey: ["compliance-audit", id], queryFn: () => apiFetch(`/compliance-audits/${id}`) });
  const { data: items = [] } = useQuery<any[]>({ queryKey: ["compliance-items", id], queryFn: () => apiFetch(`/compliance-audits/${id}/items`) });
  const [tab, setTab] = useState<Tab>("overview"); const [edit, setEdit] = useState(false);
  const [areaFilter, setAreaFilter] = useState<string>("all");
  if (isLoading || !a) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const s = a.stats; const pct = s.checkpoints ? Math.round((s.closed / s.checkpoints) * 100) : 0;
  const cnt = (st: string) => items.filter(i => i.kind === "checklist" && i.status === st).length;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href="/compliance" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="w-3.5 h-3.5" />Audits</Link>
          <h1 className="text-2xl font-bold tracking-tight leading-tight">{a.title}</h1>
          <div className="text-sm text-muted-foreground">{a.auditNo} · {a.companyName} · {a.status}{a.periodFrom ? ` · period ${fmtDate(a.periodFrom)} – ${fmtDate(a.periodTo)}` : ""}{a.auditFirm ? ` · ${a.auditFirm}` : ""} · target {fmtDate(a.targetDate)}</div>
        </div>
        <div className="flex gap-2">
          <a href={`${API}/compliance-audits/${a.id}/export`}><Button size="sm" variant="outline" className="gap-1.5"><Download className="w-4 h-4" />Export Excel</Button></a>
          {canEdit && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEdit(true)}><Pencil className="w-4 h-4" />Edit audit</Button>}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        <Tile label="Closure" value={`${pct}%`} sub={`${s.closed}/${s.checkpoints}`} className="xl:col-span-2"><Progress value={pct} className="mt-1.5" /></Tile>
        <Tile label="Pending" value={cnt("Pending")} />
        <Tile label="In progress" value={cnt("In Progress") + cnt("Partially Closed")} />
        <Tile label="Submitted" value={cnt("Submitted")} tone="text-indigo-600" />
        <Tile label="Under review" value={s.underReview} tone="text-amber-600" />
        <Tile label="Overdue" value={s.overdue} tone={s.overdue ? "text-red-600" : ""} />
        <Tile label="No owner" value={s.unassigned} tone={s.unassigned ? "text-orange-600" : ""} />
      </div>
      <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px] flex-wrap">
        {([["overview", "Overview"], ["checklist", `Checklist (${s.checkpoints})`], ["policy", `Policies & procedures (${s.policies})`], ["schedules", "Schedules"], ["scope", "Scope"]] as const).map(([k, l]) =>
          <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", tab === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{l}</button>)}
      </div>
      {tab === "overview" && <Overview a={a} onArea={ar => { setAreaFilter(ar); setTab("checklist"); }} />}
      {tab === "checklist" && <ItemsTable audit={a} items={items.filter(i => i.kind === "checklist")} kind="checklist" canEdit={canEdit} area={areaFilter} setArea={setAreaFilter} />}
      {tab === "policy" && <ItemsTable audit={a} items={items.filter(i => i.kind === "policy")} kind="policy" canEdit={canEdit} area="all" setArea={() => {}} />}
      {tab === "schedules" && <Schedules audit={a} canEdit={canEdit} />}
      {tab === "scope" && <Scope a={a} canEdit={canEdit} onEdit={() => setEdit(true)} />}
      {edit && <AuditDialog audit={a} onClose={() => setEdit(false)} />}
    </div>
  );
}

function Tile({ label, value, sub, tone, className, children }: { label: string; value: React.ReactNode; sub?: string; tone?: string; className?: string; children?: React.ReactNode }) {
  return <div className={cn("rounded-[10px] border bg-card px-3 py-2", className)}><div className="text-[11px] text-muted-foreground">{label}</div><div className={cn("text-xl font-semibold leading-tight", tone)}>{value}{sub && <span className="text-xs text-muted-foreground font-normal ml-1.5">{sub}</span>}</div>{children}</div>;
}

function Overview({ a, onArea }: { a: any; onArea: (area: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardContent className="p-0">
        <div className="px-4 py-3 font-semibold text-sm border-b">By audit area</div>
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wider text-muted-foreground"><th className="text-left px-4 py-2">Area</th><th className="px-2">Total</th><th className="px-2">Pending</th><th className="px-2">Under review</th><th className="px-2">Overdue</th><th className="px-2 w-40 text-left">Closed</th></tr></thead>
          <tbody>{a.byArea.map((r: any) => { const p = r.total ? Math.round((r.closed / r.total) * 100) : 0; return (
            <tr key={r.area} className="border-t hover:bg-accent/40 cursor-pointer" onClick={() => onArea(r.area)}>
              <td className="px-4 py-2 font-medium">{r.area}</td><td className="text-center">{r.total}</td><td className="text-center">{r.pending}</td><td className="text-center text-amber-600">{r.underReview || ""}</td>
              <td className={cn("text-center", r.overdue && "text-red-600 font-semibold")}>{r.overdue || ""}</td>
              <td className="px-2"><div className="flex items-center gap-2"><Progress value={p} className="flex-1" /><span className="text-xs w-16 text-right">{r.closed}/{r.total}</span></div></td>
            </tr>); })}</tbody>
        </table>
      </CardContent></Card>
      <Card><CardContent className="p-0">
        <div className="px-4 py-3 font-semibold text-sm border-b">By owner</div>
        <div className="divide-y">{a.byOwner.map((r: any) => (
          <div key={r.owner} className="px-4 py-2 text-sm flex items-center gap-2">
            <div className="flex-1 min-w-0 truncate">{r.owner}</div>
            {r.overdue > 0 && <span className="text-[11px] text-red-600 flex items-center gap-0.5"><CalendarClock className="w-3 h-3" />{r.overdue}</span>}
            <span className="text-xs text-muted-foreground w-14 text-right">{r.closed}/{r.total}</span>
          </div>))}</div>
      </CardContent></Card>
    </div>
  );
}

const PAGE = 50;
function ItemsTable({ audit, items, kind, canEdit, area, setArea }: { audit: any; items: any[]; kind: "checklist" | "policy"; canEdit: boolean; area: string; setArea: (v: string) => void }) {
  const qc = useQueryClient(); const { toast } = useToast(); const { user } = useAuth();
  const [term, setTerm] = useState(""); const [status, setStatus] = useState("all"); const [owner, setOwner] = useState("all"); const [sheet, setSheet] = useState("all"); const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(0); const [sel, setSel] = useState<Set<number>>(new Set()); const [open, setOpen] = useState<number | null>(null);
  const sheets = useMemo(() => [...new Set(items.map(i => i.sheet))], [items]);
  const areas = useMemo(() => [...new Set(items.filter(i => sheet === "all" || i.sheet === sheet).map(i => i.area).filter(Boolean))], [items, sheet]);
  const owners = useMemo(() => { const m = new Map<number, string>(); items.forEach(i => i.ownerUserId && m.set(i.ownerUserId, i.ownerName)); return [...m].sort((x, y) => x[1].localeCompare(y[1])); }, [items]);
  const list = useMemo(() => { const t = term.toLowerCase(); return items.filter(i =>
    (sheet === "all" || i.sheet === sheet) && (area === "all" || i.area === area) && (status === "all" || (status === "open" ? !CLOSED.includes(i.status) : i.status === status)) &&
    (owner === "all" || (owner === "none" ? !i.ownerUserId : owner === "me" ? (i.ownerUserId === user?.id || i.spocUserId === user?.id) : String(i.ownerUserId) === owner)) && (!overdue || isOverdue(i)) &&
    (!t || [i.refNo, i.checkpoint, i.evidenceRequired, i.subArea, i.managementReply].some(x => x && String(x).toLowerCase().includes(t)))); }, [items, term, status, owner, sheet, area, overdue, user]);
  useEffect(() => setPage(0), [term, status, owner, sheet, area, overdue]);
  const shown = list.slice(page * PAGE, page * PAGE + PAGE); const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const toggle = (iid: number) => setSel(p => { const n = new Set(p); n.has(iid) ? n.delete(iid) : n.add(iid); return n; });
  const allShown = shown.length > 0 && shown.every(i => sel.has(i.id));
  const refresh = () => ["compliance-items", "compliance-audit", "compliance-audits"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const order = list.map(i => i.id);
  return (
    <Card><CardContent className="p-3 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative w-60"><Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" /><Input className="pl-8 h-9" placeholder="Search ref, text, reply…" value={term} onChange={e => setTerm(e.target.value)} /></div>
        {sheets.length > 1 && <Select value={sheet} onValueChange={v => { setSheet(v); setArea("all"); }}><SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sheets</SelectItem>{sheets.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>}
        {kind === "checklist" && <Select value={area} onValueChange={setArea}><SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All areas</SelectItem>{areas.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>}
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">All open</SelectItem>{STATUSES.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
        <Select value={owner} onValueChange={setOwner}><SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All owners</SelectItem><SelectItem value="me">Mine (owner / SPOC)</SelectItem><SelectItem value="none">No owner</SelectItem>{owners.map(([oid, n]) => <SelectItem key={oid} value={String(oid)}>{n}</SelectItem>)}</SelectContent></Select>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={overdue} onChange={e => setOverdue(e.target.checked)} />Overdue only</label>
        <span className="text-xs text-muted-foreground ml-auto">{list.length} of {items.length}</span>
      </div>
      {canEdit && sel.size > 0 && <BulkBar ids={[...sel]} onDone={() => { setSel(new Set()); refresh(); }} />}
      <div className="rounded-[10px] border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
            {canEdit && <th className="w-8 px-2"><input type="checkbox" checked={allShown} onChange={() => setSel(p => { const n = new Set(p); shown.forEach(i => (allShown ? n.delete(i.id) : n.add(i.id))); return n; })} /></th>}
            <th className="text-left px-2 py-2 w-16">Ref</th>{kind === "policy" && <th className="text-left px-2 w-24">Type</th>}<th className="text-left px-2">{kind === "policy" ? "Particulars" : "Checkpoint"}</th>
            <th className="text-left px-2 w-36">Owner</th><th className="text-left px-2 w-28">Target</th><th className="text-left px-2 w-32">Status</th><th className="px-2 w-16"></th></tr></thead>
          <tbody>{shown.map(i => (
            <tr key={i.id} className="border-t hover:bg-accent/40 cursor-pointer align-top" onClick={() => setOpen(i.id)}>
              {canEdit && <td className="px-2 py-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} /></td>}
              <td className="px-2 py-2 font-mono text-xs text-primary whitespace-nowrap">{refOf(i)}</td>
              {kind === "policy" && <td className="px-2 py-2 text-xs">{i.docType}</td>}
              <td className="px-2 py-2"><div className="line-clamp-2 whitespace-pre-line">{i.checkpoint}</div>{kind === "checklist" && <div className="text-[11px] text-muted-foreground truncate">{[i.area, i.subArea].filter(Boolean).join(" › ")}</div>}</td>
              <td className="px-2 py-2 text-xs">{i.ownerName || <span className="text-orange-600">—</span>}{i.spocName && <div className="text-muted-foreground">SPOC {i.spocName}</div>}</td>
              <td className={cn("px-2 py-2 text-xs whitespace-nowrap", isOverdue(i) && "text-red-600 font-semibold")}>{fmtDate(i.targetDate)}</td>
              <td className="px-2 py-2"><StatusBadge s={i.status} /></td>
              <td className="px-2 py-2 text-[11px] text-muted-foreground whitespace-nowrap">{i.evidenceCount > 0 && <span className="inline-flex items-center gap-0.5 mr-1.5"><Paperclip className="w-3 h-3" />{i.evidenceCount}</span>}{i.commentCount > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{i.commentCount}</span>}</td>
            </tr>))}
            {!shown.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nothing matches the filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && <div className="flex items-center justify-end gap-2 text-xs">
        <Button size="sm" variant="outline" className="h-7" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
        <span>Page {page + 1} of {pages}</span>
        <Button size="sm" variant="outline" className="h-7" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="w-3.5 h-3.5" /></Button></div>}
      {open && <ItemDialog itemId={open} audit={audit} canEdit={canEdit} order={order} onNav={setOpen} onClose={() => { setOpen(null); refresh(); }} />}
    </CardContent></Card>
  );
}

function BulkBar({ ids, onDone }: { ids: number[]; onDone: () => void }) {
  const { toast } = useToast();
  const [owner, setOwner] = useState<number | null>(null); const [spoc, setSpoc] = useState<number | null>(null); const [date, setDate] = useState(""); const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false);
  async function apply() {
    const set: any = {}; if (owner) set.ownerUserId = owner; if (spoc) set.spocUserId = spoc; if (date) set.targetDate = date; if (status) set.status = status;
    if (!Object.keys(set).length) { toast({ title: "Choose what to change" }); return; }
    setBusy(true);
    try { await apiFetch("/compliance-items/bulk", { method: "POST", body: JSON.stringify({ ids, set }) }); toast({ title: `${ids.length} updated`, description: owner || spoc ? "Owners / SPOCs have been emailed" : undefined }); onDone(); }
    catch (e: any) { toast({ title: "Could not update", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-[10px] border border-primary/30 bg-accent/50 px-3 py-2">
      <div className="text-sm font-semibold self-center mr-1">{ids.length} selected</div>
      <div className="w-48"><Label className="text-[11px]">Owner</Label><PersonPicker value={owner} onChange={setOwner} placeholder="Keep" /></div>
      <div className="w-48"><Label className="text-[11px]">SPOC</Label><PersonPicker value={spoc} onChange={setSpoc} placeholder="Keep" /></div>
      <div><Label className="text-[11px]">Target date</Label><Input type="date" className="h-9 w-40" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div><Label className="text-[11px]">Status</Label><Select value={status || "__keep"} onValueChange={v => setStatus(v === "__keep" ? "" : v)}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__keep">Keep</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
      <Button size="sm" className="h-9 gap-1.5" disabled={busy} onClick={apply}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}Apply</Button>
    </div>
  );
}

function ItemDialog({ itemId, audit, canEdit, order, onNav, onClose }: { itemId: number; audit: any; canEdit: boolean; order: number[]; onNav: (id: number) => void; onClose: () => void }) {
  const { toast } = useToast(); const qc = useQueryClient();
  const { data: it, refetch } = useQuery<any>({ queryKey: ["compliance-item", itemId], queryFn: () => apiFetch(`/compliance-items/${itemId}`) });
  const [f, setF] = useState<any>(null); const [busy, setBusy] = useState(false); const [comment, setComment] = useState(""); const [history, setHistory] = useState(false);
  useEffect(() => { if (it) setF({ ownerUserId: it.ownerUserId, spocUserId: it.spocUserId, targetDate: d10(it.targetDate), status: it.status, managementReply: it.managementReply ?? "", auditorRemarks: it.auditorRemarks ?? "", lastReviewDate: d10(it.lastReviewDate) }); }, [it]);
  const dirty = it && f && (f.ownerUserId !== it.ownerUserId || f.spocUserId !== it.spocUserId || f.targetDate !== d10(it.targetDate) || f.status !== it.status || f.managementReply !== (it.managementReply ?? "") || f.auditorRemarks !== (it.auditorRemarks ?? "") || f.lastReviewDate !== d10(it.lastReviewDate));
  const pos = order.indexOf(itemId);
  async function save(next?: number) {
    if (dirty) {
      setBusy(true);
      try { await apiFetch(`/compliance-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ ...f, targetDate: f.targetDate || null, lastReviewDate: f.lastReviewDate || null, managementReply: f.managementReply || null, auditorRemarks: f.auditorRemarks || null }) }); await refetch(); toast({ title: `${refOf(it)} saved` }); qc.invalidateQueries({ queryKey: ["compliance-items"] }); }
      catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); setBusy(false); return; }
      setBusy(false);
    }
    if (next) onNav(next);
  }
  async function post() {
    if (!comment.trim()) return;
    try { await apiFetch(`/compliance-items/${itemId}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) }); setComment(""); refetch(); } catch (e: any) { toast({ title: "Could not post", description: e.message, variant: "destructive" }); }
  }
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const comments = (it?.comments || []).filter((c: any) => history || !c.system);
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{it ? <><span className="font-mono text-primary">{refOf(it)}</span><span className="truncate">{it.kind === "policy" ? `${it.docType}: ${it.checkpoint}` : it.subArea || it.area}</span>{f && <StatusBadge s={it.status} />}</> : "Loading…"}</DialogTitle>
          {it && <DialogDescription>{it.kind === "policy" ? "Policy & procedure register" : `${it.sheet} · ${it.area ?? ""}`}</DialogDescription>}
        </DialogHeader>
        {it && f && <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {it.kind === "checklist" && <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-[10px] border bg-muted/30 p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Checkpoint</div><div className="text-sm whitespace-pre-line">{it.checkpoint}</div>
              {it.siblings?.length > 1 && <div className="mt-2 flex flex-wrap gap-1">{it.siblings.map((sb: any) => <button key={sb.id} type="button" onClick={() => save(sb.id)} className={cn("text-[11px] rounded px-1.5 py-0.5 border", sb.id === it.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}>{it.refNo}.{sb.seq}</button>)}</div>}</div>
            <div className="rounded-[10px] border bg-muted/30 p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Clarifications / evidence required</div><div className="text-sm whitespace-pre-line">{it.evidenceRequired || "—"}</div></div>
          </div>}
          <div className="grid md:grid-cols-4 gap-3">
            <div><Label>Owner</Label><PersonPicker disabled={!canEdit} value={f.ownerUserId} onChange={v => set("ownerUserId", v)} /></div>
            <div><Label>SPOC</Label><PersonPicker disabled={!canEdit} value={f.spocUserId} onChange={v => set("spocUserId", v)} /></div>
            <div><Label>Target date</Label><Input disabled={!canEdit} type="date" value={f.targetDate} onChange={e => set("targetDate", e.target.value)} /></div>
            <div><Label>Status</Label><Select disabled={!canEdit} value={f.status} onValueChange={v => set("status", v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            {it.kind === "policy" && <div><Label>Last review date</Label><Input disabled={!canEdit} type="date" value={f.lastReviewDate} onChange={e => set("lastReviewDate", e.target.value)} /></div>}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Management reply</Label><Textarea disabled={!canEdit} rows={5} value={f.managementReply} onChange={e => set("managementReply", e.target.value)} placeholder="How the control works, where the evidence is, and any gap with its fix date" /></div>
            <div><Label>Auditor remarks</Label><Textarea disabled={!canEdit} rows={5} value={f.auditorRemarks} onChange={e => set("auditorRemarks", e.target.value)} placeholder={"Walkthrough:\n\nEvidence:"} /></div>
          </div>
          <div><div className="text-sm font-semibold mb-1.5 flex items-center gap-1.5"><Paperclip className="w-4 h-4" />Evidence ({it.documents.length})</div>
            <EvidencePanel target={{ itemId: it.id }} companyId={audit.companyId} docs={it.documents} canEdit={canEdit} defaultCategory={it.kind === "policy" ? (it.docType === "Procedure" ? "Procedure" : "Policy") : "Evidence"} onChange={() => { refetch(); qc.invalidateQueries({ queryKey: ["compliance-items"] }); }} /></div>
          <div>
            <div className="flex items-center justify-between mb-1.5"><div className="text-sm font-semibold flex items-center gap-1.5"><MessageSquare className="w-4 h-4" />Comments</div>
              <label className="text-xs flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)} /><History className="w-3.5 h-3.5" />Show history</label></div>
            <div className="space-y-2">
              {comments.map((c: any) => <div key={c.id} className={cn("rounded-[10px] px-3 py-2 text-sm", c.system ? "bg-muted/40 text-muted-foreground text-xs" : c.isExternal ? "bg-amber-50 dark:bg-amber-500/10 border border-amber-500/30" : "bg-accent/50")}>
                <div className="text-[11px] text-muted-foreground mb-0.5">{c.author}{c.isExternal ? " (auditor)" : ""} · {new Date(c.createdAt).toLocaleString("en-IN")}</div><div className="whitespace-pre-line">{c.body}</div></div>)}
              {!comments.length && <div className="text-xs text-muted-foreground">No comments yet.</div>}
              {canEdit && <div className="flex gap-2"><Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment…" /><Button type="button" size="sm" className="self-end gap-1.5" disabled={!comment.trim()} onClick={post}><Send className="w-3.5 h-3.5" />Post</Button></div>}
            </div>
          </div>
        </div>}
        <div className="flex items-center gap-2 pt-3 border-t">
          {canEdit && <Button onClick={() => save()} disabled={busy || !dirty} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save</Button>}
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {pos >= 0 && <span>{pos + 1} of {order.length}</span>}
            <Button size="sm" variant="outline" disabled={busy || pos <= 0} onClick={() => save(order[pos - 1])} className="gap-1"><ChevronLeft className="w-4 h-4" />Previous</Button>
            <Button size="sm" variant="outline" disabled={busy || pos < 0 || pos >= order.length - 1} onClick={() => save(order[pos + 1])} className="gap-1">{dirty ? "Save & next" : "Next"}<ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Schedules({ audit, canEdit }: { audit: any; canEdit: boolean }) {
  const { data: grids = [], isLoading } = useQuery<any[]>({ queryKey: ["compliance-grids", audit.id], queryFn: () => apiFetch(`/compliance-audits/${audit.id}/grids`) });
  const [open, setOpen] = useState<any>(null);
  return (
    <Card><CardContent className="p-3 space-y-2">
      <div className="text-xs text-muted-foreground">Information the auditor asks for in table form (IT environment, in-scope applications, vendor agreements, password settings, samples). Fill the cells, or upload the data as evidence.</div>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="divide-y rounded-[10px] border">{grids.map(g => {
        const filled = g.grid.reduce((n: number, r: string[], ri: number) => n + r.filter((c, ci) => c.trim() && !g.templateGrid[ri]?.[ci]).length, 0);
        return (
          <button key={g.id} type="button" onClick={() => setOpen(g)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40">
            <Table2 className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0"><div className="font-medium text-sm">{g.sheet}</div><div className="text-xs text-muted-foreground">{g.grid.length} rows · {filled} cell(s) filled · {g.ownerName || "no owner"}{g.evidenceCount ? ` · ${g.evidenceCount} file(s)` : ""}</div></div>
            <StatusBadge s={g.status} />
          </button>); })}</div>
      {open && <GridDialog g={open} audit={audit} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </CardContent></Card>
  );
}

function GridDialog({ g, audit, canEdit, onClose }: { g: any; audit: any; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [grid, setGrid] = useState<string[][]>(() => g.grid.map((r: string[]) => [...r]));
  const [status, setStatus] = useState(g.status); const [owner, setOwner] = useState<number | null>(g.ownerUserId); const [busy, setBusy] = useState(false);
  const { data: docs = [], refetch } = useQuery<any[]>({ queryKey: ["compliance-grid-docs", g.id], queryFn: () => apiFetch(`/compliance-grids/${g.id}/documents`) });
  const locked = (r: number, c: number) => !!g.templateGrid[r]?.[c];
  const width = Math.max(...grid.map(r => r.length), 1);
  async function save() {
    setBusy(true);
    try { await apiFetch(`/compliance-grids/${g.id}`, { method: "PATCH", body: JSON.stringify({ grid, status, ownerUserId: owner }) }); qc.invalidateQueries({ queryKey: ["compliance-grids"] }); qc.invalidateQueries({ queryKey: ["compliance-audit"] }); toast({ title: `${g.sheet} saved` }); onClose(); }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-[1200px] max-h-[92vh] flex flex-col">
        <DialogHeader><DialogTitle>{g.sheet}</DialogTitle><DialogDescription>Grey cells come from the auditor's template and cannot be changed. Fill the white cells; add rows for more entries.</DialogDescription></DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-52"><Label className="text-[11px]">Owner</Label><PersonPicker disabled={!canEdit} value={owner} onChange={setOwner} /></div>
          <div><Label className="text-[11px]">Status</Label><Select disabled={!canEdit} value={status} onValueChange={setStatus}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="flex-1 overflow-auto rounded-[10px] border">
          <table className="text-xs border-collapse">
            <tbody>{grid.map((row, r) => (
              <tr key={r}>{Array.from({ length: width }, (_, c) => locked(r, c)
                ? <td key={c} className="border bg-muted/60 font-medium px-2 py-1 min-w-[140px] max-w-[320px] whitespace-pre-line align-top">{row[c]}</td>
                : <td key={c} className="border p-0 min-w-[140px]"><textarea disabled={!canEdit} rows={1} className="w-full min-h-[30px] bg-transparent px-2 py-1 resize-y outline-none focus:bg-accent/40" value={row[c] ?? ""}
                    onChange={e => setGrid(p => p.map((x, ri) => (ri === r ? Array.from({ length: width }, (_, ci) => (ci === c ? e.target.value : x[ci] ?? "")) : x)))} /></td>)}</tr>))}</tbody>
          </table>
        </div>
        {canEdit && <div><Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setGrid(p => [...p, Array(width).fill("")])}><Plus className="w-3.5 h-3.5" />Add row</Button></div>}
        <div><div className="text-sm font-semibold mb-1.5 flex items-center gap-1.5"><Paperclip className="w-4 h-4" />Supporting files</div>
          <EvidencePanel target={{ gridId: g.id }} companyId={audit.companyId} docs={docs} canEdit={canEdit} onChange={() => { refetch(); qc.invalidateQueries({ queryKey: ["compliance-grids"] }); }} /></div>
        <div className="flex gap-2 pt-3 border-t">
          {canEdit && <Button onClick={save} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save</Button>}
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Scope({ a, canEdit, onEdit }: { a: any; canEdit: boolean; onEdit: () => void }) {
  const apps = a.scope?.applications || [], vendors = a.scope?.vendors || [];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardContent className="p-0"><div className="px-4 py-3 font-semibold text-sm border-b flex justify-between items-center">In-scope applications{canEdit && <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onEdit}><Pencil className="w-3.5 h-3.5" />Edit</Button>}</div>
        <div className="divide-y">{apps.map((x: any, i: number) => <div key={i} className="px-4 py-2 text-sm"><div className="font-medium">{x.name}</div><div className="text-xs text-muted-foreground">{[x.category, x.hosting].filter(Boolean).join(" · ") || "—"}</div></div>)}
          {!apps.length && <div className="px-4 py-4 text-sm text-muted-foreground">None listed.</div>}</div></CardContent></Card>
      <Card><CardContent className="p-0"><div className="px-4 py-3 font-semibold text-sm border-b flex justify-between items-center">Critical vendors{canEdit && <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onEdit}><Pencil className="w-3.5 h-3.5" />Edit</Button>}</div>
        <div className="divide-y">{vendors.map((x: any, i: number) => <div key={i} className="px-4 py-2 text-sm"><div className="font-medium">{x.name}</div><div className="text-xs text-muted-foreground">{[x.role, x.system].filter(Boolean).join(" · ")}</div></div>)}
          {!vendors.length && <div className="px-4 py-4 text-sm text-muted-foreground">None listed.</div>}</div></CardContent></Card>
    </div>
  );
}
