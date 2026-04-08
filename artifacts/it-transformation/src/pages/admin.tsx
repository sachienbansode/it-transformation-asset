import React, { useState, useEffect } from "react";
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
  ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Minus, Info,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type Tab = "settings" | "users" | "masters" | "business-units" | "audit";

interface AdminUser {
  id: number; email: string; name: string; userType: string;
  role: string; department?: string; mobile?: string; mfaEnabled: boolean;
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
    if (t && ["settings", "users", "masters", "business-units", "audit"].includes(t)) {
      setTab(t);
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
            <Label>Application Name</Label>
            <Input
              value={(settings["app_name"] as string) || ""}
              onChange={e => set("app_name", e.target.value)}
              placeholder="Ashika Drishti Transform"
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

function LogoUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  return (
    <div className="space-y-2">
      <Label>Logo</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative group">
            <img
              src={value}
              alt="Logo"
              className="h-14 w-14 object-contain rounded-lg border border-border bg-muted"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove logo"
            >×</button>
          </div>
        ) : (
          <div className="h-14 w-14 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/50">
            <span className="text-[10px] text-muted-foreground font-medium">No logo</span>
          </div>
        )}
        <div className="space-y-1.5">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            Upload Logo
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive ml-2" onClick={() => onChange("")}>
              Remove
            </Button>
          )}
          <p className="text-xs text-muted-foreground">PNG, SVG, JPG · Recommended: 64×64 px</p>
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

function UsersTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", userType: "internal", role: "user", department: "", mobile: "", status: "active", isActive: true });

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<AdminUser[]>("/admin/users");
      setUsers(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditUser(null);
    setForm({ name: "", email: "", password: "", userType: "internal", role: "user", department: "", mobile: "", status: "active", isActive: true });
    setModalOpen(true);
  };

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: "", userType: u.userType, role: u.role, department: u.department || "", mobile: u.mobile || "", status: u.status || "active", isActive: u.isActive });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editUser) {
        const body: any = { name: form.name, userType: form.userType, role: form.role, department: form.department, mobile: form.mobile, status: form.status };
        if (form.password) body.password = form.password;
        await apiFetch(`/admin/users/${editUser.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "User updated" });
      } else {
        const body: any = { name: form.name, email: form.email, userType: form.userType, role: form.role, department: form.department, mobile: form.mobile, status: form.status };
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

  const DEPARTMENTS = ["it","risk","compliance","operations","finance","broking_ops","nbfc_ops","aif_ops","institutional","hr","management"];
  const DEPT_LABELS: Record<string, string> = {
    it: "Information Technology", risk: "Risk Management", compliance: "Compliance & Legal",
    operations: "Operations", finance: "Finance & Accounts", broking_ops: "Broking Operations",
    nbfc_ops: "NBFC Operations", aif_ops: "AIF Operations", institutional: "Institutional Equities",
    hr: "Human Resources", management: "Senior Management"
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Total: {users.length} users</p>
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
                {["Name", "Email", "Mobile", "Type", "Role", "Dept", "MFA", "Status", "Last Login", ""].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
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
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{DEPT_LABELS[u.department || ""] || u.department || "-"}</td>
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
            <div className="space-y-1.5"><Label>Full Name</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
            {!editUser && <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>}
            <div className="space-y-1.5"><Label>Password {editUser && "(leave blank to keep)"}</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} /></div>
            <div className="space-y-1.5">
              <Label>Mobile Number</Label>
              <Input value={form.mobile} onChange={e => setForm(f => ({...f, mobile: e.target.value}))} placeholder="+91 99999 99999" />
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
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({...f, role: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User (Read-Only)</SelectItem>
                  <SelectItem value="admin">Admin (Full Access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={form.department} onValueChange={v => setForm(f => ({...f, department: v}))}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{DEPT_LABELS[d]}</SelectItem>)}
                </SelectContent>
              </Select>
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

const CATEGORIES = [
  { key: "vendor", label: "Vendor" },
  { key: "business", label: "Business Unit" },
  { key: "app_category", label: "Application Category" },
  { key: "hosting", label: "Hosting Type" },
  { key: "criticality", label: "Criticality" },
  { key: "license_type", label: "License Type" },
  { key: "data_classification", label: "Data Classification" },
  { key: "priority", label: "Priority" },
  { key: "checklist_status", label: "Checklist Status" },
  { key: "checklist_category", label: "Checklist Category" },
  { key: "phase", label: "Roadmap Phase" },
  { key: "roadmap_status", label: "Roadmap Status" },
  { key: "retirement_reason", label: "Retirement Reason" },
  { key: "retirement_status", label: "Retirement Status" },
  { key: "migration_effort", label: "Migration Effort" },
  { key: "support_status", label: "Support Status" },
  { key: "ai_type", label: "AI Component Type" },
  { key: "risk_level", label: "Risk Level" },
  { key: "compliance_status", label: "Compliance Status" },
  { key: "department", label: "Department" },
];

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
      queryClient.invalidateQueries({ queryKey: ["masters"] });
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete "${item.label}"?`)) return;
    try {
      await apiFetch(`/masters/${item.id}`, { method: "DELETE" });
      toast({ title: "Deleted" });
      queryClient.invalidateQueries({ queryKey: ["masters"] });
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        {/* Category list */}
        <div className="w-52 shrink-0 space-y-1">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setSelectedCategory(c.key)}
              className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                selectedCategory === c.key ? "bg-primary/20 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {c.label}
              <span className="ml-1 text-xs opacity-60">
                ({(allMasters || []).filter(m => m.category === c.key).length})
              </span>
            </button>
          ))}
        </div>

        {/* Items table */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
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
                    <tr key={item.id} className="border-t border-border hover:bg-muted/30">
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
                      <td className="px-3 py-2 flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(item)}><Trash2 className="h-3 w-3" /></Button>
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
