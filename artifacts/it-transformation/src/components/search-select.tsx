import React, { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { Check, ChevronsUpDown, X, UserPlus, Loader2 } from "lucide-react";

/* ITH-124 — searchable drop-downs (type to filter). */
export type Opt = { value: string; label: string; hint?: string };

/** Single choice. */
export function SearchSelect({ options, value, onChange, placeholder = "Select…", className, testId }: { options: Opt[]; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; testId?: string }) {
  const [open, setOpen] = useState(false); const sel = options.find(o => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-testid={testId} className={cn("h-9 w-full rounded-md border bg-background px-3 text-sm flex items-center justify-between gap-2 text-left", !sel && "text-muted-foreground", className)}>
          <span className="truncate">{sel ? sel.label : value || placeholder}</span><ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[240px]" align="start">
        <Command><CommandInput placeholder="Type to search…" /><CommandList className="max-h-64"><CommandEmpty>No match</CommandEmpty>
          {options.map(o => <CommandItem key={o.value} value={`${o.label} ${o.hint || ""} ${o.value}`} onSelect={() => { onChange(o.value); setOpen(false); }}>
            <Check className={cn("w-3.5 h-3.5 mr-2", value === o.value ? "opacity-100" : "opacity-0")} />{o.label}{o.hint && <span className="ml-auto text-xs text-muted-foreground">{o.hint}</span>}</CommandItem>)}
        </CommandList></Command>
      </PopoverContent>
    </Popover>
  );
}

/** Several choices, shown as removable chips. */
export function SearchMulti({ options, value, onChange, placeholder = "Add…", testId }: { options: Opt[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const lab = (v: string) => options.find(o => o.value === v || o.label.toLowerCase() === v.toLowerCase())?.label || v;
  return (
    <div className="space-y-1.5">
      {value.length > 0 && <div className="flex flex-wrap gap-1">{value.map(v => <span key={v} className="inline-flex items-center gap-1 rounded-md border bg-primary/5 px-2 py-0.5 text-xs">{lab(v)}<button type="button" aria-label={`Remove ${lab(v)}`} onClick={() => onChange(value.filter(x => x !== v))}><X className="w-3 h-3" /></button></span>)}</div>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild><button type="button" data-testid={testId} className="h-9 w-full rounded-md border bg-background px-3 text-sm flex items-center justify-between text-muted-foreground">{placeholder}<ChevronsUpDown className="w-3.5 h-3.5 opacity-50" /></button></PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[240px]" align="start">
          <Command><CommandInput placeholder="Type to search…" /><CommandList className="max-h-64"><CommandEmpty>No match</CommandEmpty>
            {options.map(o => { const on = value.some(v => v === o.value || v.toLowerCase() === o.label.toLowerCase());
              return <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => onChange(on ? value.filter(v => v !== o.value && v.toLowerCase() !== o.label.toLowerCase()) : [...value, o.value])}>
                <Check className={cn("w-3.5 h-3.5 mr-2", on ? "opacity-100" : "opacity-0")} />{o.label}</CommandItem>; })}
          </CommandList></Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Employees one by one: search by name, email or employee code; each pick is added as a chip. */
export function EmployeePicker({ value, onChange, endpoint = "/policies-people" }: { value: number[]; onChange: (v: number[]) => void; endpoint?: string }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [hits, setHits] = useState<any[]>([]); const [busy, setBusy] = useState(false);
  const [known, setKnown] = useState<Record<number, any>>({});
  useEffect(() => { const miss = value.filter(id => !known[id]); if (!miss.length) return;
    apiFetch<any[]>(`${endpoint}?ids=${miss.join(",")}`).then(r => setKnown(k => ({ ...k, ...Object.fromEntries(r.map(p => [p.id, p])) }))).catch(() => {}); }, [value.join(",")]);
  useEffect(() => { if (!open) return; setBusy(true); const t = setTimeout(() => apiFetch<any[]>(`${endpoint}?q=${encodeURIComponent(q)}`).then(setHits).catch(() => setHits([])).finally(() => setBusy(false)), 250); return () => clearTimeout(t); }, [q, open]);
  const add = (p: any) => { setKnown(k => ({ ...k, [p.id]: p })); if (!value.includes(p.id)) onChange([...value, p.id]); setQ(""); setOpen(false); };
  const shown = useMemo(() => hits.filter(h => !value.includes(h.id)), [hits, value]);
  return (
    <div className="space-y-1.5" data-testid="employee-picker">
      {value.length > 0 && <div className="flex flex-wrap gap-1">{value.map(id => { const p = known[id]; return <span key={id} className="inline-flex items-center gap-1 rounded-md border bg-primary/5 px-2 py-0.5 text-xs" title={p?.email}>{p ? `${p.name}${p.employeeCode ? ` (${p.employeeCode})` : ""}` : `#${id}`}<button type="button" aria-label="Remove" onClick={() => onChange(value.filter(x => x !== id))}><X className="w-3 h-3" /></button></span>; })}</div>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild><button type="button" className="h-9 w-full rounded-md border bg-background px-3 text-sm flex items-center gap-2 text-muted-foreground"><UserPlus className="w-4 h-4" />Add employee…<span className="ml-auto text-xs">{value.length ? `${value.length} selected` : ""}</span></button></PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[300px]" align="start">
          <Command shouldFilter={false}><CommandInput placeholder="Name, email or employee code…" value={q} onValueChange={setQ} /><CommandList className="max-h-72">
            {busy && <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Searching…</div>}
            {!busy && !shown.length && <CommandEmpty>{hits.length ? "Already added" : "No employee found"}</CommandEmpty>}
            {shown.map(p => <CommandItem key={p.id} value={String(p.id)} onSelect={() => add(p)}><div className="min-w-0"><div className="text-sm truncate">{p.name}</div><div className="text-[11px] text-muted-foreground truncate">{[p.employeeCode, p.email, p.department].filter(Boolean).join(" · ")}</div></div></CommandItem>)}
          </CommandList></Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
