import React from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Laptop, Activity, FileCheck2, MessageSquare } from "lucide-react";

/* ITH-071 — shared look for the My Workspace pages: page header, quick switcher with live counts, and stat tiles. */

const TONES: Record<string, string> = {
  blue: "from-blue-500 to-indigo-600", orange: "from-orange-500 to-amber-500", green: "from-emerald-500 to-teal-600", violet: "from-violet-500 to-fuchsia-600",
};

export function PageHero({ icon: I, title, subtitle, tone = "blue", right, img }: { icon?: React.ElementType; title: string; subtitle: React.ReactNode; tone?: keyof typeof TONES | string; right?: React.ReactNode; img?: string }) {
  return (
    <div className="flex items-start gap-3 flex-wrap">
      {img ? <img src={img} alt="" className="w-11 h-11 rounded-xl shadow-sm" />
        : I && <div className={cn("w-11 h-11 rounded-xl bg-gradient-to-br text-white flex items-center justify-center shadow-sm shrink-0", TONES[tone] || TONES.blue)}><I className="w-5 h-5" /></div>}
      <div className="flex-1 min-w-[240px]">
        <h1 className="text-2xl font-bold tracking-tight leading-tight">{title}</h1>
        <div className="text-sm text-muted-foreground mt-0.5 max-w-3xl">{subtitle}</div>
      </div>
      {right}
    </div>
  );
}

/** Quick switcher between the My Workspace pages, each with what is waiting there. */
export function WorkspaceStrip() {
  const [loc] = useLocation();
  const opt = { staleTime: 30_000, retry: false } as const;
  const { data: assets = [] } = useQuery({ queryKey: ["my-assets"], queryFn: () => apiFetch<any[]>("/my-assets"), ...opt });
  const { data: devices = [] } = useQuery({ queryKey: ["my-devices"], queryFn: () => apiFetch<any[]>("/my-devices"), ...opt });
  const { data: pol } = useQuery({ queryKey: ["my-policies"], queryFn: () => apiFetch<any>("/my-policies"), refetchInterval: 5 * 60_000, retry: false });
  const { data: un = [] } = useQuery({ queryKey: ["chats-unread"], queryFn: () => apiFetch<any[]>("/chats-unread"), ...opt });
  const ackDue = assets.filter((a: any) => a.status === "Active" && a.ackStatus === "Pending").length;
  const items = devices.reduce((n: number, d: any) => n + (Number(d.openItems) || 0), 0);
  const polDue = (pol?.policies || []).filter((p: any) => p.pending).length;
  const unread = (Array.isArray(un) ? un : []).reduce((n: number, c: any) => n + (Number(c.unread) || 0), 0);
  const tiles = [
    { href: "/my-assets", label: "My Assets", icon: Laptop, note: ackDue ? `${ackDue} to acknowledge` : `${assets.filter((a: any) => a.status === "Active").length} with me`, warn: ackDue > 0 },
    { href: "/my-device", label: "My Device", icon: Activity, note: !devices.length ? "no agent yet" : items ? `${items} need attention` : "all good", warn: items > 0 },
    { href: "/my-policies", label: "My Policies", icon: FileCheck2, note: polDue ? `${polDue} waiting` : "all done", warn: polDue > 0 },
    { href: "/chats", label: "Chats", icon: MessageSquare, note: unread ? `${unread} unread` : "no unread", warn: unread > 0 },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {tiles.map(t => { const on = loc.startsWith(t.href); return (
        <Link key={t.href} href={t.href} className={cn("rounded-xl border px-3 py-2.5 flex items-center gap-2.5 transition-colors", on ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20" : "bg-card hover:bg-muted/50")}>
          <t.icon className={cn("w-4 h-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
          <div className="min-w-0"><div className={cn("text-[13px] font-semibold truncate", on && "text-primary")}>{t.label}</div>
            <div className={cn("text-[11px] truncate", t.warn ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground")}>{t.note}</div></div>
          {t.warn && <span className="ml-auto w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
        </Link>); })}
    </div>
  );
}

export function StatTile({ label, value, icon: I, tone = "default", active, onClick }: { label: string; value: React.ReactNode; icon?: React.ElementType; tone?: "default" | "warn" | "bad" | "good"; active?: boolean; onClick?: () => void }) {
  const T = { default: "text-foreground", warn: "text-amber-600 dark:text-amber-400", bad: "text-red-600 dark:text-red-400", good: "text-emerald-600 dark:text-emerald-400" }[tone];
  const C: any = onClick ? "button" : "div";
  return (
    <C onClick={onClick} className={cn("rounded-xl border bg-card px-3.5 py-3 text-left", onClick && "hover:bg-muted/40 transition-colors", active && "ring-2 ring-primary/40 border-primary/40")}>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}{I && <I className="w-3.5 h-3.5" />}</div>
      <div className={cn("text-2xl font-bold mt-1 tabular-nums", T)}>{value}</div>
    </C>
  );
}
