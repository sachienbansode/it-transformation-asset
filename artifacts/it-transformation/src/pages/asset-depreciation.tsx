import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { StatCard } from "@/components/stat-card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { Tabs, inr, inrShort, fmtDate, downloadCsv, DepScheduleDialog, FinanceUploadDialog, downloadFinanceSheet } from "@/components/asset-finance";
import { Landmark, TrendingDown, PackagePlus, Wallet, Search, Download, Upload, AlertTriangle, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE = 15;

export default function AssetDepreciation() {
  const initial = new URLSearchParams(window.location.search).get("tab");
  const [tab, setTab] = useState<"register" | "missing" | "rules">(initial === "missing" ? "missing" : initial === "rules" ? "rules" : "register");
  const [fy, setFy] = useState<number | null>(null);
  const { isAdmin } = useAuth();
  const [upload, setUpload] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["asset-depreciation", fy], queryFn: () => apiFetch<any>(`/asset-depreciation/register${fy ? `?fy=${fy}` : ""}`) });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Depreciation</h1>
          <p className="text-sm text-muted-foreground">Fixed-asset register for IT assets — Companies Act Schedule II useful lives, SLM or WDV, Indian financial year, pro-rata by days.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setUpload(true)}><Upload className="w-4 h-4" />Update purchase & cost</Button>}
          <Tabs tabs={[{ key: "register", label: "Register" }, { key: "missing", label: "Missing data", count: data?.missing?.length }, { key: "rules", label: "Rules" }]} value={tab} onChange={setTab} />
        </div>
      </div>
      {tab === "register" && <Register data={data} isLoading={isLoading} fy={fy} setFy={setFy} />}
      {tab === "missing" && <Missing data={data} onUpload={() => setUpload(true)} />}
      {tab === "rules" && <Rules />}
      <FinanceUploadDialog open={upload} onClose={() => setUpload(false)} />
    </div>
  );
}

