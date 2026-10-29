import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Users, CalendarClock, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime } from "@/lib/date";

/*
 * Shared ITSM pieces for category-routed tickets (incidents and service requests):
 * catalog-driven Category / Sub-category, the routing preview (assignment group + expected closure date),
 * team-member assignee picker, team transfer, and listing cells (raised by, with, expected closure, time taken).
 */

export type Kind = "incident" | "request";
const TYPE: Record<Kind, string> = { incident: "Incident", request: "Service Request" };

export function useCatalog(kind: Kind) {
  return useQuery<any[]>({ queryKey: ["itsm-catalog", kind], queryFn: () => apiFetch(`/itsm-catalog?ticketType=${encodeURIComponent(TYPE[kind])}`), staleTime: 60_000 });
}
export function useMyTeams() {
  return useQuery<{ id: number; name: string }[]>({ queryKey: ["itsm-my-teams"], queryFn: () => apiFetch("/itsm-my-teams"), staleTime: 60_000 });
}
export function useTeams() {
  return useQuery<any[]>({ queryKey: ["itsm-teams"], queryFn: () => apiFetch("/itsm-teams"), staleTime: 60_000 });
}
export function useTeamMembers(teamId?: number | null) {
  return useQuery<any[]>({ queryKey: ["itsm-team-members", teamId], queryFn: () => apiFetch(`/itsm-teams/${teamId}/members`), enabled: !!teamId, staleTime: 60_000 });
}

