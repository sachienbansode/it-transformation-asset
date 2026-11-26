import React, { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Paperclip, X, Loader2, CheckCircle2, AlertTriangle, FileText, Image as ImageIcon, File } from "lucide-react";

/* 2.03 (ITH-172) — one responsive shell for every ITSM ticket form (incident, service request, problem, change):
 * coloured header with the ticket type, scrolling body in sections, footer that stays visible. Full screen on phones. */
export type TicketKind = "incident" | "request" | "problem" | "change";
const ACCENT: Record<TicketKind, { bar: string; chip: string; label: string }> = {
  incident: { bar: "from-rose-500 to-orange-400", chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", label: "Incident" },
  request: { bar: "from-sky-500 to-blue-500", chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", label: "Service request" },
  problem: { bar: "from-violet-500 to-fuchsia-500", chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", label: "Problem" },
  change: { bar: "from-emerald-500 to-teal-500", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", label: "Change" },
};

export function TicketDialog({ open, onOpenChange, kind, title, subtitle, status, footer, children, wide }: {
  open: boolean; onOpenChange: (v: boolean) => void; kind: TicketKind; title: string; subtitle?: React.ReactNode; status?: string | null;
  footer: React.ReactNode; children: React.ReactNode; wide?: boolean;
}) {
  const a = ACCENT[kind];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`ticket-dialog-${kind}`}
        className={cn("p-0 gap-0 flex flex-col overflow-hidden w-full max-w-full h-[100dvh] max-h-[100dvh] rounded-none sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:rounded-xl",
          wide ? "sm:max-w-4xl" : "sm:max-w-3xl")}>
        <div className={cn("h-1 w-full bg-gradient-to-r shrink-0", a.bar)} />
        <div className="shrink-0 border-b px-4 sm:px-6 py-3.5 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", a.chip)}>{a.label}</span>
            {status && <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{status}</span>}
          </div>
          <DialogTitle className="mt-1.5 text-[17px] leading-snug">{title}</DialogTitle>
          {subtitle ? <DialogDescription className="mt-0.5 text-xs">{subtitle}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-5">{children}</div>
        <div className="shrink-0 border-t bg-muted/30 px-4 sm:px-6 py-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:w-full sm:[&>button]:w-auto">{footer}</div>
      </DialogContent>
    </Dialog>
  );
}

/** a titled block of fields: one column on phones, two from tablet up; use sm:col-span-2 for full-width fields */
export function FormSection({ title, icon: Icon, hint, children, className }: { title: string; icon?: any; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-baseline gap-2 border-b border-dashed pb-1.5">
        {Icon && <Icon className="w-4 h-4 text-primary self-center" />}
        <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 [&>div]:min-w-0">{children}</div>
    </section>
  );
}

/* ─── files picked while the ticket is being created: uploaded at once, linked to the ticket after it is saved ─── */
export type PendingFile = { key: string; name: string; size: number; type: string; objectPath?: string; state: "uploading" | "ready" | "error"; error?: string };
type UploadCfg = { maxAttachmentSizeMB: number; maxAttachmentsPerTicket: number; allowedFileTypes: string[] };
const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const iconOf = (t: string) => t.startsWith("image/") ? ImageIcon : /pdf|word|text|sheet|excel|presentation/.test(t) ? FileText : File;

export function PendingAttachments({ files, onChange }: { files: PendingFile[]; onChange: (f: PendingFile[] | ((p: PendingFile[]) => PendingFile[])) => void }) {
  const { toast } = useToast(); const ref = useRef<HTMLInputElement>(null); const [drag, setDrag] = useState(false);
  const { data: cfg } = useQuery<UploadCfg>({ queryKey: ["itsm-settings"], queryFn: () => apiFetch<UploadCfg>("/itsm-settings"), staleTime: 60_000 });
  const max = cfg?.maxAttachmentsPerTicket ?? 10, maxMB = cfg?.maxAttachmentSizeMB ?? 20, types = cfg?.allowedFileTypes ?? ["pdf", "docx", "xlsx", "png", "jpg", "jpeg", "txt", "csv", "zip"];
  async function add(list: FileList | null) {
    if (!list) return;
    let room = max - files.length;
    for (const f of Array.from(list)) {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      if (!types.includes(ext)) { toast({ title: `${f.name}: file type not allowed`, description: `Allowed: ${types.join(", ")}`, variant: "destructive" }); continue; }
      if (f.size > maxMB * 1048576) { toast({ title: `${f.name} is larger than ${maxMB} MB`, variant: "destructive" }); continue; }
      if (room-- <= 0) { toast({ title: `Up to ${max} files per ticket`, variant: "destructive" }); break; }
      const key = `${Date.now()}-${Math.random()}`;
      onChange(p => [...p, { key, name: f.name, size: f.size, type: f.type || "application/octet-stream", state: "uploading" }]);
      try {
        const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>("/storage/uploads/request-url", { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ name: f.name, size: f.size, contentType: f.type || "application/octet-stream" }) });
        const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, credentials: "include" });
        if (!put.ok) throw new Error("Upload failed");
        onChange(p => p.map(x => x.key === key ? { ...x, objectPath, state: "ready" } : x));
      } catch (e: any) { onChange(p => p.map(x => x.key === key ? { ...x, state: "error", error: e.message } : x)); }
    }
  }
  return (
    <div className="sm:col-span-2 space-y-2" data-testid="pending-attachments">
      <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={cn("rounded-[10px] border-2 border-dashed px-4 py-4 text-center transition-colors", drag ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50")}>
        <input ref={ref} type="file" multiple className="hidden" accept={types.map(t => `.${t}`).join(",")} onChange={e => { add(e.target.files); e.target.value = ""; }} data-testid="pending-input" />
        <Paperclip className="w-5 h-5 mx-auto text-muted-foreground" />
        <div className="text-sm mt-1">Drop files here or <button type="button" className="text-primary font-medium underline-offset-2 hover:underline" onClick={() => ref.current?.click()}>browse</button></div>
        <div className="text-[11px] text-muted-foreground mt-0.5">Screenshots, logs, documents · {types.slice(0, 8).join(", ")}{types.length > 8 ? "…" : ""} · up to {maxMB} MB each, {max} files</div>
      </div>
      {files.length > 0 && <ul className="grid gap-1.5 sm:grid-cols-2">{files.map(f => { const I = iconOf(f.type); return (
        <li key={f.key} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs min-w-0">
          <I className="w-4 h-4 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1 font-medium" title={f.name}>{f.name}</span>
          <span className="text-muted-foreground shrink-0">{fmtSize(f.size)}</span>
          {f.state === "uploading" ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : f.state === "ready" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <span title={f.error}><AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" /></span>}
          <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" title="Remove" onClick={() => onChange(p => p.filter(x => x.key !== f.key))}><X className="w-3.5 h-3.5" /></button>
        </li>); })}</ul>}
    </div>
  );
}
export const pendingBusy = (f: PendingFile[]) => f.some(x => x.state === "uploading");
/** after the ticket is saved: attach the uploaded files to it; returns how many could not be attached */
export async function linkPendingFiles(ticketType: string, ticketId: number, files: PendingFile[]) {
  let failed = 0;
  for (const f of files.filter(x => x.state === "ready" && x.objectPath)) {
    try { await apiFetch("/itsm-attachments", { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ ticketType, ticketId, fileName: f.name, fileSize: f.size, contentType: f.type, objectPath: f.objectPath }) }); }
    catch { failed++; }
  }
  return failed;
}

