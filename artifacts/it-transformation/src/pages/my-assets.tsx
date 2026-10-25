import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { AckPill, printHandoverNote } from "@/components/asset-lifecycle";
import { Laptop, Printer, CheckCircle2, AlertTriangle, Search, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * My Assets — only what is issued to the signed-in person (matched by user id, login email or employee code),
 * for every role including administrators. Everyone's assets are in Asset Registry / Handovers.
 */

const PAGE = 10;
const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function MyAssets() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canAccess } = useAuth();
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["my-assets"], queryFn: () => apiFetch<any[]>("/my-assets") });
  const [view, setView] = useState<"current" | "past">("current");
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const active = rows.filter(r => r.status === "Active");
  const past = rows.filter(r => r.status !== "Active");
  const pending = active.filter(r => r.ackStatus !== "Acknowledged");
  const today = new Date().toISOString().slice(0, 10);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (view === "current" ? active : past).filter(r => !s || [r.assetTag, r.assetName, r.serialNumber, r.handoverNo, r.assetType].some((v: string) => v?.toLowerCase().includes(s)));
  }, [rows, view, q]);
  const pageRows = list.slice((page - 1) * PAGE, page * PAGE);

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

  const tab = (k: "current" | "past", label: string, n: number) => (
    <button onClick={() => { setView(k); setPage(1); }} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", view === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label} <span className="text-[11px] text-muted-foreground">{n}</span></button>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Assets</h1>
        <p className="text-sm text-muted-foreground">IT assets issued to you. Please acknowledge each handover; contact IT if anything here is wrong.</p>
      </div>
      {canAccess("asset_registry", "read") && (
        <div className="flex items-start gap-2 rounded-[10px] border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 shrink-0" /><span>This page shows only assets issued to you. For every employee's assets use <Link href="/asset-registry" className="text-primary font-medium">Asset Registry</Link> or <Link href="/asset-allocations" className="text-primary font-medium">Handovers</Link>.</span>
        </div>
      )}
      {pending.length > 0 && (
        <div className="flex items-start gap-2 rounded-[10px] border border-amber-500/30 bg-amber-50 dark:bg-amber-400/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{pending.length} handover{pending.length > 1 ? "s are" : " is"} waiting for your acknowledgement.
        </div>
      )}
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px]">{tab("current", "With me", active.length)}{tab("past", "Previously held", past.length)}</div>
          <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search tag, model, serial, handover…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Asset</TableHead><TableHead>Handover</TableHead><TableHead>{view === "current" ? "Issued" : "Held"}</TableHead>
              {view === "current" && <TableHead>Return by</TableHead>}<TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !list.length && <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground"><Laptop className="w-8 h-8 mx-auto mb-2 opacity-40" />{q ? "No match." : view === "current" ? "No IT assets are currently issued to you." : "Nothing returned yet."}</TableCell></TableRow>}
              {pageRows.map(r => (
                <TableRow key={r.id}>
                  <TableCell><div className="font-medium">{r.assetName}</div><div className="text-xs text-muted-foreground"><span className="font-mono text-primary font-semibold">{r.assetTag}</span> · SN {r.serialNumber}{r.assetType ? ` · ${r.assetType}` : ""}</div>{r.accessories && <div className="text-[11px] text-muted-foreground">With: {r.accessories}</div>}</TableCell>
                  <TableCell className="text-sm"><div className="font-mono text-xs">{r.handoverNo}</div><div className="text-[11px] text-muted-foreground">{r.allocationType}</div></TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{view === "current" ? fmt(r.startDate) : `${fmt(r.startDate)} → ${fmt(r.endDate)}`}</TableCell>
                  {view === "current" && <TableCell className={cn("text-sm whitespace-nowrap", r.expectedReturnDate && r.expectedReturnDate < today && "text-red-600 font-semibold")}>{r.expectedReturnDate ? fmt(r.expectedReturnDate) : "—"}</TableCell>}
                  <TableCell>{view === "current" ? <AckPill status={r.ackStatus} /> : <span className="text-xs text-muted-foreground">{r.status}</span>}</TableCell>
                  <TableCell className="text-right"><div className="flex justify-end gap-1.5">
                    {view === "current" && r.ackStatus !== "Acknowledged" && <Button size="sm" className="h-8 gap-1.5" onClick={() => acknowledge(r)}><CheckCircle2 className="w-3.5 h-3.5" />Acknowledge</Button>}
                    {view === "current" && r.ackStatus === "Acknowledged" && <span className="text-[11px] text-muted-foreground self-center mr-1">on {fmt(r.ackAt)}</span>}
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => printHandoverNote([r])}><Printer className="w-3.5 h-3.5" />Note</Button>
                  </div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination page={page} totalPages={Math.ceil(list.length / PAGE) || 1} totalItems={list.length} pageSize={PAGE} onPageChange={setPage} />
      </CardContent></Card>
    </div>
  );
}
