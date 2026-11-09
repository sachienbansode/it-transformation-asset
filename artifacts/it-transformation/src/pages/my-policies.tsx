import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useMyPolicies, PolicyReader } from "@/components/policy-gate";
import { ensurePush, enablePush } from "@/lib/push";
import { Bell, BellOff, FileCheck2, FileClock, ScrollText, ShieldCheck, AlertOctagon } from "lucide-react";
import { PageHero, WorkspaceStrip, StatTile } from "@/components/workspace-ui";

/* My Policies — policies, notices and consents that apply to me, my decisions, and push notifications on this device. */

export function PushCard() {
  const { toast } = useToast();
  const [st, setSt] = useState<string>("…"); const [busy, setBusy] = useState(false);
  const load = () => ensurePush().then(setSt).catch(() => setSt("unsupported"));
  useEffect(() => { load(); }, []);
  async function turnOn() {
    setBusy(true);
    try { await enablePush(); await apiFetch("/push/test", { method: "POST" }); toast({ title: "Push notifications on", description: "A test notification was sent to this device." }); }
    catch (e: any) { toast({ title: "Could not turn on push notifications", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); load(); }
  }
  const text: Record<string, string> = {
    on: "On — approvals, tickets, policy reminders and device alerts pop up even when IT Hub is closed. Managed by IT.",
    ask: "Required by IT — turn them on for this device.",
    blocked: "Blocked in this browser. IT requires notifications: click the lock icon next to the address, set Notifications to Allow, then reload.",
    disabled: "Switched off for everyone by IT. You still see everything under the bell.",
    unsupported: "This browser does not support push (use Edge or Chrome; the site must be on HTTPS).",
  };
  return (
    <Card><CardContent className="p-4 flex items-center gap-3 flex-wrap">
      {st === "on" ? <Bell className="w-5 h-5 text-primary" /> : <BellOff className={cn("w-5 h-5", st === "ask" || st === "blocked" ? "text-amber-600" : "text-muted-foreground")} />}
      <div className="flex-1 min-w-[220px]"><div className="font-semibold text-sm">Push notifications on this device</div><div className="text-xs text-muted-foreground">{text[st] || "Checking…"}</div></div>
      {st === "ask" && <Button size="sm" disabled={busy} onClick={turnOn}>Turn on</Button>}
    </CardContent></Card>
  );
}

/** Banner on every page until push is on for this device (cannot be dismissed while IT has push switched on). */
export function PushPrompt() {
  const [st, setSt] = useState<string | null>(null); const { toast } = useToast();
  useEffect(() => { ensurePush().then(setSt).catch(() => setSt(null)); }, []);
  if (st !== "ask" && st !== "blocked") return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
      <BellOff className="w-4 h-4 text-amber-600" />
      <span className="flex-1">{st === "ask" ? "IT requires notifications on this device so you don't miss approvals, ticket updates and policy reminders." : "Notifications are blocked in this browser. IT requires them: click the lock icon next to the address, set Notifications to Allow, then reload."}</span>
      {st === "ask" && <Button size="sm" onClick={async () => { try { await enablePush(); setSt("on"); } catch (e: any) { toast({ title: "Could not turn on", description: e.message, variant: "destructive" }); ensurePush().then(setSt); } }}>Turn on</Button>}
    </div>
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
          {p.halts ? "Access halted — accept to continue" : p.overdue ? "Overdue" : p.pending ? (p.dueAt ? `Accept by ${fmtDate(p.dueAt)}` : p.requirement === "Optional" ? "Your choice" : "To read") : p.decision === "Accepted" ? `Accepted ${fmtDate(p.decidedAt)}` : `${p.decision} ${fmtDate(p.decidedAt)}`}</span>
      </button>
      {open === p.id && <div className="px-3 pb-3"><PolicyReader p={p} onDone={refresh} /></div>}
    </div>
  );
  return (
    <div className="space-y-4 max-w-5xl">
      <PageHero icon={ShieldCheck} tone="green" title="My Policies" subtitle="Company policies, notices and consents that apply to you. Mandatory ones must be accepted; optional consents are your choice and can be withdrawn." />
      <WorkspaceStrip />
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Waiting for you" value={pending.length} icon={FileClock} tone={pending.length ? "warn" : "good"} />
        <StatTile label="Overdue" value={pending.filter(p => p.overdue).length} icon={AlertOctagon} tone={pending.some(p => p.overdue) ? "bad" : "default"} />
        <StatTile label="Done" value={done.length} icon={FileCheck2} tone="good" />
      </div>
      <PushCard />
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <Card><CardContent className="p-4 space-y-2"><h2 className="text-sm font-semibold flex items-center gap-1.5"><FileClock className="w-4 h-4 text-amber-600" />Waiting for you ({pending.length})</h2>
        {pending.map(p => <Row key={p.id} p={p} />)}{!isLoading && !pending.length && <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground text-center">You are all caught up — nothing to act on.</div>}</CardContent></Card>
      {done.length > 0 && <Card><CardContent className="p-4 space-y-2"><h2 className="text-sm font-semibold flex items-center gap-1.5"><FileCheck2 className="w-4 h-4 text-emerald-600" />Done ({done.length})</h2>{done.map(p => <Row key={p.id} p={p} />)}</CardContent></Card>}
      {(data?.history || []).length > 0 && <Card><CardContent className="p-4 space-y-2"><h2 className="text-sm font-semibold flex items-center gap-1.5"><ScrollText className="w-4 h-4" />My decision history</h2>
        <div className="border rounded-lg divide-y text-xs">{data.history.map((h: any) => <div key={h.id} className="px-3 py-1.5 flex gap-2 flex-wrap"><span className="font-medium">{h.title}</span><span className="text-muted-foreground">v{h.version}</span><span className="ml-auto">{h.decision}</span><span className="text-muted-foreground">{fmtDateTime(h.at)} · {h.method === "agent-link" ? "installer link" : "IT Hub"}</span></div>)}</div></CardContent></Card>}
    </div>
  );
}
