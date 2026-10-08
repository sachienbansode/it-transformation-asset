import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import {
  Plus, Pencil, Trash2, Shield, ChevronRight, RefreshCw,
  AlertTriangle, Database, GitBranch, Clock, Info,
} from "lucide-react";

interface MatrixRule {
  id: number;
  ticketType: string;
  condition: string | null;
  approverRole: string;
  approverLevel: string;
  sequence: number;
  isActive: boolean;
  createdAt: string;
}

const TICKET_TYPES = ["Incident", "Problem", "Change Request", "Service Request"];

const CONDITIONS: { label: string; value: string }[] = [
  { label: "All — always applies", value: "All" },
  { label: "Priority: Critical only", value: "Priority:Critical" },
  { label: "Priority: Critical or High", value: "Priority:Critical,High" },
  { label: "Priority: High only", value: "Priority:High" },
  { label: "Priority: Medium only", value: "Priority:Medium" },
  { label: "Priority: Low only", value: "Priority:Low" },
  { label: "Severity: S1 (Critical)", value: "Severity:S1" },
  { label: "Severity: S2 (High)", value: "Severity:S2" },
  { label: "Severity: S3 (Medium)", value: "Severity:S3" },
  { label: "Severity: S4 (Low)", value: "Severity:S4" },
  { label: "Type: Emergency change", value: "Type:Emergency" },
  { label: "Type: Standard change", value: "Type:Standard" },
  { label: "Type: Normal change", value: "Type:Normal" },
  { label: "Risk: High", value: "Risk:High" },
  { label: "Risk: Medium", value: "Risk:Medium" },
  { label: "Risk: Low", value: "Risk:Low" },
  { label: "Category: Security", value: "Category:Security" },
  { label: "Category: Infrastructure", value: "Category:Infrastructure" },
  { label: "Category: Application", value: "Category:Application" },
  { label: "Category: Network", value: "Category:Network" },
];

const APPROVER_ROLES = [
  "Service Desk Manager", "IT Manager", "IT Director", "CTO", "CISO",
  "Department Head", "Change Manager", "Change Advisory Board (CAB)", "CTO / IT Director",
  "Problem Manager", "Team Lead / Supervisor", "Operations Manager",
  "Risk Manager", "Compliance Officer", "CEO",
];

const TYPE_ICONS: Record<string, React.ElementType> = {
  "Incident": AlertTriangle,
  "Problem": Database,
  "Change Request": GitBranch,
  "Service Request": Clock,
};
const TYPE_COLORS: Record<string, string> = {
  "Incident": "text-amber-500",
  "Problem": "text-violet-500",
  "Change Request": "text-blue-500",
  "Service Request": "text-teal-500",
};
const TYPE_BG: Record<string, string> = {
  "Incident": "border-amber-500/20 bg-amber-50/40 dark:bg-amber-900/10",
  "Problem": "border-violet-500/20 bg-violet-50/40 dark:bg-violet-900/10",
  "Change Request": "border-blue-500/20 bg-blue-50/40 dark:bg-blue-900/10",
  "Service Request": "border-teal-500/20 bg-teal-50/40 dark:bg-teal-900/10",
};

const EMPTY_FORM = { ticketType: "Incident", condition: "All", approverRole: "", approverLevel: "L1", sequence: 1 };

