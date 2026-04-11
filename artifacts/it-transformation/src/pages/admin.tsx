import React, { useState, useEffect } from "react";
import { getRoleLabel } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useAllMasters, getBadgeClass } from "@/hooks/use-masters";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Settings, Users, Database, Plus, Pencil, Trash2, RefreshCw, Shield, Building2, Clock,
  ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Minus, Info, Search,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type Tab = "settings" | "users" | "roles" | "masters" | "business-units" | "audit";

interface AdminUser {
  id: number; email: string; name: string; userType: string;
  role: string; department?: string; designation?: string; employeeCode?: string;
  mobile?: string; mfaEnabled: boolean;
  mfaMethod?: string; isActive: boolean; status: string;
  lastLoginAt?: string; createdAt: string;
}
interface AdminSettings {
  "auth.selfRegistration"?: boolean;
  "auth.mfaDefault"?: boolean;
  "auth.mfaRequired.internal"?: boolean;
  "auth.mfaRequired.external"?: boolean;
  "sso.msEnabled"?: boolean;
  "sso.clientId"?: string;
  "sso.tenantId"?: string;
  "sso.clientSecret"?: string;
  "sso.redirectUri"?: string;
  "app_name"?: string;
  "app_tagline"?: string;
  "logo_url"?: string;
}

