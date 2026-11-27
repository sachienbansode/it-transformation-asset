import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/search-select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useCatalog } from "@/components/itsm-routing";
import { CheckCircle2, Circle, MinusCircle, ListChecks, Plus, Trash2, ArrowUp, ArrowDown, Loader2 } from "lucide-react";

/* 2.09 (ITH-192/193) — service request items: the item's own questions on the form, answers on the ticket,
 * fulfilment checklist for the team, and the editor in ITSM Setup. */
export type Field = { key: string; label: string; type: "text" | "textarea" | "number" | "date" | "select" | "yesno" | "user"; required?: boolean; options?: string[] };

export function missingAnswers(fields: Field[], v: Record<string, any>) { return (fields || []).filter(f => f.required && (v?.[f.key] === undefined || v?.[f.key] === null || String(v[f.key]).trim() === "")).map(f => f.label); }

export function RequestFormFields({ fields, value, onChange, item }: { fields: Field[]; value: Record<string, any>; onChange: (v: Record<string, any>) => void; item?: string }) {
  const { data: people = [] } = useQuery<any[]>({ queryKey: ["itsm-people"], queryFn: () => apiFetch("/itsm-people"), enabled: fields.some(f => f.type === "user"), staleTime: 60_000 });
  if (!fields?.length) return null;
  const set = (k: string, v: any) => onChange({ ...(value || {}), [k]: v });
  return (
    <div className="sm:col-span-2 rounded-[10px] border border-sky-200 bg-sky-50/50 dark:bg-sky-500/5 p-3 space-y-3" data-testid="request-item-fields">
      <div className="text-xs font-semibold text-sky-800 dark:text-sky-300">Details for {item || "this request"}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        {fields.map(f => { const v = value?.[f.key] ?? ""; const L = <Label>{f.label}{f.required && " *"}</Label>; const wide = f.type === "textarea";
          return <div key={f.key} className={cn("space-y-1.5 min-w-0", wide && "sm:col-span-2")} data-testid={`rf-${f.key}`}>{L}
            {f.type === "textarea" ? <Textarea rows={2} value={v} onChange={e => set(f.key, e.target.value)} />
              : f.type === "select" ? <Select value={v || ""} onValueChange={x => set(f.key, x)}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{(f.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
              : f.type === "yesno" ? <div className="flex gap-1.5">{["Yes", "No"].map(o => <button key={o} type="button" onClick={() => set(f.key, o)} className={cn("rounded-full border px-3 py-1 text-xs", v === o ? "border-primary bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted")}>{o}</button>)}</div>
              : f.type === "user" ? <SearchSelect options={people.map((p: any) => ({ value: String(p.id), label: p.name, hint: [p.employeeCode, p.department].filter(Boolean).join(" · ") }))} value={v ? String(v) : ""} onChange={x => set(f.key, x)} placeholder="Search a person" />
              : <Input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} min={f.type === "number" ? 0 : undefined} value={v} onChange={e => set(f.key, e.target.value)} />}
          </div>; })}
      </div>
    </div>
  );
}

/** answers on the ticket, with the item's question labels */
export function RequestAnswers({ request }: { request: any }) {
  const { data: cat = [] } = useCatalog("request");
  const fields: Field[] = useMemo(() => { const c = cat.find((r: any) => !r.subcategory && r.category?.toLowerCase() === String(request.category || "").toLowerCase()); const sub = cat.find((r: any) => r.subcategory && r.category?.toLowerCase() === String(request.category || "").toLowerCase() && r.subcategory?.toLowerCase() === String(request.subcategory || "").toLowerCase());
    return (sub?.formFields?.length ? sub.formFields : c?.formFields) || []; }, [cat, request]);
  const d = request.formData || {}; const keys = [...fields.map(f => f.key).filter(k => k in d), ...Object.keys(d).filter(k => !fields.some(f => f.key === k))]; if (!keys.length) return null;
  const label = (k: string) => fields.find(f => f.key === k)?.label || k;
  return <div className="rounded-[10px] border p-3" data-testid="request-answers"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Request details</div>
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">{keys.map(k => <div key={k} className="min-w-0"><dt className="text-[11px] text-muted-foreground">{label(k)}</dt><dd className="font-medium break-words">{String(d[k]).replace(/ <[^>]+>$/, "")}</dd></div>)}</dl></div>;
}

/** fulfilment checklist: the team ticks the steps; the request can be completed only when none is open */
export function RequestChecklist({ requestId, readonly }: { requestId: number; readonly?: boolean }) {
  const qc = useQueryClient(); const { toast } = useToast(); const [add, setAdd] = useState(""); const [busy, setBusy] = useState<number | "add" | null>(null);
  const { data } = useQuery<any>({ queryKey: ["req-tasks", requestId], queryFn: () => apiFetch(`/service-requests/${requestId}/tasks`) });
  if (!data || (!data.tasks.length && !(data.canEdit && !readonly))) return null;
  const done = data.tasks.filter((t: any) => t.status !== "Open").length;
  const refresh = () => qc.invalidateQueries({ queryKey: ["req-tasks", requestId] });
  async function setStatus(t: any, status: string) {
    let note: string | null = null; if (status === "Not needed") { note = window.prompt(`Why is “${t.title}” not needed?`) || ""; if (note.trim().length < 5) return; }
    setBusy(t.id); try { await apiFetch(`/request-tasks/${t.id}`, { method: "PATCH", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ status, note }) }); refresh(); } catch (e: any) { toast({ title: "Not saved", description: e.message, variant: "destructive" }); } finally { setBusy(null); }
  }
  return (
    <div className="rounded-[10px] border p-3 space-y-2" data-testid="request-checklist">
      <div className="flex items-center gap-2 text-xs font-semibold"><ListChecks className="w-4 h-4 text-primary" />Fulfilment checklist <span className="font-normal text-muted-foreground">{done} of {data.tasks.length} done</span>
        <div className="ml-auto h-1.5 w-24 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${data.tasks.length ? done / data.tasks.length * 100 : 0}%` }} /></div></div>
      <ul className="space-y-1">{data.tasks.map((t: any) => { const I = t.status === "Done" ? CheckCircle2 : t.status === "Not needed" ? MinusCircle : Circle; return (
        <li key={t.id} className="flex items-start gap-2 text-sm" data-testid={`task-${t.id}`}>
          <button type="button" disabled={!(data.canEdit && !readonly) || busy === t.id} onClick={() => setStatus(t, t.status === "Open" ? "Done" : "Open")} title={t.status === "Open" ? "Mark done" : "Mark open again"} className="mt-0.5 shrink-0">
            {busy === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <I className={cn("w-4 h-4", t.status === "Done" ? "text-emerald-600" : t.status === "Not needed" ? "text-muted-foreground" : "text-muted-foreground/60")} />}</button>
          <div className="flex-1 min-w-0"><span className={cn(t.status !== "Open" && "line-through text-muted-foreground")}>{t.title}</span>
            {t.status !== "Open" && <div className="text-[11px] text-muted-foreground">{t.status} · {t.doneBy} · {fmtDateTime(t.doneAt)}{t.note ? ` — ${t.note}` : ""}</div>}</div>
          {(data.canEdit && !readonly) && t.status === "Open" && <button type="button" className="text-[11px] text-muted-foreground hover:underline shrink-0" onClick={() => setStatus(t, "Not needed")}>not needed</button>}
        </li>); })}</ul>
      {(data.canEdit && !readonly) && <div className="flex gap-2"><Input className="h-8 text-sm" placeholder="Add a step" value={add} onChange={e => setAdd(e.target.value)} />
        <Button size="sm" variant="outline" disabled={add.trim().length < 3 || busy === "add"} onClick={async () => { setBusy("add"); try { await apiFetch(`/service-requests/${requestId}/tasks`, { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ title: add }) }); setAdd(""); refresh(); } catch (e: any) { toast({ title: "Not added", description: e.message, variant: "destructive" }); } finally { setBusy(null); } }}><Plus className="w-4 h-4" /></Button></div>}
    </div>
  );
}

