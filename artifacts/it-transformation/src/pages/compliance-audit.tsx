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
import { Archive, ArrowLeft, CalendarClock, ChevronLeft, ChevronRight, Download, EyeOff, FileDown, FileSpreadsheet, Gavel, History, Loader2, MessageSquare, Paperclip, Pencil, Plus, Save, Search, Send, Share2, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pager, DocsButton, fileUrl, STATUSES, TEAM_STATUSES, AUDITOR_STATUSES, CLOSED, StatusBadge, PersonPicker, Progress, fmtDate, d10, isOverdue, refOf, usePeople, useStatusMaster, groupOf, offered, StatusFilter, StatusSelect, matchStatus, DOT, statusRows, courtOf, ago, stamp } from "@/components/compliance-shared";
import { EvidencePanel } from "@/components/compliance-evidence";
import { useDocViewer } from "@/components/doc-viewer";
import { GridTable } from "@/components/compliance-grid";
import { AuditorsTab } from "@/components/compliance-auditors";
import { ReferencesPanel } from "@/components/compliance-references";
import { AuditDialog } from "@/pages/compliance";
import { fmtDateTime } from "@/lib/date";

type Tab = "overview" | "checklist" | "policy" | "schedules" | "scope" | "auditors";

export default function ComplianceAudit() {
  const { id } = useParams<{ id: string }>();
  const { canAccess } = useAuth(); const canEdit = canAccess("compliance", "write"); const { toast } = useToast();
  const { data: a, isLoading } = useQuery<any>({ queryKey: ["compliance-audit", id], queryFn: () => apiFetch(`/compliance-audits/${id}`) });
  const { data: items = [] } = useQuery<any[]>({ queryKey: ["compliance-items", id], queryFn: () => apiFetch(`/compliance-audits/${id}/items`) });
  useStatusMaster();
  const [tab, setTab] = useState<Tab>("overview"); const [edit, setEdit] = useState(false);
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [preset, setPreset] = useState<Preset>({}); const [presetKey, setPresetKey] = useState(0);
  const go = (kind: "checklist" | "policy", p: Preset = {}) => { setPreset(p); setAreaFilter(p.area ?? "all"); setTab(kind); setPresetKey(k => k + 1); };
  // deep link from the Evidence Library: /compliance/:id?item=123 or ?grid=45 opens that checkpoint / schedule
  const [deep, setDeep] = useState(() => { const sp = new URLSearchParams(window.location.search); return { item: Number(sp.get("item")) || null, grid: Number(sp.get("grid")) || null }; });
  const [openGrid, setOpenGrid] = useState<number | null>(null);
  React.useEffect(() => {
    if (deep.item && items.length) { const it = items.find(i => i.id === deep.item); if (it) go(it.kind === "policy" ? "policy" : "checklist", { open: it.id }); setDeep({ item: null, grid: null }); window.history.replaceState(null, "", window.location.pathname); }
    else if (deep.grid) { setTab("schedules"); setOpenGrid(deep.grid); setDeep({ item: null, grid: null }); window.history.replaceState(null, "", window.location.pathname); }
  }, [deep, items]);
  if (isLoading || !a) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const s = a.stats; const pct = s.checkpoints ? Math.round((s.closed / s.checkpoints) * 100) : 0;
  const cnt = (g: string) => items.filter(i => i.kind === "checklist" && groupOf(i.status) === g).length;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href="/compliance" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="w-3.5 h-3.5" />Audits</Link>
          <h1 className="text-2xl font-bold tracking-tight leading-tight">{a.title}</h1>
          <div className="text-sm text-muted-foreground">{a.auditNo} · {a.companyName} · {a.status}{a.startDate ? ` · started ${fmtDate(a.startDate)}` : ""}{a.periodFrom ? ` · period ${fmtDate(a.periodFrom)} – ${fmtDate(a.periodTo)}` : ""}{a.auditFirm ? ` · ${a.auditFirm}` : ""} · target {fmtDate(a.targetDate)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`${API}/compliance-audits/${a.id}/complete-report`} title="One ZIP: dashboard PDF + Excel, status workbook, every linked evidence / policy / reference file and an index. Not available to auditors." onClick={() => toast({ title: "Preparing the complete report", description: "The ZIP downloads when ready — large audits can take a minute" })}><Button size="sm" className="gap-1.5"><Archive className="w-4 h-4" />Complete report (ZIP)</Button></a>
          <a href={`${API}/compliance-audits/${a.id}/export`} title="The auditor's workbook (same format as uploaded) filled with today's status"><Button size="sm" variant="outline" className="gap-1.5"><Download className="w-4 h-4" />Export status (Excel)</Button></a>
          <a href={`${API}/compliance-audits/${a.id}/dashboard?format=pdf`} title="Dashboard as a PDF report"><Button size="sm" variant="outline" className="gap-1.5"><FileDown className="w-4 h-4" />Dashboard PDF</Button></a>
          <a href={`${API}/compliance-audits/${a.id}/dashboard?format=xlsx`} title="Dashboard figures and the list of open items in Excel"><Button size="sm" variant="outline" className="gap-1.5"><FileSpreadsheet className="w-4 h-4" />Dashboard Excel</Button></a>
          {a.templateId && <a href={`${API}/compliance-templates/${a.templateId}/source`} title="The checklist file exactly as uploaded"><Button size="sm" variant="ghost" className="gap-1.5"><Download className="w-4 h-4" />Uploaded checklist</Button></a>}
          {canEdit && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEdit(true)}><Pencil className="w-4 h-4" />Edit audit</Button>}
        </div>
      </div>
      {(() => { const ck = items.filter(i => i.kind === "checklist"); const T = ck.length || s.checkpoints || 0;
        const ent = ck.filter(i => courtOf(i) === "entity").length, aud = ck.filter(i => courtOf(i) === "auditor").length, clo = ck.filter(i => courtOf(i) === "closed").length;
        const subPct = T ? Math.round(((aud + clo) / T) * 100) : 0; const P = (n: number) => (T ? Math.round(((n || 0) / T) * 100) : 0); const F = (n: number) => (n && P(n) === 0 ? "<1" : n < T && P(n) === 100 ? ">99" : String(P(n)));
        return (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-2">
          <Tile label="Checkpoints" value={s.checkpoints} sub={`+ ${s.policies} policies`} onClick={() => go("checklist")} />
          <Tile label="Submission progress" value={`${F(aud + clo)}%`} sub={`${aud + clo} of ${T} sent to auditor`} tone="text-indigo-600" bar="bg-indigo-500" barValue={subPct} className="xl:col-span-2" onClick={() => go("checklist", { share: "court:sent" })} />
          <Tile label="Closure" value={`${F(s.closed)}%`} sub={`${s.closed} of ${s.checkpoints} closed by auditor`} tone="text-emerald-600" bar="bg-emerald-500" barValue={pct} className="xl:col-span-2" onClick={() => go("checklist", { status: "g:closed" })} />
          <Tile label="Pending with entity" value={`${F(ent)}%`} sub={`${ent} of ${T}`} tone="text-orange-600" bar="bg-orange-400" barValue={P(ent)} onClick={() => go("checklist", { share: "court:entity" })} />
          <Tile label="Pending with auditor" value={`${F(aud)}%`} sub={`${aud} of ${T}`} tone="text-violet-600" bar="bg-violet-500" barValue={P(aud)} onClick={() => go("checklist", { share: "court:auditor" })} />
          <Tile label="Overdue" value={`${F(s.overdue)}%`} sub={`${s.overdue} of ${T}`} tone={s.overdue ? "text-red-600" : ""} bar="bg-red-500" barValue={P(s.overdue)} onClick={() => go("checklist", { overdue: true })} />
          <Tile label="No owner" value={`${F(s.unassigned)}%`} sub={`${s.unassigned} of ${T}`} tone={s.unassigned ? "text-orange-600" : ""} bar="bg-orange-400" barValue={P(s.unassigned)} onClick={() => go("checklist", { owner: "none" })} />
        </div>); })()}
      <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px] flex-wrap">
        {([["overview", "Overview"], ["checklist", `Checklist (${s.checkpoints})`], ["policy", `Policies & procedures (${s.policies})`], ["schedules", "Schedules"], ["scope", "Scope & circular"], ["auditors", "Auditors & access log"]] as const).map(([k, l]) =>
          <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", tab === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{l}</button>)}
      </div>
      {tab === "overview" && <Overview items={items} go={go} auditId={a.id} />}
      {tab === "checklist" && <ItemsTable key={`c${presetKey}`} preset={preset} audit={a} items={items.filter(i => i.kind === "checklist")} kind="checklist" canEdit={canEdit} area={areaFilter} setArea={setAreaFilter} />}
      {tab === "policy" && <ItemsTable key={`p${presetKey}`} preset={preset} audit={a} items={items.filter(i => i.kind === "policy")} kind="policy" canEdit={canEdit} area="all" setArea={() => {}} />}
      {tab === "schedules" && <Schedules audit={a} canEdit={canEdit} openId={openGrid} onOpened={() => setOpenGrid(null)} />}
      {tab === "scope" && <Scope a={a} canEdit={canEdit} onEdit={() => setEdit(true)} />}
      {tab === "auditors" && <AuditorsTab audit={a} canEdit={canEdit} />}
      {edit && <AuditDialog audit={a} onClose={() => setEdit(false)} />}
    </div>
  );
}

