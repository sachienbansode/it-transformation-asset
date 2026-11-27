/** 2.11 — advanced problem management: root cause analysis (5 Whys, fishbone, timeline), known errors in the knowledge base,
 *  and known-error hints for the service desk on incidents. */
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAdvMeta } from "@/components/itsm-change-extras";
import { BookOpen, Lightbulb, Plus, X, Wrench } from "lucide-react";

type Rca = { whys?: string[]; fishbone?: Record<string, string[]>; timeline?: { at: string; what: string }[] };

function ListEditor({ items, onChange, placeholder, numbered, max = 7, testid }: { items: string[]; onChange: (v: string[]) => void; placeholder: (i: number) => string; numbered?: boolean; max?: number; testid?: string }) {
  const list = items.length ? items : [""];
  return (
    <div className="space-y-1.5">
      {list.map((w, i) => <div key={i} className="flex items-center gap-1.5">
        {numbered && <span className="w-12 shrink-0 text-[11px] font-semibold text-muted-foreground">Why {i + 1}</span>}
        <Input className="h-8 text-sm" value={w} data-testid={testid ? `${testid}-${i}` : undefined} placeholder={placeholder(i)} onChange={e => onChange(list.map((x, j) => (j === i ? e.target.value : x)))} />
        {list.length > 1 && <button type="button" className="text-muted-foreground hover:text-red-600" onClick={() => onChange(list.filter((_, j) => j !== i))}><X className="w-3.5 h-3.5" /></button>}
      </div>)}
      {list.length < max && <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onChange([...list, ""])}><Plus className="w-3 h-3" />Add</Button>}
    </div>
  );
}

