import React, { useState } from "react";
import { useListRoadmapItems, useCreateRoadmapItem, useUpdateRoadmapItem, useDeleteRoadmapItem, getListRoadmapItemsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Edit } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import type { RoadmapItem } from "@workspace/api-client-react";
import { MasterSelect } from "@/components/master-select";
import { useCurrency } from "@/contexts/currency-context";
import { useAuth } from "@/contexts/auth-context";

export default function Roadmap() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: items } = useListRoadmapItems();
  const { format } = useCurrency();
  
  const createItem = useCreateRoadmapItem();
  const updateItem = useUpdateRoadmapItem();
  const deleteItem = useDeleteRoadmapItem();

  const [activeTab, setActiveTab] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);
  const [formData, setFormData] = useState<Partial<RoadmapItem>>({});

  const filteredItems = items?.filter(item => activeTab === "All" || item.phase === activeTab);
  
  const totalBudget = items?.reduce((sum, item) => sum + (item.budgetLakhs || 0), 0) || 0;
  const phase1Count = items?.filter(i => i.phase === "Phase 1: Quick Wins").length || 0;
  const phase2Count = items?.filter(i => i.phase === "Phase 2: Core Transformation").length || 0;
  const phase3Count = items?.filter(i => i.phase === "Phase 3: Innovation & Scale").length || 0;

  const handleOpenModal = (item: RoadmapItem | null = null) => {
    setEditingItem(item);
    setFormData(item || { title: "", phase: "Phase 1: Quick Wins", business: "", status: "Planned", priority: "Medium", budgetLakhs: 0, startMonth: 1, endMonth: 3 });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRoadmapItemsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Updated successfully" });
        }
      });
    } else {
      createItem.mutate({ data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRoadmapItemsQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Created successfully" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this initiative?")) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRoadmapItemsQueryKey() });
          toast({ title: "Deleted successfully" });
        }
      });
    }
  };

  const getPhaseColor = (phase: string) => {
    if (phase.includes("Phase 1")) return "hsl(var(--chart-1))";
    if (phase.includes("Phase 2")) return "hsl(var(--chart-2))";
    if (phase.includes("Phase 3")) return "hsl(var(--chart-3))";
    return "hsl(var(--primary))";
  };

  const ganttData = items?.map(item => ({
    name: item.title,
    start: item.startMonth - 1,
    duration: item.endMonth - item.startMonth + 1,
    fill: getPhaseColor(item.phase)
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Transformation Roadmap</h2>
        {isAdmin && (
          <Button onClick={() => handleOpenModal(null)}>
            <Plus className="mr-2 h-4 w-4" /> Add Initiative
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Initiatives</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{items?.length || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Budget</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{format(totalBudget)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Quick Wins (P1)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{phase1Count}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Core Trans. (P2)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{phase2Count}</div></CardContent>
        </Card>
      </div>

      {ganttData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Timeline (Months 1-12)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ganttData} layout="vertical" barSize={20}>
                <XAxis type="number" domain={[0, 12]} tickCount={13} stroke="#888" fontSize={12} />
                <YAxis dataKey="name" type="category" width={150} stroke="#888" fontSize={12} />
                <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                <Bar dataKey="start" stackId="a" fill="transparent" />
                <Bar dataKey="duration" stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="All">All</TabsTrigger>
          <TabsTrigger value="Phase 1: Quick Wins">Phase 1</TabsTrigger>
          <TabsTrigger value="Phase 2: Core Transformation">Phase 2</TabsTrigger>
          <TabsTrigger value="Phase 3: Innovation & Scale">Phase 3</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems?.map(item => (
          <Card key={item.id} className="relative group">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <Badge variant="outline" className="mb-2">{item.phase.split(':')[0]}</Badge>
                {isAdmin && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleOpenModal(item)}><Edit className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
              <CardTitle className="text-lg">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{item.business}</Badge>
                <Badge className={item.status === 'Completed' ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary'}>{item.status}</Badge>
              </div>
              <div className="flex justify-between items-center text-sm pt-2 border-t border-border">
                <span className="font-medium text-primary">{format(item.budgetLakhs || 0)}</span>
                <span className="text-muted-foreground">M{item.startMonth} - M{item.endMonth}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingItem ? "Edit Initiative" : "Add Initiative"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Title</Label>
              <Input value={formData.title || ""} onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Phase</Label>
                <MasterSelect category="phase" value={formData.phase || ""} onChange={v => setFormData({...formData, phase: v})} placeholder="Select phase" />
              </div>
              <div className="grid gap-2">
                <Label>Business Unit</Label>
                <MasterSelect category="business" value={formData.business || ""} onChange={v => setFormData({...formData, business: v})} placeholder="Select business" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Budget (₹ Lakhs)</Label>
                <Input type="number" value={formData.budgetLakhs || 0} onChange={e => setFormData({...formData, budgetLakhs: Number(e.target.value)})} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <MasterSelect category="roadmap_status" value={formData.status || ""} onChange={v => setFormData({...formData, status: v})} placeholder="Select status" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Month (1-12)</Label>
                <Input type="number" value={formData.startMonth || 1} onChange={e => setFormData({...formData, startMonth: Number(e.target.value)})} />
              </div>
              <div className="grid gap-2">
                <Label>End Month (1-12)</Label>
                <Input type="number" value={formData.endMonth || 12} onChange={e => setFormData({...formData, endMonth: Number(e.target.value)})} />
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
