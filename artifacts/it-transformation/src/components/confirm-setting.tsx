import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { setConfirmChanges } from "@/components/confirm-dialog";
import { ShieldCheck } from "lucide-react";

/* Admin › Settings: ask in-app before every change (all modules). */
export function ConfirmChangesSetting() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["admin-settings"], queryFn: () => apiFetch<Record<string, unknown>>("/admin/settings") });
  const on = data?.["ui.confirmChanges"] !== false;
  async function set(v: boolean) {
    try { await apiFetch("/admin/settings", { method: "PUT", body: JSON.stringify({ "ui.confirmChanges": v }) }); setConfirmChanges(v); qc.invalidateQueries({ queryKey: ["admin-settings"] }); toast({ title: v ? "Changes are confirmed before saving" : "Confirmation before changes switched off" }); }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); }
  }
  return (
    <Card className="mt-4"><CardContent className="p-4 flex items-center gap-3 flex-wrap">
      <ShieldCheck className="w-5 h-5 text-primary" />
      <div className="flex-1 min-w-[240px]"><div className="font-semibold text-sm">Confirm every change</div>
        <div className="text-xs text-muted-foreground">Ask "Are you sure?" in the app before any create, update, assignment or delete is saved, in every module. Every change is recorded in the audit log either way.</div></div>
      <Switch checked={on} onCheckedChange={set} />
    </CardContent></Card>
  );
}

/* Admin › Settings: chat rules — attachment size and types, person-to-person chats, screen-share servers, recording size. */
export function ChatSettings() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["admin-settings"], queryFn: () => apiFetch<Record<string, unknown>>("/admin/settings") });
  const [f, setF] = React.useState<any>(null);
  React.useEffect(() => { if (data && !f) setF({ maxMB: data["chat.maxAttachmentMB"] ?? 10, ext: data["chat.attachmentExtensions"] ?? "pdf,png,jpg,jpeg,gif,txt,log,csv,docx,xlsx,pptx,zip", direct: data["chat.directEnabled"] !== false, rec: data["chat.maxRecordingMB"] ?? 300, ice: JSON.stringify(data["chat.iceServers"] ?? []) }); }, [data]);
  if (!f) return null;
  async function save() {
    let ice: any; try { ice = JSON.parse(f.ice || "[]"); if (!Array.isArray(ice)) throw 0; } catch { toast({ title: "Screen-share servers must be a JSON list", variant: "destructive" }); return; }
    const maxMB = Math.min(10, Math.max(1, Number(f.maxMB) || 10));
    const ext = String(f.ext).toLowerCase().split(/[\s,]+/).map((x: string) => x.replace(/^\./, "")).filter((x: string) => /^[a-z0-9]{1,6}$/.test(x) && !["exe", "bat", "cmd", "ps1", "vbs", "js", "msi", "scr", "dll", "html", "htm", "svg"].includes(x)).join(",");
    try { await apiFetch("/admin/settings", { method: "PUT", body: JSON.stringify({ "chat.maxAttachmentMB": maxMB, "chat.attachmentExtensions": ext, "chat.directEnabled": !!f.direct, "chat.maxRecordingMB": Math.min(1000, Math.max(50, Number(f.rec) || 300)), "chat.iceServers": ice }) });
      qc.invalidateQueries({ queryKey: ["admin-settings"] }); setF(null); toast({ title: "Chat settings saved", description: `Attachments: up to ${maxMB} MB · ${ext}` }); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Could not save", description: e.message, variant: "destructive" }); }
  }
  const row = "grid sm:grid-cols-[220px_1fr] gap-2 items-center text-sm";
  return (
    <Card className="mt-4"><CardContent className="p-4 space-y-3">
      <div className="font-semibold text-sm">Chats</div>
      <div className={row}><span>Largest attachment (MB, max 10)</span><input type="number" min={1} max={10} className="h-8 w-24 rounded-md border bg-background px-2" value={f.maxMB} onChange={e => setF({ ...f, maxMB: e.target.value })} /></div>
      <div className={row}><span>Allowed file types</span><input className="h-8 rounded-md border bg-background px-2" value={f.ext} onChange={e => setF({ ...f, ext: e.target.value })} /></div>
      <div className="text-[11px] text-muted-foreground">Program and script files (exe, bat, ps1, js, html, svg…) are never allowed.</div>
      <div className={row}><span>Person-to-person chats</span><Switch checked={!!f.direct} onCheckedChange={v => setF({ ...f, direct: v })} /></div>
      <div className={row}><span>Largest session recording (MB)</span><input type="number" className="h-8 w-24 rounded-md border bg-background px-2" value={f.rec} onChange={e => setF({ ...f, rec: e.target.value })} /></div>
      <div className={row}><span>Screen-share servers (STUN/TURN)</span><input className="h-8 rounded-md border bg-background px-2 font-mono text-xs" value={f.ice} onChange={e => setF({ ...f, ice: e.target.value })} placeholder='[] or [{"urls":"turn:turn.example.com:3478","username":"…","credential":"…"}]' /></div>
      <div className="text-[11px] text-muted-foreground">Leave empty when IT and staff are on the office network / VPN. For staff working from home, add a TURN server.</div>
      <div className="flex justify-end"><button className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm" onClick={save}>Save chat settings</button></div>
    </CardContent></Card>
  );
}