/** Editor inside the problem form. `f` is the form data (rcaMethod, rca, rootCause, rootCauseCategory, permanentFix). */
export function RcaEditor({ f, set, disabled }: { f: any; set: (patch: any) => void; disabled?: boolean }) {
  const { data: meta } = useAdvMeta();
  if (!meta) return null;
  const rca: Rca = f.rca || {}; const method = f.rcaMethod || "5 Whys";
  const setRca = (p: Partial<Rca>) => set({ rca: { ...rca, ...p } });
  return (
    <fieldset disabled={disabled} className="sm:col-span-2 space-y-3" data-testid="rca-editor">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label>Analysis method</Label><Select value={method} onValueChange={v => set({ rcaMethod: v })}><SelectTrigger data-testid="rca-method"><SelectValue /></SelectTrigger><SelectContent>{meta.rcaMethods.map((m: string) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Root cause category</Label><Select value={f.rootCauseCategory || ""} onValueChange={v => set({ rootCauseCategory: v })}><SelectTrigger data-testid="rca-category"><SelectValue placeholder="Choose…" /></SelectTrigger><SelectContent>{meta.rootCauseCategories.map((m: string) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {method === "5 Whys" && <div className="rounded-lg border p-3 space-y-1.5"><div className="text-xs text-muted-foreground">Start from the symptom and ask “why?” until you reach a cause you can fix.</div>
        <ListEditor numbered items={rca.whys || []} onChange={whys => setRca({ whys })} placeholder={i => (i === 0 ? "Why did it happen? (e.g. terminal freezes after login)" : "Why?")} testid="rca-why" /></div>}
      {method === "Fishbone" && <div className="rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="sm:col-span-2 text-xs text-muted-foreground">List possible causes under each heading, then pick the real one below.</div>
        {meta.fishbone.map((k: string) => <div key={k}><div className="text-xs font-semibold mb-1">{k}</div><ListEditor max={10} items={rca.fishbone?.[k] || []} onChange={v => setRca({ fishbone: { ...(rca.fishbone || {}), [k]: v } })} placeholder={() => "Possible cause"} /></div>)}</div>}
      {method === "Timeline" && <div className="rounded-lg border p-3 space-y-1.5"><div className="text-xs text-muted-foreground">What happened, in order (time and event).</div>
        {(rca.timeline?.length ? rca.timeline : [{ at: "", what: "" }]).map((t, i, arr) => <div key={i} className="flex gap-1.5">
          <Input className="h-8 w-32 text-sm" placeholder="When" value={t.at} onChange={e => setRca({ timeline: arr.map((x, j) => (j === i ? { ...x, at: e.target.value } : x)) })} />
          <Input className="h-8 text-sm" placeholder="What happened" value={t.what} onChange={e => setRca({ timeline: arr.map((x, j) => (j === i ? { ...x, what: e.target.value } : x)) })} />
          {arr.length > 1 && <button type="button" className="text-muted-foreground hover:text-red-600" onClick={() => setRca({ timeline: arr.filter((_, j) => j !== i) })}><X className="w-3.5 h-3.5" /></button>}
        </div>)}
        <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setRca({ timeline: [...(rca.timeline || []), { at: "", what: "" }] })}><Plus className="w-3 h-3" />Add event</Button></div>}
      <div><Label>Root cause</Label><Textarea rows={2} data-testid="rca-root-cause" value={f.rootCause || ""} onChange={e => set({ rootCause: e.target.value })} placeholder="The real cause found by the analysis (needed for Root Cause Identified)" /></div>
      <div><Label>Workaround</Label><Textarea rows={2} data-testid="rca-workaround" value={f.workaround || ""} onChange={e => set({ workaround: e.target.value })} placeholder="How users / the service desk can get going until it is fixed (needed for Known Error)" /></div>
      <div><Label>Permanent fix</Label><Textarea rows={2} data-testid="rca-fix" value={f.permanentFix || ""} onChange={e => set({ permanentFix: e.target.value })} placeholder="What removes the cause for good — e.g. the change request that fixes it (needed to resolve)" /></div>
    </fieldset>
  );
}

/** Read-only view of the analysis. */
export function RcaView({ p }: { p: any }) {
  const r: Rca = p.rca || {};
  const has = (r.whys || []).length || Object.keys(r.fishbone || {}).length || (r.timeline || []).length;
  if (!has && !p.rootCauseCategory && !p.permanentFix) return null;
  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm" data-testid="rca-view">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Root cause analysis{p.rcaMethod ? ` · ${p.rcaMethod}` : ""}{p.rootCauseCategory ? ` · ${p.rootCauseCategory}` : ""}</div>
      {(r.whys || []).length > 0 && <ol className="space-y-0.5">{r.whys!.map((w, i) => <li key={i} className="flex gap-2"><span className="text-[11px] font-semibold text-muted-foreground w-12 shrink-0">Why {i + 1}</span><span>{w}</span></li>)}</ol>}
      {Object.keys(r.fishbone || {}).length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{Object.entries(r.fishbone!).map(([k, v]) => <div key={k}><div className="text-xs font-semibold">{k}</div><ul className="list-disc ml-4 text-xs">{v.map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}</div>}
      {(r.timeline || []).length > 0 && <div className="space-y-0.5">{r.timeline!.map((t, i) => <div key={i} className="flex gap-2 text-xs"><span className="w-24 shrink-0 font-mono text-muted-foreground">{t.at}</span><span>{t.what}</span></div>)}</div>}
      {p.permanentFix && <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/50 p-2"><div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold flex items-center gap-1"><Wrench className="w-3 h-3" />Permanent fix</div><div className="text-sm">{p.permanentFix}</div></div>}
    </div>
  );
}

/** Known error status + publish / refresh in the knowledge base. */
export function KnownErrorPanel({ p, canWork, onDone }: { p: any; canWork: boolean; onDone?: () => void }) {
  const { toast } = useToast(); const qc = useQueryClient();
  const ready = (p.rootCause || "").trim().length >= 10 && (p.workaround || "").trim().length >= 10;
  async function publish() {
    try { const r: any = await apiFetch(`/itsm-problems/${p.id}/known-error`, { method: "POST", body: "{}" }); toast({ title: p.kbArticleId ? "Knowledge base article refreshed" : "Published as a known error", description: `Article #${r.kbArticleId}` }); qc.invalidateQueries({ queryKey: ["problems"] }); onDone?.(); }
    catch (e: any) { toast({ title: "Could not publish", description: e.message, variant: "destructive" }); }
  }
  return (
    <div className={`rounded-lg border p-3 flex items-start gap-2 text-sm ${p.knownError ? "border-orange-200 bg-orange-50/60 dark:bg-orange-900/10" : ""}`} data-testid="known-error-panel">
      <BookOpen className="w-4 h-4 mt-0.5 text-orange-600 shrink-0" />
      <div className="flex-1 space-y-0.5">
        <div className="font-medium">{p.knownError ? "Known error — published in the knowledge base" : "Not yet a known error"}</div>
        <div className="text-xs text-muted-foreground">{p.knownError ? <>The service desk sees the workaround when a matching incident is raised. {p.kbArticleId && <a className="underline" href={`/itsm-kb?q=${encodeURIComponent("Known error: " + p.title)}`}>Open article #{p.kbArticleId}</a>}</>
          : ready ? "Root cause and workaround are written — publish so the service desk can use the workaround." : "Write the root cause and a workaround first (at least 10 characters each). Setting the status to Known Error publishes it."}</div>
      </div>
      {canWork && ready && <Button size="sm" variant="outline" className="h-7" onClick={publish} data-testid="known-error-publish">{p.knownError ? "Refresh article" : "Publish"}</Button>}
    </div>
  );
}

/** Known errors that match an incident (title / description / category / applications). */
export function KnownErrorHints({ text, category, apps, linkedId, onUse }: { text: string; category?: string | null; apps?: string[]; linkedId?: number | null; onUse?: (kbId: number) => void }) {
  const q = new URLSearchParams({ text: text || "", ...(category ? { category } : {}), ...(apps?.length ? { apps: apps.join("|") } : {}) }).toString();
  const { data = [] } = useQuery<any[]>({ queryKey: ["known-errors", q], queryFn: () => apiFetch(`/itsm-known-errors?${q}`), enabled: (text || "").trim().length >= 4, staleTime: 60_000 });
  if (!data.length) return null;
  return (
    <div className="sm:col-span-2 rounded-lg border border-orange-200 bg-orange-50/60 dark:bg-orange-900/10 p-3 space-y-2" data-testid="known-error-hints">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-700"><Lightbulb className="w-3.5 h-3.5" />Known error{data.length > 1 ? "s" : ""} that may match — try the workaround</div>
      {data.map(k => <div key={k.id} className="rounded-md bg-background/70 border p-2 text-sm space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap"><span className="font-medium flex-1 min-w-[150px]">{k.title.replace(/^Known error: /, "")}</span>
          <span className="text-[11px] text-muted-foreground">{k.problemNo} · {k.problemStatus}</span>
          {onUse && (linkedId === k.id ? <span className="text-[11px] font-semibold text-emerald-700">Linked</span> : <Button type="button" size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => onUse(k.id)} data-testid={`use-ke-${k.id}`}>Link to ticket</Button>)}</div>
        <div className="text-xs"><span className="text-muted-foreground">Workaround: </span>{k.workaround}</div>
        {k.permanentFix && <div className="text-xs"><span className="text-muted-foreground">Fixed by: </span>{k.permanentFix}</div>}
      </div>)}
    </div>
  );
}
