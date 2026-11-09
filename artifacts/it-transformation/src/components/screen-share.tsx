import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { Loader2, MonitorUp, MonitorX, MousePointerClick, Circle, Hand } from "lucide-react";

/*
 * Screen share / remote help inside an IT support chat.
 *  IT asks → the employee agrees → the employee's browser shares the screen to the IT person (WebRTC, peer to peer; IT Hub
 *  only relays the connection setup). The IT browser records the whole session and uploads it, encrypted, to the chat.
 *  Remote control: IT asks → the employee allows → control happens through Windows Quick Assist (Win + Ctrl + Q) while the
 *  shared screen keeps being recorded. Every step is a message in the chat and an audit-log entry.
 */
const H = { "X-No-Confirm": "1" };
export function ScreenShare({ chatId, role, onClose }: { chatId: number; role: string; onClose: () => void }) {
  const { toast } = useToast();
  const [s, setS] = useState<any>(null); const [ice, setIce] = useState<any[]>([]); const [maxMB, setMaxMB] = useState(300);
  const [phase, setPhase] = useState<"idle" | "connecting" | "live">("idle"); const [busy, setBusy] = useState(false); const [recMB, setRecMB] = useState(0);
  const video = useRef<HTMLVideoElement>(null); const pc = useRef<RTCPeerConnection | null>(null); const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const after = useRef(0); const poll = useRef<any>(null);
  const it = role === "it", emp = role === "employee";
  const base = `/chats/${chatId}/sessions`;
  async function load() { const r = await apiFetch<any>(`${base}/current`); setS(r.session); setIce(r.iceServers || []); setMaxMB(r.maxRecordingMB || 300); return r.session; }
  useEffect(() => { load(); const t = setInterval(() => { if (phase === "idle") load().catch(() => {}); }, 3000); return () => { clearInterval(t); stop(false); }; }, []);
  async function call(path: string, body: any = {}) { setBusy(true); try { const r = await apiFetch<any>(`${base}${path}`, { method: "POST", body: JSON.stringify(body), headers: H }); await load(); return r; } catch (e: any) { toast({ title: "Could not do that", description: e.message, variant: "destructive" }); throw e; } finally { setBusy(false); } }
  const signal = (sid: number, type: string, payload: any) => apiFetch(`${base}/${sid}/signal`, { method: "POST", body: JSON.stringify({ type, payload }), headers: H }).catch(() => {});

  function newPc(sid: number) {
    const p = new RTCPeerConnection({ iceServers: ice });
    p.onicecandidate = e => { if (e.candidate) signal(sid, "ice", e.candidate.toJSON()); };
    p.onconnectionstatechange = () => { if (p.connectionState === "connected") setPhase("live"); if (["failed", "disconnected"].includes(p.connectionState)) toast({ title: "Screen connection lost", description: "If you are outside the office network, ask IT to configure a TURN server (chat.iceServers).", variant: "destructive" }); };
    pendingIce.current = []; pc.current = p; return p;
  }
  // ICE candidates can arrive before the offer/answer they belong to: keep them until the remote description is set
  const pendingIce = useRef<any[]>([]);
  async function flushIce(p: RTCPeerConnection) { const q = pendingIce.current; pendingIce.current = []; for (const c of q) await p.addIceCandidate(c).catch(() => {}); }
  function startPolling(sid: number) {
    clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const r = await apiFetch<any>(`${base}/${sid}/signals?after=${after.current}`);
        for (const x of r.signals) {
          after.current = Math.max(after.current, x.id); const p = pc.current; if (!p) continue;
          if (x.type === "offer" && it) { await p.setRemoteDescription(x.payload); await flushIce(p); const a = await p.createAnswer(); await p.setLocalDescription(a); await signal(sid, "answer", a); }
          else if (x.type === "answer" && emp) { await p.setRemoteDescription(x.payload); await flushIce(p); }
          else if (x.type === "ice") { if (p.remoteDescription) await p.addIceCandidate(x.payload).catch(() => {}); else pendingIce.current.push(x.payload); }
        }
        if (r.status !== "live") { stop(true); load(); }
        else setS((o: any) => o ? { ...o, control: r.control } : o);
      } catch { /* keep polling */ }
    }, 1000);
  }
  // employee: share the screen
  async function share() {
    let ms: MediaStream;
    try { ms = await (navigator.mediaDevices as any).getDisplayMedia({ video: { frameRate: 10 }, audio: false }); }
    catch { toast({ title: "Screen sharing was not started", description: "Choose a screen and press Share to let IT see it.", variant: "destructive" }); return; }
    const x = s.status === "requested" ? await call(`/${s.id}/accept`) : s;
    stream.current = ms; ms.getVideoTracks()[0].onended = () => end();
    if (video.current) { video.current.srcObject = ms; video.current.muted = true; }
    const p = newPc(x.id); ms.getTracks().forEach(t => p.addTrack(t, ms));
    const o = await p.createOffer(); await p.setLocalDescription(o); await signal(x.id, "offer", o);
    setPhase("connecting"); startPolling(x.id);
  }
  // IT: watch + record
  async function watch() {
    const p = newPc(s.id);
    p.ontrack = e => {
      const ms = e.streams[0]; stream.current = ms; if (video.current) video.current.srcObject = ms;
      try {
        const r = new MediaRecorder(ms, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm", videoBitsPerSecond: 600_000 });
        r.ondataavailable = ev => { if (ev.data.size) { chunks.current.push(ev.data); setRecMB(chunks.current.reduce((a, b) => a + b.size, 0) / 1048576); } };
        r.start(5000); rec.current = r;
      } catch { toast({ title: "This browser cannot record the session", variant: "destructive" }); }
    };
    setPhase("connecting"); startPolling(s.id);
  }
  async function upload(sid: number) {
    const r = rec.current; if (!r) return; rec.current = null;
    await new Promise<void>(ok => { r.onstop = () => ok(); try { r.stop(); } catch { ok(); } });
    const blob = new Blob(chunks.current, { type: "video/webm" }); chunks.current = [];
    if (!blob.size) return;
    if (blob.size > maxMB * 1048576) { toast({ title: `Recording is over ${maxMB} MB and was not uploaded`, variant: "destructive" }); return; }
    const res = await fetch(`/api${base}/${sid}/recording`, { method: "POST", credentials: "include", headers: { "Content-Type": "video/webm", "X-No-Confirm": "1" }, body: blob });
    toast(res.ok ? { title: "Session recording saved to the chat" } : { title: "Recording upload failed", description: (await res.json().catch(() => ({}))).error, variant: "destructive" });
  }
  function stop(uploadIt: boolean) {
    clearInterval(poll.current);
    const sid = s?.id; if (uploadIt && it && sid) upload(sid).catch(() => {});
    stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; pc.current?.close(); pc.current = null; setPhase("idle");
  }
  async function end() { const sid = s?.id; if (it && sid) await upload(sid).catch(() => {}); stop(false); if (sid) await call(`/${sid}/end`).catch(() => {}); }

  const ctl = s?.control;
  return (
    <div className="my-2 rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2"><MonitorUp className="w-4 h-4 text-primary" /><b>Screen share & remote help</b>
        {phase !== "idle" && it && <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-600"><Circle className="w-2.5 h-2.5 fill-red-600" />Recording {recMB.toFixed(1)} MB</span>}
        <button className="ml-auto text-xs text-muted-foreground" onClick={() => { if (phase !== "idle") end(); onClose(); }}>Close</button></div>
      {!s && it && <div className="space-y-1"><div className="text-xs text-muted-foreground">Ask the employee to share their screen with you. They must agree; the session is recorded and kept in this chat.</div><Button size="sm" disabled={busy} onClick={() => call("", {})}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Ask to see the screen</Button></div>}
      {!s && emp && <div className="text-xs text-muted-foreground">IT can ask to see your screen here. Nothing is shared unless you agree.</div>}
      {s?.status === "requested" && it && <div className="text-xs">Waiting for the employee to agree…</div>}
      {s?.status === "requested" && emp && <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 space-y-2"><div><b>{s.requestedBy}</b> (IT) asks to see your screen. Only that person sees it, and the session is <b>recorded</b> and kept with this chat. Close other confidential windows first.</div>
        <div className="flex gap-2"><Button size="sm" onClick={share}>Share my screen</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => call(`/${s.id}/decline`)}>Decline</Button></div></div>}
      {s?.status === "live" && emp && phase === "idle" && <div className="flex gap-2 items-center text-xs">You agreed to share. <Button size="sm" onClick={share}>Choose screen</Button><Button size="sm" variant="outline" onClick={end}>End</Button></div>}
      {s?.status === "live" && it && phase === "idle" && <Button size="sm" onClick={watch}>View the shared screen</Button>}
      <video ref={video} autoPlay playsInline className={phase === "idle" ? "hidden" : "w-full max-h-[50vh] rounded border bg-black"} />
      {phase === "connecting" && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Connecting…</div>}
      {s?.status === "live" && phase !== "idle" && <div className="flex gap-2 flex-wrap items-center">
        {it && (ctl === "none" || ctl === "denied" || ctl === "ended") && <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => call(`/${s.id}/control`, { step: "request" })}><MousePointerClick className="w-3.5 h-3.5" />Ask for remote control</Button>}
        {it && ctl === "requested" && <span className="text-xs">Waiting for the employee to allow control…</span>}
        {it && ctl === "granted" && <span className="text-xs text-emerald-700">Control allowed — open <b>Quick Assist</b> (Win + Ctrl + Q) › Help someone, and send the security code in this chat. The screen keeps being recorded.</span>}
        {emp && ctl === "requested" && <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 space-y-1 w-full"><div><Hand className="w-3.5 h-3.5 inline mr-1" />IT asks to <b>control your computer</b>. Everything on screen stays recorded. You can stop at any time.</div>
          <div className="flex gap-2"><Button size="sm" onClick={() => call(`/${s.id}/control`, { step: "grant" })}>Allow</Button><Button size="sm" variant="outline" onClick={() => call(`/${s.id}/control`, { step: "deny" })}>Don't allow</Button></div></div>}
        {emp && ctl === "granted" && <span className="text-xs">Open <b>Quick Assist</b> (Win + Ctrl + Q) › Get help, and type the code IT sends you here. Close Quick Assist to stop control.</span>}
        {ctl === "granted" && <Button size="sm" variant="outline" onClick={() => call(`/${s.id}/control`, { step: "end" })}>End remote control</Button>}
        <Button size="sm" variant="destructive" className="gap-1 ml-auto" onClick={end}><MonitorX className="w-3.5 h-3.5" />End session</Button>
      </div>}
    </div>
  );
}
