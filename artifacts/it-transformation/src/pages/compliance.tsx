import React, { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
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
import { Download, Plus, Pencil, Loader2, Building2, FileSpreadsheet, ClipboardCheck, AlertTriangle, Upload, CheckCircle2, X, Trash2, CalendarClock, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanies, fmtDate, Progress, uploadFile, AUDIT_STATUSES, today, d10 } from "@/components/compliance-shared";
import { ReferencesPanel } from "@/components/compliance-references";

/* Audit & Compliance — audits across companies, plus companies and checklist templates. */

export default function Compliance() {
  const [tab, setTab] = useState<"audits" | "companies" | "templates">("audits");
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit & Compliance</h1>
          <p className="text-sm text-muted-foreground">Regulatory and system audits for every group company — checkpoints, evidence, owners and closure.</p>
        </div>
        <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px]">
          {([["audits", "Audits"], ["companies", "Companies"], ["templates", "Checklist templates"]] as const).map(([k, l]) =>
            <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", tab === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{l}</button>)}
        </div>
      </div>
      {tab === "audits" ? <Audits /> : tab === "companies" ? <Companies /> : <Templates />}
    </div>
  );
}

function Audits() {
  const { canAccess } = useAuth(); const canEdit = canAccess("compliance", "write");
  const { data: companies = [] } = useCompanies();
  const [company, setCompany] = useState("all");
  const { data: audits = [], isLoading } = useQuery<any[]>({ queryKey: ["compliance-audits", company], queryFn: () => apiFetch(`/compliance-audits${company !== "all" ? `?companyId=${company}` : ""}`) });
  const [add, setAdd] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={company} onValueChange={setCompany}>
          <SelectTrigger className="w-64 h-9"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All companies</SelectItem>{companies.filter(c => c.isActive).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        {canEdit && <Button size="sm" className="gap-1.5" onClick={() => setAdd(true)}><Plus className="w-4 h-4" />New audit</Button>}
      </div>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && !audits.length && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          <ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-primary" />No audits yet. Add the company and import the auditor's checklist (Companies, Checklist templates), then create the audit.
        </CardContent></Card>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {audits.map(a => {
          const pct = a.checkpoints ? Math.round((a.closed / a.checkpoints) * 100) : 0;
          return (
            <Link key={a.id} href={`/compliance/${a.id}`}>
              <Card className="cursor-pointer hover:border-primary/50 transition-colors h-full"><CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="text-xs font-mono text-primary">{a.auditNo}</div><div className="font-semibold leading-snug">{a.title}</div><div className="text-xs text-muted-foreground">{a.companyName}</div></div>
                  <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 shrink-0">{a.status}</span>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Closure</span><span className="font-semibold">{a.closed}/{a.checkpoints} · {pct}%</span></div>
                  <Progress value={pct} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-[8px] border px-2 py-1.5"><div className="text-muted-foreground">Under review</div><div className="font-semibold text-amber-600">{a.underReview}</div></div>
                  <div className="rounded-[8px] border px-2 py-1.5"><div className="text-muted-foreground flex items-center gap-1"><CalendarClock className="w-3 h-3" />Overdue</div><div className={cn("font-semibold", a.overdue && "text-red-600")}>{a.overdue}</div></div>
                  <div className="rounded-[8px] border px-2 py-1.5"><div className="text-muted-foreground flex items-center gap-1"><UserX className="w-3 h-3" />No owner</div><div className={cn("font-semibold", a.unassigned && "text-orange-600")}>{a.unassigned}</div></div>
                </div>
                <div className="text-xs text-muted-foreground flex justify-between"><span>Policies {a.policiesClosed}/{a.policies}</span><span>Target {fmtDate(a.targetDate)}</span></div>
              </CardContent></Card>
            </Link>
          );
        })}
      </div>
      {add && <AuditDialog onClose={() => setAdd(false)} />}
    </div>
  );
}

type App = { name: string; category?: string | null; hosting?: string | null; notes?: string | null };
type Vendor = { role: string; name: string; system?: string | null; notes?: string | null };

export function AuditDialog({ audit, onClose }: { audit?: any; onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast(); const [, nav] = useLocation();
  const { data: companies = [] } = useCompanies();
  const { data: templates = [] } = useQuery<any[]>({ queryKey: ["compliance-templates"], queryFn: () => apiFetch("/compliance-templates") });
  const [f, setF] = useState<any>(() => audit ? { ...audit, periodFrom: audit.periodFrom?.slice(0, 10) ?? "", periodTo: audit.periodTo?.slice(0, 10) ?? "", targetDate: audit.targetDate?.slice(0, 10) ?? "" }
    : { companyId: null, templateId: null, title: "", auditType: "", periodFrom: "", periodTo: "", auditFirm: "", auditorContact: "", targetDate: "", status: "Planning", notes: "", scope: { applications: [], vendors: [] } });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const dateErr = useMemo(() => {
    const e: Record<string, string> = {}; const from = f.periodFrom || "", to = f.periodTo || "", tg = f.targetDate || "";
    if (from && to && from > to) e.periodTo = "Must be on or after the 'from' date";
    if (tg && from && tg < from) e.targetDate = "Cannot be before the audit period starts";
    else if (tg && tg < today() && (!audit || tg !== d10(audit.targetDate))) e.targetDate = "Cannot be in the past";
    return e;
  }, [f.periodFrom, f.periodTo, f.targetDate, audit]);
  const err = (k: string) => dateErr[k] ? <div className="text-[11px] text-red-600 mt-0.5">{dateErr[k]}</div> : null;
  const apps: App[] = f.scope?.applications || []; const vendors: Vendor[] = f.scope?.vendors || [];
  const setScope = (k: "applications" | "vendors", v: any[]) => set("scope", { ...f.scope, [k]: v });
  async function save() {
    setBusy(true);
    try {
      const body = { companyId: f.companyId, templateId: f.templateId, title: f.title, auditType: f.auditType || null, periodFrom: f.periodFrom || null, periodTo: f.periodTo || null, auditFirm: f.auditFirm || null,
        auditorContact: f.auditorContact || null, targetDate: f.targetDate || null, status: f.status, notes: f.notes || null,
        scope: { applications: apps.filter(a => a.name?.trim()), vendors: vendors.filter(v => v.name?.trim() && v.role?.trim()) } };
      const r = await apiFetch<any>(audit ? `/compliance-audits/${audit.id}` : "/compliance-audits", { method: audit ? "PATCH" : "POST", body: JSON.stringify(audit ? { ...body, templateId: undefined } : body) });
      ["compliance-audits", "compliance-audit"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: audit ? "Audit updated" : `Audit ${r.auditNo} created`, description: audit ? undefined : "Checkpoints, policy register and schedules copied from the template" });
      onClose(); if (!audit) nav(`/compliance/${r.id}`);
    } catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>{audit ? `Edit ${audit.auditNo}` : "New audit"}</DialogTitle><DialogDescription>One company, one checklist template. Scope lists the in-scope applications and critical vendors.</DialogDescription></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Company *</Label>
              <Select value={f.companyId ? String(f.companyId) : ""} onValueChange={v => set("companyId", Number(v))}><SelectTrigger className="h-9"><SelectValue placeholder="Choose company" /></SelectTrigger>
                <SelectContent>{companies.filter(c => c.isActive || c.id === f.companyId).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Checklist template *</Label>
              <Select disabled={!!audit} value={f.templateId ? String(f.templateId) : ""} onValueChange={v => set("templateId", Number(v))}><SelectTrigger className="h-9"><SelectValue placeholder="Choose template" /></SelectTrigger>
                <SelectContent>{templates.filter(t => t.isActive || t.id === f.templateId).map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}{t.version ? ` (${t.version})` : ""} — {t.checkpoints} checkpoints</SelectItem>)}</SelectContent></Select></div>
            <div className="md:col-span-2"><Label>Title *</Label><Input value={f.title} onChange={e => set("title", e.target.value)} placeholder="e.g. SEBI System Audit — MF licence (pre-inspection)" /></div>
            <div><Label>Audit type</Label><Input value={f.auditType ?? ""} onChange={e => set("auditType", e.target.value)} placeholder="e.g. SEBI System Audit" /></div>
            <div><Label>Status</Label><Select value={f.status} onValueChange={v => set("status", v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{AUDIT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Audit period from</Label><Input type="date" value={f.periodFrom ?? ""} onChange={e => set("periodFrom", e.target.value)} /></div>
            <div><Label>Audit period to</Label><Input type="date" min={f.periodFrom || undefined} value={f.periodTo ?? ""} onChange={e => set("periodTo", e.target.value)} className={cn(dateErr.periodTo && "border-red-500")} />{err("periodTo")}</div>
            <div><Label>Audit firm</Label><Input value={f.auditFirm ?? ""} onChange={e => set("auditFirm", e.target.value)} /></div>
            <div><Label>Target closure date</Label><Input type="date" min={[f.periodFrom || "", audit ? "" : today()].sort().pop() || undefined} value={f.targetDate ?? ""} onChange={e => set("targetDate", e.target.value)} className={cn(dateErr.targetDate && "border-red-500")} />{err("targetDate")}<div className="text-[11px] text-muted-foreground mt-0.5">{audit ? "Changing it here does not move checkpoint dates" : "Also set as each checkpoint's target date"}</div></div>
            <div className="md:col-span-2"><Label>Auditor contact</Label><Input value={f.auditorContact ?? ""} onChange={e => set("auditorContact", e.target.value)} placeholder="Name, email, phone" /></div>
          </div>
          <ScopeTable title="In-scope applications" cols={[["name", "Application *"], ["category", "Category (Front / Back office …)"], ["hosting", "Hosting"]]} rows={apps} onChange={v => setScope("applications", v)} blank={{ name: "", category: "", hosting: "" }} />
          <ScopeTable title="Critical vendors" cols={[["role", "Role * (FA, Custodian, RTA …)"], ["name", "Vendor *"], ["system", "System / service"]]} rows={vendors} onChange={v => setScope("vendors", v)} blank={{ role: "", name: "", system: "" }} />
          <div><Label>Notes</Label><Textarea rows={2} value={f.notes ?? ""} onChange={e => set("notes", e.target.value)} /></div>
        </div>
        <div className="flex gap-2 pt-3 border-t">
          <Button onClick={save} disabled={busy || !f.companyId || !f.templateId || f.title.trim().length < 3 || Object.keys(dateErr).length > 0} className="gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{audit ? "Save" : "Create audit"}</Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          {!audit && (!f.companyId || !f.templateId || f.title.trim().length < 3) && <span className="text-[11px] text-muted-foreground self-center">Company, template and title (3+ characters) are required</span>}
          {Object.keys(dateErr).length > 0 && <span className="text-[11px] text-red-600 self-center">Fix the dates above</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScopeTable({ title, cols, rows, onChange, blank }: { title: string; cols: [string, string][]; rows: any[]; onChange: (v: any[]) => void; blank: any }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between"><Label>{title}</Label><Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onChange([...rows, { ...blank }])}><Plus className="w-3.5 h-3.5" />Add</Button></div>
      {!rows.length && <div className="text-xs text-muted-foreground">None added.</div>}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
          {cols.map(([k, ph]) => <Input key={k} className="h-8 text-xs" placeholder={ph} value={r[k] ?? ""} onChange={e => onChange(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />)}
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
        </div>
      ))}
    </div>
  );
}

function Companies() {
  const { canAccess } = useAuth(); const canEdit = canAccess("compliance", "write");
  const { data: companies = [], isLoading } = useCompanies();
  const [edit, setEdit] = useState<any>(null);
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex items-center justify-between"><div className="text-sm text-muted-foreground">Each audit belongs to one company. Library documents can be company-specific or group-wide.</div>
        {canEdit && <Button size="sm" className="gap-1.5" onClick={() => setEdit({ name: "", shortName: "", businessLine: "", regulator: "", registrationNo: "", address: "" })}><Plus className="w-4 h-4" />New company</Button>}</div>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="divide-y rounded-[10px] border">
        {companies.map(c => (
          <div key={c.id} className={cn("flex items-center gap-3 px-3 py-2.5", !c.isActive && "opacity-50")}>
            <Building2 className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0"><div className="font-medium text-sm">{c.name}{c.shortName ? <span className="text-muted-foreground font-normal"> · {c.shortName}</span> : null}</div>
              <div className="text-xs text-muted-foreground">{[c.businessLine, c.regulator, c.registrationNo].filter(Boolean).join(" · ") || "—"}{!c.isActive && " · inactive"}</div></div>
            <div className="text-xs text-muted-foreground">{c.audits} audit(s)</div>
            {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>}
          </div>
        ))}
        {!isLoading && !companies.length && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No companies yet.</div>}
      </div>
      {edit && <CompanyDialog c={edit} onClose={() => setEdit(null)} />}
    </CardContent></Card>
  );
}

const BUSINESS_LINES = ["Stock Broking", "Depository Participant", "Mutual Fund / AMC", "AIF", "PMS", "Investment Banking", "Research Analyst", "Investment Adviser", "NBFC", "Insurance Broking"];
const REGULATORS = ["SEBI", "RBI", "IRDAI", "PFRDA", "NSE", "BSE", "MCX", "NSDL", "CDSL", "AMFI"];
/** Multi-pick as toggle chips; stored as comma-separated text. Values not in the list are kept as extra chips. */
function Chips({ options, value, onChange }: { options: string[]; value?: string | null; onChange: (v: string | null) => void }) {
  const cur = String(value ?? "").split(",").map(x => x.trim()).filter(Boolean);
  const all = [...options, ...cur.filter(c => !options.includes(c))];
  const toggle = (o: string) => { const n = cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o]; onChange(n.length ? all.filter(x => n.includes(x)).join(", ") : null); };
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {all.map(o => <button key={o} type="button" onClick={() => toggle(o)} className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", cur.includes(o) ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent text-muted-foreground")}>{o}</button>)}
    </div>
  );
}

