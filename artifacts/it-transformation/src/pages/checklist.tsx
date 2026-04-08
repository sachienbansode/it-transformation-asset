import React, { useState } from "react";
import { useListChecklistItems, useCreateChecklistItem, useUpdateChecklistItem, useDeleteChecklistItem, useGetChecklistStats, getListChecklistItemsQueryKey, getGetChecklistStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Trash2, Edit } from "lucide-react";
import type { ChecklistItem } from "@workspace/api-client-react";
import { MasterSelect } from "@/components/master-select";
import { useMasters, getBadgeClass } from "@/hooks/use-masters";
import { useAuth } from "@/contexts/auth-context";

export default function Checklist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { data: items } = useListChecklistItems();
  
  const createItem = useCreateChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const deleteItem = useDeleteChecklistItem();

  const { data: businesses } = useMasters("business");
  const { data: statuses } = useMasters("checklist_status");
  const { data: priorities } = useMasters("priority");

  const [search, setSearch] = useState("");
  const [filterBusiness, setFilterBusiness] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [formData, setFormData] = useState<Partial<ChecklistItem>>({});

  const filteredItems = items?.filter(item => {
    if (search && !item.feature.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterBusiness !== "all" && item.business !== filterBusiness) return false;
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    return true;
  });

  const handleOpenModal = (item: ChecklistItem | null = null) => {
    setEditingItem(item);
    setFormData(item || { category: "", feature: "", business: "", status: "", priority: "" });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetChecklistStatsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Updated successfully" });
        }
      });
    } else {
      createItem.mutate({ data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetChecklistStatsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Created successfully" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this item?")) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetChecklistStatsQueryKey() });
          toast({ title: "Deleted successfully" });
        }
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const m = statuses?.find(s => s.label === status);
    if (m?.color) return getBadgeClass(m.color);
    if (status === "Available") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (status === "Partial") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    if (status === "Not Available") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (status === "Legacy") return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    return "bg-secondary text-secondary-foreground";
  };

  const getPriorityBadge = (prio: string) => {
    const m = priorities?.find(p => p.label === prio);
    if (m?.color) return getBadgeClass(m.color);
    if (prio === "High") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (prio === "Medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    if (prio === "Low") return "bg-green-500/20 text-green-400 border-green-500/30";
    return "bg-secondary text-secondary-foreground";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">IT Master Checklist</h2>
          <p className="text-muted-foreground">Total items: {items?.length || 0} | Filtered: {filteredItems?.length || 0}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => handleOpenModal(null)}>
            <Plus className="mr-2 h-4 w-4" /> Add Item
          </Button>
        )}
      </div>

      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search features..." 
            className="pl-8" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>
        <Select value={filterBusiness} onValueChange={setFilterBusiness}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Businesses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Businesses</SelectItem>
            {businesses?.map(b => <SelectItem key={b.id} value={b.label}>{b.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses?.map(s => <SelectItem key={s.id} value={s.label}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Feature</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Current App</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-xs text-muted-foreground">{item.category}</TableCell>
                <TableCell>{item.feature}</TableCell>
                <TableCell><Badge variant="outline">{item.business}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{item.currentApp || "-"}</TableCell>
                <TableCell><Badge className={getStatusBadge(item.status)}>{item.status}</Badge></TableCell>
                <TableCell><Badge className={getPriorityBadge(item.priority)}>{item.priority}</Badge></TableCell>
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
            {filteredItems?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No items found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add Checklist Item"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Category</Label>
                <MasterSelect category="checklist_category" value={formData.category || ""} onChange={v => setFormData({...formData, category: v})} placeholder="Select category" />
              </div>
              <div className="grid gap-2">
                <Label>Business Unit</Label>
                <MasterSelect category="business" value={formData.business || ""} onChange={v => setFormData({...formData, business: v})} placeholder="Select business" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Feature / Requirement</Label>
              <Input value={formData.feature || ""} onChange={e => setFormData({...formData, feature: e.target.value})} placeholder="Describe the feature" />
            </div>
            <div className="grid gap-2">
              <Label>Current App / System</Label>
              <Input value={formData.currentApp || ""} onChange={e => setFormData({...formData, currentApp: e.target.value})} placeholder="Existing system name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <MasterSelect category="checklist_status" value={formData.status || ""} onChange={v => setFormData({...formData, status: v})} placeholder="Select status" />
              </div>
              <div className="grid gap-2">
                <Label>Priority</Label>
                <MasterSelect category="priority" value={formData.priority || ""} onChange={v => setFormData({...formData, priority: v})} placeholder="Select priority" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Comments</Label>
              <Textarea value={formData.comments || ""} onChange={e => setFormData({...formData, comments: e.target.value})} placeholder="Additional notes..." />
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
