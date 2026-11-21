import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Loader2, ShieldAlert, ZoomIn, ZoomOut, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ITH-124 — read-only policy PDF viewer.
 *  - The PDF is drawn page by page onto <canvas> (pdf.js): no text layer (nothing to select or copy), no download / print
 *    buttons, right-click / drag / Ctrl+S / Ctrl+P / Ctrl+C blocked, hidden when printing.
 *  - Every page carries a tiled watermark with the viewer's name, email and the date / time.
 *  - The page is blurred when the window loses focus or Print Screen is pressed (screen-capture tools, switching apps).
 *  Browsers cannot fully stop a photo or a capture tool — the personal watermark makes any copy traceable to the viewer. */
let pdfjsP: Promise<any> | null = null;
function pdfjs() {
  return (pdfjsP ||= (async () => {
    const lib: any = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    lib.GlobalWorkerOptions.workerSrc = worker;
    return lib;
  })());
}

export function PolicyPdfViewer({ src, height = "65vh" }: { src: string; height?: string }) {
  const { user } = useAuth();
  const box = useRef<HTMLDivElement>(null); const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState(0); const [scale, setScale] = useState(1.2); const [hidden, setHidden] = useState(false); const docRef = useRef<any>(null);

  // load
  useEffect(() => {
    let cancelled = false; setLoading(true); setErr(null);
    (async () => {
      try {
        const r = await fetch(src, { credentials: "include", cache: "no-store" });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Could not open the document (${r.status})`);
        const data = new Uint8Array(await r.arrayBuffer());
        const lib = await pdfjs();
        const doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
        if (cancelled) return; docRef.current = doc; setPages(doc.numPages);
      } catch (e: any) { if (!cancelled) setErr(e.message || String(e)); } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; docRef.current?.destroy?.(); docRef.current = null; };
  }, [src]);

  // draw pages + watermark
  useEffect(() => {
    const doc = docRef.current; const el = box.current; if (!doc || !el || !pages) return;
    let cancelled = false; el.innerHTML = "";
    const mark = `${user?.name || ""} · ${user?.email || ""} · ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })} · CONFIDENTIAL`;
    (async () => {
      for (let n = 1; n <= pages && !cancelled; n++) {
        const page = await doc.getPage(n); const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale: scale * dpr });
        const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
        c.style.width = `${vp.width / dpr}px`; c.style.maxWidth = "100%"; c.style.height = "auto"; c.className = "block mx-auto mb-3 shadow-sm bg-white";
        c.setAttribute("draggable", "false"); c.dataset.page = String(n);
        el.appendChild(c);
        const ctx = c.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        // watermark burnt into the canvas pixels
        ctx.save(); ctx.globalAlpha = 0.13; ctx.fillStyle = "#1f2937"; ctx.font = `${Math.round(15 * scale * dpr)}px sans-serif`;
        ctx.translate(vp.width / 2, vp.height / 2); ctx.rotate(-Math.PI / 6);
        const w = ctx.measureText(mark).width + 80 * dpr;
        for (let y = -vp.height; y < vp.height; y += 110 * scale * dpr) for (let x = -vp.width * 1.2; x < vp.width * 1.2; x += w) ctx.fillText(mark, x, y);
        ctx.restore();
        ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = "#6b7280"; ctx.font = `${Math.round(10 * dpr)}px sans-serif`;
        ctx.fillText(`Page ${n} of ${pages} · ${mark}`, 12 * dpr, vp.height - 10 * dpr); ctx.restore();
      }
    })().catch(e => !cancelled && setErr(String(e?.message || e)));
    return () => { cancelled = true; };
  }, [pages, scale, user?.email]);

  // screenshot / copy deterrents
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "printscreen") { setHidden(true); try { navigator.clipboard?.writeText?.("Screenshots of policy documents are not allowed.")?.catch?.(() => {}); } catch { /* ignore */ } setTimeout(() => setHidden(false), 2500); }
      if ((e.ctrlKey || e.metaKey) && ["s", "p", "c", "a"].includes(k)) { e.preventDefault(); e.stopPropagation(); }
      if (e.metaKey && e.shiftKey && ["3", "4", "5", "s"].includes(k)) setHidden(true);   // macOS capture shortcuts
    };
    const blur = () => setHidden(true); const focus = () => setHidden(false);
    const vis = () => setHidden(document.visibilityState !== "visible");
    window.addEventListener("keydown", key, true); window.addEventListener("keyup", key, true); window.addEventListener("blur", blur); window.addEventListener("focus", focus); document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("keyup", key, true); window.removeEventListener("blur", blur); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", vis); };
  }, []);

  return (
    <div className="policy-pdf rounded-lg border bg-muted/40 relative select-none" style={{ userSelect: "none", WebkitUserSelect: "none" }}
      onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()} onCopy={e => e.preventDefault()} data-testid="policy-pdf">
      <style>{"@media print { .policy-pdf { display: none !important; } }"}</style>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-background/80 text-xs">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-600" /><span className="text-muted-foreground">Read-only · watermarked with your name · download, print and screenshots are not allowed{pages ? ` · ${pages} page${pages > 1 ? "s" : ""}` : ""}</span>
        <div className="ml-auto flex gap-1"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setScale(s => Math.max(0.6, +(s - 0.2).toFixed(1)))} aria-label="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setScale(s => Math.min(2.4, +(s + 0.2).toFixed(1)))} aria-label="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></Button></div>
      </div>
      <div className="overflow-auto p-3" style={{ height }}>
        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="w-4 h-4 animate-spin" />Opening document…</div>}
        {err && <div className="text-sm text-red-600 p-4">{err}</div>}
        <div ref={box} className={hidden ? "blur-xl" : ""} style={{ transition: "filter .1s" }} />
      </div>
      {hidden && <div className="absolute inset-0 top-8 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground"><EyeOff className="w-6 h-6" />Document hidden while IT Hub is not in focus. Click here to continue reading.</div>}
    </div>
  );
}
