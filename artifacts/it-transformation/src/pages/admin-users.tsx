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
import { Users, Plus, Pencil, Trash2, RefreshCw, Search, UserCheck, UserX, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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

export default function AdminUsers() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortCol, setSortCol] = useState<"name" | "email" | "department" | "role" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [userPage, setUserPage] = useState(1);
  const USER_PAGE_SIZE = 15;
  const [form, setForm] = useState({
    name: "", email: "", password: "", userType: "internal", role: "user",
    department: "", designation: "", employeeCode: "", mobile: "", status: "active", isActive: true,
  });
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
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    try {
      if (editUser) {
        const body: any = { name: form.name, userType: form.userType, role: form.role, department: form.department, designation: form.designation, employeeCode: form.employeeCode, mobile: form.mobile, status: form.status };
        if (form.password) body.password = form.password;
        await apiFetch(`/admin/users/${editUser.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "User updated" });
      } else {
        if (!form.email.trim()) { toast({ title: "Email is required", variant: "destructive" }); return; }
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

  const deptLabel = (key: string) => deptMasters.find(d => d.key === key)?.label || key;

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => (
    sortCol === col
      ? <span className="ml-1 text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>
      : <span className="ml-1 text-muted-foreground/40">↕</span>
  );

  const sortedFilteredUsers = React.useMemo(() => {
    const q = searchQ.toLowerCase();
    let filtered = users;
    if (q) filtered = filtered.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.department || "").toLowerCase().includes(q) ||
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
  }, [users, searchQ, sortCol, sortDir, filterRole, filterType]);

  useEffect(() => { setUserPage(1); }, [searchQ, sortCol, sortDir, filterRole, filterType]);

  const totalPages = Math.max(1, Math.ceil(sortedFilteredUsers.length / USER_PAGE_SIZE));
  const pagedUsers = sortedFilteredUsers.slice((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE);

  const activeCount = users.filter(u => (u.status || (u.isActive ? "active" : "inactive")) === "active").length;
  const internalCount = users.filter(u => u.userType === "internal").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-[#d4a843]" />
            User Master
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage application users, roles, and access levels</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
          <Button size="sm" onClick={openAdd} className="bg-[#d4a843] hover:bg-[#b8922e] text-white"><Plus className="h-3.5 w-3.5 mr-1" />Add User</Button>
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
        <div className="relative flex-1 min-w-[200px] max-w-xs">
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
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="external">External</SelectItem>
          </SelectContent>
        </Select>
        {(searchQ || filterRole !== "all" || filterType !== "all") && (
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setSearchQ(""); setFilterRole("all"); setFilterType("all"); }}>Clear filters</Button>
        )}
        <p className="text-xs text-muted-foreground ml-auto">{sortedFilteredUsers.length} / {users.length} users</p>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer whitespace-nowrap" onClick={() => toggleSort("name")}>Name<SortIcon col="name" /></th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Emp Code</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer whitespace-nowrap" onClick={() => toggleSort("email")}>Email<SortIcon col="email" /></th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Mobile</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Designation</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer whitespace-nowrap" onClick={() => toggleSort("department")}>Dept<SortIcon col="department" /></th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer whitespace-nowrap" onClick={() => toggleSort("role")}>Role<SortIcon col="role" /></th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">MFA</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer whitespace-nowrap" onClick={() => toggleSort("status")}>Status<SortIcon col="status" /></th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Last Login</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFilteredUsers.length === 0 && (
                    <tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-muted-foreground">No users match your search.</td></tr>
                  )}
                  {pagedUsers.map(u => (
                    <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{u.name}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{u.employeeCode || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[180px]">
                        <span className="block truncate" title={u.email}>{u.email}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{u.mobile || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{u.designation || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{deptLabel(u.department || "") || "—"}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={u.userType === "internal" ? "border-blue-500/30 text-blue-600 dark:text-blue-400 text-[10px]" : "border-purple-500/30 text-purple-600 dark:text-purple-400 text-[10px]"}>
                          {u.userType === "internal" ? "Internal" : "External"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={`text-[10px] ${u.role === "admin" ? "border-yellow-500/30 text-yellow-600 dark:text-yellow-400" : "border-gray-500/30 text-gray-500"}`}>
                          {getRoleLabel(u.role)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={`text-[10px] ${u.mfaEnabled ? "border-green-500/30 text-green-600 dark:text-green-400" : "border-gray-500/30 text-gray-400"}`}>
                          {u.mfaEnabled ? "ON" : "OFF"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const s = u.status || (u.isActive ? "active" : "inactive");
                          const cls = s === "active" ? "border-green-500/30 text-green-600 dark:text-green-400" : s === "dormant" ? "border-yellow-500/30 text-yellow-600 dark:text-yellow-400" : "border-red-500/30 text-red-500";
                          return <Badge variant="outline" className={`text-[10px] capitalize ${cls}`}>{s}</Badge>;
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Never"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(u)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <p className="text-xs text-muted-foreground">
                Showing {((userPage - 1) * USER_PAGE_SIZE) + 1}–{Math.min(userPage * USER_PAGE_SIZE, sortedFilteredUsers.length)} of {sortedFilteredUsers.length} users
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
                        className={`h-7 w-7 p-0 text-xs ${p === userPage ? "bg-[#d4a843] hover:bg-[#b8922e] text-white border-[#d4a843]" : ""}`}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editUser ? "Edit User" : "Add New User"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ramesh Kumar" />
            </div>
            {!editUser && (
              <div className="space-y-1.5">
                <Label>Email <span className="text-red-500">*</span></Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@company.com" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Employee Code <span className="text-red-500">*</span></Label>
              <Input value={form.employeeCode} onChange={e => setForm(f => ({ ...f, employeeCode: e.target.value }))} placeholder="e.g. EMP001" />
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
              <Label>Role</Label>
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
            <div className="space-y-1.5 col-span-2">
              <Label>Password {editUser && <span className="text-muted-foreground text-xs">(leave blank to keep current)</span>}</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editUser ? "••••••••" : "Set password"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-[#d4a843] hover:bg-[#b8922e] text-white">{editUser ? "Update User" : "Create User"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
