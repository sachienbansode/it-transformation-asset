import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { confirmHeader } from "@/components/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Star, Link2, X, Flame, Users, TrendingUp, Smile, Workflow, Briefcase, Download, Loader2, Plus } from "lucide-react";

/* ITH-110 — ITSM enterprise pack (UI): CSAT, related records, major incident banner, dashboard insights, ?open=<id>. */
type Kind = "incident" | "request" | "problem" | "change";

/** Open the ticket named in ?open=<id> once the list has loaded. */
export function useOpenFromUrl(list: any[], open: (t: any) => void) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (done || !list?.length) return;
    const id = Number(new URLSearchParams(window.location.search).get("open")); if (!id) { setDone(true); return; }
    const t = list.find(x => x.id === id); if (t) { open(t); setDone(true); }
  }, [list, done]);
}

/* ── CSAT ── */
export function CsatPanel({ kind, id }: { kind: Kind; id: number }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data, refetch } = useQuery({ queryKey: ["csat", kind, id], enabled: kind === "incident" || kind === "request", queryFn: () => apiFetch<any>(`/itsm-csat/${kind}/${id}`) });
  const [stars, setStars] = useState(0); const [hover, setHover] = useState(0); const [comment, setComment] = useState(""); const [busy, setBusy] = useState(false);
  if (!data || (!data.rating && !data.canRate)) return null;
  if (data.rating) return (
    <div className="rounded-lg border px-3 py-2 text-sm flex items-center gap-2 flex-wrap" data-testid="csat-done"><Smile className="w-4 h-4 text-emerald-600" />Customer satisfaction:
      <span className="flex">{[1, 2, 3, 4, 5].map(s => <Star key={s} className={cn("w-4 h-4", s <= data.rating.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />)}</span>
      <span className="text-xs text-muted-foreground">{data.rating.by} · {fmtDateTime(data.rating.at)}</span>{data.rating.comment && <div className="w-full text-xs italic">“{data.rating.comment}”</div>}</div>);
  async function send() {
    setBusy(true);
    try { await apiFetch(`/itsm-csat/${kind}/${id}`, { method: "POST", body: JSON.stringify({ rating: stars, comment }), headers: confirmHeader(`Rate this ${kind === "incident" ? "incident" : "request"} ${stars} out of 5${comment.trim() ? ` with the comment “${comment.trim().slice(0, 120)}”` : ""}?`) });
      toast({ title: "Thank you for your feedback" }); refetch(); qc.invalidateQueries({ queryKey: ["itsm-insights"] }); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Not saved", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2" data-testid="csat-ask">
      <div className="text-sm font-semibold">How did we do?</div>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>{[1, 2, 3, 4, 5].map(s => <button key={s} type="button" aria-label={`${s} stars`} onMouseEnter={() => setHover(s)} onClick={() => setStars(s)}>
        <Star className={cn("w-7 h-7", s <= (hover || stars) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} /></button>)}
        <span className="text-xs text-muted-foreground self-center ml-2">{["", "Very poor", "Poor", "OK", "Good", "Excellent"][hover || stars]}</span></div>
      {stars > 0 && <Textarea rows={2} className="text-sm" value={comment} onChange={e => setComment(e.target.value)} placeholder={stars <= 2 ? "What went wrong? (needed)" : "Anything to add? (optional)"} />}
      <Button size="sm" disabled={!stars || busy || (stars <= 2 && !comment.trim())} onClick={send}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Send rating</Button>
    </div>
  );
}

/* ── related records ── */
export function RelatedRecords({ kind, id }: { kind: Kind; id: number }) {
  const qc = useQueryClient(); const { toast } = useToast(); const [no, setNo] = useState(""); const [rel, setRel] = useState("related"); const [adding, setAdding] = useState(false);
  const { data, refetch } = useQuery({ queryKey: ["itsm-links", kind, id], queryFn: () => apiFetch<any>(`/itsm-links/${kind}/${id}`) });
  if (!data) return null;
  async function add() {
    try { const r = await apiFetch<any>(`/itsm-links/${kind}/${id}`, { method: "POST", body: JSON.stringify({ number: no, relation: rel }), headers: confirmHeader(`Link this record to ${no.trim().toUpperCase()} (${rel})?`) });
      toast({ title: `Linked to ${r.linked}` }); setNo(""); setAdding(false); refetch(); qc.invalidateQueries({ queryKey: ["itsm-links"] }); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Not linked", description: e.message, variant: "destructive" }); }
  }
  async function remove(l: any) {
    try { await apiFetch(`/itsm-links/${l.linkId}`, { method: "DELETE", headers: confirmHeader(`Unlink ${l.no} (${l.title}) from this record?`) }); refetch(); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Not unlinked", description: e.message, variant: "destructive" }); }
  }
  if (!data.links.length && !data.canEdit) return null;
  return (
    <div className="rounded-lg border p-3 space-y-2" data-testid="related-records">
      <div className="flex items-center gap-2 text-sm font-semibold"><Link2 className="w-4 h-4 text-primary" />Related records <span className="text-xs font-normal text-muted-foreground">({data.links.length})</span>
        {data.canEdit && !adding && <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setAdding(true)}><Plus className="w-3.5 h-3.5 mr-1" />Link</Button>}</div>
      {adding && <div className="flex gap-2 flex-wrap"><Input className="h-8 w-40 text-xs" placeholder="e.g. PRB-00004" value={no} onChange={e => setNo(e.target.value)} />
        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={rel} onChange={e => setRel(e.target.value)}>{["related", "caused by", "duplicate of", "fixed by change", "parent of", "child of"].map(r => <option key={r}>{r}</option>)}</select>
        <Button size="sm" className="h-8" disabled={!no.trim()} onClick={add}>Link</Button><Button size="sm" variant="ghost" className="h-8" onClick={() => setAdding(false)}>Cancel</Button></div>}
      {data.links.length > 0 && <div className="divide-y text-xs">{data.links.map((l: any) => (
        <div key={`${l.type}${l.id}`} className="flex items-center gap-2 py-1.5"><span className="rounded border px-1.5 text-[10px]">{l.typeLabel}</span>
          <a href={l.link} className="font-mono text-primary hover:underline">{l.no}</a><span className="flex-1 truncate">{l.title}</span><span className="text-muted-foreground">{l.relation}</span>
          <span className="rounded-full bg-muted px-1.5">{l.status}</span>{data.canEdit && l.linkId && <button aria-label="Unlink" className="text-muted-foreground hover:text-red-600" onClick={() => remove(l)}><X className="w-3.5 h-3.5" /></button>}</div>))}</div>}
    </div>
  );
}

/* ── major incident banner (service desk only; shown on every page) ── */
export function MajorIncidentBanner() {
  const { data = [] } = useQuery({ queryKey: ["itsm-major"], queryFn: () => apiFetch<any[]>("/itsm-major"), refetchInterval: 60_000, retry: false });
  const [hidden, setHidden] = useState<string>(() => { try { return sessionStorage.getItem("ithub.majorHidden") || ""; } catch { return ""; } });
  const key = data.map((x: any) => x.id).join(",");
  if (!data.length || hidden === key) return null;
  return (
    <div className="mb-4 rounded-lg border border-red-400 bg-red-600 text-white px-3 py-2 text-sm flex items-center gap-2 flex-wrap" data-testid="major-banner">
      <Flame className="w-4 h-4 animate-pulse" /><b>Major incident{data.length > 1 ? `s (${data.length})` : ""} in progress:</b>
      {data.slice(0, 3).map((m: any) => <a key={m.id} href={`/itsm-incidents?open=${m.id}`} className="underline underline-offset-2">{m.ticketNo} — {m.title}{m.team ? ` (${m.team})` : ""}</a>)}
      <button className="ml-auto text-white/80 hover:text-white text-xs" onClick={() => { try { sessionStorage.setItem("ithub.majorHidden", key); } catch { /* private mode */ } setHidden(key); }}>Hide</button>
    </div>
  );
}

/* ── dashboard insights ── */
export function ItsmInsights() {
  const [days, setDays] = useState(30); const [, nav] = useLocation(); const { toast } = useToast(); const [dl, setDl] = useState(false);
  const { data } = useQuery({ queryKey: ["itsm-insights", days], queryFn: () => apiFetch<any>(`/itsm-insights?days=${days}`) });
  async function report() {
    setDl(true);
    try { const r = await fetch(`/api/itsm-report.xlsx?days=${days === 7 ? 30 : days}`, { credentials: "include" }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Download failed (${r.status})`);
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await r.blob()), download: `IT_Hub_ITSM_Report_${new Date().toISOString().slice(0, 10)}.xlsx` }); a.click(); URL.revokeObjectURL(a.href); }
    catch (e: any) { toast({ title: "Report failed", description: e.message, variant: "destructive" }); } finally { setDl(false); }
  }
  if (!data) return null;
  const k = data.kpi; const m = data.mine; const sla = (x: any) => x.sla?.state === "Breached" ? "text-red-600" : x.sla?.state === "At risk" ? "text-amber-600" : "text-muted-foreground";
  const fmtM = (n: number | null) => n == null ? "" : n < 0 ? `over ${Math.round(-n / 60)}h` : n < 60 ? `${n}m left` : `${Math.round(n / 60)}h left`;
  const Work = ({ title, rows, count, empty }: any) => (
    <div><div className="text-xs font-semibold mb-1">{title} <span className="text-muted-foreground font-normal">({count})</span></div>
      {!rows.length ? <div className="text-xs text-muted-foreground">{empty}</div> : <div className="space-y-1">{rows.map((t: any) =>
        <a key={t.kind + t.id} href={`${t.kind === "incident" ? "/itsm-incidents" : "/itsm-requests"}?open=${t.id}`} className="flex items-center gap-2 text-xs hover:bg-muted/50 rounded px-1 py-0.5">
          <span className="font-mono text-primary">{t.no}</span><span className="flex-1 truncate">{t.title}</span><span className={cn("whitespace-nowrap", sla(t))}>{t.sla?.state === "None" ? t.status : fmtM(t.sla?.minutesLeft)}</span></a>)}</div>}</div>);
  return (
    <div className="space-y-4" data-testid="itsm-insights">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm font-semibold flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-primary" />Service insights</div>
        <div className="flex rounded-md border overflow-hidden ml-2">{[7, 30, 90].map(d => <button key={d} onClick={() => setDays(d)} className={cn("px-2.5 py-1 text-xs", days === d ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{d} days</button>)}</div>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" disabled={dl} onClick={report}>{dl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}ITSM report (Excel)</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[["Open now", k.open, ""], ["SLA breached (open)", k.breached, k.breached ? "text-red-600" : "text-emerald-600"], ["At risk", k.atRisk, k.atRisk ? "text-amber-600" : ""], [`Raised (${days}d)`, k.createdInPeriod, ""], [`Resolved (${days}d)`, k.resolvedInPeriod, "text-emerald-600"],
          ["Customer satisfaction", data.csat.avg != null ? `${data.csat.avg}/5` : "—", data.csat.avg != null && data.csat.avg < 3.5 ? "text-amber-600" : "text-emerald-600"]].map(([l, v, c]) =>
          <div key={l as string} className="rounded-xl border bg-card px-3 py-2.5"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{l}</div><div className={cn("text-2xl font-bold", c as string)}>{v as any}</div></div>)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2"><CardContent className="p-4">
          <div className="text-sm font-semibold mb-2">Raised vs resolved per day — last {days} days</div>
          <div className="h-56"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend} margin={{ left: -20, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="day" tickFormatter={(d: string) => d.slice(8) + "/" + d.slice(5, 7)} fontSize={10} interval={days > 30 ? 9 : days > 7 ? 3 : 0} /><YAxis fontSize={10} allowDecimals={false} /><Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} /><Area type="monotone" dataKey="created" name="Raised" stroke="#2D7FF9" fill="#2D7FF9" fillOpacity={0.15} /><Area type="monotone" dataKey="resolved" name="Resolved" stroke="#10b981" fill="#10b981" fillOpacity={0.15} /><Area type="monotone" dataKey="breached" name="Resolved late" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
          </AreaChart></ResponsiveContainer></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-1.5"><Smile className="w-4 h-4 text-amber-500" />Customer satisfaction</div>
          {!data.csat.count ? <div className="text-xs text-muted-foreground">No ratings in the last {days} days. Requesters are asked to rate when their ticket is resolved.</div> : <>
            <div className="flex items-end gap-2"><span className="text-3xl font-bold">{data.csat.avg}</span><span className="text-xs text-muted-foreground mb-1">/ 5 · {data.csat.count} ratings · {data.csat.satisfiedPct}% satisfied</span></div>
            {[...data.csat.dist].reverse().map((d: any) => <div key={d.stars} className="flex items-center gap-2 text-xs"><span className="w-8">{d.stars}★</span><div className="flex-1 h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${data.csat.count ? d.n / data.csat.count * 100 : 0}%` }} /></div><span className="w-6 text-right">{d.n}</span></div>)}
            {data.csat.recent.filter((r: any) => r.comment).slice(0, 2).map((r: any, i: number) => <div key={i} className="text-[11px] italic text-muted-foreground border-l-2 pl-2">“{r.comment}” — {r.rating}★</div>)}</>}
        </CardContent></Card>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2"><CardContent className="p-4">
          <div className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" />Teams — last {days} days</div>
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground border-b"><th className="py-1.5">Team</th><th className="text-right">Open</th><th className="text-right">Breached</th><th className="text-right">At risk</th><th className="text-right">Resolved</th><th className="text-right">Avg fix time</th><th className="text-right" title="Tickets resolved in this period within their SLA">Fixed in SLA</th></tr></thead>
            <tbody>{data.teams.map((t: any) => <tr key={t.team} className="border-b last:border-0"><td className="py-1.5 font-medium">{t.team}</td><td className="text-right">{t.open}</td><td className={cn("text-right", t.breached && "text-red-600 font-semibold")}>{t.breached}</td><td className={cn("text-right", t.atRisk && "text-amber-600")}>{t.atRisk}</td><td className="text-right">{t.resolved}</td>
              <td className="text-right">{t.avgHours == null ? "—" : t.avgHours < 1 ? "<1h" : `${t.avgHours}h`}</td><td className={cn("text-right font-semibold", t.slaPct == null ? "" : t.slaPct >= 90 ? "text-emerald-600" : t.slaPct >= 70 ? "text-amber-600" : "text-red-600")}>{t.slaPct != null ? `${t.slaPct}%` : "—"}</td></tr>)}</tbody></table></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-1.5"><Workflow className="w-4 h-4 text-violet-500" />Workflows & approvals</div>
          <div className="grid grid-cols-3 gap-2 text-center">{[["Waiting approval", data.workflows.pendingApprovals, ""], ["Over a day", data.workflows.overdueApprovals, data.workflows.overdueApprovals ? "text-red-600" : ""], ["Avg decision", data.workflows.avgDecisionHours != null ? `${data.workflows.avgDecisionHours}h` : "—", ""]].map(([l, v, c]) =>
            <div key={l as string} className="rounded-md border py-1.5"><div className={cn("text-lg font-bold", c as string)}>{v as any}</div><div className="text-[10px] text-muted-foreground">{l}</div></div>)}</div>
          {data.workflows.list.length ? data.workflows.list.map((w: any) => <div key={w.name} className="flex items-center gap-2 text-xs"><span className="flex-1 truncate">{w.name}</span><span className="text-muted-foreground">{w.running} running{w.waiting ? ` · ${w.waiting} waiting` : ""}</span></div>)
            : <div className="text-xs text-muted-foreground">No tickets followed a workflow in this period. <Link href="/itsm-workflows" className="text-primary">Workflow Designer</Link></div>}
        </CardContent></Card>
      </div>
      <Card><CardContent className="p-4">
        <div className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-primary" />My work{m.teams.length ? <span className="text-xs font-normal text-muted-foreground">· {m.teams.join(", ")}</span> : null}
          {m.approvals > 0 && <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => nav("/itsm-my-approvals")}>{m.approvals} approval{m.approvals > 1 ? "s" : ""} waiting for me</Button>}</div>
        <div className="grid md:grid-cols-3 gap-4">
          <Work title="Assigned to me" rows={m.assigned} count={m.assignedCount} empty="Nothing assigned to you." />
          <Work title="My team's queue (unassigned)" rows={m.queue} count={m.queueCount} empty={m.teams.length ? "Queue is empty." : "You are not in a service desk team."} />
          <Work title="Raised by me" rows={m.raised} count={m.raisedCount} empty="No open tickets raised by you." />
        </div>
      </CardContent></Card>
    </div>
  );
}