type Preset = { status?: string; owner?: string; overdue?: boolean; share?: string; area?: string; open?: number };
function Tile({ label, value, sub, tone, className, children, onClick, bar, barValue }: { label: string; value: React.ReactNode; sub?: string; tone?: string; className?: string; children?: React.ReactNode; onClick?: () => void; bar?: string; barValue?: number }) {
  return <div role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={e => { if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(); } }} title={onClick ? "Open the list" : undefined}
    className={cn("rounded-[10px] border bg-card px-3 py-2.5 flex flex-col min-h-[92px]", onClick && "cursor-pointer hover:border-primary/60 hover:shadow-sm transition", className)}>
    <div className="text-[11px] leading-tight text-muted-foreground line-clamp-2 min-h-[2.2em]" title={label}>{label}</div>
    <div className={cn("text-2xl font-semibold leading-tight mt-0.5 tabular-nums", tone)}>{value}</div>
    <div className="text-[11px] text-muted-foreground truncate min-h-[16px]">{sub}</div>
    <div className="mt-auto pt-1.5">{barValue !== undefined ? <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", bar || "bg-primary")} style={{ width: `${Math.min(100, Math.max(0, barValue))}%` }} /></div> : <div className="h-1.5" />}</div>
    {children}
  </div>;
}

const OPEN = (st: string) => !CLOSED.includes(st);
const GROUPS: { key: string; label: string; match: (st: string) => boolean; color: string; preset: Preset }[] = [
  { key: "pending", label: "Pending", match: st => groupOf(st) === "pending", color: "bg-slate-300 dark:bg-slate-500", preset: { status: "g:pending" } },
  { key: "inprog", label: "In progress", match: st => groupOf(st) === "inprog", color: "bg-blue-400", preset: { status: "g:inprog" } },
  { key: "submitted", label: "Submitted", match: st => groupOf(st) === "submitted", color: "bg-indigo-500", preset: { status: "g:submitted" } },
  { key: "review", label: "Under review", match: st => groupOf(st) === "review", color: "bg-amber-400", preset: { status: "g:review" } },
  { key: "closed", label: "Closed / N.A.", match: st => groupOf(st) === "closed", color: "bg-emerald-500", preset: { status: "g:closed" } },
];
/* Whose turn: the work waiting with the entity (team) vs with the auditor, and what is closed */
function Turn({ check, go }: { check: any[]; go: (kind: "checklist" | "policy", p?: Preset) => void }) {
  const T = Math.max(1, check.length);
  const ent = check.filter(i => courtOf(i) === "entity"), aud = check.filter(i => courtOf(i) === "auditor"), clo = check.filter(i => courtOf(i) === "closed");
  const E: [string, number, Preset][] = [
    ["Not started", ent.filter(i => groupOf(i.status) === "pending").length, { status: "g:pending" }],
    ["In progress", ent.filter(i => groupOf(i.status) === "inprog" && !i.auditorUpdatedAt).length, { status: "g:inprog" }],
    ["Info requested / partly closed by auditor", ent.filter(i => groupOf(i.status) === "inprog" && !!i.auditorUpdatedAt).length, { status: "g:inprog" }],
    ["Submitted, not yet shared", ent.filter(i => groupOf(i.status) === "submitted").length, { share: "review" }],
  ];
  const A: [string, number, Preset][] = [
    ["Shared, awaiting review", aud.filter(i => groupOf(i.status) === "submitted").length, { status: "g:submitted", share: "shared" }],
    ["Under review", aud.filter(i => groupOf(i.status) === "review").length, { status: "g:review" }],
  ];
  const seg = (n: number, cls: string, p: Preset, label: string) => n ? <button type="button" title={`${label}: ${n}`} onClick={() => go("checklist", p)} className={cn(cls, "h-full hover:opacity-80 transition")} style={{ width: `${(n / T) * 100}%` }} /> : null;
  const Side = ({ title, n, tone, bg, rows, p }: { title: string; n: number; tone: string; bg: string; rows: [string, number, Preset][]; p: Preset }) => (
    <div className={cn("rounded-[10px] border p-3", bg)}>
      <button type="button" onClick={() => go("checklist", p)} className="w-full flex items-baseline justify-between group"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-primary">{title}</span><span className={cn("text-2xl font-bold", tone)}>{n}</span></button>
      <div className="mt-1.5 space-y-0.5">{rows.map(([l, c, pp]) => <button key={l} type="button" onClick={() => go("checklist", pp)} disabled={!c} className="w-full flex justify-between text-xs py-0.5 hover:text-primary disabled:opacity-50 disabled:hover:text-inherit"><span className="text-left">{l}</span><b>{c}</b></button>)}</div>
    </div>);
  return (
    <Card className="lg:col-span-3"><CardContent className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2"><div className="font-semibold text-sm">Whose action is pending</div><div className="text-xs text-muted-foreground">{check.length} checkpoints · click to open the list</div></div>
      <div className="flex h-5 rounded-full overflow-hidden bg-muted">{seg(ent.length, "bg-orange-400", { share: "court:entity" }, "With entity")}{seg(aud.length, "bg-violet-500", { share: "court:auditor" }, "With auditor")}{seg(clo.length, "bg-emerald-500", { status: "g:closed" }, "Closed")}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400" />With entity <b>{ent.length}</b> ({Math.round((ent.length / T) * 100)}%)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500" />With auditor <b>{aud.length}</b> ({Math.round((aud.length / T) * 100)}%)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Closed <b>{clo.length}</b> ({Math.round((clo.length / T) * 100)}%)</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        <Side title="With entity" n={ent.length} tone="text-orange-600" bg="bg-orange-50/60 dark:bg-orange-500/5" rows={E} p={{ share: "court:entity" }} />
        <Side title="With auditor" n={aud.length} tone="text-violet-600" bg="bg-violet-50/60 dark:bg-violet-500/5" rows={A} p={{ share: "court:auditor" }} />
        <Side title="Closed" n={clo.length} tone="text-emerald-600" bg="bg-emerald-50/60 dark:bg-emerald-500/5" rows={statusRows().filter(r => r.grp === "closed").map(r => [r.name, clo.filter(i => i.status === r.name).length, { status: r.name }] as [string, number, Preset])} p={{ status: "g:closed" }} />
      </div>
    </CardContent></Card>
  );
}

