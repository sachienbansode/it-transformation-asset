import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X, Paperclip, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { apiFetch, API } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateTime, fmtDate as fmtD } from "@/lib/date";

/* Shared bits for Audit & Compliance screens. */

export const STATUSES = ["Pending", "In Progress", "Submitted", "Under Review", "Partially Closed", "Closed", "Closed-Obs", "Not Applicable"];
export const CLOSED = ["Closed", "Closed-Obs", "Not Applicable"];
export const TEAM_STATUSES = ["Pending", "In Progress", "Submitted"];
export const AUDITOR_STATUSES = ["Under Review", "Partially Closed", "Closed", "Closed-Obs", "Not Applicable"];
export const AUDIT_STATUSES = ["Planning", "Fieldwork", "Reporting", "Closed"];
export const DOC_CATEGORIES = ["Policy", "Procedure", "Evidence", "Report", "Agreement", "Circular", "Engagement Letter", "Other"];

/* Colours a status can use (full class names so Tailwind keeps them). */
export const STATUS_COLORS: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300", blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300", violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", orange: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300", sky: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", teal: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  green: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300", lime: "bg-lime-50 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
  red: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300", rose: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  pink: "bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300", zinc: "bg-zinc-100 text-zinc-500 dark:bg-zinc-500/15 dark:text-zinc-400",
};
export type StatusRow = { name: string; stage: "team" | "auditor"; grp: "pending" | "inprog" | "submitted" | "review" | "closed"; color: string; sortOrder: number; isActive: boolean; isSystem: boolean; description: string | null };
export const GROUP_LABEL: Record<StatusRow["grp"], string> = { pending: "Pending", inprog: "In progress", submitted: "Submitted", review: "Under review", closed: "Closed / N.A." };
export const GROUP_ORDER: StatusRow["grp"][] = ["pending", "inprog", "submitted", "review", "closed"];
const DEFAULT_ROWS: StatusRow[] = [
  ["Pending", "team", "pending", "slate"], ["In Progress", "team", "inprog", "blue"], ["Submitted", "team", "submitted", "indigo"], ["Under Review", "auditor", "review", "amber"],
  ["Partially Closed", "auditor", "inprog", "cyan"], ["Closed", "auditor", "closed", "emerald"], ["Closed-Obs", "auditor", "closed", "teal"], ["Not Applicable", "auditor", "closed", "zinc"],
].map(([name, stage, grp, color], i) => ({ name, stage, grp, color, sortOrder: (i + 1) * 10, isActive: true, isSystem: true, description: null }) as StatusRow);
let ROWS: StatusRow[] = DEFAULT_ROWS;
const fill = (arr: string[], v: string[]) => { arr.splice(0, arr.length, ...v); };
/** Loads the status master once per screen and refreshes the shared lists in place, so every dropdown, badge and count agree. */
export function applyStatusRows(rows: StatusRow[]) {
  if (!rows?.length) return;
  ROWS = rows;
  fill(STATUSES, rows.map(r => r.name)); fill(CLOSED, rows.filter(r => r.grp === "closed").map(r => r.name));
  fill(TEAM_STATUSES, rows.filter(r => r.stage === "team").map(r => r.name)); fill(AUDITOR_STATUSES, rows.filter(r => r.stage === "auditor").map(r => r.name));
}
export function useStatusMaster(portal = false) {
  const qy = useQuery<{ statuses: StatusRow[]; autoShareOnSubmit?: boolean }>({ queryKey: [portal ? "auditor-statuses" : "compliance-statuses"], queryFn: () => apiFetch(portal ? "/auditor-statuses" : "/compliance-statuses"), staleTime: 60_000 });
  if (qy.data?.statuses) applyStatusRows(qy.data.statuses);
  return { rows: ROWS, autoShare: qy.data?.autoShareOnSubmit ?? true, isLoading: qy.isLoading };
}
export const statusRows = () => ROWS;
export const groupOf = (s: string): StatusRow["grp"] => ROWS.find(r => r.name === s)?.grp ?? "inprog";
/** Statuses offered in a dropdown: active ones (+ the current value so it still shows). */
export const offered = (list: string[], current?: string | null) => list.filter(n => ROWS.find(r => r.name === n)?.isActive !== false || n === current);
const STATUS_STYLE = (s: string) => STATUS_COLORS[ROWS.find(r => r.name === s)?.color || ""] || STATUS_COLORS.slate;
export const StatusBadge = ({ s, className }: { s: string; className?: string }) => (
  <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE(s), className)}>{s}</span>
);
/** Same status filter everywhere: All, All open, the five buckets, then each status. Values: "all" | "open" | "g:<bucket>" | status name. */
export function statusFilterOptions(extra: [string, string][] = []): { value: string; label: string; group?: boolean }[] {
  return [{ value: "all", label: "All statuses" }, { value: "open", label: "All open (not closed)" },
    ...GROUP_ORDER.map(g => ({ value: `g:${g}`, label: `${GROUP_LABEL[g]} (all)`, group: true })), ...extra.map(([value, label]) => ({ value, label })),
    ...ROWS.filter(r => r.isActive).map(r => ({ value: r.name, label: r.name }))];
}
/** The one status filter used on every list (team screens and the auditor portal). */
export function StatusFilter({ value, onChange, extra = [], labels = {}, className }: { value: string; onChange: (v: string) => void; extra?: [string, string][]; labels?: Record<string, string>; className?: string }) {
  const rows = ROWS.filter(r => r.isActive);
  const lbl = (n: string) => labels[n] || n;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-9 w-52", className)}><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-[70vh]">
        <SelectItem value="all">All statuses</SelectItem><SelectItem value="open">All open (not closed)</SelectItem>
        {extra.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        <SelectSeparator />
        <SelectGroup><SelectLabel className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Groups</SelectLabel>
          {GROUP_ORDER.map(g => <SelectItem key={g} value={`g:${g}`}>{GROUP_LABEL[g]} <span className="text-muted-foreground">({rows.filter(r => r.grp === g).map(r => lbl(r.name)).join(", ")})</span></SelectItem>)}</SelectGroup>
        <SelectSeparator />
        <SelectGroup><SelectLabel className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Status</SelectLabel>
          {rows.map(r => <SelectItem key={r.name} value={r.name}><span className="inline-flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", DOT[r.color] || DOT.slate)} />{lbl(r.name)}{r.stage === "auditor" ? <span className="text-[10px] text-muted-foreground">auditor</span> : null}</span></SelectItem>)}</SelectGroup>
      </SelectContent>
    </Select>
  );
}
/** Status picker for editing (team or auditor), same look everywhere. */
export function StatusSelect({ value, onChange, options, disabled, className, labels = {} }: { value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean; className?: string; labels?: Record<string, string> }) {
  return (
    <Select disabled={disabled} value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-9", className)}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(n => { const r = ROWS.find(x => x.name === n); return <SelectItem key={n} value={n}><span className="inline-flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", DOT[r?.color || "slate"] || DOT.slate)} />{labels[n] || n}{r?.stage === "auditor" ? <span className="text-[10px] text-muted-foreground">auditor</span> : null}</span></SelectItem>; })}</SelectContent>
    </Select>
  );
}
export const DOT: Record<string, string> = { slate: "bg-slate-400", blue: "bg-blue-500", indigo: "bg-indigo-500", violet: "bg-violet-500", amber: "bg-amber-500", orange: "bg-orange-500", cyan: "bg-cyan-500", sky: "bg-sky-500",
  emerald: "bg-emerald-500", teal: "bg-teal-500", green: "bg-green-500", lime: "bg-lime-500", red: "bg-red-500", rose: "bg-rose-500", pink: "bg-pink-500", zinc: "bg-zinc-400" };
