import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { Users, Plus, Pencil, Save, Loader2, Trash2, FolderTree, Info, Crown, Upload, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { CatalogUploadDialog, downloadCatalogSheet } from "@/components/itsm-catalog-upload";

/* ITSM Setup — assignment groups (teams + members + lead) and the category / sub-category catalog that routes tickets. */

export default function ItsmSetup() {
  const [tab, setTab] = useState<"teams" | "catalog">("catalog");
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ITSM Setup</h1>
          <p className="text-sm text-muted-foreground">Teams (assignment groups) and the categories that route incidents and service requests to them, with the expected closure days.</p>
        </div>
        <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px]">
          {([["catalog", "Categories & routing"], ["teams", "Teams & members"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", tab === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{l}</button>)}
        </div>
      </div>
      {tab === "teams" ? <Teams /> : <Catalog />}
    </div>
  );
}

const usePeople = () => useQuery<any[]>({ queryKey: ["users-for-combobox"], queryFn: () => apiFetch("/itsm-people") });

function Teams() {
  const qc = useQueryClient(); const { toast } = useToast(); const { canAccess } = useAuth(); const canEdit = canAccess("itsm_setup", "write");
  const { data: teams = [], isLoading } = useQuery<any[]>({ queryKey: ["itsm-teams", "all"], queryFn: () => apiFetch("/itsm-teams?all=1") });
  const [edit, setEdit] = useState<any>(null); const [members, setMembers] = useState<any>(null);
  const refresh = () => ["itsm-teams", "itsm-catalog", "itsm-my-teams", "itsm-team-members"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  async function toggle(t: any) {
    if (!await confirmDialog(`${t.isActive ? "Deactivate" : "Reactivate"} ${t.name}?`, { title: t.isActive ? "Deactivate team" : "Reactivate team", confirmText: t.isActive ? "Deactivate" : "Reactivate", destructive: t.isActive })) return;
    try { await apiFetch(`/itsm-teams/${t.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !t.isActive }) }); refresh(); toast({ title: `${t.name} ${t.isActive ? "deactivated" : "reactivated"}` }); }
    catch (e: any) { toast({ title: "Not changed", description: e.message, variant: "destructive" }); }
  }
  return (
    <>
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-3xl">Only members of a ticket's team can assign it to a person, change its status or pass it to another team. Members see the team queue and are emailed about new tickets. The lead is always a member.</p>
        {canEdit && <Button size="sm" className="gap-1.5" onClick={() => setEdit({ name: "", description: "", email: "", leadUserId: null })}><Plus className="w-4 h-4" />New team</Button>}
      </div>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {teams.map(t => (
          <Card key={t.id} className={cn(!t.isActive && "opacity-60")}><CardContent className="p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-semibold flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" />{t.name}{!t.isActive && <span className="text-[10px] px-1.5 rounded bg-muted">inactive</span>}</div>
                <div className="text-xs text-muted-foreground">{t.description || "—"}{t.email ? ` · ${t.email}` : ""}</div></div>
              {canEdit && <div className="flex gap-1"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggle(t)} title={t.isActive ? "Deactivate" : "Reactivate"}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></div>}
            </div>
            <div className="flex flex-wrap gap-1">
              {t.members.length ? t.members.map((m: any) => <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px]">{m.id === t.leadUserId && <Crown className="w-3 h-3 text-amber-500" />}{m.name}</span>) : <span className="text-xs text-amber-700 dark:text-amber-300">No members — tickets for this team cannot be assigned</span>}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t.openTickets} open ticket{t.openTickets === 1 ? "" : "s"} · {t.categoriesMapped} categor{t.categoriesMapped === 1 ? "y" : "ies"} mapped</span>
              {canEdit && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMembers(t)}>Members</Button>}
            </div>
          </CardContent></Card>
        ))}
      </div>
      {edit && <TeamDialog team={edit} onClose={() => setEdit(null)} onDone={refresh} />}
      {members && <MembersDialog team={members} onClose={() => setMembers(null)} onDone={refresh} />}
    </>
  );
}

function TeamDialog({ team, onClose, onDone }: { team: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast(); const { data: people = [] } = usePeople();
  const [f, setF] = useState<any>({ name: team.name || "", description: team.description || "", email: team.email || "", leadUserId: team.leadUserId ?? null }); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await apiFetch(team.id ? `/itsm-teams/${team.id}` : "/itsm-teams", { method: team.id ? "PATCH" : "POST", body: JSON.stringify(f) }); toast({ title: team.id ? "Team saved" : "Team created" }); onDone(); onClose(); }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{team.id ? `Edit ${team.name}` : "New team"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label>Name *</Label><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Desktop Support" /></div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Team mailbox (optional)</Label><Input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="desktop.support@company.com" /></div>
          <div className="space-y-1.5"><Label>Team lead</Label>
            <Select value={f.leadUserId ? String(f.leadUserId) : "__none__"} onValueChange={v => setF({ ...f, leadUserId: v === "__none__" ? null : Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">— No lead —</SelectItem>{people.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} — {p.email}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy || f.name.trim().length < 2} className="gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembersDialog({ team, onClose, onDone }: { team: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast(); const { data: people = [] } = usePeople();
  const [ids, setIds] = useState<number[]>(team.members.map((m: any) => m.id)); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const list = people.filter(p => !q || `${p.name} ${p.email} ${p.employeeCode || ""}`.toLowerCase().includes(q.toLowerCase()));
  async function save() {
    setBusy(true);
    try { await apiFetch(`/itsm-teams/${team.id}/members`, { method: "PUT", body: JSON.stringify({ userIds: ids }) }); toast({ title: `${team.name}: ${ids.length} member(s)` }); onDone(); onClose(); }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{team.name} — members</DialogTitle><DialogDescription>{ids.length} selected. Members can assign, work and pass on this team's tickets.</DialogDescription></DialogHeader>
        <Input placeholder="Search people…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="max-h-[45vh] overflow-y-auto rounded-[10px] border divide-y">
          {list.map(p => { const on = ids.includes(p.id); const lead = p.id === team.leadUserId; return (
            <label key={p.id} className={cn("flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40", lead && "opacity-80")}>
              <input type="checkbox" checked={on || lead} disabled={lead} onChange={() => setIds(x => on ? x.filter(i => i !== p.id) : [...x, p.id])} />
              <span className="flex-1">{p.name}{lead && <span className="ml-1 text-[10px] text-amber-600">lead</span>}<span className="block text-[11px] text-muted-foreground">{p.email}{p.employeeCode ? ` · ${p.employeeCode}` : ""}</span></span>
            </label>); })}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save members</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Catalog() {
  const qc = useQueryClient(); const { toast } = useToast(); const { canAccess } = useAuth(); const canEdit = canAccess("itsm_setup", "write");
  const [type, setType] = useState<"Service Request" | "Incident">("Service Request");
  const { data: rows = [], isLoading } = useQuery<any[]>({ queryKey: ["itsm-catalog", "setup", type], queryFn: () => apiFetch(`/itsm-catalog?ticketType=${encodeURIComponent(type)}`) });
  const { data: teams = [] } = useQuery<any[]>({ queryKey: ["itsm-teams"], queryFn: () => apiFetch("/itsm-teams") });
  const [draft, setDraft] = useState<Record<number, any>>({}); const [busy, setBusy] = useState<number | null>(null); const [add, setAdd] = useState<any>(null); const [upload, setUpload] = useState(false);
  useEffect(() => { setDraft(Object.fromEntries(rows.map(r => [r.id, { teamId: r.teamId ?? null, resolutionDays: r.resolutionDays ?? "" }]))); }, [rows]);
  const groups = useMemo(() => rows.filter(r => !r.subcategory).map(c => ({ cat: c, subs: rows.filter(r => r.subcategory && r.category.toLowerCase() === c.category.toLowerCase()) })), [rows]);
  const refresh = () => ["itsm-catalog", "itsm-teams", "itsm-route"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const dirty = (r: any) => { const d = draft[r.id]; return d && ((d.teamId ?? null) !== (r.teamId ?? null) || String(d.resolutionDays ?? "") !== String(r.resolutionDays ?? "")); };
  async function save(r: any) {
    const d = draft[r.id]; setBusy(r.id);
    try { await apiFetch(`/itsm-catalog/${r.id}`, { method: "PATCH", body: JSON.stringify({ teamId: d.teamId, resolutionDays: d.resolutionDays === "" ? null : Number(d.resolutionDays) }) }); refresh(); toast({ title: `${r.category}${r.subcategory ? ` › ${r.subcategory}` : ""} saved`, description: "Applies to new tickets" }); }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  async function remove(r: any) {
    if (!await confirmDialog(`Remove ${r.category}${r.subcategory ? ` › ${r.subcategory}` : " and all its sub-categories"} from the ${type} catalog? Existing tickets keep their category.`, { title: "Remove category", confirmText: "Remove", destructive: true })) return;
    try { await apiFetch(`/itsm-catalog/${r.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) }); refresh(); toast({ title: "Removed" }); }
    catch (e: any) { toast({ title: "Could not remove", description: e.message, variant: "destructive" }); }
  }
  const set = (id: number, k: string, v: any) => setDraft(p => ({ ...p, [id]: { ...p[id], [k]: v } }));
  const renderRow = (r: any, sub?: boolean) => { const d = draft[r.id] || {}; return (
    <div key={r.id} className={cn("grid grid-cols-12 gap-2 items-center px-3 py-2", sub ? "bg-background" : "bg-muted/40 font-medium")}>
      <div className={cn("col-span-12 md:col-span-4 text-sm", sub && "pl-6 text-muted-foreground")}>{sub ? `› ${r.subcategory}` : r.category}</div>
      <div className="col-span-7 md:col-span-4">
        <Select disabled={!canEdit} value={d.teamId ? String(d.teamId) : "__inherit__"} onValueChange={v => set(r.id, "teamId", v === "__inherit__" ? null : Number(v))}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{sub && <SelectItem value="__inherit__">Same as category ({r.effectiveTeam || "—"})</SelectItem>}{!sub && !d.teamId && <SelectItem value="__inherit__">— choose team —</SelectItem>}{teams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="col-span-3 md:col-span-2"><Input disabled={!canEdit} type="number" min={0} className="h-8 text-xs" value={d.resolutionDays ?? ""} onChange={e => set(r.id, "resolutionDays", e.target.value)} placeholder={sub ? `${r.effectiveDays}` : "2 (default)"} /></div>
      <div className="col-span-2 md:col-span-2 flex justify-end gap-1">
        {canEdit && <Button size="sm" variant={dirty(r) ? "default" : "ghost"} disabled={!dirty(r) || busy === r.id} className={cn("h-8 px-2", !dirty(r) && "opacity-40")} onClick={() => save(r)}>{busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}</Button>}
        {canEdit && !sub && <Button size="sm" variant="ghost" className="h-8 px-2" title="Add sub-category" onClick={() => setAdd({ ticketType: type, category: r.category, subcategory: "" })}><Plus className="w-3.5 h-3.5" /></Button>}
        {canEdit && <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => remove(r)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>}
      </div>
    </div>); };
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px]">{(["Service Request", "Incident"] as const).map(t => <button key={t} onClick={() => setType(t)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", type === t ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{t}</button>)}</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={async () => { try { const n = await downloadCatalogSheet(); toast({ title: `${n} rows downloaded` }); } catch (e: any) { toast({ title: "Download failed", description: e.message, variant: "destructive" }); } }}><Download className="w-4 h-4" />Download Excel</Button>
          {canEdit && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setUpload(true)}><Upload className="w-4 h-4" />Upload Excel</Button>}
          {canEdit && <Button size="sm" className="gap-1.5" onClick={() => setAdd({ ticketType: type, category: "", subcategory: null, teamId: null, resolutionDays: "" })}><Plus className="w-4 h-4" />New category</Button>}
        </div>
      </div>
      <div className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />A new ticket goes to the team mapped to its sub-category (or its category). Expected closure date = raised date + the working days set here (Saturday and Sunday skipped); blank days = T+2. Changes apply to new tickets.</div>
      <div className="grid grid-cols-12 gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><div className="col-span-12 md:col-span-4">Category › Sub-category</div><div className="col-span-7 md:col-span-4">Assigned group</div><div className="col-span-3 md:col-span-2">Days to close</div></div>
      {isLoading && <div className="text-sm text-muted-foreground px-3">Loading…</div>}
      <div className="space-y-2">{groups.map(g => <div key={g.cat.id} className="rounded-[10px] border overflow-hidden divide-y">{renderRow(g.cat)}{g.subs.map(sr => renderRow(sr, true))}</div>)}</div>
      <CatalogUploadDialog open={upload} onClose={() => setUpload(false)} />
      {add && <AddCatalog init={add} teams={teams} onClose={() => setAdd(null)} onDone={refresh} />}
    </CardContent></Card>
  );
}

