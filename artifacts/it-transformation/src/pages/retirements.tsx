import React, { useState } from "react";
import { useListRetirements, useCreateRetirement, useUpdateRetirement, useDeleteRetirement, getListRetirementsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit } from "lucide-react";
import type { Retirement } from "@workspace/api-client-react";
import { MasterSelect } from "@/components/master-select";
import { useCurrency } from "@/contexts/currency-context";
import { useAuth } from "@/contexts/auth-context";
import { ImportExportMenu } from "@/components/import-export-menu";

export default function Retirements() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { data: items } = useListRetirements();
  const { format } = useCurrency();
  
  const createItem = useCreateRetirement();
  const updateItem = useUpdateRetirement();
  const deleteItem = useDeleteRetirement();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Retirement | null>(null);
  const [formData, setFormData] = useState<Partial<Retirement>>({});

  const handleOpenModal = (item: Retirement | null = null) => {
    setEditingItem(item);
    setFormData(item || { appName: "", business: "", reason: "", migrationEffort: "", status: "", budgetLakhs: 0 });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Updated successfully" });
        }
      });
    } else {
      createItem.mutate({ data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Created successfully" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this retirement plan?")) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() });
          toast({ title: "Deleted successfully" });
        }
      });
    }
  };

  const totalPlanned = items?.length || 0;
  const inProgress = items?.filter(i => i.status === "In Progress").length || 0;
  const totalBudget = items?.reduce((sum, item) => sum + (item.budgetLakhs || 0), 0) || 0;

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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">App Retirement Plan</h2>
          <p className="text-muted-foreground">Planned decommissioning of legacy systems</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportMenu module="retirements" label="Retirements" onImportSuccess={() => queryClient.invalidateQueries({ queryKey: getListRetirementsQueryKey() })} />
          {isAdmin && (
            <Button onClick={() => handleOpenModal(null)}>
              <Plus className="mr-2 h-4 w-4" /> Add Plan
            </Button>
          )}
        </div>
      </div>

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
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.appName}</TableCell>
                <TableCell><Badge variant="outline">{item.business}</Badge></TableCell>
                <TableCell><Badge variant="secondary">{item.reason}</Badge></TableCell>
                <TableCell className="text-xs">{item.targetDate || "-"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{item.successor || "-"}</TableCell>
                <TableCell><Badge className={getEffortBadge(item.migrationEffort)}>{item.migrationEffort}</Badge></TableCell>
                <TableCell className="font-medium">{format(item.budgetLakhs || 0)}</TableCell>
                <TableCell><Badge className={getStatusBadge(item.status)}>{item.status}</Badge></TableCell>
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
        <DialogContent>
          <DialogHeader><DialogTitle>{editingItem ? "Edit Plan" : "Add Retirement Plan"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>App Name</Label>
                <Input value={formData.appName || ""} onChange={e => setFormData({...formData, appName: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label>Business Unit</Label>
                <MasterSelect category="business" value={formData.business || ""} onChange={v => setFormData({...formData, business: v})} placeholder="Select business" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Retirement Reason</Label>
                <MasterSelect category="retirement_reason" value={formData.reason || ""} onChange={v => setFormData({...formData, reason: v})} placeholder="Select reason" />
              </div>
              <div className="grid gap-2">
                <Label>Target Date</Label>
                <Input type="date" value={formData.targetDate || ""} onChange={e => setFormData({...formData, targetDate: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Successor App</Label>
                <Input value={formData.successor || ""} onChange={e => setFormData({...formData, successor: e.target.value})} placeholder="Replacement system" />
              </div>
              <div className="grid gap-2">
                <Label>Migration Effort</Label>
                <MasterSelect category="migration_effort" value={formData.migrationEffort || ""} onChange={v => setFormData({...formData, migrationEffort: v})} placeholder="Select effort" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Budget (₹ Lakhs)</Label>
                <Input type="number" value={formData.budgetLakhs || 0} onChange={e => setFormData({...formData, budgetLakhs: Number(e.target.value)})} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <MasterSelect category="retirement_status" value={formData.status || ""} onChange={v => setFormData({...formData, status: v})} placeholder="Select status" />
              </div>
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
