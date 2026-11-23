import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { KeyRound, ShieldCheck, Smartphone, Mail, Loader2, Check, X } from "lucide-react";

/* r94 (ITH-146/147) — change own password; two-step sign-in with an authenticator app or a code by email. */
const H = { "X-No-Confirm": "1" };
export const PW_RULES: [string, (p: string, email?: string) => boolean][] = [
  ["12 or more characters", p => p.length >= 12],
  ["a lower-case letter", p => /[a-z]/.test(p)],
  ["an upper-case letter", p => /[A-Z]/.test(p)],
  ["a number", p => /[0-9]/.test(p)],
  ["a symbol (e.g. ! @ # $)", p => /[^A-Za-z0-9]/.test(p)],
  ["does not contain your email name", (p, e) => { const l = String(e || "").split("@")[0].toLowerCase(); return l.length < 4 || !p.toLowerCase().includes(l); }],
];

export function ChangePasswordForm({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const { user, refresh } = useAuth(); const { toast } = useToast();
  const [cur, setCur] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [busy, setBusy] = useState(false);
  const ok = PW_RULES.every(([, f]) => f(pw, user?.email)) && pw === pw2 && !!cur && pw !== cur;
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!ok) return; setBusy(true);
    try {
      await apiFetch("/auth/change-password", { method: "POST", headers: H, body: JSON.stringify({ currentPassword: cur, newPassword: pw }) });
      toast({ title: "Password changed", description: "Use the new password next time you sign in." });
      setCur(""); setPw(""); setPw2(""); await refresh(); onDone?.();
    } catch (x: any) { toast({ title: "Password not changed", description: x.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="space-y-3" data-testid="change-password">
      <div className={cn("grid gap-3", !compact && "md:grid-cols-3")}>
        <div className="space-y-1.5"><Label>Current password</Label><PasswordInput value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" data-testid="pw-current" /></div>
        <div className="space-y-1.5"><Label>New password</Label><PasswordInput value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" data-testid="pw-new" /></div>
        <div className="space-y-1.5"><Label>Repeat new password</Label><PasswordInput value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" data-testid="pw-new2" /></div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {PW_RULES.map(([t, f]) => { const good = !!pw && f(pw, user?.email); return <span key={t} className={cn("inline-flex items-center gap-1", good ? "text-emerald-600" : "text-muted-foreground")}>{good ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}{t}</span>; })}
        <span className={cn("inline-flex items-center gap-1", pw2 && pw === pw2 ? "text-emerald-600" : "text-muted-foreground")}>{pw2 && pw === pw2 ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}both new passwords match</span>
      </div>
      <Button type="submit" disabled={!ok || busy} className="gap-1.5" data-testid="pw-save">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}Change password</Button>
    </form>
  );
}

function MfaSection({ profile }: { profile: any }) {
  const { toast } = useToast(); const qc = useQueryClient(); const { refresh } = useAuth();
  const [mode, setMode] = useState<null | "totp" | "email" | "disable">(null);
  const [qr, setQr] = useState<{ qrCode: string; secret: string } | null>(null); const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [sentTo, setSentTo] = useState("");
  const done = async (title: string) => { toast({ title }); setMode(null); setQr(null); setCode(""); setSentTo(""); await qc.invalidateQueries({ queryKey: ["profile"] }); await refresh(); };
  const run = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); } catch (x: any) { toast({ title: "Not done", description: x.message, variant: "destructive" }); } finally { setBusy(false); } };
  const startTotp = () => run(async () => { setQr(await apiFetch<any>("/auth/mfa/setup")); setMode("totp"); });
  const startEmail = (purpose: "enable" | "disable") => run(async () => { const r = await apiFetch<any>("/auth/mfa/email/start", { method: "POST", headers: H, body: JSON.stringify({ purpose }) }); setSentTo(r.to); setMode(purpose === "enable" ? "email" : "disable"); });
  const confirm = () => run(async () => {
    if (mode === "totp") { await apiFetch("/auth/mfa/enable", { method: "POST", headers: H, body: JSON.stringify({ token: code }) }); await done("Two-step sign-in is on (authenticator app)"); }
    else if (mode === "email") { await apiFetch("/auth/mfa/email/enable", { method: "POST", headers: H, body: JSON.stringify({ token: code }) }); await done("Two-step sign-in is on (code by email)"); }
    else if (mode === "disable") { await apiFetch("/auth/mfa/disable", { method: "POST", headers: H, body: JSON.stringify({ token: code }) }); await done("Two-step sign-in is off"); }
  });
  const on = !!profile?.mfaEnabled; const method = profile?.mfaMethod === "email" ? "email" : "totp";
  return (
    <div className="space-y-3" data-testid="mfa-section">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border", on ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10" : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10")}>
          <ShieldCheck className="w-3.5 h-3.5" />{on ? `On — ${method === "email" ? "code by email" : "authenticator app"}` : "Off"}</span>
        {profile?.mfaRequired && <span className="text-xs text-muted-foreground">Required by your organisation{!on ? " — a code is emailed at each sign-in until you choose a method" : ""}</span>}
      </div>
      {!mode && <div className="flex flex-wrap gap-2">
        {!(on && method === "totp") && <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={startTotp} data-testid="mfa-totp"><Smartphone className="w-4 h-4" />{on ? "Switch to authenticator app" : "Use an authenticator app"}</Button>}
        {!(on && method === "email") && <Button variant="outline" size="sm" className="gap-1.5" disabled={busy || !profile?.emailReady} title={profile?.emailReady ? "" : "Email delivery is not set up yet"} onClick={() => startEmail("enable")} data-testid="mfa-email"><Mail className="w-4 h-4" />{on ? "Switch to code by email" : "Use a code by email"}</Button>}
        {on && !profile?.mfaRequired && <Button variant="ghost" size="sm" className="text-red-600" disabled={busy} onClick={() => method === "email" ? startEmail("disable") : setMode("disable")} data-testid="mfa-off">Turn off</Button>}
        {!profile?.emailReady && <span className="text-[11px] text-muted-foreground self-center">Code by email needs email delivery (Admin › Email, alerts &amp; archive).</span>}
      </div>}
      {mode && <div className="rounded-lg border p-3 space-y-3 max-w-md">
        {mode === "totp" && qr && <>
          <p className="text-sm">Scan with Microsoft Authenticator, Google Authenticator or similar, then enter the 6-digit code it shows.</p>
          <img src={qr.qrCode} alt="QR code" className="w-40 h-40 border rounded bg-white" />
          <p className="text-[11px] text-muted-foreground break-all">Cannot scan? Key: <span className="font-mono">{qr.secret}</span></p>
        </>}
        {(mode === "email" || (mode === "disable" && method === "email")) && <p className="text-sm">We emailed a 6-digit code to <b>{sentTo}</b>. It is valid for 10 minutes.</p>}
        {mode === "disable" && method === "totp" && <p className="text-sm">Enter the code from your authenticator app to turn two-step sign-in off.</p>}
        <div className="flex gap-2 items-end">
          <div className="space-y-1"><Label>6-digit code</Label><Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" className="w-36 text-center font-mono tracking-[0.3em]" data-testid="mfa-code" /></div>
          <Button disabled={code.length !== 6 || busy} onClick={confirm} data-testid="mfa-confirm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}</Button>
          <Button variant="ghost" onClick={() => { setMode(null); setQr(null); setCode(""); }}>Cancel</Button>
        </div>
      </div>}
    </div>
  );
}

