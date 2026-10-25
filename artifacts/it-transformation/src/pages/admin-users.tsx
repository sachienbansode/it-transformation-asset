import React, { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { getRoleLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Plus, Pencil, Trash2, RefreshCw, Search, UserCheck, UserX, Shield, KeyRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { confirmDialog } from "@/components/confirm-dialog";

interface AdminUser {
  id: number; email: string; name: string; userType: string;
  role: string; department: string; designation?: string; employeeCode?: string;
  mobile?: string; mfaEnabled: boolean; status?: string; isActive: boolean; lastLoginAt?: string;
}
interface DeptMaster { key: string; label: string; sortOrder: number; }

const ROLE_OPTIONS = [
  { value: "user", label: "User (Read-Only)" },
  { value: "admin", label: "Admin (Full Access)" },
  { value: "cxo", label: "CXO (Dept KPIs)" },
  { value: "kpi_employee", label: "Employee (Own KPI set)" },
  { value: "hr", label: "HR (KPI module only)" },
];

const ROLE_BADGE: Record<string, string> = {
  admin: "border-yellow-500/40 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-400/10",
  cxo: "border-violet-500/40 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-400/10",
  hr: "border-pink-500/40 text-pink-700 dark:text-pink-400 bg-pink-50 dark:bg-pink-400/10",
  user: "border-gray-400/40 text-gray-600 dark:text-gray-400",
  kpi_employee: "border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10",
};

export default function AdminUsers() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortCol, setSortCol] = useState<"name" | "department" | "role" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [userPage, setUserPage] = useState(1);
  const USER_PAGE_SIZE = 12;
  const [form, setForm] = useState({
    name: "", email: "", password: "", userType: "internal", role: "user",
    department: "", designation: "", employeeCode: "", mobile: "", status: "active", isActive: true,
  });
  const [deptMasters, setDeptMasters] = useState<DeptMaster[]>([]);
  // Access roles (Roles & Permissions) — these decide what the person can open in IT Hub, e.g. IT Asset Admin
  const [accessRoles, setAccessRoles] = useState<{ id: number; name: string; description?: string; permissions: { module: string; accessLevel: string }[] }[]>([]);
  const [moduleLabels, setModuleLabels] = useState<Record<string, { label: string; group: string }>>({});
  const [roleIds, setRoleIds] = useState<number[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [data, depts, roles] = await Promise.all([
        apiFetch<AdminUser[]>("/admin/users"),
        apiFetch<DeptMaster[]>("/masters?category=department&active=true"),
        apiFetch<any[]>("/roles").catch(() => []),
      ]);
      apiFetch<any[]>("/roles/modules").then(ms => setModuleLabels(Object.fromEntries(ms.map((m: any) => [m.key, { label: m.label, group: m.group }])))).catch(() => {});
      setAccessRoles(roles.map((r: any) => ({ id: r.id, name: r.name, description: r.description, permissions: r.permissions || [] })).sort((a: any, b: any) => (b.name.startsWith("IT Asset") ? 1 : 0) - (a.name.startsWith("IT Asset") ? 1 : 0) || a.name.localeCompare(b.name)));
      setUsers(data);
      setDeptMasters(depts.sort((a, b) => a.sortOrder - b.sortOrder));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditUser(null);
    setForm({ name: "", email: "", password: "", userType: "internal", role: "user", department: "", designation: "", employeeCode: "", mobile: "", status: "active", isActive: true });
    setRoleIds([]);
    setModalOpen(true);
  };

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: "", userType: u.userType, role: u.role, department: u.department || "", designation: u.designation || "", employeeCode: u.employeeCode || "", mobile: u.mobile || "", status: u.status || "active", isActive: u.isActive });
    setRoleIds([]);
    apiFetch<number[]>(`/user-roles/${u.id}`).then(setRoleIds).catch(() => {});
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    try {
      if (editUser) {
        if (!form.employeeCode.trim()) { toast({ title: "Employee Code is required", description: "It links the person to their assets.", variant: "destructive" }); return; }
        if (users.some(u => u.id !== editUser.id && u.employeeCode?.toLowerCase() === form.employeeCode.trim().toLowerCase())) { toast({ title: "Employee Code already exists", description: "Employee codes must be unique.", variant: "destructive" }); return; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { toast({ title: "Enter a valid login email", variant: "destructive" }); return; }
        const body: any = { name: form.name, email: form.email.trim().toLowerCase(), userType: form.userType, role: form.role, department: form.department, designation: form.designation, employeeCode: form.employeeCode, mobile: form.mobile, status: form.status };
        if (form.password) body.password = form.password;
        await apiFetch(`/admin/users/${editUser.id}`, { method: "PATCH", body: JSON.stringify(body) });
        await apiFetch(`/user-roles/${editUser.id}`, { method: "PUT", body: JSON.stringify({ roleIds }) });
        toast({ title: "User updated" });
      } else {
        if (!form.email.trim()) { toast({ title: "Email is required", variant: "destructive" }); return; }
        if (!form.designation.trim() || !form.employeeCode.trim() || !form.department.trim()) {
          toast({ title: "Designation, Department, and Employee Code are required", variant: "destructive" }); return;
        }
        // Client-side unique emp code check
        const empCodeExists = users.some(u => u.employeeCode?.toLowerCase() === form.employeeCode.trim().toLowerCase());
        if (empCodeExists) { toast({ title: "Employee Code already exists", description: "Employee codes must be unique.", variant: "destructive" }); return; }
        const body: any = { name: form.name, email: form.email, userType: form.userType, role: form.role, department: form.department, designation: form.designation, employeeCode: form.employeeCode, mobile: form.mobile, status: form.status };
        if (form.password) body.password = form.password;
        const created: any = await apiFetch("/admin/users", { method: "POST", body: JSON.stringify(body) });
        if (roleIds.length && created?.id) await apiFetch(`/user-roles/${created.id}`, { method: "PUT", body: JSON.stringify({ roleIds }) });
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

  const deptLabel = (key: string) => deptMasters.find(d => d.key === key)?.label || key;

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortedFilteredUsers = React.useMemo(() => {
    const q = searchQ.toLowerCase();
    let filtered = users;
    if (q) filtered = filtered.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.department || "").toLowerCase().includes(q) ||
      deptLabel(u.department || "").toLowerCase().includes(q) ||
      (u.designation || "").toLowerCase().includes(q) ||
      (u.employeeCode || "").toLowerCase().includes(q) ||
      (u.mobile || "").includes(q)
    );
    if (filterRole !== "all") filtered = filtered.filter(u => u.role === filterRole);
    if (filterType !== "all") filtered = filtered.filter(u => u.userType === filterType);
    return [...filtered].sort((a, b) => {
      const aVal = (a[sortCol] || "").toString().toLowerCase();
      const bVal = (b[sortCol] || "").toString().toLowerCase();
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [users, searchQ, sortCol, sortDir, filterRole, filterType, deptMasters]);

  useEffect(() => { setUserPage(1); }, [searchQ, sortCol, sortDir, filterRole, filterType]);

  const totalPages = Math.max(1, Math.ceil(sortedFilteredUsers.length / USER_PAGE_SIZE));
  const pagedUsers = sortedFilteredUsers.slice((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE);

  const activeCount = users.filter(u => (u.status || (u.isActive ? "active" : "inactive")) === "active").length;
  const internalCount = users.filter(u => u.userType === "internal").length;

  const statusCls = (s: string) =>
    s === "active" ? "border-green-500/30 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-400/10"
    : s === "dormant" ? "border-yellow-500/30 text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-400/10"
    : "border-red-500/30 text-red-500 bg-red-50 dark:bg-red-400/10";

  const initials = (name: string) => name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-[#2D7FF9]" />
            User Master
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage application users, roles, and access levels</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
          <Button size="sm" onClick={openAdd} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white"><Plus className="h-3.5 w-3.5 mr-1" />Add User</Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Users, label: "Total Users", value: users.length, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30", border: "border-l-blue-500" },
          { icon: UserCheck, label: "Active", value: activeCount, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30", border: "border-l-emerald-500" },
          { icon: Shield, label: "Internal Users", value: internalCount, color: "text-violet-600", bg: "bg-violet-100 dark:bg-violet-900/30", border: "border-l-violet-500" },
          { icon: UserX, label: "Inactive/Dormant", value: users.length - activeCount, color: "text-red-500", bg: "bg-red-100 dark:bg-red-900/30", border: "border-l-red-400" },
        ].map(s => (
          <Card key={s.label} className={`border-l-4 ${s.border}`}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`w-4 h-4 ${s.color}`} /></div>
              <div><p className="text-[11px] text-muted-foreground">{s.label}</p><p className="text-xl font-bold">{s.value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            placeholder="Search name, email, emp code, mobile…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="external">External</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 ml-1">
          {(["name", "department", "role", "status"] as const).map(col => (
            <button key={col} onClick={() => toggleSort(col)}
              className={`px-2 py-1 text-[10px] rounded border transition-colors ${sortCol === col ? "border-primary/60 bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground hover:border-primary/40"}`}>
              {col === "name" ? "Name" : col === "department" ? "Dept" : col === "role" ? "Role" : "Status"}
              {sortCol === col && <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>}
            </button>
          ))}
        </div>
        {(searchQ || filterRole !== "all" || filterType !== "all") && (
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setSearchQ(""); setFilterRole("all"); setFilterType("all"); }}>Clear</Button>
        )}
        <p className="text-xs text-muted-foreground ml-auto">{sortedFilteredUsers.length} / {users.length} users</p>
      </div>

      {loading ? (
        <div className="space-y-1.5">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase w-[30%]">User</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase w-[22%]">Email</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase w-[22%]">Designation / Dept</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase w-[12%]">Role</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase w-[10%]">Status</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-muted-foreground uppercase w-[4%]"></th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No users match your search.</td></tr>
                )}
                {pagedUsers.map(u => {
                  const s = u.status || (u.isActive ? "active" : "inactive");
                  return (
                    <tr key={u.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#2D7FF9]/20 border border-[#2D7FF9]/30 flex items-center justify-center text-[10px] font-bold text-[#1B63D6] flex-shrink-0">
                            {initials(u.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm leading-tight truncate">{u.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {u.employeeCode && <span className="font-mono text-[10px] px-1 rounded bg-muted text-muted-foreground border border-border">{u.employeeCode}</span>}
                              <span className={`text-[10px] ${u.userType === "internal" ? "text-blue-500" : "text-purple-500"}`}>{u.userType === "internal" ? "Internal" : "External"}</span>
                              {u.mfaEnabled && <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold">MFA</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs text-foreground truncate">{u.email}</p>
                        {u.mobile && <p className="text-[11px] text-muted-foreground truncate">{u.mobile}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        {u.designation && <p className="text-xs font-medium truncate">{u.designation}</p>}
                        {u.department && <p className="text-[11px] text-muted-foreground truncate">{deptLabel(u.department)}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={`text-[10px] capitalize ${ROLE_BADGE[u.role] || ""}`}>{getRoleLabel(u.role)}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={`text-[10px] capitalize ${statusCls(s)}`}>{s}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex gap-0.5 justify-end">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(u)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">
                Showing {((userPage - 1) * USER_PAGE_SIZE) + 1}–{Math.min(userPage * USER_PAGE_SIZE, sortedFilteredUsers.length)} of {sortedFilteredUsers.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={userPage === 1} onClick={() => setUserPage(p => Math.max(1, p - 1))}>← Prev</Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - userPage) <= 1)
                  .reduce((acc: (number | string)[], p, idx, arr) => {
                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(p); return acc;
                  }, [])
                  .map((p, idx) =>
                    typeof p === "string" ? (
                      <span key={`e-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                    ) : (
                      <Button key={p} variant={p === userPage ? "default" : "outline"} size="sm"
                        className={`h-7 w-7 p-0 text-xs ${p === userPage ? "bg-[#2D7FF9] hover:bg-[#1B63D6] text-white border-[#2D7FF9]" : ""}`}
                        onClick={() => setUserPage(p as number)}>{p}</Button>
                    )
                  )}
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={userPage === totalPages} onClick={() => setUserPage(p => Math.min(totalPages, p + 1))}>Next →</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editUser ? "Edit User" : "Add New User"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ramesh Kumar" />
            </div>
            <div className="space-y-1.5">
              <Label>Login Email <span className="text-red-500">*</span></Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@company.com" />
              <p className="text-[11px] text-muted-foreground">Must match the Ashika Portal / M365 email.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Employee Code <span className="text-red-500">*</span></Label>
              <Input value={form.employeeCode} onChange={e => setForm(f => ({ ...f, employeeCode: e.target.value }))} placeholder="e.g. EMP001" />
              {!editUser && form.employeeCode && users.some(u => u.employeeCode?.toLowerCase() === form.employeeCode.toLowerCase()) && (
                <p className="text-[11px] text-red-500">⚠ Employee code already in use</p>
              )}
              <p className="text-[11px] text-muted-foreground">Assets are mapped to this code. Externals: vendor staff code.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Designation <span className="text-red-500">*</span></Label>
              <Input value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} placeholder="e.g. Senior Manager" />
            </div>
            <div className="space-y-1.5">
              <Label>Department <span className="text-red-500">*</span></Label>
              <Select value={form.department} onValueChange={v => setForm(f => ({ ...f, department: v }))}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {deptMasters.map(d => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mobile Number</Label>
              <Input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} placeholder="+91 99999 99999" />
            </div>
            <div className="space-y-1.5">
              <Label>Base role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>User Type</Label>
              <Select value={form.userType} onValueChange={v => setForm(f => ({ ...f, userType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">External = consultants / partner staff.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Account Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="dormant">Dormant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Password {editUser && <span className="text-muted-foreground text-xs">(blank = keep current)</span>}</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editUser ? "••••••••" : "Set password"} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Access roles <span className="text-muted-foreground text-xs">(Portal users need one, or base role Admin)</span></Label>
              <div className="flex flex-wrap gap-1.5 rounded-[10px] border p-2 max-h-40 overflow-y-auto">
                {accessRoles.map(r => {
                  const on = roleIds.includes(r.id);
                  return (
                    <button key={r.id} type="button" title={`${r.description || r.name}\n` + (r.permissions.filter(p => p.accessLevel !== "none").map(p => `• ${moduleLabels[p.module]?.label || p.module}: ${p.accessLevel === "read" ? "View" : p.accessLevel === "write" ? "Edit" : "Full"}`).join("\n") || "No module access")} onClick={() => setRoleIds(ids => on ? ids.filter(x => x !== r.id) : [...ids, r.id])}
                      className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground hover:bg-accent"}`}>{r.name}</button>
                  );
                })}
                {!accessRoles.length && <span className="text-xs text-muted-foreground">No roles defined — Admin › Roles & Permissions.</span>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Effective access</Label>
              {(() => {
                const LV = ["none", "read", "write", "admin"];
                const eff: Record<string, string> = {};
                for (const r of accessRoles.filter(r => roleIds.includes(r.id))) for (const p of r.permissions) if (LV.indexOf(p.accessLevel) > LV.indexOf(eff[p.module] || "none")) eff[p.module] = p.accessLevel;
                const items = Object.entries(eff).filter(([, l]) => l !== "none").sort((a, b) => (moduleLabels[a[0]]?.group || "").localeCompare(moduleLabels[b[0]]?.group || "") || a[0].localeCompare(b[0]));
                if (form.role === "admin") return <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Base role Admin = full access to every module; access roles are not needed.</p>;
                if (!items.length) return <p className="text-[11px] text-muted-foreground">No module access selected — this person can only see My Assets.</p>;
                const tag = (l: string) => l === "read" ? "View" : l === "write" ? "Edit" : "Full";
                return (
                  <div className="rounded-[10px] border bg-muted/30 p-2.5">
                    <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">This person will be able to:</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {items.map(([m, l]) => (
                        <div key={m} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">{moduleLabels[m]?.label || m}</span>
                          <span className={`px-1.5 py-[1px] rounded-full text-[10px] font-semibold ${l === "read" ? "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"}`}>{tag(l)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white">{editUser ? "Update User" : "Create User"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
