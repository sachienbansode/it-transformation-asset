import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { Shield, Building2, User, Loader2 } from "lucide-react";

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
  const [appConfig, setAppConfig] = useState<AppConfig>({
    appName: "Ashika Drishti Transform",
    appTagline: "IT Transformation Planning Suite — Ashika Group",
    logoUrl: "",
  });

  useEffect(() => {
    if (user) navigate("/");
  }, [user]);

  useEffect(() => {
    apiFetch<{ enabled: boolean; configured: boolean }>("/auth/sso/config")
      .then(setSsoConfig)
      .catch(() => setSsoConfig({ enabled: false, configured: false }));
    apiFetch<AppConfig>("/config")
      .then(setAppConfig)
      .catch(() => {});
  }, []);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(email, password);
      if (res.requiresMfa) {
        setStep("mfa");
        toast({ title: "MFA required", description: "Enter the 6-digit code from your authenticator app." });
      } else {
        navigate("/");
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
      navigate("/");
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

  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 px-4">
        {/* Logo / Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            {appConfig.logoUrl ? (
              <img src={appConfig.logoUrl} alt="Logo" className="h-14 w-14 object-contain rounded-xl shadow-md ring-2 ring-primary/20" />
            ) : (
              <Shield className="h-8 w-8 text-primary" />
            )}
            <span className="text-2xl font-bold text-foreground">{appConfig.appName}</span>
          </div>
          <p className="text-sm text-muted-foreground">{appConfig.appTagline}</p>
        </div>

        {/* User Type Toggle */}
        {step === "credentials" && (
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setUserType("internal")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                userType === "internal"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Building2 className="h-4 w-4" />
              Internal User
            </button>
            <button
              onClick={() => setUserType("external")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                userType === "external"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <User className="h-4 w-4" />
              External User
            </button>
          </div>
        )}

        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {step === "mfa" ? "Two-Factor Authentication" : "Sign In"}
            </CardTitle>
            <CardDescription>
              {step === "mfa"
                ? "Enter the 6-digit code from your authenticator app"
                : userType === "internal"
                ? "Ashika Group internal users"
                : "External partner / consultant access"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "credentials" ? (
              <>
                {/* MS SSO for internal users */}
                {userType === "internal" && ssoConfig?.enabled && (
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

                <form onSubmit={handleCredentials} className="space-y-4">
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
                </form>
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

        {/* Dev credentials — visible only in development */}
        {isDev && (
          <Card className="border-dashed border-primary/40 bg-primary/5">
            <CardContent className="py-3 px-4">
              <p className="text-xs font-semibold text-primary mb-2">Dev Environment — Sample Credentials</p>
              <div className="space-y-1 text-xs font-mono text-muted-foreground">
                <div className="flex justify-between">
                  <span>admin@ashikagroup.com</span>
                  <span className="text-foreground">Ashika@2025</span>
                </div>
                <div className="flex justify-between">
                  <span>sachin.bansode@ashikagroup.com</span>
                  <span className="text-foreground">Ashika@2025</span>
                </div>
                <div className="flex justify-between">
                  <span>arunava.nandi@ashikagroup.com</span>
                  <span className="text-foreground">Ashika@2025</span>
                </div>
                <div className="flex justify-between">
                  <span>vishal.c@ashikagroup.com</span>
                  <span className="text-foreground">Ashika@2025</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 italic">This panel is hidden in production.</p>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Protected under Ashika Group IT Security Policy &mdash; Unauthorized access is prohibited.
        </p>
      </div>
    </div>
  );
}
