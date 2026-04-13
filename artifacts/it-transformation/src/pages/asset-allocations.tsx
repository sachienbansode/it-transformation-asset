import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Search, Eye, Users, CheckCircle2, Clock, ArrowRight, ListChecks, Loader2, UserCheck, Building2 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";

const PAGE_SIZE = 10;

interface Employee {
  id: number;
  name: string;
  email: string;
  department?: string;
  designation?: string;
  employeeCode?: string;
}
interface DeptMaster { key: string; label: string; sortOrder: number; }

export default function AssetAllocations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [employeeSearch, setEmployeeSearch] = useState("");

  // Bulk allocation state
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<number[]>([]);
  const [bulkEmployeeSearch, setBulkEmployeeSearch] = useState("");
  const [bulkForm, setBulkForm] = useState({
    userId: "",
    userName: "",
    employeeCode: "",
    designation: "",
    department: "",
    startDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const { data: allocations = [] } = useQuery({ queryKey: ["asset-allocations"], queryFn: () => apiFetch<any[]>("/asset-allocations") });
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<any[]>("/assets") });
  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: () => apiFetch<Employee[]>("/admin/users") });
  const { data: deptMasters = [] } = useQuery({ queryKey: ["dept-masters"], queryFn: () => apiFetch<DeptMaster[]>("/masters?category=department&active=true") });

  const deptLabel = useMemo(() => (key: string) => (deptMasters as DeptMaster[]).find((d: DeptMaster) => d.key === key)?.label || key, [deptMasters]);

  const createAlloc = useMutation({ mutationFn: (data: any) => apiFetch("/asset-allocations", { method: "POST", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["asset-allocations"] }); queryClient.invalidateQueries({ queryKey: ["assets"] }); } });
  const updateAlloc = useMutation({ mutationFn: ({ id, ...data }: any) => apiFetch(`/asset-allocations/${id}`, { method: "PATCH", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["asset-allocations"] }); queryClient.invalidateQueries({ queryKey: ["assets"] }); } });
  const deleteAlloc = useMutation({ mutationFn: (id: number) => apiFetch(`/asset-allocations/${id}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-allocations"] }) });
  const bulkAllocMutation = useMutation({ mutationFn: (data: any) => apiFetch("/asset-allocations/bulk", { method: "POST", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["asset-allocations"] }); queryClient.invalidateQueries({ queryKey: ["assets"] }); } });

  const inStockAssets = useMemo(() => assets.filter((a: any) => a.status === "In Stock"), [assets]);
  const bulkFiltered = useMemo(() => {
    if (!bulkSearch) return inStockAssets;
    return inStockAssets.filter((a: any) => [a.assetTag, a.name, a.type, a.serialNumber].some((v: any) => v?.toLowerCase().includes(bulkSearch.toLowerCase())));
  }, [inStockAssets, bulkSearch]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch) return employees;
    const q = employeeSearch.toLowerCase();
    return employees.filter((e: Employee) =>
      e.name.toLowerCase().includes(q) ||
      (e.employeeCode || "").toLowerCase().includes(q) ||
      (e.email || "").toLowerCase().includes(q)
    );
  }, [employees, employeeSearch]);

  const bulkFilteredEmployees = useMemo(() => {
    if (!bulkEmployeeSearch) return employees;
    const q = bulkEmployeeSearch.toLowerCase();
    return employees.filter((e: Employee) =>
      e.name.toLowerCase().includes(q) ||
      (e.employeeCode || "").toLowerCase().includes(q)
    );
  }, [employees, bulkEmployeeSearch]);

  const departments = [...new Set(allocations.map((a: any) => a.department).filter(Boolean))];
  const filtered = useMemo(() => {
    let list = allocations;
    if (search) list = list.filter((a: any) => [a.userName, a.department, a.employeeCode, a.designation].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterStatus) list = list.filter((a: any) => a.status === filterStatus);
    if (filterDept) list = list.filter((a: any) => a.department === filterDept);
    return list;
  }, [allocations, search, filterStatus, filterDept]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeAllocs = allocations.filter((a: any) => a.status === "Active").length;
  const returnedAllocs = allocations.filter((a: any) => a.status === "Returned").length;

  function selectEmployee(emp: Employee, isBulk = false) {
    if (isBulk) {
      setBulkForm(p => ({
        ...p,
        userId: String(emp.id),
        userName: emp.name,
        employeeCode: emp.employeeCode || "",
        designation: emp.designation || "",
        department: emp.department || "",
      }));
      setBulkEmployeeSearch("");
    } else {
      setFormData((f: any) => ({
        ...f,
        userId: emp.id,
        userName: emp.name,
        employeeCode: emp.employeeCode || "",
        designation: emp.designation || "",
        department: emp.department || "",
      }));
      setEmployeeSearch("");
    }
  }

  function openCreate() {
    setEditingItem(null);
    setFormData({ status: "Active", startDate: new Date().toISOString().split("T")[0] });
    setEmployeeSearch("");
    setIsModalOpen(true);
  }
  function openEdit(item: any) {
    setEditingItem(item);
    setFormData({
      assetId: item.assetId,
      userId: item.userId,
      userName: item.userName,
      employeeCode: item.employeeCode,
      designation: item.designation,
      department: item.department,
      startDate: item.startDate,
      endDate: item.endDate,
      status: item.status,
      notes: item.notes,
    });
    setEmployeeSearch(item.userName || "");
    setIsModalOpen(true);
  }

  function openBulk() {
    setBulkSearch("");
    setBulkSelectedIds([]);
    setBulkEmployeeSearch("");
    setBulkForm({ userId: "", userName: "", employeeCode: "", designation: "", department: "", startDate: new Date().toISOString().split("T")[0], notes: "" });
    setIsBulkModalOpen(true);
  }

  async function handleSave() {
    if (!formData.assetId || !formData.userName) { toast({ title: "Asset and Assigned To are required", variant: "destructive" }); return; }
    try {
      if (editingItem) { await updateAlloc.mutateAsync({ id: editingItem.id, ...formData }); toast({ title: "Allocation updated" }); }
      else { await createAlloc.mutateAsync(formData); toast({ title: "Allocation created" }); }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleBulkSave() {
    if (!bulkSelectedIds.length) { toast({ title: "Select at least one asset", variant: "destructive" }); return; }
    if (!bulkForm.userName.trim()) { toast({ title: "Assigned To is required", variant: "destructive" }); return; }
    try {
      const result = await bulkAllocMutation.mutateAsync({ assetIds: bulkSelectedIds, ...bulkForm });
      toast({ title: `${result.count} assets allocated to ${bulkForm.userName}` });
      setIsBulkModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this allocation record?")) return;
    try { await deleteAlloc.mutateAsync(id); toast({ title: "Allocation deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  function toggleAsset(id: number) {
    setBulkSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleAll() {
    if (bulkSelectedIds.length === bulkFiltered.length) setBulkSelectedIds([]);
    else setBulkSelectedIds(bulkFiltered.map((a: any) => a.id));
  }

  const EmployeeDropdown = ({ value, searchVal, onSearch, onSelect, placeholder }: {
    value: string; searchVal: string; onSearch: (v: string) => void; onSelect: (e: Employee) => void; placeholder?: string;
  }) => {
    const list = useMemo(() => {
      if (!searchVal) return employees;
      const q = searchVal.toLowerCase();
      return employees.filter((e: Employee) =>
        e.name.toLowerCase().includes(q) ||
        (e.employeeCode || "").toLowerCase().includes(q) ||
        (e.email || "").toLowerCase().includes(q)
      );
    }, [searchVal]);

    return (
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchVal || value}
            onChange={e => onSearch(e.target.value)}
            placeholder={placeholder || "Search employee name or code…"}
            className="pl-8"
          />
        </div>
        {searchVal && list.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {list.slice(0, 10).map((e: Employee) => (
              <button
                key={e.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                onClick={() => onSelect(e)}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{e.name}</span>
                  {e.employeeCode && <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded">{e.employeeCode}</span>}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {[e.designation, deptLabel(e.department || "")].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset Allocations</h1>
          <p className="text-sm text-muted-foreground">Track asset assignments to employees — {user?.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openBulk} className="gap-2 border-[#d4a843] text-[#b8922e] hover:bg-[#d4a843]/10"><ListChecks className="w-4 h-4" />Bulk Allocate</Button>
          <Button onClick={openCreate} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2"><Plus className="w-4 h-4" />New Allocation</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={ArrowRight} label="Total Allocations" value={allocations.length} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={CheckCircle2} label="Active" value={activeAllocs} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={Clock} label="Returned" value={returnedAllocs} iconBg="bg-gray-100 dark:bg-gray-900/30" iconColor="text-gray-500" borderColor="border-l-gray-400" />
        <StatCard icon={Users} label="Departments" value={departments.length} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600" borderColor="border-l-violet-500" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by user, emp code, designation…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="Active">Active</SelectItem><SelectItem value="Returned">Returned</SelectItem><SelectItem value="Lost">Lost</SelectItem></SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={v => { setFilterDept(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Depts" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Departments</SelectItem>{departments.map(d => <SelectItem key={d} value={d}>{deptLabel(d) || d}</SelectItem>)}</SelectContent>
            </Select>
            {(search || filterStatus || filterDept) && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterStatus(""); setFilterDept(""); setPage(1); }}>Clear</Button>}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Asset Tag / Name</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Emp Code</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[90px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No allocations found</TableCell></TableRow>}
                {paged.map((a: any) => {
                  const asset = assets.find((x: any) => x.id === a.assetId);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-[#b8922e]">{asset?.assetTag || `#${a.assetId}`}</span>
                        <span className="text-muted-foreground ml-1 text-xs">— {asset?.name || ""}</span>
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{a.userName || "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{a.employeeCode || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.designation || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{deptLabel(a.department || "") || a.department || "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{a.startDate || "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{a.endDate || <span className="text-emerald-600">Ongoing</span>}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={a.status === "Active" ? "border-emerald-500/30 text-emerald-600 bg-emerald-50" : a.status === "Returned" ? "border-gray-400/30 text-gray-500 bg-gray-50" : "border-red-500/30 text-red-600 bg-red-50"}>
                          {a.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => setViewModal(a)} className="p-1.5 rounded hover:bg-muted" title="View"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-muted" title="Edit"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                          {isAdmin && <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded hover:bg-muted" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={!!viewModal} onOpenChange={() => setViewModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Allocation Details</DialogTitle></DialogHeader>
          {viewModal && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {([
                ["Asset", (() => { const a = assets.find((x: any) => x.id === viewModal.assetId); return a ? `${a.assetTag} — ${a.name}` : `#${viewModal.assetId}`; })()],
                ["Assigned To", viewModal.userName],
                ["Employee Code", viewModal.employeeCode],
                ["Designation", viewModal.designation],
                ["Department", viewModal.department],
                ["Start Date", viewModal.startDate],
                ["End Date", viewModal.endDate || "Ongoing"],
                ["Status", viewModal.status],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l}><div className="text-[10px] uppercase text-muted-foreground font-semibold">{l}</div><div className="font-medium">{v || "—"}</div></div>
              ))}
              {viewModal.notes && (
                <div className="col-span-2"><div className="text-[10px] uppercase text-muted-foreground font-semibold">Notes</div><div className="text-sm">{viewModal.notes}</div></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add / Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingItem ? "Edit Allocation" : "New Allocation"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {/* Asset */}
            <div>
              <Label className="text-xs font-medium">Asset <span className="text-red-500">*</span></Label>
              <Select value={formData.assetId ? String(formData.assetId) : ""} onValueChange={v => setFormData({ ...formData, assetId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Select asset…" /></SelectTrigger>
                <SelectContent>
                  {assets.map((a: any) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.assetTag} — {a.name} ({a.status})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Employee dropdown */}
            <div>
              <Label className="text-xs font-medium">Assigned To <span className="text-red-500">*</span></Label>
              <EmployeeDropdown
                value={formData.userName || ""}
                searchVal={employeeSearch}
                onSearch={v => {
                  setEmployeeSearch(v);
                  if (!v) setFormData((f: any) => ({ ...f, userId: undefined, userName: "", employeeCode: "", designation: "", department: "" }));
                  else setFormData((f: any) => ({ ...f, userName: v }));
                }}
                onSelect={emp => selectEmployee(emp)}
                placeholder="Search employee name or code…"
              />
            </div>

            {/* Auto-filled fields */}
            <div>
              <Label className="text-xs font-medium">Employee Code</Label>
              <Input value={formData.employeeCode || ""} onChange={e => setFormData({ ...formData, employeeCode: e.target.value })} placeholder="Auto-filled from employee" className="bg-muted/30" />
            </div>
            <div>
              <Label className="text-xs font-medium">Designation</Label>
              <Input value={formData.designation || ""} onChange={e => setFormData({ ...formData, designation: e.target.value })} placeholder="Auto-filled from employee" className="bg-muted/30" />
            </div>
            <div>
              <Label className="text-xs font-medium">Department</Label>
              <Input value={deptLabel(formData.department || "") || formData.department || ""} readOnly placeholder="Auto-filled from employee" className="bg-muted/30 text-muted-foreground" />
            </div>
            <div>
              <Label className="text-xs font-medium">Status</Label>
              <Select value={formData.status || "Active"} onValueChange={v => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Returned">Returned</SelectItem><SelectItem value="Lost">Lost</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Start Date</Label>
              <Input type="date" value={formData.startDate || ""} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs font-medium">End Date</Label>
              <Input type="date" value={formData.endDate || ""} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} placeholder="Optional notes about this allocation" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.assetId || !formData.userName || createAlloc.isPending || updateAlloc.isPending} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2">
              {(createAlloc.isPending || updateAlloc.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingItem ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Allocation Dialog */}
      <Dialog open={isBulkModalOpen} onOpenChange={setIsBulkModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-[#d4a843]" />
              Bulk Allocate Assets
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Bulk employee dropdown */}
              <div className="col-span-2">
                <Label className="text-xs font-medium">Assign To <span className="text-red-500">*</span></Label>
                <EmployeeDropdown
                  value={bulkForm.userName}
                  searchVal={bulkEmployeeSearch}
                  onSearch={v => {
                    setBulkEmployeeSearch(v);
                    if (!v) setBulkForm(p => ({ ...p, userId: "", userName: "", employeeCode: "", designation: "", department: "" }));
                    else setBulkForm(p => ({ ...p, userName: v }));
                  }}
                  onSelect={emp => selectEmployee(emp, true)}
                  placeholder="Search employee name or code…"
                />
              </div>

              {/* Auto-populated fields */}
              {bulkForm.employeeCode && (
                <div className="flex items-center gap-3 col-span-2 px-3 py-2 rounded-lg bg-[#d4a843]/5 border border-[#d4a843]/20">
                  <UserCheck className="w-4 h-4 text-[#d4a843] flex-shrink-0" />
                  <div className="flex-1 grid grid-cols-3 gap-3 text-sm">
                    <div><span className="text-[10px] text-muted-foreground uppercase">Emp Code</span><p className="font-mono font-medium">{bulkForm.employeeCode}</p></div>
                    <div><span className="text-[10px] text-muted-foreground uppercase">Designation</span><p className="font-medium">{bulkForm.designation || "—"}</p></div>
                    <div><span className="text-[10px] text-muted-foreground uppercase">Department</span><p className="font-medium">{deptLabel(bulkForm.department) || bulkForm.department || "—"}</p></div>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs font-medium">Start Date</Label>
                <Input type="date" value={bulkForm.startDate} onChange={e => setBulkForm(p => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-medium">Notes</Label>
                <Input value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium">Select In-Stock Assets ({bulkSelectedIds.length} selected)</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Filter assets…" value={bulkSearch} onChange={e => setBulkSearch(e.target.value)} className="pl-7 h-7 text-xs w-[180px]" />
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 border-b">
                  <Checkbox checked={bulkFiltered.length > 0 && bulkSelectedIds.length === bulkFiltered.length} onCheckedChange={toggleAll} />
                  <span className="text-xs font-medium text-muted-foreground">Select All ({bulkFiltered.length} In-Stock assets)</span>
                </div>
                <div className="max-h-[240px] overflow-y-auto divide-y">
                  {bulkFiltered.length === 0 && <div className="text-center py-6 text-sm text-muted-foreground">No in-stock assets found</div>}
                  {bulkFiltered.map((a: any) => (
                    <div key={a.id} className={`flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition ${bulkSelectedIds.includes(a.id) ? "bg-[#d4a843]/5" : ""}`}>
                      <Checkbox checked={bulkSelectedIds.includes(a.id)} onCheckedChange={() => toggleAsset(a.id)} />
                      <span className="font-mono text-xs font-semibold text-[#b8922e] w-[80px]">{a.assetTag}</span>
                      <span className="text-sm flex-1 truncate">{a.name}</span>
                      <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2 pt-3 border-t">
            <Button variant="outline" onClick={() => setIsBulkModalOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkSave} disabled={!bulkSelectedIds.length || !bulkForm.userName.trim() || bulkAllocMutation.isPending} className="bg-[#d4a843] hover:bg-[#b8922e] text-white gap-2">
              {bulkAllocMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Allocate {bulkSelectedIds.length || ""} Assets
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