/** Whose action is pending: entity (team) / auditor / closed. With the auditor = shared and Submitted, or Under review. */
export const courtOf = (i: { status: string; sharedAt?: string | null }): "entity" | "auditor" | "closed" => { const g = groupOf(i.status); return g === "closed" ? "closed" : g === "review" || (g === "submitted" && !!i.sharedAt) ? "auditor" : "entity"; };
export const ago = (t?: string | null) => { if (!t) return "never"; const s = (Date.now() - new Date(t).getTime()) / 1000; if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; if (s < 86400 * 7) return `${Math.floor(s / 86400)} day(s) ago`; return fmtD(t); };
export const stamp = (t?: string | null) => (t ? fmtDateTime(t) : "—");
export const matchStatus = (f: string, s: string) => f === "all" || (f === "open" ? groupOf(s) !== "closed" : f.startsWith("g:") ? groupOf(s) === f.slice(2) : s === f);

export { fmtDate } from "@/lib/date";
export const d10 = (d?: string | null) => (d ? String(d).slice(0, 10) : "");
export const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
export const isOverdue = (i: { targetDate?: string | null; status: string }) => !!i.targetDate && d10(i.targetDate) < today() && !CLOSED.includes(i.status);
export const refOf = (i: { refNo?: string | null; seq?: number }) => (i.refNo ? `${i.refNo}${(i.seq ?? 1) > 1 ? "." + i.seq : ""}` : "—");
export const fileUrl = (fileId: number, download = false) => `${API}/compliance-files/${fileId}${download ? "?download=1" : ""}`;
export const fmtSize = (n?: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export const usePeople = () => useQuery<any[]>({ queryKey: ["compliance-people"], queryFn: () => apiFetch("/compliance-people"), staleTime: 300_000 });
export const useCompanies = () => useQuery<any[]>({ queryKey: ["compliance-companies"], queryFn: () => apiFetch("/compliance-companies") });

/** Upload one file to storage; returns the file block the compliance API expects. */
let policy: Promise<{ types: string[]; maxMB: number }> | null = null;
export const uploadPolicy = () => (policy ||= apiFetch<{ types: string[]; maxMB: number }>("/upload-policy").catch(() => { policy = null; return { types: [], maxMB: 25 }; }));
export async function uploadFile(file: File) {
  const p = await uploadPolicy(); const ext = (file.name.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
  if (p.types.length && !p.types.includes(ext)) throw new Error(`.${ext || "?"} files are not allowed. Allowed: ${p.types.map(t => "." + t).join(", ")}`);
  if (file.size > p.maxMB * 1024 * 1024) throw new Error(`File too large — maximum ${p.maxMB} MB`);
  const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>("/storage/uploads/request-url", { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }) });
  const r = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file, credentials: "include" });
  if (!r.ok) throw new Error("Upload to storage failed");
  return { objectPath, fileName: file.name, fileSize: file.size, contentType: file.type || "application/octet-stream" };
}