/** ITH-088 — where screen-session recordings are kept. Without storage, sessions are not recorded (shown on screen). Keys stay in /etc/it-hub.env. */
export function RecordingStorageSettings() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["admin-settings"], queryFn: () => apiFetch<Record<string, unknown>>("/admin/settings") });
  const [f, setF] = React.useState<any>(null); const [busy, setBusy] = React.useState(false); const [result, setResult] = React.useState<any>(null);
  React.useEffect(() => { if (data && !f) { let v: any = data["chat.recordingStorage"] ?? { provider: "none" }; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = { provider: "none" }; } } setF({ provider: "none", prefix: "it-hub/recordings", ...v }); } }, [data]);
  if (!f) return null;
  const clean = () => {
    const base = { provider: f.provider, prefix: String(f.prefix || "it-hub/recordings").trim() };
    if (f.provider === "s3") return { ...base, bucket: String(f.bucket || "").trim(), region: String(f.region || "").trim(), ...(f.endpoint ? { endpoint: String(f.endpoint).trim() } : {}) };
    if (f.provider === "azure") return { ...base, account: String(f.account || "").trim(), container: String(f.container || "").trim(), ...(f.endpoint ? { endpoint: String(f.endpoint).trim() } : {}) };
    return { provider: "none" };
  };
  const where = f.provider === "s3" ? `Amazon S3 bucket ${f.bucket || "?"} (${f.region || "?"})` : f.provider === "azure" ? `Azure Blob ${f.account || "?"}/${f.container || "?"}` : "nowhere — screen sessions will NOT be recorded";
  async function test() { setBusy(true); setResult(null); try { setResult(await apiFetch<any>("/chats-recording-storage/test", { method: "POST", body: JSON.stringify(clean()), headers: { "X-No-Confirm": "1" } })); } catch (e: any) { setResult({ ok: false, message: e.message }); } finally { setBusy(false); } }
  async function save() {
    try { await apiFetch("/admin/settings", { method: "PUT", body: JSON.stringify({ "chat.recordingStorage": clean() }), headers: confirmHeaderLocal(`Keep screen-session recordings in ${where}?`) });
      qc.invalidateQueries({ queryKey: ["admin-settings"] }); setF(null); toast({ title: "Recording storage saved" }); }
    catch (e: any) { if (!e.cancelled) toast({ title: "Could not save", description: e.message, variant: "destructive" }); }
  }
  const row = "grid sm:grid-cols-[220px_1fr] gap-2 items-center text-sm"; const inp = "h-8 rounded-md border bg-background px-2";
  return (
    <Card className="mt-4"><CardContent className="p-4 space-y-3">
      <div className="font-semibold text-sm">Screen-session recordings</div>
      <div className="text-xs text-muted-foreground">Recordings are encrypted by IT Hub and kept in your cloud storage — never in the IT Hub database. If no storage is set, screen sessions still work but are <b>not recorded</b>, and both sides see that on screen.</div>
      <div className={row}><span>Keep recordings in</span>
        <select className={inp} value={f.provider} onChange={e => { setF({ ...f, provider: e.target.value }); setResult(null); }}>
          <option value="none">Not configured — do not record</option><option value="s3">Amazon S3</option><option value="azure">Azure Blob Storage</option></select></div>
      {f.provider === "s3" && <>
        <div className={row}><span>Bucket</span><input className={inp} value={f.bucket || ""} onChange={e => setF({ ...f, bucket: e.target.value })} placeholder="e.g. ashika-it-hub-recordings" /></div>
        <div className={row}><span>Region</span><input className={inp} value={f.region || ""} onChange={e => setF({ ...f, region: e.target.value })} placeholder="e.g. ap-south-1" /></div>
        <div className="text-[11px] text-muted-foreground">Access: give the IT Hub server an IAM role allowing s3:PutObject, s3:GetObject and s3:DeleteObject on this bucket (recommended), or set RECORDINGS_S3_ACCESS_KEY_ID and RECORDINGS_S3_SECRET_ACCESS_KEY in /etc/it-hub.env. Keys are never stored here.</div>
      </>}
      {f.provider === "azure" && <>
        <div className={row}><span>Storage account</span><input className={inp} value={f.account || ""} onChange={e => setF({ ...f, account: e.target.value })} placeholder="e.g. ashikaithub" /></div>
        <div className={row}><span>Container</span><input className={inp} value={f.container || ""} onChange={e => setF({ ...f, container: e.target.value })} placeholder="e.g. recordings" /></div>
        <div className="text-[11px] text-muted-foreground">Access: set RECORDINGS_AZURE_SAS in /etc/it-hub.env to a SAS token for this container (read, create, write, delete). It is never stored here.</div>
      </>}
      {f.provider !== "none" && <div className={row}><span>Folder (prefix)</span><input className={inp} value={f.prefix || ""} onChange={e => setF({ ...f, prefix: e.target.value })} /></div>}
      {result && <div className={`rounded-md border px-3 py-2 text-xs ${result.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"}`}>{result.message}</div>}
      <div className="flex justify-end gap-2">
        {f.provider !== "none" && <button className="h-8 px-3 rounded-md border text-sm" disabled={busy} onClick={test}>{busy ? "Testing…" : "Test connection"}</button>}
        <button className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm" onClick={save}>Save recording storage</button></div>
    </CardContent></Card>
  );
}
const confirmHeaderLocal = (t: string) => ({ "X-Confirm-Text": encodeURIComponent(t) });
