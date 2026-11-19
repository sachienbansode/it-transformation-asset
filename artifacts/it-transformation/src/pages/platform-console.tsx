import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmHeader } from "@/components/confirm-dialog";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Server, Plus, Send, Rocket, AlertTriangle, Loader2, CheckCircle2, Clock, XCircle, Database } from "lucide-react";

/* ITH-120 — NIYTRI platform console: clients, releases (GitHub), client consent, deployments. */
const ST: Record<string, string> = { Pending: "text-amber-600", Approved: "text-emerald-600", Deferred: "text-blue-600", Rejected: "text-red-600", Deployed: "text-slate-600", Withdrawn: "text-muted-foreground",
  Queued: "text-amber-600", Running: "text-blue-600", Done: "text-emerald-600", Failed: "text-red-600", Active: "text-emerald-600", Provisioning: "text-amber-600", Suspended: "text-muted-foreground" };

function NewClient({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast(); const qc = useQueryClient();
  const [f, setF] = useState<any>({ existing: false }); const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function save() {
    try {
      const r = await apiFetch<any>("/platform/clients", { method: "POST", body: JSON.stringify(f), headers: confirmHeader(f.existing ? `Register the existing instance ${f.code} (${f.domain}, database ${f.dbName})?` : `Create client ${f.code}: new empty database ${f.dbName}, web address https://${f.domain}, first Super Admin ${f.adminEmail}? The server sets it up within a few minutes.`) });
      toast({ title: r.queued ? "Client queued — the server is setting it up" : "Client registered" }); qc.invalidateQueries({ queryKey: ["platform"] }); onClose(); setF({ existing: false });
    } catch (e: any) { if (!e.cancelled) toast({ title: "Not saved", description: e.message, variant: "destructive" }); }
  }
  const field = (k: string, label: string, ph: string, hint?: string) => <div className="space-y-1"><div className="text-xs font-medium">{label}</div><Input className="h-8" value={f[k] || ""} onChange={e => set(k, e.target.value)} placeholder={ph} />{hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}</div>;
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}><DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{f.existing ? "Register an existing instance" : "New client"}</DialogTitle><DialogDescription>{f.existing ? "Adds an instance that is already running so it can be updated from here." : "Creates an empty database on the shared RDS server and a separate IT Hub instance with its own web address. Only the first Super Admin is created."}</DialogDescription></DialogHeader>
      <div className="flex gap-2 text-xs"><button className={cn("rounded-md border px-2 py-1", !f.existing && "bg-primary text-primary-foreground")} onClick={() => set("existing", false)}>New client</button><button className={cn("rounded-md border px-2 py-1", f.existing && "bg-primary text-primary-foreground")} onClick={() => set("existing", true)}>Existing instance</button></div>
      <div className="grid grid-cols-2 gap-3">
        {field("code", "Client code", "e.g. ashikamf", "Lower-case; used for the folder and service")}
        {field("name", "Client name", "e.g. Ashika Global AMC")}
        {field("domain", "Web address", "ithub-client.niytri.com", "DNS must point to the server first")}
        {field("dbName", "Database", "ithub_client")}
        {!f.existing && field("adminEmail", "First Super Admin email", "admin@niytri.com")}
        {field("contactEmail", "Client contact email", "it.head@client.com", "Optional")}
        {f.existing && field("folder", "Folder on the server", "/opt/it-hub-client")}
      </div>
      <Button onClick={save} className="gap-1.5"><Plus className="w-4 h-4" />{f.existing ? "Register" : "Create client"}</Button>
    </DialogContent></Dialog>
  );
}

