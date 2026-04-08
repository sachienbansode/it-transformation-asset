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
import { Plus, Trash2, Edit, ShieldAlert } from "lucide-react";
import type { SbomEntry } from "@workspace/api-client-react";
import { MasterSelect } from "@/components/master-select";
import { useMasters, getBadgeClass } from "@/hooks/use-masters";

export default function Sbom() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: items } = useListSbomEntries();
  
  const createItem = useCreateSbomEntry();
  const updateItem = useUpdateSbomEntry();
  const deleteItem = useDeleteSbomEntry();

  const { data: riskLevels } = useMasters("risk_level");
  const { data: licenseTypes } = useMasters("license_type");

  const [filterRisk, setFilterRisk] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SbomEntry | null>(null);
  const [formData, setFormData] = useState<Partial<SbomEntry>>({});

  const filteredItems = items?.filter(item => {
    if (filterRisk !== "all" && item.riskLevel !== filterRisk) return false;
    return true;
  });

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Software Bill of Materials (SBOM)</h2>
          <p className="text-muted-foreground">Third-party software dependencies and CVE tracking</p>
        </div>
        <Button onClick={() => handleOpenModal(null)}>
          <Plus className="mr-2 h-4 w-4" /> Add SBOM Entry
        </Button>
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

      <div className="flex gap-4">
        <Select value={filterRisk} onValueChange={setFilterRisk}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Risk Levels" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            {riskLevels?.map(r => <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
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
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems?.map((item) => (
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
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenModal(item)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