/** Profile › Sign-in & security */
export function AccountSecurity() {
  const { data: profile } = useQuery<any>({ queryKey: ["profile"], queryFn: () => apiFetch("/auth/profile") });
  return (
    <Card data-testid="account-security">
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><KeyRound className="w-4 h-4" />Sign-in &amp; security</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <div className="text-sm font-semibold">Password</div>
          {profile && !profile.hasPassword ? <p className="text-sm text-muted-foreground">You sign in through the company portal — change your password there.</p> : <>
            <p className="text-xs text-muted-foreground">{profile?.passwordChangedAt ? `Last changed ${fmtDateTime(profile.passwordChangedAt)}` : "Not changed in IT Hub yet"}</p>
            <ChangePasswordForm /></>}
        </section>
        <section className="space-y-2 border-t pt-4">
          <div className="text-sm font-semibold">Two-step sign-in (MFA)</div>
          <MfaSection profile={profile} />
        </section>
      </CardContent>
    </Card>
  );
}

/** Shown over every page until a temporary password is changed. */
export function ForcePasswordChange() {
  const { user, logout } = useAuth();
  if (!user?.mustChangePassword) return null;
  return (
    <Dialog open>
      <DialogContent className="max-w-lg [&>button]:hidden" onEscapeKeyDown={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()} data-testid="force-password">
        <DialogHeader><DialogTitle>Set your own password</DialogTitle>
          <DialogDescription>You signed in with a temporary password. Choose a new password to continue.</DialogDescription></DialogHeader>
        <ChangePasswordForm compact />
        <button type="button" className="text-xs text-muted-foreground underline justify-self-start" onClick={() => logout()}>Sign out</button>
      </DialogContent>
    </Dialog>
  );
}
