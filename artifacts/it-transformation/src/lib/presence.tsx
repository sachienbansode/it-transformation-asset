import React, { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ITH-077 — user status: Online (green), Away (amber, idle up to 4 h), Do not disturb (red), Offline (grey, > 4 h). */
export type Presence = "online" | "away" | "dnd" | "offline";
export const PRESENCE_LABEL: Record<Presence, string> = { online: "Online", away: "Away", dnd: "Do not disturb", offline: "Offline" };
const DOT: Record<Presence, string> = { online: "bg-emerald-500", away: "bg-amber-400", dnd: "bg-red-500", offline: "bg-slate-300 dark:bg-slate-600" };

export function PresenceDot({ status, className, ring = true }: { status?: Presence | null; className?: string; ring?: boolean }) {
  const s = (status || "offline") as Presence;
  return <span title={PRESENCE_LABEL[s]} aria-label={PRESENCE_LABEL[s]} className={cn("inline-block w-2.5 h-2.5 rounded-full shrink-0", DOT[s], ring && "ring-2 ring-background", s === "dnd" && "relative after:absolute after:inset-x-[2px] after:top-1/2 after:h-[1.5px] after:-translate-y-1/2 after:bg-white after:rounded", className)} />;
}
export function PresenceLabel({ status }: { status?: Presence | null }) {
  const s = (status || "offline") as Presence;
  return <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><PresenceDot status={s} ring={false} />{PRESENCE_LABEL[s]}</span>;
}

/** Status of several people (refreshed every minute). */
export function usePresence(ids: (number | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is number => !!x))].sort((a, b) => a - b);
  const { data = {} } = useQuery({ queryKey: ["presence", list.join(",")], queryFn: () => apiFetch<Record<string, { status: Presence }>>(`/presence?ids=${list.join(",")}`), enabled: list.length > 0, refetchInterval: 60_000, staleTime: 30_000 });
  return (id?: number | null) => (id ? (data as any)[id]?.status as Presence | undefined : undefined);
}
export function useMyPresence() {
  return useQuery({ queryKey: ["presence-me"], queryFn: () => apiFetch<{ status: Presence; mode: string; dndUntil?: string | null }>("/presence/me"), refetchInterval: 60_000 });
}

/** Heartbeat while the person is really using IT Hub (input in the last 2 minutes and the page visible). */
export function usePresenceHeartbeat(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let lastInput = Date.now();
    const mark = () => { lastInput = Date.now(); };
    const evs = ["mousemove", "keydown", "mousedown", "touchstart", "wheel"];
    evs.forEach(e => window.addEventListener(e, mark, { passive: true }));
    const beat = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastInput > 120_000) return;
      apiFetch("/presence/heartbeat", { method: "POST", body: "{}", headers: { "X-No-Confirm": "1" } }).then(() => qc.invalidateQueries({ queryKey: ["presence-me"] })).catch(() => {});
    };
    beat(); const t = setInterval(beat, 60_000);
    const vis = () => { if (document.visibilityState === "visible") { mark(); beat(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); evs.forEach(e => window.removeEventListener(e, mark)); document.removeEventListener("visibilitychange", vis); };
  }, [enabled]);
}

export async function setMyPresence(mode: "auto" | "dnd", minutes?: number) {
  return apiFetch("/presence/me", { method: "PUT", body: JSON.stringify({ mode, minutes }), headers: { "X-No-Confirm": "1" } });
}
