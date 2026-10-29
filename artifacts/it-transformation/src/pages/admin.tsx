import React, { useState, useEffect } from "react";
import { getRoleLabel, cn } from "@/lib/utils";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Settings, Users, Database, Plus, Pencil, Trash2, RefreshCw, Shield, Building2, Clock,
  ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Minus, Info, Search, Paperclip, X, Sliders,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { confirmDialog } from "@/components/confirm-dialog";

type Tab = "settings" | "masters" | "business-units" | "audit" | "itsm-config";

interface AdminUser {
  id: number; email: string; name: string; userType: string;
  role: string; department?: string; designation?: string; employeeCode?: string;
  mobile?: string; mfaEnabled: boolean;
  mfaMethod?: string; isActive: boolean; status: string;
  lastLoginAt?: string; createdAt: string;
}
interface AdminSettings {
  "uploads.allowedFileTypes"?: string[] | string;
  "uploads.maxSizeMB"?: number | string;
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
    if (t && ["settings", "masters", "business-units", "audit", "itsm-config"].includes(t)) {
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
          ["masters", Database, "Master Data"],
          ["business-units", Building2, "Business Units"],
          ["audit", Clock, "Audit Trail"],
          ["itsm-config", Paperclip, "ITSM Config"],
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
      {tab === "masters" && <MastersTab />}
      {tab === "business-units" && <BusinessUnitsTab />}
      {tab === "audit" && <AuditTrailTab />}
      {tab === "itsm-config" && <ItsmConfigTab />}
    </div>
  );
}

// ─── SETTINGS TAB ────────────────────────────────────────────────────────────

const UPLOAD_DEFAULT_TYPES = ["pdf", "xlsx", "xls", "csv", "docx", "doc", "pptx", "ppt", "txt", "jpg", "jpeg", "png", "msg", "eml", "zip"];
const UPLOAD_BLOCKED = ["exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "js", "mjs", "jar", "sh", "dll", "html", "htm", "xhtml", "svg", "php", "asp", "aspx", "hta", "lnk", "reg"];
function UploadPolicyCard({ settings, set }: { settings: AdminSettings; set: (k: keyof AdminSettings, v: unknown) => void }) {
  const raw = settings["uploads.allowedFileTypes"];
  const parse = (v: any): string[] => { let x = v; for (let i = 0; i < 3 && typeof x === "string"; i++) { try { x = JSON.parse(x); } catch { break; } } return (Array.isArray(x) ? x : String(x ?? "").split(/[,;\s]+/)).map((t: any) => String(t).trim().toLowerCase().replace(/^\*?\./, "")).filter(Boolean); };
  const types = raw === undefined ? UPLOAD_DEFAULT_TYPES : parse(raw);
  const [add, setAdd] = useState("");
  const blocked = (t: string) => UPLOAD_BLOCKED.includes(t);
  const addType = () => { const t = add.trim().toLowerCase().replace(/^\*?\./, "").replace(/[^a-z0-9]/g, ""); if (!t || types.includes(t)) { setAdd(""); return; } set("uploads.allowedFileTypes", [...types, t]); setAdd(""); };
  const max = settings["uploads.maxSizeMB"] ?? 20;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">File uploads</CardTitle><CardDescription>Applies to every file attached in IT Hub: audit evidence, circulars and policies, ITSM attachments, retirement documents and profile photos. Programs and scripts (.exe, .js, .html, .svg …) are always refused.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Allowed file types</Label>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {types.map(t => <span key={t} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", blocked(t) ? "border-red-400 text-red-600 line-through" : "bg-accent")}>.{t}
              <button type="button" className="text-muted-foreground hover:text-red-600" onClick={() => set("uploads.allowedFileTypes", types.filter(x => x !== t))}>×</button></span>)}
          </div>
          <div className="flex gap-2 mt-2"><Input className="h-8 w-40" placeholder="e.g. .jpeg" value={add} onChange={e => setAdd(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addType(); } }} /><Button type="button" size="sm" variant="outline" className="h-8" onClick={addType}>Add</Button>
            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => set("uploads.allowedFileTypes", UPLOAD_DEFAULT_TYPES)}>Reset to defaults</Button></div>
          {types.some(blocked) && <p className="text-[11px] text-red-600 mt-1">Struck-out types are always blocked for security and will not be accepted.</p>}
        </div>
        <div className="flex items-center gap-3"><Label className="w-40">Maximum file size (MB)</Label><Input type="number" min={1} max={100} className="h-8 w-28" value={String(max)} onChange={e => set("uploads.maxSizeMB", e.target.value === "" ? "" : Number(e.target.value))} /><span className="text-[11px] text-muted-foreground">The server's own limit (UPLOAD_MAX_MB, default 25) still applies.</span></div>
        <p className="text-[11px] text-muted-foreground">Click "Save Settings" at the bottom to apply.</p>
      </CardContent>
    </Card>
  );
}

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

      {/* File uploads */}
      <UploadPolicyCard settings={settings} set={set} />

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
              <Button type="button" variant="outline" size="sm" onClick={() => {
                const a = document.createElement("a");
                a.href = value;
                const ext = value.startsWith("data:image/png") ? "png" : value.startsWith("data:image/svg") ? "svg" : "jpg";
                a.download = `ashika-logo.${ext}`;
                a.click();
              }}>
                Download Logo
              </Button>
            )}
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
  const [userPage, setUserPage] = useState(1);
  const USER_PAGE_SIZE = 10;
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
    if (!await confirmDialog(`Delete user ${u.name}?`)) return;
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

  useEffect(() => { setUserPage(1); }, [searchQ, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedFilteredUsers.length / USER_PAGE_SIZE));
  const pagedUsers = sortedFilteredUsers.slice((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE);

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
          <p className="text-xs text-muted-foreground whitespace-nowrap">{sortedFilteredUsers.length} / {users.length} users</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Add User</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
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
              {pagedUsers.map(u => (
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
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Showing {((userPage - 1) * USER_PAGE_SIZE) + 1}–{Math.min(userPage * USER_PAGE_SIZE, sortedFilteredUsers.length)} of {sortedFilteredUsers.length} users
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="sm" className="h-7 px-2 text-xs"
                disabled={userPage === 1}
                onClick={() => setUserPage(p => Math.max(1, p - 1))}
              >
                ← Prev
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - userPage) <= 1)
                .reduce((acc: (number | string)[], p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                  acc.push(p); return acc;
                }, [])
                .map((p, idx) =>
                  typeof p === "string" ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === userPage ? "default" : "outline"}
                      size="sm"
                      className={`h-7 w-7 p-0 text-xs ${p === userPage ? "bg-[#2D7FF9] hover:bg-[#1B63D6] text-white border-[#2D7FF9]" : ""}`}
                      onClick={() => setUserPage(p as number)}
                    >
                      {p}
                    </Button>
                  )
                )}
              <Button
                variant="outline" size="sm" className="h-7 px-2 text-xs"
                disabled={userPage === totalPages}
                onClick={() => setUserPage(p => Math.min(totalPages, p + 1))}
              >
                Next →
              </Button>
            </div>
          </div>
        )}
        </>
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
    { key: "asset_location", label: "Asset Location" },
    { key: "asset_os", label: "Operating System" },
    { key: "asset_contract_type", label: "Contract Type" },
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
    if (!await confirmDialog(`Delete "${item.label}"?`)) return;
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