/* 2.03 (ITH-173) — environment (Dev / UAT / PROD) and affected applications (multi-select + "Other" with a typed name).
 * Both lists are kept in Masters › ITSM (Environments, Applications). */
export function EnvAppsFields({ env, apps, onChange, appsRequired, disabled }: { env?: string | null; apps?: string[] | null; onChange: (env: string | null, apps: string[]) => void; appsRequired?: boolean; disabled?: boolean }) {
  const cfg = useItsmConfigLite();
  const ENVS: string[] = cfg?.["itsm.environments"] ?? ["Dev", "UAT", "PROD"];
  const APPS: string[] = cfg?.["itsm.applications"] ?? [];
  const list = apps || [];
  const others = list.filter(a => !APPS.some(x => x.toLowerCase() === a.toLowerCase()));
  const [otherOn, setOtherOn] = useState(others.length > 0); const [typed, setTyped] = useState("");
  const toggle = (a: string) => onChange(env || null, list.some(x => x.toLowerCase() === a.toLowerCase()) ? list.filter(x => x.toLowerCase() !== a.toLowerCase()) : [...list, a]);
  const addTyped = () => { const v = typed.replace(/\s+/g, " ").trim(); if (!v) return; if (!list.some(x => x.toLowerCase() === v.toLowerCase())) onChange(env || null, [...list, v]); setTyped(""); };
  const envTone = (e: string) => /prod/i.test(e) ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" : /uat|test|qa/i.test(e) ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300";
  const chip = "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60";
  return (
    <>
      <div className="sm:col-span-2 space-y-1.5" data-testid="env-field">
        <div className="text-sm font-medium">Environment</div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup">
          {ENVS.map(e => <button key={e} type="button" role="radio" aria-checked={env === e} disabled={disabled} onClick={() => onChange(env === e ? null : e, list)}
            className={cn(chip, env === e ? envTone(e) : "text-muted-foreground hover:bg-muted")} data-testid={`env-${e}`}>{env === e ? "● " : ""}{e}</button>)}
        </div>
      </div>
      <div className="sm:col-span-2 space-y-1.5" data-testid="apps-field">
        <div className="text-sm font-medium">Affected application(s){appsRequired && " *"} <span className="text-[11px] font-normal text-muted-foreground">choose one or more</span></div>
        <div className="flex flex-wrap gap-1.5">
          {APPS.map(a => { const on = list.some(x => x.toLowerCase() === a.toLowerCase()); return (
            <button key={a} type="button" disabled={disabled} onClick={() => toggle(a)} className={cn(chip, on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")} data-testid={`app-${a}`}>{on ? "✓ " : ""}{a}</button>); })}
          <button type="button" disabled={disabled} onClick={() => setOtherOn(o => !o)} className={cn(chip, otherOn || others.length ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")} data-testid="app-other">{otherOn || others.length ? "✓ " : ""}Other</button>
        </div>
        {(otherOn || others.length > 0) && <div className="flex flex-wrap items-center gap-1.5">
          {others.map(o => <span key={o} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">{o}{!disabled && <button type="button" onClick={() => onChange(env || null, list.filter(x => x !== o))} title="Remove"><X className="w-3 h-3" /></button>}</span>)}
          {!disabled && <input className="h-8 flex-1 min-w-[180px] rounded-md border bg-background px-2.5 text-sm" placeholder="Type the application name and press Enter" value={typed}
            onChange={e => setTyped(e.target.value.slice(0, 80))} onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTyped(); } }} onBlur={addTyped} data-testid="app-other-input" />}
        </div>}
      </div>
    </>
  );
}
function useItsmConfigLite() {
  const { data } = useQuery<Record<string, any>>({ queryKey: ["itsm-config"], queryFn: () => apiFetch("/itsm-config"), staleTime: 60_000 });
  return data;
}
/** read-only display for ticket views */
export function EnvAppsView({ env, apps }: { env?: string | null; apps?: string[] | null }) {
  if (!env && !(apps || []).length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="env-apps-view">
      {env && <span className={cn("rounded-full border px-2 py-0.5 font-semibold", /prod/i.test(env) ? "border-red-300 text-red-700 bg-red-50 dark:bg-red-500/15 dark:text-red-300" : /uat/i.test(env) ? "border-amber-300 text-amber-800 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300" : "border-sky-300 text-sky-700 bg-sky-50 dark:bg-sky-500/15 dark:text-sky-300")}>{env}</span>}
      {(apps || []).map(a => <span key={a} className="rounded-full bg-muted px-2 py-0.5">{a}</span>)}
    </div>
  );
}
