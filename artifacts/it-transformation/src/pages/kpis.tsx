import React, { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { StatCard } from "@/components/stat-card";
import { cn } from "@/lib/utils";
import {
  Target, Plus, Upload, Download, History, Edit2, CheckCircle2,
  XCircle, Send, RefreshCw, Users, ClipboardList, FileSpreadsheet,
  AlertTriangle, Clock, User, Building2, Calendar, Trash2, Eye,
  ChevronDown, ChevronUp, Info,
} from "lucide-react";

// ─── 2-decimal formatter ───────────────────────────────────────────────────────
export const fmt2 = (v: string | number | null | undefined, fallback = "—"): string => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return fallback;
  return n.toFixed(2);
};

// ─── Types ─────────────────────────────────────────────────────────────────────
interface KpiYear { id: number; label: string; startDate: string; endDate: string; isCurrent: boolean; }
interface KpiPerson { id: number; name: string; designation: string; department?: string; email?: string; employeeCode?: string; approvingAuthorityId?: number; isActive: boolean; }
interface KpiSet { id: number; personId: number; yearId: number; status: string; currentVersionId?: number; notes?: string; submittedAt?: string; approvedAt?: string; approvedBy?: number; approvalComments?: string; createdAt: string; updatedAt: string; }
interface KpiSetVersion { id: number; setId: number; versionNumber: number; fileName?: string; fileSize?: number; itemCount?: number; uploadedBy?: number; comments?: string; isCurrent: boolean; createdAt: string; }
interface KpiSetItem { id: number; setId: number; versionId: number; sno?: number; kpiName: string; description?: string; category?: string; weightage?: string; metric?: string; unit?: string; annualTarget?: string; q1Target?: string; q2Target?: string; q3Target?: string; q4Target?: string; q1Actual?: string; q2Actual?: string; q3Actual?: string; q4Actual?: string; remarks?: string; }
interface User { id: number; name: string; email: string; role: string; designation?: string; department?: string; }
interface ParsedItem { sno: number; kpiName: string; description: string; category: string; weightage: string; metric: string; unit: string; annualTarget: string; q1Target: string; q2Target: string; q3Target: string; q4Target: string; q1Actual: string; q2Actual: string; q3Actual: string; q4Actual: string; remarks: string; }

// ─── Template columns ──────────────────────────────────────────────────────────
const TEMPLATE_HEADERS = ["S.No", "KPI Name", "Description", "Category", "Weightage (%)", "Metric", "Unit", "Annual Target", "Q1 Target", "Q2 Target", "Q3 Target", "Q4 Target", "Q1 Actual", "Q2 Actual", "Q3 Actual", "Q4 Actual", "Remarks"];
const DESIGNATIONS = ["CEO", "CFO", "CTO", "COO", "CHRO", "CMO", "CRO", "CCO", "CSO", "President", "Vice President", "Director", "Senior Manager", "Manager", "Associate Vice President", "General Manager"];
const DEPARTMENTS = ["Technology", "Finance", "Operations", "Human Resources", "Marketing", "Risk & Compliance", "Legal", "Strategy", "Product", "Sales", "Research", "Corporate"];
const CATEGORIES = ["Financial", "Customer", "Operations", "People & Learning", "Innovation", "Risk & Compliance", "Run", "Change", "Transform"];

const STATUS_COLORS: Record<string, string> = {
  Draft: "border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
  Pending: "border-yellow-500/30 text-yellow-600 bg-yellow-50 dark:bg-yellow-400/10",
  Approved: "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10",
  Rejected: "border-red-500/30 text-red-600 bg-red-50 dark:bg-red-400/10",
  Archived: "border-gray-400/30 text-gray-400 bg-gray-50 dark:bg-gray-400/10",
};

// ─── Hooks ────────────────────────────────────────────────────────────────────
const useKpiYears = () => useQuery({ queryKey: ["kpi-years"], queryFn: () => apiFetch<KpiYear[]>("/kpi-years") });
const usePersons = () => useQuery({ queryKey: ["kpi-persons"], queryFn: () => apiFetch<KpiPerson[]>("/kpi-persons") });
const useKpiSets = (yearId?: number) => useQuery({ queryKey: ["kpi-sets", yearId], queryFn: () => apiFetch<KpiSet[]>(`/kpi-sets${yearId ? `?yearId=${yearId}` : ""}`), enabled: true });
const useVersions = (setId?: number) => useQuery({ queryKey: ["kpi-set-versions", setId], queryFn: () => apiFetch<KpiSetVersion[]>(`/kpi-sets/${setId}/versions`), enabled: !!setId });
const useSetItems = (setId?: number) => useQuery({ queryKey: ["kpi-set-items", setId], queryFn: () => apiFetch<KpiSetItem[]>(`/kpi-set-items?setId=${setId}`), enabled: !!setId });
const useUsers = () => useQuery({ queryKey: ["admin-users"], queryFn: () => apiFetch<User[]>("/admin/users") });

