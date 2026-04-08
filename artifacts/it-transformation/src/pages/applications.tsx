import React, { useState } from "react";
import { useListApplications, useCreateApplication, useUpdateApplication, useDeleteApplication, getListApplicationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Search } from "lucide-react";
import type { Application } from "@workspace/api-client-react";
import { MasterSelect } from "@/components/master-select";
import { useMasters, getBadgeClass } from "@/hooks/use-masters";
import { useCurrency } from "@/contexts/currency-context";
import { useAuth } from "@/contexts/auth-context";
import { ImportExportMenu } from "@/components/import-export-menu";

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Application | null>(null);
  const [formData, setFormData] = useState<Partial<Application>>({});

  const filteredItems = items?.filter(item => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !item.appId.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterBusiness && item.business !== filterBusiness) return false;
    if (filterHosting && item.hosting !== filterHosting) return false;
    return true;
  });

  const handleOpenModal = (item: Application | null = null) => {
    setEditingItem(item);
    setFormData(item || { appId: "", name: "", business: "", category: "", hosting: "", criticality: "", supportStatus: "" });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Updated successfully" });
        }
      });
    } else {
      createItem.mutate({ data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Created successfully" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this app?")) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          toast({ title: "Deleted successfully" });
        }
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Application Inventory</h2>
          <p className="text-muted-foreground">Total apps: {items?.length || 0} | Filtered: {filteredItems?.length || 0}</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportMenu module="applications" label="Applications" onImportSuccess={() => queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() })} />
          {isAdmin && (
            <Button onClick={() => handleOpenModal(null)}>
              <Plus className="mr-2 h-4 w-4" /> Add Application
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or ID..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterBusiness || "all"} onValueChange={v => setFilterBusiness(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Businesses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Businesses</SelectItem>
            {businesses?.map(b => <SelectItem key={b.id} value={b.label}>{b.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterHosting || "all"} onValueChange={v => setFilterHosting(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Hosting" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hosting</SelectItem>
            {hostings?.map(h => <SelectItem key={h.id} value={h.label}>{h.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>App ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Hosting</TableHead>
              <TableHead>Criticality</TableHead>
              <TableHead>Support Status</TableHead>
              <TableHead>Annual Cost</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.appId}</TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell><Badge variant="outline">{item.business}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{item.category}</TableCell>
                <TableCell><Badge variant="secondary">{item.hosting}</Badge></TableCell>
                <TableCell><Badge className={getCriticalityBadge(item.criticality)}>{item.criticality}</Badge></TableCell>
                <TableCell><Badge className={item.supportStatus === 'Unsupported' ? 'bg-red-500/20 text-red-400 border-red-500/30' : item.supportStatus === 'Limited Support' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}>{item.supportStatus}</Badge></TableCell>
                <TableCell className="text-sm">{item.annualCostLakhs ? format(item.annualCostLakhs) : "-"}</TableCell>
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
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingItem ? "Edit Application" : "Add Application"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 grid-cols-2">
            <div className="grid gap-2"><Label>App ID</Label><Input value={formData.appId || ""} onChange={e => setFormData({...formData, appId: e.target.value})} placeholder="APP-001" /></div>
            <div className="grid gap-2"><Label>Name</Label><Input value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
            <div className="grid gap-2">
              <Label>Business Unit</Label>
              <MasterSelect category="business" value={formData.business || ""} onChange={v => setFormData({...formData, business: v})} placeholder="Select business" />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <MasterSelect category="app_category" value={formData.category || ""} onChange={v => setFormData({...formData, category: v})} placeholder="Select category" />
            </div>
            <div className="grid gap-2">
              <Label>Hosting</Label>
              <MasterSelect category="hosting" value={formData.hosting || ""} onChange={v => setFormData({...formData, hosting: v})} placeholder="Select hosting" />
            </div>
            <div className="grid gap-2">
              <Label>Criticality</Label>
              <MasterSelect category="criticality" value={formData.criticality || ""} onChange={v => setFormData({...formData, criticality: v})} placeholder="Select criticality" />
            </div>
            <div className="grid gap-2">
              <Label>Support Status</Label>
              <MasterSelect category="support_status" value={formData.supportStatus || ""} onChange={v => setFormData({...formData, supportStatus: v})} placeholder="Select status" />
            </div>
            <div className="grid gap-2"><Label>Annual Cost (₹ Lakhs)</Label><Input type="number" value={formData.annualCostLakhs || 0} onChange={e => setFormData({...formData, annualCostLakhs: Number(e.target.value)})} /></div>
            <div className="grid gap-2 col-span-2">
              <Label>Vendor</Label>
              <MasterSelect category="vendor" value={(formData as any).vendor || ""} onChange={v => setFormData({...formData, ...({vendor: v} as any)})} placeholder="Select vendor" />
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
