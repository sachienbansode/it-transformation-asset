import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { CameraOff, Loader2, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";

/*
 * Camera QR scanner. Uses the browser's native BarcodeDetector when present (Chrome / Android),
 * otherwise decodes frames with jsQR (works on iPhone Safari). Camera access needs HTTPS.
 * Calls onScan for each new code; the same code is ignored for `cooldownMs` to avoid double scans.
 */
export function QrScanner({ onScan, paused = false, cooldownMs = 2500 }: { onScan: (text: string) => void; paused?: boolean; cooldownMs?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const pausedRef = useRef(paused);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  pausedRef.current = paused;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const Detector = (window as any).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;

    function emit(text: string) {
      const now = Date.now();
      if (text === last.current.text && now - last.current.at < cooldownMs) return;
      last.current = { text, at: now };
      if (navigator.vibrate) navigator.vibrate(60);
      onScan(text);
    }

    async function tick() {
      if (stopped) return;
      const v = videoRef.current, c = canvasRef.current;
      if (v && c && v.readyState >= 2 && !pausedRef.current) {
        try {
          if (detector) {
            const codes = await detector.detect(v);
            if (codes?.[0]?.rawValue) emit(codes[0].rawValue);
          } else {
            const w = v.videoWidth, h = v.videoHeight;
            if (w && h) {
              const scale = Math.min(1, 720 / Math.max(w, h));
              c.width = Math.round(w * scale); c.height = Math.round(h * scale);
              const ctx = c.getContext("2d", { willReadFrequently: true })!;
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const img = ctx.getImageData(0, 0, c.width, c.height);
              const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
              if (code?.data) emit(code.data);
            }
          }
        } catch { /* keep scanning */ }
      }
      raf = window.setTimeout(() => requestAnimationFrame(tick), 180) as unknown as number;
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setError(window.isSecureContext ? "This browser cannot open the camera." : "Camera needs HTTPS — open the app with https://"); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = videoRef.current!;
        v.srcObject = stream; v.setAttribute("playsinline", "true"); await v.play();
        setReady(true); setError(null); tick();
      } catch (e: any) {
        setError(e?.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access for this site and try again." : `Could not open the camera (${e?.message || e}).`);
      }
    })();

    return () => { stopped = true; clearTimeout(raf); stream?.getTracks().forEach(t => t.stop()); setReady(false); };
  }, [facing]);

  if (error) return (
    <div className="rounded-[12px] border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
      <CameraOff className="w-7 h-7 mx-auto mb-2 opacity-60" />{error}
      <div className="text-xs mt-2">You can still type the asset tag below.</div>
    </div>
  );
  return (
    <div className="relative rounded-[12px] overflow-hidden bg-black aspect-[4/3]">
      <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-white/80"><Loader2 className="w-6 h-6 animate-spin" /></div>}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="w-[58%] aspect-square rounded-[18px] border-[3px] border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      {paused && <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs text-center py-1.5">Paused</div>}
      <Button type="button" size="sm" variant="secondary" className="absolute top-2 right-2 h-8 gap-1.5 opacity-90" onClick={() => setFacing(f => f === "environment" ? "user" : "environment")}>
        <SwitchCamera className="w-4 h-4" />Flip
      </Button>
    </div>
  );
}
