import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { Loader2, MonitorUp, MonitorX, MousePointerClick, Circle, Hand, Maximize2, Minimize2, X, ExternalLink } from "lucide-react";

/*
 * Screen share / remote help inside an IT support chat.
 *  IT asks → the employee agrees → the employee's browser shares the screen to the IT person (WebRTC, peer to peer; IT Hub
 *  only relays the connection setup). The IT browser records the whole session and uploads it, encrypted, to the chat.
 *  Remote control: IT asks → the employee allows → control happens through Windows Quick Assist (Win + Ctrl + Q) while the
 *  shared screen keeps being recorded. Every step is a message in the chat and an audit-log entry.
 */
const H = { "X-No-Confirm": "1" };
export function ScreenShare({ chatId, role, onClose, popup = false, title }: { chatId: number; role: string; onClose: () => void; popup?: boolean; title?: string }) {
  const { toast } = useToast();
  const [s, setS] = useState<any>(null); const [ice, setIce] = useState<any[]>([]); const [maxMB, setMaxMB] = useState(300);
  const [phase, setPhase] = useState<"idle" | "connecting" | "live">("idle"); const [busy, setBusy] = useState(false); const [recMB, setRecMB] = useState(0);
  const video = useRef<HTMLVideoElement>(null); const pc = useRef<RTCPeerConnection | null>(null); const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const after = useRef(0); const poll = useRef<any>(null);
  const it = role === "it", emp = role === "employee";
  const base = `/chats/${chatId}/sessions`;
  const [recCfg, setRecCfg] = useState<{ enabled: boolean; where: string | null; message: string | null }>({ enabled: false, where: null, message: null });
  async function load() { const r = await apiFetch<any>(`${base}/current`); setS(r.session); setIce(r.iceServers || []); setMaxMB(r.maxRecordingMB || 300); if (r.recording) setRecCfg(r.recording); return r.session; }
  // ITH-088: record only when the administrator configured storage (S3 / Azure Blob) and this session was started as recorded
  const recording = recCfg.enabled && s?.recorded !== false;
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
        else setS((o: any) => o ? { ...o, control: r.control, controlCode: r.controlCode, codeSentAt: r.codeSentAt, controlStartedAt: r.controlStartedAt, controlGrantedAt: r.controlGrantedAt } : o);
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
      if (!recording) return;   // not recorded: storage not configured by the administrator
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
  // ITH-082 — IT's viewer in its own window: auto-connects, full screen, remote control and end / close in one toolbar
  const box = useRef<HTMLDivElement>(null); const [fs, setFs] = useState(false); const auto = useRef(false);
  useEffect(() => { const f = () => setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  useEffect(() => { if (popup && it && s?.status === "live" && phase === "idle" && !auto.current) { auto.current = true; watch(); } if (s?.status !== "live") auto.current = false; }, [popup, s?.status, phase]);
  useEffect(() => {
    if (!popup) return;
    const warn = (e: BeforeUnloadEvent) => { if (phase !== "idle") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [popup, phase]);
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else box.current?.requestFullscreen().catch(() => {}); };
  if (popup) return (
    <div ref={box} className="h-screen flex flex-col bg-neutral-950 text-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 flex-wrap text-sm">
        <MonitorUp className="w-4 h-4 text-sky-400" /><b className="truncate max-w-[40vw]">{title || "Screen session"}</b>
        {phase !== "idle" && it && recording && <span className="inline-flex items-center gap-1 text-xs text-red-400"><Circle className="w-2.5 h-2.5 fill-red-500 text-red-500 animate-pulse" />Recording {recMB.toFixed(1)} MB</span>}
        {!recording && <span className="text-xs text-amber-300 border border-amber-500/40 rounded px-2 py-0.5" title={recCfg.message || ""}>Not recorded — recording storage is not configured by the administrator</span>}
        {phase === "connecting" && <span className="text-xs text-neutral-400 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Connecting…</span>}
        {s?.status === "live" && phase !== "idle" && <ControlPill ctl={ctl} startedAt={s.controlStartedAt} dark />}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white hover:bg-neutral-800 hover:text-white" onClick={toggleFs} title="Full screen (Esc to leave)">{fs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}{fs ? "Exit full screen" : "Full screen"}</Button>
          {s?.status === "live" && <Button size="sm" variant="destructive" className="h-8 gap-1" onClick={async () => { await end(); }}><MonitorX className="w-4 h-4" />End session</Button>}
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white hover:bg-neutral-800 hover:text-white" title="Close window" onClick={async () => { if (phase !== "idle") await end(); onClose(); }}><X className="w-4 h-4" />Close</Button>
        </div>
      </div>
      {s?.status === "live" && phase !== "idle" && it && <div className="px-3 py-2 bg-neutral-900/80 border-b border-neutral-800"><ControlPanel s={s} it={it} emp={emp} busy={busy} call={call} recording={recording} dark /></div>}
      <div className="flex-1 min-h-0 flex items-center justify-center relative">
        <video ref={video} autoPlay playsInline className={phase === "idle" ? "hidden" : "w-full h-full object-contain bg-black"} />
        {phase === "idle" && <div className="text-center space-y-3 max-w-md px-6">
          {!s && it && <><div className="text-neutral-300">Ask the employee to share their screen with you. They must agree; {recording ? `the session is recorded and kept (${recCfg.where}).` : "this session will NOT be recorded — recording storage is not configured by the administrator."}</div>
            <Button disabled={busy} onClick={() => call("", {})}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Ask to see the screen</Button></>}
          {s?.status === "requested" && <div className="text-neutral-300 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Waiting for the employee to agree and share…</div>}
          {s?.status === "live" && <div className="text-neutral-300 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />The employee is choosing a screen to share…</div>}
        </div>}
      </div>
    </div>
  );
  return (
    <div className="my-2 rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2"><MonitorUp className="w-4 h-4 text-primary" /><b>Screen share & remote help</b>
        {!recording && <span className="ml-2 text-[11px] text-amber-700 border border-amber-300 rounded px-1.5">Not recorded — storage not configured by the administrator</span>}
        {phase !== "idle" && it && recording && <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-600"><Circle className="w-2.5 h-2.5 fill-red-600" />Recording {recMB.toFixed(1)} MB</span>}
        <button className="ml-auto text-xs text-muted-foreground" onClick={() => { if (phase !== "idle") end(); onClose(); }}>Close</button></div>
      {!s && it && <div className="space-y-1"><div className="text-xs text-muted-foreground">Ask the employee to share their screen with you. They must agree; {recording ? "the session is recorded and kept for IT." : "it will NOT be recorded (storage not configured by the administrator)."}</div><Button size="sm" disabled={busy} onClick={() => call("", {})}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Ask to see the screen</Button></div>}
      {!s && emp && <div className="text-xs text-muted-foreground">IT can ask to see your screen here. Nothing is shared unless you agree.</div>}
      {s?.status === "requested" && it && <div className="text-xs">Waiting for the employee to agree…</div>}
      {s?.status === "requested" && emp && <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 space-y-2"><div><b>{s.requestedBy}</b> (IT) asks to see your screen. Only that person sees it{recording ? <>, and the session is <b>recorded</b> for IT.</> : <>. This session is <b>not recorded</b>.</>} Close other confidential windows first.</div>
        <div className="flex gap-2"><Button size="sm" onClick={share}>Share my screen</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => call(`/${s.id}/decline`)}>Decline</Button></div></div>}
      {s?.status === "live" && emp && phase === "idle" && <div className="flex gap-2 items-center text-xs">You agreed to share. <Button size="sm" onClick={share}>Choose screen</Button><Button size="sm" variant="outline" onClick={end}>End</Button></div>}
      {s?.status === "live" && it && phase === "idle" && <Button size="sm" onClick={watch}>View the shared screen</Button>}
      <video ref={video} autoPlay playsInline className={phase === "idle" ? "hidden" : "w-full max-h-[50vh] rounded border bg-black"} />
      {phase === "connecting" && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Connecting…</div>}
      {s?.status === "live" && phase !== "idle" && <>
        <ControlPanel s={s} it={it} emp={emp} busy={busy} call={call} recording={recording} />
        <div className="flex gap-2 items-center"><ControlPill ctl={ctl} startedAt={s.controlStartedAt} /><Button size="sm" variant="destructive" className="gap-1 ml-auto" onClick={end}><MonitorX className="w-3.5 h-3.5" />End session</Button></div>
      </>}
    </div>
  );
}


/* ── ITH-084 — guided remote control through Windows Quick Assist ──────────────────────────────────────────────
   1 IT asks → 2 employee allows → 3 IT opens Quick Assist › Help someone and sends the 6-character code here →
   4 employee sees the code, enters it in Quick Assist › Help from someone, allows full control and confirms →
   5 live "under control" banner and timer on both sides; either side ends it. Every step is in the chat and audit log. */
function useElapsed(from?: string | null) {
  const [, tick] = useState(0);
  useEffect(() => { if (!from) return; const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, [from]);
  if (!from) return null;
  const sec = Math.max(0, Math.floor((Date.now() - +new Date(from)) / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
function ControlPill({ ctl, startedAt, dark }: { ctl?: string; startedAt?: string | null; dark?: boolean }) {
  const t = useElapsed(ctl === "active" ? startedAt : null);
  if (ctl === "active") return <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 rounded-full px-2.5 py-0.5"><Hand className="w-3 h-3" />Remote control on · {t}</span>;
  if (ctl === "granted") return <span className={cn("text-xs rounded-full px-2.5 py-0.5", dark ? "bg-amber-500/20 text-amber-200" : "bg-amber-50 text-amber-800")}>Control allowed — connecting with Quick Assist</span>;
  if (ctl === "requested") return <span className={cn("text-xs rounded-full px-2.5 py-0.5", dark ? "bg-neutral-800 text-neutral-300" : "bg-muted text-muted-foreground")}>Control requested</span>;
  return null;
}
function Step({ n, done, active, children, dark }: { n: number; done?: boolean; active?: boolean; children: React.ReactNode; dark?: boolean }) {
  return <div className={cn("flex gap-2 items-start", !active && !done && "opacity-60")}>
    <span className={cn("w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0", done ? "bg-emerald-600 text-white" : active ? "bg-primary text-primary-foreground" : dark ? "bg-neutral-700 text-neutral-300" : "bg-muted text-muted-foreground")}>{done ? "✓" : n}</span>
    <div className="flex-1 text-xs leading-5">{children}</div></div>;
}
function ControlPanel({ s, it, emp, busy, call, recording, dark }: { s: any; it: boolean; emp: boolean; busy: boolean; call: (p: string, b?: any) => Promise<any>; recording: boolean; dark?: boolean }) {
  const ctl = s.control; const [code, setCode] = useState(""); const t = useElapsed(ctl === "active" ? s.controlStartedAt : null);
  const ctlCall = (step: string, extra: any = {}) => call(`/${s.id}/control`, { step, ...extra }).catch(() => {});
  const box = cn("rounded-lg border p-3 space-y-2", dark ? "border-neutral-700 bg-neutral-900 text-neutral-100" : "bg-background");
  const recNote = recording ? "Everything on screen stays recorded." : "This session is not recorded.";
  if (!ctl || ctl === "none" || ctl === "denied" || ctl === "ended") return it ? (
    <div className={cn("flex items-center gap-2 flex-wrap text-xs", dark && "text-neutral-300")}>
      {ctl === "denied" && <span className="text-amber-500">The employee did not allow control.</span>}
      {ctl === "ended" && <span>Remote control ended.</span>}
      <Button size="sm" variant={dark ? "secondary" : "outline"} className="h-8 gap-1" disabled={busy} onClick={() => ctlCall("request")}><MousePointerClick className="w-3.5 h-3.5" />Take control</Button>
      <span className={dark ? "text-neutral-400" : "text-muted-foreground"}>Asks the employee first. Control runs through Windows Quick Assist; {recording ? "the screen stays recorded." : "this session is not recorded."}</span>
    </div>) : null;
  if (ctl === "requested") return it
    ? <div className={cn("text-xs flex items-center gap-2", dark && "text-amber-200")}><Loader2 className="w-3.5 h-3.5 animate-spin" />Waiting for the employee to allow control… <Button size="sm" variant="ghost" className="h-7" onClick={() => ctlCall("end")}>Cancel</Button></div>
    : <div className="rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
        <div className="text-sm"><Hand className="w-4 h-4 inline mr-1 text-amber-600" /><b>{s.requestedBy}</b> (IT) asks to <b>control your computer</b>.</div>
        <ul className="text-xs list-disc pl-5 space-y-0.5 text-muted-foreground"><li>They will use Windows Quick Assist; you give them a code and approve it on your screen.</li><li>{recNote}</li><li>You can stop at any time — End remote control here, or close Quick Assist.</li></ul>
        <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => ctlCall("grant")}>Allow</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => ctlCall("deny")}>Don't allow</Button></div>
      </div>;
  if (ctl === "granted") return it ? (
    <div className={box}>
      <div className="text-sm font-semibold">Connect with Quick Assist</div>
      <Step n={1} done active dark={dark}>The employee allowed control.</Step>
      <Step n={2} active={!s.codeSentAt} done={!!s.codeSentAt} dark={dark}>On your computer press <b>Win + Ctrl + Q</b> (Quick Assist) › <b>Help someone</b> › sign in. Copy the 6-character code.
        <div className="flex gap-2 mt-1"><input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="Code e.g. AB12CD" className={cn("h-8 w-36 rounded-md border px-2 font-mono tracking-widest text-sm", dark ? "bg-neutral-800 border-neutral-600" : "bg-background")} />
          <Button size="sm" className="h-8" disabled={busy || code.length < 6} onClick={async () => { await ctlCall("code", { code }); setCode(""); }}>{s.codeSentAt ? "Send new code" : "Send code to employee"}</Button></div>
        {s.codeSentAt && <div className={cn("mt-1", dark ? "text-emerald-300" : "text-emerald-700")}>Code sent {new Date(s.codeSentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} — valid 10 minutes in Quick Assist.</div>}</Step>
      <Step n={3} active={!!s.codeSentAt} dark={dark}>The employee enters the code and allows <b>full control</b>; in Quick Assist choose <b>Take full control</b>. This turns on when they confirm.</Step>
      <div className="flex justify-end"><Button size="sm" variant="ghost" className="h-7" onClick={() => ctlCall("end")}>Cancel remote control</Button></div>
    </div>) : (
    <div className="rounded-lg border-2 border-sky-400 bg-sky-50 dark:bg-sky-900/20 p-3 space-y-2">
      <div className="text-sm font-semibold">Let {s.requestedBy} connect</div>
      <Step n={1} active done={false}>Press <b>Win + Ctrl + Q</b> (or Start › <b>Quick Assist</b>).</Step>
      <Step n={2} active={!!s.controlCode} done={false}>Under <b>Help from someone</b>, type this code:
        {s.controlCode ? <div className="mt-1 flex items-center gap-2"><span className="font-mono text-2xl font-bold tracking-[0.3em] bg-background border rounded px-3 py-1">{s.controlCode}</span>
          <Button size="sm" variant="outline" className="h-8" onClick={() => navigator.clipboard?.writeText(s.controlCode).catch(() => {})}>Copy</Button></div>
          : <div className="mt-1 text-muted-foreground inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Waiting for IT to send the code…</div>}</Step>
      <Step n={3} active={!!s.controlCode}>When Quick Assist asks, choose <b>Allow</b>. {recNote}</Step>
      <div className="flex gap-2 flex-wrap"><Button size="sm" disabled={busy || !s.controlCode} onClick={() => ctlCall("connected")}>IT is connected</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => ctlCall("end")}>Stop — don't give control</Button></div>
    </div>);
  // active
  return <div className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-900/30 p-3 flex items-center gap-3 flex-wrap">
    <span className="relative flex w-3 h-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" /></span>
    <div className="text-sm flex-1 min-w-[220px] text-red-900 dark:text-red-100">{emp ? <><b>{s.requestedBy}</b> is controlling your computer</> : <>You are controlling the employee's computer</>} · <b className="font-mono">{t}</b><div className="text-xs opacity-80">{recNote} {emp ? "Stop any time: End remote control here, or close Quick Assist." : "Close Quick Assist when you are done."}</div></div>
    <Button size="sm" variant="destructive" disabled={busy} onClick={() => ctlCall("end")}>End remote control</Button>
  </div>;
}
