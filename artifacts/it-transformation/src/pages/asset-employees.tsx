import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api";
import { AckPill, printHandoverNote, HolderTag } from "@/components/asset-lifecycle";
import { Search, Users, Printer, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function AssetEmployees() {
  const { data: holders = [], isLoading } = useQuery({ queryKey: ["asset-holders"], queryFn: () => apiFetch<any[]>("/asset-holders") });
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [open, setOpen] = useState<any>(null);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return holders.filter(h => (!onlyActive || h.activeCount > 0) && (!t || [h.userName, h.email, h.employeeCode, h.department].some((v: string) => v?.toLowerCase().includes(t))));
  }, [holders, q, onlyActive]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employee Assets</h1>
        <p className="text-sm text-muted-foreground">Who holds what — current assets, pending acknowledgements and full history per employee. Use this for exit clearance.</p>
      </div>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search employee, email, code, department…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px]">
              {[["Holding assets", true], ["Everyone", false]].map(([l, v]) => (
                <button key={String(l)} onClick={() => setOnlyActive(v as boolean)}
                  className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", onlyActive === v ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground")}>{l as string}</button>
              ))}
            </div>
          </div>
          {isLoading && <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && list.length === 0 && <div className="py-12 text-center text-muted-foreground text-sm"><Users className="w-8 h-8 mx-auto mb-2 opacity-40" />No employees found.</div>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map(h => (
              <button key={h.key} onClick={() => setOpen(h)} className="text-left rounded-[14px] border bg-card p-4 hover:shadow-md hover:-translate-y-px transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4D93FA] to-[#1B63D6] text-white grid place-items-center font-semibold text-sm shrink-0">{h.userName?.[0]?.toUpperCase()}</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground truncate flex items-center gap-1.5">{h.userName}<HolderTag type={h.userType} /></div>
                    <div className="text-xs text-muted-foreground truncate"><span className="font-mono">{h.employeeCode || "no emp code"}</span>{[h.email, h.department].filter(Boolean).map(x => ` · ${x}`).join("")}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 text-[11.5px]">
                  <span className="px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-semibold">{h.activeCount} holding</span>
                  {h.pendingAck > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300 font-semibold">{h.pendingAck} ack pending</span>}
                  {h.overdue > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300 font-semibold">{h.overdue} overdue</span>}
                  <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{h.totalCount} total</span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      {open && <HolderSheet holder={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function HolderSheet({ holder, onClose }: { holder: any; onClose: () => void }) {
  const { data: rows = [] } = useQuery({ queryKey: ["asset-holder-assets", holder.key], queryFn: () => apiFetch<any[]>(`/asset-holders/assets?key=${encodeURIComponent(holder.key)}`) });
  const active = rows.filter(r => r.status === "Active");
  const past = rows.filter(r => r.status !== "Active");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">{holder.userName}<HolderTag type={holder.userType} /></SheetTitle>
          <SheetDescription>{[holder.employeeCode, holder.designation, holder.department, holder.email].filter(Boolean).join(" · ")}</SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-5">
          <div className={cn("rounded-[10px] border px-3 py-2.5 text-sm", active.length ? "bg-amber-50 border-amber-500/30 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300" : "bg-emerald-50 border-emerald-500/30 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300")}>
            {active.length ? <><AlertTriangle className="inline w-4 h-4 mr-1 -mt-0.5" />Exit clearance: {active.length} asset(s) still to be returned.</> : "Exit clearance: no IT assets outstanding."}
          </div>
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Currently holding ({active.length})</h4>
              {active.length > 0 && <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => printHandoverNote(active)}><Printer className="w-3.5 h-3.5" />Print all</Button>}
            </div>
            <div className="space-y-2">
              {active.map(r => (
                <div key={r.id} className="rounded-[10px] border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="font-semibold text-foreground">{r.assetTag} <span className="font-normal text-muted-foreground">· {r.assetType}</span></div>
                      <div className="text-xs text-muted-foreground truncate">{r.assetName} · SN {r.serialNumber}</div></div>
                    <AckPill status={r.ackStatus} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">{r.handoverNo} · issued {fmt(r.startDate)} · {r.allocationType}
                    {r.expectedReturnDate && <span className={cn(r.expectedReturnDate < today && "text-red-600 font-semibold")}> · due {fmt(r.expectedReturnDate)}</span>}</div>
                  {r.accessories && <div className="text-xs text-muted-foreground">Accessories: {r.accessories}</div>}
                </div>
              ))}
              {!active.length && <div className="text-sm text-muted-foreground">Nothing at the moment.</div>}
            </div>
          </section>
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">History ({past.length})</h4>
            <div className="divide-y border rounded-[10px]">
              {past.map(r => (
                <div key={r.id} className="px-3 py-2 text-sm flex justify-between gap-2">
                  <div className="min-w-0"><div className="font-medium text-foreground">{r.assetTag} · {r.assetName}</div>
                    <div className="text-xs text-muted-foreground">{fmt(r.startDate)} → {fmt(r.endDate)} · {r.status}{r.returnCondition ? ` · ${r.returnCondition}` : ""}</div></div>
                  <Button size="sm" variant="ghost" onClick={() => printHandoverNote([r], "return")}><Printer className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
              {!past.length && <div className="px-3 py-3 text-sm text-muted-foreground">No past handovers.</div>}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
