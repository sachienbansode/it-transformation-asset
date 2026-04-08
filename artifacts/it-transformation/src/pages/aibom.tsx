import React, { useState } from "react";
import { useListAibomEntries, useCreateAibomEntry, useUpdateAibomEntry, useDeleteAibomEntry, getListAibomEntriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, AlertTriangle, Search, X } from "lucide-react";
import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AibomEntry } from "@workspace/api-client-react";
import { MasterSelect } from "@/components/master-select";
import { useMasters, getBadgeClass } from "@/hooks/use-masters";
import { useAuth } from "@/contexts/auth-context";
import { ImportExportMenu } from "@/components/import-export-menu";
import { Pagination } from "@/components/pagination";

const PAGE_SIZE = 10;

export default function Aibom() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { data: items } = useListAibomEntries();
  
  const createItem = useCreateAibomEntry();
  const updateItem = useUpdateAibomEntry();
  const deleteItem = useDeleteAibomEntry();

  const { data: riskLevels } = useMasters("risk_level");
  const { data: complianceStatuses } = useMasters("compliance_status");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterRisk, setFilterRisk] = useState("all");
  const [filterCompliance, setFilterCompliance] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AibomEntry | null>(null);
  const [formData, setFormData] = useState<Partial<AibomEntry>>({}); 

  const filteredItems = useMemo(() => (items || []).filter(item => {
    const q = search.toLowerCase();
    if (q && !item.name?.toLowerCase().includes(q) && !item.provider?.toLowerCase().includes(q) && !item.type?.toLowerCase().includes(q)) return false;
    if (filterRisk !== "all" && item.riskLevel !== filterRisk) return false;
    if (filterCompliance !== "all" && item.complianceStatus !== filterCompliance) return false;
    return true;
  }), [items, search, filterRisk, filterCompliance]);

  const handleOpenModal = (item: AibomEntry | null = null) => {
    setEditingItem(item);
    setFormData(item || { componentId: "", name: "", type: "", provider: "", riskLevel: "", complianceStatus: "" });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAibomEntriesQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Updated successfully" });
        }
      });
    } else {
      createItem.mutate({ data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAibomEntriesQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Created successfully" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this AI component?")) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAibomEntriesQueryKey() });
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

  const getComplianceBadge = (status: string) => {
    const m = complianceStatuses?.find(c => c.label === status);
    if (m?.color) return getBadgeClass(m.color);
    if (status === "Compliant") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (status === "Non-Compliant") return "bg-red-500/20 text-red-400 border-red-500/30";
    return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  };

  const totalComponents = items?.length || 0;
  const highRisk = items?.filter(i => i.riskLevel === "High" || i.riskLevel === "Critical").length || 0;
  const nonCompliant = items?.filter(i => i.complianceStatus === "Non-Compliant").length || 0;

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">AI Bill of Materials (AIBOM)</h2>
          <p className="text-muted-foreground">AI/ML components used across Ashika Group systems</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportMenu module="aibom" label="AIBOM" onImportSuccess={() => queryClient.invalidateQueries({ queryKey: getListAibomEntriesQueryKey() })} />
          {isAdmin && (
            <Button onClick={() => handleOpenModal(null)}>
              <Plus className="mr-2 h-4 w-4" /> Add AI Component
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total AI Components</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalComponents}</div></CardContent>
        </Card>
        <Card className={highRisk > 0 ? "bg-destructive/10 border-destructive/20" : ""}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">High / Critical Risk</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold flex items-center ${highRisk > 0 ? "text-destructive" : ""}`}><AlertTriangle className="h-5 w-5 mr-2" />{highRisk}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Non-Compliant</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${nonCompliant > 0 ? "text-orange-500" : ""}`}>{nonCompliant}</div></CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, provider, type…"
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
        <Select value={filterCompliance} onValueChange={v => { setFilterCompliance(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Compliance" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {complianceStatuses?.map(c => <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || filterRisk !== "all" || filterCompliance !== "all") && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setSearch(""); setFilterRisk("all"); setFilterCompliance("all"); setPage(1); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filteredItems.length} of {totalComponents} shown</span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Comp ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Use Case</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Compliance</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.componentId}</TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell><Badge variant="outline">{item.type}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{item.provider}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-32 truncate">{(item as any).useCase || "-"}</TableCell>
                <TableCell><Badge className={getRiskBadgeClass(item.riskLevel)}>{item.riskLevel}</Badge></TableCell>
                <TableCell><Badge className={getComplianceBadge(item.complianceStatus)}>{item.complianceStatus}</Badge></TableCell>
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
              <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="py-10 text-center text-sm text-muted-foreground">No AI components found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <div className="px-4 pb-3">
          <Pagination page={page} totalPages={totalPages} totalItems={totalComponents} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingItem ? "Edit AI Component" : "Add AI Component"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 grid-cols-2">
            <div className="grid gap-2">
              <Label>Component ID</Label>
              <Input value={formData.componentId || ""} onChange={e => setFormData({...formData, componentId: e.target.value})} placeholder="AI-001" />
            </div>
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <MasterSelect category="ai_type" value={formData.type || ""} onChange={v => setFormData({...formData, type: v})} placeholder="Select type" />
            </div>
            <div className="grid gap-2">
              <Label>Provider / Vendor</Label>
              <MasterSelect category="vendor" value={formData.provider || ""} onChange={v => setFormData({...formData, provider: v})} placeholder="Select vendor" />
            </div>
            <div className="grid gap-2">
              <Label>Risk Level</Label>
              <MasterSelect category="risk_level" value={formData.riskLevel || ""} onChange={v => setFormData({...formData, riskLevel: v})} placeholder="Select risk" />
            </div>
            <div className="grid gap-2">
              <Label>Compliance Status</Label>
              <MasterSelect category="compliance_status" value={formData.complianceStatus || ""} onChange={v => setFormData({...formData, complianceStatus: v})} placeholder="Select status" />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Use Case</Label>
              <Textarea value={(formData as any).useCase || ""} onChange={e => setFormData({...formData, ...({useCase: e.target.value} as any)})} placeholder="Describe the AI use case..." rows={2} />
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
