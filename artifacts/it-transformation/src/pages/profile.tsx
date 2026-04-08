import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { User, Shield, Key, Smartphone, CheckCircle } from "lucide-react";

export default function Profile() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();

  const [profileForm, setProfileForm] = useState({ name: user?.name || "", department: "" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [mfaStep, setMfaStep] = useState<"idle" | "setup" | "verify">("idle");
  const [mfaData, setMfaData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [mfaToken, setMfaToken] = useState("");
  const [disableMfaToken, setDisableMfaToken] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<any>("/auth/profile").then(p => {
      setProfileForm({ name: p.name, department: p.department || "" });
    });
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiFetch("/auth/profile", { method: "PATCH", body: JSON.stringify(profileForm) });
      await refresh();
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const savePassword = async () => {
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      await apiFetch("/auth/profile", { method: "PATCH", body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }) });
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password changed successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const startMfaSetup = async () => {
    try {
      const data = await apiFetch<{ secret: string; qrCode: string }>("/auth/mfa/setup");
      setMfaData(data);
      setMfaStep("setup");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const enableMfa = async () => {
    try {
      await apiFetch("/auth/mfa/enable", { method: "POST", body: JSON.stringify({ token: mfaToken }) });
      await refresh();
      setMfaStep("idle");
      setMfaToken("");
      setMfaData(null);
      toast({ title: "MFA enabled", description: "Two-factor authentication is now active on your account." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const disableMfa = async () => {
    try {
      await apiFetch("/auth/mfa/disable", { method: "POST", body: JSON.stringify({ token: disableMfaToken }) });
      await refresh();
      setDisableMfaToken("");
      toast({ title: "MFA disabled" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">My Profile</h1>
          <p className="text-sm text-muted-foreground">{user?.email} &middot; <span className="capitalize">{user?.role}</span> &middot; <span className="capitalize">{user?.userType}</span></p>
        </div>
      </div>

      {/* Profile Details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Profile Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={profileForm.name} onChange={e => setProfileForm(f => ({...f, name: e.target.value}))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email (read-only)</Label>
              <Input value={user?.email} disabled className="opacity-60" />
            </div>
          </div>
          <Button onClick={saveProfile} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" />Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5"><Label>Current Password</Label><Input type="password" value={pwForm.currentPassword} onChange={e => setPwForm(f => ({...f, currentPassword: e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>New Password</Label><Input type="password" value={pwForm.newPassword} onChange={e => setPwForm(f => ({...f, newPassword: e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Confirm New Password</Label><Input type="password" value={pwForm.confirmPassword} onChange={e => setPwForm(f => ({...f, confirmPassword: e.target.value}))} /></div>
          </div>
          <Button onClick={savePassword} disabled={saving || !pwForm.currentPassword || !pwForm.newPassword}>Change Password</Button>
        </CardContent>
      </Card>

      {/* MFA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Two-Factor Authentication
            {user?.mfaEnabled && <Badge className="bg-green-500/20 text-green-400 border-green-500/30 ml-2">Enabled</Badge>}
          </CardTitle>
          <CardDescription>Protect your account with a time-based one-time password (TOTP) authenticator.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user?.mfaEnabled ? (
            mfaStep === "idle" ? (
              <Button variant="outline" onClick={startMfaSetup}>
                <Shield className="h-4 w-4 mr-2" />Enable MFA
              </Button>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  1. Scan the QR code below with Google Authenticator, Authy, or any TOTP app.<br />
                  2. Enter the 6-digit code shown in the app to verify and enable MFA.
                </p>
                {mfaData && (
                  <div className="flex gap-6 items-start">
                    <img src={mfaData.qrCode} alt="QR Code" className="w-40 h-40 rounded border border-border" />
                    <div className="space-y-2 flex-1">
                      <p className="text-xs text-muted-foreground">Or enter this secret manually:</p>
                      <code className="text-xs bg-muted px-2 py-1 rounded block break-all">{mfaData.secret}</code>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Verification Code</Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={mfaToken}
                      onChange={e => setMfaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-32 font-mono text-center text-lg tracking-widest"
                    />
                    <Button onClick={enableMfa} disabled={mfaToken.length < 6}>
                      <CheckCircle className="h-4 w-4 mr-1" />Verify & Enable
                    </Button>
                    <Button variant="ghost" onClick={() => { setMfaStep("idle"); setMfaData(null); setMfaToken(""); }}>Cancel</Button>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">MFA is active on your account. To disable it, enter a verification code from your authenticator app.</p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={disableMfaToken}
                  onChange={e => setDisableMfaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-32 font-mono text-center text-lg tracking-widest"
                />
                <Button variant="destructive" onClick={disableMfa} disabled={disableMfaToken.length < 6}>
                  Disable MFA
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
