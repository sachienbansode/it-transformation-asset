import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { FileCheck2, ShieldAlert, Loader2 } from "lucide-react";

/* Policies & notices the signed-in user must act on. Overdue mandatory policies block the app until accepted. */

export function useMyPolicies() {
  return useQuery({ queryKey: ["my-policies"], queryFn: () => apiFetch<any>("/my-policies"), refetchInterval: 5 * 60_000, refetchOnWindowFocus: true, retry: false });
}

/** Read-and-accept panel used by the gate and by My Policies. */
export function PolicyReader({ p, onDone, compact = false }: { p: any; onDone: () => void; compact?: boolean }) {
  const { toast } = useToast(); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  async function decide(decision: "Accepted" | "Declined" | "Withdrawn") {
    setBusy(true);
    try { await apiFetch(`/my-policies/${p.id}/decision`, { method: "POST", body: JSON.stringify({ decision, version: p.version, confirm: decision === "Accepted" ? ok : undefined }) });
      toast({ title: decision === "Accepted" ? `Accepted: ${p.title}` : decision === "Declined" ? "Declined — you can change this later in My Policies" : "Consent withdrawn" }); onDone(); }
    catch (e: any) { toast({ title: "Could not record", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  const accepted = p.decision === "Accepted";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("px-2 py-0.5 rounded-full font-semibold", p.requirement === "Mandatory" ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" : p.requirement === "Optional" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" : "bg-muted text-muted-foreground")}>{p.requirement}</span>
        <span className="text-muted-foreground">{p.category} · {p.code} · version {p.version} · published {fmtDate(p.publishedAt)}{p.dueAt ? ` · accept by ${fmtDate(p.dueAt)}` : ""}</span>
      </div>
      {p.changeNote && p.version > 1 && <div className="text-xs rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 px-2.5 py-1.5">What changed: {p.changeNote}</div>}
      <div className={cn("whitespace-pre-wrap text-sm leading-relaxed border rounded-lg p-3 bg-muted/30 overflow-y-auto", compact ? "max-h-[45vh]" : "max-h-[55vh]")}>{p.body}</div>
      {accepted ? <div className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2"><FileCheck2 className="w-4 h-4" />You accepted this on {fmtDate(p.decidedAt)}.
          {p.allowWithdraw && <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => decide("Withdrawn")}>Withdraw consent</Button>}</div>
        : <>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ok} onChange={e => setOk(e.target.checked)} />I have read and understood this {p.category.toLowerCase()}{p.requirement === "Information" ? "" : " and I accept it"}.</label>
          <div className="flex gap-2 flex-wrap">
            <Button disabled={!ok || busy} onClick={() => decide("Accepted")}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}{p.requirement === "Information" ? "Acknowledge" : "Accept"}</Button>
            {p.requirement === "Optional" && <Button variant="outline" disabled={busy} onClick={() => decide("Declined")}>{p.decision === "Declined" ? "Keep declined" : "Decline"}</Button>}
          </div>
          <p className="text-[11px] text-muted-foreground">Your decision is recorded with the version, date, time and browser.</p>
        </>}
    </div>
  );
}

/** Shown on every page: blocks when a mandatory policy is overdue; otherwise reminds once per session. */
export function PolicyGate() {
  const { data } = useMyPolicies(); const qc = useQueryClient(); const [loc] = useLocation();
  const [later, setLater] = useState(() => { try { return sessionStorage.getItem("policyLater") === "1"; } catch { return false; } });
  if (!data || loc.startsWith("/my-policies")) return null;
  const blocking = data.policies.filter((p: any) => p.halts);
  const mandatory = data.policies.filter((p: any) => p.pending && p.requirement !== "Optional");
  const list = blocking.length ? blocking : later ? [] : mandatory;
  if (!list.length) return null;
  const p = list[0]; const block = blocking.length > 0;
  const done = () => { qc.invalidateQueries({ queryKey: ["my-policies"] }); qc.invalidateQueries(); };
  return (
    <Dialog open onOpenChange={o => { if (!o && !block) { setLater(true); try { sessionStorage.setItem("policyLater", "1"); } catch { /* ignore */ } } }}>
      <DialogContent className="max-w-2xl" onEscapeKeyDown={e => block && e.preventDefault()} onPointerDownOutside={e => block && e.preventDefault()} hideClose={block}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-primary" />{p.title}</DialogTitle>
          <DialogDescription>{block ? "Your access to IT Hub is halted until you accept this." : `Please read and accept${p.dueAt ? ` by ${fmtDate(p.dueAt)}` : ""}${p.blockAccess ? " — after that your access to IT Hub will be halted until you accept" : ""}.`}{list.length > 1 ? ` (${list.length} to review)` : ""}</DialogDescription>
        </DialogHeader>
        <PolicyReader key={`${p.id}-${p.version}`} p={p} onDone={done} compact />
        {!block && <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => { setLater(true); try { sessionStorage.setItem("policyLater", "1"); } catch { /* ignore */ } }}>Remind me later</Button></div>}
      </DialogContent>
    </Dialog>
  );
}
