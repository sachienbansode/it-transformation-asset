import React, { useState, useMemo } from "react";
import { useListApplications, useCreateApplication, useUpdateApplication, useDeleteApplication, getListApplicationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Search, Server, CheckCircle2, Archive, XCircle } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import type { Application } from "@workspace/api-client-react";
import { MasterSelect } from "@/components/master-select";
import { useMasters, getBadgeClass } from "@/hooks/use-masters";
import { useCurrency } from "@/contexts/currency-context";
import { useAuth } from "@/contexts/auth-context";
import { ImportExportMenu } from "@/components/import-export-menu";
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/components/confirm-dialog";

const PAGE_SIZE = 10;

type FormData = Partial<Application> & {
  applicationStatus?: string;
  dateOfOnboarding?: string;
  dateOfRetirement?: string;
  isActive?: boolean;
};

function validateForm(f: FormData): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!f.appId?.trim()) errs.appId = "App ID is required";
  if (!f.name?.trim()) errs.name = "Name is required";
  if (!f.business?.trim()) errs.business = "Business unit is required";
  if (!f.category?.trim()) errs.category = "Category is required";
  if (!f.hosting?.trim()) errs.hosting = "Hosting is required";
  if (!f.criticality?.trim()) errs.criticality = "Criticality is required";
  if (f.dateOfRetirement && f.dateOfOnboarding && f.dateOfRetirement <= f.dateOfOnboarding) {
    errs.dateOfRetirement = "Retirement date must be after onboarding date";
  }
  if (f.applicationStatus === "Retired" && !f.dateOfRetirement) {
    errs.dateOfRetirement = "Retirement date is required when status is Retired";
  }
  return errs;
}

const STATUS_BADGE: Record<string, string> = {
  Active: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10",
  Retired: "border-gray-400/30 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-400/10",
  Stopped: "border-red-500/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10",
};

