import React, { useState, useMemo } from "react";
import {
  useListSbomEntries, useCreateSbomEntry, useUpdateSbomEntry,
  useDeleteSbomEntry, getListSbomEntriesQueryKey,
} from "@workspace/api-client-react";
import type { SbomEntry } from "@workspace/api-client-react";
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
  Plus, Trash2, Edit, ShieldAlert, Search, X, Package,
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, ScanLine,
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
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  type SbomExtended = SbomEntry & { severity?: string; purl?: string; supplier?: string; comments?: string };

  const filteredItems = useMemo(() => (items || []).filter(item => {
    const q = search.toLowerCase();
    const x = item as SbomExtended;
    if (q && !item.name?.toLowerCase().includes(q)
      && !item.cve?.toLowerCase().includes(q)
      && !item.version?.toLowerCase().includes(q)
      && !x.supplier?.toLowerCase().includes(q)
      && !item.usedIn?.toLowerCase().includes(q))
      return false;
    if (filterRisk !== "all" && item.riskLevel !== filterRisk) return false;
    return true;
  }), [items, search, filterRisk]);

  const handleOpenModal = (item: SbomEntry | null = null) => {
    setEditingItem(item);
    setFormData(item ? { ...item } : { name: "", version: "", licenseType: "", riskLevel: "", cve: "" });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSbomEntriesQueryKey() });
          setIsModalOpen(false);
          toast({ title: "SBOM entry updated" });
        },
      });
    } else {
      createItem.mutate({ data: formData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSbomEntriesQueryKey() });
          setIsModalOpen(false);
          toast({ title: "SBOM entry created" });
        },
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (await confirmDialog("Delete this SBOM entry?")) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSbomEntriesQueryKey() });
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

  const totalComponents = items?.length || 0;
  const critical = (items || []).filter(i => i.riskLevel === "Critical").length;
  const high = (items || []).filter(i => i.riskLevel === "High").length;
  const knownCves = (items || []).filter(i => i.cve && i.cve !== "None" && i.cve !== "").length;
  const scanned = (items || []).filter(i => (i as SbomExtended).lastScan).length;

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Software Bill of Materials (SBOM)</h2>
          <p className="text-xs text-muted-foreground">Third-party dependencies · CVE tracking · License compliance</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportMenu module="sbom" label="SBOM" onImportSuccess={() => queryClient.invalidateQueries({ queryKey: getListSbomEntriesQueryKey() })} />
          {isAdmin && (
            <Button size="sm" onClick={() => handleOpenModal(null)}>
              <Plus className="mr-2 h-4 w-4" /> Add Entry
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Packages" value={totalComponents} sub="tracked components" icon={Package} iconBg="bg-blue-50 dark:bg-blue-400/10" iconColor="text-blue-600" />
        <StatCard label="Known CVEs" value={knownCves} sub="with CVE identifiers" icon={ShieldAlert} iconBg="bg-red-50 dark:bg-red-400/10" iconColor="text-destructive" valueColor={knownCves > 0 ? "text-destructive" : undefined} />
        <StatCard label="Critical / High" value={`${critical} / ${high}`} sub="risk entries" icon={AlertCircle} iconBg="bg-orange-50 dark:bg-orange-400/10" iconColor="text-orange-500" valueColor={(critical + high) > 0 ? "text-orange-500" : undefined} />
        <StatCard label="Scan Coverage" value={`${scanned}/${totalComponents}`} sub="entries with scan date" icon={ScanLine} iconBg="bg-green-50 dark:bg-green-400/10" iconColor="text-green-600" valueColor="text-primary" />
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search package, CVE, supplier, used-in…"
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

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6"></TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>License</TableHead>
              <TableHead>CVE</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Last Scan</TableHead>
              <TableHead>Action Required</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedItems.map(item => {
              const x = item as SbomExtended;
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
                    <TableCell className="font-mono text-xs font-medium">{item.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.version || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{x.supplier || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{item.licenseType || "—"}</Badge></TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      {item.cve && item.cve !== "None" && item.cve !== "" ? (
                        <Badge variant="destructive" className="text-xs font-mono">{item.cve}</Badge>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3 w-3 text-green-500" />None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {x.severity ? (
                        <span className={cn("font-semibold",
                          x.severity === "Critical" ? "text-red-500" :
                          x.severity === "High" ? "text-orange-500" :
                          x.severity === "Medium" ? "text-yellow-500" : "text-green-500"
                        )}>{x.severity}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell><Badge className={getRiskBadge(item.riskLevel)}>{item.riskLevel}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.lastScan || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-36 truncate">{item.actionRequired || "—"}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => handleOpenModal(item)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={isAdmin ? 11 : 10} className="py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs px-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-0.5">PURL</p>
                            <p className="font-mono text-[11px]">{x.purl || "Not specified"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-0.5">Used In</p>
                            <p>{item.usedIn || "Not specified"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-0.5">Action Required</p>
                            <p>{item.actionRequired || "None"}</p>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-0.5">Comments</p>
                            <p className="text-muted-foreground">{x.comments || "—"}</p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
            {pagedItems.length === 0 && (
              <TableRow><TableCell colSpan={isAdmin ? 11 : 10} className="py-10 text-center text-sm text-muted-foreground">No SBOM entries found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <div className="px-4 pb-3">
          <Pagination page={page} totalPages={totalPages} totalItems={filteredItems.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? "Edit SBOM Entry" : "Add SBOM Entry"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">Package Identity</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Package Name <span className="text-destructive">*</span></Label>
                <Input value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. lodash" className="h-8 text-xs" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Version</Label>
                <Input value={formData.version || ""} onChange={e => setFormData({ ...formData, version: e.target.value })} placeholder="e.g. 4.17.21" className="h-8 text-xs" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Supplier / Vendor</Label>
                <Input value={(formData as any).supplier || ""} onChange={e => setFormData({ ...formData, ...{ supplier: e.target.value } } as any)} placeholder="e.g. OpenJS Foundation" className="h-8 text-xs" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">PURL (Package URL)</Label>
                <Input value={(formData as any).purl || ""} onChange={e => setFormData({ ...formData, ...{ purl: e.target.value } } as any)} placeholder="pkg:npm/lodash@4.17.21" className="h-8 text-xs font-mono" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">License Type</Label>
                <MasterSelect category="license_type" value={formData.licenseType || ""} onChange={v => setFormData({ ...formData, licenseType: v })} placeholder="Select license" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Used In</Label>
                <Input value={formData.usedIn || ""} onChange={e => setFormData({ ...formData, usedIn: e.target.value })} placeholder="e.g. Trading Platform, API Gateway" className="h-8 text-xs" />
              </div>
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1 mt-1">Security & Risk</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">CVE Identifier</Label>
                <Input value={formData.cve || ""} onChange={e => setFormData({ ...formData, cve: e.target.value })} placeholder="CVE-2024-xxxxx or None" className="h-8 text-xs font-mono" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Severity (CVSS)</Label>
                <Select value={(formData as any).severity || ""} onValueChange={v => setFormData({ ...formData, ...{ severity: v } } as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select severity" /></SelectTrigger>
                  <SelectContent>
                    {["Critical", "High", "Medium", "Low", "None"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Risk Level <span className="text-destructive">*</span></Label>
                <MasterSelect category="risk_level" value={formData.riskLevel || ""} onChange={v => setFormData({ ...formData, riskLevel: v })} placeholder="Select risk" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Last Scan Date</Label>
                <Input type="date" value={formData.lastScan || ""} onChange={e => setFormData({ ...formData, lastScan: e.target.value })} className="h-8 text-xs" />
              </div>
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1 mt-1">Remediation</p>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Action Required</Label>
                <Input value={formData.actionRequired || ""} onChange={e => setFormData({ ...formData, actionRequired: e.target.value })} placeholder="e.g. Upgrade to 4.17.22, Apply patch" className="h-8 text-xs" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Analyst Comments</Label>
                <Textarea
                  value={(formData as any).comments || ""}
                  onChange={e => setFormData({ ...formData, ...{ comments: e.target.value } } as any)}
                  placeholder="Observations, context, escalation notes…"
                  rows={3}
                  className="text-xs resize-none"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
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
