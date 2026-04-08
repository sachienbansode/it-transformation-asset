import React, { useState, useMemo } from "react";
import {
  useListRetirements,
  useCreateRetirement,
  useUpdateRetirement,
  useDeleteRetirement,
  getListRetirementsQueryKey,
  useListApplications,
} from "@workspace/api-client-react";
import type { Retirement } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Search, X, User } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MasterSelect } from "@/components/master-select";
import { useCurrency } from "@/contexts/currency-context";
import { useAuth } from "@/contexts/auth-context";
import { ImportExportMenu } from "@/components/import-export-menu";
import { Pagination } from "@/components/pagination";

const PAGE_SIZE = 10;

export default function Retirements() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { data: items } = useListRetirements();
  const { data: allApps } = useListApplications();
  const { format } = useCurrency();

  const createItem = useCreateRetirement();
  const updateItem = useUpdateRetirement();
  const deleteItem = useDeleteRetirement();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterBusiness, setFilterBusiness] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Retirement | null>(null);
  const [formData, setFormData] = useState<Partial<Retirement>>({});
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);

  const businesses = useMemo(
    () => [...new Set((items || []).map(i => i.business).filter(Boolean))].sort(),
    [items]
  );

  const filteredItems = useMemo(
    () =>
      (items || []).filter(item => {
        const q = search.toLowerCase();
        if (
          q &&
          !item.appName?.toLowerCase().includes(q) &&
          !item.business?.toLowerCase().includes(q) &&
          !item.reason?.toLowerCase().includes(q)
        )
          return false;
        if (filterBusiness !== "all" && item.business !== filterBusiness) return false;
        if (filterStatus !== "all" && item.status !== filterStatus) return false;
        return true;
      }),
    [items, search, filterBusiness, filterStatus]
  );

  const activeApps = useMemo(
    () => (allApps || []).filter(a => a.applicationStatus !== "Retired" && a.isActive !== false),
    [allApps]
  );

  const linkedApp = useMemo(() => {
    if (!selectedAppId) return null;
    return activeApps.find(a => a.id === selectedAppId) ?? null;
  }, [selectedAppId, activeApps]);

  const handleOpenModal = (item: Retirement | null = null) => {
    setEditingItem(item);
    if (item) {
      setSelectedAppId(item.applicationId ?? null);
      setFormData({
        applicationId: item.applicationId,
        appName: item.appName,
        business: item.business,
        reason: item.reason,
        migrationEffort: item.migrationEffort,
        status: item.status,
        budgetLakhs: item.budgetLakhs ?? 0,
        targetDate: item.targetDate ?? "",
        successor: item.successor ?? "",
        comments: item.comments ?? "",
      });
    } else {
      setSelectedAppId(null);
      setFormData({ appName: "", business: "", reason: "", migrationEffort: "", status: "Planned", budgetLakhs: 0 });
    }
    setIsModalOpen(true);
  };

  const handleAppSelect = (appIdStr: string) => {
    const appId = appIdStr === "none" ? null : Number(appIdStr);
    setSelectedAppId(appId);
    if (appId) {
      const app = activeApps.find(a => a.id === appId);
      if (app) {
        setFormData(prev => ({
          ...prev,
          applicationId: appId,
          appName: app.name,
          business: app.business ?? "",
        }));
      }
    } else {
      setFormData(prev => ({ ...prev, applicationId: undefined, appName: "", business: "" }));
    }
  };

  const handleSave = () => {
    const payload = { ...formData, applicationId: selectedAppId ?? undefined };
    if (editingItem) {
      updateItem.mutate(
        { id: editingItem.id, data: payload as any },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() });
            setIsModalOpen(false);
            toast({ title: "Updated successfully" });
          },
        }
      );
    } else {
      createItem.mutate(
        { data: payload as any },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() });
            setIsModalOpen(false);
            toast({ title: "Created successfully" });
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this retirement plan?")) {
      deleteItem.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() });
            toast({ title: "Deleted successfully" });
          },
        }
      );
    }
  };

  const totalPlanned = items?.length || 0;
  const inProgress = items?.filter(i => i.status === "In Progress").length || 0;
  const totalBudget = items?.reduce((sum, item) => sum + (item.budgetLakhs || 0), 0) || 0;

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const getEffortBadge = (effort: string) => {
    if (effort === "High") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (effort === "Medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-green-500/20 text-green-400 border-green-500/30";
  };

  const getStatusBadge = (status: string) => {
    if (status === "Completed") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (status === "In Progress") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">App Retirement Plan</h2>
          <p className="text-xs text-muted-foreground">{totalPlanned} total · {filteredItems.length} shown</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ImportExportMenu
            module="retirements"
            label="Retirements"
            onImportSuccess={() => queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() })}
          />
          {isAdmin && (
            <Button size="sm" onClick={() => handleOpenModal(null)}>
              <Plus className="mr-2 h-4 w-4" /> Add Plan
            </Button>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search app, business, reason…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2 top-2">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={filterBusiness} onValueChange={v => { setFilterBusiness(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Business Unit" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Business Units</SelectItem>
            {businesses.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {["Planned", "In Progress", "Completed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || filterBusiness !== "all" || filterStatus !== "all") && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setSearch(""); setFilterBusiness("all"); setFilterStatus("all"); setPage(1); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Planned</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalPlanned}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{inProgress}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Budget</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{format(totalBudget)}</div></CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>App Name</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Target Date</TableHead>
              <TableHead>Successor</TableHead>
              <TableHead>Effort</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created By</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedItems.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.appName}</TableCell>
                <TableCell><Badge variant="outline">{item.business}</Badge></TableCell>
                <TableCell><Badge variant="secondary">{item.reason}</Badge></TableCell>
                <TableCell className="text-xs">{item.targetDate || "-"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{item.successor || "-"}</TableCell>
                <TableCell><Badge className={getEffortBadge(item.migrationEffort)}>{item.migrationEffort}</Badge></TableCell>
                <TableCell className="font-medium">{format(item.budgetLakhs || 0)}</TableCell>
                <TableCell><Badge className={getStatusBadge(item.status)}>{item.status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-28 truncate">
                  {(item as any).createdBy ? (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate">{(item as any).createdBy.split(" <")[0]}</span>
                    </span>
                  ) : "-"}
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {pagedItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 10 : 9} className="py-10 text-center text-sm text-muted-foreground">
                  No retirement plans found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="px-4 pb-3">
          <Pagination page={page} totalPages={totalPages} totalItems={items?.length || 0} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingItem ? "Edit Retirement Plan" : "Add Retirement Plan"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Application Selector */}
            <div className="grid gap-2">
              <Label>Link to Application Inventory</Label>
              <Select
                value={selectedAppId ? String(selectedAppId) : "none"}
                onValueChange={handleAppSelect}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select application (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Enter manually —</SelectItem>
                  {activeApps.map(app => (
                    <SelectItem key={app.id} value={String(app.id)}>
                      {app.name} {app.business ? `(${app.business})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkedApp && (
                <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground grid grid-cols-2 gap-1">
                  <span><strong>Vendor:</strong> {linkedApp.vendor || "-"}</span>
                  <span><strong>Category:</strong> {linkedApp.category || "-"}</span>
                  <span><strong>Hosting:</strong> {linkedApp.hosting || "-"}</span>
                  <span><strong>Criticality:</strong> {linkedApp.criticality || "-"}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>App Name</Label>
                {linkedApp ? (
                  <Input value={formData.appName || ""} disabled className="bg-muted/40 text-muted-foreground" />
                ) : (
                  <Input value={formData.appName || ""} onChange={e => setFormData({ ...formData, appName: e.target.value })} />
                )}
              </div>
              <div className="grid gap-2">
                <Label>Business Unit</Label>
                {linkedApp ? (
                  <Input value={formData.business || ""} disabled className="bg-muted/40 text-muted-foreground" />
                ) : (
                  <MasterSelect category="business" value={formData.business || ""} onChange={v => setFormData({ ...formData, business: v })} placeholder="Select business" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Retirement Reason</Label>
                <MasterSelect category="retirement_reason" value={formData.reason || ""} onChange={v => setFormData({ ...formData, reason: v })} placeholder="Select reason" />
              </div>
              <div className="grid gap-2">
                <Label>Target Date</Label>
                <Input type="date" value={formData.targetDate || ""} onChange={e => setFormData({ ...formData, targetDate: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Successor App</Label>
                <Input value={formData.successor || ""} onChange={e => setFormData({ ...formData, successor: e.target.value })} placeholder="Replacement system" />
              </div>
              <div className="grid gap-2">
                <Label>Migration Effort</Label>
                <MasterSelect category="migration_effort" value={formData.migrationEffort || ""} onChange={v => setFormData({ ...formData, migrationEffort: v })} placeholder="Select effort" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Budget (₹ Lakhs)</Label>
                <Input type="number" value={formData.budgetLakhs || 0} onChange={e => setFormData({ ...formData, budgetLakhs: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <MasterSelect category="retirement_status" value={formData.status || ""} onChange={v => setFormData({ ...formData, status: v })} placeholder="Select status" />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Comments</Label>
              <Input value={formData.comments || ""} onChange={e => setFormData({ ...formData, comments: e.target.value })} placeholder="Additional notes" />
            </div>
          </div>

          {formData.status === "Completed" && selectedAppId && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
              Marking as <strong>Completed</strong> will automatically update the linked application's status to <strong>Retired</strong> in Application Inventory.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
