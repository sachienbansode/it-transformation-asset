import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { apiFetch, API } from "@/lib/api";
import { cn } from "@/lib/utils";

/* Shared bits for Audit & Compliance screens. */

export const STATUSES = ["Pending", "In Progress", "Submitted", "Under Review", "Partially Closed", "Closed", "Closed-Obs", "Not Applicable"];
export const CLOSED = ["Closed", "Closed-Obs", "Not Applicable"];
export const TEAM_STATUSES = ["Pending", "In Progress", "Submitted"];
export const AUDITOR_STATUSES = ["Under Review", "Partially Closed", "Closed", "Closed-Obs", "Not Applicable"];
export const AUDIT_STATUSES = ["Planning", "Fieldwork", "Reporting", "Closed"];
export const DOC_CATEGORIES = ["Policy", "Procedure", "Evidence", "Report", "Agreement", "Circular", "Engagement Letter", "Other"];

const STATUS_STYLE: Record<string, string> = {
  "Pending": "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  "In Progress": "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "Submitted": "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "Under Review": "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "Partially Closed": "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  "Closed": "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "Closed-Obs": "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  "Not Applicable": "bg-zinc-100 text-zinc-500 dark:bg-zinc-500/15 dark:text-zinc-400",
};
export const StatusBadge = ({ s, className }: { s: string; className?: string }) => (
  <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[s] || STATUS_STYLE.Pending, className)}>{s}</span>
);

export const fmtDate = (d?: string | null) => (d ? new Date(String(d).length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const d10 = (d?: string | null) => (d ? String(d).slice(0, 10) : "");
export const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
export const isOverdue = (i: { targetDate?: string | null; status: string }) => !!i.targetDate && d10(i.targetDate) < today() && !CLOSED.includes(i.status);
export const refOf = (i: { refNo?: string | null; seq?: number }) => (i.refNo ? `${i.refNo}${(i.seq ?? 1) > 1 ? "." + i.seq : ""}` : "—");
export const fileUrl = (fileId: number, download = false) => `${API}/compliance-files/${fileId}${download ? "?download=1" : ""}`;
export const fmtSize = (n?: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export const usePeople = () => useQuery<any[]>({ queryKey: ["compliance-people"], queryFn: () => apiFetch("/compliance-people"), staleTime: 300_000 });
export const useCompanies = () => useQuery<any[]>({ queryKey: ["compliance-companies"], queryFn: () => apiFetch("/compliance-companies") });

/** Upload one file to storage; returns the file block the compliance API expects. */
export async function uploadFile(file: File) {
  if (file.size > 25 * 1024 * 1024) throw new Error("File too large — maximum 25 MB");
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
