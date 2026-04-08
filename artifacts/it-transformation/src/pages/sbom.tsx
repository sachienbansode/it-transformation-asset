import React, { useState } from "react";
import { useListSbomEntries, useCreateSbomEntry, useUpdateSbomEntry, useDeleteSbomEntry, getListSbomEntriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, ShieldAlert, Search, X } from "lucide-react";
import { useMemo } from "react";
import type { SbomEntry } from "@workspace/api-client-react";
import { MasterSelect } from "@/components/master-select";
import { useMasters, getBadgeClass } from "@/hooks/use-masters";
import { useAuth } from "@/contexts/auth-context";
import { ImportExportMenu } from "@/components/import-export-menu";
import { Pagination } from "@/components/pagination";

const PAGE_SIZE = 10;

export default function Sbom() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { data: items } = useListSbomEntries();
  
  const createItem = useCreateSbomEntry();
  const updateItem = useUpdateSbomEntry();
  const deleteItem = useDeleteSbomEntry();

  const { data: riskLevels } = useMasters("risk_level");
  const { data: licenseTypes } = useMasters("license_type");

  const [filterRisk, setFilterRisk] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SbomEntry | null>(null);
  const [formData, setFormData] = useState<Partial<SbomEntry>>({});

  const filteredItems = useMemo(() => (items || []).filter(item => {
    const q = search.toLowerCase();
    if (q && !item.name?.toLowerCase().includes(q) && !item.cve?.toLowerCase().includes(q) && !item.version?.toLowerCase().includes(q)) return false;
    if (filterRisk !== "all" && item.riskLevel !== filterRisk) return false;
    return true;
  }), [items, search, filterRisk]);

  const handleOpenModal = (item: SbomEntry | null = null) => {
    setEditingItem(item);
    setFormData(item || { name: "", version: "", licenseType: "", riskLevel: "", cve: "" });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSbomEntriesQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Updated successfully" });
        }
      });
    } else {
      createItem.mutate({ data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSbomEntriesQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Created successfully" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this software component?")) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSbomEntriesQueryKey() });
          toast({ title: "Deleted successfully" });
        }
      });
    }
  };

  const getRiskBadgeClass = (risk: string) => {
    const m = riskLevels?.find(r => r.label === risk);
    if (m?.color) return getBadgeClass(m.color);
    if (risk === "Critical" || risk === "High") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (risk === "Medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-green-500/20 text-green-400 border-green-500/30";
  };

  const totalComponents = items?.length || 0;
  const highRisk = items?.filter(i => i.riskLevel === "High" || i.riskLevel === "Critical").length || 0;
  const criticalCves = items?.filter(i => i.cve && i.cve !== "None" && i.cve !== "").length || 0;

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Software Bill of Materials (SBOM)</h2>
          <p className="text-muted-foreground">Third-party software dependencies and CVE tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportMenu module="sbom" label="SBOM" onImportSuccess={() => queryClient.invalidateQueries({ queryKey: getListSbomEntriesQueryKey() })} />
          {isAdmin && (
            <Button onClick={() => handleOpenModal(null)}>
              <Plus className="mr-2 h-4 w-4" /> Add SBOM Entry
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Entries</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalComponents}</div></CardContent>
        </Card>
        <Card className={criticalCves > 0 ? "bg-destructive/10 border-destructive/20" : ""}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-destructive">Known CVEs</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive flex items-center"><ShieldAlert className="h-5 w-5 mr-2" />{criticalCves}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">High / Critical Risk</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${highRisk > 0 ? "text-orange-500" : ""}`}>{highRisk}</div></CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search package, CVE, version…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          {search && <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2 top-2"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>
        <Select value={filterRisk} onValueChange={v => { setFilterRisk(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Risk Level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            {riskLevels?.map(r => <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || filterRisk !== "all") && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setSearch(""); setFilterRisk("all"); setPage(1); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filteredItems.length} of {totalComponents} shown</span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Package Name</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>License</TableHead>
              <TableHead>CVE</TableHead>
              <TableHead>Risk Level</TableHead>
              <TableHead>Action Required</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium font-mono text-sm">{item.name}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{item.version}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{item.licenseType}</Badge></TableCell>
                <TableCell>
                  {item.cve && item.cve !== "None" && item.cve !== "" ? (
                    <Badge variant="destructive" className="text-xs font-mono">{item.cve}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell><Badge className={getRiskBadgeClass(item.riskLevel)}>{item.riskLevel}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-40 truncate">{item.actionRequired || "-"}</TableCell>
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
              <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="py-10 text-center text-sm text-muted-foreground">No SBOM entries found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <div className="px-4 pb-3">
          <Pagination page={page} totalPages={totalPages} totalItems={filteredItems.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingItem ? "Edit SBOM Entry" : "Add SBOM Entry"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 grid-cols-2">
            <div className="grid gap-2">
              <Label>Package Name</Label>
              <Input value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. lodash" />
            </div>
            <div className="grid gap-2">
              <Label>Version</Label>
              <Input value={formData.version || ""} onChange={e => setFormData({...formData, version: e.target.value})} placeholder="e.g. 4.17.21" />
            </div>
            <div className="grid gap-2">
              <Label>License Type</Label>
              <MasterSelect category="license_type" value={formData.licenseType || ""} onChange={v => setFormData({...formData, licenseType: v})} placeholder="Select license" />
            </div>
            <div className="grid gap-2">
              <Label>CVE Identifier</Label>
              <Input value={formData.cve || ""} onChange={e => setFormData({...formData, cve: e.target.value})} placeholder="e.g. CVE-2024-xxxx or None" />
            </div>
            <div className="grid gap-2">
              <Label>Risk Level</Label>
              <MasterSelect category="risk_level" value={formData.riskLevel || ""} onChange={v => setFormData({...formData, riskLevel: v})} placeholder="Select risk" />
            </div>
            <div className="grid gap-2">
              <Label>Action Required</Label>
              <Input value={formData.actionRequired || ""} onChange={e => setFormData({...formData, actionRequired: e.target.value})} placeholder="e.g. Upgrade to 4.17.22" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
