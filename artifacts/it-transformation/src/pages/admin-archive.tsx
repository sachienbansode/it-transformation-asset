import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, API } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { Archive, Mail, Download, RotateCcw, Loader2, Save, Send, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/* Admin › Archive & Notifications — upload / clear batches (download, restore) and email recipients per event. */

const KIND: Record<string, string> = {
  asset_register_upload: "Asset register upload", asset_bulk_assign: "Bulk assignment upload", asset_finance_upload: "Purchase / cost / warranty upload",
  asset_clear: "Asset data cleared", kpi_upload: "KPI upload",
};
const fmt = (d?: string | null) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const who = (u?: string | null) => (u || "—").replace(/\s*<[^>]+>$/, "");
const STATUS: Record<string, string> = {
  Sent: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300", Failed: "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300",
  Skipped: "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300", Queued: "bg-blue-50 text-blue-700",
};
const Pill = ({ v }: { v?: string | null }) => v ? <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold", STATUS[v] || STATUS.Skipped)}>{v}</span> : <span className="text-xs text-muted-foreground">—</span>;

export default function AdminArchive() {
  const initial = new URLSearchParams(window.location.search).get("tab");
  const [tab, setTab] = useState<"archive" | "notifications" | "log">(initial === "notifications" ? "notifications" : initial === "log" ? "log" : "archive");
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Archive & Notifications</h1>
          <p className="text-sm text-muted-foreground">Every upload and every "Clear all" is kept here as a batch. Choose who is emailed for important actions.</p>
        </div>
        <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px]">
          {([["archive", "Archive"], ["notifications", "Email notifications"], ["log", "Email log"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", tab === k ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
      </div>
      {tab === "archive" && <ArchiveTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "log" && <LogTab />}
    </div>
  );
}

function ArchiveTab() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["data-archive"], queryFn: () => apiFetch<any[]>("/data-archive") });
  const [kind, setKind] = useState(""); const [q, setQ] = useState(""); const [busy, setBusy] = useState<number | null>(null);
  const list = useMemo(() => rows.filter(r => (!kind || r.kind === kind) && (!q.trim() || [r.batchNo, r.title, r.fileName, r.createdBy].some((v: string) => v?.toLowerCase().includes(q.trim().toLowerCase())))), [rows, kind, q]);
  async function download(r: any) {
    try {
      const res = await fetch(`${API}/data-archive/${r.id}/excel`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `${r.batchNo}.xlsx`;
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name }); a.click(); URL.revokeObjectURL(a.href);
    } catch (e: any) { toast({ title: "Download failed", description: e.message, variant: "destructive" }); }
  }
  async function restore(r: any) {
    if (!await confirmDialog(`Restore ${r.batchNo}?\n\n${r.summary?.assets ?? r.rowCount} asset(s) with their vendors, licenses, contracts, handovers, audits and full history go back into the live register with their original IDs.\n\nOnly possible while the asset register is empty.`, { title: "Restore archived asset data", confirmText: "Restore" })) return;
    setBusy(r.id);
    try { const x: any = await apiFetch(`/data-archive/${r.id}/restore`, { method: "POST" }); qc.invalidateQueries(); toast({ title: "Asset data restored", description: `${x.counts.assets} assets restored from ${r.batchNo}` }); }
    catch (e: any) { toast({ title: "Restore not possible", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  }
  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search batch, file, user…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">All types</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Type</TableHead><TableHead>Summary</TableHead><TableHead>By / when</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>}
          {!isLoading && !list.length && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground"><Archive className="w-8 h-8 mx-auto mb-2 opacity-40" />No archive batches yet. Uploads and "Clear all" will appear here.</TableCell></TableRow>}
          {list.map(r => {
            const s = r.summary || {};
            const sum = r.kind === "asset_clear" ? `${s.assets ?? 0} assets · ${s.asset_allocations ?? 0} handovers · ${s.asset_transactions ?? 0} history`
              : r.kind === "kpi_upload" ? `${s.person || ""} v${s.version || ""} · +${s.added ?? 0} / ~${s.changedKpis ?? 0} / −${s.removed ?? 0}`
              : `${r.rowCount} rows · +${s.added ?? 0} added · ${s.modifiedAssets ?? 0} changed${s.registerAfter !== undefined ? ` · register ${s.registerBefore}→${s.registerAfter}` : ""}`;
            return (
              <TableRow key={r.id}>
                <TableCell><div className="font-mono text-xs text-primary font-semibold">{r.batchNo}</div><div className="text-xs text-muted-foreground truncate max-w-[220px]">{r.fileName || r.title}</div></TableCell>
                <TableCell className="text-sm">{KIND[r.kind] || r.kind}<div className="text-[11px] text-muted-foreground">{r.module}</div></TableCell>
                <TableCell className="text-sm">{sum}{r.restoredAt && <div className="text-[11px] text-emerald-600 font-semibold">Restored {fmt(r.restoredAt)} by {who(r.restoredBy)}</div>}</TableCell>
                <TableCell className="text-sm">{who(r.createdBy)}<div className="text-[11px] text-muted-foreground">{fmt(r.createdAt)}</div></TableCell>
                <TableCell><Pill v={r.emailStatus} />{r.emailTo && <div className="text-[10.5px] text-muted-foreground truncate max-w-[160px]" title={r.emailTo}>{r.emailTo}</div>}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => download(r)}><Download className="w-4 h-4" />Excel</Button>
                  {r.kind === "asset_clear" && !r.restoredAt && <Button size="sm" variant="outline" className="gap-1.5" disabled={busy === r.id} onClick={() => restore(r)}>{busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}Restore</Button>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function NotificationsTab() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["notification-rules"], queryFn: () => apiFetch<any>("/notification-rules") });
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  useEffect(() => { if (data) setDraft(Object.fromEntries(data.rules.map((r: any) => [r.eventKey, { recipients: r.recipients || "", enabled: r.enabled, attachExcel: r.attachExcel }]))); }, [data]);
  const rules: any[] = data?.rules || [];
  const dirty = (r: any) => { const d = draft[r.eventKey]; return d && (d.recipients !== (r.recipients || "") || d.enabled !== r.enabled || d.attachExcel !== r.attachExcel); };
  const bad = (v: string) => v.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean).filter(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  async function save(r: any) {
    const d = draft[r.eventKey]; const b = bad(d.recipients);
    if (b.length) { toast({ title: "Check the email addresses", description: b.join(", "), variant: "destructive" }); return; }
    if (!await confirmDialog(`Save email settings for "${r.label}"?\n\nRecipients: ${d.recipients || "(none)"}${d.enabled ? "" : "\nNotification switched OFF"}`, { title: "Email notifications", confirmText: "Save" })) return;
    setBusy(r.eventKey);
    try { await apiFetch(`/notification-rules/${r.eventKey}`, { method: "PUT", body: JSON.stringify(d) }); qc.invalidateQueries({ queryKey: ["notification-rules"] }); toast({ title: "Saved", description: r.label }); }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  async function test() {
    setBusy("test");
    try { await apiFetch("/notification-rules/test", { method: "POST", body: JSON.stringify({ to: testTo }) }); toast({ title: "Test email sent", description: testTo }); }
    catch (e: any) { toast({ title: "Test email failed", description: e.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  const modules = [...new Set(rules.map(r => r.module))];
  return (
    <div className="space-y-4">
      <div className={cn("flex items-start gap-3 rounded-[12px] border px-4 py-3 text-sm", data?.mail?.configured ? "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10" : "border-amber-400/40 bg-amber-50 dark:bg-amber-500/10")}>
        {data?.mail?.configured ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600" />}
        <div className="flex-1">
          {data?.mail?.configured ? <>Microsoft 365 mail is set up — emails are sent from <b>{data.mail.from}</b>.</> : <>Microsoft 365 mail is <b>not yet configured on the server</b>. Recipients can be set now; emails are logged as "Skipped" until the server's MAIL_M365_* settings are added.</>}
          <div className="flex flex-wrap gap-2 mt-2">
            <Input className="h-8 max-w-xs bg-background" placeholder="Send a test email to…" value={testTo} onChange={e => setTestTo(e.target.value)} />
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!testTo.trim() || busy === "test"} onClick={test}>{busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send test</Button>
          </div>
        </div>
      </div>
      {modules.map(m => (
        <Card key={m}><CardContent className="p-4 space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{m}</div>
          {rules.filter(r => r.module === m).map(r => {
            const d = draft[r.eventKey]; if (!d) return null; const b = bad(d.recipients);
            return (
              <div key={r.eventKey} className="grid gap-2 md:grid-cols-[260px_1fr_auto] items-start border-t pt-3 first:border-0 first:pt-0">
                <div><div className="font-medium text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-primary" />{r.label}</div><div className="text-xs text-muted-foreground">{r.description}</div></div>
                <div className="space-y-1.5">
                  <Input placeholder="name@ashikagroup.com, it.team@ashikagroup.com" value={d.recipients} onChange={e => setDraft(p => ({ ...p, [r.eventKey]: { ...d, recipients: e.target.value } }))} className={cn(b.length && "border-red-500")} />
                  {b.length > 0 && <div className="text-[11px] text-red-600">Not valid: {b.join(", ")}</div>}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <label className="flex items-center gap-2"><Switch checked={d.enabled} onCheckedChange={v => setDraft(p => ({ ...p, [r.eventKey]: { ...d, enabled: v } }))} />Send emails</label>
                    <label className="flex items-center gap-2"><Switch checked={d.attachExcel} onCheckedChange={v => setDraft(p => ({ ...p, [r.eventKey]: { ...d, attachExcel: v } }))} />Attach Excel</label>
                    {r.updatedBy && <span>Last changed by {who(r.updatedBy)} · {fmt(r.updatedAt)}</span>}
                  </div>
                </div>
                <Button size="sm" variant={dirty(r) ? "default" : "ghost"} disabled={!dirty(r) || busy === r.eventKey} className={cn("gap-1.5", !dirty(r) && "opacity-40")} onClick={() => save(r)}>{busy === r.eventKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save</Button>
              </div>
            );
          })}
        </CardContent></Card>
      ))}
    </div>
  );
}

function LogTab() {
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["email-outbox"], queryFn: () => apiFetch<any[]>("/email-outbox") });
  return (
    <Card><CardContent className="p-4">
      <Table>
        <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Subject</TableHead><TableHead>To</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>}
          {!isLoading && !rows.length && <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">No emails yet.</TableCell></TableRow>}
          {rows.map(r => (
            <TableRow key={r.id}>
              <TableCell className="text-sm whitespace-nowrap">{fmt(r.createdAt)}</TableCell>
              <TableCell className="text-sm">{r.subject}<div className="text-[11px] text-muted-foreground">{r.batchNo ? `${r.batchNo} · ` : ""}{r.attachmentName || "no attachment"}</div></TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[220px] break-words">{r.recipients || "—"}</TableCell>
              <TableCell><Pill v={r.status} />{r.error && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[260px]">{r.error}</div>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}
