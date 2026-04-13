import React, { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Shield, Plus, Trash2, ChevronDown, ChevronUp, Minus, Search, X } from "lucide-react";

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
const LEVEL_COLORS: Record<string, string> = { none: "text-muted-foreground", read: "text-blue-600 dark:text-blue-400", write: "text-[#d4a843]", admin: "text-red-600 dark:text-red-400" };
const LEVEL_BADGES: Record<string, string> = {
  none: "bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-300 dark:border-gray-600",
  read: "bg-blue-50 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600",
  write: "bg-yellow-50 dark:bg-yellow-400/10 text-yellow-700 dark:text-yellow-400 border-yellow-400",
  admin: "bg-red-50 dark:bg-red-400/10 text-red-600 dark:text-red-400 border-red-400",
};

interface AdminUser { id: number; name: string; email: string; role?: string; department?: string; designation?: string; employeeCode?: string; }
interface RoleModule { key: string; label: string; group: string; }
interface Role { id: number; name: string; description?: string; isSystem: boolean; defaultDashboard?: string; createdAt: string; permissions?: any[]; userCount?: number; }
interface RolePermission { id: number; roleId: number; module: string; accessLevel: string; }
interface UserRole { id: number; userId: number; roleId: number; userName?: string; userEmail?: string; userRole?: string; userDept?: string; userDesignation?: string; userEmpCode?: string; }

const USERS_PAGE_SIZE = 5;

