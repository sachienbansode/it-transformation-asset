import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useMyPolicies, PolicyReader } from "@/components/policy-gate";
import { pushStatus, enablePush, disablePush } from "@/lib/push";
import { Bell, BellOff, FileCheck2, FileClock, ScrollText } from "lucide-react";

/* My Policies — policies, notices and consents that apply to me, my decisions, and push notifications on this device. */

export function PushCard() {
  const { toast } = useToast();
  const [st, setSt] = useState<string>("…"); const [busy, setBusy] = useState(false);
  const load = () => pushStatus().then(setSt).catch(() => setSt("unsupported"));
  useEffect(() => { load(); }, []);
  async function toggle() {
    setBusy(true);
    try {
      if (st === "on") { await disablePush(); toast({ title: "Push notifications turned off on this device" }); }
      else { await enablePush(); await apiFetch("/push/test", { method: "POST" }); toast({ title: "Push notifications on", description: "A test notification was sent to this device." }); }
    } catch (e: any) { toast({ title: "Could not change push notifications", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); load(); }
  }
  return (
    <Card><CardContent className="p-4 flex items-center gap-3 flex-wrap">
      {st === "on" ? <Bell className="w-5 h-5 text-primary" /> : <BellOff className="w-5 h-5 text-muted-foreground" />}
      <div className="flex-1 min-w-[220px]"><div className="font-semibold text-sm">Push notifications on this device</div>
        <div className="text-xs text-muted-foreground">{st === "on" ? "On — approvals, tickets, policy reminders and device alerts pop up even when IT Hub is closed." : st === "blocked" ? "Blocked in the browser — allow notifications for this site in the browser's settings." : st === "unsupported" ? "This browser does not support push (use Edge or Chrome; the site must be on HTTPS)." : "Off — you still see everything under the bell in IT Hub."}</div></div>
      {st !== "unsupported" && st !== "blocked" && <Button size="sm" variant={st === "on" ? "outline" : "default"} disabled={busy || st === "…"} onClick={toggle}>{st === "on" ? "Turn off" : "Turn on"}</Button>}
    </CardContent></Card>
  );
}

export default function MyPolicies() {
  const { data, isLoading } = useMyPolicies(); const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const list: any[] = data?.policies || [];
  const pending = list.filter(p => p.pending), done = list.filter(p => !p.pending);
  const refresh = () => qc.invalidateQueries();
  const Row = ({ p }: { p: any }) => (
    <div className="border rounded-lg">
      <button className="w-full text-left px-3 py-2.5 flex items-center gap-2 flex-wrap" onClick={() => setOpen(open === p.id ? null : p.id)}>
        {p.pending ? <FileClock className={cn("w-4 h-4", p.overdue ? "text-red-600" : "text-amber-600")} /> : <FileCheck2 className="w-4 h-4 text-emerald-600" />}
        <span className="font-medium">{p.title}</span>
        <span className="text-xs text-muted-foreground">{p.category} · v{p.version}</span>
        <span className={cn("ml-auto text-[11px] px-2 py-0.5 rounded-full font-semibold", p.overdue ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" : p.pending ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" : p.decision === "Accepted" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
          {p.overdue ? "Overdue — accept to continue" : p.pending ? (p.dueAt ? `Accept by ${fmtDate(p.dueAt)}` : p.requirement === "Optional" ? "Your choice" : "To read") : p.decision === "Accepted" ? `Accepted ${fmtDate(p.decidedAt)}` : `${p.decision} ${fmtDate(p.decidedAt)}`}</span>
      </button>
      {open === p.id && <div className="px-3 pb-3"><PolicyReader p={p} onDone={refresh} /></div>}
    </div>
  );
  return (
    <div className="space-y-5 max-w-4xl">
      <div><h1 className="text-2xl font-bold tracking-tight">My Policies</h1>
        <p className="text-sm text-muted-foreground">Company policies, notices and consents that apply to you. Mandatory ones must be accepted; optional consents are your choice and can be withdrawn.</p></div>
      <PushCard />
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <section className="space-y-2"><h2 className="text-sm font-semibold">Waiting for you ({pending.length})</h2>
        {pending.map(p => <Row key={p.id} p={p} />)}{!isLoading && !pending.length && <div className="text-sm text-muted-foreground">Nothing to act on.</div>}</section>
      {done.length > 0 && <section className="space-y-2"><h2 className="text-sm font-semibold">Done ({done.length})</h2>{done.map(p => <Row key={p.id} p={p} />)}</section>}
      {(data?.history || []).length > 0 && <section className="space-y-2"><h2 className="text-sm font-semibold flex items-center gap-1.5"><ScrollText className="w-4 h-4" />My decision history</h2>
        <div className="border rounded-lg divide-y text-xs">{data.history.map((h: any) => <div key={h.id} className="px-3 py-1.5 flex gap-2 flex-wrap"><span className="font-medium">{h.title}</span><span className="text-muted-foreground">v{h.version}</span><span className="ml-auto">{h.decision}</span><span className="text-muted-foreground">{fmtDateTime(h.at)} · {h.method === "agent-link" ? "installer link" : "IT Hub"}</span></div>)}</div></section>}
    </div>
  );
}
