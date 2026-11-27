import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useMyPolicies, PolicyReader } from "@/components/policy-gate";
import { ensurePush, enablePush } from "@/lib/push";
import { Bell, BellOff, FileCheck2, FileClock, ScrollText, ShieldCheck, AlertOctagon, Eye } from "lucide-react";
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
  const [later, setLater] = useState(() => { try { return sessionStorage.getItem("ithub.pushLater") === "1"; } catch { return false; } });
  useEffect(() => { ensurePush().then(setSt).catch(() => setSt(null)); }, []);
  if ((st !== "ask" && st !== "blocked") || later) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
      <BellOff className="w-4 h-4 text-amber-600" />
      <span className="flex-1">{st === "ask" ? "IT requires notifications on this device so you don't miss approvals, ticket updates and policy reminders." : "Notifications are blocked in this browser. IT requires them: click the lock icon next to the address, set Notifications to Allow, then reload."}</span>
      <Button size="sm" variant="ghost" onClick={() => { try { sessionStorage.setItem("ithub.pushLater", "1"); } catch { /* private mode */ } setLater(true); }}>Not now</Button>
      {st === "ask" && <Button size="sm" onClick={async () => { try { await enablePush(); setSt("on"); } catch (e: any) { toast({ title: "Could not turn on", description: e.message, variant: "destructive" }); ensurePush().then(setSt); } }}>Turn on</Button>}
    </div>
  );
}

export default function MyPolicies() {
  const { data, isLoading } = useMyPolicies(); const qc = useQueryClient();
  const [view, setView] = useState<any>(null); const [tab, setTab] = useState<"pending" | "done" | "all">("pending"); const [q, setQ] = useState("");
  const list: any[] = data?.policies || [];
  const pending = list.filter(p => p.pending), done = list.filter(p => !p.pending);
  useEffect(() => { if (data && !pending.length && tab === "pending") setTab("all"); }, [!!data]);
  const refresh = () => { qc.invalidateQueries(); setView(null); };
  const shown = (tab === "pending" ? pending : tab === "done" ? done : list).filter(p => !q.trim() || [p.title, p.code, p.category].some((v: string) => v?.toLowerCase().includes(q.trim().toLowerCase())));
  const status = (p: any) => p.halts ? ["Access halted — accept", "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"] : p.overdue ? ["Overdue", "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"]
    : p.pending ? [p.requirement === "Optional" ? "Your choice" : p.requirement === "Information" ? "To read" : "To accept", "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"]
    : p.decision === "Accepted" ? [p.requirement === "Information" ? "Acknowledged" : "Accepted", "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"] : [p.decision, "bg-muted text-muted-foreground"];
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHero icon={ShieldCheck} tone="green" title="My Policies" subtitle="Company policies, notices and consents that apply to you. Mandatory ones must be accepted; optional consents are your choice and can be withdrawn." />
      <WorkspaceStrip />
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Waiting for you" value={pending.length} icon={FileClock} tone={pending.length ? "warn" : "good"} />
        <StatTile label="Overdue" value={pending.filter(p => p.overdue).length} icon={AlertOctagon} tone={pending.some(p => p.overdue) ? "bad" : "default"} />
        <StatTile label="Done" value={done.length} icon={FileCheck2} tone="good" />
      </div>
      <PushCard />
      <Card><CardContent className="p-0" data-testid="my-policy-list">
        <div className="flex items-center gap-2 flex-wrap px-4 pt-4 pb-3">
          {([["pending", `Waiting for you (${pending.length})`], ["done", `Done (${done.length})`], ["all", `All (${list.length})`]] as const).map(([k, l]) =>
            <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-1.5 rounded-md text-sm border", tab === k ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted")}>{l}</button>)}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search policies…" className="ml-auto h-9 w-56 rounded-md border bg-background px-3 text-sm" />
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-y bg-muted/30"><th className="px-4 py-2 font-semibold">Policy</th><th className="px-3 py-2 font-semibold">Type</th><th className="px-3 py-2 font-semibold">Version</th><th className="px-3 py-2 font-semibold">Published</th><th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 font-semibold">Accept by / Decided</th><th className="px-4 py-2 font-semibold text-right">Action</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {shown.map(p => { const [st, cls] = status(p); return (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setView(p)}>
                <td className="px-4 py-2.5"><div className="font-medium flex items-center gap-1.5">{p.pending ? <FileClock className={cn("w-4 h-4 shrink-0", p.overdue ? "text-red-600" : "text-amber-600")} /> : <FileCheck2 className="w-4 h-4 shrink-0 text-emerald-600" />}{p.title}</div>
                  <div className="text-xs text-muted-foreground pl-5">{p.code}{p.documentId ? " · PDF" : ""}</div></td>
                <td className="px-3 py-2.5 text-xs"><span className={cn("px-2 py-0.5 rounded-full font-semibold", p.requirement === "Mandatory" ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" : p.requirement === "Optional" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" : "bg-muted")}>{p.requirement}</span><div className="text-muted-foreground mt-0.5">{p.category}</div></td>
                <td className="px-3 py-2.5 text-xs">v{p.version}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">{fmtDate(p.publishedAt)}</td>
                <td className="px-3 py-2.5 text-xs"><span className={cn("px-2 py-0.5 rounded-full font-semibold whitespace-nowrap", cls)}>{st}</span></td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">{p.pending ? (p.dueAt ? fmtDate(p.dueAt) : "—") : fmtDate(p.decidedAt)}</td>
                <td className="px-4 py-2.5 text-right"><Button size="sm" variant={p.pending ? "default" : "outline"} className="gap-1.5" onClick={e => { e.stopPropagation(); setView(p); }}><Eye className="w-3.5 h-3.5" />{p.pending ? (p.requirement === "Optional" ? "Read & decide" : "Read & accept") : "View"}</Button></td>
              </tr>); })}
            {!isLoading && !shown.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{tab === "pending" ? "You are all caught up — nothing to act on." : "No policies here."}</td></tr>}
          </tbody>
        </table></div>
      </CardContent></Card>
      {(data?.history || []).length > 0 && <Card><CardContent className="p-0"><h2 className="text-sm font-semibold flex items-center gap-1.5 px-4 pt-4 pb-3"><ScrollText className="w-4 h-4" />My decision history</h2>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-y bg-muted/30"><th className="px-4 py-2">Policy</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Version</th><th className="px-3 py-2">Decision</th><th className="px-3 py-2">Date &amp; time</th><th className="px-3 py-2">How</th></tr></thead>
          <tbody>{data.history.map((h: any) => <tr key={h.id} className="border-b last:border-0"><td className="px-4 py-1.5 font-medium">{h.title}<div className="text-[10px] font-normal text-muted-foreground">{h.code}</div></td><td className="px-3 py-1.5">{h.type || "Policy"}{h.requirement ? <span className="text-muted-foreground"> · {h.requirement}</span> : null}</td><td className="px-3 py-1.5">v{h.version}</td><td className="px-3 py-1.5">{h.decision}</td><td className="px-3 py-1.5 whitespace-nowrap">{fmtDateTime(h.at)}</td><td className="px-3 py-1.5 text-muted-foreground">{h.method === "agent-link" ? "Installer link" : "IT Hub"}</td></tr>)}</tbody></table></div>
      </CardContent></Card>}
      <Dialog open={!!view} onOpenChange={o => !o && setView(null)}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="policy-view">
          <DialogHeader><DialogTitle>{view?.title}</DialogTitle></DialogHeader>
          {view && <PolicyReader p={view} onDone={refresh} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
