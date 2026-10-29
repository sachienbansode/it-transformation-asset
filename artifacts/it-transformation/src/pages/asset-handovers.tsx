import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { StatCard } from "@/components/stat-card";
import { apiFetch } from "@/lib/api";
import { AckPill, IssueDialog, ReturnDialog, markAcknowledged, printHandoverNote, HolderTag, ResolveIssueDialog } from "@/components/asset-lifecycle";
import { BulkAssignDialog } from "@/components/bulk-assign";
import { Search, UserPlus, Printer, Undo2, FileCheck2, ClipboardList, Clock, AlertTriangle, Download, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCell, fmtDate } from "@/lib/date";

const PAGE_SIZE = 12;
const TABS = [
  { key: "active", label: "Active" },
  { key: "pending", label: "Ack pending" },
  { key: "issues", label: "Issues reported" },
  { key: "overdue", label: "Overdue returns" },
  { key: "closed", label: "Returned / closed" },
  { key: "all", label: "All" },
] as const;

const todayIso = () => new Date().toISOString().slice(0, 10);
const fmt = (d?: string | null) => d ? fmtDate(d) : "—";

function exportCsv(rows: any[]) {
  const cols: [string, string][] = [["Handover No", "handoverNo"], ["Asset Tag", "assetTag"], ["Asset", "assetName"], ["Serial", "serialNumber"], ["Employee", "userName"], ["Employee Code", "employeeCode"], ["Internal / External", "holderType"], ["Email", "email"],
    ["Department", "department"], ["Type", "allocationType"], ["Issued", "startDate"], ["Expected Return", "expectedReturnDate"], ["Status", "status"], ["Acknowledgement", "ackStatus"], ["Returned", "endDate"], ["Return Condition", "returnCondition"]];
  const e = (v: any) => { const s = String(fmtCell(v) ?? "").replace(/"/g, '""'); return /[,"\n]/.test(s) ? `"${s}"` : s; };
  const csv = [cols.map(c => c[0]).join(","), ...rows.map(r => cols.map(c => e(r[c[1]])).join(","))].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `asset_handovers_${todayIso()}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
}

export default function AssetHandovers() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canAccess } = useAuth(); const isAdmin = canAccess("asset_allocations", "write");
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["asset-handovers"], queryFn: () => apiFetch<any[]>("/asset-handovers") });
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("active");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pickOpen, setPickOpen] = useState(false);
  const [issueAssets, setIssueAssets] = useState<any[] | null>(null);
  const [returnAsset, setReturnAsset] = useState<any>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [resolve, setResolve] = useState<any>(null);

  const isOverdue = (r: any) => r.status === "Active" && r.expectedReturnDate && r.expectedReturnDate < todayIso();
  const counts = useMemo(() => ({
    active: rows.filter(r => r.status === "Active").length,
    pending: rows.filter(r => r.status === "Active" && r.ackStatus === "Pending").length,
    issues: rows.filter(r => r.status === "Active" && r.ackStatus === "Issue reported").length,
    overdue: rows.filter(isOverdue).length,
    closed: rows.filter(r => r.status !== "Active").length,
    all: rows.length,
  }), [rows]);

  const filtered = useMemo(() => {
    let l = rows;
    if (tab === "active") l = l.filter(r => r.status === "Active");
    if (tab === "pending") l = l.filter(r => r.status === "Active" && r.ackStatus === "Pending");
    if (tab === "issues") l = l.filter(r => r.status === "Active" && r.ackStatus === "Issue reported");
    if (tab === "overdue") l = l.filter(isOverdue);
    if (tab === "closed") l = l.filter(r => r.status !== "Active");
    const t = q.trim().toLowerCase();
    if (t) l = l.filter(r => [r.handoverNo, r.assetTag, r.assetName, r.serialNumber, r.userName, r.employeeCode, r.email, r.department].some((v: string) => v?.toLowerCase().includes(t)));
    return l;
  }, [rows, tab, q]);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const refresh = () => ["asset-handovers", "assets", "asset-holders", "my-assets"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const assetOf = (r: any) => assets.find((a: any) => a.id === r.assetId);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset Handovers</h1>
          <p className="text-sm text-muted-foreground">Issue assets to employees, track acknowledgement and receive them back.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportCsv(filtered)}><Download className="w-4 h-4" />Export CSV</Button>
          {isAdmin && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkOpen(true)}><Upload className="w-4 h-4" />Bulk assign (Excel)</Button>}
          {isAdmin && <Button className="gap-2" onClick={() => setPickOpen(true)}><UserPlus className="w-4 h-4" />Issue assets</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={ClipboardList} label="Active handovers" value={counts.active} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={FileCheck2} label="Acknowledgement pending" value={counts.pending} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={AlertTriangle} label="Overdue returns" value={counts.overdue} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600" borderColor="border-l-red-500" valueColor={counts.overdue ? "text-red-600" : undefined} />
        <StatCard icon={Clock} label="Returned / closed" value={counts.closed} iconBg="bg-slate-100 dark:bg-slate-900/30" iconColor="text-slate-500" borderColor="border-l-slate-400" />
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px] flex-wrap">
              {TABS.map(t => (
                <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }}
                  className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px] transition-colors", tab === t.key ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {t.label} <span className="ml-1 text-[11px] text-muted-foreground">{counts[t.key]}</span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search handover no, asset, serial, employee…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Handover</TableHead><TableHead>Asset</TableHead><TableHead>Employee</TableHead><TableHead>Type</TableHead>
                <TableHead>Issued</TableHead><TableHead>Return</TableHead><TableHead>Acknowledgement</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && paged.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No handovers here yet.</TableCell></TableRow>}
              {paged.map(r => (
                <TableRow key={r.id}>
                  <TableCell><div className="font-mono text-xs text-primary font-semibold">{r.handoverNo}</div><div className="text-[11px] text-muted-foreground">{r.status}</div></TableCell>
                  <TableCell><div className="font-semibold text-foreground">{r.assetTag}</div><div className="text-xs text-muted-foreground">{r.assetName} · {r.serialNumber}</div></TableCell>
                  <TableCell><div className="font-medium text-foreground flex items-center gap-1.5">{r.userName}<HolderTag type={r.holderType} /></div><div className="text-xs text-muted-foreground"><span className="font-mono">{r.employeeCode || "—"}</span>{r.email ? ` · ${r.email}` : ""}</div></TableCell>
                  <TableCell className="text-sm">{r.allocationType}</TableCell>
                  <TableCell className="text-sm">{fmt(r.startDate)}<div className="text-[11px] text-muted-foreground">by {r.issuedBy || "—"}</div></TableCell>
                  <TableCell className="text-sm">
                    {r.status === "Active"
                      ? (r.expectedReturnDate ? <span className={cn(isOverdue(r) && "text-red-600 font-semibold")}>due {fmt(r.expectedReturnDate)}</span> : <span className="text-muted-foreground">—</span>)
                      : <>{fmt(r.endDate)}<div className="text-[11px] text-muted-foreground">{r.returnCondition || r.status}</div></>}
                  </TableCell>
                  <TableCell>{r.status === "Active" ? <AckPill status={r.ackStatus} /> : <span className="text-xs text-muted-foreground">{r.ackStatus === "Acknowledged" ? "Acknowledged" : "—"}</span>}
                    {r.ackAt && <div className="text-[11px] text-muted-foreground mt-0.5">{r.ackMethod}</div>}
                    {r.status === "Active" && r.ackStatus === "Issue reported" && <div className="text-[11px] text-red-600 mt-0.5 max-w-[220px]">{r.disputeReason}: {r.disputeNote}</div>}
                    {r.status === "Active" && r.ackStatus === "Pending" && r.disputeResolution && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[220px]">Re-review after: {r.disputeResolution}</div>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Print note" onClick={() => printHandoverNote([r], r.status === "Active" ? "issue" : "return")}><Printer className="w-4 h-4" /></Button>
                      {isAdmin && r.status === "Active" && r.ackStatus === "Issue reported" &&
                        <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200" onClick={() => setResolve(r)}>Resolve issue</Button>}
                      {isAdmin && r.status === "Active" && r.ackStatus === "Pending" &&
                        <Button size="sm" variant="ghost" title="Signed copy received" onClick={() => markAcknowledged(r, toast, refresh)}><FileCheck2 className="w-4 h-4 text-emerald-600" /></Button>}
                      {isAdmin && r.status === "Active" && assetOf(r) &&
                        <Button size="sm" variant="ghost" title="Return" onClick={() => setReturnAsset(assetOf(r))}><Undo2 className="w-4 h-4 text-primary" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </CardContent>
      </Card>

      {pickOpen && <PickAssets assets={assets.filter((a: any) => a.status === "In Stock")} onClose={() => setPickOpen(false)} onPick={sel => { setPickOpen(false); setIssueAssets(sel); }} />}
      {issueAssets && <IssueDialog assets={issueAssets} onClose={() => setIssueAssets(null)} onDone={refresh} />}
      {returnAsset && <ReturnDialog asset={returnAsset} onClose={() => setReturnAsset(null)} onDone={refresh} />}
      {resolve && <ResolveIssueDialog h={resolve} onClose={() => setResolve(null)} onDone={refresh} onReturn={assetOf(resolve) ? () => setReturnAsset(assetOf(resolve)) : undefined} />}
      {bulkOpen && <BulkAssignDialog onClose={() => setBulkOpen(false)} onDone={refresh} />}
    </div>
  );
}

function PickAssets({ assets, onClose, onPick }: { assets: any[]; onClose: () => void; onPick: (a: any[]) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number[]>([]);
  const list = assets.filter(a => !q.trim() || [a.assetTag, a.name, a.serialNumber, a.type].some((v: string) => v?.toLowerCase().includes(q.toLowerCase())));
  const toggle = (id: number) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select assets to issue</DialogTitle>
          <DialogDescription>Only assets that are In Stock can be issued. Pick one or several for the same employee.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search tag, name, serial, type…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex-1 overflow-y-auto border rounded-[10px] divide-y">
          {list.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No assets in stock.</div>}
          {list.map(a => (
            <label key={a.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/40 cursor-pointer">
              <Checkbox checked={sel.includes(a.id)} onCheckedChange={() => toggle(a.id)} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">{a.assetTag} <span className="font-normal text-muted-foreground">· {a.type}</span></div>
                <div className="text-xs text-muted-foreground truncate">{a.name} · SN {a.serialNumber}{a.location ? ` · ${a.location}` : ""}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-start gap-2 pt-3 border-t">
          <Button disabled={!sel.length} onClick={() => onPick(assets.filter(a => sel.includes(a.id)))}>Continue with {sel.length || ""} asset{sel.length === 1 ? "" : "s"}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