// ─── Excel parser ────────────────────────────────────────────────────────────
const norm = (k: string) => k.toLowerCase().replace(/[\s_()\-%#.]/g, "");
const parseExcelRows = (data: ArrayBuffer): ParsedItem[] => {
  const wb = XLSX.read(new Uint8Array(data), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const get = (row: Record<string, unknown>, ...keys: string[]) => {
    for (const k of keys) {
      const entry = Object.entries(row).find(([rk]) => norm(rk) === norm(k));
      if (entry && String(entry[1]).trim() !== "") return String(entry[1]).trim();
    }
    return "";
  };
  return rows.map((r, i) => ({
    sno: i + 1,
    kpiName: get(r, "KPI Name", "KPIName", "KPI", "Name"),
    description: get(r, "Description", "Desc"),
    category: get(r, "Category"),
    weightage: get(r, "Weightage (%)", "Weightage", "Weight"),
    metric: get(r, "Metric"),
    unit: get(r, "Unit"),
    annualTarget: get(r, "Annual Target", "AnnualTarget", "Target"),
    q1Target: get(r, "Q1 Target", "Q1Target", "Q1"),
    q2Target: get(r, "Q2 Target", "Q2Target", "Q2"),
    q3Target: get(r, "Q3 Target", "Q3Target", "Q3"),
    q4Target: get(r, "Q4 Target", "Q4Target", "Q4"),
    q1Actual: get(r, "Q1 Actual", "Q1Actual"),
    q2Actual: get(r, "Q2 Actual", "Q2Actual"),
    q3Actual: get(r, "Q3 Actual", "Q3Actual"),
    q4Actual: get(r, "Q4 Actual", "Q4Actual"),
    remarks: get(r, "Remarks", "Notes", "Comment"),
  })).filter(r => r.kpiName.length > 0);
};

// ─── Download template ───────────────────────────────────────────────────────
const downloadTemplate = (yearLabel?: string) => {
  const wb = XLSX.utils.book_new();
  const sampleRows = [
    [1, "IT Infrastructure Uptime", "Measure % uptime across all critical systems", "Operations", "10.00", "% System Availability", "%", "99.90", "99.80", "99.90", "99.90", "99.90", "", "", "", "", "Excludes planned maintenance"],
    [2, "Revenue Growth", "Annual revenue growth percentage", "Financial", "15.00", "% Growth YoY", "%", "20.00", "15.00", "18.00", "20.00", "22.00", "", "", "", "", "Compared to FY 2025-26"],
    [3, "Customer Satisfaction Score", "NPS or CSAT from post-service surveys", "Customer", "10.00", "NPS Score (0-100)", "Score", "75.00", "65.00", "70.00", "72.00", "75.00", "", "", "", "", "Survey data from CRM"],
  ];
  const wsData = [TEMPLATE_HEADERS, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [
    { wch: 5 }, { wch: 32 }, { wch: 45 }, { wch: 14 }, { wch: 13 },
    { wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 28 },
  ];

  const instrData = [
    ["COLUMN", "DESCRIPTION", "FORMAT / NOTES"],
    ["S.No", "Row number", "Auto-generated. Leave as-is or leave blank."],
    ["KPI Name", "Name of the KPI (REQUIRED)", "Keep concise but descriptive"],
    ["Description", "Detailed explanation", "Can be multi-line"],
    ["Category", "KPI category", "E.g.: Financial, Customer, Operations, People, Innovation, Risk"],
    ["Weightage (%)", "Weight of this KPI in scoring", "Total should ideally sum to 100%. 2 decimal places."],
    ["Metric", "What is measured", "E.g.: % uptime, NPS score, ₹ Lakhs"],
    ["Unit", "Unit of measurement", "%, Score, Count, ₹, Days, Hours"],
    ["Annual Target", "Full year target value", "Numeric, 2 decimal places"],
    ["Q1/Q2/Q3/Q4 Target", "Quarterly target breakdowns", "Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar"],
    ["Q1/Q2/Q3/Q4 Actual", "Quarterly actual values (optional)", "Fill during execution phase"],
    ["Remarks", "Notes or context", "Optional"],
    [""],
    ["IMPORTANT NOTES"],
    ["• Do NOT add or remove columns — keep headers exactly as shown"],
    ["• KPI Name is the only REQUIRED column"],
    ["• All numeric values should be plain numbers (not formatted with commas or units)"],
    ["• This template is for " + (yearLabel || "the selected financial year")],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
  wsInstr["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, ws, "KPI Template");
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instructions");
  XLSX.writeFile(wb, `KPI_Template_${(yearLabel || "FY").replace(/\s+/g, "_")}.xlsx`);
};

// ─── Download existing set as Excel ─────────────────────────────────────────
const downloadSetExcel = (items: KpiSetItem[], person: KpiPerson, year: KpiYear, versionNum?: number) => {
  const wb = XLSX.utils.book_new();
  const headers = TEMPLATE_HEADERS;
  const rows = items.map((item, i) => [
    item.sno ?? i + 1,
    item.kpiName,
    item.description || "",
    item.category || "",
    item.weightage ? parseFloat(item.weightage).toFixed(2) : "",
    item.metric || "",
    item.unit || "",
    item.annualTarget ? parseFloat(item.annualTarget).toFixed(2) : "",
    item.q1Target ? parseFloat(item.q1Target).toFixed(2) : "",
    item.q2Target ? parseFloat(item.q2Target).toFixed(2) : "",
    item.q3Target ? parseFloat(item.q3Target).toFixed(2) : "",
    item.q4Target ? parseFloat(item.q4Target).toFixed(2) : "",
    item.q1Actual ? parseFloat(item.q1Actual).toFixed(2) : "",
    item.q2Actual ? parseFloat(item.q2Actual).toFixed(2) : "",
    item.q3Actual ? parseFloat(item.q3Actual).toFixed(2) : "",
    item.q4Actual ? parseFloat(item.q4Actual).toFixed(2) : "",
    item.remarks || "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [
    { wch: 5 }, { wch: 32 }, { wch: 45 }, { wch: 14 }, { wch: 13 },
    { wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "KPI Data");
  const vLabel = versionNum ? `_v${versionNum}` : "";
  XLSX.writeFile(wb, `KPI_${person.name.replace(/\s+/g, "_")}_${year.label.replace(/\s+/g, "_")}${vLabel}.xlsx`);
};

// ─── Person Dialog ────────────────────────────────────────────────────────────
function PersonDialog({ open, person, users, onClose, onSuccess }: {
  open: boolean; person?: KpiPerson; users: User[]; onClose: () => void; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const empCodeRef = useRef<HTMLInputElement>(null);
  const [designation, setDesignation] = useState(person?.designation || "");
  const [department, setDepartment] = useState(person?.department || "");
  const [authorityId, setAuthorityId] = useState(person?.approvingAuthorityId?.toString() || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const name = nameRef.current?.value?.trim() || "";
    const email = emailRef.current?.value?.trim() || "";
    const employeeCode = empCodeRef.current?.value?.trim() || "";
    if (!name || !designation) { toast({ title: "Name and Designation are required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = { name, designation, department: department || null, email: email || null, employeeCode: employeeCode || null, approvingAuthorityId: authorityId ? parseInt(authorityId) : null };
      if (person) await apiFetch(`/kpi-persons/${person.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await apiFetch("/kpi-persons", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: person ? "Person updated" : "Person created" });
      onSuccess(); onClose();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><User className="h-4 w-4 text-primary" />{person ? "Edit Person" : "New Person"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2 space-y-1.5">
            <Label>Employee Name <span className="text-destructive">*</span></Label>
            <Input ref={nameRef} defaultValue={person?.name || ""} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label>Designation <span className="text-destructive">*</span></Label>
            <Select value={designation} onValueChange={setDesignation}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select designation" /></SelectTrigger>
              <SelectContent>{DESIGNATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input ref={emailRef} defaultValue={person?.email || ""} placeholder="email@ashikagroup.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Employee Code</Label>
            <Input ref={empCodeRef} defaultValue={person?.employeeCode || ""} placeholder="EMP-001" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Approving Authority</Label>
            <Select value={authorityId || "__none__"} onValueChange={v => setAuthorityId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select approver (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.name} ({u.role})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : person ? "Save Changes" : "Create Person"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create/Edit KPI Set Dialog ───────────────────────────────────────────────
function KpiSetDialog({ open, set, persons, years, onClose, onSuccess }: {
  open: boolean; set?: KpiSet; persons: KpiPerson[]; years: KpiYear[]; onClose: () => void; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [personId, setPersonId] = useState(set?.personId?.toString() || "");
  const [yearId, setYearId] = useState(set?.yearId?.toString() || years.find(y => y.isCurrent)?.id?.toString() || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!personId || !yearId) { toast({ title: "Person and Year are required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const notes = notesRef.current?.value?.trim() || null;
      if (set) await apiFetch(`/kpi-sets/${set.id}`, { method: "PATCH", body: JSON.stringify({ notes }) });
      else await apiFetch("/kpi-sets", { method: "POST", body: JSON.stringify({ personId: parseInt(personId), yearId: parseInt(yearId), notes }) });
      toast({ title: set ? "KPI Set updated" : "KPI Set created" });
      onSuccess(); onClose();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" />{set ? "Edit KPI Set" : "Create KPI Set"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Employee Name <span className="text-destructive">*</span></Label>
            <Select value={personId} onValueChange={setPersonId} disabled={!!set}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{persons.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name} — {p.designation}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Financial Year <span className="text-destructive">*</span></Label>
            <Select value={yearId} onValueChange={setYearId} disabled={!!set}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select year" /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y.id} value={y.id.toString()}>{y.label}{y.isCurrent ? " ★" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea ref={notesRef} defaultValue={set?.notes || ""} rows={2} placeholder="Any notes about this KPI set…" />
          </div>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : set ? "Save Changes" : "Create KPI Set"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Upload Dialog ────────────────────────────────────────────────────────────
type UploadStage = "select" | "preview" | "confirm";

function UploadDialog({ open, set, person, year, existingCount, onClose, onSuccess }: {
  open: boolean; set: KpiSet; person: KpiPerson; year: KpiYear; existingCount: number;
  onClose: () => void; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [stage, setStage] = useState<UploadStage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStage("select"); setFile(null); setFileData(null); setItems([]); setParseError(null); setComments(""); setShowAll(false); };

  const handleFileChange = (f: File) => {
    setFile(f); setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target!.result as ArrayBuffer;
        const parsed = parseExcelRows(data);
        if (parsed.length === 0) { setParseError("No valid KPI rows found. Ensure the 'KPI Name' column exists and has data."); return; }
        const bytes = new Uint8Array(data);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        setFileData(btoa(binary));
        setItems(parsed);
        setStage("preview");
      } catch (err: any) { setParseError("Failed to parse file: " + err.message); }
    };
    reader.readAsArrayBuffer(f);
  };

  const upload = async () => {
    if (!fileData || !file || items.length === 0) return;
    setUploading(true);
    try {
      await apiFetch(`/kpi-sets/${set.id}/upload`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, fileData, fileSize: file.size, comments: comments || undefined, uploadedBy: (user as any)?.id, items }),
      });
      toast({ title: "KPIs uploaded successfully", description: `${items.length} KPIs saved as new version for ${person.name}` });
      onSuccess(); onClose(); reset();
    } catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const preview = items.slice(0, showAll ? undefined : 8);

  return (
    <Dialog open={open} onOpenChange={() => { if (!uploading) { reset(); onClose(); } }}>
      <DialogContent className={cn("transition-all", stage === "preview" ? "sm:max-w-[860px]" : "sm:max-w-[520px]")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Upload KPIs — {person.name} · {year.label}
          </DialogTitle>
        </DialogHeader>

        {stage === "select" && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Instructions</p>
              <p>1. Download the KPI template using "Download Template" and fill in your KPIs.</p>
              <p>2. Upload the completed Excel file (.xlsx or .xls).</p>
              <p>3. Review the preview and confirm upload.</p>
              {existingCount > 0 && <p className="text-yellow-600 dark:text-yellow-400 font-medium mt-1">⚠️ This will replace {existingCount} existing KPIs with new ones.</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => downloadTemplate(year.label)}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download Template
              </Button>
            </div>
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileChange(f); }}
            >
              <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">Click to browse or drag & drop</p>
              <p className="text-xs text-muted-foreground mt-1">Accepts .xlsx, .xls files</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }} />
            </div>
            {parseError && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-400/10 border border-red-300/50 text-red-700 dark:text-red-400 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />{parseError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}

        {stage === "preview" && (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-xs px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-400 border border-emerald-300/40 font-medium">
                  {items.length} KPIs parsed from "{file?.name}"
                </div>
                {existingCount > 0 && (
                  <div className="text-xs px-2 py-1 rounded bg-yellow-50 dark:bg-yellow-400/10 text-yellow-700 dark:text-yellow-400 border border-yellow-300/40">
                    Replaces {existingCount} existing KPIs
                  </div>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { reset(); setStage("select"); }}>
                ← Back
              </Button>
            </div>
            <div className="border rounded-lg overflow-x-auto max-h-64">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-[10px] py-1.5 px-2">#</TableHead>
                    <TableHead className="text-[10px] py-1.5 px-2 min-w-40">KPI Name</TableHead>
                    <TableHead className="text-[10px] py-1.5 px-2">Category</TableHead>
                    <TableHead className="text-[10px] py-1.5 px-2 text-right">Wt.%</TableHead>
                    <TableHead className="text-[10px] py-1.5 px-2 text-right">Annual</TableHead>
                    <TableHead className="text-[10px] py-1.5 px-2 text-right">Q1</TableHead>
                    <TableHead className="text-[10px] py-1.5 px-2 text-right">Q2</TableHead>
                    <TableHead className="text-[10px] py-1.5 px-2 text-right">Q3</TableHead>
                    <TableHead className="text-[10px] py-1.5 px-2 text-right">Q4</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((item, i) => (
                    <TableRow key={i} className="text-[11px]">
                      <TableCell className="py-1 px-2 text-muted-foreground">{item.sno}</TableCell>
                      <TableCell className="py-1 px-2 font-medium max-w-48"><span className="block truncate">{item.kpiName}</span></TableCell>
                      <TableCell className="py-1 px-2 text-muted-foreground">{item.category || "—"}</TableCell>
                      <TableCell className="py-1 px-2 text-right">{fmt2(item.weightage)}</TableCell>
                      <TableCell className="py-1 px-2 text-right">{fmt2(item.annualTarget)}</TableCell>
                      <TableCell className="py-1 px-2 text-right">{fmt2(item.q1Target)}</TableCell>
                      <TableCell className="py-1 px-2 text-right">{fmt2(item.q2Target)}</TableCell>
                      <TableCell className="py-1 px-2 text-right">{fmt2(item.q3Target)}</TableCell>
                      <TableCell className="py-1 px-2 text-right">{fmt2(item.q4Target)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {items.length > 8 && (
              <button className="text-xs text-primary hover:underline" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show less" : `+ ${items.length - 8} more rows`}
              </button>
            )}
            <div className="space-y-1.5">
              <Label>Version Comments (optional)</Label>
              <Textarea value={comments} onChange={e => setComments(e.target.value)} rows={2} placeholder="e.g. Initial upload for FY 2026-27, revised targets for Q2…" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { reset(); }}>Cancel</Button>
              <Button onClick={() => setStage("confirm")}>Review & Confirm →</Button>
            </div>
          </div>
        )}

        {stage === "confirm" && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-semibold">Confirm Upload</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div className="text-muted-foreground">Employee</div><div className="font-medium">{person.name} ({person.designation})</div>
                <div className="text-muted-foreground">Financial Year</div><div className="font-medium">{year.label}</div>
                <div className="text-muted-foreground">File</div><div className="font-medium truncate">{file?.name}</div>
                <div className="text-muted-foreground">KPIs to Upload</div><div className="font-medium text-emerald-600">{items.length} KPIs</div>
                {existingCount > 0 && <><div className="text-muted-foreground">Existing KPIs</div><div className="font-medium text-red-500">{existingCount} will be replaced</div></>}
                {comments && <><div className="text-muted-foreground">Comments</div><div className="font-medium">{comments}</div></>}
              </div>
            </div>
            {existingCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-400/10 border border-yellow-300/50 text-yellow-700 dark:text-yellow-400 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>The existing <strong>{existingCount} KPIs</strong> for this person and year will be <strong>deleted and replaced</strong> with the new {items.length} KPIs. The old Excel file will still be accessible in Version History.</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStage("preview")} disabled={uploading}>← Back</Button>
              <Button onClick={upload} disabled={uploading}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />{uploading ? "Uploading…" : `Confirm Upload (${items.length} KPIs)`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Version History Dialog ───────────────────────────────────────────────────
function HistoryDialog({ open, set, person, year, onClose }: { open: boolean; set: KpiSet; person: KpiPerson; year: KpiYear; onClose: () => void; }) {
  const { data: versions } = useVersions(set.id);
  const { toast } = useToast();

  const downloadVersion = async (v: KpiSetVersion) => {
    try {
      const result = await apiFetch<{ fileName: string; fileData: string; versionNumber: number }>(`/kpi-set-versions/${v.id}/download`);
      if (!result.fileData) { toast({ title: "No file data for this version", variant: "destructive" }); return; }
      const binary = atob(result.fileData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = result.fileName || `KPI_v${result.versionNumber}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { toast({ title: "Download failed", description: e.message, variant: "destructive" }); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="h-4 w-4 text-primary" />Version History — {person.name} · {year.label}</DialogTitle></DialogHeader>
        <div className="py-2">
          {(!versions || versions.length === 0) ? (
            <p className="text-center text-sm text-muted-foreground py-8">No versions uploaded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Version</TableHead>
                  <TableHead className="text-xs">File Name</TableHead>
                  <TableHead className="text-xs text-center">KPIs</TableHead>
                  <TableHead className="text-xs">Comments</TableHead>
                  <TableHead className="text-xs">Uploaded On</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map(v => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold">v{v.versionNumber}</span>
                        {v.isCurrent && <Badge className="text-[9px] px-1 py-0 bg-emerald-100 dark:bg-emerald-400/20 text-emerald-700 dark:text-emerald-400 border-emerald-300/40">Current</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-36"><span className="truncate block" title={v.fileName || ""}>{v.fileName || "—"}</span></TableCell>
                    <TableCell className="text-center text-xs font-semibold">{v.itemCount ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-32"><span className="truncate block">{v.comments || "—"}</span></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => downloadVersion(v)}>
                        <Download className="h-3 w-3 mr-1" /> Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Review Dialog ────────────────────────────────────────────────────────────
function ReviewDialog({ open, set, person, year, onClose, onSuccess }: {
  open: boolean; set: KpiSet; person: KpiPerson; year: KpiYear; onClose: () => void; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [decision, setDecision] = useState<"Approved" | "Rejected" | "">("");
  const commentsRef = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!decision) { toast({ title: "Select a decision", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiFetch(`/kpi-sets/${set.id}/review`, { method: "POST", body: JSON.stringify({ decision, approvedBy: (user as any)?.id, approvalComments: commentsRef.current?.value || undefined }) });
      toast({ title: `KPIs ${decision} for ${person.name}` });
      onSuccess(); onClose();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle>Review KPI Set — {person.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">{person.designation} · {year.label}</div>
          <div className="flex gap-2">
            <Button variant="outline" className={cn("flex-1 h-10 text-sm", decision === "Approved" && "border-emerald-500 bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700")} onClick={() => setDecision("Approved")}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
            </Button>
            <Button variant="outline" className={cn("flex-1 h-10 text-sm", decision === "Rejected" && "border-red-500 bg-red-50 dark:bg-red-400/10 text-red-600")} onClick={() => setDecision("Rejected")}>
              <XCircle className="mr-1.5 h-4 w-4" /> Reject
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Comments</Label>
            <Textarea ref={commentsRef} rows={3} placeholder="Approval / rejection comments…" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !decision}>{saving ? "Saving…" : "Submit Decision"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Detail Drawer ────────────────────────────────────────────────────────
function KpiDetailDialog({ open, set, person, year, onClose }: { open: boolean; set: KpiSet; person: KpiPerson; year: KpiYear; onClose: () => void; }) {
  const { data: items } = useSetItems(set.id);
  const displayItems = items || [];

  const downloadExcel = () => {
    if (!items || items.length === 0) return;
    downloadSetExcel(items, person, year);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1000px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              {person.name} — {person.designation} · {year.label}
            </DialogTitle>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={downloadExcel} disabled={displayItems.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download Excel
            </Button>
          </div>
        </DialogHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-[10px] py-2">#</TableHead>
                <TableHead className="text-[10px] py-2 min-w-44">KPI Name</TableHead>
                <TableHead className="text-[10px] py-2">Category</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Wt%</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Annual</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Q1 T</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Q2 T</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Q3 T</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Q4 T</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Q1 A</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Q2 A</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Q3 A</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Q4 A</TableHead>
                <TableHead className="text-[10px] py-2">Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayItems.length === 0 ? (
                <TableRow><TableCell colSpan={14} className="text-center py-8 text-sm text-muted-foreground">No KPIs uploaded yet. Use "Upload KPIs" to add data.</TableCell></TableRow>
              ) : displayItems.map((item, i) => (
                <TableRow key={item.id} className="text-[11px]">
                  <TableCell className="py-1.5 text-muted-foreground">{item.sno ?? i + 1}</TableCell>
                  <TableCell className="py-1.5 font-medium max-w-48">
                    <div className="truncate">{item.kpiName}</div>
                    {item.description && <div className="text-[10px] text-muted-foreground truncate mt-0.5">{item.description}</div>}
                  </TableCell>
                  <TableCell className="py-1.5"><span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{item.category || "—"}</span></TableCell>
                  <TableCell className="py-1.5 text-right font-medium">{fmt2(item.weightage)}</TableCell>
                  <TableCell className="py-1.5 text-right font-semibold">{fmt2(item.annualTarget)}</TableCell>
                  <TableCell className="py-1.5 text-right">{fmt2(item.q1Target)}</TableCell>
                  <TableCell className="py-1.5 text-right">{fmt2(item.q2Target)}</TableCell>
                  <TableCell className="py-1.5 text-right">{fmt2(item.q3Target)}</TableCell>
                  <TableCell className="py-1.5 text-right">{fmt2(item.q4Target)}</TableCell>
                  <TableCell className="py-1.5 text-right font-medium text-blue-600 dark:text-blue-400">{fmt2(item.q1Actual)}</TableCell>
                  <TableCell className="py-1.5 text-right font-medium text-blue-600 dark:text-blue-400">{fmt2(item.q2Actual)}</TableCell>
                  <TableCell className="py-1.5 text-right font-medium text-blue-600 dark:text-blue-400">{fmt2(item.q3Actual)}</TableCell>
                  <TableCell className="py-1.5 text-right font-medium text-blue-600 dark:text-blue-400">{fmt2(item.q4Actual)}</TableCell>
                  <TableCell className="py-1.5 text-muted-foreground max-w-28"><span className="truncate block text-[10px]">{item.remarks || "—"}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main KPIs Page ───────────────────────────────────────────────────────────
export default function KpisPage() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: years } = useKpiYears();
  const { data: persons } = usePersons();
  const { data: users } = useUsers();
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"sets" | "persons">("sets");
  const [statusFilter, setStatusFilter] = useState("all");

  const currentYear = useMemo(() => {
    if (!years) return null;
    if (selectedYearId) return years.find(y => y.id === selectedYearId) || null;
    return years.find(y => y.isCurrent) || years[0] || null;
  }, [years, selectedYearId]);

  const effectiveYearId = currentYear?.id;
  const { data: allSets } = useKpiSets(effectiveYearId);

  const sets = useMemo(() => {
    if (!allSets) return [];
    if (statusFilter === "all") return allSets;
    return allSets.filter(s => s.status === statusFilter);
  }, [allSets, statusFilter]);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["kpi-persons"] });
    qc.invalidateQueries({ queryKey: ["kpi-sets"] });
    qc.invalidateQueries({ queryKey: ["kpi-set-items"] });
    qc.invalidateQueries({ queryKey: ["kpi-set-versions"] });
  }, [qc]);

  // Dialog state
  const [personDialog, setPersonDialog] = useState<{ open: boolean; person?: KpiPerson }>({ open: false });
  const [setDialog, setSetDialog] = useState<{ open: boolean; set?: KpiSet }>({ open: false });
  const [uploadDialog, setUploadDialog] = useState<{ open: boolean; set?: KpiSet }>({ open: false });
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; set?: KpiSet }>({ open: false });
  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; set?: KpiSet }>({ open: false });
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; set?: KpiSet }>({ open: false });

  const stats = useMemo(() => {
    const s = allSets || [];
    return { total: s.length, draft: s.filter(x => x.status === "Draft").length, pending: s.filter(x => x.status === "Pending").length, approved: s.filter(x => x.status === "Approved").length };
  }, [allSets]);

  const getPerson = (id: number) => persons?.find(p => p.id === id);
  const getYear = (id: number) => years?.find(y => y.id === id);
  const getApprover = (id?: number | null) => id ? users?.find(u => u.id === id) : null;

  const submitSet = async (set: KpiSet) => {
    try {
      await apiFetch(`/kpi-sets/${set.id}/submit`, { method: "POST", body: "{}" });
      toast({ title: "KPI Set submitted for approval" });
      refresh();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const downloadCurrentExcel = async (set: KpiSet) => {
    const person = getPerson(set.personId);
    const year = getYear(set.yearId);
    if (!person || !year) return;
    try {
      const items = await apiFetch<KpiSetItem[]>(`/kpi-set-items?setId=${set.id}`);
      if (items.length === 0) { toast({ title: "No KPIs to download — upload first", variant: "destructive" }); return; }
      downloadSetExcel(items, person, year);
    } catch (e: any) { toast({ title: "Download failed", description: e.message, variant: "destructive" }); }
  };

  const TABS = [{ id: "sets", label: "KPI Sets", icon: ClipboardList }, { id: "persons", label: "Persons / CXOs", icon: Users }] as const;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">KPI Management</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Enterprise performance KPIs · All employees · Version controlled</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {years && years.length > 0 && (
            <Select value={effectiveYearId?.toString() || ""} onValueChange={v => setSelectedYearId(parseInt(v))}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Select Year" /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y.id} value={y.id.toString()}>{y.label}{y.isCurrent ? " ★" : ""}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => downloadTemplate(currentYear?.label)}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Download Template
          </Button>
          {isAdmin && (
            <Button size="sm" className="h-8 text-xs" onClick={() => setSetDialog({ open: true })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New KPI Set
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={refresh}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Total Sets" value={stats.total} sub={currentYear?.label || "this year"} icon={ClipboardList} iconBg="bg-blue-50 dark:bg-blue-400/10" iconColor="text-blue-600" borderColor="border-l-blue-400" />
        <StatCard label="Draft" value={stats.draft} sub="pending upload" icon={FileSpreadsheet} iconBg="bg-gray-50 dark:bg-gray-400/10" iconColor="text-gray-500" borderColor="border-l-gray-400" />
        <StatCard label="Pending Review" value={stats.pending} sub="awaiting approval" icon={Clock} iconBg="bg-yellow-50 dark:bg-yellow-400/10" iconColor="text-yellow-600" borderColor="border-l-yellow-400" />
        <StatCard label="Approved" value={stats.approved} sub="finalised" icon={CheckCircle2} iconBg="bg-emerald-50 dark:bg-emerald-400/10" iconColor="text-emerald-600" borderColor="border-l-emerald-400" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-border">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")}>
              <Icon className="h-3.5 w-3.5" />{tab.label}
            </button>
          );
        })}
      </div>

      {/* ── KPI Sets Tab ──────────────────────────────────────────────────── */}
      {activeTab === "sets" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{sets.length} record{sets.length !== 1 ? "s" : ""}</span>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Employee</TableHead>
                  <TableHead className="text-xs">Designation</TableHead>
                  <TableHead className="text-xs">Year</TableHead>
                  <TableHead className="text-xs">Approver</TableHead>
                  <TableHead className="text-xs text-center">Version</TableHead>
                  <TableHead className="text-xs text-center">KPIs</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Last Updated</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">No KPI sets found.</p>
                      {isAdmin && <p className="text-xs text-muted-foreground mt-1">Click "New KPI Set" to create the first one.</p>}
                    </TableCell>
                  </TableRow>
                )}
                {sets.map(s => {
                  const person = getPerson(s.personId);
                  const year = getYear(s.yearId);
                  if (!person || !year) return null;
                  const approver = getApprover(person.approvingAuthorityId);
                  return (
                    <TableRow key={s.id} className="hover:bg-muted/20">
                      <TableCell>
                        <div>
                          <p className="text-sm font-semibold">{person.name}</p>
                          {person.employeeCode && <p className="text-[10px] text-muted-foreground">{person.employeeCode}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{person.designation}</TableCell>
                      <TableCell className="text-xs font-medium">{year.label}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{approver?.name || "—"}</TableCell>
                      <TableCell className="text-center">
                        <SetVersionBadge setId={s.id} />
                      </TableCell>
                      <TableCell className="text-center">
                        <SetItemCount setId={s.id} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", STATUS_COLORS[s.status] || "")}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(s.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="View KPIs" onClick={() => setDetailDialog({ open: true, set: s })}><Eye className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Download Excel" onClick={() => downloadCurrentExcel(s)}><Download className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Version History" onClick={() => setHistoryDialog({ open: true, set: s })}><History className="h-3.5 w-3.5" /></Button>
                          {isAdmin && <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Upload KPIs" onClick={() => setUploadDialog({ open: true, set: s })}><Upload className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => setSetDialog({ open: true, set: s })}><Edit2 className="h-3.5 w-3.5" /></Button>
                            {s.status === "Draft" && <Button variant="ghost" size="icon" className="h-7 w-7 text-yellow-600" title="Submit for Approval" onClick={() => submitSet(s)}><Send className="h-3.5 w-3.5" /></Button>}
                            {s.status === "Pending" && <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Review/Approve" onClick={() => setReviewDialog({ open: true, set: s })}><CheckCircle2 className="h-3.5 w-3.5" /></Button>}
                          </>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* ── Persons Tab ───────────────────────────────────────────────────── */}
      {activeTab === "persons" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{(persons || []).length} person{(persons?.length || 0) !== 1 ? "s" : ""}</span>
            {isAdmin && (
              <Button size="sm" className="h-8 text-xs" onClick={() => setPersonDialog({ open: true })}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Person
              </Button>
            )}
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Designation</TableHead>
                  <TableHead className="text-xs">Department</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Approving Authority</TableHead>
                  <TableHead className="text-xs">Emp. Code</TableHead>
                  {isAdmin && <TableHead className="text-xs text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(persons || []).length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">No persons added yet. Click "Add Person" to start.</TableCell></TableRow>
                )}
                {(persons || []).map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-sm">{p.name}</TableCell>
                    <TableCell className="text-xs">{p.designation}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.department || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.email || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{getApprover(p.approvingAuthorityId)?.name || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{p.employeeCode || "—"}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPersonDialog({ open: true, person: p })}><Edit2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      {personDialog.open && (
        <PersonDialog open users={users || []} person={personDialog.person} onClose={() => setPersonDialog({ open: false })} onSuccess={refresh} />
      )}
      {setDialog.open && currentYear && (
        <KpiSetDialog open set={setDialog.set} persons={persons || []} years={years || []} onClose={() => setSetDialog({ open: false })} onSuccess={refresh} />
      )}
      {uploadDialog.open && uploadDialog.set && currentYear && (() => {
        const person = getPerson(uploadDialog.set!.personId);
        const year = getYear(uploadDialog.set!.yearId);
        return person && year ? (
          <UploadExcelDialogWrapper set={uploadDialog.set!} person={person} year={year} onClose={() => setUploadDialog({ open: false })} onSuccess={refresh} />
        ) : null;
      })()}
      {historyDialog.open && historyDialog.set && (() => {
        const person = getPerson(historyDialog.set!.personId);
        const year = getYear(historyDialog.set!.yearId);
        return person && year ? (
          <HistoryDialog open set={historyDialog.set!} person={person} year={year} onClose={() => setHistoryDialog({ open: false })} />
        ) : null;
      })()}
      {reviewDialog.open && reviewDialog.set && (() => {
        const person = getPerson(reviewDialog.set!.personId);
        const year = getYear(reviewDialog.set!.yearId);
        return person && year ? (
          <ReviewDialog open set={reviewDialog.set!} person={person} year={year} onClose={() => setReviewDialog({ open: false })} onSuccess={refresh} />
        ) : null;
      })()}
      {detailDialog.open && detailDialog.set && (() => {
        const person = getPerson(detailDialog.set!.personId);
        const year = getYear(detailDialog.set!.yearId);
        return person && year ? (
          <KpiDetailDialog open set={detailDialog.set!} person={person} year={year} onClose={() => setDetailDialog({ open: false })} />
        ) : null;
      })()}
    </div>
  );
}

// ─── Helper components with their own data fetching ──────────────────────────
function SetVersionBadge({ setId }: { setId: number }) {
  const { data } = useVersions(setId);
  const current = data?.find(v => v.isCurrent);
  return <span className="font-mono text-xs text-muted-foreground">{current ? `v${current.versionNumber}` : "—"}</span>;
}
function SetItemCount({ setId }: { setId: number }) {
  const { data } = useVersions(setId);
  const current = data?.find(v => v.isCurrent);
  return <span className="text-xs font-semibold">{current?.itemCount ?? "—"}</span>;
}
function UploadExcelDialogWrapper({ set, person, year, onClose, onSuccess }: { set: KpiSet; person: KpiPerson; year: KpiYear; onClose: () => void; onSuccess: () => void; }) {
  const { data: versions } = useVersions(set.id);
  const current = versions?.find(v => v.isCurrent);
  return <UploadDialog open set={set} person={person} year={year} existingCount={current?.itemCount || 0} onClose={onClose} onSuccess={onSuccess} />;
}
