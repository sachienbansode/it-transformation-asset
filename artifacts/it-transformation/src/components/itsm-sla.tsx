import React from "react";
import { Clock, PauseCircle, CheckCircle2, AlertTriangle, XCircle, Timer } from "lucide-react";
import { fmtDateTime } from "@/lib/date";

/* SLA shown on incidents and service requests — the server computes it (lib/itsm-sla.ts) and sends `sla` with each ticket. */
export type Sla = {
  policy: string | null; type: "24x7" | "Business Hours" | null;
  state: "None" | "On track" | "At risk" | "Breached" | "Paused" | "Met";
  responseState: "None" | "Pending" | "At risk" | "Met" | "Breached";
  resolutionHours: number | null; responseHours: number | null;
  dueAt: string | null; responseDueAt: string | null;
  usedPct: number | null; minutesLeft: number | null; elapsedMins: number | null; pausedMins: number;
};

export function fmtMins(m: number | null | undefined) {
  if (m === null || m === undefined) return "—";
  const a = Math.abs(Math.round(m)); const d = Math.floor(a / 1440), h = Math.floor((a % 1440) / 60), mm = a % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
}

const TONE: Record<string, string> = {
  "On track": "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
  "At risk": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
  Breached: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  Paused: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700",
  Met: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
  Pending: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
};
const ICON: Record<string, React.ElementType> = { "On track": Clock, "At risk": AlertTriangle, Breached: XCircle, Paused: PauseCircle, Met: CheckCircle2, Pending: Timer };

/** Compact badge for tables: time left / overdue / paused / met. */
export function SlaBadge({ sla }: { sla?: Sla | null }) {
  if (!sla || sla.state === "None") return <span className="text-[10px] text-muted-foreground">No SLA</span>;
  const I = ICON[sla.state] || Clock;
  const text = sla.state === "Breached" ? (sla.minutesLeft !== null && sla.minutesLeft < 0 ? `Over ${fmtMins(-sla.minutesLeft)}` : "Breached")
    : sla.state === "Met" ? "Met" : sla.state === "Paused" ? "Paused" : `${fmtMins(sla.minutesLeft)} left`;
  return (
    <span title={`${sla.policy} · ${sla.type} · resolve in ${sla.resolutionHours}h${sla.dueAt ? ` · due ${fmtDateTime(sla.dueAt)}` : ""}${sla.usedPct !== null ? ` · ${sla.usedPct}% used` : ""}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${TONE[sla.state]}`}>
      <I className="w-2.5 h-2.5" />{text}
    </span>
  );
}

/** Full SLA panel for the ticket view. */
export function SlaPanel({ sla, firstResponseAt }: { sla?: Sla | null; firstResponseAt?: string | null }) {
  if (!sla || sla.state === "None") return <div className="text-xs text-muted-foreground border rounded-lg px-3 py-2">No SLA policy applies to this priority (ITSM › SLA Policies).</div>;
  const pct = Math.max(0, Math.min(100, sla.usedPct ?? 0));
  const bar = sla.state === "Breached" ? "bg-red-500" : sla.state === "At risk" ? "bg-amber-500" : sla.state === "Paused" ? "bg-slate-400" : "bg-emerald-500";
  return (
    <div className="border rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs font-semibold flex items-center gap-1.5"><Timer className="w-3.5 h-3.5 text-primary" />SLA — {sla.policy} <span className="font-normal text-muted-foreground">({sla.type})</span></div>
        <SlaBadge sla={sla} />
      </div>
      <div>
        <div className="flex justify-between text-[11px] text-muted-foreground mb-1"><span>Resolution · {sla.resolutionHours}h target</span><span>{sla.usedPct ?? 0}% used</span></div>
        <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full ${bar}`} style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div><div className="text-muted-foreground">Respond by</div><div className="font-medium">{fmtDateTime(sla.responseDueAt)}</div>
          <span className={`inline-block mt-0.5 px-1.5 rounded border text-[10px] font-semibold ${TONE[sla.responseState] || TONE.Pending}`}>{sla.responseState}{firstResponseAt ? ` · ${fmtDateTime(firstResponseAt)}` : ""}</span></div>
        <div><div className="text-muted-foreground">Resolve by</div><div className="font-medium">{sla.state === "Paused" ? "Clock paused" : fmtDateTime(sla.dueAt)}</div>
          <div className="text-muted-foreground mt-0.5">{sla.state === "Met" ? "Resolved in time" : sla.minutesLeft !== null && sla.minutesLeft < 0 ? `Over by ${fmtMins(-sla.minutesLeft)}` : `${fmtMins(sla.minutesLeft)} left`}</div></div>
      </div>
      {sla.pausedMins > 0 && <div className="text-[11px] text-muted-foreground flex items-center gap-1"><PauseCircle className="w-3 h-3" />Clock stopped for {fmtMins(sla.pausedMins)} (on hold / waiting for approval)</div>}
    </div>
  );
}