/** Person picker (id-based, searchable). */
export function PersonPicker({ value, onChange, placeholder = "Choose person", className, disabled, allowClear = true }: { value: number | null | undefined; onChange: (id: number | null) => void; placeholder?: string; className?: string; disabled?: boolean; allowClear?: boolean }) {
  const { data: people = [] } = usePeople();
  const [open, setOpen] = useState(false); const [term, setTerm] = useState("");
  const sel = people.find(p => p.id === value);
  const list = useMemo(() => { const t = term.toLowerCase(); return (t ? people.filter(p => p.name?.toLowerCase().includes(t) || p.email?.toLowerCase().includes(t)) : people).slice(0, 50); }, [people, term]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className={cn("w-full justify-between font-normal h-9", !sel && "text-muted-foreground", className)}>
          <span className="truncate">{sel ? sel.name : value ? `#${value}` : placeholder}</span>
          <span className="flex items-center gap-1 shrink-0">
            {allowClear && sel && !disabled && <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" onClick={e => { e.stopPropagation(); onChange(null); }} />}
            <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[300px]" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search name or email…" value={term} onValueChange={setTerm} />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {list.map(p => (
                <CommandItem key={p.id} value={String(p.id)} onSelect={() => { onChange(p.id); setOpen(false); setTerm(""); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0"><div className="truncate">{p.name}</div><div className="text-[11px] text-muted-foreground truncate">{p.email}{p.department ? ` · ${p.department}` : ""}</div></div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return <div className={cn("h-2 rounded-full bg-muted overflow-hidden", className)}><div className={cn("h-full rounded-full", v >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${v}%` }} /></div>;
}

/** Paperclip count in a listing: click to see the files and open them read-only, without opening the checkpoint. */
export function DocsButton({ count, load, open, canDownload = true }: { count: number; load: () => Promise<any[]>; open: (d: any) => void; canDownload?: boolean }) {
  const [docs, setDocs] = useState<any[] | null>(null); const [o, setO] = useState(false);
  if (!count) return null;
  return (
    <Popover open={o} onOpenChange={v => { setO(v); if (v && !docs) load().then(setDocs).catch(() => setDocs([])); }}>
      <PopoverTrigger asChild>
        <button type="button" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-0.5 mr-1.5 rounded px-1 py-0.5 hover:bg-primary/10 hover:text-primary" title="Show documents"><Paperclip className="w-3 h-3" />{count}</button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1" align="end" onClick={e => e.stopPropagation()}>
        {!docs ? <div className="p-3 text-xs text-muted-foreground">Loading…</div> : !docs.length ? <div className="p-3 text-xs text-muted-foreground">No documents.</div> :
          docs.map(d => <button key={d.id} type="button" disabled={!d.fileId} onClick={() => { setO(false); open(d); }} className="w-full text-left flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent text-sm">
            <Eye className="w-3.5 h-3.5 text-primary shrink-0" /><div className="min-w-0"><div className="truncate">{d.title}</div><div className="text-[11px] text-muted-foreground truncate">{d.category} · {d.fileName} · v{d.version}</div></div></button>)}
      </PopoverContent>
    </Popover>
  );
}

/** Pager: "Showing 11–20 of 207", first / previous / page numbers / next / last. */
export function Pager({ page, total, size = 10, onPage }: { page: number; total: number; size?: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total === 0) return null;
  const nums: (number | "…")[] = []; const add = (n: number) => { if (!nums.includes(n)) nums.push(n); };
  [0, 1, page - 1, page, page + 1, pages - 2, pages - 1].filter(n => n >= 0 && n < pages).sort((a, b) => a - b).forEach((n, i, arr) => { if (i && n - (arr[i - 1] as number) > 1) nums.push("…"); add(n); });
  const btn = "h-7 min-w-7 px-2 rounded-md border text-xs disabled:opacity-40 hover:bg-accent";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>Showing {page * size + 1}–{Math.min(total, (page + 1) * size)} of {total}</span>
      {pages > 1 && <div className="flex items-center gap-1">
        <button type="button" className={btn} disabled={page === 0} onClick={() => onPage(0)}>«</button>
        <button type="button" className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>‹</button>
        {nums.map((n, i) => n === "…" ? <span key={"e" + i} className="px-1">…</span> : <button key={n} type="button" onClick={() => onPage(n)} className={cn(btn, n === page && "bg-primary text-primary-foreground border-primary hover:bg-primary")}>{n + 1}</button>)}
        <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>›</button>
        <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onPage(pages - 1)}>»</button>
      </div>}
    </div>
  );
}