function ClientRow({ c, releases }: { c: any; releases: any[] }) {
  const { toast } = useToast(); const qc = useQueryClient(); const [tag, setTag] = useState(releases[0]?.tag || ""); const [when, setWhen] = useState(""); const [emerg, setEmerg] = useState(""); const [showE, setShowE] = useState(false);
  const cur = c.live?.lastDeployment?.version; const req = c.live?.lastRequest; const rel = releases.find(r => r.tag === tag);
  async function ask() {
    try { await apiFetch(`/platform/clients/${c.id}/request-update`, { method: "POST", body: JSON.stringify({ tag, plannedAt: when || null }), headers: confirmHeader(`Send version ${rel?.version} to ${c.name} for approval${when ? `, planned ${when.replace("T", " ")}` : ""}? Their Super Admins are notified.`) });
      toast({ title: "Sent for approval" }); qc.invalidateQueries({ queryKey: ["platform"] }); } catch (e: any) { if (!e.cancelled) toast({ title: "Not sent", description: e.message, variant: "destructive" }); }
  }
  async function deploy() {
    try { const r = await apiFetch<any>(`/platform/clients/${c.id}/deploy`, { method: "POST", body: JSON.stringify({ tag, emergencyReason: showE ? emerg : "" }), headers: confirmHeader(`Deploy version ${rel?.version} to ${c.name}${showE ? ` WITHOUT approval — emergency: ${emerg}` : ""}?`) });
      toast({ title: `Deployment queued (job ${r.jobId})` }); setShowE(false); setEmerg(""); qc.invalidateQueries({ queryKey: ["platform"] }); } catch (e: any) { if (!e.cancelled) toast({ title: "Not queued", description: e.message, variant: "destructive" }); }
  }
  return (
    <div className="py-3 space-y-2" data-testid={`client-${c.code}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Database className="w-4 h-4 text-primary" /><span className="font-semibold">{c.name}</span><span className="text-xs font-mono text-muted-foreground">{c.code}</span>
        <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{c.domain}</a>
        <span className={cn("text-xs", ST[c.status])}>{c.status}</span>
        <span className="ml-auto text-xs">{c.live?.reachable === false ? <span className="text-red-600">Database not reachable</span> : cur ? <>On <b>{cur}</b> <span className="text-muted-foreground">({fmtDateTime(c.live.lastDeployment.at)})</span></> : c.status === "Active" ? "No deployment recorded" : ""}</span>
      </div>
      {c.live?.counts && <div className="text-[11px] text-muted-foreground">{c.live.counts.users} users · {c.live.counts.assets} assets · {c.live.counts.incidents} incidents · database {c.db_name}</div>}
      {req && <div className="text-xs">Last request: version {req.version} — <span className={ST[req.status]}>{req.status}</span>{req.decidedBy ? ` by ${req.decidedBy} (${fmtDateTime(req.decidedAt)})` : ""}{req.deferUntil ? ` until ${req.deferUntil}` : ""}{req.note ? ` — “${req.note}”` : ""}</div>}
      {c.status === "Active" && <div className="flex gap-2 flex-wrap items-center">
        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={tag} onChange={e => setTag(e.target.value)}>{releases.map(r => <option key={r.tag} value={r.tag}>{r.version}{r.version === cur ? " (installed)" : ""}</option>)}</select>
        <Input type="datetime-local" className="h-8 w-52 text-xs" value={when} onChange={e => setWhen(e.target.value)} title="Planned date / time (optional)" />
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!tag} onClick={ask}><Send className="w-3.5 h-3.5" />Ask for approval</Button>
        <Button size="sm" className="gap-1.5" disabled={!tag || (showE && emerg.trim().length < 10)} onClick={deploy}><Rocket className="w-3.5 h-3.5" />Deploy</Button>
        <button className="text-xs text-red-600 hover:underline" onClick={() => setShowE(!showE)}>{showE ? "Cancel emergency" : "Emergency…"}</button>
        {showE && <Input className="h-8 flex-1 min-w-[260px] text-xs" value={emerg} onChange={e => setEmerg(e.target.value)} placeholder="Emergency reason (shown to the client), at least 10 characters" />}
      </div>}
    </div>
  );
}

export default function PlatformConsole() {
  const { data } = useQuery({ queryKey: ["platform"], queryFn: () => apiFetch<any>("/platform/clients"), refetchInterval: 15000 });
  const { data: rel, error: relErr } = useQuery({ queryKey: ["platform-releases"], queryFn: () => apiFetch<any>("/platform/releases"), retry: false });
  const [newOpen, setNewOpen] = useState(false);
  const releases = rel?.releases || [];
  return (
    <div className="space-y-5 max-w-6xl" data-testid="platform-console">
      <div className="flex items-center gap-3 flex-wrap">
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><Server className="w-6 h-6 text-primary" />NIYTRI Platform</h1>
          <p className="text-sm text-muted-foreground">Clients, releases and deployments. A client is updated only after its Super Admin approves the version in their IT Hub (Admin › Updates), or with an emergency reason they can see.</p></div>
        <Button className="ml-auto gap-1.5" onClick={() => setNewOpen(true)}><Plus className="w-4 h-4" />New client</Button>
      </div>
      <Card><CardContent className="p-4">
        <div className="text-sm font-semibold mb-1">Clients</div>
        {!data ? <Loader2 className="w-4 h-4 animate-spin" /> : !data.clients.length ? <div className="text-sm text-muted-foreground py-2">No clients yet — register the existing instances, then add new clients.</div> :
          <div className="divide-y">{data.clients.map((c: any) => <ClientRow key={c.id} c={c} releases={releases} />)}</div>}
      </CardContent></Card>
      <Card><CardContent className="p-4">
        <div className="text-sm font-semibold mb-1">Releases <span className="text-xs font-normal text-muted-foreground">{rel?.source ? `· from ${rel.source}` : ""}</span></div>
        {relErr ? <div className="text-sm text-red-600">{(relErr as any).message}</div> : !releases.length ? <div className="text-sm text-muted-foreground">No version tags yet (git tag v1.88.0 && git push --tags).</div> :
          <div className="divide-y">{releases.slice(0, 8).map((r: any) => <details key={r.tag} className="py-1.5 text-sm"><summary className="cursor-pointer"><span className="font-mono">{r.tag}</span> <span className="text-muted-foreground text-xs">{r.title !== r.tag ? r.title : ""} · {r.commit}{r.publishedAt ? ` · ${fmtDateTime(r.publishedAt)}` : ""}</span></summary>
            <div className="whitespace-pre-wrap text-xs bg-muted/40 rounded p-2 mt-1">{r.notes || "No release notes."}</div></details>)}</div>}
      </CardContent></Card>
      {!!data?.jobs?.length && <Card><CardContent className="p-4">
        <div className="text-sm font-semibold mb-1">Jobs <span className="text-xs font-normal text-muted-foreground">· run on the server every minute</span></div>
        <div className="divide-y">{data.jobs.map((j: any) => <details key={j.id} className="py-1.5 text-xs"><summary className="cursor-pointer flex gap-2 flex-wrap">
          {j.status === "Done" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : j.status === "Failed" ? <XCircle className="w-3.5 h-3.5 text-red-600" /> : <Clock className="w-3.5 h-3.5 text-amber-600" />}
          <span>#{j.id}</span><span>{j.kind === "new_client" ? "Create client" : `Deploy ${j.params?.ref}`}</span><span className="font-mono">{j.code}</span><span className={ST[j.status]}>{j.status}</span>{j.params?.emergency && <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />emergency</span>}<span className="text-muted-foreground">{j.by} · {fmtDateTime(j.at)}</span></summary>
          {j.log && <pre className="mt-1 max-h-64 overflow-auto bg-muted/40 rounded p-2 text-[10px] whitespace-pre-wrap">{j.log}</pre>}</details>)}</div>
      </CardContent></Card>}
      <NewClient open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