/** ITSM Setup › Categories: questions and checklist for a service-request category or item */
export function ItemSetupDialog({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast(); const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<any[]>(row.formFields || []); const [tasks, setTasks] = useState<string>((row.tasks || []).join("\n"));
  useEffect(() => { setFields((row.formFields || []).map((f: any) => ({ ...f, options: Array.isArray(f.options) ? f.options.join(", ") : f.options }))); setTasks((row.tasks || []).join("\n")); }, [row]);
  const upd = (i: number, k: string, v: any) => setFields(fs => fs.map((f, j) => j === i ? { ...f, [k]: v } : f));
  const move = (i: number, d: number) => setFields(fs => { const n = [...fs]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  async function save() {
    setBusy(true);
    try { await apiFetch(`/itsm-catalog/${row.id}`, { method: "PATCH", body: JSON.stringify({ formFields: fields.map(f => ({ ...f, options: f.type === "select" ? String(f.options || "").split(",").map((x: string) => x.trim()).filter(Boolean) : undefined })), tasks: tasks.split("\n") }) });
      toast({ title: "Saved", description: "Used for new requests" }); qc.invalidateQueries({ queryKey: ["itsm-catalog"] }); onClose(); }
    catch (e: any) { toast({ title: "Not saved", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  const name = row.subcategory ? `${row.category} › ${row.subcategory}` : row.category;
  return (
    <Dialog open onOpenChange={v => !v && !busy && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto" data-testid="item-setup">
        <DialogHeader><DialogTitle>Questions & checklist — {name}</DialogTitle>
          <DialogDescription>{row.subcategory ? "Leave empty to use the category's questions and checklist." : "Used by every item in this category unless the item has its own."}</DialogDescription></DialogHeader>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Questions on the request form</div>
          {fields.map((f, i) => <div key={i} className="grid grid-cols-12 gap-2 items-center rounded-md border p-2">
            <Input className="col-span-12 sm:col-span-5 h-8" placeholder="Question" value={f.label || ""} onChange={e => upd(i, "label", e.target.value)} />
            <div className="col-span-6 sm:col-span-3"><Select value={f.type || "text"} onValueChange={v => upd(i, "type", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{[["text", "Short text"], ["textarea", "Long text"], ["number", "Number"], ["date", "Date"], ["select", "Choose from list"], ["yesno", "Yes / No"], ["user", "Person"]].map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
            <label className="col-span-3 sm:col-span-2 flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!f.required} onChange={e => upd(i, "required", e.target.checked)} />Required</label>
            <div className="col-span-3 sm:col-span-2 flex justify-end gap-0.5"><Button size="icon" variant="ghost" className="h-7 w-7" disabled={!i} onClick={() => move(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setFields(fs => fs.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></div>
            {f.type === "select" && <Input className="col-span-12 h-8 text-xs" placeholder="Choices, comma separated" value={f.options || ""} onChange={e => upd(i, "options", e.target.value)} />}
          </div>)}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setFields(fs => [...fs, { label: "", type: "text", required: false }])}><Plus className="w-4 h-4" />Add question</Button>
        </div>
        <div className="space-y-1.5 mt-3"><div className="text-sm font-semibold">Fulfilment checklist (one step per line)</div>
          <Textarea rows={5} value={tasks} onChange={e => setTasks(e.target.value)} placeholder={"Check the approval\nGrant the access\nConfirm with the requester"} /></div>
        <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy} data-testid="item-setup-save">{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
