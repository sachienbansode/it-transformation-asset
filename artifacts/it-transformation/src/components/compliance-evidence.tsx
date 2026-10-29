import React, { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { Upload, Link2, Loader2, Eye, Download, Unlink, FileText, Search } from "lucide-react";
import { uploadFile, fileUrl, fmtDate, fmtSize, DOC_CATEGORIES } from "@/components/compliance-shared";

/* Evidence attached to a checkpoint or a schedule: upload new (goes into the library) or link an existing library document. */

export function EvidencePanel({ target, companyId, docs, canEdit, defaultCategory = "Evidence", onChange }: { target: { itemId?: number; gridId?: number }; companyId: number; docs: any[]; canEdit: boolean; defaultCategory?: string; onChange: () => void }) {
  const { toast } = useToast(); const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [cat, setCat] = useState(defaultCategory); const [pick, setPick] = useState(false);
  const base = target.itemId ? `/compliance-items/${target.itemId}` : `/compliance-grids/${target.gridId}`;
  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        const file = await uploadFile(f);
        await apiFetch("/compliance-documents", { method: "POST", body: JSON.stringify({ category: cat, title: f.name.replace(/\.[^.]+$/, ""), companyId, ...target, file }) });
      }
      toast({ title: `${files.length} file(s) uploaded`, description: "Also saved in the Evidence Library" }); onChange();
    } catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); }
    finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  async function unlink(d: any) {
    if (!await confirmDialog(`Unlink "${d.title}" from this ${target.itemId ? "checkpoint" : "schedule"}? It stays in the Evidence Library.`, { title: "Unlink evidence", confirmText: "Unlink" })) return;
    try { await apiFetch(`${base}/documents/${d.id}`, { method: "DELETE" }); onChange(); } catch (e: any) { toast({ title: "Could not unlink", description: e.message, variant: "destructive" }); }
  }
  return (
    <div className="space-y-2">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={cat} onValueChange={setCat}><SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent>{DOC_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          <input ref={ref} type="file" multiple className="hidden" onChange={onFiles} />
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={() => ref.current?.click()}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}Upload files</Button>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setPick(true)}><Link2 className="w-3.5 h-3.5" />Link from library</Button>
        </div>
      )}
      {!docs.length && <div className="text-xs text-muted-foreground">No evidence yet.</div>}
      <div className="divide-y rounded-[10px] border">
        {docs.map(d => (
          <div key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0"><div className="truncate font-medium">{d.title}</div>
              <div className="text-[11px] text-muted-foreground truncate">{d.category} · {d.fileName} · v{d.version} · {fmtSize(d.fileSize)} · {fmtDate(d.uploadedAt)}</div></div>
            {d.fileId && <a href={fileUrl(d.fileId)} target="_blank" rel="noreferrer" title="View"><Button type="button" size="icon" variant="ghost" className="h-7 w-7"><Eye className="w-3.5 h-3.5" /></Button></a>}
            {d.fileId && <a href={fileUrl(d.fileId, true)} title="Download"><Button type="button" size="icon" variant="ghost" className="h-7 w-7"><Download className="w-3.5 h-3.5" /></Button></a>}
            {canEdit && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Unlink" onClick={() => unlink(d)}><Unlink className="w-3.5 h-3.5 text-red-500" /></Button>}
          </div>
        ))}
      </div>
      {pick && <LibraryPicker companyId={companyId} exclude={docs.map(d => d.id)} onClose={() => setPick(false)} onPick={async (doc) => {
        try { await apiFetch(`${base}/documents`, { method: "POST", body: JSON.stringify({ documentId: doc.id }) }); onChange(); toast({ title: `Linked ${doc.title}` }); }
        catch (e: any) { toast({ title: "Could not link", description: e.message, variant: "destructive" }); }
      }} />}
    </div>
  );
}

function LibraryPicker({ companyId, exclude, onClose, onPick }: { companyId: number; exclude: number[]; onClose: () => void; onPick: (d: any) => Promise<void> }) {
  const [term, setTerm] = useState(""); const [busy, setBusy] = useState<number | null>(null);
  const { data: docs = [], isLoading } = useQuery<any[]>({ queryKey: ["compliance-documents", "pick", companyId, term], queryFn: () => apiFetch(`/compliance-documents?companyId=${companyId}${term ? `&q=${encodeURIComponent(term)}` : ""}`) });
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>Link from Evidence Library</DialogTitle><DialogDescription>This company's documents and group-wide documents.</DialogDescription></DialogHeader>
        <div className="relative"><Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" /><Input className="pl-8" placeholder="Search title or file name…" value={term} onChange={e => setTerm(e.target.value)} /></div>
        <div className="flex-1 overflow-y-auto divide-y rounded-[10px] border min-h-[120px]">
          {isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
          {docs.filter(d => !exclude.includes(d.id)).map(d => (
            <button key={d.id} type="button" disabled={busy !== null} onClick={async () => { setBusy(d.id); await onPick(d); setBusy(null); onClose(); }} className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-accent/50 text-sm">
              {busy === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-primary" />}
              <div className="min-w-0"><div className="truncate font-medium">{d.title}</div><div className="text-[11px] text-muted-foreground truncate">{d.category} · {d.companyName || "Group-wide"} · {d.fileName} v{d.version} · used {d.linkCount}×</div></div>
            </button>
          ))}
          {!isLoading && !docs.filter(d => !exclude.includes(d.id)).length && <div className="p-3 text-sm text-muted-foreground">Nothing found.</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