export default function AdminRoles() {
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
  const [userSearchQ, setUserSearchQ] = useState("");
  const [selectedUserToAdd, setSelectedUserToAdd] = useState<AdminUser | null>(null);
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
      if (!seen.has(m.group)) { seen.add(m.group); groups.push({ name: m.group, modules: [] }); }
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

  const selectRole = (role: Role) => { setSelectedRole(role); setEditDefaultDashboard(role.defaultDashboard ?? "/"); };

  const saveRoleMeta = async () => {
    if (!selectedRole) return;
    setSavingMeta(true);
    try {
      await apiFetch(`/roles/${selectedRole.id}`, { method: "PATCH", body: JSON.stringify({ defaultDashboard: editDefaultDashboard }) });
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
    setPermissions(p => { const next = { ...p }; for (const m of grpMods) next[m.key] = level; return next; });
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
    if (!selectedRole || !selectedUserToAdd) return;
    try {
      await apiFetch(`/roles/${selectedRole.id}/users`, { method: "POST", body: JSON.stringify({ userId: selectedUserToAdd.id }) });
      toast({ title: `${selectedUserToAdd.name} assigned to role` });
      setSelectedUserToAdd(null);
      setUserSearchQ("");
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
  const searchedUsersToAdd = React.useMemo(() => {
    if (!userSearchQ.trim()) return usersNotInRole.slice(0, 8);
    const q = userSearchQ.toLowerCase();
    return usersNotInRole.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.department || "").toLowerCase().includes(q) ||
      (u.designation || "").toLowerCase().includes(q) ||
      (u.employeeCode || "").toLowerCase().includes(q)
    ).slice(0, 10);
  }, [usersNotInRole, userSearchQ]);
  const totalUserPages = Math.ceil(userRoles.length / USERS_PAGE_SIZE);
  const pagedUsers = userRoles.slice((usersPage - 1) * USERS_PAGE_SIZE, usersPage * USERS_PAGE_SIZE);

  const getPermSummary = (role: Role) => {
    const perms = role.permissions || [];
    if (perms.length === 0) return { label: "No Access", color: "text-muted-foreground" };
    const hasAdmin = perms.some(p => p.accessLevel === "admin");
    const hasWrite = perms.some(p => p.accessLevel === "write");
    if (hasAdmin) return { label: `${perms.length} modules`, color: "text-red-500" };
    if (hasWrite) return { label: `${perms.length} modules`, color: "text-[#d4a843]" };
    return { label: `${perms.length} modules`, color: "text-blue-500" };
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-[#d4a843]" />
            Roles &amp; Permissions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Control what each role can access across all {modules.length} modules</p>
        </div>
        <Button size="sm" onClick={() => setNewRoleOpen(true)} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">
          <Plus className="mr-1.5 h-3.5 w-3.5" />New Role
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
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
                      {role.description && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{role.description}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] font-medium ${summary.color}`}>{summary.label}</span>
                        {(role.userCount ?? 0) > 0 && <span className="text-[9px] text-muted-foreground">{role.userCount} user{(role.userCount ?? 0) > 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      {role.isSystem && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400 font-medium">system</span>}
                      {!role.isSystem && selectedRole?.id === role.id && (
                        <button onClick={e => { e.stopPropagation(); deleteRole(role); }} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {roles.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">No roles yet. Create one above.</div>}
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
                    <Button size="sm" className="h-7 text-xs bg-[#d4a843] hover:bg-[#c49b3a] text-white" onClick={savePermissions} disabled={saving}>{saving ? "Saving…" : "Save Permissions"}</Button>
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
                    <span className="text-[10px] text-muted-foreground">{userRoles.length} user{userRoles.length !== 1 ? "s" : ""} assigned</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Search + Add */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground font-medium">Add user to this role</p>
                    {selectedUserToAdd ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#d4a843]/40 bg-[#d4a843]/5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{selectedUserToAdd.name}</p>
                          <p className="text-[10px] text-muted-foreground">{selectedUserToAdd.email}{selectedUserToAdd.department ? ` · ${selectedUserToAdd.department}` : ""}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => { setSelectedUserToAdd(null); setUserSearchQ(""); }}>
                          <X className="h-3 w-3" />
                        </Button>
                        <Button size="sm" className="h-7 bg-[#d4a843] hover:bg-[#b8922e] text-white flex-shrink-0" onClick={addUserToRole}>
                          <Plus className="mr-1 h-3 w-3" />Add
                        </Button>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                              value={userSearchQ}
                              onChange={e => setUserSearchQ(e.target.value)}
                              placeholder="Search by name, email, code, dept, designation…"
                              className="w-full pl-8 pr-3 py-1.5 text-xs border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                        </div>
                        {(userSearchQ || true) && searchedUsersToAdd.length > 0 && (
                          <div className="mt-1.5 border border-border rounded-lg overflow-hidden divide-y divide-border/50 max-h-[240px] overflow-y-auto">
                            {searchedUsersToAdd.map(u => (
                              <button key={u.id} type="button"
                                className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
                                onClick={() => { setSelectedUserToAdd(u); setUserSearchQ(u.name); }}>
                                <div className="flex items-center justify-between">
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium">{u.name}</span>
                                    {u.employeeCode && <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">{u.employeeCode}</span>}
                                  </div>
                                  <Plus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 ml-2" />
                                </div>
                                <div className="flex gap-2 mt-0.5">
                                  <span className="text-[10px] text-muted-foreground">{u.email}</span>
                                  {u.designation && <span className="text-[10px] text-muted-foreground">· {u.designation}</span>}
                                  {u.department && <span className="text-[10px] text-muted-foreground">· {u.department}</span>}
                                </div>
                              </button>
                            ))}
                            {usersNotInRole.length === 0 && (
                              <div className="px-3 py-3 text-xs text-muted-foreground text-center">All users already have this role</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Assigned users list */}
                  {userRoles.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">No users assigned to this role yet.</p>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        {pagedUsers.map(ur => (
                          <div key={ur.id} className="flex items-start justify-between py-2 px-3 border border-border rounded-lg hover:bg-muted/20 transition-colors">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="text-sm font-medium">{ur.userName || `User #${ur.userId}`}</p>
                                {ur.userEmpCode && <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{ur.userEmpCode}</span>}
                                {ur.userRole && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground capitalize">{ur.userRole}</span>}
                              </div>
                              <div className="flex flex-wrap gap-x-3 mt-0.5">
                                {ur.userEmail && <p className="text-[10px] text-muted-foreground">{ur.userEmail}</p>}
                                {ur.userDesignation && <p className="text-[10px] text-muted-foreground">· {ur.userDesignation}</p>}
                                {ur.userDept && <p className="text-[10px] text-muted-foreground">· {ur.userDept}</p>}
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0 ml-2" onClick={() => setRemoveConfirm(ur)}>
                              <Minus className="h-3.5 w-3.5" />
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
              Are you sure you want to remove <strong>{removeConfirm?.userName || `User #${removeConfirm?.userId}`}</strong> from the <strong>{selectedRole?.name}</strong> role?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (removeConfirm) { removeUserFromRole(removeConfirm); setRemoveConfirm(null); } }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={newRoleOpen} onOpenChange={setNewRoleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Create New Role</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label className="text-xs">Role Name *</Label><Input className="h-8 text-sm" placeholder="e.g. Compliance Viewer" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Description</Label><Input className="h-8 text-sm" placeholder="Brief description of this role" value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewRoleOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={createRole} disabled={!newRoleName.trim()} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">Create Role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
