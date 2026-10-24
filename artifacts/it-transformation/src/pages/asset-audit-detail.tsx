import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { QrScanner } from "@/components/qr-scanner";
import { AUDIT_STATUS_STYLE } from "@/pages/asset-audits";
import { ArrowLeft, Camera, CameraOff, Play, CheckCircle2, XCircle, Download, Printer, Undo2, Search, MapPin, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";

const RESULT_STYLE: Record<string, string> = {
  Pending: "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  Found: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  "Location mismatch": "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  Missing: "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300",
  "Not in scope": "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300",
  "Unknown tag": "bg-zinc-100 text-zinc-600 dark:bg-zinc-400/10 dark:text-zinc-300",
};
const TABS = ["Pending", "Found", "Location mismatch", "Missing", "Not in scope", "Unknown tag", "All"] as const;
const fmtDT = (d?: string | null) => d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
const LOC_KEY = "ashika-audit-location";

export default function AssetAuditDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canAccess } = useAuth(); const isAdmin = canAccess("asset_audits", "write");
  const { data: a, isLoading } = useQuery({ queryKey: ["asset-audit", id], queryFn: () => apiFetch<any>(`/asset-audits/${id}`), refetchInterval: 15000 });
  const { data: opt } = useQuery({ queryKey: ["asset-audit-options"], queryFn: () => apiFetch<any>("/asset-audits/options") });
  const [tab, setTab] = useState<typeof TABS[number]>("Pending");
  const [q, setQ] = useState("");
  const [camera, setCamera] = useState(false);
  const [location, setLocation] = useState<string>(() => { try { return localStorage.getItem(LOC_KEY) || ""; } catch { return ""; } });
  const [customLoc, setCustomLoc] = useState("");
  const [condition, setCondition] = useState("Good");
  const [remarks, setRemarks] = useState("");
  const [manual, setManual] = useState("");
  const [feed, setFeed] = useState<any[]>([]);
  const busy = useRef(false);
  const recent = useRef<Map<string, number>>(new Map()); // tag -> last time recorded in this session

  useEffect(() => { try { if (location) localStorage.setItem(LOC_KEY, location); } catch { /* ignore */ } }, [location]);
  const effectiveLoc = location === "__other__" ? customLoc.trim() : location;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["asset-audit", id] }); qc.invalidateQueries({ queryKey: ["asset-audits"] }); };

  const items: any[] = a?.items || [];
  useEffect(() => { if (a?.status === "Completed" && tab === "Pending") setTab("Missing"); }, [a?.status]);
  const c = a?.counts || {};
  const shown = useMemo(() => {
    let l = tab === "All" ? items : items.filter(i => i.result === tab);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter(i => [i.assetTag, i.assetName, i.serialNumber, i.expectedLocation, i.expectedHolder, i.foundLocation].some((v: string) => v?.toLowerCase().includes(t)));
    return l;
  }, [items, tab, q]);
  const locations: string[] = useMemo(() => {
    const set = new Set<string>((opt?.locations || []).map((o: any) => o.value));
    (a?.scopeLocations || "").split(",").map((x: string) => x.trim()).filter(Boolean).forEach((x: string) => set.add(x));
    return [...set];
  }, [opt, a]);

  async function scan(code: string, method: "QR scan" | "Manual") {
    if (busy.current) return;
    if (!effectiveLoc) { toast({ title: "Select where you are auditing first", variant: "destructive" }); return; }
    // the camera keeps seeing the same sticker — ignore repeats of a just-recorded tag for 20 s
    const key = code.trim().toUpperCase().replace(/^.*\/A\//, "");
    if (method === "QR scan" && Date.now() - (recent.current.get(key) || 0) < 20000) return;
    recent.current.set(key, Date.now());
    busy.current = true;
    try {
      const r: any = await apiFetch(`/asset-audits/${id}/scan`, { method: "POST", body: JSON.stringify({ code, location: effectiveLoc, condition, remarks: remarks.trim() || null, method }) });
      const it = r.item;
      setFeed(f => [{ ...it, repeat: r.repeat, at: Date.now() }, ...f].slice(0, 8));
      const msg = it.result === "Found" ? "Verified" : it.result === "Location mismatch" ? `Location mismatch — register says ${it.expectedLocation || "—"}` :
        it.result === "Not in scope" ? "Registered asset, but not in this audit's scope" : it.result === "Unknown tag" ? "Tag not found in the asset register" : it.result;
      toast({ title: `${it.assetTag}${r.repeat ? " (scanned again)" : ""}`, description: msg, variant: it.result === "Unknown tag" ? "destructive" : undefined });
      setRemarks(""); setCondition("Good"); setManual("");
      refresh();
    } catch (e: any) { toast({ title: "Scan not recorded", description: e.message, variant: "destructive" }); }
    finally { setTimeout(() => { busy.current = false; }, 600); }
  }

  async function act(path: string, body: any, ok: string) {
    try { await apiFetch(`/asset-audits/${id}/${path}`, { method: "POST", body: JSON.stringify(body) }); toast({ title: ok }); refresh(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }
  async function start() {
    if (await confirmDialog(`Start audit ${a.auditNo}? Auditors can then scan assets.`, { title: "Start audit", confirmText: "Start" })) act("start", {}, "Audit started");
  }
  async function complete() {
    const pending = c.Pending || 0;
    if (!await confirmDialog(`Complete audit ${a.auditNo}?\n\n${c.verified}/${c.expected} verified.${pending ? `\n${pending} asset(s) not scanned will be marked MISSING.` : ""}\n\nEach verified or missing asset gets an entry in its history.`,
      { title: "Complete audit", confirmText: "Continue", destructive: pending > 0 })) return;
    const mism = c["Location mismatch"] || 0;
    const apply = mism > 0 ? await confirmDialog(`${mism} asset(s) were found at a different location than the register shows.\n\nUpdate the register to the location where they were found?`, { title: "Location mismatches", confirmText: "Update register", cancelText: "Keep register as is" }) : false;
    act("complete", { applyLocations: apply }, "Audit completed");
  }
  async function cancel() {
    if (await confirmDialog(`Cancel audit ${a.auditNo}? Scans recorded so far are kept but the audit is closed without a result.`, { title: "Cancel audit", confirmText: "Cancel audit", cancelText: "Keep audit", destructive: true }))
      act("cancel", { reason: "Cancelled by user" }, "Audit cancelled");
  }
  async function undo(it: any) {
    if (await confirmDialog(`Undo the scan of ${it.assetTag}?`, { title: "Undo scan", confirmText: "Undo" })) {
      try { await apiFetch(`/asset-audits/${id}/items/${it.id}/reset`, { method: "POST", body: "{}" }); refresh(); }
      catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    }
  }

  function exportCsv() {
    const cols: [string, string][] = [["Asset Tag", "assetTag"], ["Asset", "assetName"], ["Serial", "serialNumber"], ["Expected Location", "expectedLocation"], ["Holder", "expectedHolder"],
      ["Register Status", "expectedStatus"], ["Result", "result"], ["Found At", "foundLocation"], ["Condition", "condition"], ["Remarks", "remarks"], ["Scanned By", "scannedBy"], ["Scanned At", "scannedAt"], ["Method", "method"]];
    const e = (v: any) => { const s = String(v ?? "").replace(/"/g, '""'); return /[,"\n]/.test(s) ? `"${s}"` : s; };
    const csv = [cols.map(x => x[0]).join(","), ...items.map(r => cols.map(x => e(r[x[1]])).join(","))].join("\n");
    const el = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `${a.auditNo}_audit.csv` });
    el.click(); URL.revokeObjectURL(el.href);
  }

  function printReport() {
    const esc = (v: any) => String(v ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
    const section = (title: string, rows: any[], cols: [string, (r: any) => any][]) => rows.length ? `<h3>${title} (${rows.length})</h3><table><thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(c[1](r))}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "";
    const by = (res: string) => items.filter(i => i.result === res);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(a.auditNo)} audit report</title><style>
      body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#3A4756;margin:28px;font-size:12px}h1{color:#0F2A4A;font-size:19px;margin:0}h3{color:#0F2A4A;margin:20px 0 6px;font-size:13.5px}
      .m{color:#8592A0}.k{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:14px 0}.k div{border:1px solid #EBEFF4;border-radius:10px;padding:8px}.k b{display:block;font-size:18px;color:#0F2A4A}
      table{width:100%;border-collapse:collapse}th{background:#F1F4F8;text-align:left;font-size:10px;text-transform:uppercase;padding:6px}td{padding:6px;border-bottom:1px solid #EBEFF4}</style></head><body>
      <h1>Physical Audit Report — ${esc(a.auditNo)}</h1><div class="m">${esc(a.name)} · Scope: ${esc(a.scopeLocations || "All locations")}${a.scopeDepartments ? " · " + esc(a.scopeDepartments) : ""}${a.scopeTypes ? " · " + esc(a.scopeTypes) : ""} · Status: ${esc(a.status)}${a.completedAt ? " on " + esc(fmtDT(a.completedAt)) + " by " + esc(a.completedBy) : ""}</div>
      <div class="k"><div>Expected<b>${c.expected}</b></div><div>Verified<b>${c.verified}</b></div><div>Location mismatch<b>${c["Location mismatch"]}</b></div><div>${a.status === "Completed" ? "Missing" : "Pending"}<b>${a.status === "Completed" ? c.Missing : c.Pending}</b></div><div>Not in scope<b>${c["Not in scope"]}</b></div><div>Unknown tags<b>${c["Unknown tag"]}</b></div></div>
      ${section("Missing", by("Missing"), [["Tag", r => r.assetTag], ["Asset", r => r.assetName], ["Serial", r => r.serialNumber], ["Expected location", r => r.expectedLocation], ["Holder", r => r.expectedHolder]])}
      ${section("Location mismatch", by("Location mismatch"), [["Tag", r => r.assetTag], ["Asset", r => r.assetName], ["Register location", r => r.expectedLocation], ["Found at", r => r.foundLocation], ["Condition", r => r.condition], ["Remarks", r => r.remarks]])}
      ${section("Found outside scope / unknown", [...by("Not in scope"), ...by("Unknown tag")], [["Tag", r => r.assetTag], ["Result", r => r.result], ["Found at", r => r.foundLocation], ["Remarks", r => r.remarks], ["By", r => r.scannedBy]])}
      ${section("Damaged / not working", items.filter(i => i.condition === "Damaged" || i.condition === "Not working"), [["Tag", r => r.assetTag], ["Asset", r => r.assetName], ["Condition", r => r.condition], ["Remarks", r => r.remarks]])}
      ${section("Verified", by("Found"), [["Tag", r => r.assetTag], ["Asset", r => r.assetName], ["Found at", r => r.foundLocation], ["Condition", r => r.condition], ["By", r => r.scannedBy], ["When", r => fmtDT(r.scannedAt)]])}
      <script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank", "width=1000,height=900"); if (!w) return; w.document.open(); w.document.write(html); w.document.close();
  }

  if (isLoading || !a) return <div className="py-16 text-center text-muted-foreground">Loading audit…</div>;
  const running = a.status === "In Progress";

  return (
    <div className="space-y-4">
      <Link href="/asset-audits"><span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer"><ArrowLeft className="w-4 h-4" />All audits</span></Link>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2"><span className="font-mono text-sm text-primary font-semibold">{a.auditNo}</span><span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold", AUDIT_STATUS_STYLE[a.status])}>{a.status}</span></div>
          <h1 className="text-2xl font-bold tracking-tight">{a.name}</h1>
          <p className="text-sm text-muted-foreground">Scope: {a.scopeLocations || "All locations"}{a.scopeDepartments ? ` · ${a.scopeDepartments}` : ""}{a.scopeTypes ? ` · ${a.scopeTypes}` : ""}{a.auditors ? ` · Auditors: ${a.auditors}` : ""}</p>
          {a.notes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{a.notes}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}><Download className="w-4 h-4" />CSV</Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={printReport}><Printer className="w-4 h-4" />Report</Button>
          {isAdmin && a.status === "Planned" && <Button size="sm" className="gap-1.5" onClick={start}><Play className="w-4 h-4" />Start audit</Button>}
          {isAdmin && running && <Button size="sm" className="gap-1.5" onClick={complete}><CheckCircle2 className="w-4 h-4" />Complete</Button>}
          {isAdmin && (a.status === "Planned" || running) && <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-500/30" onClick={cancel}><XCircle className="w-4 h-4" />Cancel</Button>}
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[["Expected", c.expected, ""], ["Verified", c.verified, "text-emerald-600"], ["Mismatch", c["Location mismatch"], "text-amber-600"], [a.status === "Completed" ? "Missing" : "Pending", a.status === "Completed" ? c.Missing : c.Pending, a.status === "Completed" ? "text-red-600" : ""],
          ["Not in scope", c["Not in scope"], "text-violet-600"], ["Unknown tag", c["Unknown tag"], ""]].map(([l, v, cls]) => (
          <div key={l as string} className="rounded-[12px] border bg-card px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{l}</div><div className={cn("text-xl font-semibold text-foreground", cls as string)}>{v ?? 0}</div></div>
        ))}
      </div>
      <div><div className="h-2.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${c.progress ?? 0}%` }} /></div><div className="text-xs text-muted-foreground mt-1">{c.progress ?? 0}% verified</div></div>

      {running && isAdmin && (
        <Card>
          <CardContent className="p-4 grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />I am auditing at *</Label>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>{locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}<SelectItem value="__other__">Other / specific place…</SelectItem></SelectContent>
                </Select>
                {location === "__other__" && <Input className="mt-2" value={customLoc} onChange={e => setCustomLoc(e.target.value)} placeholder="e.g. Worli 5th floor – IT store" />}
              </div>
              {camera ? <QrScanner onScan={t => scan(t, "QR scan")} paused={!effectiveLoc} /> :
                <button type="button" onClick={() => setCamera(true)} className="w-full rounded-[12px] border-2 border-dashed hover:border-primary/60 hover:bg-accent/40 py-8 text-center">
                  <ScanLine className="w-7 h-7 mx-auto text-primary" /><div className="mt-1 text-sm font-semibold text-foreground">Open camera scanner</div><div className="text-xs text-muted-foreground">Point at the QR sticker — it records automatically</div>
                </button>}
              {camera && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCamera(false)}><CameraOff className="w-4 h-4" />Close camera</Button>}
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Condition for next scan</Label>
                  <Select value={condition} onValueChange={setCondition}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{(opt?.conditions || ["Good", "Fair", "Damaged", "Not working"]).map((x: string) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs font-medium">Remarks for next scan</Label><Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="optional" /></div>
              </div>
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (manual.trim()) scan(manual.trim(), "Manual"); }}>
                <Input value={manual} onChange={e => setManual(e.target.value)} placeholder="Or type / scan with a USB barcode reader: LAP-0001" className="font-mono" />
                <Button type="submit" disabled={!manual.trim()}>Record</Button>
              </form>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Last scans</div>
                <div className="space-y-1.5">
                  {!feed.length && <div className="text-sm text-muted-foreground">Nothing scanned in this session yet.</div>}
                  {feed.map(f => (
                    <div key={f.at} className="flex items-center justify-between gap-2 rounded-[10px] border px-3 py-1.5 text-sm">
                      <div className="min-w-0"><span className="font-mono font-semibold text-foreground">{f.assetTag}</span> <span className="text-muted-foreground truncate">{f.assetName || ""}</span></div>
                      <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap", RESULT_STYLE[f.result])}>{f.repeat ? "Again · " : ""}{f.result}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {a.status === "Planned" && <div className="rounded-[10px] border bg-accent/50 px-4 py-3 text-sm text-foreground">This audit is planned. Click <b>Start audit</b> to begin scanning.</div>}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px] flex-wrap">
              {TABS.filter(t => t !== "Pending" || a.status !== "Completed").filter(t => t !== "Missing" || a.status === "Completed").map(t => (
                <button key={t} onClick={() => setTab(t)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", tab === t ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {t} <span className="ml-1 text-[11px] text-muted-foreground">{t === "All" ? items.length : c[t] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search tag, asset, serial, location, holder…" value={q} onChange={e => setQ(e.target.value)} /></div>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Register location / holder</TableHead><TableHead>Result</TableHead><TableHead>Found at</TableHead><TableHead>Condition</TableHead><TableHead>Scanned</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {!shown.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nothing here.</TableCell></TableRow>}
              {shown.slice(0, 300).map(it => (
                <TableRow key={it.id}>
                  <TableCell>{it.assetId ? <Link href={`/a/${encodeURIComponent(it.assetTag)}`}><span className="font-mono font-semibold text-primary cursor-pointer">{it.assetTag}</span></Link> : <span className="font-mono font-semibold">{it.assetTag}</span>}
                    <div className="text-xs text-muted-foreground">{it.assetName || "—"}{it.serialNumber ? ` · ${it.serialNumber}` : ""}</div></TableCell>
                  <TableCell className="text-sm">{it.expectedLocation || "—"}<div className="text-xs text-muted-foreground">{it.expectedHolder || ""}</div></TableCell>
                  <TableCell><span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap", RESULT_STYLE[it.result])}>{it.result}</span></TableCell>
                  <TableCell className="text-sm">{it.foundLocation || "—"}{it.remarks && <div className="text-xs text-muted-foreground">{it.remarks}</div>}</TableCell>
                  <TableCell className={cn("text-sm", (it.condition === "Damaged" || it.condition === "Not working") && "text-red-600 font-semibold")}>{it.condition || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{it.scannedAt ? <>{fmtDT(it.scannedAt)}<div>{it.scannedBy} · {it.method}</div></> : "—"}</TableCell>
                  <TableCell>{running && isAdmin && it.result !== "Pending" && <Button size="sm" variant="ghost" title="Undo scan" onClick={() => undo(it)}><Undo2 className="w-4 h-4" /></Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {shown.length > 300 && <p className="text-xs text-muted-foreground">Showing first 300 of {shown.length} — use search or CSV export.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
