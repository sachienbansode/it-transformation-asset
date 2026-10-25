import React, { useState, useMemo } from "react";
import {
  useListAibomEntries, useCreateAibomEntry, useUpdateAibomEntry,
  useDeleteAibomEntry, getListAibomEntriesQueryKey,
} from "@workspace/api-client-react";
import type { AibomEntry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Edit, Search, X, Bot,
  ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, ShieldX,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { MasterSelect } from "@/components/master-select";
import { useMasters, getBadgeClass } from "@/hooks/use-masters";
import { useAuth } from "@/contexts/auth-context";
import { ImportExportMenu } from "@/components/import-export-menu";
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/components/confirm-dialog";

const PAGE_SIZE = 10;

type AibomExtended = AibomEntry & {
  version?: string;
  endpoint?: string;
  dataClassification?: string;
  governanceFramework?: string;
  lastAuditDate?: string;
};

const DATA_CLASSIFICATIONS = ["Public", "Internal", "Confidential", "Restricted"];
const GOVERNANCE_FRAMEWORKS = ["ISO 42001", "EU AI Act", "RBI AI Guidelines", "SEBI AI Framework", "NIST AI RMF", "Internal Policy"];


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
  const [formData, setFormData] = useState<Partial<AibomExtended>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const filteredItems = useMemo(() => (items || []).filter(item => {
    const q = search.toLowerCase();
    const x = item as AibomExtended;
    if (q && !item.name?.toLowerCase().includes(q)
      && !item.provider?.toLowerCase().includes(q)
      && !item.type?.toLowerCase().includes(q)
      && !item.componentId?.toLowerCase().includes(q)
      && !x.governanceFramework?.toLowerCase().includes(q))
      return false;
    if (filterRisk !== "all" && item.riskLevel !== filterRisk) return false;
    if (filterCompliance !== "all" && item.complianceStatus !== filterCompliance) return false;
    return true;
  }), [items, search, filterRisk, filterCompliance]);

  const handleOpenModal = (item: AibomEntry | null = null) => {
    setEditingItem(item);
    setFormData(item ? { ...item } as AibomExtended : {
      componentId: "", name: "", type: "", provider: "",
      riskLevel: "", complianceStatus: "",
    });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAibomEntriesQueryKey() });
          setIsModalOpen(false);
          toast({ title: "AIBOM entry updated" });
        },
      });
    } else {
      createItem.mutate({ data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAibomEntriesQueryKey() });
          setIsModalOpen(false);
          toast({ title: "AIBOM entry created" });
        },
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (await confirmDialog("Delete this AI component?")) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAibomEntriesQueryKey() });
          toast({ title: "Deleted successfully" });
        },
      });
    }
  };

  const getRiskBadge = (risk: string) => {
    const m = riskLevels?.find(r => r.label === risk);
    if (m?.color) return getBadgeClass(m.color);
    if (risk === "Critical") return "bg-red-600/20 text-red-400 border-red-500/30";
    if (risk === "High") return "bg-orange-500/20 text-orange-400 border-orange-500/30";
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

  const getDataClassBadge = (cls: string) => {
    if (cls === "Restricted") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (cls === "Confidential") return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    if (cls === "Internal") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  };

  const totalComponents = items?.length || 0;
  const highRisk = (items || []).filter(i => i.riskLevel === "High" || i.riskLevel === "Critical").length;
  const nonCompliant = (items || []).filter(i => i.complianceStatus === "Non-Compliant").length;
  const governed = (items || []).filter(i => (i as AibomExtended).governanceFramework).length;

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">AI Bill of Materials (AIBOM)</h2>
          <p className="text-xs text-muted-foreground">AI/ML components · Governance tracking · Compliance monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportMenu module="aibom" label="AIBOM" onImportSuccess={() => queryClient.invalidateQueries({ queryKey: getListAibomEntriesQueryKey() })} />
          {isAdmin && (
            <Button size="sm" onClick={() => handleOpenModal(null)}>
              <Plus className="mr-2 h-4 w-4" /> Add Component
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total AI Components" value={totalComponents} sub="tracked in inventory" icon={Bot} iconBg="bg-purple-50 dark:bg-purple-400/10" iconColor="text-purple-600" />
        <StatCard label="High / Critical Risk" value={highRisk} sub="requiring attention" icon={AlertTriangle} iconBg="bg-red-50 dark:bg-red-400/10" iconColor="text-destructive" valueColor={highRisk > 0 ? "text-destructive" : undefined} />
        <StatCard label="Non-Compliant" value={nonCompliant} sub="compliance issues" icon={ShieldX} iconBg="bg-orange-50 dark:bg-orange-400/10" iconColor="text-orange-500" valueColor={nonCompliant > 0 ? "text-orange-500" : undefined} />
        <StatCard label="With Governance" value={`${governed}/${totalComponents}`} sub="governance framework set" icon={ShieldCheck} iconBg="bg-green-50 dark:bg-green-400/10" iconColor="text-green-600" valueColor="text-primary" />
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, provider, type, comp ID…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          {search && <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2 top-2"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>
        <Select value={filterRisk} onValueChange={v => { setFilterRisk(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Risk Level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            {riskLevels?.map(r => <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCompliance} onValueChange={v => { setFilterCompliance(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Compliance" /></SelectTrigger>
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

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6"></TableHead>
              <TableHead>Comp ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Data Class</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Compliance</TableHead>
              <TableHead>Governance</TableHead>
              <TableHead>Last Audit</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedItems.map(item => {
              const x = item as AibomExtended;
              const isExpanded = expandedRow === item.id;
              return (
                <React.Fragment key={item.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedRow(isExpanded ? null : item.id)}
                  >
                    <TableCell className="pr-0">
                      {isExpanded
                        ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                        : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.componentId}</TableCell>
                    <TableCell className="font-medium text-xs">{item.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{x.version || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{item.type}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.provider}</TableCell>
                    <TableCell>
                      {x.dataClassification
                        ? <Badge className={cn("text-xs", getDataClassBadge(x.dataClassification))}>{x.dataClassification}</Badge>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell><Badge className={getRiskBadge(item.riskLevel)}>{item.riskLevel}</Badge></TableCell>
                    <TableCell><Badge className={getComplianceBadge(item.complianceStatus)}>{item.complianceStatus}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-28 truncate">{x.governanceFramework || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{x.lastAuditDate || "—"}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => handleOpenModal(item)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={isAdmin ? 12 : 11} className="py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs px-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-0.5">Use Case</p>
                            <p>{item.useCase || "Not specified"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-0.5">Data Used</p>
                            <p>{item.dataUsed || "Not specified"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-0.5">Endpoint / URL</p>
                            <p className="font-mono text-[11px] truncate">{x.endpoint || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-0.5">Governance Review</p>
                            <p>{item.governanceReviewDate || "—"}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-0.5">Comments</p>
                            <p className="text-muted-foreground">{item.comments || "—"}</p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
            {pagedItems.length === 0 && (
              <TableRow><TableCell colSpan={isAdmin ? 12 : 11} className="py-10 text-center text-sm text-muted-foreground">No AI components found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <div className="px-4 pb-3">
          <Pagination page={page} totalPages={totalPages} totalItems={totalComponents} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? "Edit AI Component" : "Add AI Component"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">

            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">Component Identity</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Component ID <span className="text-destructive">*</span></Label>
                <Input value={formData.componentId || ""} onChange={e => setFormData({ ...formData, componentId: e.target.value })} placeholder="AI-001" className="h-8 text-xs font-mono" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
                <Input value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. GPT-4 Trading Assistant" className="h-8 text-xs" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Version</Label>
                <Input value={formData.version || ""} onChange={e => setFormData({ ...formData, version: e.target.value })} placeholder="e.g. gpt-4-turbo-2024" className="h-8 text-xs" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Type <span className="text-destructive">*</span></Label>
                <MasterSelect category="ai_type" value={formData.type || ""} onChange={v => setFormData({ ...formData, type: v })} placeholder="Select type" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Provider / Vendor <span className="text-destructive">*</span></Label>
                <MasterSelect category="vendor" value={formData.provider || ""} onChange={v => setFormData({ ...formData, provider: v })} placeholder="Select vendor" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Endpoint / Deployment URL</Label>
                <Input value={formData.endpoint || ""} onChange={e => setFormData({ ...formData, endpoint: e.target.value })} placeholder="https://api.openai.com/v1/…" className="h-8 text-xs font-mono" />
              </div>
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1 mt-1">Data & Usage</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Data Classification</Label>
                <Select value={formData.dataClassification || ""} onValueChange={v => setFormData({ ...formData, dataClassification: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select classification" /></SelectTrigger>
                  <SelectContent>
                    {DATA_CLASSIFICATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Data Used</Label>
                <Input value={formData.dataUsed || ""} onChange={e => setFormData({ ...formData, dataUsed: e.target.value })} placeholder="e.g. Trade history, Client PII" className="h-8 text-xs" />
              </div>
              <div className="grid gap-1.5 col-span-2">
                <Label className="text-xs">Use Case</Label>
                <Textarea value={formData.useCase || ""} onChange={e => setFormData({ ...formData, useCase: e.target.value })} placeholder="Describe the AI use case and business impact…" rows={2} className="text-xs resize-none" />
              </div>
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1 mt-1">Risk & Governance</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Risk Level <span className="text-destructive">*</span></Label>
                <MasterSelect category="risk_level" value={formData.riskLevel || ""} onChange={v => setFormData({ ...formData, riskLevel: v })} placeholder="Select risk" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Compliance Status <span className="text-destructive">*</span></Label>
                <MasterSelect category="compliance_status" value={formData.complianceStatus || ""} onChange={v => setFormData({ ...formData, complianceStatus: v })} placeholder="Select status" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Governance Framework</Label>
                <Select value={formData.governanceFramework || ""} onValueChange={v => setFormData({ ...formData, governanceFramework: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select framework" /></SelectTrigger>
                  <SelectContent>
                    {GOVERNANCE_FRAMEWORKS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Governance Review Date</Label>
                <Input type="date" value={formData.governanceReviewDate || ""} onChange={e => setFormData({ ...formData, governanceReviewDate: e.target.value })} className="h-8 text-xs" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Last Audit Date</Label>
                <Input type="date" value={formData.lastAuditDate || ""} onChange={e => setFormData({ ...formData, lastAuditDate: e.target.value })} className="h-8 text-xs" />
              </div>
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1 mt-1">Notes</p>
            <div className="grid gap-1.5">
              <Label className="text-xs">Analyst Comments</Label>
              <Textarea value={formData.comments || ""} onChange={e => setFormData({ ...formData, comments: e.target.value })} placeholder="Observations, escalation notes, review findings…" rows={3} className="text-xs resize-none" />
            </div>
          </div>
          <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-2 flex justify-end gap-2 border-t bg-background px-6 py-3 sm:rounded-b-lg">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createItem.isPending || updateItem.isPending}>
              {(createItem.isPending || updateItem.isPending) ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
