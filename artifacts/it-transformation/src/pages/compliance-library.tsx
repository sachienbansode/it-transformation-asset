import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { Search, Upload, FileText, Eye, Download, Loader2, Archive, CalendarClock, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocViewer } from "@/components/doc-viewer";
import { useCompanies, uploadFile, fileUrl, fmtDate, fmtSize, d10, today, DOC_CATEGORIES, PersonPicker, refOf } from "@/components/compliance-shared";

/* Evidence & policy library: one copy of each document, versioned, reused by any number of checkpoints and audits. */

export default function ComplianceLibrary() {
  const { canAccess } = useAuth(); const canEdit = canAccess("compliance", "write"); const view = useDocViewer();
  const { data: companies = [] } = useCompanies();
  const [company, setCompany] = useState("all"); const [cat, setCat] = useState("all"); const [term, setTerm] = useState("");
  const { data: docs = [], isLoading } = useQuery<any[]>({ queryKey: ["compliance-documents", company, cat, term],
    queryFn: () => apiFetch(`/compliance-documents?${new URLSearchParams({ ...(company !== "all" ? { companyId: company } : {}), ...(cat !== "all" ? { category: cat } : {}), ...(term ? { q: term } : {}) })}`) });
  const [open, setOpen] = useState<number | null>(null); const [add, setAdd] = useState(false);
  const dueSoon = (d: any) => d.nextReviewDate && d10(d.nextReviewDate) <= new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><h1 className="text-2xl font-bold tracking-tight">Evidence Library</h1><p className="text-sm text-muted-foreground">Policies, procedures and evidence — versioned, and reusable across audits and companies. Files open only inside IT Hub and every view is logged.</p></div>
        {canEdit && <Button size="sm" className="gap-1.5" onClick={() => setAdd(true)}><Upload className="w-4 h-4" />Upload document</Button>}
      </div>
      <Card><CardContent className="p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative w-64"><Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" /><Input className="pl-8 h-9" placeholder="Search title, description, file…" value={term} onChange={e => setTerm(e.target.value)} /></div>
          <Select value={company} onValueChange={setCompany}><SelectTrigger className="h-9 w-60"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All companies</SelectItem>{companies.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name} (+ group-wide)</SelectItem>)}</SelectContent></Select>
          <Select value={cat} onValueChange={setCat}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{DOC_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          <span className="text-xs text-muted-foreground ml-auto self-center">{docs.length} document(s)</span>
        </div>
        <div className="rounded-[10px] border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40"><th className="text-left px-3 py-2">Document</th><th className="text-left px-2 w-24">Category</th><th className="text-left px-2 w-44">Company</th><th className="text-left px-2 w-32">Owner</th><th className="text-left px-2 w-28">Next review</th><th className="px-2 w-16">Used</th><th className="w-20"></th></tr></thead>
            <tbody>{docs.map(d => (
              <tr key={d.id} className="border-t hover:bg-accent/40 cursor-pointer" onClick={() => setOpen(d.id)}>
                <td className="px-3 py-2"><div className="font-medium">{d.title}</div><div className="text-[11px] text-muted-foreground">{d.fileName} · v{d.version} · {fmtSize(d.fileSize)} · {fmtDate(d.uploadedAt)}</div></td>
                <td className="px-2 text-xs">{d.category}</td><td className="px-2 text-xs">{d.companyName || "Group-wide"}</td><td className="px-2 text-xs">{d.ownerName || "—"}</td>
                <td className={cn("px-2 text-xs", dueSoon(d) && "text-red-600 font-semibold")}>{d.nextReviewDate ? <span className="inline-flex items-center gap-1">{dueSoon(d) && <CalendarClock className="w-3 h-3" />}{fmtDate(d.nextReviewDate)}</span> : "—"}</td>
                <td className="px-2 text-center text-xs">{d.linkCount}</td>
                <td className="px-2" onClick={e => e.stopPropagation()}>{d.fileId && <div className="flex"><Button size="icon" variant="ghost" className="h-7 w-7" title="View" onClick={() => view({ url: fileUrl(d.fileId), downloadUrl: fileUrl(d.fileId, true), name: d.fileName, title: d.title, contentType: d.contentType })}><Eye className="w-3.5 h-3.5" /></Button><a href={fileUrl(d.fileId, true)}><Button size="icon" variant="ghost" className="h-7 w-7"><Download className="w-3.5 h-3.5" /></Button></a></div>}</td>
              </tr>))}
              {!isLoading && !docs.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No documents yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
      {open && <DocDialog id={open} canEdit={canEdit} onClose={() => setOpen(null)} />}
      {add && <NewDocDialog onClose={() => setAdd(false)} />}
    </div>
  );
}