export default function Admin() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tabFromUrl = new URLSearchParams(search).get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(tabFromUrl || "settings");

  useEffect(() => {
    const t = new URLSearchParams(search).get("tab") as Tab | null;
    if (t && ["settings", "users", "roles", "masters", "business-units", "audit"].includes(t)) {
      setTab(t as Tab);
    }
  }, [search]);

  useEffect(() => {
    if (user && user.role !== "admin") navigate("/");
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Admin Configuration</h1>
          <p className="text-sm text-muted-foreground">Manage authentication, users, and master data</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border pb-0 flex-wrap">
        {([
          ["settings", Settings, "Settings"],
          ["users", Users, "User Management"],
          ["roles", Shield, "Roles & Permissions"],
          ["masters", Database, "Master Data"],
          ["business-units", Building2, "Business Units"],
          ["audit", Clock, "Audit Trail"],
        ] as [Tab, React.ElementType, string][]).map(([t, Icon, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "settings" && <SettingsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "masters" && <MastersTab />}
      {tab === "business-units" && <BusinessUnitsTab />}
      {tab === "audit" && <AuditTrailTab />}
    </div>
  );
}

// ─── SETTINGS TAB ────────────────────────────────────────────────────────────

function SettingsTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AdminSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<AdminSettings>("/admin/settings").then(s => { setSettings(s); setLoading(false); });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/admin/settings", { method: "PUT", body: JSON.stringify(settings) });
      toast({ title: "Settings saved", description: "Configuration updated successfully." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const set = (key: keyof AdminSettings, value: unknown) =>
    setSettings(s => ({ ...s, [key]: value }));

  if (loading) return <div className="space-y-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Auth Settings */}
      <Card>
        <CardHeader><CardTitle className="text-base">Authentication</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <SettingToggle
            label="Allow External Self-Registration"
            description="External users can create their own accounts"
            checked={!!settings["auth.selfRegistration"]}
            onChange={v => set("auth.selfRegistration", v)}
          />
          <SettingToggle
            label="Require MFA for Internal Users"
            description="All internal users must set up MFA"
            checked={!!settings["auth.mfaRequired.internal"]}
            onChange={v => set("auth.mfaRequired.internal", v)}
          />
          <SettingToggle
            label="Require MFA for External Users"
            description="All external users must set up MFA"
            checked={!!settings["auth.mfaRequired.external"]}
            onChange={v => set("auth.mfaRequired.external", v)}
          />
        </CardContent>
      </Card>

      {/* MS SSO */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Microsoft SSO</CardTitle>
          <CardDescription>Configure Azure AD for internal user single sign-on. Only available for internal users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingToggle
            label="Enable Microsoft SSO"
            description="Show 'Sign in with Microsoft' button for internal users"
            checked={!!settings["sso.msEnabled"]}
            onChange={v => set("sso.msEnabled", v)}
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Azure AD Client ID</Label>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={(settings["sso.clientId"] as string) || ""}
                onChange={e => set("sso.clientId", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Azure AD Tenant ID</Label>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={(settings["sso.tenantId"] as string) || ""}
                onChange={e => set("sso.tenantId", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Client Secret</Label>
              <Input
                type="password"
                placeholder="Azure AD client secret"
                value={(settings["sso.clientSecret"] as string) || ""}
                onChange={e => set("sso.clientSecret", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Redirect URI (optional)</Label>
              <Input
                placeholder="https://yourdomain.com/api/auth/sso/callback"
                value={(settings["sso.redirectUri"] as string) || ""}
                onChange={e => set("sso.redirectUri", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branding</CardTitle>
          <CardDescription>Configure the application name, tagline, and logo. Changes take effect immediately on all screens.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Application Name</Label>
              <span className={`text-xs ${((settings["app_name"] as string) || "").length > 50 ? "text-destructive" : "text-muted-foreground"}`}>
                {((settings["app_name"] as string) || "").length}/50
              </span>
            </div>
            <Input
              value={(settings["app_name"] as string) || ""}
              onChange={e => { if (e.target.value.length <= 50) set("app_name", e.target.value); }}
              placeholder="Ashika Drishti Transform"
              maxLength={50}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tagline</Label>
            <Input
              value={(settings["app_tagline"] as string) || ""}
              onChange={e => set("app_tagline", e.target.value)}
              placeholder="IT Transformation Planning Suite — Ashika Group"
            />
          </div>
          <LogoUpload
            value={(settings["logo_url"] as string) || ""}
            onChange={v => set("logo_url", v)}
          />
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} className="min-w-32">
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}

function compressImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

function LogoUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [maxSize, setMaxSize] = React.useState(128);
  const [processing, setProcessing] = React.useState(false);
  const [sizeInfo, setSizeInfo] = React.useState<string>("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setProcessing(true);
    try {
      const originalKb = Math.round(file.size / 1024);
      const compressed = await compressImage(file, maxSize, 0.9);
      const compressedKb = Math.round((compressed.length * 3) / 4 / 1024);
      setSizeInfo(`${originalKb} KB → ${compressedKb} KB (${maxSize}×${maxSize}px max)`);
      onChange(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = () => { onChange(reader.result as string); setSizeInfo(""); };
      reader.readAsDataURL(file);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Logo</Label>
      <div className="flex items-start gap-4">
        {value ? (
          <div className="relative group flex-shrink-0">
            <div className="h-24 w-24 rounded-2xl border border-border bg-gradient-to-br from-muted/80 to-muted/30 p-1.5 flex items-center justify-center shadow-lg ring-2 ring-primary/20 transition-all group-hover:ring-primary/40">
              <img src={value} alt="Logo"
                className="max-h-full max-w-full object-contain drop-shadow-sm"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <button type="button" onClick={() => { onChange(""); setSizeInfo(""); }}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
              title="Remove logo">×</button>
          </div>
        ) : (
          <div className="h-24 w-24 rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center bg-muted/30 flex-shrink-0 gap-1 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer" onClick={() => fileRef.current?.click()}>
            <span className="text-[10px] text-muted-foreground font-medium">No logo</span>
            <span className="text-[9px] text-muted-foreground/60">Click to upload</span>
          </div>
        )}
        <div className="space-y-2 flex-1">
          <div className="flex gap-2 items-center flex-wrap">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={processing}>
              {processing ? "Processing…" : "Upload Logo"}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { onChange(""); setSizeInfo(""); }}>
                Remove
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Max size:</span>
            <input type="range" min={64} max={256} step={32} value={maxSize} onChange={e => setMaxSize(+e.target.value)} className="w-28 h-1.5 accent-primary" />
            <span className="text-xs font-mono text-muted-foreground">{maxSize}px</span>
          </div>
          <p className="text-[11px] text-muted-foreground">PNG, JPG, WebP accepted. Auto-resized &amp; compressed before saving.</p>
          {sizeInfo && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{sizeInfo}</p>}
        </div>
      </div>
    </div>
  );
}

function SettingToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ─── USERS TAB ───────────────────────────────────────────────────────────────

interface DeptMaster { id: number; key: string; label: string; sortOrder: number; }

function UsersTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [sortCol, setSortCol] = useState<"name" | "email" | "department" | "role" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [form, setForm] = useState({ name: "", email: "", password: "", userType: "internal", role: "user", department: "", designation: "", employeeCode: "", mobile: "", status: "active", isActive: true });
  const [deptMasters, setDeptMasters] = useState<DeptMaster[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [data, depts] = await Promise.all([
        apiFetch<AdminUser[]>("/admin/users"),
        apiFetch<DeptMaster[]>("/masters?category=department&active=true"),
      ]);
      setUsers(data);
      setDeptMasters(depts.sort((a, b) => a.sortOrder - b.sortOrder));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditUser(null);
    setForm({ name: "", email: "", password: "", userType: "internal", role: "user", department: "", designation: "", employeeCode: "", mobile: "", status: "active", isActive: true });
    setModalOpen(true);
  };

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: "", userType: u.userType, role: u.role, department: u.department || "", designation: u.designation || "", employeeCode: u.employeeCode || "", mobile: u.mobile || "", status: u.status || "active", isActive: u.isActive });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editUser) {
        const body: any = { name: form.name, userType: form.userType, role: form.role, department: form.department, designation: form.designation, employeeCode: form.employeeCode, mobile: form.mobile, status: form.status };
        if (form.password) body.password = form.password;
        await apiFetch(`/admin/users/${editUser.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "User updated" });
      } else {
        if (!form.designation.trim() || !form.employeeCode.trim() || !form.department.trim()) {
          toast({ title: "Designation, Department, and Employee Code are required", variant: "destructive" }); return;
        }
        const body: any = { name: form.name, email: form.email, userType: form.userType, role: form.role, department: form.department, designation: form.designation, employeeCode: form.employeeCode, mobile: form.mobile, status: form.status };
        if (form.password) body.password = form.password;
        await apiFetch("/admin/users", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "User created" });
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (u: AdminUser) => {
    if (!confirm(`Delete user ${u.name}?`)) return;
    try {
      await apiFetch(`/admin/users/${u.id}`, { method: "DELETE" });
      toast({ title: "User deleted" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deptLabel = (key: string) =>
    deptMasters.find(d => d.key === key)?.label || key;

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortedFilteredUsers = React.useMemo(() => {
    const q = searchQ.toLowerCase();
    const filtered = q
      ? users.filter(u =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.department || "").toLowerCase().includes(q) ||
          (u.designation || "").toLowerCase().includes(q) ||
          (u.employeeCode || "").toLowerCase().includes(q)
        )
      : users;
    return [...filtered].sort((a, b) => {
      const aVal = (a[sortCol] || "").toString().toLowerCase();
      const bVal = (b[sortCol] || "").toString().toLowerCase();
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [users, searchQ, sortCol, sortDir]);

  const SortIcon = ({ col }: { col: typeof sortCol }) => (
    sortCol === col
      ? <span className="ml-1 text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>
      : <span className="ml-1 text-muted-foreground/40">↕</span>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search users…"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground whitespace-nowrap">{sortedFilteredUsers.length} / {users.length}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Add User</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort("name")}>Name<SortIcon col="name" /></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort("email")}>Email<SortIcon col="email" /></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Mobile</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort("role")}>Role<SortIcon col="role" /></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort("department")}>Dept<SortIcon col="department" /></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">MFA</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort("status")}>Status<SortIcon col="status" /></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Last Login</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {sortedFilteredUsers.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-muted-foreground">No users match your search.</td></tr>
              )}
              {sortedFilteredUsers.map(u => (
                <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">{u.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{u.email}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{u.mobile || "-"}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={u.userType === "internal" ? "border-blue-500/30 text-blue-400" : "border-purple-500/30 text-purple-400"}>
                      {u.userType === "internal" ? "Internal" : "External"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={u.role === "admin" ? "border-yellow-500/30 text-yellow-400" : "border-gray-500/30 text-gray-400"}>
                      {getRoleLabel(u.role)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{deptLabel(u.department || "") || "-"}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={u.mfaEnabled ? "border-green-500/30 text-green-400" : "border-gray-500/30 text-gray-400"}>
                      {u.mfaEnabled ? "ON" : "OFF"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {(() => {
                      const s = u.status || (u.isActive ? "active" : "inactive");
                      const cls = s === "active" ? "border-green-500/30 text-green-400" : s === "dormant" ? "border-yellow-500/30 text-yellow-400" : "border-red-500/30 text-red-400";
                      return <Badge variant="outline" className={cls}>{s.charAt(0).toUpperCase() + s.slice(1)}</Badge>;
                    })()}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-IN") : "Never"}
                  </td>
                  <td className="px-4 py-2.5 flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(u)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editUser ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>Full Name *</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
            {!editUser && <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>}
            <div className="space-y-1.5"><Label>Designation *</Label><Input value={form.designation} onChange={e => setForm(f => ({...f, designation: e.target.value}))} placeholder="e.g. Senior Manager" /></div>
            <div className="space-y-1.5"><Label>Employee Code *</Label><Input value={form.employeeCode} onChange={e => setForm(f => ({...f, employeeCode: e.target.value}))} placeholder="e.g. EMP001" /></div>
            <div className="space-y-1.5">
              <Label>Department *</Label>
              <Select value={form.department} onValueChange={v => setForm(f => ({...f, department: v}))}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {deptMasters.map(d => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({...f, role: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User (Read-Only)</SelectItem>
                  <SelectItem value="admin">Admin (Full Access)</SelectItem>
                  <SelectItem value="cxo">CXO (Dept KPIs)</SelectItem>
                  <SelectItem value="kpi_employee">Employee (Own KPI set)</SelectItem>
                  <SelectItem value="hr">HR (KPI module only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>User Type</Label>
              <Select value={form.userType} onValueChange={v => setForm(f => ({...f, userType: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mobile Number</Label>
              <Input value={form.mobile} onChange={e => setForm(f => ({...f, mobile: e.target.value}))} placeholder="+91 99999 99999" />
            </div>
            <div className="space-y-1.5">
              <Label>Account Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({...f, status: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="dormant">Dormant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2"><Label>Password {editUser && "(leave blank to keep)"}</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editUser ? "Update" : "Create User"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MASTERS TAB ─────────────────────────────────────────────────────────────

const MASTER_MODULES = [
  { module: "General", items: [
    { key: "vendor", label: "Vendor" },
    { key: "department", label: "Department" },
    { key: "priority", label: "Priority" },
    { key: "risk_level", label: "Risk Level" },
    { key: "criticality", label: "Criticality" },
    { key: "compliance_status", label: "Compliance Status" },
  ]},
  { module: "Applications", items: [
    { key: "app_category", label: "Application Category" },
    { key: "hosting", label: "Hosting Type" },
    { key: "license_type", label: "Software License Type" },
    { key: "data_classification", label: "Data Classification" },
    { key: "support_status", label: "Support Status" },
  ]},
  { module: "Transformation", items: [
    { key: "checklist_status", label: "Checklist Status" },
    { key: "checklist_category", label: "Checklist Category" },
    { key: "phase", label: "Roadmap Phase" },
    { key: "roadmap_status", label: "Roadmap Status" },
    { key: "retirement_reason", label: "Retirement Reason" },
    { key: "retirement_status", label: "Retirement Status" },
    { key: "migration_effort", label: "Migration Effort" },
  ]},
  { module: "AI / SBOM", items: [
    { key: "ai_type", label: "AI Component Type" },
  ]},
  { module: "IT Asset Management", items: [
    { key: "asset_type", label: "Asset Type" },
    { key: "asset_status", label: "Asset Status" },
    { key: "asset_license_type", label: "Asset License Type" },
    { key: "asset_license_status", label: "Asset License Status" },
  ]},
  { module: "IT Service Management", items: [
    { key: "incident_priority", label: "Incident Priority" },
    { key: "incident_severity", label: "Incident Severity" },
    { key: "incident_status", label: "Incident Status" },
    { key: "incident_category", label: "Incident Category" },
    { key: "problem_status", label: "Problem Status" },
    { key: "change_type", label: "Change Type" },
    { key: "change_risk", label: "Change Risk Level" },
    { key: "change_status", label: "Change Status" },
    { key: "change_approval", label: "Change Approval Status" },
    { key: "kb_category", label: "KB Category" },
    { key: "kb_status", label: "KB Status" },
    { key: "sr_category", label: "Service Request Category" },
    { key: "sr_status", label: "Service Request Status" },
    { key: "sla_priority", label: "SLA Priority" },
  ]},
];
const CATEGORIES = MASTER_MODULES.flatMap(m => m.items);

function MastersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: allMasters, isLoading, refetch } = useAllMasters();
  const [selectedCategory, setSelectedCategory] = useState("vendor");
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [form, setForm] = useState({ label: "", color: "", sortOrder: 0, isActive: true });

  const filtered = (allMasters || []).filter(m => m.category === selectedCategory);

  const openAdd = () => {
    setEditItem(null);
    setForm({ label: "", color: "", sortOrder: filtered.length + 1, isActive: true });
    setModalOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ label: item.label, color: item.color || "", sortOrder: item.sortOrder, isActive: item.isActive });
    setModalOpen(true);
  };

  const invalidateMasters = () => {
    queryClient.invalidateQueries({ queryKey: ["masters-admin-all"] });
    queryClient.invalidateQueries({ queryKey: ["masters"] });
    refetch();
  };

  const handleSave = async () => {
    try {
      if (editItem) {
        await apiFetch(`/masters/${editItem.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast({ title: "Master updated" });
      } else {
        const key = form.label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        await apiFetch("/masters", { method: "POST", body: JSON.stringify({ category: selectedCategory, key, ...form }) });
        toast({ title: "Master added" });
      }
      setModalOpen(false);
      invalidateMasters();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (item: any) => {
    try {
      await apiFetch(`/masters/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) });
      toast({ title: item.isActive ? "Item deactivated" : "Item reactivated" });
      invalidateMasters();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete "${item.label}"?`)) return;
    try {
      await apiFetch(`/masters/${item.id}`, { method: "DELETE" });
      toast({ title: "Deleted" });
      invalidateMasters();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const [masterSearch, setMasterSearch] = useState("");
  const filteredModules = masterSearch
    ? MASTER_MODULES.map(mod => ({ ...mod, items: mod.items.filter(c => c.label.toLowerCase().includes(masterSearch.toLowerCase())) })).filter(mod => mod.items.length > 0)
    : MASTER_MODULES;

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        {/* Category list with module groups */}
        <div className="w-56 shrink-0 space-y-1 max-h-[600px] overflow-y-auto">
          <div className="sticky top-0 bg-background pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search masters..." value={masterSearch} onChange={e => setMasterSearch(e.target.value)} className="h-8 pl-8 text-xs" />
            </div>
          </div>
          {filteredModules.map(mod => (
            <div key={mod.module} className="mb-2">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{mod.module}</div>
              {mod.items.map(c => (
                <button
                  key={c.key}
                  onClick={() => setSelectedCategory(c.key)}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${
                    selectedCategory === c.key ? "bg-primary/20 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {c.label}
                  <span className="ml-1 text-[10px] opacity-60">
                    ({(allMasters || []).filter(m => m.category === c.key).length})
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Items table */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mr-1.5">
                {MASTER_MODULES.find(m => m.items.some(i => i.key === selectedCategory))?.module} /
              </span>
              {CATEGORIES.find(c => c.key === selectedCategory)?.label}
              <span className="text-muted-foreground font-normal ml-2">({filtered.length} items)</span>
            </h3>
            <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {["Label", "Color", "Sort", "Active", ""].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} className={`border-t border-border hover:bg-muted/30 ${!item.isActive ? "opacity-60" : ""}`}>
                      <td className="px-3 py-2 font-medium">{item.label}</td>
                      <td className="px-3 py-2">
                        {item.color ? (
                          <Badge variant="outline" className={`text-xs ${getBadgeClass(item.color)}`}>{item.color}</Badge>
                        ) : "-"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{item.sortOrder}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={item.isActive ? "border-green-500/30 text-green-400" : "border-red-500/30 text-red-400"}>
                          {item.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="sm"
                            className={`h-7 px-2 text-xs ${item.isActive ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20" : "text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"}`}
                            onClick={() => handleToggleActive(item)}
                            title={item.isActive ? "Deactivate" : "Reactivate"}
                          >
                            {item.isActive ? "Deactivate" : "Reactivate"}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(item)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Master" : "Add Master"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Label</Label><Input value={form.label} onChange={e => setForm(f => ({...f, label: e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Color (for badge)</Label>
                <Select value={form.color || "none"} onValueChange={v => setForm(f => ({...f, color: v === "none" ? "" : v}))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {["red","orange","yellow","green","blue","purple","teal","gray","indigo","pink"].map(c => (
                      <SelectItem key={c} value={c}><span className={`inline-block w-3 h-3 rounded-full mr-2 bg-${c}-500`} />{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({...f, sortOrder: +e.target.value}))} /></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({...f, isActive: v}))} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editItem ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── BUSINESS UNITS TAB ───────────────────────────────────────────────────────

interface BUItem {
  id: number; name: string; code: string; description?: string;
  isActive: boolean; sortOrder: number;
}

function BusinessUnitsTab() {
  const { toast } = useToast();
  const { data: allUnits, refetch, isLoading } = useQuery({
    queryKey: ["admin-business-units"],
    queryFn: () => apiFetch<BUItem[]>("/business-units/all"),
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editBU, setEditBU] = useState<BUItem | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "", sortOrder: 0, isActive: true });

  const openCreate = () => {
    setEditBU(null);
    setForm({ name: "", code: "", description: "", sortOrder: (allUnits?.length ?? 0) + 1, isActive: true });
    setModalOpen(true);
  };
  const openEdit = (bu: BUItem) => {
    setEditBU(bu);
    setForm({ name: bu.name, code: bu.code, description: bu.description ?? "", sortOrder: bu.sortOrder, isActive: bu.isActive });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editBU) {
        await apiFetch(`/admin/business-units/${editBU.id}`, {
          method: "PATCH", body: JSON.stringify(form),
        });
        toast({ title: "Business unit updated" });
      } else {
        await apiFetch("/admin/business-units", {
          method: "POST", body: JSON.stringify(form),
        });
        toast({ title: "Business unit created" });
      }
      setModalOpen(false);
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleToggle = async (bu: BUItem) => {
    try {
      await apiFetch(`/admin/business-units/${bu.id}`, {
        method: "PATCH", body: JSON.stringify({ isActive: !bu.isActive }),
      });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Business Units</h2>
          <p className="text-xs text-muted-foreground">Manage the Ashika Group business unit structure</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Add Unit</Button>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Code</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Description</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Order</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(allUnits ?? []).map(bu => (
              <tr key={bu.id} className="border-t border-border hover:bg-muted/20">
                <td className="px-4 py-3 font-semibold">{bu.name}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono font-bold border border-primary/20">{bu.code}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-48 truncate">{bu.description || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{bu.sortOrder}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={bu.isActive ? "border-green-500/30 text-green-600 dark:text-green-400" : "border-red-500/30 text-red-600 dark:text-red-400"}>
                    {bu.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(bu)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => handleToggle(bu)}
                      title={bu.isActive ? "Deactivate" : "Activate"}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editBU ? "Edit Business Unit" : "Add Business Unit"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. AIF" />
              </div>
              <div className="space-y-1.5">
                <Label>Code <span className="text-muted-foreground text-xs">(unique)</span></Label>
                <Input value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value.toUpperCase()}))} placeholder="e.g. AIF" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Brief description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({...f, sortOrder: +e.target.value}))} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({...f, isActive: v}))} />
                <Label>Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editBU ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── AUDIT TRAIL TAB ─────────────────────────────────────────────────────────

interface AuditLog {
  id: number;
  entityType: string;
  entityId?: number;
  action: string;
  performedBy?: string;
  performedAt: string;
  summary?: string;
  oldValues?: unknown;
  newValues?: unknown;
}

function AuditTrailTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (entityType !== "all") params.set("entityType", entityType);
      const result = await apiFetch<{ logs: AuditLog[]; hasMore: boolean }>(`/audit-logs?${params}`);
      setLogs(result.logs);
      setHasMore(result.hasMore);
    } catch { setLogs([]); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, [entityType, page]);

  const actionBadge = (action: string) => {
    const map: Record<string, string> = {
      create: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10",
      update: "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10",
      delete: "border-red-500/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10",
      import: "border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-400/10",
    };
    return map[action] || "border-border text-muted-foreground";
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Audit Trail</h2>
          <p className="text-xs text-muted-foreground">All changes to application data, with before/after snapshots</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={entityType} onValueChange={v => { setEntityType(v); setPage(1); }}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="application">Applications</SelectItem>
              <SelectItem value="roadmap">Roadmap</SelectItem>
              <SelectItem value="checklist">Checklist</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={fetchLogs}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          No audit records found.
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-36">Time</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-24">Entity</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-20">Action</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Summary</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Performed By</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase w-16">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <React.Fragment key={log.id}>
                  <tr className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.performedAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="text-[10px] capitalize">{log.entityType}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={`text-[10px] capitalize border ${actionBadge(log.action)}`}>{log.action}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs truncate" title={log.summary}>{log.summary}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-[160px]" title={log.performedBy}>{log.performedBy || "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {(log.oldValues || log.newValues) && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                          {expandedId === log.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr className="border-t border-border bg-muted/10">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4">
                          {log.oldValues && (
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5">Before</p>
                              <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(log.oldValues, null, 2)}</pre>
                            </div>
                          )}
                          {log.newValues && (
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5">After</p>
                              <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(log.newValues, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">Page {page}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

// ─── ROLES TAB ────────────────────────────────────────────────────────────────

const MODULES_LABELS: Record<string, string> = {
  dashboard: "Executive Dashboard", checklist: "IT Master Checklist", roadmap: "Transformation Roadmap",
  retirements: "App Retirement Plan", applications: "Application Inventory", aibom: "AI Bill of Materials",
  sbom: "Software BOM", kpis: "KPI Management", kpi_dashboard: "KPI Dashboard", reports: "PPT Reports", admin: "Admin Panel",
};

const DASHBOARD_ROUTES = [
  { value: "/", label: "Executive Dashboard (Admin Home)" },
  { value: "/kpi-dashboard", label: "KPI Dashboard" },
  { value: "/kpis", label: "KPI Management" },
  { value: "/checklist", label: "IT Master Checklist" },
  { value: "/roadmap", label: "Transformation Roadmap" },
];
const MODULES = Object.keys(MODULES_LABELS);
const ACCESS_LEVELS = ["none", "read", "write", "admin"] as const;

interface Role { id: number; name: string; description?: string; isSystem: boolean; defaultDashboard?: string; createdAt: string; }
interface RolePermission { id: number; roleId: number; module: string; accessLevel: string; }
interface UserRole { id: number; userId: number; roleId: number; userName?: string; userEmail?: string; }

function RolesTab() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Record<string, string>>({});
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [addUserRoleId, setAddUserRoleId] = useState("");
  const [editDefaultDashboard, setEditDefaultDashboard] = useState("/");

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Role[]>("/roles");
      setRoles(data);
      if (!selectedRole && data.length > 0) setSelectedRole(data[0]);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const loadRoleDetails = async (role: Role) => {
    try {
      const [perms, urs, users] = await Promise.all([
        apiFetch<RolePermission[]>(`/roles/${role.id}/permissions`),
        apiFetch<UserRole[]>(`/roles/${role.id}/users`),
        apiFetch<AdminUser[]>("/admin/users"),
      ]);
      const pm: Record<string, string> = {};
      for (const m of MODULES) pm[m] = "none";
      for (const p of perms) pm[p.module] = p.accessLevel;
      setPermissions(pm);
      setUserRoles(urs);
      setAllUsers(users);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  useEffect(() => { loadRoles(); }, []);
  useEffect(() => { if (selectedRole) loadRoleDetails(selectedRole); }, [selectedRole]);

  const selectRole = (role: Role) => {
    setSelectedRole(role);
    setEditDefaultDashboard(role.defaultDashboard ?? "/");
  };

  const saveRoleMeta = async () => {
    if (!selectedRole) return;
    setSavingMeta(true);
    try {
      await apiFetch(`/roles/${selectedRole.id}`, {
        method: "PATCH",
        body: JSON.stringify({ defaultDashboard: editDefaultDashboard }),
      });
      setSelectedRole(r => r ? { ...r, defaultDashboard: editDefaultDashboard } : r);
      setRoles(rs => rs.map(r => r.id === selectedRole.id ? { ...r, defaultDashboard: editDefaultDashboard } : r));
      toast({ title: "Role settings saved" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingMeta(false); }
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await apiFetch(`/roles/${selectedRole.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: Object.entries(permissions).map(([module, accessLevel]) => ({ module, accessLevel })) }),
      });
      toast({ title: "Permissions saved" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const createRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      await apiFetch("/roles", { method: "POST", body: JSON.stringify({ name: newRoleName.trim(), description: newRoleDesc.trim() }) });
      toast({ title: "Role created" });
      setNewRoleOpen(false); setNewRoleName(""); setNewRoleDesc("");
      await loadRoles();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const deleteRole = async (role: Role) => {
    if (role.isSystem) { toast({ title: "Cannot delete system role", variant: "destructive" }); return; }
    if (!confirm(`Delete role "${role.name}"?`)) return;
    try {
      await apiFetch(`/roles/${role.id}`, { method: "DELETE" });
      toast({ title: "Role deleted" });
      setSelectedRole(null);
      await loadRoles();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const addUserToRole = async () => {
    if (!selectedRole || !addUserRoleId) return;
    try {
      await apiFetch(`/roles/${selectedRole.id}/users`, { method: "POST", body: JSON.stringify({ userId: parseInt(addUserRoleId) }) });
      toast({ title: "User assigned to role" });
      setAddUserRoleId("");
      loadRoleDetails(selectedRole);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const removeUserFromRole = async (ur: UserRole) => {
    if (!selectedRole) return;
    try {
      await apiFetch(`/roles/${selectedRole.id}/users/${ur.userId}`, { method: "DELETE" });
      toast({ title: "User removed from role" });
      loadRoleDetails(selectedRole);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const usersNotInRole = allUsers.filter(u => !userRoles.some(ur => ur.userId === u.id));
  const levelColor: Record<string, string> = { none: "text-muted-foreground", read: "text-blue-600 dark:text-blue-400", write: "text-yellow-600 dark:text-yellow-400", admin: "text-red-600 dark:text-red-400" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Roles &amp; Permissions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Control what each role can access across all modules.</p>
        </div>
        <Button size="sm" onClick={() => setNewRoleOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5"/>New Role</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full"/>)}</div>
      ) : (
        <div className="grid grid-cols-[220px_1fr] gap-4">
          {/* Role list */}
          <div className="border border-border rounded-lg overflow-hidden">
            {roles.map(role => (
              <button key={role.id} onClick={() => selectRole(role)}
                className={`w-full text-left px-3 py-2.5 border-b border-border/50 last:border-b-0 transition-colors ${selectedRole?.id === role.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/30"}`}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{role.name}</p>
                    {role.description && <p className="text-[10px] text-muted-foreground truncate">{role.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {role.isSystem && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400 font-medium">system</span>}
                    {!role.isSystem && selectedRole?.id === role.id && (
                      <button onClick={e => { e.stopPropagation(); deleteRole(role); }} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5"/>
                      </button>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {roles.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">No roles yet. Create one above.</div>
            )}
          </div>

          {/* Role detail */}
          {selectedRole ? (
            <div className="space-y-4">
              {/* Role settings */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{selectedRole.name} — Role Settings</CardTitle>
                    <Button size="sm" className="h-7 text-xs" onClick={saveRoleMeta} disabled={savingMeta}>{savingMeta ? "Saving…" : "Save Settings"}</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Default Landing Page</label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Where users with this role land after login.</p>
                    </div>
                    <select
                      value={editDefaultDashboard}
                      onChange={e => setEditDefaultDashboard(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground min-w-[220px] focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {DASHBOARD_ROUTES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{selectedRole.name} — Permissions Matrix</CardTitle>
                    <Button size="sm" className="h-7 text-xs" onClick={savePermissions} disabled={saving}>{saving ? "Saving…" : "Save Permissions"}</Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2 text-xs font-semibold">Module</th>
                        {ACCESS_LEVELS.map(l => (
                          <th key={l} className="text-center px-3 py-2 text-xs font-semibold capitalize">{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map(mod => (
                        <tr key={mod} className="border-b border-border/50 hover:bg-muted/10">
                          <td className="px-4 py-2.5 text-sm">{MODULES_LABELS[mod]}</td>
                          {ACCESS_LEVELS.map(level => (
                            <td key={level} className="text-center px-3 py-2.5">
                              <input
                                type="radio"
                                name={`perm-${mod}`}
                                checked={permissions[mod] === level}
                                onChange={() => setPermissions(p => ({ ...p, [mod]: level }))}
                                className="w-4 h-4 cursor-pointer accent-primary"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center gap-4 px-4 py-2 border-t border-border/50 text-xs text-muted-foreground">
                    {ACCESS_LEVELS.map(l => <span key={l} className={levelColor[l]}><strong className="capitalize">{l}</strong>{l === "none" ? " — no access" : l === "read" ? " — view only" : l === "write" ? " — create & edit" : " — full control"}</span>)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Users with this Role</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Select value={addUserRoleId} onValueChange={setAddUserRoleId}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select user to add…"/></SelectTrigger>
                      <SelectContent>
                        {usersNotInRole.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.name} ({u.email})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8" onClick={addUserToRole} disabled={!addUserRoleId}><Plus className="mr-1 h-3.5 w-3.5"/>Add</Button>
                  </div>
                  {userRoles.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">No users assigned to this role yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {userRoles.map(ur => (
                        <div key={ur.id} className="flex items-center justify-between py-1.5 px-3 border border-border rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{ur.userName || `User #${ur.userId}`}</p>
                            {ur.userEmail && <p className="text-[10px] text-muted-foreground">{ur.userEmail}</p>}
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeUserFromRole(ur)}>
                            <Minus className="h-3.5 w-3.5"/>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 border border-border rounded-lg text-muted-foreground text-sm">
              Select a role on the left to manage its permissions.
            </div>
          )}
        </div>
      )}

      {/* New Role Dialog */}
      <Dialog open={newRoleOpen} onOpenChange={setNewRoleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Create New Role</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label className="text-xs">Role Name *</Label><Input className="h-8 text-sm" placeholder="e.g. Compliance Viewer" value={newRoleName} onChange={e => setNewRoleName(e.target.value)}/></div>
            <div className="space-y-1"><Label className="text-xs">Description</Label><Input className="h-8 text-sm" placeholder="Brief description of this role" value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewRoleOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={createRole} disabled={!newRoleName.trim()}>Create Role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
