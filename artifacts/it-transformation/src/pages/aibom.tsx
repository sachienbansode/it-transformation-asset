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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, AlertTriangle } from "lucide-react";
import type { AibomEntry } from "@workspace/api-client-react";

export default function Aibom() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: items } = useListAibomEntries();
  
  const createItem = useCreateAibomEntry();
  const updateItem = useUpdateAibomEntry();
  const deleteItem = useDeleteAibomEntry();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AibomEntry | null>(null);
  const [formData, setFormData] = useState<Partial<AibomEntry>>({});

  const handleOpenModal = (item: AibomEntry | null = null) => {
    setEditingItem(item);
    setFormData(item || { componentId: "", name: "", type: "LLM", provider: "", riskLevel: "Medium", complianceStatus: "Pending" });
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
    if (risk === "Critical" || risk === "High") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (risk === "Medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-green-500/20 text-green-400 border-green-500/30";
  };

  const totalComponents = items?.length || 0;
  const highRisk = items?.filter(i => i.riskLevel === "High" || i.riskLevel === "Critical").length || 0;
  const nonCompliant = items?.filter(i => i.complianceStatus === "Non-Compliant").length || 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">AI Bill of Materials (AIBOM)</h2>
        <Button onClick={() => handleOpenModal(null)}>
          <Plus className="mr-2 h-4 w-4" /> Add AI Component
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total AI Components</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalComponents}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">High Risk</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive flex items-center"><AlertTriangle className="h-5 w-5 mr-2" />{highRisk}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Non-Compliant</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-orange-500">{nonCompliant}</div></CardContent>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Comp ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Compliance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.componentId}</TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell><Badge variant="outline">{item.type}</Badge></TableCell>
                <TableCell>{item.provider}</TableCell>
                <TableCell><Badge className={getRiskBadgeClass(item.riskLevel)}>{item.riskLevel}</Badge></TableCell>
                <TableCell><Badge className={item.complianceStatus === 'Compliant' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>{item.complianceStatus}</Badge></TableCell>
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
        <DialogContent>
          <DialogHeader><DialogTitle>{editingItem ? "Edit AI Component" : "Add AI Component"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 grid-cols-2">
            <div className="grid gap-2"><Label>Comp ID</Label><Input value={formData.componentId || ""} onChange={e => setFormData({...formData, componentId: e.target.value})} /></div>
            <div className="grid gap-2"><Label>Name</Label><Input value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
            <div className="grid gap-2"><Label>Type</Label><Input value={formData.type || ""} onChange={e => setFormData({...formData, type: e.target.value})} /></div>
            <div className="grid gap-2"><Label>Provider</Label><Input value={formData.provider || ""} onChange={e => setFormData({...formData, provider: e.target.value})} /></div>
            <div className="grid gap-2">
              <Label>Risk Level</Label>
              <Select value={formData.riskLevel || ""} onValueChange={v => setFormData({...formData, riskLevel: v})}>
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
              <Label>Compliance</Label>
              <Select value={formData.complianceStatus || ""} onValueChange={v => setFormData({...formData, complianceStatus: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Compliant">Compliant</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Non-Compliant">Non-Compliant</SelectItem>
                </SelectContent>
              </Select>
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
