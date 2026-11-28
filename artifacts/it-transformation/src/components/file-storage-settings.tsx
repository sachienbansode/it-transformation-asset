/** 2.14 (ITH-151) — Admin › Settings › File storage: one cloud storage (Azure Blob / Amazon S3) for all IT Hub files.
 *  Saving sets up the storage: the container is created automatically and a test file is written, read back and removed. */
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Folder, FolderTree, HardDrive, Loader2, ShieldCheck, UploadCloud, Trash2 } from "lucide-react";

const AUTH = [
  { v: "managed-identity", l: "Managed identity of the server (recommended)", d: "No password or key on the server, nothing to renew. In the Azure Portal: VM › Identity › System assigned: On; then Storage account › Access control (IAM) › Add role assignment › Storage Blob Data Contributor › Managed identity › this VM." },
  { v: "key", l: "Storage account key", d: "Put the key in the server settings file as AZURE_STORAGE_KEY (Storage account › Access keys › key1). Rotate it from time to time." },
  { v: "sas", l: "Container SAS token", d: "Put it in the server settings file as FILE_STORAGE_AZURE_SAS. A SAS cannot create containers — create the container in the Azure Portal first. Renew it before it expires." },
];

export function FileStorageSettings() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data, error } = useQuery<any>({ queryKey: ["file-storage"], queryFn: () => apiFetch("/file-storage") });
  const [f, setF] = React.useState<any>(null); const [busy, setBusy] = React.useState<"" | "test" | "save">(""); const [result, setResult] = React.useState<any>(null);
  React.useEffect(() => { if (data && !f) setF({ container: "it-hub", auth: "managed-identity", ...data.config, root: data.config?.root || data.defaultRoot }); }, [data]);
  if (error) return <Card className="mt-4"><CardContent className="p-4 text-sm text-muted-foreground">{(error as any).message}</CardContent></Card>;
  if (!data || !f) return null;
  const set = (p: any) => { setF({ ...f, ...p }); setResult(null); };
  const auth = AUTH.find(a => a.v === (f.auth || "managed-identity"))!;
  async function run(kind: "test" | "save") {
    setBusy(kind); setResult(null);
    try {
      if (kind === "save" && f.provider !== "none") {   // set up + test first; save only when every step passes
        const t: any = await apiFetch("/file-storage/test", { method: "POST", body: JSON.stringify(f), headers: { "X-No-Confirm": "1" } });
        if (!t.ok) { setResult(t); toast({ title: "Not saved", description: "Fix the step marked ✗ and try again.", variant: "destructive" }); return; }
      }
      const r: any = await apiFetch(kind === "test" ? "/file-storage/test" : "/file-storage", { method: kind === "test" ? "POST" : "PUT", body: JSON.stringify(f), ...(kind === "test" ? { headers: { "X-No-Confirm": "1" } } : {}) });
      setResult(r);
      if (kind === "save") { toast({ title: f.provider === "none" ? "File storage turned off" : "File storage set up", description: f.provider === "none" ? "New files stay on the server." : "New files now go to the cloud storage." }); qc.invalidateQueries({ queryKey: ["file-storage"] }); }
    } catch (e: any) { if (!e.cancelled) { setResult(e.steps ? e : { ok: false, steps: [{ step: "Save", ok: false, detail: e.message }] }); toast({ title: "Not saved", description: e.message, variant: "destructive" }); } }
    finally { setBusy(""); }
  }
  const root = f.root || data.defaultRoot;
  return (
    <Card className="mt-4" id="file-storage" data-testid="file-storage"><CardContent className="p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-2">
        <HardDrive className="w-5 h-5 text-[#2D7FF9] mt-0.5" />
        <div className="flex-1"><div className="font-semibold">File storage — Azure Blob / Amazon S3</div>
          <div className="text-xs text-muted-foreground">One storage for every file in IT Hub: ticket attachments, policy PDFs, chat files, screen-session recordings, audit evidence and profile photos. IT Hub creates the container and sorts files into folders by purpose with readable names. Without it, files stay on the server.</div></div>
        <span className={`text-[11px] rounded-full px-2 py-0.5 ${data.active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`} data-testid="storage-status">{data.active ? `In use: ${data.active}` : "Not set — files on the server"}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Label>Keep files in</Label>
          <div className="flex flex-wrap gap-2 mt-1">{[["azure", "Azure Blob Storage"], ["s3", "Amazon S3"], ["none", "Not set (on the server)"]].map(([v, l]) =>
            <button key={v} type="button" onClick={() => set({ provider: v })} data-testid={`storage-provider-${v}`} className={`rounded-md border px-3 py-1.5 text-sm ${f.provider === v ? "border-[#2D7FF9] bg-[#2D7FF9]/10 font-semibold" : "hover:bg-muted"}`}>{l}</button>)}</div></div>
        {f.provider === "azure" && <>
          <div><Label>Storage account name *</Label><Input data-testid="storage-account" value={f.account || ""} onChange={e => set({ account: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") })} placeholder="e.g. ashikaamcithub" /><p className="text-[11px] text-muted-foreground mt-0.5">As shown in the Azure Portal (Storage accounts).</p></div>
          <div><Label>Container</Label><Input data-testid="storage-container" value={f.container || ""} onChange={e => set({ container: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="it-hub" /><p className="text-[11px] text-muted-foreground mt-0.5">Created automatically if it does not exist (private, no public access).</p></div>
          <div className="sm:col-span-2"><Label>How IT Hub signs in to the storage</Label>
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" data-testid="storage-auth" value={f.auth || "managed-identity"} onChange={e => set({ auth: e.target.value })}>{AUTH.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}</select>
            <p className="text-[11px] text-muted-foreground mt-1">{auth.d}</p>
            {f.auth === "key" && !data.server.key && <p className="text-[11px] text-amber-700 mt-1">AZURE_STORAGE_KEY is not set on this server yet.</p>}
            {f.auth === "sas" && !data.server.sas && <p className="text-[11px] text-amber-700 mt-1">FILE_STORAGE_AZURE_SAS is not set on this server yet.</p>}</div>
        </>}
        {f.provider === "s3" && <>
          <div><Label>Bucket *</Label><Input value={f.bucket || ""} onChange={e => set({ bucket: e.target.value.toLowerCase() })} placeholder="my-company-it-hub" /><p className="text-[11px] text-muted-foreground mt-0.5">Create the bucket in AWS first (private).</p></div>
          <div><Label>Region *</Label><Input value={f.region || ""} onChange={e => set({ region: e.target.value })} placeholder="ap-south-1" /><p className="text-[11px] text-muted-foreground mt-0.5">Access: the server's IAM role (recommended) or keys in the server settings file.</p></div>
        </>}
        {f.provider !== "none" && <div><Label>Main folder</Label><Input data-testid="storage-root" value={f.root || ""} onChange={e => set({ root: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder={data.defaultRoot} /><p className="text-[11px] text-muted-foreground mt-0.5">All folders go inside it — one main folder per company / instance.</p></div>}
      </div>

      {f.provider !== "none" && <div className="rounded-lg border bg-muted/30 p-3" data-testid="storage-folders">
        <div className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><FolderTree className="w-3.5 h-3.5" />Folders IT Hub creates in {f.provider === "azure" ? `${f.container || "it-hub"} / ` : `${f.bucket || "bucket"} / `}{root}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">{data.folders.map(([p, l]: [string, string]) =>
          <div key={p} className="flex items-start gap-1.5"><Folder className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" /><span><span className="font-mono">{root}/{p}</span> <span className="text-muted-foreground">— {l}</span></span></div>)}</div>
        <div className="text-[11px] text-muted-foreground mt-2">File names: date and time (IST) + a clean version of the original name, e.g. <span className="font-mono">{root}/itsm/incidents/INC-00012/2026-11-27_15-32-10_printer-error.png</span> · <span className="font-mono">{root}/policies/POL-0001/POL-0001_2026-11-27_15-40-02_information-security-policy.pdf</span></div>
      </div>}

      <div className="flex flex-wrap gap-2 justify-end">
        {f.provider !== "none" && <Button variant="outline" disabled={!!busy} onClick={() => run("test")} data-testid="storage-test">{busy === "test" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Test connection</Button>}
        <Button disabled={!!busy} onClick={() => run("save")} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white" data-testid="storage-save">{busy === "save" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{f.provider === "none" ? "Save" : "Save & set up storage"}</Button>
      </div>
      {result && <div className="rounded-lg border p-3 space-y-1 text-sm" data-testid="storage-result">
        {(result.steps || []).map((s: any, i: number) => <div key={i} className="flex items-start gap-2">{s.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />}<span><b>{s.step}</b> — <span className="text-muted-foreground break-all">{s.detail}</span></span></div>)}
        {result.saved && <div className="text-xs text-emerald-700 flex items-center gap-1 pt-1"><ShieldCheck className="w-3.5 h-3.5" />Saved. New files go to the storage; files already on the server stay there and still open.</div>}
      </div>}
      {data.active && <ExistingFiles />}
    </CardContent></Card>
  );
}

/** 2.19: move files still on the server / in the database into the storage; clean up uploads never attached. */
function ExistingFiles() {
  const { toast } = useToast();
  const { data, refetch } = useQuery<any>({ queryKey: ["file-storage-migrate"], queryFn: () => apiFetch("/file-storage/migrate") });
  const [busy, setBusy] = React.useState<"" | "move" | "clean">(""); const [log, setLog] = React.useState<{ moved: number; failed: any[] } | null>(null);
  if (!data) return null;
  async function move() {
    setBusy("move"); let moved = 0; const failed: any[] = [];
    try {
      for (let i = 0; i < 200; i++) {
        const r: any = await apiFetch("/file-storage/migrate", { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ limit: 50 }) });
        moved += r.moved.length; failed.push(...r.failed); setLog({ moved, failed: [...failed] });
        if (!r.moved.length || r.remaining <= failed.length) break;
      }
      toast({ title: `${moved} file(s) moved to the storage`, description: failed.length ? `${failed.length} could not be moved — see the list` : "All done" });
    } catch (e: any) { toast({ title: "Move stopped", description: e.message, variant: "destructive" }); }
    finally { setBusy(""); refetch(); }
  }
  async function clean() {
    setBusy("clean");
    try { const r: any = await apiFetch("/file-storage/cleanup", { method: "POST", headers: { "X-No-Confirm": "1" }, body: "{}" }); toast({ title: `${r.removed} unused upload(s) removed` }); }
    catch (e: any) { toast({ title: "Clean-up failed", description: e.message, variant: "destructive" }); } finally { setBusy(""); refetch(); }
  }
  return (
    <div className="rounded-lg border p-3 space-y-3" data-testid="existing-files">
      <div className="flex items-start gap-2 flex-wrap">
        <UploadCloud className="w-4 h-4 text-[#2D7FF9] mt-0.5" />
        <div className="flex-1 min-w-[220px]"><div className="text-sm font-semibold">Files saved before the storage was set up</div>
          <div className="text-xs text-muted-foreground">{data.total ? <>{data.total} file(s) are still on the server or in the database: {Object.entries(data.byKind).map(([k, n]) => `${k} ${n}`).join(" · ")}. Moving puts each into its folder; every file is read back and checked before the server copy is let go (server files are kept in a “_moved-to-cloud” folder).</> : "None — every file is in the storage."}</div></div>
        {data.total > 0 && <Button size="sm" disabled={!!busy} onClick={move} data-testid="move-existing">{busy === "move" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-1" />}Move {data.total} file(s) to the storage</Button>}
      </div>
      {log && <div className="text-xs space-y-0.5" data-testid="move-log"><div>{log.moved} moved{busy === "move" ? " so far…" : ""}{log.failed.length ? `, ${log.failed.length} not moved:` : ""}</div>
        {log.failed.slice(0, 20).map((f: any, i: number) => <div key={i} className="text-red-600">{f.kind} · {f.ref} · {f.name}: {f.error}</div>)}</div>}
      <div className="flex items-start gap-2 flex-wrap border-t pt-3">
        <Trash2 className="w-4 h-4 text-muted-foreground mt-0.5" />
        <div className="flex-1 min-w-[220px]"><div className="text-sm font-semibold">Uploads never attached to a record</div>
          <div className="text-xs text-muted-foreground">Files uploaded on a form that was then closed without saving. Removed automatically every day once older than {data.orphanDays} days and no ticket, document, template or profile uses them. Now: {data.orphans}.</div></div>
        {data.orphans > 0 && <Button size="sm" variant="outline" disabled={!!busy} onClick={clean} data-testid="clean-pending">{busy === "clean" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Remove {data.orphans} now</Button>}
      </div>
    </div>
  );
}