export default function Applications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { data: items } = useListApplications();
  const { format } = useCurrency();

  const createItem = useCreateApplication();
  const updateItem = useUpdateApplication();
  const deleteItem = useDeleteApplication();

  const { data: businesses } = useMasters("business");
  const { data: hostings } = useMasters("hosting");
  const { data: criticalities } = useMasters("criticality");

  const [search, setSearch] = useState("");
  const [filterBusiness, setFilterBusiness] = useState("");
  const [filterHosting, setFilterHosting] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Application | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredItems = useMemo(() => items?.filter(item => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !item.appId.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterBusiness && item.business !== filterBusiness) return false;
    if (filterHosting && item.hosting !== filterHosting) return false;
    if (filterStatus && (item as any).applicationStatus !== filterStatus) return false;
    return true;
  }) ?? [], [items, search, filterBusiness, filterHosting, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleOpenModal = (item: Application | null = null) => {
    setEditingItem(item);
    if (item) {
      setFormData({
        ...item,
        applicationStatus: (item as any).applicationStatus || "Active",
        dateOfOnboarding: (item as any).dateOfOnboarding || "",
        dateOfRetirement: (item as any).dateOfRetirement || "",
        isActive: (item as any).isActive !== false,
      });
    } else {
      setFormData({
        appId: "", name: "", business: "", category: "", hosting: "",
        criticality: "", supportStatus: "Active", applicationStatus: "Active",
        dateOfOnboarding: "", dateOfRetirement: "", isActive: true,
      });
    }
    setErrors({});
    setIsModalOpen(true);
  };

  const set = (key: keyof FormData, value: unknown) => {
    setFormData(p => ({ ...p, [key]: value }));
    setErrors(e => { const n = { ...e }; delete n[key as string]; return n; });
  };

  const handleSave = () => {
    const errs = validateForm(formData);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const payload: any = { ...formData };
    if (!payload.dateOfOnboarding) payload.dateOfOnboarding = null;
    if (!payload.dateOfRetirement) payload.dateOfRetirement = null;

    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Updated successfully" });
        },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      });
    } else {
      createItem.mutate({ data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Created successfully" });
        },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (await confirmDialog("Are you sure you want to delete this app?")) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          toast({ title: "Deleted successfully" });
        },
      });
    }
  };

  const getCriticalityBadge = (crit: string) => {
    const critMaster = criticalities?.find(c => c.label === crit);
    if (critMaster?.color) return getBadgeClass(critMaster.color);
    if (crit === "High" || crit === "Critical") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (crit === "Medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-green-500/20 text-green-400 border-green-500/30";
  };

  const FieldError = ({ k }: { k: string }) =>
    errors[k] ? <p className="text-xs text-destructive mt-0.5">{errors[k]}</p> : null;

  const totalApps = items?.length ?? 0;
  const activeApps = items?.filter(i => (i as any).applicationStatus === "Active" || !(i as any).applicationStatus).length ?? 0;
  const retiredApps = items?.filter(i => (i as any).applicationStatus === "Retired").length ?? 0;
  const stoppedApps = items?.filter(i => (i as any).applicationStatus === "Stopped").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Application Inventory</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{totalApps} total · {filteredItems.length} filtered</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportMenu module="applications" label="Applications" onImportSuccess={() => queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() })} />
          {isAdmin && (
            <Button size="sm" onClick={() => handleOpenModal(null)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Application
            </Button>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Total Apps" value={totalApps} sub="in inventory" icon={Server} iconBg="bg-blue-50 dark:bg-blue-400/10" iconColor="text-blue-600" borderColor="border-l-blue-400" />
        <StatCard label="Active" value={activeApps} sub="in production" icon={CheckCircle2} iconBg="bg-emerald-50 dark:bg-emerald-400/10" iconColor="text-emerald-600" borderColor="border-l-emerald-400" valueColor={activeApps > 0 ? "text-emerald-600" : undefined} />
        <StatCard label="Retired" value={retiredApps} sub="decommissioned" icon={Archive} iconBg="bg-gray-50 dark:bg-gray-400/10" iconColor="text-gray-500" borderColor="border-l-gray-400" />
        <StatCard label="Stopped" value={stoppedApps} sub="halted" icon={XCircle} iconBg="bg-red-50 dark:bg-red-400/10" iconColor="text-red-500" borderColor="border-l-red-400" valueColor={stoppedApps > 0 ? "text-red-500" : undefined} />
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or ID..." className="pl-9 h-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={filterBusiness || "all"} onValueChange={v => { setFilterBusiness(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="All BUs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Business Units</SelectItem>
            {businesses?.map(b => <SelectItem key={b.id} value={b.label}>{b.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus || "all"} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Retired">Retired</SelectItem>
            <SelectItem value="Stopped">Stopped</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterHosting || "all"} onValueChange={v => { setFilterHosting(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="All Hosting" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hosting</SelectItem>
            {hostings?.map(h => <SelectItem key={h.id} value={h.label}>{h.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">App ID</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Business</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Onboarded</TableHead>
              <TableHead className="text-xs">Retired On</TableHead>
              <TableHead className="text-xs">Criticality</TableHead>
              <TableHead className="text-xs">Active</TableHead>
              {isAdmin && <TableHead className="text-right text-xs">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedItems.map(item => {
              const appStatus = (item as any).applicationStatus || "Active";
              const isActive = (item as any).isActive !== false;
              return (
                <TableRow key={item.id} className={cn(!isActive && "opacity-60")}>
                  <TableCell className="font-mono text-xs">{item.appId}</TableCell>
                  <TableCell className="font-medium text-sm">{item.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{item.business}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-[10px] border", STATUS_BADGE[appStatus] || "")}>
                      {appStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{(item as any).dateOfOnboarding || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{(item as any).dateOfRetirement || "—"}</TableCell>
                  <TableCell><Badge className={`text-[10px] border ${getCriticalityBadge(item.criticality)}`}>{item.criticality}</Badge></TableCell>
                  <TableCell>
                    <span className={cn("text-[10px] font-semibold", isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                      {isActive ? "Yes" : "No"}
                    </span>
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenModal(item)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {pagedItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No applications found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="px-4 pb-3">
          <Pagination
            page={page} totalPages={totalPages} totalItems={filteredItems.length}
            pageSize={PAGE_SIZE} onPageChange={setPage}
          />
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Application" : "Add Application"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 grid-cols-2">
            {/* App ID */}
            <div className="grid gap-1.5">
              <Label>App ID <span className="text-destructive">*</span></Label>
              <Input value={formData.appId || ""} onChange={e => set("appId", e.target.value)} placeholder="APP-001" className={errors.appId ? "border-destructive" : ""} />
              <FieldError k="appId" />
            </div>
            {/* Name */}
            <div className="grid gap-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={formData.name || ""} onChange={e => set("name", e.target.value)} className={errors.name ? "border-destructive" : ""} />
              <FieldError k="name" />
            </div>
            {/* Business Unit */}
            <div className="grid gap-1.5">
              <Label>Business Unit <span className="text-destructive">*</span></Label>
              <MasterSelect category="business" value={formData.business || ""} onChange={v => set("business", v)} placeholder="Select business" />
              <FieldError k="business" />
            </div>
            {/* Category */}
            <div className="grid gap-1.5">
              <Label>Category <span className="text-destructive">*</span></Label>
              <MasterSelect category="app_category" value={formData.category || ""} onChange={v => set("category", v)} placeholder="Select category" />
              <FieldError k="category" />
            </div>
            {/* Hosting */}
            <div className="grid gap-1.5">
              <Label>Hosting <span className="text-destructive">*</span></Label>
              <MasterSelect category="hosting" value={formData.hosting || ""} onChange={v => set("hosting", v)} placeholder="Select hosting" />
              <FieldError k="hosting" />
            </div>
            {/* Criticality */}
            <div className="grid gap-1.5">
              <Label>Criticality <span className="text-destructive">*</span></Label>
              <MasterSelect category="criticality" value={formData.criticality || ""} onChange={v => set("criticality", v)} placeholder="Select criticality" />
              <FieldError k="criticality" />
            </div>
            {/* Application Status */}
            <div className="grid gap-1.5">
              <Label>Application Status</Label>
              <Select value={formData.applicationStatus || "Active"} onValueChange={v => set("applicationStatus", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Retired">Retired</SelectItem>
                  <SelectItem value="Stopped">Stopped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Support Status */}
            <div className="grid gap-1.5">
              <Label>Support Status</Label>
              <MasterSelect category="support_status" value={formData.supportStatus || ""} onChange={v => set("supportStatus", v)} placeholder="Select status" />
            </div>
            {/* Date of Onboarding */}
            <div className="grid gap-1.5">
              <Label>Date of Onboarding</Label>
              <Input type="date" value={formData.dateOfOnboarding || ""} onChange={e => set("dateOfOnboarding", e.target.value)} />
            </div>
            {/* Date of Retirement */}
            <div className="grid gap-1.5">
              <Label>
                Date of Retirement
                {formData.applicationStatus === "Retired" && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                type="date"
                value={formData.dateOfRetirement || ""}
                onChange={e => set("dateOfRetirement", e.target.value)}
                className={errors.dateOfRetirement ? "border-destructive" : ""}
              />
              <FieldError k="dateOfRetirement" />
            </div>
            {/* Annual Cost */}
            <div className="grid gap-1.5">
              <Label>Annual Cost (₹ Lakhs)</Label>
              <Input type="number" min={0} value={formData.annualCostLakhs || 0} onChange={e => set("annualCostLakhs", Number(e.target.value))} />
            </div>
            {/* Vendor */}
            <div className="grid gap-1.5">
              <Label>Vendor</Label>
              <MasterSelect category="vendor" value={(formData as any).vendor || ""} onChange={v => set("vendor" as any, v)} placeholder="Select vendor" />
            </div>
            {/* Comments - full width */}
            <div className="grid gap-1.5 col-span-2">
              <Label>Comments</Label>
              <Textarea
                value={formData.comments || ""}
                onChange={e => set("comments", e.target.value)}
                rows={2}
                placeholder="Any additional notes or comments about this application"
              />
            </div>
            {/* Is Active */}
            <div className="flex items-center gap-2 col-span-2">
              <Switch checked={formData.isActive !== false} onCheckedChange={v => set("isActive", v)} />
              <Label className="cursor-pointer">{formData.isActive !== false ? "Active" : "Inactive"}</Label>
            </div>
          </div>
          <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-2 flex justify-end gap-2 border-t bg-background px-6 py-3 sm:rounded-b-lg">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createItem.isPending || updateItem.isPending}>
              {editingItem ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