function MetaFields({ f, set, companies }: { f: any; set: (k: string, v: any) => void; companies: any[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2"><Label>Title *</Label><Input value={f.title} onChange={e => set("title", e.target.value)} /></div>
      <div><Label>Category</Label><Select value={f.category} onValueChange={v => set("category", v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{DOC_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Company</Label><Select value={f.companyId ? String(f.companyId) : "group"} onValueChange={v => set("companyId", v === "group" ? null : Number(v))}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="group">Group-wide (all companies)</SelectItem>{companies.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Owner</Label><PersonPicker value={f.ownerUserId} onChange={v => set("ownerUserId", v)} /></div>
      <div><Label>Approved by</Label><Input value={f.approvedBy ?? ""} onChange={e => set("approvedBy", e.target.value)} placeholder="e.g. Board, IT Strategy Committee" /></div>
      <div><Label>Approved on</Label><Input type="date" value={d10(f.approvedOn)} onChange={e => set("approvedOn", e.target.value)} /></div>
      <div><Label>Last review</Label><Input type="date" value={d10(f.lastReviewDate)} onChange={e => set("lastReviewDate", e.target.value)} /></div>
      <div><Label>Next review</Label><Input type="date" value={d10(f.nextReviewDate)} onChange={e => set("nextReviewDate", e.target.value)} /></div>
      <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={!!f.confidential} onChange={e => set("confidential", e.target.checked)} />Confidential</label>
      <div className="col-span-2"><Label>Description</Label><Textarea rows={2} value={f.description ?? ""} onChange={e => set("description", e.target.value)} /></div>
    </div>
  );
}
const metaBody = (f: any) => ({ title: f.title, category: f.category, companyId: f.companyId ?? null, ownerUserId: f.ownerUserId ?? null, approvedBy: f.approvedBy || null, approvedOn: d10(f.approvedOn) || null,
  lastReviewDate: d10(f.lastReviewDate) || null, nextReviewDate: d10(f.nextReviewDate) || null, confidential: !!f.confidential, description: f.description || null });

function NewDocDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast(); const { data: companies = [] } = useCompanies(); const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false);
  const [f, setF] = useState<any>({ title: "", category: "Policy", companyId: null, ownerUserId: null, lastReviewDate: today() });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function save() {
    if (!file) return; setBusy(true);
    try { const up = await uploadFile(file); await apiFetch("/compliance-documents", { method: "POST", body: JSON.stringify({ ...metaBody(f), file: up }) }); qc.invalidateQueries({ queryKey: ["compliance-documents"] }); toast({ title: "Document uploaded" }); onClose(); }
    catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>Upload document</DialogTitle><DialogDescription>Link it to checkpoints from any audit afterwards.</DialogDescription></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          <input ref={ref} type="file" className="hidden" onChange={e => { const x = e.target.files?.[0] || null; setFile(x); if (x && !f.title) set("title", x.name.replace(/\.[^.]+$/, "")); }} />
          <Button type="button" variant="outline" className="w-full gap-2" onClick={() => ref.current?.click()}><Upload className="w-4 h-4" />{file ? file.name : "Choose file (max 25 MB)"}</Button>
          <MetaFields f={f} set={set} companies={companies} />
        </div>
        <div className="flex gap-2 pt-3 border-t"><Button onClick={save} disabled={busy || !file || f.title.trim().length < 2} className="gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Upload</Button><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function DocDialog({ id, canEdit, onClose }: { id: number; canEdit: boolean; onClose: () => void }) {
  const view = useDocViewer(); const qc = useQueryClient(); const { toast } = useToast(); const { data: companies = [] } = useCompanies(); const ref = useRef<HTMLInputElement>(null);
  const { data: d, refetch } = useQuery<any>({ queryKey: ["compliance-document", id], queryFn: () => apiFetch(`/compliance-documents/${id}`) });
  const [f, setF] = useState<any>(null); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  React.useEffect(() => { if (d) setF({ ...d }); }, [d]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const refresh = () => { refetch(); qc.invalidateQueries({ queryKey: ["compliance-documents"] }); };
  async function save() { setBusy(true); try { await apiFetch(`/compliance-documents/${id}`, { method: "PATCH", body: JSON.stringify(metaBody(f)) }); refresh(); toast({ title: "Saved" }); } catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); } finally { setBusy(false); } }
  async function newVersion(e: React.ChangeEvent<HTMLInputElement>) {
    const x = e.target.files?.[0]; if (!x) return; setBusy(true);
    try { const up = await uploadFile(x); await apiFetch(`/compliance-documents/${id}/files`, { method: "POST", body: JSON.stringify({ ...up, note: note || null }) }); setNote(""); refresh(); toast({ title: "New version uploaded", description: "Every checkpoint using this document now shows the new version" }); }
    catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  async function archive() {
    if (!await confirmDialog(`Archive "${d.title}"? It disappears from the library and pickers; checkpoints already using it keep the link.`, { title: "Archive document", confirmText: "Archive", destructive: true })) return;
    try { await apiFetch(`/compliance-documents/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) }); qc.invalidateQueries({ queryKey: ["compliance-documents"] }); onClose(); } catch (e: any) { toast({ title: "Could not archive", description: e.message, variant: "destructive" }); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />{d?.title ?? "Loading…"}</DialogTitle><DialogDescription>{d ? `${d.category} · ${d.companyName || "Group-wide"}` : ""}</DialogDescription></DialogHeader>
        {d && f && <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {canEdit ? <MetaFields f={f} set={set} companies={companies} /> : <div className="text-sm whitespace-pre-line">{d.description || "—"}</div>}
          <div><div className="text-sm font-semibold mb-1.5">Versions</div>
            <div className="divide-y rounded-[10px] border">{d.files.map((x: any) => (
              <div key={x.id} className="flex items-center gap-2 px-3 py-2 text-sm"><span className="font-mono text-xs w-8">v{x.version}</span>
                <div className="flex-1 min-w-0"><div className="truncate">{x.fileName}</div><div className="text-[11px] text-muted-foreground">{fmtSize(x.fileSize)} · {x.uploadedBy} · {new Date(x.uploadedAt).toLocaleString("en-IN")}{x.note ? ` · ${x.note}` : ""}</div></div>
                <Button size="icon" variant="ghost" className="h-7 w-7" title="View" onClick={() => view({ url: fileUrl(x.id), downloadUrl: fileUrl(x.id, true), name: x.fileName, title: `${d.title} v${x.version}`, contentType: x.contentType })}><Eye className="w-3.5 h-3.5" /></Button><a href={fileUrl(x.id, true)}><Button size="icon" variant="ghost" className="h-7 w-7"><Download className="w-3.5 h-3.5" /></Button></a>
              </div>))}</div>
            {canEdit && <div className="flex gap-2 mt-2"><Input className="h-8 text-xs" placeholder="What changed (optional)" value={note} onChange={e => setNote(e.target.value)} />
              <input ref={ref} type="file" className="hidden" onChange={newVersion} /><Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0" disabled={busy} onClick={() => ref.current?.click()}><Upload className="w-3.5 h-3.5" />Upload new version</Button></div>}
          </div>
          <div><div className="text-sm font-semibold mb-1.5">Used in ({d.links.length})</div>
            <div className="divide-y rounded-[10px] border">{d.links.map((l: any) => (
              <Link key={l.id} href={`/compliance/${l.auditId}`} className="block px-3 py-2 text-sm hover:bg-accent/40"><span className="font-mono text-xs text-primary mr-2">{l.auditNo} · {refOf(l)}</span><span className="line-clamp-1">{l.checkpoint}</span></Link>))}
              {!d.links.length && <div className="px-3 py-3 text-xs text-muted-foreground">Not linked to any checkpoint yet.</div>}</div></div>
        </div>}
        <div className="flex gap-2 pt-3 border-t">
          {canEdit && <Button onClick={save} disabled={busy || !f} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save</Button>}
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          {canEdit && d && <Button variant="ghost" className="ml-auto gap-1.5 text-red-600" onClick={archive}><Archive className="w-4 h-4" />Archive</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
