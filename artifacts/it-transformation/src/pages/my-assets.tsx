import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { AckPill, printHandoverNote } from "@/components/asset-lifecycle";
import { Laptop, Printer, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function MyAssets() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["my-assets"], queryFn: () => apiFetch<any[]>("/my-assets") });
  const active = rows.filter(r => r.status === "Active");
  const past = rows.filter(r => r.status !== "Active");
  const pending = active.filter(r => r.ackStatus !== "Acknowledged");
  const today = new Date().toISOString().slice(0, 10);

  async function acknowledge(r: any) {
    const ok = await confirmDialog(
      `I confirm I have received ${r.assetTag} — ${r.assetName} (SN ${r.serialNumber})${r.accessories ? ` with: ${r.accessories}` : ""}, in ${String(r.issueCondition || "good").toLowerCase()} condition.\n\nI accept responsibility for it under the company's IT asset and acceptable-use policies, and will return it on exit or when IT asks.`,
      { title: `Acknowledge handover ${r.handoverNo}`, confirmText: "I acknowledge" });
    if (!ok) return;
    try {
      await apiFetch(`/my-assets/${r.id}/acknowledge`, { method: "POST", body: "{}" });
      qc.invalidateQueries({ queryKey: ["my-assets"] }); qc.invalidateQueries({ queryKey: ["asset-handovers"] });
      toast({ title: "Thank you — handover acknowledged", description: r.handoverNo });
    } catch (e: any) { toast({ title: "Could not acknowledge", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Assets</h1>
        <p className="text-sm text-muted-foreground">IT assets issued to you. Please acknowledge each handover; contact IT if anything here is wrong.</p>
      </div>
      {pending.length > 0 && (
        <div className="flex items-start gap-2 rounded-[10px] border border-amber-500/30 bg-amber-50 dark:bg-amber-400/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{pending.length} handover{pending.length > 1 ? "s are" : " is"} waiting for your acknowledgement.
        </div>
      )}
      {isLoading && <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && !active.length && (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><Laptop className="w-9 h-9 mx-auto mb-2 opacity-40" />No IT assets are currently issued to you.</CardContent></Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {active.map(r => (
          <Card key={r.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-[11px] bg-accent grid place-items-center shrink-0"><Laptop className="w-5 h-5 text-primary" /></div>
                  <div className="min-w-0"><div className="font-semibold text-foreground">{r.assetName}</div><div className="text-xs text-muted-foreground">{r.assetTag} · SN {r.serialNumber}</div></div>
                </div>
                <AckPill status={r.ackStatus} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Handover</span><div className="font-medium text-foreground">{r.handoverNo}</div></div>
                <div><span className="text-muted-foreground">Issued</span><div className="font-medium text-foreground">{fmt(r.startDate)}</div></div>
                <div><span className="text-muted-foreground">Type</span><div className="font-medium text-foreground">{r.allocationType}</div></div>
                <div><span className="text-muted-foreground">Return by</span><div className={cn("font-medium text-foreground", r.expectedReturnDate && r.expectedReturnDate < today && "text-red-600")}>{r.expectedReturnDate ? fmt(r.expectedReturnDate) : "—"}</div></div>
                {r.accessories && <div className="col-span-2"><span className="text-muted-foreground">Accessories</span><div className="font-medium text-foreground">{r.accessories}</div></div>}
              </div>
              <div className="flex gap-2 pt-1">
                {r.ackStatus !== "Acknowledged"
                  ? <Button size="sm" className="gap-1.5" onClick={() => acknowledge(r)}><CheckCircle2 className="w-4 h-4" />Acknowledge receipt</Button>
                  : <span className="text-xs text-muted-foreground self-center">Acknowledged {fmt(r.ackAt)}</span>}
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => printHandoverNote([r])}><Printer className="w-4 h-4" />Handover note</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {past.length > 0 && (
        <Card><CardContent className="p-4">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Previously held</h4>
          <div className="divide-y">
            {past.map(r => (
              <div key={r.id} className="py-2 text-sm flex justify-between gap-2">
                <span className="text-foreground">{r.assetTag} · {r.assetName}</span>
                <span className="text-xs text-muted-foreground">{fmt(r.startDate)} → {fmt(r.endDate)} · {r.status}</span>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