function AddCatalog({ init, teams, onClose, onDone }: { init: any; teams: any[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast(); const [f, setF] = useState<any>(init); const [busy, setBusy] = useState(false);
  const isSub = init.subcategory !== null && init.subcategory !== undefined;
  async function save() {
    setBusy(true);
    try { await apiFetch("/itsm-catalog", { method: "POST", body: JSON.stringify({ ...f, subcategory: isSub ? f.subcategory : null, resolutionDays: f.resolutionDays === "" || f.resolutionDays == null ? null : Number(f.resolutionDays) }) }); toast({ title: "Added" }); onDone(); onClose(); }
    catch (e: any) { toast({ title: "Could not add", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FolderTree className="w-4 h-4" />{isSub ? `New sub-category of ${init.category}` : `New ${init.ticketType} category`}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          {!isSub && <div className="space-y-1.5"><Label>Category *</Label><Input value={f.category} onChange={e => setF({ ...f, category: e.target.value })} /></div>}
          {isSub && <div className="space-y-1.5"><Label>Sub-category *</Label><Input value={f.subcategory} onChange={e => setF({ ...f, subcategory: e.target.value })} /></div>}
          <div className="space-y-1.5"><Label>Assigned group {isSub ? "(blank = same as category)" : "*"}</Label>
            <Select value={f.teamId ? String(f.teamId) : "__none__"} onValueChange={v => setF({ ...f, teamId: v === "__none__" ? null : Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">{isSub ? "Same as category" : "— choose team —"}</SelectItem>{teams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Working days to close</Label><Input type="number" min={0} value={f.resolutionDays ?? ""} onChange={e => setF({ ...f, resolutionDays: e.target.value })} placeholder={isSub ? "blank = same as category" : "blank = T+2"} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy || (isSub ? !f.subcategory?.trim() : !f.category?.trim() || !f.teamId)} className="gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