/* Latest activity — entity users and auditors in one feed, newest first */
function Activity({ auditId }: { auditId: number }) {
  const [side, setSide] = useState<"all" | "entity" | "auditor">("all"); const [limit, setLimit] = useState(30);
  const { data } = useQuery<any>({ queryKey: ["compliance-activity", auditId, side, limit], queryFn: () => apiFetch(`/compliance-audits/${auditId}/activity?limit=${limit}${side !== "all" ? `&side=${side}` : ""}`), refetchInterval: 60_000 });
  const rows: any[] = data?.rows || [];
  return (
    <Card className="lg:col-span-2"><CardContent className="p-0 flex flex-col h-full max-h-[420px]">
      <div className="px-4 pt-3 pb-2 border-b space-y-2">
        <div className="flex items-center justify-between gap-2"><div className="font-semibold text-sm">Latest activity</div>
          <div className="inline-flex bg-muted rounded-[8px] p-[2px] gap-[2px]">{(["all", "entity", "auditor"] as const).map(k => <button key={k} type="button" onClick={() => setSide(k)} className={cn("px-2 py-0.5 rounded-[6px] text-[11px]", side === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{k === "all" ? "All" : k === "entity" ? "Entity" : "Auditor"}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-[8px] bg-orange-50 dark:bg-orange-500/10 px-2 py-1"><span className="text-muted-foreground">Entity last active</span><div className="font-semibold">{ago(data?.lastEntity)}</div></div>
          <div className="rounded-[8px] bg-violet-50 dark:bg-violet-500/10 px-2 py-1"><span className="text-muted-foreground">Auditor last active</span><div className="font-semibold">{ago(data?.lastAuditor)}</div></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto divide-y">
        {rows.map((r, i) => (
          <div key={i} className="px-4 py-2 text-xs flex gap-2">
            <span className={cn("mt-1 w-2 h-2 rounded-full shrink-0", r.side === "auditor" ? "bg-violet-500" : "bg-orange-400")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2"><span className="font-medium truncate">{String(r.author || "—").replace(/\s*<[^>]*>/, "")} <span className={cn("ml-1 rounded px-1 py-px text-[10px] font-normal", r.side === "auditor" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" : "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300")}>{r.side === "auditor" ? "Auditor" : "Entity"}</span></span>
                <span className="text-muted-foreground whitespace-nowrap" title={fmtDateTime(r.at)}>{stamp(r.at)}</span></div>
              <div className="text-muted-foreground line-clamp-2">{r.refNo ? <span className="font-mono text-primary mr-1">{r.refNo}{r.seq > 1 ? "." + r.seq : ""}</span> : null}{r.body}</div>
            </div>
          </div>))}
        {!rows.length && <div className="px-4 py-6 text-center text-xs text-muted-foreground">No activity yet.</div>}
      </div>
      {rows.length >= limit && <button type="button" onClick={() => setLimit(l => l + 50)} className="border-t px-4 py-1.5 text-xs text-primary hover:bg-accent/40">Show more</button>}
    </CardContent></Card>
  );
}

function Num({ n, onClick, tone }: { n: number; onClick: () => void; tone?: string }) {
  if (!n) return <span className="text-muted-foreground/50">–</span>;
  return <button type="button" onClick={onClick} className={cn("font-medium hover:underline underline-offset-2 hover:text-primary", tone)}>{n}</button>;
}
function Overview({ items, go, auditId }: { items: any[]; go: (kind: "checklist" | "policy", p?: Preset) => void; auditId: number }) {
  const check = items.filter(i => i.kind === "checklist"), pol = items.filter(i => i.kind === "policy");
  const areas = useMemo(() => { const m = new Map<string, any[]>(); check.forEach(i => { const k = i.area || i.sheet; m.set(k, [...(m.get(k) || ([] as any[])), i]); }); return [...m]; }, [items]);
  const owners = useMemo(() => { const m = new Map<string, { id: number | null; name: string; list: any[] }>(); /* owner rows */ items.forEach(i => { const k = String(i.ownerUserId ?? "none"); const e = m.get(k) || { id: i.ownerUserId ?? null, name: i.ownerName || "— No owner —", list: [] as any[] }; e.list.push(i); m.set(k, e); });
    return [...m.values()].sort((x, y) => (x.id === null ? -1 : y.id === null ? 1 : y.list.length - x.list.length)); }, [items]);
  const row = (list: any[]) => ({ total: list.length, pending: list.filter(i => groupOf(i.status) === "pending").length, inprog: list.filter(i => groupOf(i.status) === "inprog").length, submitted: list.filter(i => groupOf(i.status) === "submitted").length,
    review: list.filter(i => groupOf(i.status) === "review").length, closed: list.filter(i => CLOSED.includes(i.status)).length, overdue: list.filter(isOverdue).length, noOwner: list.filter(i => !i.ownerUserId).length, open: list.filter(i => OPEN(i.status)).length,
    entity: list.filter(i => courtOf(i) === "entity").length, auditor: list.filter(i => courtOf(i) === "auditor").length });
  const tot = row(check);
  const Cells = ({ r, p }: { r: ReturnType<typeof row>; p: Preset }) => <>
    <td className="text-center"><Num n={r.total} onClick={() => go("checklist", p)} /></td>
    <td className="text-center"><Num n={r.pending} onClick={() => go("checklist", { ...p, status: "g:pending" })} /></td>
    <td className="text-center"><Num n={r.inprog} onClick={() => go("checklist", { ...p, status: "g:inprog" })} tone="text-blue-600" /></td>
    <td className="text-center"><Num n={r.submitted} onClick={() => go("checklist", { ...p, status: "g:submitted" })} tone="text-indigo-600" /></td>
    <td className="text-center"><Num n={r.review} onClick={() => go("checklist", { ...p, status: "g:review" })} tone="text-amber-600" /></td>
    <td className="text-center"><Num n={r.entity} onClick={() => go("checklist", { ...p, share: "court:entity" })} tone="text-orange-600" /></td>
    <td className="text-center"><Num n={r.auditor} onClick={() => go("checklist", { ...p, share: "court:auditor" })} tone="text-violet-600" /></td>
    <td className="text-center"><Num n={r.overdue} onClick={() => go("checklist", { ...p, overdue: true })} tone="text-red-600" /></td>
    <td className="text-center"><Num n={r.noOwner} onClick={() => go("checklist", { ...p, owner: "none" })} tone="text-orange-600" /></td>
    <td className="px-3"><button type="button" onClick={() => go("checklist", { ...p, status: "g:closed" })} className="w-full flex items-center gap-2 group"><Progress value={r.total ? (r.closed / r.total) * 100 : 0} className="flex-1" /><span className="text-xs w-14 text-right group-hover:text-primary">{r.closed}/{r.total}</span></button></td>
  </>;
  const head = <tr className="text-[11px] uppercase tracking-wider text-muted-foreground"><th className="text-left px-4 py-2">Area</th><th className="px-2">Total</th><th className="px-2">Pending</th><th className="px-2">In progress</th><th className="px-2">Submitted</th><th className="px-2">Under review</th><th className="px-2 text-orange-600">With entity</th><th className="px-2 text-violet-600">With auditor</th><th className="px-2">Overdue</th><th className="px-2">No owner</th><th className="px-3 w-44 text-left">Closed</th></tr>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <Turn check={check} go={go} />
        <Activity auditId={auditId} />
      </div>
      <Card><CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between"><div className="font-semibold text-sm">Checkpoint status</div><div className="text-xs text-muted-foreground">{check.length} checkpoints · click a segment to open the list</div></div>
        <div className="flex h-4 rounded-full overflow-hidden bg-muted">{GROUPS.map(g => { const n = check.filter(i => g.match(i.status)).length; return n ? <button key={g.key} type="button" title={`${g.label}: ${n}`} onClick={() => go("checklist", g.preset)} className={cn(g.color, "h-full hover:opacity-80")} style={{ width: `${(n / Math.max(1, check.length)) * 100}%` }} /> : null; })}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">{GROUPS.map(g => { const n = check.filter(i => g.match(i.status)).length; return <button key={g.key} type="button" onClick={() => go("checklist", g.preset)} className="inline-flex items-center gap-1.5 hover:text-primary"><span className={cn("w-2.5 h-2.5 rounded-sm", g.color)} />{g.label} <b>{n}</b> <span className="text-muted-foreground">({check.length ? Math.round((n / check.length) * 100) : 0}%)</span></button>; })}</div>
      </CardContent></Card>
      <Card><CardContent className="p-0 overflow-x-auto">
        <div className="px-4 py-3 font-semibold text-sm border-b">By audit area <span className="text-xs font-normal text-muted-foreground">— click any number to open those checkpoints</span></div>
        <table className="w-full text-sm min-w-[1040px]">
          <thead>{head}</thead>
          <tbody>
            {areas.map(([area, list]) => <tr key={area} className="border-t hover:bg-accent/30"><td className="px-4 py-2"><button type="button" onClick={() => go("checklist", { area })} className="font-medium text-left hover:text-primary">{area}</button></td><Cells r={row(list)} p={{ area }} /></tr>)}
            <tr className="border-t-2 bg-muted/40 font-semibold"><td className="px-4 py-2">Total</td><Cells r={tot} p={{}} /></tr>
          </tbody>
        </table>
      </CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardContent className="p-0 overflow-x-auto">
          <div className="px-4 py-3 font-semibold text-sm border-b">By owner <span className="text-xs font-normal text-muted-foreground">— checkpoints and policies</span></div>
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wider text-muted-foreground"><th className="text-left px-4 py-2">Owner</th><th className="px-2">Checkpoints</th><th className="px-2">Policies</th><th className="px-2">Open</th><th className="px-2">Overdue</th><th className="px-3 w-40 text-left">Closed</th></tr></thead>
            <tbody>
              {owners.map(o => { const c = o.list.filter(i => i.kind === "checklist"), pp = o.list.filter(i => i.kind === "policy"); const r = row(o.list); const ow = o.id === null ? "none" : String(o.id); return (
                <tr key={ow} className="border-t hover:bg-accent/30">
                  <td className={cn("px-4 py-2", o.id === null && "text-orange-600")}>{o.name}</td>
                  <td className="text-center"><Num n={c.length} onClick={() => go("checklist", { owner: ow })} /></td>
                  <td className="text-center"><Num n={pp.length} onClick={() => go("policy", { owner: ow })} /></td>
                  <td className="text-center"><Num n={c.filter(i => OPEN(i.status)).length} onClick={() => go("checklist", { owner: ow, status: "open" })} /></td>
                  <td className="text-center"><Num n={c.filter(isOverdue).length} onClick={() => go("checklist", { owner: ow, overdue: true })} tone="text-red-600" /></td>
                  <td className="px-3"><div className="flex items-center gap-2"><Progress value={r.total ? (r.closed / r.total) * 100 : 0} className="flex-1" /><span className="text-xs w-14 text-right">{r.closed}/{r.total}</span></div></td>
                </tr>); })}
              <tr className="border-t-2 bg-muted/40 font-semibold"><td className="px-4 py-2">Total</td><td className="text-center">{check.length}</td><td className="text-center">{pol.length}</td><td className="text-center">{check.filter(i => OPEN(i.status)).length}</td><td className="text-center">{check.filter(isOverdue).length}</td><td className="px-3 text-xs text-right">{items.filter(i => CLOSED.includes(i.status)).length}/{items.length}</td></tr>
            </tbody>
          </table>
        </CardContent></Card>
        <Card><CardContent className="p-0">
          <div className="px-4 py-3 font-semibold text-sm border-b">Policies & procedures</div>
          <div className="divide-y">
            {[{ l: "Total", p: {} as Preset, n: pol.length }, ...GROUPS.map(g => ({ l: g.label, p: g.preset, n: pol.filter(i => g.match(i.status)).length })), { l: "No owner", p: { owner: "none" } as Preset, n: pol.filter(i => !i.ownerUserId).length }, { l: "No document linked", p: { status: "nodoc" } as Preset, n: pol.filter(i => !i.evidenceCount).length }].map(r =>
              <button key={r.l} type="button" onClick={() => go("policy", r.p)} className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-accent/40"><span>{r.l}</span><span className="font-semibold">{r.n}</span></button>)}
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}

const PAGE = 10;
function ItemsTable({ audit, items, kind, canEdit, area, setArea, preset = {} }: { audit: any; items: any[]; kind: "checklist" | "policy"; canEdit: boolean; area: string; setArea: (v: string) => void; preset?: Preset }) {
  const qc = useQueryClient(); const { toast } = useToast(); const { user } = useAuth(); const view = useDocViewer();
  const [term, setTerm] = useState(""); const [share, setShare] = useState(preset.share ?? "all"); const [status, setStatus] = useState(preset.status ?? "all"); const [owner, setOwner] = useState(preset.owner ?? "all"); const [sheet, setSheet] = useState("all"); const [overdue, setOverdue] = useState(!!preset.overdue);
  const [page, setPage] = useState(0); const [sel, setSel] = useState<Set<number>>(new Set()); const [open, setOpen] = useState<number | null>(preset.open ?? null);
  const sheets = useMemo(() => [...new Set(items.map(i => i.sheet))], [items]);
  const areas = useMemo(() => [...new Set(items.filter(i => sheet === "all" || i.sheet === sheet).map(i => i.area).filter(Boolean))], [items, sheet]);
  const owners = useMemo(() => { const m = new Map<number, string>(); items.forEach(i => i.ownerUserId && m.set(i.ownerUserId, i.ownerName)); return [...m].sort((x, y) => x[1].localeCompare(y[1])); }, [items]);
  const list = useMemo(() => { const t = term.toLowerCase(); return items.filter(i =>
    (sheet === "all" || i.sheet === sheet) && (area === "all" || i.area === area) && (status === "nodoc" ? !i.evidenceCount : matchStatus(status, i.status)) &&
    (share === "all" || (share === "court:entity" ? courtOf(i) === "entity" : share === "court:auditor" ? courtOf(i) === "auditor" : share === "court:sent" ? courtOf(i) !== "entity" : share === "shared" ? !!i.sharedAt : share === "review" ? (groupOf(i.status) === "submitted" && !i.sharedAt) : !i.sharedAt)) && (owner === "all" || (owner === "none" ? !i.ownerUserId : owner === "me" ? (i.ownerUserId === user?.id || i.spocUserId === user?.id) : String(i.ownerUserId) === owner)) && (!overdue || isOverdue(i)) &&
    (!t || [i.refNo, i.checkpoint, i.evidenceRequired, i.subArea, i.managementReply].some(x => x && String(x).toLowerCase().includes(t)))); }, [items, term, status, owner, sheet, area, overdue, user, share]);
  useEffect(() => setPage(0), [term, status, owner, sheet, area, overdue, share]);
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
        <StatusFilter value={status} onChange={setStatus} extra={kind === "policy" ? [["nodoc", "No document linked"]] : []} />
        <Select value={owner} onValueChange={setOwner}><SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All owners</SelectItem><SelectItem value="me">Mine (owner / SPOC)</SelectItem><SelectItem value="none">No owner</SelectItem>{owners.map(([oid, n]) => <SelectItem key={oid} value={String(oid)}>{n}</SelectItem>)}</SelectContent></Select>
        <Select value={share} onValueChange={setShare}><SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Anyone's turn</SelectItem><SelectItem value="court:entity">Pending with entity</SelectItem><SelectItem value="court:auditor">Pending with auditor</SelectItem><SelectItem value="court:sent">Sent to auditor (incl. closed)</SelectItem><SelectItem value="review">Awaiting review (to share)</SelectItem><SelectItem value="shared">Shared with auditor</SelectItem><SelectItem value="not">Not shared</SelectItem></SelectContent></Select>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={overdue} onChange={e => setOverdue(e.target.checked)} />Overdue only</label>
        <span className="text-xs text-muted-foreground ml-auto">{list.length} of {items.length}</span>
      </div>
      {canEdit && allShown && sel.size < list.length && <div className="text-xs rounded-[8px] bg-accent/60 px-3 py-1.5">{sel.size} selected on this page. <button type="button" className="text-primary font-medium hover:underline" onClick={() => setSel(new Set(list.map(i => i.id)))}>Select all {list.length} matching the filters</button></div>}
      {canEdit && sel.size > 0 && <BulkBar ids={[...sel]} onDone={() => { setSel(new Set()); refresh(); }} />}
      <div className="rounded-[10px] border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
            {canEdit && <th className="w-8 px-2"><input type="checkbox" checked={allShown} onChange={() => setSel(p => { const n = new Set(p); shown.forEach(i => (allShown ? n.delete(i.id) : n.add(i.id))); return n; })} /></th>}
            <th className="text-left px-2 py-2 w-16">Ref</th>{kind === "policy" && <th className="text-left px-2 w-24">Type</th>}<th className="text-left px-2">{kind === "policy" ? "Particulars" : "Checkpoint"}</th>
            <th className="text-left px-2 w-32 hidden md:table-cell">Owner</th><th className="text-left px-2 w-32 hidden md:table-cell">SPOC</th><th className="text-left px-2 w-28 hidden md:table-cell">Target</th><th className="text-left px-2 w-32">Status</th><th className="px-2 w-16"></th></tr></thead>
          <tbody>{shown.map(i => (
            <tr key={i.id} className="border-t hover:bg-accent/40 cursor-pointer align-top" onClick={() => setOpen(i.id)}>
              {canEdit && <td className="px-2 py-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} /></td>}
              <td className="px-2 py-2 font-mono text-xs text-primary whitespace-nowrap">{refOf(i)}</td>
              {kind === "policy" && <td className="px-2 py-2 text-xs">{i.docType}</td>}
              <td className="px-2 py-2"><div className="line-clamp-2 whitespace-pre-line">{i.checkpoint}</div>{kind === "checklist" && <div className="text-[11px] text-muted-foreground truncate">{[i.area, i.subArea].filter(Boolean).join(" › ")}</div>}
                <div className="md:hidden mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-x-2">{i.ownerName ? <span>Owner: {i.ownerName}</span> : <span className="text-orange-600">No owner</span>}{i.spocName && <span>SPOC: {i.spocName}</span>}<span className={cn(isOverdue(i) && "text-red-600 font-semibold")}>Target {fmtDate(i.targetDate)}</span></div></td>
              <td className="px-2 py-2 text-xs hidden md:table-cell">{i.ownerName || <span className="text-orange-600">—</span>}</td>
              <td className="px-2 py-2 text-xs hidden md:table-cell">{i.spocName || <span className="text-muted-foreground">—</span>}</td>
              <td className={cn("px-2 py-2 text-xs whitespace-nowrap hidden md:table-cell", isOverdue(i) && "text-red-600 font-semibold")}>{fmtDate(i.targetDate)}</td>
              <td className="px-2 py-2"><StatusBadge s={i.status} />{i.sharedAt && <div className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-0.5"><Share2 className="w-2.5 h-2.5" />shared</div>}</td>
              <td className="px-2 py-2 text-[11px] text-muted-foreground whitespace-nowrap"><DocsButton count={i.evidenceCount} load={() => apiFetch<any>(`/compliance-items/${i.id}`).then(r => r.documents)} open={d => view({ url: fileUrl(d.fileId), downloadUrl: fileUrl(d.fileId, true), name: d.fileName, title: d.title, contentType: d.contentType })} />{i.commentCount > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{i.commentCount}</span>}</td>
            </tr>))}
            {!shown.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Nothing matches the filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={list.length} size={PAGE} onPage={setPage} />
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
  async function share(shared: boolean) {
    setBusy(true);
    try {
      const r = await apiFetch<any>("/compliance-items/share", { method: "POST", body: JSON.stringify({ ids, shared }) });
      toast({ title: shared ? `${r.done} shared with the auditor` : `${r.done} withdrawn from the auditor`, description: r.skipped.length ? `${r.skipped.length} skipped — ${r.skipped.slice(0, 3).map((x: any) => `${x.ref}: ${x.reason}`).join("; ")}${r.skipped.length > 3 ? " …" : ""}` : undefined, variant: r.skipped.length && !r.done ? "destructive" : undefined });
      onDone();
    } catch (e: any) { toast({ title: "Could not share", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-[10px] border border-primary/30 bg-accent/50 px-3 py-2">
      <div className="text-sm font-semibold self-center mr-1">{ids.length} selected</div>
      <div className="w-48"><Label className="text-[11px]">Owner</Label><PersonPicker value={owner} onChange={setOwner} placeholder="Keep" /></div>
      <div className="w-48"><Label className="text-[11px]">SPOC</Label><PersonPicker value={spoc} onChange={setSpoc} placeholder="Keep" /></div>
      <div><Label className="text-[11px]">Target date</Label><Input type="date" className="h-9 w-40" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div><Label className="text-[11px]">Status</Label><Select value={status || "__keep"} onValueChange={v => setStatus(v === "__keep" ? "" : v)}><SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__keep">Keep</SelectItem>{offered(TEAM_STATUSES).map(s => <SelectItem key={s} value={s}><span className="inline-flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", DOT[statusRows().find(r => r.name === s)?.color || "slate"])} />{s}</span></SelectItem>)}</SelectContent></Select></div>
      <Button size="sm" className="h-9 gap-1.5" disabled={busy} onClick={apply}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}Apply</Button>
      <div className="w-px self-stretch bg-border mx-1" />
      <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={() => share(true)} title="Reviewed — make visible to the auditor"><Share2 className="w-4 h-4" />Share with auditor</Button>
      <Button size="sm" variant="ghost" className="h-9 gap-1.5" disabled={busy} onClick={() => share(false)}><EyeOff className="w-4 h-4" />Withdraw</Button>
    </div>
  );
}

function ItemDialog({ itemId, audit, canEdit, order, onNav, onClose }: { itemId: number; audit: any; canEdit: boolean; order: number[]; onNav: (id: number) => void; onClose: () => void }) {
  const { toast } = useToast(); const qc = useQueryClient();
  const { data: it, refetch } = useQuery<any>({ queryKey: ["compliance-item", itemId], queryFn: () => apiFetch(`/compliance-items/${itemId}`) });
  const [f, setF] = useState<any>(null); const [busy, setBusy] = useState(false); const [comment, setComment] = useState(""); const [toAuditor, setToAuditor] = useState(false); const [history, setHistory] = useState(false);
  const [record, setRecord] = useState(false); const [reason, setReason] = useState("");
  useEffect(() => { if (it && it.id === itemId && f?.__id !== itemId) { setF({ __id: itemId, ownerUserId: it.ownerUserId, spocUserId: it.spocUserId, targetDate: d10(it.targetDate), status: it.status, managementReply: it.managementReply ?? "", auditorRemarks: it.auditorRemarks ?? "", lastReviewDate: d10(it.lastReviewDate) }); setRecord(false); setReason(""); setToAuditor(false); } }, [it, itemId]); // only on open / navigation — keeps unsaved edits when evidence or comments refresh
  const dirty = it && f && (f.ownerUserId !== it.ownerUserId || f.spocUserId !== it.spocUserId || f.targetDate !== d10(it.targetDate) || f.status !== it.status || f.managementReply !== (it.managementReply ?? "") || f.auditorRemarks !== (it.auditorRemarks ?? "") || f.lastReviewDate !== d10(it.lastReviewDate));
  const auditorOwned = it && f && (f.status !== it.status && (AUDITOR_STATUSES.includes(f.status) || AUDITOR_STATUSES.includes(it.status)) || f.auditorRemarks !== (it.auditorRemarks ?? ""));
  const pos = order.indexOf(itemId);
  const refreshList = () => ["compliance-items", "compliance-audit"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  async function save(next?: number) {
    if (dirty) {
      if (auditorOwned && reason.trim().length < 5) { toast({ title: "Give the reason", description: "Recording the auditor's decision or remarks needs a reason (e.g. confirmed by auditor email).", variant: "destructive" }); return; }
      setBusy(true);
      try { await apiFetch(`/compliance-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ ...f, __id: undefined, targetDate: f.targetDate || null, lastReviewDate: f.lastReviewDate || null, managementReply: f.managementReply || null, auditorRemarks: f.auditorRemarks || null, overrideReason: auditorOwned ? reason : undefined }) }); await refetch(); toast({ title: `${refOf(it)} saved` }); refreshList(); setRecord(false); setReason(""); }
      catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); setBusy(false); return; }
      setBusy(false);
    }
    if (next) onNav(next);
  }
  async function share(shared: boolean) {
    setBusy(true);
    try { const r = await apiFetch<any>("/compliance-items/share", { method: "POST", body: JSON.stringify({ ids: [itemId], shared }) }); if (r.skipped.length) toast({ title: "Not shared", description: r.skipped[0].reason, variant: "destructive" }); else toast({ title: shared ? "Shared with the auditor" : "Withdrawn from the auditor" }); await refetch(); refreshList(); }
    catch (e: any) { toast({ title: "Could not share", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  async function post() {
    if (!comment.trim()) return;
    try { await apiFetch(`/compliance-items/${itemId}/comments`, { method: "POST", body: JSON.stringify({ body: comment, toAuditor }) }); setComment(""); refetch(); } catch (e: any) { toast({ title: "Could not post", description: e.message, variant: "destructive" }); }
  }
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const comments = (it?.comments || []).filter((c: any) => history || !c.system || c.isExternal);
  const isAuditorStatus = it && AUDITOR_STATUSES.includes(f?.status ?? it.status);
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{it ? <><span className="font-mono text-primary">{refOf(it)}</span><span className="truncate">{it.kind === "policy" ? `${it.docType}: ${it.checkpoint}` : it.subArea || it.area}</span>{f && <StatusBadge s={it.status} />}
            {it.sharedAt ? <span className="text-[11px] font-normal text-emerald-600 inline-flex items-center gap-1"><Share2 className="w-3 h-3" />shared with auditor</span> : <span className="text-[11px] font-normal text-muted-foreground inline-flex items-center gap-1"><EyeOff className="w-3 h-3" />not shared</span>}</> : "Loading…"}</DialogTitle>
          {it && <DialogDescription>{it.kind === "policy" ? "Policy & procedure register" : `${it.sheet} · ${it.area ?? ""}`}{it.sharedAt ? ` · shared by ${it.sharedBy} on ${fmtDate(it.sharedAt)}` : ""}</DialogDescription>}
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
            <div><Label>Status</Label>
              <StatusSelect disabled={!canEdit || (!record && AUDITOR_STATUSES.includes(it.status))} value={f.status} onChange={v => set("status", v)}
                options={offered(record ? STATUSES : TEAM_STATUSES.concat(AUDITOR_STATUSES.includes(it.status) ? [it.status] : []), it.status)} />
              {canEdit && !record && <button type="button" onClick={() => setRecord(true)} className="text-[11px] text-primary hover:underline mt-1 inline-flex items-center gap-1"><Gavel className="w-3 h-3" />Record auditor decision…</button>}
              {isAuditorStatus && !record && <div className="text-[11px] text-muted-foreground mt-1">Set by the auditor</div>}
            </div>
            {it.kind === "policy" && <div><Label>Last review date</Label><Input disabled={!canEdit} type="date" value={f.lastReviewDate} onChange={e => set("lastReviewDate", e.target.value)} /></div>}
          </div>
          {record && <div className="rounded-[10px] border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-1.5">
            <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">Recording on the auditor's behalf — auditor statuses and remarks are normally set by the auditor in the portal. The reason is kept in the history.</div>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason, e.g. confirmed by auditor email on 12-Nov" />
          </div>}
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Management reply</Label><Textarea disabled={!canEdit} rows={5} value={f.managementReply} onChange={e => set("managementReply", e.target.value)} placeholder="How the control works, where the evidence is, and any gap with its fix date" /></div>
            <div><Label>Auditor remarks{!record && <span className="text-[11px] font-normal text-muted-foreground"> — written by the auditor</span>}</Label><Textarea disabled={!canEdit || !record} rows={5} value={f.auditorRemarks} onChange={e => set("auditorRemarks", e.target.value)} placeholder={"Walkthrough:\n\nEvidence:"} /></div>
          </div>
          <div><div className="text-sm font-semibold mb-1.5 flex items-center gap-1.5"><Paperclip className="w-4 h-4" />Evidence ({it.documents.length}){it.sharedAt && <span className="text-[11px] font-normal text-muted-foreground">— the auditor sees the current version of each file</span>}</div>
            <EvidencePanel target={{ itemId: it.id }} companyId={audit.companyId} docs={it.documents} canEdit={canEdit} defaultCategory={it.kind === "policy" ? (it.docType === "Procedure" ? "Procedure" : "Policy") : "Evidence"} onChange={() => { refetch(); qc.invalidateQueries({ queryKey: ["compliance-items"] }); }} /></div>
          <div>
            <div className="flex items-center justify-between mb-1.5"><div className="text-sm font-semibold flex items-center gap-1.5"><MessageSquare className="w-4 h-4" />Comments</div>
              <label className="text-xs flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)} /><History className="w-3.5 h-3.5" />Show history</label></div>
            <div className="space-y-2">
              {comments.map((c: any) => <div key={c.id} className={cn("rounded-[10px] px-3 py-2 text-sm", c.system && !c.isExternal ? "bg-muted/40 text-muted-foreground text-xs" : c.isExternal ? "bg-amber-50 dark:bg-amber-500/10 border border-amber-500/30" : c.visibility === "auditor" ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-500/30" : "bg-accent/50")}>
                <div className="text-[11px] text-muted-foreground mb-0.5">{c.author}{c.isExternal ? " (auditor)" : c.visibility === "auditor" ? " → to auditor" : c.system ? "" : " · internal note"} · {fmtDateTime(c.createdAt)}</div><div className="whitespace-pre-line">{c.body}</div></div>)}
              {!comments.length && <div className="text-xs text-muted-foreground">No comments yet.</div>}
              {canEdit && <div className="space-y-1.5"><div className="flex gap-2"><Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder={toAuditor ? "Reply to the auditor…" : "Internal note (not visible to the auditor)…"} /><Button type="button" size="sm" className="self-end gap-1.5" disabled={!comment.trim()} onClick={post}><Send className="w-3.5 h-3.5" />Post</Button></div>
                <label className={cn("text-xs flex items-center gap-1.5", !it.sharedAt && "opacity-50")}><input type="checkbox" disabled={!it.sharedAt} checked={toAuditor} onChange={e => setToAuditor(e.target.checked)} />Send to the auditor{!it.sharedAt && " (share the checkpoint first)"}</label></div>}
            </div>
          </div>
        </div>}
        <div className="flex items-center gap-2 pt-3 border-t flex-wrap">
          {canEdit && <Button onClick={() => save()} disabled={busy || !dirty} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save</Button>}
          {canEdit && it && (it.sharedAt ? <Button variant="ghost" disabled={busy} onClick={() => share(false)} className="gap-1.5"><EyeOff className="w-4 h-4" />Withdraw</Button>
            : <Button variant="outline" disabled={busy || dirty || !["Submitted", ...AUDITOR_STATUSES].includes(it.status)} title={dirty ? "Save first" : it.status === "Submitted" ? "Reviewed — make it visible to the auditor" : "Set the status to Submitted first"} onClick={() => share(true)} className="gap-1.5"><Share2 className="w-4 h-4" />Share with auditor</Button>)}
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          {canEdit && it && !busy && <span className="text-[11px] text-muted-foreground max-w-[260px] leading-tight">{dirty ? "Unsaved changes — Save before sharing" : !it.sharedAt && !["Submitted", ...AUDITOR_STATUSES].includes(it.status) ? "Save lights up when you change something. Set status to Submitted and save — it is then shared with the auditor automatically." : !it.sharedAt ? "Ready to share — click Share with auditor" : "Shared — the auditor can see this checkpoint"}</span>}
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

function Schedules({ audit, canEdit, openId, onOpened }: { audit: any; canEdit: boolean; openId?: number | null; onOpened?: () => void }) {
  const { data: grids = [], isLoading } = useQuery<any[]>({ queryKey: ["compliance-grids", audit.id], queryFn: () => apiFetch(`/compliance-audits/${audit.id}/grids`) });
  const [open, setOpen] = useState<any>(null);
  React.useEffect(() => { if (openId && grids.length) { const g = grids.find(x => x.id === openId); if (g) setOpen(g); onOpened?.(); } }, [openId, grids]);
  return (
    <Card><CardContent className="p-3 space-y-2">
      <div className="text-xs text-muted-foreground">Information the auditor asks for in table form (IT environment, in-scope applications, vendor agreements, password settings, samples). Fill the cells, or upload the data as evidence.</div>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="divide-y rounded-[10px] border">{grids.map(g => {
        const filled = g.grid.reduce((n: number, r: string[], ri: number) => n + r.filter((c, ci) => c.trim() && !g.templateGrid[ri]?.[ci]).length, 0);
        return (
          <button key={g.id} type="button" onClick={() => setOpen(g)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40">
            <Table2 className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0"><div className="font-medium text-sm">{g.sheet}</div><div className="text-xs text-muted-foreground">{g.grid.length} rows · {filled} cell(s) filled · {g.ownerName || "no owner"}{g.evidenceCount ? ` · ${g.evidenceCount} file(s)` : ""}{g.sharedAt ? " · shared with auditor" : ""}</div></div>
            <StatusBadge s={g.status} />
          </button>); })}</div>
      {open && <GridDialog g={open} audit={audit} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </CardContent></Card>
  );
}

function GridDialog({ g, audit, canEdit, onClose }: { g: any; audit: any; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [grid, setGrid] = useState<string[][]>(() => g.grid.map((r: string[]) => [...r]));
  const [status, setStatus] = useState(g.status); const [owner, setOwner] = useState<number | null>(g.ownerUserId); const [busy, setBusy] = useState(false); const [shared, setShared] = useState(!!g.sharedAt);
  const { data: docs = [], refetch } = useQuery<any[]>({ queryKey: ["compliance-grid-docs", g.id], queryFn: () => apiFetch(`/compliance-grids/${g.id}/documents`) });
  const locked = (r: number, c: number) => !!g.templateGrid[r]?.[c];
  const width = Math.max(...grid.map(r => r.length), 1);
  async function save() {
    setBusy(true);
    try { await apiFetch(`/compliance-grids/${g.id}`, { method: "PATCH", body: JSON.stringify({ grid, status, ownerUserId: owner }) }); if (shared !== !!g.sharedAt) await apiFetch(`/compliance-grids/${g.id}/share`, { method: "POST", body: JSON.stringify({ shared }) }); qc.invalidateQueries({ queryKey: ["compliance-grids"] }); qc.invalidateQueries({ queryKey: ["compliance-audit"] }); toast({ title: `${g.sheet} saved` }); onClose(); }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-[1200px] max-h-[92vh] flex flex-col">
        <DialogHeader><DialogTitle>{g.sheet}</DialogTitle><DialogDescription>Shaded cells come from the auditor's template and are read-only. Fill the white cells; add rows for more entries (hover a row to delete or clear it).</DialogDescription></DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-52"><Label className="text-[11px]">Owner</Label><PersonPicker disabled={!canEdit} value={owner} onChange={setOwner} /></div>
          {canEdit && <label className="flex items-center gap-2 text-sm self-center pb-1"><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} /><Share2 className="w-4 h-4 text-emerald-600" />Shared with the auditor (read-only)</label>}
          <div><Label className="text-[11px]">Status</Label><StatusSelect disabled={!canEdit} value={status} onChange={setStatus} options={offered(STATUSES, g.status)} className="w-44" /></div>
        </div>
        <div className="flex-1 overflow-auto rounded-[10px] border">
          <GridTable grid={grid} templateGrid={g.templateGrid || []} merges={g.merges} editable={canEdit} onChange={setGrid} />
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
      <Card className="md:col-span-2"><CardContent className="p-4 space-y-2"><div className="font-semibold text-sm">Base circular & reference documents</div>
        <ReferencesPanel ownerType="audit" ownerId={a.id} canEdit={canEdit} /></CardContent></Card>
      <Card><CardContent className="p-0"><div className="px-4 py-3 font-semibold text-sm border-b flex justify-between items-center">In-scope applications{canEdit && <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onEdit}><Pencil className="w-3.5 h-3.5" />Edit</Button>}</div>
        <div className="divide-y">{apps.map((x: any, i: number) => <div key={i} className="px-4 py-2 text-sm"><div className="font-medium">{x.name}</div><div className="text-xs text-muted-foreground">{[x.category, x.hosting].filter(Boolean).join(" · ") || "—"}</div></div>)}
          {!apps.length && <div className="px-4 py-4 text-sm text-muted-foreground">None listed.</div>}</div></CardContent></Card>
      <Card><CardContent className="p-0"><div className="px-4 py-3 font-semibold text-sm border-b flex justify-between items-center">Critical vendors{canEdit && <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onEdit}><Pencil className="w-3.5 h-3.5" />Edit</Button>}</div>
        <div className="divide-y">{vendors.map((x: any, i: number) => <div key={i} className="px-4 py-2 text-sm"><div className="font-medium">{x.name}</div><div className="text-xs text-muted-foreground">{[x.role, x.system].filter(Boolean).join(" · ")}</div></div>)}
          {!vendors.length && <div className="px-4 py-4 text-sm text-muted-foreground">None listed.</div>}</div></CardContent></Card>
    </div>
  );
}
