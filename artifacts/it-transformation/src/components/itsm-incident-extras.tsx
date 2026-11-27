import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/search-select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Siren, Megaphone, PhoneCall, CheckCircle2, GitFork, Repeat, Loader2, ExternalLink } from "lucide-react";

/* 2.05 (ITH-179..182) — advanced incident pieces: priority from impact × urgency, major incident, parent / child, repeats → problem */

/** priority from the matrix in ITSM settings; null when impact or urgency is missing */
export function priorityFromMatrix(matrix: any, impact?: string | null, urgency?: string | null): string | null {
  if (!matrix || !impact || !urgency) return null;
  const row = Object.entries(matrix).find(([k]) => k.toLowerCase() === impact.toLowerCase())?.[1] as any;
  const p = row ? Object.entries(row).find(([k]) => k.toLowerCase() === urgency.toLowerCase())?.[1] : null;
  return p ? String(p) : null;
}
const P_TONE: Record<string, string> = { Critical: "bg-red-600 text-white", High: "bg-orange-500 text-white", Medium: "bg-amber-400 text-amber-950", Low: "bg-emerald-500 text-white" };
export function PriorityPreview({ value, manual }: { value?: string | null; manual?: boolean }) {
  return <div className="h-10 flex items-center gap-2 text-sm" data-testid="priority-preview">
    {value ? <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", P_TONE[value] || "bg-muted")}>{value}</span> : <span className="text-muted-foreground">—</span>}
    <span className="text-[11px] text-muted-foreground">{manual ? "set by hand" : value ? "from impact × urgency" : "choose impact and urgency"}</span>
  </div>;
}

/* ─── major incident ─── */
export function MajorIncidentPanel({ incident, onChanged }: { incident: any; onChanged?: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data, refetch } = useQuery<any>({ queryKey: ["major", incident.id], queryFn: () => apiFetch(`/incidents/${incident.id}/major`) });
  const [dlg, setDlg] = useState<null | "declare" | "update" | "end">(null); const [msg, setMsg] = useState(""); const [bridge, setBridge] = useState(""); const [busy, setBusy] = useState(false);
  if (!data) return null;
  const done = ["Resolved", "Closed"].includes(incident.status);
  if (!data.isMajor && (!data.canManage || done)) return null;
  async function send() {
    setBusy(true);
    try {
      const r: any = await apiFetch(`/incidents/${incident.id}/major`, { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ action: dlg, message: msg, ...(bridge.trim() ? { bridge } : {}) }) });
      toast({ title: dlg === "declare" ? `${r.ticketNo} is now a MAJOR incident` : dlg === "end" ? "Major incident stood down" : "Update sent", description: `${r.emailed} people emailed` });
      setDlg(null); setMsg(""); setBridge(""); refetch(); qc.invalidateQueries({ queryKey: ["incidents"] }); qc.invalidateQueries({ queryKey: ["itsm-major"] }); onChanged?.();
    } catch (e: any) { toast({ title: "Not done", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  const open = (k: "declare" | "update" | "end") => { setMsg(""); setBridge(k === "update" ? "" : data.bridge || ""); setDlg(k); };
  return (
    <div className={cn("rounded-[10px] border p-3 space-y-2", data.open ? "border-red-300 bg-red-50 dark:bg-red-500/10" : "bg-muted/20")} data-testid="major-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Siren className={cn("w-4 h-4", data.open ? "text-red-600 animate-pulse" : "text-muted-foreground")} />
        <span className={cn("text-sm font-semibold", data.open && "text-red-700 dark:text-red-300")}>{data.open ? "MAJOR INCIDENT" : data.isMajor ? `Major incident (stood down ${fmtDateTime(data.endedAt)})` : "Major incident"}</span>
        {data.open && data.bridge && <span className="inline-flex items-center gap-1 text-xs"><PhoneCall className="w-3.5 h-3.5" />{/^https?:\/\//.test(data.bridge) ? <a href={data.bridge} target="_blank" rel="noreferrer" className="underline">join bridge <ExternalLink className="inline w-3 h-3" /></a> : data.bridge}</span>}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {data.canManage && !data.open && !done && <Button size="sm" variant="outline" className="h-7 border-red-300 text-red-700 gap-1.5" onClick={() => open("declare")} data-testid="major-declare"><Siren className="w-3.5 h-3.5" />Declare major incident</Button>}
          {data.canManage && data.open && <><Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => open("update")} data-testid="major-update"><Megaphone className="w-3.5 h-3.5" />Post update</Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => open("end")}><CheckCircle2 className="w-3.5 h-3.5" />Stand down</Button></>}
        </div>
      </div>
      {data.isMajor && <div className="text-xs text-muted-foreground">Declared by {data.declaredBy} · {fmtDateTime(data.declaredAt)} — {data.reason}</div>}
      {data.updates?.length > 0 && <ol className="border-l pl-3 space-y-1.5 max-h-48 overflow-y-auto">{data.updates.map((u: any) => <li key={u.id} className="text-xs">
        <span className="text-muted-foreground">{fmtDateTime(u.at)} · {u.by} · </span><span className={cn("font-medium", u.kind === "declared" && "text-red-700", u.kind === "ended" && "text-emerald-700")}>{u.kind === "declared" ? "Declared" : u.kind === "ended" ? "Stood down" : "Update"}</span><div>{u.message}</div></li>)}</ol>}
      <Dialog open={!!dlg} onOpenChange={v => !v && setDlg(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{dlg === "declare" ? "Declare a major incident" : dlg === "end" ? "Stand down the major incident" : "Stakeholder update"}</DialogTitle>
            <DialogDescription>{dlg === "declare" ? "Severity S1 and priority Critical are set; the team, team lead, escalation levels 1 and 2 and Super Admins are emailed (ITSM Setup › Email alerts)." : "Everyone on the major incident list and the person who raised it are emailed."}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>{dlg === "declare" ? "Business impact / reason *" : dlg === "end" ? "Summary *" : "Update *"}</Label><Textarea minChars={5} rows={3} value={msg} onChange={e => setMsg(e.target.value)} placeholder={dlg === "declare" ? "Who / what is affected, since when" : dlg === "end" ? "Service restored at …; cause; next steps" : "What is happening now, next update in 30 minutes"} data-testid="major-msg" /></div>
            {dlg !== "end" && <div className="space-y-1"><Label>Bridge / war room (meeting link or phone)</Label><Input value={bridge} onChange={e => setBridge(e.target.value)} placeholder="https://teams.microsoft.com/… or dial-in number" /></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button><Button disabled={busy || msg.trim().length < 5} className={dlg === "declare" ? "bg-red-600 hover:bg-red-700 text-white" : ""} onClick={send} data-testid="major-send">{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{dlg === "declare" ? "Declare & notify" : dlg === "end" ? "Stand down & notify" : "Send update"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── parent / child ─── */
export function ParentIncidentField({ incidents, selfId, value, onChange }: { incidents: any[]; selfId?: number; value?: number | null; onChange: (v: number | null) => void }) {
  const opts = incidents.filter(i => i.id !== selfId && !i.parentIncidentId && !["Resolved", "Closed"].includes(i.status))
    .map(i => ({ value: String(i.id), label: `${i.ticketNo} — ${i.title}`, hint: `${i.status}${i.isMajor && !i.majorEndedAt ? " · MAJOR" : ""}` }));
  return <div className="sm:col-span-2 space-y-1.5" data-testid="parent-field"><Label className="flex items-center gap-1.5"><GitFork className="w-3.5 h-3.5 text-muted-foreground" />Part of a bigger incident (parent)</Label>
    <SearchSelect options={[{ value: "", label: "— Not part of another incident —" }, ...opts]} value={value ? String(value) : ""} onChange={(v: string) => onChange(v ? Number(v) : null)} placeholder="Search incident number or title" />
    <p className="text-[11px] text-muted-foreground">When the parent is resolved, this incident is resolved with it.</p></div>;
}
export function ChildIncidents({ incident, onOpen }: { incident: any; onOpen?: (id: number) => void }) {
  const { data = [] } = useQuery<any[]>({ queryKey: ["inc-children", incident.id], queryFn: () => apiFetch(`/incidents/${incident.id}/children`) });
  if (!data.length) return null;
  return <div className="rounded-[10px] border p-3 space-y-1.5" data-testid="child-incidents"><div className="text-xs font-semibold flex items-center gap-1.5"><GitFork className="w-3.5 h-3.5" />{data.length} linked child incident{data.length > 1 ? "s" : ""} — resolved together with this one</div>
    <ul className="space-y-1">{data.map(c => <li key={c.id} className="text-xs flex flex-wrap gap-2"><button type="button" className="font-mono text-primary hover:underline" onClick={() => onOpen?.(c.id)}>{c.ticketNo}</button><span className="flex-1 min-w-0 truncate">{c.title}</span><span className="text-muted-foreground">{c.status} · {c.reportedBy}</span></li>)}</ul></div>;
}

/* ─── repeat incidents → problem ─── */
export function RepeatBanner({ incident }: { incident: any }) {
  const { canAccess } = useAuth(); const { toast } = useToast(); const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  const { data } = useQuery<any>({ queryKey: ["inc-similar", incident.id], queryFn: () => apiFetch(`/incidents/${incident.id}/similar`), enabled: !incident.problemId });
  if (incident.problemId || !data || data.unlinked < 2) return null;
  const others = data.items.filter((x: any) => !x.problemId);
  async function create() {
    setBusy(true);
    try { const r: any = await apiFetch(`/incidents/${incident.id}/create-problem`, { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ incidentIds: others.map((x: any) => x.id) }) });
      toast({ title: `${r.problemNo} created`, description: `${r.linkedIncidents.length} incidents linked · with ${r.assignedGroup}` }); qc.invalidateQueries({ queryKey: ["incidents"] }); qc.invalidateQueries({ queryKey: ["problems"] }); qc.invalidateQueries({ queryKey: ["inc-similar", incident.id] }); }
    catch (e: any) { toast({ title: "Problem not created", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return <div className="rounded-[10px] border border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3 flex flex-wrap items-center gap-2 text-sm" data-testid="repeat-banner">
    <Repeat className="w-4 h-4 text-amber-700" /><span><b>{data.unlinked}</b> similar incident{data.unlinked > 1 ? "s" : ""} in the last 30 days ({others.slice(0, 3).map((x: any) => x.ticketNo).join(", ")}{others.length > 3 ? "…" : ""}) — find the root cause once.</span>
    {canAccess("itsm_problems", "write") && <Button size="sm" variant="outline" className="ml-auto h-7 gap-1.5" disabled={busy} onClick={create} data-testid="create-problem">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Repeat className="w-3.5 h-3.5" />}Create problem from these</Button>}
  </div>;
}