export default function ItsmApprovalConfig() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editRule, setEditRule] = useState<MatrixRule | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteConfirm, setDeleteConfirm] = useState<MatrixRule | null>(null);
  const [filterType, setFilterType] = useState<string>("All");

  const { data: rules = [], isLoading, refetch } = useQuery<MatrixRule[]>({
    queryKey: ["approval-matrix"],
    queryFn: () => apiFetch("/approval-matrix"),
  });

  const createMut = useMutation({
    mutationFn: (body: any) => apiFetch("/approval-matrix", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approval-matrix"] }); toast({ title: "Rule created" }); setModalOpen(false); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: any) => apiFetch(`/approval-matrix/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approval-matrix"] }); toast({ title: "Rule updated" }); setModalOpen(false); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/approval-matrix/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approval-matrix"] }); toast({ title: "Rule deleted" }); setDeleteConfirm(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => {
    setEditRule(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  };

  const openEdit = (r: MatrixRule) => {
    setEditRule(r);
    setForm({
      ticketType: r.ticketType,
      condition: r.condition || "All",
      approverRole: r.approverRole,
      approverLevel: r.approverLevel,
      sequence: r.sequence,
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.approverRole.trim()) {
      toast({ title: "Approver role is required", variant: "destructive" }); return;
    }
    if (!form.approverLevel.trim()) {
      toast({ title: "Approver level is required", variant: "destructive" }); return;
    }
    const conditionVal = form.condition.trim() || "All";
    const body = { ...form, condition: conditionVal };
    if (editRule) {
      updateMut.mutate({ id: editRule.id, ...body });
    } else {
      createMut.mutate(body);
    }
  };

  const filteredRules = filterType === "All" ? rules : rules.filter(r => r.ticketType === filterType);
  const grouped = TICKET_TYPES.reduce((acc, type) => {
    const typeRules = filteredRules.filter(r => r.ticketType === type).sort((a, b) => a.sequence - b.sequence);
    if (typeRules.length > 0 || filterType === "All") acc[type] = typeRules;
    return acc;
  }, {} as Record<string, MatrixRule[]>);

  const totalRules = rules.length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-[#2D7FF9]" />
            Approval Workflow Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define multi-level approval rules for each ITSM ticket type. Rules are applied when tickets are created.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Rule
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {TICKET_TYPES.map(t => {
          const Icon = TYPE_ICONS[t];
          const count = rules.filter(r => r.ticketType === t).length;
          return (
            <Card key={t} className={`cursor-pointer border transition-all ${filterType === t ? TYPE_BG[t] + " ring-1 ring-offset-0 " + (t === "Incident" ? "ring-amber-400" : t === "Problem" ? "ring-violet-400" : t === "Change Request" ? "ring-blue-400" : "ring-teal-400") : ""}`}
              onClick={() => setFilterType(filterType === t ? "All" : t)}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${TYPE_BG[t]}`}>
                  <Icon className={`w-4 h-4 ${TYPE_COLORS[t]}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t}</p>
                  <p className="text-xl font-bold">{count}</p>
                  <p className="text-[10px] text-muted-foreground">approval levels</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {filterType === "All" ? `All Types · ${totalRules} rules` : `${filterType} · ${filteredRules.length} rules`}
        </Badge>
        {filterType !== "All" && (
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setFilterType("All")}>
            Clear filter
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-24 rounded-lg bg-muted/30 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([ticketType, typeRules]) => {
            const Icon = TYPE_ICONS[ticketType];
            return (
              <Card key={ticketType} className={`border ${TYPE_BG[ticketType]}`}>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${TYPE_COLORS[ticketType]}`} />
                    {ticketType}
                    <Badge variant="outline" className="ml-1 text-[10px]">{typeRules.length} {typeRules.length === 1 ? "level" : "levels"}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  {typeRules.length === 0 ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                      <Info className="w-4 h-4" />
                      No approval rules configured. Tickets of this type will be auto-approved.
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs text-[#2D7FF9]" onClick={() => { setForm({ ...EMPTY_FORM, ticketType }); setEditRule(null); setModalOpen(true); }}>
                        Add first rule
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-0 flex-wrap gap-y-2">
                      {typeRules.map((rule, idx) => (
                        <React.Fragment key={rule.id}>
                          <div className="bg-background border border-border rounded-lg p-3 min-w-[160px] max-w-[200px] group hover:shadow-sm transition-shadow">
                            <div className="flex items-start justify-between gap-1 mb-1.5">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                  {rule.approverLevel}
                                </span>
                                <p className="text-xs font-semibold mt-0.5">{rule.approverRole}</p>
                              </div>
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEdit(rule)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => setDeleteConfirm(rule)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            {rule.condition && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0">{rule.condition}</Badge>
                            )}
                            <p className="text-[9px] text-muted-foreground mt-1">Seq: {rule.sequence}</p>
                          </div>
                          {idx < typeRules.length - 1 && (
                            <div className="flex items-center px-1 pt-4">
                              <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                      <div className="flex items-center px-1 pt-4">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full border border-dashed border-border hover:border-[#2D7FF9] hover:text-[#2D7FF9]"
                          onClick={() => { setForm({ ...EMPTY_FORM, ticketType, sequence: typeRules.length + 1, approverLevel: `Level ${typeRules.length + 1}` }); setEditRule(null); setModalOpen(true); }}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-dashed border-muted-foreground/20 bg-muted/10">
        <CardContent className="p-4 flex gap-3">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>How it works:</strong> When a ticket is created, the system looks up matching rules from this matrix and generates approval records in sequence order.</p>
            <p><strong>Condition:</strong> Filters when a rule applies (e.g. "Priority: High" only triggers for high-priority tickets). Leave blank / "All" to always apply.</p>
            <p><strong>Sequence:</strong> Controls the order approvals flow. Sequence 1 is first, higher numbers come after. All pending levels must be approved before the ticket can proceed.</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#2D7FF9]" />
              {editRule ? "Edit Approval Rule" : "Add Approval Rule"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Ticket Type *</Label>
              <Select value={form.ticketType} onValueChange={v => setForm(f => ({ ...f, ticketType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v }))}>
                <SelectTrigger><SelectValue placeholder="Select condition…" /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">When this rule is triggered. "All" means it applies to every ticket of this type.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Approver Level *</Label>
                <Select value={form.approverLevel} onValueChange={v => setForm(f => ({ ...f, approverLevel: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select level…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L1">L1 — First Level</SelectItem>
                    <SelectItem value="L2">L2 — Second Level</SelectItem>
                    <SelectItem value="L3">L3 — Third Level</SelectItem>
                    <SelectItem value="L4">L4 — Fourth Level</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sequence *</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={form.sequence}
                  onChange={e => setForm(f => ({ ...f, sequence: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Approver Role *</Label>
              <Select value={form.approverRole} onValueChange={v => setForm(f => ({ ...f, approverRole: v }))}>
                <SelectTrigger><SelectValue placeholder="Select role…" /></SelectTrigger>
                <SelectContent>
                  {APPROVER_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">The role that must approve at this level.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white"
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {editRule ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={open => !open && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Approval Rule?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove the <strong>{deleteConfirm?.approverLevel}</strong> ({deleteConfirm?.approverRole}) rule for <strong>{deleteConfirm?.ticketType}</strong>.
            Existing tickets will not be affected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteMut.mutate(deleteConfirm.id)} disabled={deleteMut.isPending}>
              Delete Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