/** Category + Sub-category selects from the catalog. */
export function CategoryFields({ kind, category, subcategory, onChange, disabled }: { kind: Kind; category?: string | null; subcategory?: string | null; onChange: (c: string | null, s: string | null) => void; disabled?: boolean }) {
  const { data: cat = [] } = useCatalog(kind);
  const cats = useMemo(() => cat.filter(r => !r.subcategory), [cat]);
  const subs = useMemo(() => cat.filter(r => r.subcategory && (r.category || "").toLowerCase() === (category || "").toLowerCase()), [cat, category]);
  return (
    <>
      <div className="space-y-1.5"><Label>Category *</Label>
        <Select disabled={disabled} value={category || ""} onValueChange={v => onChange(v, null)}>
          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
          <SelectContent>{cats.map(c => <SelectItem key={c.id} value={c.category}>{c.category}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Sub-category {subs.length > 0 && "*"}</Label>
        <Select disabled={disabled || !subs.length} value={subcategory || ""} onValueChange={v => onChange(category || null, v)}>
          <SelectTrigger><SelectValue placeholder={!category ? "Select category first" : subs.length ? "Select sub-category" : "Not needed"} /></SelectTrigger>
          <SelectContent>{subs.map(s => <SelectItem key={s.id} value={s.subcategory}>{s.subcategory}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </>
  );
}

/** Live routing preview: team (auto), expected closure (auto) and whether the user may assign. */
export function useRoute(kind: Kind, category?: string | null, subcategory?: string | null) {
  return useQuery<any>({
    queryKey: ["itsm-route", kind, category, subcategory],
    queryFn: () => apiFetch(`/itsm-route?type=${kind}&category=${encodeURIComponent(category || "")}&subcategory=${encodeURIComponent(subcategory || "")}`),
    enabled: !!category,
  });
}

export const fmtDay = (d?: string | null) => d ? `${new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { weekday: "short" })}, ${fmtDate(d)}` : "—";

export function RoutingPreview({ route, loading }: { route: any; loading?: boolean }) {
  if (loading) return <div className="col-span-2 text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Finding the team…</div>;
  if (!route) return <div className="col-span-2 rounded-[10px] border border-dashed p-3 text-xs text-muted-foreground">Choose a category — the ticket is assigned to the mapped team automatically and gets an expected closure date.</div>;
  if (!route.ok) return <div className="col-span-2 rounded-[10px] border border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{route.error}</div>;
  return (
    <div className="col-span-2 grid grid-cols-2 gap-3 rounded-[10px] border bg-muted/30 p-3">
      <div><div className="text-[11px] text-muted-foreground flex items-center gap-1"><Users className="w-3.5 h-3.5" />Assigned group (automatic)</div><div className="font-semibold text-sm">{route.team}</div></div>
      <div><div className="text-[11px] text-muted-foreground flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />Expected closure date (automatic)</div><div className="font-semibold text-sm">{fmtDay(route.expectedClosureDate)}</div>
        <div className="text-[10px] text-muted-foreground">T+{route.days} working day{route.days === 1 ? "" : "s"}{route.defaulted ? " (default)" : ""} · Sat & Sun excluded</div></div>
    </div>
  );
}

/** Assignee picker limited to members of one team. */
export function TeamMemberSelect({ teamId, value, onChange, disabled }: { teamId?: number | null; value?: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const { data: members = [], isLoading } = useTeamMembers(teamId);
  return (
    <Select disabled={disabled || !teamId} value={value || "__none__"} onValueChange={v => onChange(v === "__none__" ? null : v)}>
      <SelectTrigger><SelectValue placeholder={isLoading ? "Loading…" : "Select team member"} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— Unassigned (team queue) —</SelectItem>
        {members.map(m => <SelectItem key={m.id} value={m.name}>{m.name}{m.employeeCode ? ` · ${m.employeeCode}` : ""}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** On-behalf-of picker (service desk only). */
export function OnBehalfSelect({ value, onChange }: { value?: number | null; onChange: (id: number | null) => void }) {
  const { data: people = [] } = useQuery<any[]>({ queryKey: ["users-for-combobox"], queryFn: () => apiFetch("/itsm-people") });
  const { user } = useAuth();
  return (
    <Select value={value ? String(value) : "__me__"} onValueChange={v => onChange(v === "__me__" ? null : Number(v))}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__me__">Myself ({user?.name})</SelectItem>
        {people.filter(p => p.id !== user?.id).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} — {p.email}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/* ─── Listing cells ─────────────────────────────────────────────────────── */

export function duration(fromIso?: string | null, toIso?: string | null) {
  if (!fromIso) return "—";
  const ms = (toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime();
  const h = ms / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 24) return `${Math.round(h)}h`;
  const d = Math.floor(h / 24), rh = Math.round(h - d * 24);
  return `${d}d${rh ? ` ${rh}h` : ""}`;
}

export function RaisedByCell({ name, createdBy, at }: { name?: string | null; createdBy?: string | null; at?: string | null }) {
  const by = (createdBy || "").replace(/ <.*>$/, "");
  return (
    <div className="min-w-[120px]">
      <div className="text-sm font-medium truncate max-w-[160px]">{name || by || "—"}</div>
      <div className="text-[11px] text-muted-foreground">{at ? fmtDateTime(at) : ""}{by && name && by !== name ? ` · by ${by}` : ""}</div>
    </div>
  );
}

export function WithCell({ team, assignee }: { team?: string | null; assignee?: string | null }) {
  return (
    <div className="min-w-[120px]">
      <div className={cn("text-sm truncate max-w-[160px]", assignee ? "font-medium" : "italic text-muted-foreground")}>{assignee || "Unassigned"}</div>
      <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">{team || "—"}</div>
    </div>
  );
}

export function ClosureCell({ date, done, doneAt }: { date?: string | null; done: boolean; doneAt?: string | null }) {
  if (!date) return <span className="text-xs text-muted-foreground">—</span>;
  const today = new Date().toISOString().slice(0, 10);
  const late = done ? (doneAt ? doneAt.slice(0, 10) > date : false) : today > date;
  const dueToday = !done && today === date;
  return (
    <div className="min-w-[90px]">
      <div className={cn("text-sm whitespace-nowrap", late && "text-red-600 font-semibold", dueToday && "text-amber-600 font-semibold")}>{fmtDate(date)}</div>
      <div className={cn("text-[10px]", late ? "text-red-600" : "text-muted-foreground")}>{done ? (late ? "closed late" : "on time") : late ? "overdue" : dueToday ? "due today" : "on track"}</div>
    </div>
  );
}

export function TimeCell({ createdAt, endAt, firstResponseAt }: { createdAt?: string | null; endAt?: string | null; firstResponseAt?: string | null }) {
  return (
    <div className="min-w-[80px]">
      <div className="text-sm font-medium tabular-nums whitespace-nowrap">{duration(createdAt, endAt)}</div>
      <div className="text-[10px] text-muted-foreground whitespace-nowrap">{endAt ? "time taken" : "open for"}{firstResponseAt ? ` · 1st resp ${duration(createdAt, firstResponseAt)}` : ""}</div>
    </div>
  );
}

/** View tabs: All / Raised by me / Assigned to me / My team's queue. */
export function ViewTabs({ value, onChange, showTeam }: { value: string; onChange: (v: string) => void; showTeam: boolean }) {
  const tabs = [["", "All I can see"], ["mine", "Raised by me"], ...(showTeam ? [["assigned", "Assigned to me"], ["team", "My team's queue"]] : [])];
  return (
    <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px] flex-wrap">
      {tabs.map(([k, l]) => <button key={k} type="button" onClick={() => onChange(k)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", value === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l}</button>)}
    </div>
  );
}

/** Team transfer (team members only): pick another team and give a reason. */
export function TransferFields({ currentTeamId, teamId, reason, onChange }: { currentTeamId?: number | null; teamId?: number | null; reason?: string; onChange: (teamId: number | null, reason: string) => void }) {
  const { data: teams = [] } = useTeams();
  return (
    <div className="col-span-2 grid grid-cols-2 gap-3 rounded-[10px] border p-3">
      <div className="space-y-1.5"><Label>Pass to another team</Label>
        <Select value={teamId && teamId !== currentTeamId ? String(teamId) : "__keep__"} onValueChange={v => onChange(v === "__keep__" ? null : Number(v), reason || "")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__keep__">— Keep with current team —</SelectItem>{teams.filter(t => t.id !== currentTeamId).map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Reason {teamId && teamId !== currentTeamId ? "*" : ""}</Label><Input disabled={!teamId || teamId === currentTeamId} value={reason || ""} onChange={e => onChange(teamId ?? null, e.target.value)} placeholder="Why it goes to that team" /></div>
    </div>
  );
}