function Register({ data, isLoading, fy, setFy }: { data: any; isLoading: boolean; fy: number | null; setFy: (n: number) => void }) {
  const [q, setQ] = useState(""); const [type, setType] = useState(""); const [page, setPage] = useState(1);
  const [sched, setSched] = useState<number | null>(null);
  const rows: any[] = data?.rows || [];
  const t = data?.totals || {};
  const types = [...new Set(rows.map(r => r.type))].sort();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => (!type || r.type === type) && (!s || [r.assetTag, r.name, r.serialNumber, r.location, r.purchaseOrderNo, r.invoiceNo].some((v: string) => v?.toLowerCase().includes(s))));
  }, [rows, q, type]);
  const partial = data && data.asOf < data.to;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <select className="h-9 rounded-md border bg-background px-3 text-sm font-medium" value={fy ?? data?.fy ?? ""} onChange={e => { setFy(Number(e.target.value)); setPage(1); }}>
          {(data?.years || []).map((y: any) => <option key={y.fy} value={y.fy}>{y.label}</option>)}
        </select>
        {data && <span className="text-sm text-muted-foreground">{fmtDate(data.from)} – {fmtDate(data.asOf)}{partial ? " (year to date)" : ""}</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Landmark} label="Gross block (closing)" value={inrShort(t.grossClosing)} sub={`opening ${inrShort(t.grossOpening)}`} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={PackagePlus} label="Additions / deletions" value={inrShort(t.additions)} sub={`deleted ${inrShort(t.deletions)}`} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={TrendingDown} label={`Depreciation ${partial ? "YTD" : "for the year"}`} value={inrShort(t.depreciation)} sub={`accumulated ${inrShort(t.accClosing)}`} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={Wallet} label="Net block (book value)" value={inrShort(t.netClosing)} sub={`opening ${inrShort(t.netOpening)}`} iconBg="bg-[#2D7FF9]/20" iconColor="text-[#2D7FF9]" borderColor="border-l-[#2D7FF9]" />
      </div>
      {data?.missing?.length > 0 && <div className="flex items-start gap-2 rounded-[10px] border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{data.missing.length} asset(s) are not in the register because purchase date or cost is missing. See the Missing data tab.</span></div>}

      {data?.byType?.length > 0 && <Card><CardContent className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">By asset type</div>
        <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Assets</TableHead><TableHead className="text-right">Gross block</TableHead><TableHead className="text-right">Depreciation</TableHead><TableHead className="text-right">Net block</TableHead></TableRow></TableHeader>
          <TableBody>{data.byType.sort((a: any, b: any) => b.gross - a.gross).map((r: any) => (
            <TableRow key={r.type}><TableCell>{r.type}</TableCell><TableCell className="text-right">{r.count}</TableCell><TableCell className="text-right tabular-nums">{inr(r.gross)}</TableCell><TableCell className="text-right tabular-nums">{inr(r.depreciation)}</TableCell><TableCell className="text-right tabular-nums">{inr(r.net)}</TableCell></TableRow>
          ))}</TableBody></Table>
      </CardContent></Card>}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search tag, model, serial, PO, invoice…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="">All types</option>{types.map(x => <option key={x}>{x}</option>)}</select>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadCsv(list, [["Asset Tag", "assetTag"], ["Asset", "name"], ["Type", "type"], ["Serial", "serialNumber"], ["Location", "location"], ["PO", "purchaseOrderNo"], ["Invoice", "invoiceNo"], ["Purchase Date", "purchaseDate"],
              ["Method", "method"], ["Life (yrs)", "lifeYears"], ["Residual", "salvage"], ["Gross Opening", "grossOpening"], ["Additions", "additions"], ["Deletions", "deletions"], ["Gross Closing", "grossClosing"],
              ["Acc Dep Opening", "accOpening"], ["Depreciation", "depreciation"], ["Acc Dep on Deletion", "accOnDeletion"], ["Acc Dep Closing", "accClosing"], ["Net Opening", "netOpening"], ["Net Closing", "netClosing"],
              ["Disposal Date", "disposalDate"], ["Book Value at Disposal", "bookAtDisposal"], ["Disposal Value", "disposalValue"], ["Gain / (Loss)", "gainLoss"]], `fixed_asset_register_${(data?.label || "").replace(/\s+/g, "_")}.csv`)}><Download className="w-4 h-4" />Export register</Button>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Asset</TableHead><TableHead>Purchased</TableHead><TableHead className="text-right">Cost</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Opening WDV</TableHead><TableHead className="text-right">Depreciation</TableHead><TableHead className="text-right">Closing WDV</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Calculating…</TableCell></TableRow>}
              {!isLoading && !list.length && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No assets with purchase date and cost in this year. Use "Update purchase & cost" to fill them in.</TableCell></TableRow>}
              {list.slice((page - 1) * PAGE, page * PAGE).map(r => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSched(r.id)}>
                  <TableCell><div className="font-mono text-xs text-primary font-semibold">{r.assetTag}</div><div className="text-sm">{r.name}</div></TableCell>
                  <TableCell className="text-sm">{fmtDate(r.purchaseDate)}{r.additions > 0 && <div className="text-[11px] text-emerald-600 font-semibold">addition this year</div>}{r.deletions > 0 && <div className="text-[11px] text-red-600 font-semibold">disposed {fmtDate(r.disposalDate)}</div>}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.grossOpening + r.additions)}</TableCell>
                  <TableCell className="text-xs">{r.method} {r.method !== "None" && `· ${r.lifeYears}y`}{r.source === "asset" && <div className="text-[10px] text-muted-foreground">asset-specific</div>}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.netOpening)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.depreciation)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{r.deletions > 0 ? <span className="text-muted-foreground font-normal">disposed</span> : inr(r.netClosing)}{r.fullyDepreciated && <div className="text-[10px] text-amber-600 font-semibold">fully depreciated</div>}</TableCell>
                </TableRow>
              ))}
              {list.length > 0 && <TableRow className="bg-muted/40 font-semibold"><TableCell colSpan={2}>Total ({list.length})</TableCell>
                <TableCell className="text-right tabular-nums">{inr(list.reduce((s, r) => s + r.grossOpening + r.additions, 0))}</TableCell><TableCell />
                <TableCell className="text-right tabular-nums">{inr(list.reduce((s, r) => s + r.netOpening, 0))}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(list.reduce((s, r) => s + r.depreciation, 0))}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(list.reduce((s, r) => s + r.netClosing, 0))}</TableCell></TableRow>}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={Math.ceil(list.length / PAGE) || 1} totalItems={list.length} pageSize={PAGE} onPageChange={setPage} />
        </CardContent>
      </Card>
      {sched !== null && <DepScheduleDialog assetId={sched} onClose={() => setSched(null)} />}
    </>
  );
}