const ENTITY_TYPES = [
  { value: "all", label: "All Entities" },
  { value: "asset", label: "Asset Registry" },
  { value: "asset_allocation", label: "Asset Allocation" },
  { value: "asset_license", label: "Asset License" },
  { value: "maintenance", label: "Maintenance" },
  { value: "asset_vendor", label: "Asset Vendor" },
  { value: "incident", label: "ITSM Incident" },
  { value: "problem", label: "ITSM Problem" },
  { value: "change", label: "ITSM Change" },
  { value: "service_request", label: "Service Request" },
  { value: "application", label: "Application" },
  { value: "roadmap", label: "Roadmap" },
  { value: "checklist", label: "Checklist" },
  { value: "kpi", label: "KPI" },
  { value: "user", label: "User" },
];

function AuditTrailTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [days, setDays] = useState("90");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25", days });
      if (entityType !== "all") params.set("entityType", entityType);
      if (searchQ.trim()) params.set("search", searchQ.trim());
      const result = await apiFetch<{ logs: AuditLog[]; hasMore: boolean }>(`/audit-logs?${params}`);
      setLogs(result.logs);
      setHasMore(result.hasMore);
    } catch { setLogs([]); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, [entityType, page, days, searchQ]);

  const handleSearch = () => { setSearchQ(searchInput); setPage(1); };

  const auditRecordId = (id: number) => `AUD-${String(id).padStart(6, "0")}`;

  const actionBadge = (action: string) => {
    const map: Record<string, string> = {
      create: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10",
      update: "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10",
      delete: "border-red-500/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10",
      import: "border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-400/10",
      allocate: "border-orange-500/30 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-400/10",
      return: "border-gray-500/30 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-400/10",
    };
    return map[action] || "border-border text-muted-foreground";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Audit Trail</h2>
          <p className="text-xs text-muted-foreground">Complete change history with record IDs — all data modifications are tracked</p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchLogs}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            placeholder="Search summary, user, entity…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={handleSearch}>Search</Button>
        <Select value={entityType} onValueChange={v => { setEntityType(v); setPage(1); }}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={days} onValueChange={v => { setDays(v); setPage(1); }}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
            <SelectItem value="365">Last 1 year</SelectItem>
          </SelectContent>
        </Select>
        {(searchQ || entityType !== "all") && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setSearchQ(""); setSearchInput(""); setEntityType("all"); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          No audit records found. Try adjusting your filters.
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
          {logs.map(log => (
            <div key={log.id} className="hover:bg-muted/10 transition-colors">
              {/* Row 1: Meta info */}
              <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-1">
                <span className="font-mono text-[10px] font-semibold text-[#1B63D6] bg-[#2D7FF9]/10 px-1.5 py-0.5 rounded flex-shrink-0">
                  {auditRecordId(log.id)}
                </span>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(log.performedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
                <Badge variant="outline" className="text-[10px] capitalize">{log.entityType.replace(/_/g, " ")}</Badge>
                <Badge variant="outline" className={`text-[10px] capitalize border ${actionBadge(log.action)}`}>{log.action}</Badge>
                {log.performedBy && (
                  <span className="text-[11px] text-muted-foreground ml-auto truncate max-w-[220px]" title={log.performedBy}>
                    by {log.performedBy}
                  </span>
                )}
                {log.newValues && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                    {expandedId === log.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                )}
              </div>
              {/* Row 2: Summary */}
              {log.summary && (
                <p className="px-4 pb-3 text-xs text-foreground/80 leading-relaxed">
                  {log.summary}
                </p>
              )}
              {/* Expanded diff */}
              {expandedId === log.id && (
                <div className="px-4 pb-3 border-t border-border/50 mt-1 pt-3 bg-muted/10">
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">Page {page} · {logs.length} records shown</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

// ─── ROLES TAB ────────────────────────────────────────────────────────────────

interface RoleModule { key: string; label: string; group: string; }

const DASHBOARD_ROUTES = [
  { value: "/", label: "Executive Dashboard" },
  { value: "/checklist", label: "IT Master Checklist" },
  { value: "/roadmap", label: "Transformation Roadmap" },
  { value: "/retirements", label: "App Retirement Plan" },
  { value: "/applications", label: "Application Inventory" },
  { value: "/aibom", label: "AI Bill of Materials" },
  { value: "/sbom", label: "Software BOM" },
  { value: "/assets", label: "IT Asset Management" },
  { value: "/asset-registry", label: "Asset Registry" },
  { value: "/asset-vendors", label: "Asset Vendors" },
  { value: "/asset-licenses", label: "Asset Licenses" },
  { value: "/asset-allocations", label: "Asset Allocations" },
  { value: "/itsm", label: "ITSM Dashboard" },
  { value: "/itsm-incidents", label: "ITSM Incidents" },
  { value: "/itsm-problems", label: "ITSM Problems" },
  { value: "/itsm-changes", label: "ITSM Changes" },
  { value: "/itsm-kb", label: "ITSM Knowledge Base" },
  { value: "/itsm-sla", label: "ITSM SLA Policies" },
  { value: "/itsm-requests", label: "ITSM Service Requests" },
  { value: "/kpis", label: "KPI Management" },
  { value: "/kpi-dashboard", label: "KPI Dashboard" },
  { value: "/reports", label: "PPT Reports" },
  { value: "/admin", label: "Admin Panel" },
];

const ACCESS_LEVELS = ["none", "read", "write", "admin"] as const;
const LEVEL_COLORS: Record<string, string> = { none: "text-muted-foreground", read: "text-blue-600 dark:text-blue-400", write: "text-[#2D7FF9]", admin: "text-red-600 dark:text-red-400" };
const LEVEL_BADGES: Record<string, string> = {
  none: "bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-300 dark:border-gray-600",
  read: "bg-blue-50 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600",
  write: "bg-yellow-50 dark:bg-yellow-400/10 text-yellow-700 dark:text-yellow-400 border-yellow-400",
  admin: "bg-red-50 dark:bg-red-400/10 text-red-600 dark:text-red-400 border-red-400",
};

interface Role { id: number; name: string; description?: string; isSystem: boolean; defaultDashboard?: string; createdAt: string; permissions?: any[]; userCount?: number; }
interface RolePermission { id: number; roleId: number; module: string; accessLevel: string; }
interface UserRole { id: number; userId: number; roleId: number; userName?: string; userEmail?: string; }

const USERS_PAGE_SIZE = 5;

function RolesTab() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Record<string, string>>({});
  const [modules, setModules] = useState<RoleModule[]>([]);
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [usersPage, setUsersPage] = useState(1);
  const [removeConfirm, setRemoveConfirm] = useState<UserRole | null>(null);

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  };

  const moduleGroups = React.useMemo(() => {
    const groups: { name: string; modules: RoleModule[] }[] = [];
    const seen = new Set<string>();
    for (const m of modules) {
      if (!seen.has(m.group)) {
        seen.add(m.group);
        groups.push({ name: m.group, modules: [] });
      }
      groups.find(g => g.name === m.group)!.modules.push(m);
    }
    return groups;
  }, [modules]);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const [data, mods] = await Promise.all([
        apiFetch<Role[]>("/roles"),
        apiFetch<RoleModule[]>("/roles/modules"),
      ]);
      setRoles(data);
      setModules(mods);
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
      for (const m of modules) pm[m.key] = "none";
      for (const p of perms) pm[p.module] = p.accessLevel;
      setPermissions(pm);
      setUserRoles(urs);
      setAllUsers(users);
      setUsersPage(1);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  useEffect(() => { loadRoles(); }, []);
  useEffect(() => { if (selectedRole && modules.length > 0) loadRoleDetails(selectedRole); }, [selectedRole, modules]);

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
      await loadRoles();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const setGroupPermission = (group: string, level: string) => {
    const grpMods = modules.filter(m => m.group === group);
    setPermissions(p => {
      const next = { ...p };
      for (const m of grpMods) next[m.key] = level;
      return next;
    });
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
    if (!await confirmDialog(`Delete role "${role.name}"?`)) return;
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
      loadRoles();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const removeUserFromRole = async (ur: UserRole) => {
    if (!selectedRole) return;
    try {
      await apiFetch(`/roles/${selectedRole.id}/users/${ur.userId}`, { method: "DELETE" });
      toast({ title: "User removed from role" });
      loadRoleDetails(selectedRole);
      loadRoles();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const usersNotInRole = allUsers.filter(u => !userRoles.some(ur => ur.userId === u.id));
  const totalUserPages = Math.ceil(userRoles.length / USERS_PAGE_SIZE);
  const pagedUsers = userRoles.slice((usersPage - 1) * USERS_PAGE_SIZE, usersPage * USERS_PAGE_SIZE);

  const getPermSummary = (role: Role) => {
    const perms = role.permissions || [];
    if (perms.length === 0) return { label: "No Access", color: "text-muted-foreground" };
    const hasAdmin = perms.some(p => p.accessLevel === "admin");
    const hasWrite = perms.some(p => p.accessLevel === "write");
    if (hasAdmin) return { label: `${perms.length} modules`, color: "text-red-500" };
    if (hasWrite) return { label: `${perms.length} modules`, color: "text-[#2D7FF9]" };
    return { label: `${perms.length} modules`, color: "text-blue-500" };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Roles &amp; Permissions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Control what each role can access across all {modules.length} modules.</p>
        </div>
        <Button size="sm" onClick={() => setNewRoleOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5"/>New Role</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full"/>)}</div>
      ) : (
        <div className="grid grid-cols-[240px_1fr] gap-4">
          {/* Role list */}
          <div className="border border-border rounded-lg overflow-hidden">
            {roles.map(role => {
              const summary = getPermSummary(role);
              return (
                <button key={role.id} onClick={() => selectRole(role)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/50 last:border-b-0 transition-colors ${selectedRole?.id === role.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/30"}`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{role.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {role.description && <p className="text-[10px] text-muted-foreground truncate">{role.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] font-medium ${summary.color}`}>{summary.label}</span>
                        {(role.userCount ?? 0) > 0 && <span className="text-[9px] text-muted-foreground">{role.userCount} user{(role.userCount ?? 0) > 1 ? "s" : ""}</span>}
                      </div>
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
              );
            })}
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
                    <Select value={editDefaultDashboard} onValueChange={setEditDefaultDashboard}>
                      <SelectTrigger className="h-8 text-xs w-[260px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DASHBOARD_ROUTES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{selectedRole.name} — Permissions Matrix</CardTitle>
                    <Button size="sm" className="h-7 text-xs bg-[#2D7FF9] hover:bg-[#1B63D6] text-white" onClick={savePermissions} disabled={saving}>{saving ? "Saving…" : "Save Permissions"}</Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[420px] overflow-y-auto relative">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-background">
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2 text-xs font-semibold bg-muted/30">Module</th>
                        {ACCESS_LEVELS.map(l => (
                          <th key={l} className="text-center px-3 py-2 text-xs font-semibold capitalize w-[80px] bg-muted/30">
                            <span className={LEVEL_COLORS[l]}>{l}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {moduleGroups.map(group => {
                        const isCollapsed = collapsedGroups.has(group.name);
                        const groupPerms = group.modules.map(m => permissions[m.key] || "none");
                        const allSame = groupPerms.every(p => p === groupPerms[0]);
                        const groupLevel = allSame ? groupPerms[0] : "mixed";
                        return (
                          <React.Fragment key={group.name}>
                            <tr className="border-b border-border bg-muted/20 cursor-pointer hover:bg-muted/40" onClick={() => toggleGroup(group.name)}>
                              <td className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                {isCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                                {group.name}
                                <span className="text-[9px] font-normal ml-1">({group.modules.length})</span>
                              </td>
                              {ACCESS_LEVELS.map(l => (
                                <td key={l} className="text-center px-3 py-2">
                                  <button
                                    onClick={e => { e.stopPropagation(); setGroupPermission(group.name, l); }}
                                    className={`w-3.5 h-3.5 rounded-full border-2 inline-block transition-colors ${groupLevel === l ? "border-primary bg-primary" : "border-muted-foreground/30 hover:border-primary/50"}`}
                                    title={`Set all ${group.name} to ${l}`}
                                  />
                                </td>
                              ))}
                            </tr>
                            {!isCollapsed && group.modules.map(mod => (
                              <tr key={mod.key} className="border-b border-border/30 hover:bg-muted/10">
                                <td className="px-4 py-2 text-xs pl-9">{mod.label}</td>
                                {ACCESS_LEVELS.map(level => (
                                  <td key={level} className="text-center px-3 py-2">
                                    <input
                                      type="radio"
                                      name={`perm-${mod.key}`}
                                      checked={permissions[mod.key] === level}
                                      onChange={() => setPermissions(p => ({ ...p, [mod.key]: level }))}
                                      className="w-3.5 h-3.5 cursor-pointer accent-primary"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                  <div className="flex items-center gap-4 px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground flex-wrap">
                    {ACCESS_LEVELS.map(l => (
                      <span key={l} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${LEVEL_BADGES[l]}`}>
                        <strong className="capitalize">{l}</strong>
                        {l === "none" ? " — no access" : l === "read" ? " — view only" : l === "write" ? " — create & edit" : " — full control"}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Users with this Role</CardTitle>
                    <span className="text-[10px] text-muted-foreground">{userRoles.length} user{userRoles.length !== 1 ? "s" : ""}</span>
                  </div>
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
                    <>
                      <div className="space-y-1.5">
                        {pagedUsers.map(ur => (
                          <div key={ur.id} className="flex items-center justify-between py-1.5 px-3 border border-border rounded-lg">
                            <div>
                              <p className="text-sm font-medium">{ur.userName || `User #${ur.userId}`}</p>
                              {ur.userEmail && <p className="text-[10px] text-muted-foreground">{ur.userEmail}</p>}
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setRemoveConfirm(ur)}>
                              <Minus className="h-3.5 w-3.5"/>
                            </Button>
                          </div>
                        ))}
                      </div>
                      {totalUserPages > 1 && (
                        <div className="flex items-center justify-between pt-2 border-t border-border/50">
                          <span className="text-[10px] text-muted-foreground">
                            {(usersPage - 1) * USERS_PAGE_SIZE + 1}–{Math.min(usersPage * USERS_PAGE_SIZE, userRoles.length)} of {userRoles.length}
                          </span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={usersPage === 1} onClick={() => setUsersPage(p => p - 1)}>
                              <ChevronDown className="h-3 w-3 rotate-90" />
                            </Button>
                            {Array.from({ length: totalUserPages }, (_, i) => (
                              <Button key={i + 1} variant={usersPage === i + 1 ? "default" : "ghost"} size="icon" className="h-6 w-6 text-[10px]" onClick={() => setUsersPage(i + 1)}>
                                {i + 1}
                              </Button>
                            ))}
                            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={usersPage === totalUserPages} onClick={() => setUsersPage(p => p + 1)}>
                              <ChevronDown className="h-3 w-3 -rotate-90" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
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

      <AlertDialog open={!!removeConfirm} onOpenChange={open => { if (!open) setRemoveConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User from Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{removeConfirm?.userName || `User #${removeConfirm?.userId}`}</strong> from the <strong>{selectedRole?.name}</strong> role? This will revoke all permissions granted by this role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (removeConfirm) { removeUserFromRole(removeConfirm); setRemoveConfirm(null); } }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

// ─── ITSM CONFIG TAB ────────────────────────────────────────────────────────

const ALL_FILE_TYPES = ["pdf", "xlsx", "xls", "docx", "doc", "png", "jpg", "jpeg", "zip", "csv", "txt", "pptx", "ppt", "msg"];

interface ItsmFullConfig {
  "itsm.urgencyLevels": string[];
  "itsm.impactLevels": string[];
  "itsm.incidentSources": string[];
  "itsm.incidentCategories": string[];
  "itsm.incidentSubcategories": Record<string, string[]>;
  "itsm.problemCategories": string[];
  "itsm.changeCategories": string[];
  "itsm.srCategories": string[];
  "itsm.departments": string[];
  "itsm.itGroups": string[];
  "itsm.maxAttachmentSizeMB": number | string;
  "itsm.maxAttachmentsPerTicket": number | string;
  "itsm.allowedFileTypes": string[];
}

const ITSM_DEFAULTS: ItsmFullConfig = {
  "itsm.urgencyLevels": ["Critical", "High", "Medium", "Low"],
  "itsm.impactLevels": ["Enterprise-wide", "Department", "Team", "Individual"],
  "itsm.incidentSources": ["Phone", "Email", "Self-Service Portal", "Walk-in", "Monitoring Alert", "Teams / Chat", "API / Integration", "Other"],
  "itsm.incidentCategories": ["Application", "Infrastructure", "Network", "Hardware", "Security", "Database", "Cloud", "End-User", "Operations", "Service Request"],
  "itsm.incidentSubcategories": {
    "Application": ["Performance", "Error / Exception", "Access Denied", "Data Issue", "Integration Failure", "Feature Request"],
    "Infrastructure": ["Server Down", "Disk Space", "CPU / Memory", "Backup Failure", "VM / Container Issue", "Storage"],
    "Network": ["Connectivity", "DNS", "VPN", "Firewall", "WiFi", "Bandwidth"],
    "Hardware": ["Printer", "Laptop / Desktop", "Monitor", "Peripherals", "Battery / Power", "Other"],
    "Security": ["Phishing", "Malware", "Unauthorized Access", "Data Leak", "Vulnerability", "MFA Issue"],
    "Database": ["Slow Query", "Connection Failure", "Corruption", "Backup", "Replication Lag"],
    "Cloud": ["Instance Down", "Storage", "Permissions", "Auto-scaling", "Cost Alert"],
    "End-User": ["Outlook / Email", "Teams", "SharePoint", "Printing", "VPN", "Account Lock"],
    "Operations": ["Scheduled Job", "Maintenance", "Deployment", "Monitoring Alert"],
    "Service Request": ["Account", "Software", "Hardware", "Access", "Other"],
  },
  "itsm.problemCategories": ["Application", "Infrastructure", "Network", "Hardware", "Security", "Process", "Database", "Cloud", "Operations"],
  "itsm.changeCategories": ["Software", "Hardware", "Network", "Security", "Process", "Infrastructure", "Database", "Cloud", "End-User"],
  "itsm.srCategories": ["Access Request", "Software Install", "Hardware Request", "Account Setup", "Password Reset", "VPN Access", "Email Setup", "Mobile Device", "Printer Setup", "Data Export / Report", "New Joinee Onboarding", "Offboarding / Exit", "Other"],
  "itsm.departments": ["IT", "Finance", "HR", "Operations", "Sales", "Marketing", "Legal", "Admin", "Executive"],
  "itsm.itGroups": ["IT Helpdesk", "Infrastructure Team", "Network Team", "Security Team", "Applications Team", "Database Team", "Cloud Team", "Desktop Support", "Development Team", "Operations Team"],
  "itsm.maxAttachmentSizeMB": 20,
  "itsm.maxAttachmentsPerTicket": 10,
  "itsm.allowedFileTypes": ["pdf", "xlsx", "xls", "docx", "doc", "png", "jpg", "jpeg", "zip", "csv", "txt", "pptx", "ppt", "msg"],
};

function ListEditor({ label, description, items, onChange }: {
  label: string; description?: string;
  items: string[]; onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || items.includes(v)) { setDraft(""); return; }
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs font-semibold">{label}</Label>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-md border bg-muted/30">
        {items.length === 0 && <span className="text-xs text-muted-foreground italic">No items — add below</span>}
        {items.map(item => (
          <span key={item} className="inline-flex items-center gap-1 bg-background border rounded-full px-2.5 py-0.5 text-xs font-medium">
            {item}
            <button
              onClick={() => onChange(items.filter(i => i !== item))}
              className="text-muted-foreground hover:text-destructive ml-0.5 leading-none"
              title="Remove"
            >×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={`Add new ${label.toLowerCase()} value…`}
          className="h-8 text-xs flex-1"
        />
        <Button size="sm" variant="outline" onClick={add} className="h-8 px-3 text-xs">Add</Button>
      </div>
    </div>
  );
}

function SubcategoryEditor({ categories, subcategories, onChange }: {
  categories: string[];
  subcategories: Record<string, string[]>;
  onChange: (v: Record<string, string[]>) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const addSub = (cat: string) => {
    const v = draft.trim();
    if (!v) return;
    const existing = subcategories[cat] || [];
    if (existing.includes(v)) { setDraft(""); return; }
    onChange({ ...subcategories, [cat]: [...existing, v] });
    setDraft("");
  };

  const removeSub = (cat: string, sub: string) => {
    const existing = subcategories[cat] || [];
    onChange({ ...subcategories, [cat]: existing.filter(s => s !== sub) });
  };

  return (
    <div className="space-y-1">
      {categories.map(cat => (
        <div key={cat} className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors text-left"
            onClick={() => setExpanded(exp => exp === cat ? null : cat)}
          >
            <span className="flex items-center gap-2">
              {cat}
              <span className="text-[10px] text-muted-foreground font-normal">
                {(subcategories[cat] || []).length} subcategories
              </span>
            </span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded === cat ? "rotate-180" : ""}`} />
          </button>
          {expanded === cat && (
            <div className="px-3 pb-3 pt-1 border-t bg-muted/20 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {(subcategories[cat] || []).length === 0 && (
                  <span className="text-xs text-muted-foreground italic">No subcategories yet</span>
                )}
                {(subcategories[cat] || []).map(sub => (
                  <span key={sub} className="inline-flex items-center gap-1 bg-background border rounded-full px-2.5 py-0.5 text-xs">
                    {sub}
                    <button
                      onClick={() => removeSub(cat, sub)}
                      className="text-muted-foreground hover:text-destructive ml-0.5 leading-none"
                    >×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={expanded === cat ? draft : ""}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSub(cat); } }}
                  placeholder="Add subcategory…"
                  className="h-7 text-xs flex-1"
                />
                <Button size="sm" variant="outline" onClick={() => addSub(cat)} className="h-7 px-2 text-xs">Add</Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ItsmConfigTab() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<ItsmFullConfig>(ITSM_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    apiFetch<ItsmFullConfig>("/itsm-config")
      .then(data => setCfg({ ...ITSM_DEFAULTS, ...data }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof ItsmFullConfig>(key: K, value: ItsmFullConfig[K]) =>
    setCfg(c => ({ ...c, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/itsm-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      queryClient.invalidateQueries({ queryKey: ["itsm-config"] });
      toast({ title: "ITSM configuration saved", description: "All lookup lists have been updated." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSeedMatrix = async () => {
    setSeeding(true);
    try {
      const r = await apiFetch<{ ok: boolean; message: string }>("/admin/seed-itsm-approval-matrix", { method: "POST" });
      toast({ title: r.message });
    } catch {
      toast({ title: "Seeding failed", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const handleMigrateAttachments = async () => {
    setMigrating(true);
    try {
      const r = await apiFetch<{ ok: boolean; message: string }>("/admin/migrate-itsm-attachments", { method: "POST" });
      toast({ title: r.message });
    } catch {
      toast({ title: "Migration failed", variant: "destructive" });
    } finally {
      setMigrating(false);
    }
  };

  if (loading) return <div className="text-muted-foreground text-sm py-8">Loading ITSM configuration…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ── Save Banner ── */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-medium">ITSM Lookup Configuration</p>
          <p className="text-[11px] text-muted-foreground">All dropdown lists used in Incident, Problem, Change, and Service Request forms are managed here.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white shrink-0">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          {saving ? "Saving…" : "Save All Changes"}
        </Button>
      </div>

      {/* ── Shared Lookup Lists ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />Shared Lookup Lists
          </CardTitle>
          <CardDescription>These lists are used across multiple ticket types.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ListEditor
            label="Urgency Levels"
            description="Used in Incidents and Service Requests."
            items={cfg["itsm.urgencyLevels"]}
            onChange={v => set("itsm.urgencyLevels", v)}
          />
          <ListEditor
            label="Impact Levels"
            description="Used in Incidents and Problems."
            items={cfg["itsm.impactLevels"]}
            onChange={v => set("itsm.impactLevels", v)}
          />
          <ListEditor
            label="Departments"
            description="Used in Service Requests."
            items={cfg["itsm.departments"]}
            onChange={v => set("itsm.departments", v)}
          />
          <ListEditor
            label="IT Groups"
            description="Assignable groups for all ticket types (Assigned Group dropdown)."
            items={cfg["itsm.itGroups"]}
            onChange={v => set("itsm.itGroups", v)}
          />
          <ListEditor
            label="Incident Sources"
            description="How an incident was reported (Phone, Email, Portal, etc.)."
            items={cfg["itsm.incidentSources"]}
            onChange={v => set("itsm.incidentSources", v)}
          />
        </CardContent>
      </Card>

      {/* ── Category Lists ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sliders className="h-4 w-4" />Category Lists
          </CardTitle>
          <CardDescription>Each ticket type has its own category list.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ListEditor
            label="Incident Categories"
            description="Used in the Incidents form. Each category can have subcategories (see below)."
            items={cfg["itsm.incidentCategories"]}
            onChange={v => set("itsm.incidentCategories", v)}
          />
          <ListEditor
            label="Problem Categories"
            description="Used in the Problems form."
            items={cfg["itsm.problemCategories"]}
            onChange={v => set("itsm.problemCategories", v)}
          />
          <ListEditor
            label="Change Categories"
            description="Used in the Change Requests form."
            items={cfg["itsm.changeCategories"]}
            onChange={v => set("itsm.changeCategories", v)}
          />
          <ListEditor
            label="Service Request Categories"
            description="Used in the Service Requests form."
            items={cfg["itsm.srCategories"]}
            onChange={v => set("itsm.srCategories", v)}
          />
        </CardContent>
      </Card>

      {/* ── Incident Subcategories ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ChevronDown className="h-4 w-4" />Incident Subcategories
          </CardTitle>
          <CardDescription>
            Subcategories appear when an incident category is selected. Click a category to expand and edit its subcategories.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubcategoryEditor
            categories={cfg["itsm.incidentCategories"]}
            subcategories={cfg["itsm.incidentSubcategories"]}
            onChange={v => set("itsm.incidentSubcategories", v)}
          />
        </CardContent>
      </Card>

      {/* ── Attachment Settings ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Paperclip className="h-4 w-4" />Ticket Attachment Settings</CardTitle>
          <CardDescription>Control file uploads allowed on ITSM tickets (Incidents, Problems, Changes, Service Requests).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Max File Size (MB)</Label>
              <Input
                type="number" min="1" max="100"
                value={cfg["itsm.maxAttachmentSizeMB"]}
                onChange={e => set("itsm.maxAttachmentSizeMB", e.target.value)}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">Maximum size per individual file (1–100 MB)</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max Files Per Ticket</Label>
              <Input
                type="number" min="1" max="20"
                value={cfg["itsm.maxAttachmentsPerTicket"]}
                onChange={e => set("itsm.maxAttachmentsPerTicket", e.target.value)}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">Maximum attachments allowed per ticket (1–20)</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Allowed File Types</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_FILE_TYPES.map(t => {
                const active = (cfg["itsm.allowedFileTypes"] as string[]).includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => set("itsm.allowedFileTypes", active
                      ? (cfg["itsm.allowedFileTypes"] as string[]).filter(x => x !== t)
                      : [...(cfg["itsm.allowedFileTypes"] as string[]), t])}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:border-primary"
                    }`}
                  >
                    {active && <CheckCircle2 className="h-3 w-3" />}
                    .{t}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Selected: {(cfg["itsm.allowedFileTypes"] as string[]).length > 0
                ? (cfg["itsm.allowedFileTypes"] as string[]).map(t => `.${t}`).join(", ")
                : "None"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Production Setup ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Production Database Setup</CardTitle>
          <CardDescription>One-time operations to initialise ITSM data in the production database.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Approval Matrix Rules</div>
              <div className="text-xs text-muted-foreground">Seeds the 11 default approval workflow rules (Incident, Problem, Change Request, Service Request). Skips if already seeded.</div>
            </div>
            <Button size="sm" variant="outline" onClick={handleSeedMatrix} disabled={seeding}>
              {seeding ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Seed Rules"}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Attachment Table Migration</div>
              <div className="text-xs text-muted-foreground">Creates the itsm_attachments table in production if it does not exist (safe, idempotent).</div>
            </div>
            <Button size="sm" variant="outline" onClick={handleMigrateAttachments} disabled={migrating}>
              {migrating ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Run Migration"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
