import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { Shield, Building2, User, Loader2, ChevronDown } from "lucide-react";

const DEV_CREDENTIALS = [
  { label: "Administrator", email: "admin@ashikagroup.com" },
  { label: "CXO – IT", email: "sachin.bansode@ashikagroup.com" },
  { label: "CXO – Compliance", email: "meera.iyer@ashikagroup.com" },
  { label: "HR", email: "anjali.sharma@ashikagroup.com" },
  { label: "KPI Employee", email: "deepak.agarwal@ashikagroup.com" },
];
const DEV_PASSWORD = "Ashika@2025";

type UserType = "internal" | "external";
type LoginStep = "credentials" | "mfa";

interface AppConfig {
  appName: string;
  appTagline: string;
  logoUrl: string;
}

export default function Login() {
  const { login, loginMfa, user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<LoginStep>("credentials");
  const [userType, setUserType] = useState<UserType>("internal");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoConfig, setSsoConfig] = useState<{ enabled: boolean; configured: boolean } | null>(null);
  const [showDevCreds, setShowDevCreds] = useState(false);
  const [central, setCentral] = useState<{ enabled: boolean; buttonLabel: string; localLogin: "admin" | "all" | "off" } | null>(null);
  const [showLocal, setShowLocal] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig>({
    appName: "Ashika Drishti Transform",
    appTagline: "IT Transformation Planning Suite — Ashika Group",
    logoUrl: "",
  });

  useEffect(() => {
    if (!user) return;
    let next: string | null = null;
    try { next = sessionStorage.getItem("ashika-after-login"); sessionStorage.removeItem("ashika-after-login"); } catch { /* ignore */ }
    navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : (user.defaultDashboard || "/"));
  }, [user]);

  useEffect(() => {
    apiFetch<{ enabled: boolean; configured: boolean }>("/auth/sso/config")
      .then(setSsoConfig)
      .catch(() => setSsoConfig({ enabled: false, configured: false }));
    apiFetch<AppConfig>("/config")
      .then(setAppConfig)
      .catch(() => {});
    apiFetch<any>("/auth/central/config").then(setCentral).catch(() => setCentral({ enabled: false, buttonLabel: "", localLogin: "all" }));
    const err = new URLSearchParams(window.location.search).get("sso_error");
    if (err) {
      const msg: Record<string, string> = {
        access_denied: "The Ashika Portal did not allow sign-in to IT Hub for your account. Please contact the IT administrator.",
        account_disabled: "Your account is disabled in this application. Please contact the IT administrator.",
        not_registered: "You signed in to the Ashika Portal, but you are not registered in IT Hub. Please ask the IT administrator to add you.",
        no_role: "You are registered in IT Hub but no role has been assigned to you yet. Please ask the IT administrator to assign one.",
        invalid_state: "The sign-in link expired or was opened in another browser. Please try again.",
        not_configured: "Ashika Portal sign-in is not configured on this server.",
        session_ended: "Your session has ended (account or role changed, or it expired). Please sign in again.",
        portal_error: "The Ashika Portal could not complete the sign-in. Please try again.",
      };
      toast({ title: "Sign-in failed", description: msg[err] || "Sign-in could not be completed. Please try again.", variant: "destructive" });
      window.history.replaceState(null, "", "/login");
    }
  }, []);

  const startCentral = () => {
    let next = "/";
    try { next = sessionStorage.getItem("ashika-after-login") || "/"; sessionStorage.removeItem("ashika-after-login"); } catch { /* ignore */ }
    window.location.href = `/api/auth/central/login?next=${encodeURIComponent(next)}`;
  };
  const centralOn = !!central?.enabled;
  const passwordAllowed = !centralOn || central!.localLogin === "all" || (central!.localLogin === "admin" && showLocal);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(email, password);
      if (res.requiresMfa) {
        setStep("mfa");
        toast({ title: "MFA required", description: "Enter the 6-digit code from your authenticator app." });
      }
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginMfa(mfaToken);
    } catch (err: any) {
      toast({ title: "Invalid code", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSsoLogin = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ authUrl: string }>("/auth/sso/redirect");
      window.location.href = res.authUrl;
    } catch (err: any) {
      toast({ title: "SSO Error", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-background bg-[radial-gradient(1200px_500px_at_50%_-10%,#fff,transparent)] dark:bg-none">
      <div className="w-full max-w-[400px] space-y-5 px-4">
        {/* Logo / Header */}
        <div className="text-center space-y-2">
          <div className="flex flex-col items-center justify-center gap-3">
            {appConfig.logoUrl ? (
              <img src={appConfig.logoUrl} alt="Logo" className="h-14 w-14 object-contain rounded-[14px] bg-white p-1 shadow-[0_2px_8px_rgba(16,24,40,.14)]" />
            ) : (
              <Shield className="h-8 w-8 text-primary" />
            )}
            <span className="text-[20px] font-semibold text-foreground leading-tight">{appConfig.appName}</span>
          </div>
          <p className="text-[12.5px] text-muted-foreground">{appConfig.appTagline}</p>
        </div>

        {/* User Type Toggle */}
        {step === "credentials" && !centralOn && (
          <div className="flex bg-muted rounded-[10px] p-[3px] gap-[3px]">
            <button
              onClick={() => setUserType("internal")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-[8px] text-[12.5px] transition-colors ${
                userType === "internal"
                  ? "bg-card text-foreground font-semibold shadow-sm"
                  : "text-muted-foreground font-medium hover:text-foreground"
              }`}
            >
              <Building2 className="h-4 w-4" />
              Internal User
            </button>
            <button
              onClick={() => setUserType("external")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-[8px] text-[12.5px] transition-colors ${
                userType === "external"
                  ? "bg-card text-foreground font-semibold shadow-sm"
                  : "text-muted-foreground font-medium hover:text-foreground"
              }`}
            >
              <User className="h-4 w-4" />
              External User
            </button>
          </div>
        )}

        <Card className="border-border rounded-[18px] shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {step === "mfa" ? "Two-Factor Authentication" : "Sign In"}
            </CardTitle>
            <CardDescription>
              {step === "mfa"
                ? "Enter the 6-digit code from your authenticator app"
                : centralOn
                ? "Single sign-on through the Ashika Portal"
                : userType === "internal"
                ? "Ashika Group internal users"
                : "External partner / consultant access"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "credentials" ? (
              <>
                {centralOn && (
                  <div className="space-y-2">
                    <Button className="w-full h-11 gap-2 text-[14px]" onClick={startCentral}>
                      <Shield className="h-4 w-4" />{central!.buttonLabel || "Sign in with Ashika Portal"}
                    </Button>
                    <p className="text-[11.5px] text-muted-foreground text-center">Staff: Microsoft 365. Partners: Portal password with OTP. Your IT Hub access is set by the IT Hub administrator.</p>
                    {central!.localLogin === "admin" && !showLocal && (
                      <button type="button" className="w-full text-[11.5px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline" onClick={() => setShowLocal(true)}>Administrator sign-in (break-glass)</button>
                    )}
                    {passwordAllowed && <div className="relative pt-1"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">{central!.localLogin === "admin" ? "local administrator" : "or sign in with password"}</span></div></div>}
                  </div>
                )}
                {/* MS SSO for internal users */}
                {!centralOn && userType === "internal" && ssoConfig?.enabled && (
                  <>
                    <Button
                      variant="outline"
                      className="w-full flex items-center gap-3"
                      onClick={handleSsoLogin}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <svg className="h-5 w-5" viewBox="0 0 21 21" fill="none">
                          <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                          <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                          <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                          <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                        </svg>
                      )}
                      Sign in with Microsoft
                    </Button>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">or sign in with password</span>
                      </div>
                    </div>
                  </>
                )}

                {passwordAllowed && <form onSubmit={handleCredentials} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={userType === "internal" ? "name@ashikagroup.com" : "partner@company.com"}
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Signing in...</> : "Sign In"}
                  </Button>
                </form>}
              </>
            ) : (
              <form onSubmit={handleMfa} className="space-y-4">
                <div className="text-center py-4">
                  <Shield className="h-12 w-12 text-primary mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Open your authenticator app (Google Authenticator, Authy, etc.) and enter the code.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mfa-token">Verification Code</Label>
                  <Input
                    id="mfa-token"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    placeholder="000000"
                    maxLength={6}
                    value={mfaToken}
                    onChange={e => setMfaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    autoFocus
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || mfaToken.length < 6}>
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Verifying...</> : "Verify"}
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => { setStep("credentials"); setMfaToken(""); }}>
                  Back to sign in
                </Button>
              </form>
            )}
          </CardContent>
        </Card>


        <p className="text-center text-xs text-muted-foreground">
          Protected under Ashika Group IT Security Policy &mdash; Unauthorized access is prohibited.
        </p>
        <p className="text-center text-[10px] text-muted-foreground/70 mt-2">
          &copy; 2026 NIYTRI Technologies. All rights reserved.
        </p>

        {import.meta.env.DEV && (
          <div className="border border-amber-400/40 rounded-lg bg-amber-50/60 dark:bg-amber-900/10 text-xs">
            <button
              onClick={() => setShowDevCreds(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-amber-700 dark:text-amber-400 font-medium"
            >
              <span>🛠 Dev credentials (not visible in production)</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDevCreds ? "rotate-180" : ""}`} />
            </button>
            {showDevCreds && (
              <div className="px-3 pb-3 space-y-1 border-t border-amber-400/30">
                <p className="pt-2 pb-1 text-amber-600 dark:text-amber-500">Password for all: <span className="font-mono font-semibold">{DEV_PASSWORD}</span></p>
                {DEV_CREDENTIALS.map(c => (
                  <button
                    key={c.email}
                    onClick={() => { setEmail(c.email); setPassword(DEV_PASSWORD); }}
                    className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    <span className="font-medium text-foreground">{c.label}</span>
                    <span className="text-muted-foreground font-mono">{c.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
