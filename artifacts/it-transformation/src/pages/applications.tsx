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

export default function Applications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: items } = useListApplications();
  
  const createItem = useCreateApplication();
  const updateItem = useUpdateApplication();
  const deleteItem = useDeleteApplication();

  const [search, setSearch] = useState("");
  const [filterBusiness, setFilterBusiness] = useState("All");
  const [filterHosting, setFilterHosting] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Application | null>(null);
  const [formData, setFormData] = useState<Partial<Application>>({});

  const filteredItems = items?.filter(item => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !item.appId.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterBusiness !== "All" && item.business !== filterBusiness) return false;
    if (filterHosting !== "All" && item.hosting !== filterHosting) return false;
    return true;
  });

  const handleOpenModal = (item: Application | null = null) => {
    setEditingItem(item);
    setFormData(item || { appId: "", name: "", business: "", category: "", hosting: "Cloud", criticality: "High", supportStatus: "Supported" });
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
    if (crit === "High" || crit === "Critical") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (crit === "Medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-green-500/20 text-green-400 border-green-500/30";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Application Inventory</h2>
          <p className="text-muted-foreground">Total apps: {items?.length || 0}</p>
        </div>
        <Button onClick={() => handleOpenModal(null)}>
          <Plus className="mr-2 h-4 w-4" /> Add Application
        </Button>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search apps..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterBusiness} onValueChange={setFilterBusiness}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Business" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Businesses</SelectItem>
            <SelectItem value="Broking">Broking</SelectItem>
            <SelectItem value="NBFC">NBFC</SelectItem>
            <SelectItem value="AIF">AIF</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterHosting} onValueChange={setFilterHosting}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Hosting" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Hosting</SelectItem>
            <SelectItem value="Cloud">Cloud</SelectItem>
            <SelectItem value="On-Premise">On-Premise</SelectItem>
            <SelectItem value="Hybrid">Hybrid</SelectItem>
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
              <TableHead>Hosting</TableHead>
              <TableHead>Criticality</TableHead>
              <TableHead>Support Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.appId}</TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell><Badge variant="outline">{item.business}</Badge></TableCell>
                <TableCell><Badge variant="secondary">{item.hosting}</Badge></TableCell>
                <TableCell><Badge className={getCriticalityBadge(item.criticality)}>{item.criticality}</Badge></TableCell>
                <TableCell><Badge className={item.supportStatus === 'Unsupported' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}>{item.supportStatus}</Badge></TableCell>
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
          <DialogHeader><DialogTitle>{editingItem ? "Edit Application" : "Add Application"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 grid-cols-2">
            <div className="grid gap-2"><Label>App ID</Label><Input value={formData.appId || ""} onChange={e => setFormData({...formData, appId: e.target.value})} /></div>
            <div className="grid gap-2"><Label>Name</Label><Input value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
            <div className="grid gap-2"><Label>Business</Label><Input value={formData.business || ""} onChange={e => setFormData({...formData, business: e.target.value})} /></div>
            <div className="grid gap-2"><Label>Category</Label><Input value={formData.category || ""} onChange={e => setFormData({...formData, category: e.target.value})} /></div>
            <div className="grid gap-2">
              <Label>Hosting</Label>
              <Select value={formData.hosting || ""} onValueChange={v => setFormData({...formData, hosting: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cloud">Cloud</SelectItem>
                  <SelectItem value="On-Premise">On-Premise</SelectItem>
                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Criticality</Label>
              <Select value={formData.criticality || ""} onValueChange={v => setFormData({...formData, criticality: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Critical">Critical</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Support Status</Label>
              <Select value={formData.supportStatus || ""} onValueChange={v => setFormData({...formData, supportStatus: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Supported">Supported</SelectItem>
                  <SelectItem value="Limited Support">Limited Support</SelectItem>
                  <SelectItem value="Unsupported">Unsupported</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Annual Cost (₹ Lakhs)</Label><Input type="number" value={formData.annualCostLakhs || 0} onChange={e => setFormData({...formData, annualCostLakhs: Number(e.target.value)})} /></div>
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