function Missing({ data, onUpload }: { data: any; onUpload: () => void }) {
  const { isAdmin } = useAuth(); const { toast } = useToast();
  const [page, setPage] = useState(1);
  const rows: any[] = data?.missing || [];
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground max-w-2xl">These assets need a purchase date and cost before depreciation, book value and warranty reports can include them. Download the sheet, fill it from the purchase invoices, and upload it back.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => { const n = await downloadFinanceSheet(true); toast({ title: `Sheet with ${n} assets downloaded` }); }}><Download className="w-4 h-4" />Download sheet</Button>
            {isAdmin && <Button size="sm" className="gap-1.5" onClick={onUpload}><Upload className="w-4 h-4" />Upload filled sheet</Button>}
          </div>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Type</TableHead><TableHead>Serial</TableHead><TableHead>Location</TableHead><TableHead>Missing</TableHead></TableRow></TableHeader>
          <TableBody>
            {!rows.length && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Every asset has a purchase date and cost.</TableCell></TableRow>}
            {rows.slice((page - 1) * PAGE, page * PAGE).map(r => (
              <TableRow key={r.id}>
                <TableCell><div className="font-mono text-xs text-primary font-semibold">{r.assetTag}</div><div className="text-sm">{r.name}</div></TableCell>
                <TableCell className="text-sm">{r.type}</TableCell><TableCell className="text-sm font-mono">{r.serialNumber}</TableCell><TableCell className="text-sm">{r.location || "—"}</TableCell>
                <TableCell className="text-sm text-amber-700 dark:text-amber-300">{r.missing.join(", ")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={Math.ceil(rows.length / PAGE) || 1} totalItems={rows.length} pageSize={PAGE} onPageChange={setPage} />
      </CardContent>
    </Card>
  );
}

function Rules() {
  const qc = useQueryClient(); const { toast } = useToast(); const { isAdmin } = useAuth();
  const { data: rules = [] } = useQuery({ queryKey: ["asset-dep-rules"], queryFn: () => apiFetch<any[]>("/asset-depreciation/rules") });
  const [draft, setDraft] = useState<Record<number, any>>({});
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => { setDraft(Object.fromEntries(rules.map(r => [r.id, { method: r.method, usefulLifeYears: Number(r.usefulLifeYears), salvagePct: Number(r.salvagePct), notes: r.notes || "" }]))); }, [rules]);
  const dirty = (r: any) => { const d = draft[r.id]; return d && (d.method !== r.method || Number(d.usefulLifeYears) !== Number(r.usefulLifeYears) || Number(d.salvagePct) !== Number(r.salvagePct) || (d.notes || "") !== (r.notes || "")); };
  const set = (id: number, k: string, v: any) => setDraft(p => ({ ...p, [id]: { ...p[id], [k]: v } }));
  const rate = (d: any) => d && d.method === "WDV" && d.usefulLifeYears > 0 ? `${((1 - Math.pow(Math.max(Number(d.salvagePct), 5) / 100, 1 / d.usefulLifeYears)) * 100).toFixed(2)}% p.a.` : d && d.method === "SLM" && d.usefulLifeYears > 0 ? `${((100 - Number(d.salvagePct)) / d.usefulLifeYears).toFixed(2)}% p.a.` : "—";
  async function save(r: any) {
    const d = draft[r.id];
    if (!await confirmDialog(`Change the ${r.assetType} rule to ${d.method}${d.method !== "None" ? `, ${d.usefulLifeYears} years, ${d.salvagePct}% residual` : ""}?\n\nAll ${r.assetType} assets without their own override are recalculated, including past years in the register.`, { title: "Update depreciation rule", confirmText: "Save rule" })) return;
    setBusy(r.id);
    try { await apiFetch(`/asset-depreciation/rules/${r.id}`, { method: "PUT", body: JSON.stringify(d) }); ["asset-dep-rules", "asset-depreciation", "asset-dashboard", "asset-coverage", "asset-dep"].forEach(k => qc.invalidateQueries({ queryKey: [k] })); toast({ title: `${r.assetType} rule saved` }); }
    catch (x: any) { toast({ title: "Could not save", description: x.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">Default method and useful life per asset type. Defaults follow Companies Act 2013 Schedule II (end-user computers 3 years, servers & networks 6 years) with 5% residual value. An individual asset can override these in its edit form.</p>
        <Table>
          <TableHeader><TableRow><TableHead>Asset type</TableHead><TableHead>Method</TableHead><TableHead>Useful life (yrs)</TableHead><TableHead>Residual %</TableHead><TableHead>Effective rate</TableHead><TableHead>Basis / notes</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rules.map(r => { const d = draft[r.id]; if (!d) return null; return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.assetType}</TableCell>
                <TableCell><select disabled={!isAdmin} className="h-8 rounded-md border bg-background px-2 text-sm" value={d.method} onChange={e => set(r.id, "method", e.target.value)}><option value="SLM">SLM</option><option value="WDV">WDV</option><option value="None">None</option></select></TableCell>
                <TableCell><Input disabled={!isAdmin || d.method === "None"} type="number" min={0.5} step={0.5} className="h-8 w-20" value={d.usefulLifeYears} onChange={e => set(r.id, "usefulLifeYears", e.target.value)} /></TableCell>
                <TableCell><Input disabled={!isAdmin || d.method === "None"} type="number" min={0} max={99} className="h-8 w-20" value={d.salvagePct} onChange={e => set(r.id, "salvagePct", e.target.value)} /></TableCell>
                <TableCell className="text-sm text-muted-foreground tabular-nums">{rate(d)}</TableCell>
                <TableCell><Input disabled={!isAdmin} className="h-8 min-w-[200px]" value={d.notes} onChange={e => set(r.id, "notes", e.target.value)} /></TableCell>
                <TableCell>{isAdmin && <Button size="sm" variant={dirty(r) ? "default" : "ghost"} disabled={!dirty(r) || busy === r.id} className={cn("gap-1.5", !dirty(r) && "opacity-40")} onClick={() => save(r)}>{busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save</Button>}</TableCell>
              </TableRow>
            ); })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
