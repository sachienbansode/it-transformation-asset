import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";
import { Upload, Loader2, Eye, Download, Trash2, FileText, Share2 } from "lucide-react";
import { uploadFile, fileUrl, fmtDate, fmtSize } from "@/components/compliance-shared";
import { useDocViewer } from "@/components/doc-viewer";

/* Reference documents — the base circular, engagement letter, scope letter — on a template (every audit made from it) or one audit. */

const CATS = ["Circular", "Engagement Letter", "Report", "Policy", "Other"];
export function ReferencesPanel({ ownerType, ownerId, canEdit }: { ownerType: "template" | "audit"; ownerId: number; canEdit: boolean }) {
  const qc = useQueryClient(); const { toast } = useToast(); const ref = useRef<HTMLInputElement>(null); const view = useDocViewer();
  const key = ["compliance-references", ownerType, ownerId];
  const { data: docs = [], isLoading } = useQuery<any[]>({ queryKey: key, queryFn: () => apiFetch(`/compliance-references/${ownerType}/${ownerId}`) });
  const [cat, setCat] = useState("Circular"); const [title, setTitle] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["compliance-references"] });
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; setBusy(true);
    try { const file = await uploadFile(f); await apiFetch(`/compliance-references/${ownerType}/${ownerId}`, { method: "POST", body: JSON.stringify({ title: title.trim() || f.name.replace(/\.[^.]+$/, ""), category: cat, file, sharedWithAuditor: true }) }); setTitle(""); refresh(); toast({ title: "Reference document added" }); }
    catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  const mine = (d: any) => d.ownerType === ownerType;
  return (
    <div className="space-y-2">
      {canEdit && <div className="flex flex-wrap items-center gap-2">
        <Select value={cat} onValueChange={setCat}><SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger><SelectContent>{CATS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Input className="h-8 text-xs flex-1 min-w-[180px]" placeholder="Title, e.g. SEBI circular on system audit of MFs (optional)" value={title} onChange={e => setTitle(e.target.value)} />
        <input ref={ref} type="file" className="hidden" onChange={onFile} />
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={() => ref.current?.click()}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}Upload</Button>
      </div>}
      {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
      {!isLoading && !docs.length && <div className="text-xs text-muted-foreground">None yet — upload the base circular so owners and the auditor work from the same reference.</div>}
      <div className="divide-y rounded-[10px] border">
        {docs.map(d => (
          <div key={`${d.ownerType}-${d.id}`} className="flex items-center gap-2 px-3 py-2 text-sm">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0"><div className="truncate font-medium">{d.title}</div>
              <div className="text-[11px] text-muted-foreground truncate">{d.category} · {d.fileName} · {fmtSize(d.fileSize)} · {fmtDate(d.uploadedAt)}{!mine(d) ? " · from the template" : ""}{d.sharedWithAuditor ? " · visible to auditor" : " · internal only"}</div></div>
            {canEdit && mine(d) && <label className="text-[11px] flex items-center gap-1 text-muted-foreground" title="Visible in the auditor portal"><input type="checkbox" checked={d.sharedWithAuditor} onChange={async e => { await apiFetch(`/compliance-references/${ownerType}/${ownerId}/${d.id}`, { method: "PATCH", body: JSON.stringify({ sharedWithAuditor: e.target.checked }) }); refresh(); }} /><Share2 className="w-3 h-3" />Auditor</label>}
            {d.fileId && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="View" onClick={() => view({ url: fileUrl(d.fileId), downloadUrl: fileUrl(d.fileId, true), name: d.fileName, title: d.title, contentType: d.contentType })}><Eye className="w-3.5 h-3.5" /></Button>}
            {d.fileId && <a href={fileUrl(d.fileId, true)}><Button type="button" size="icon" variant="ghost" className="h-7 w-7"><Download className="w-3.5 h-3.5" /></Button></a>}
            {canEdit && mine(d) && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={async () => { if (await confirmDialog(`Remove "${d.title}" from the references? It stays in the Evidence Library.`, { title: "Remove reference", confirmText: "Remove" })) { await apiFetch(`/compliance-references/${ownerType}/${ownerId}/${d.id}`, { method: "DELETE" }); refresh(); } }}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>}
          </div>))}
      </div>
    </div>
  );
}