function CompanyDialog({ c, onClose }: { c: any; onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [f, setF] = useState<any>({ ...c }); const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function save() {
    setBusy(true);
    try {
      const body = { name: f.name, shortName: f.shortName || null, businessLine: f.businessLine || null, regulator: f.regulator || null, registrationNo: f.registrationNo || null, address: f.address || null, ...(c.id ? { isActive: f.isActive } : {}) };
      await apiFetch(c.id ? `/compliance-companies/${c.id}` : "/compliance-companies", { method: c.id ? "PATCH" : "POST", body: JSON.stringify(body) });
      qc.invalidateQueries({ queryKey: ["compliance-companies"] }); toast({ title: "Saved" }); onClose();
    } catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>{c.id ? "Edit company" : "New company"}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Legal name *</Label><Input value={f.name} onChange={e => set("name", e.target.value)} /></div>
          <div><Label>Short name</Label><Input value={f.shortName ?? ""} onChange={e => set("shortName", e.target.value)} /></div>
          <div><Label>Registration no.</Label><Input value={f.registrationNo ?? ""} onChange={e => set("registrationNo", e.target.value)} placeholder="e.g. SEBI / CIN number" /></div>
          <div className="col-span-2"><Label>Business lines</Label><Chips options={BUSINESS_LINES} value={f.businessLine} onChange={v => set("businessLine", v)} /></div>
          <div className="col-span-2"><Label>Regulators</Label><Chips options={REGULATORS} value={f.regulator} onChange={v => set("regulator", v)} /></div>
          <div className="col-span-2"><Label>Address</Label><Textarea rows={2} value={f.address ?? ""} onChange={e => set("address", e.target.value)} /></div>
          {c.id && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.isActive} onChange={e => set("isActive", e.target.checked)} />Active</label>}
        </div>
        <div className="flex gap-2 pt-3 border-t"><Button onClick={save} disabled={busy || (f.name || "").trim().length < 2} className="gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save</Button><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function Templates() {
  const { canAccess } = useAuth(); const canEdit = canAccess("compliance", "write");
  const { data: templates = [], isLoading } = useQuery<any[]>({ queryKey: ["compliance-templates"], queryFn: () => apiFetch("/compliance-templates") });
  const [imp, setImp] = useState(false); const [refs, setRefs] = useState<any>(null);
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3"><div className="text-sm text-muted-foreground">Import the auditor's checklist workbook once; every audit created from it gets its own copy to fill.</div>
        {canEdit && <Button size="sm" className="gap-1.5" onClick={() => setImp(true)}><Upload className="w-4 h-4" />Import Excel checklist</Button>}</div>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="divide-y rounded-[10px] border">
        {templates.map(t => (
          <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
            <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0"><div className="font-medium text-sm">{t.name}{t.version ? <span className="text-muted-foreground font-normal"> · {t.version}</span> : null}</div>
              <div className="text-xs text-muted-foreground">{t.framework || "—"} · {t.checkpoints} checkpoints · {t.policies} policies · {t.grids} schedules · from {t.sourceFile || "file"}</div></div>
            <div className="text-xs text-muted-foreground">{t.audits} audit(s)</div>
            {t.sourceObject && <a href={`${API}/compliance-templates/${t.id}/source`} title={`Download the uploaded file ${t.sourceFile || ""}`}><Button size="sm" variant="outline" className="h-7 text-xs gap-1"><Download className="w-3.5 h-3.5" />Uploaded file</Button></a>}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRefs(t)}>Circular & references</Button>
          </div>
        ))}
        {!isLoading && !templates.length && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No templates yet.</div>}
      </div>
      {imp && <ImportDialog onClose={() => setImp(false)} />}
      {refs && <Dialog open onOpenChange={o => { if (!o) setRefs(null); }}><DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>{refs.name} — circular & references</DialogTitle><DialogDescription>Documents here appear in every audit created from this template (e.g. the SEBI base circular).</DialogDescription></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1"><ReferencesPanel ownerType="template" ownerId={refs.id} canEdit={canEdit} /></div>
      </DialogContent></Dialog>}
    </CardContent></Card>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast(); const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<any>(null); const [res, setRes] = useState<any>(null); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", framework: "", version: "", description: "" });
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const x = e.target.files?.[0]; if (!x) return;
    setBusy(true); setRes(null);
    try {
      const up = await uploadFile(x); setFile(up);
      setRes(await apiFetch("/compliance-templates/import", { method: "POST", body: JSON.stringify({ objectPath: up.objectPath, fileName: up.fileName, dryRun: true }) }));
      if (!f.name) setF(p => ({ ...p, name: x.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s*\d{8}$/, "") }));
    } catch (err: any) { toast({ title: "Could not read file", description: err.message, variant: "destructive" }); setFile(null); if (ref.current) ref.current.value = ""; }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    try {
      await apiFetch("/compliance-templates/import", { method: "POST", body: JSON.stringify({ objectPath: file.objectPath, fileName: file.fileName, ...f, dryRun: false }) });
      qc.invalidateQueries({ queryKey: ["compliance-templates"] }); toast({ title: "Template imported" }); onClose();
    } catch (e: any) { toast({ title: "Import failed", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>Import checklist template</DialogTitle><DialogDescription>Upload the auditor's Excel. Checklist sheets need an "Audit Checklist" column; a sheet with "Type" and "Particulars" becomes the policy register; other sheets become editable schedules.</DialogDescription></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="w-full rounded-[12px] border-2 border-dashed border-border hover:border-primary/60 hover:bg-accent/40 transition-colors px-4 py-6 text-center disabled:opacity-60">
            {busy && !res ? <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" /> : <Upload className="w-6 h-6 mx-auto text-primary" />}
            <div className="mt-2 text-sm font-semibold">{file?.fileName || "Choose the checklist workbook (.xlsx)"}</div>
            <div className="text-xs text-muted-foreground">Checked first — nothing is saved until you confirm</div>
          </button>
          {res && (<>
            <div className="flex items-start gap-2 rounded-[10px] border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{res.checkpoints} checkpoints in {res.areas.length} areas · {res.policies} policy / procedure lines · {res.grids.length} schedules ({res.grids.join(", ")}){res.skipped.length ? ` · skipped: ${res.skipped.join(", ")}` : ""}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Template name *</Label><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. SEBI MF System Audit" />{f.name.trim().length < 3 && <div className="text-[11px] text-amber-600 mt-0.5">At least 3 characters</div>}</div>
              <div><Label>Framework</Label><Input value={f.framework} onChange={e => setF({ ...f, framework: e.target.value })} placeholder="e.g. SEBI MF System Audit" /></div>
              <div><Label>Version</Label><Input value={f.version} onChange={e => setF({ ...f, version: e.target.value })} placeholder="e.g. 2026" /></div>
              <div className="col-span-2"><Label>Description</Label><Textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
            </div>
          </>)}
          {!res && file && !busy && <div className="flex items-center gap-2 text-sm text-red-600"><AlertTriangle className="w-4 h-4" />File not recognised.</div>}
        </div>
        <div className="flex gap-2 pt-3 border-t">
          <Button onClick={save} disabled={busy || !res || f.name.trim().length < 3} className="gap-1.5">{busy && res ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Import template</Button>
          <Button variant="outline" onClick={onClose} disabled={busy}><X className="w-4 h-4" />Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
