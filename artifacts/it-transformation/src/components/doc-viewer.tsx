import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { Download, FileText, ShieldAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * In-app, read-only document viewer for audit evidence.
 *  - PDFs open without the browser toolbar (no download / print buttons), images and text inline.
 *  - A watermark with the viewer's name, email and time covers the page, so any screenshot or photo is traceable.
 *  - Right-click,
 *    Ctrl+P / Ctrl+S and printing are blocked inside the app.
 *  No web page can fully stop screenshots or a phone camera; these are deterrents plus the access log.
 */

type Doc = { url: string; downloadUrl?: string | null; name: string; title?: string; contentType?: string | null };
const Ctx = createContext<(d: Doc) => void>(() => {});
export const useDocViewer = () => useContext(Ctx);

const kindOf = (d: Doc) => {
  const t = (d.contentType || "").toLowerCase(), n = d.name.toLowerCase();
  if (t.includes("pdf") || n.endsWith(".pdf")) return "pdf";
  if (t.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/.test(n)) return "image";
  if (/\.(docx?|xlsx?|xlsm|pptx?|odt|ods|odp|rtf)$/.test(n)) return "office";
  if (t.startsWith("text/") || /\.(txt|csv|log|md|json)$/.test(n)) return "text";
  return "other";
};

export function DocViewerProvider({ children }: { children: React.ReactNode }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const open = useCallback((d: Doc) => setDoc(d), []);
  return <Ctx.Provider value={open}>{children}{doc && <Viewer doc={doc} onClose={() => setDoc(null)} />}</Ctx.Provider>;
}

function Viewer({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const { user } = useAuth();
  const [focused, setFocused] = useState(true); const k = kindOf(doc);
  const [text, setText] = useState<string | null>(null); const [loading, setLoading] = useState(k !== "other");
  const stamp = `${user?.name || ""} · ${user?.email || ""} · ${new Date().toLocaleString("en-IN")} · CONFIDENTIAL`;
  useEffect(() => {
    // focus moving into the PDF frame also fires window "blur": only hide when the page itself lost focus
    const blur = () => setTimeout(() => { if (document.activeElement?.tagName !== "IFRAME") setFocused(false); }, 0);
    const focus = () => setFocused(true), vis = () => { if (document.visibilityState !== "visible") setFocused(false); };
    const keys = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && ["p", "s"].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopPropagation(); } if (e.key === "PrintScreen") { setFocused(false); try { navigator.clipboard?.writeText(""); } catch { /* ignore */ } } };
    window.addEventListener("blur", blur); window.addEventListener("focus", focus); document.addEventListener("visibilitychange", vis); window.addEventListener("keydown", keys, true); window.addEventListener("keyup", keys, true);
    document.body.classList.add("doc-viewer-open");
    return () => { window.removeEventListener("blur", blur); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", vis); window.removeEventListener("keydown", keys, true); window.removeEventListener("keyup", keys, true); document.body.classList.remove("doc-viewer-open"); };
  }, []);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (k === "text") fetch(doc.url, { credentials: "include" }).then(r => r.text()).then(t => { setText(t.slice(0, 500_000)); setLoading(false); }).catch(() => { setText("Could not load the file."); setLoading(false); }); }, [doc.url]);
  useEffect(() => {
    if (k !== "office") return; let u: string | null = null;
    fetch(doc.url + (doc.url.includes("?") ? "&" : "?") + "preview=1", { credentials: "include" })
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || "Preview not available"); return r.blob(); })
      .then(b => { u = URL.createObjectURL(new Blob([b], { type: "application/pdf" })); setPdfUrl(u); })
      .catch(e => { setErr(e.message); setLoading(false); });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [doc.url]);
  // Focus moves into the PDF iframe when the user scrolls it: keep the content visible while the pointer is over the viewer
  const [hover, setHover] = useState(false);
  const hidden = false; // blur-on-focus-loss removed: capture tools grab the screen before the browser can react; the watermark + access log are the control
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[96vw] w-[1100px] h-[92vh] flex flex-col select-none" onContextMenu={e => e.preventDefault()}>
        <style>{`@media print { body.doc-viewer-open * { display: none !important; } }`}</style>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6"><FileText className="w-4 h-4 text-primary shrink-0" /><span className="truncate">{doc.title || doc.name}</span></DialogTitle>
          <DialogDescription className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" />Read-only view · watermarked with your name · this view is logged</DialogDescription>
        </DialogHeader>
        <div className="relative flex-1 min-h-0 rounded-[10px] border overflow-hidden bg-muted/30" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <div className={cn("absolute inset-0 transition", hidden && "blur-xl")}>
            {k === "office" && pdfUrl && <iframe title={doc.name} src={`${pdfUrl}#toolbar=0&navpanes=0&statusbar=0&view=FitH`} className="w-full h-full bg-white" onLoad={() => setLoading(false)} />}
            {k === "office" && err && <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground p-6 text-center"><FileText className="w-10 h-10" /><div>{err}</div>
              {doc.downloadUrl ? <a href={doc.downloadUrl}><Button variant="outline" className="gap-1.5"><Download className="w-4 h-4" />Download to open</Button></a> : <div>Ask the audit team for a PDF copy.</div>}</div>}
            {k === "pdf" && <iframe title={doc.name} src={`${doc.url}#toolbar=0&navpanes=0&statusbar=0&view=FitH`} className="w-full h-full bg-white" onLoad={() => setLoading(false)} />}
            {k === "image" && <div className="w-full h-full overflow-auto flex items-start justify-center p-3"><img src={doc.url} alt={doc.name} draggable={false} onLoad={() => setLoading(false)} className="max-w-full pointer-events-none" /></div>}
            {k === "text" && <pre className="w-full h-full overflow-auto p-4 text-xs whitespace-pre-wrap bg-background">{text}</pre>}
            {k === "other" && (<div className="w-full h-full flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground p-6 text-center">
              <FileText className="w-10 h-10" /><div>This file type ({doc.name.split(".").pop()?.toUpperCase()}) cannot be shown in the browser.</div>
              {doc.downloadUrl ? <a href={doc.downloadUrl}><Button variant="outline" className="gap-1.5"><Download className="w-4 h-4" />Download to open</Button></a> : <div>Ask the audit team for a PDF copy.</div>}</div>)}
          </div>
          {/* watermark (does not block scrolling) */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
            <div className="absolute -inset-[50%] flex flex-wrap content-start gap-x-24 gap-y-20 rotate-[-28deg] opacity-[0.13] text-foreground text-sm font-semibold">
              {Array.from({ length: 120 }, (_, i) => <span key={i} className="whitespace-nowrap">{stamp}</span>)}
            </div>
          </div>
          {loading && k !== "other" && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}
          {hidden && <button type="button" onClick={() => setFocused(true)} className="absolute inset-0 flex items-center justify-center text-sm font-medium text-foreground">Click here to continue viewing</button>}
        </div>
        <div className="flex items-center justify-between pt-2 text-[11px] text-muted-foreground">
          <span>Screens can't be fully protected from capture; every view carries your name and is recorded in the access log.</span>
          <div className="flex gap-2">{doc.downloadUrl && k !== "other" && <a href={doc.downloadUrl}><Button size="sm" variant="ghost" className="h-7 gap-1"><Download className="w-3.5 h-3.5" />Download</Button></a>}<Button size="sm" variant="outline" className="h-7" onClick={onClose}>Close</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
