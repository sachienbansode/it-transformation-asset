import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Plus, Upload, Download, History, Eye, Send, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Maximize2, Minimize2, FileSpreadsheet, ClipboardList,
  Pencil, Trash2, RefreshCw, AlertTriangle, Target, Archive,
  FolderOpen, RotateCcw, Info,
} from "lucide-react";
// ─── Types ───────────────────────────────────────────────────────────────────

interface KpiYear { id: number; label: string; startDate: string; endDate: string; isActive: boolean; isCurrent: boolean; }
interface KpiPerson { id: number; name: string; designation: string; department?: string; email?: string; employeeCode?: string; approvingAuthorityId?: number; isActive: boolean; }
interface KpiSet {
  id: number; personId: number; yearId: number; status: string;
  currentVersionId?: number; notes?: string; submittedAt?: string;
  approvedAt?: string; approvedBy?: number; approvalComments?: string;
  createdAt: string; updatedAt: string; itemCount?: number; versionNumber?: number;
}
interface KpiSetVersion { id: number; setId: number; versionNumber: number; fileName?: string; fileData?: string; fileSize?: number; itemCount?: number; uploadedBy?: number; comments?: string; isCurrent: boolean; createdAt: string; }
interface KpiSetItem {
  id: number; setId: number; versionId: number; sno?: number;
  kpiName: string; description?: string; category?: string; weightage?: string;
  metric?: string; unit?: string; annualTarget?: string;
  q1Target?: string; q2Target?: string; q3Target?: string; q4Target?: string;
  q1Actual?: string; q2Actual?: string; q3Actual?: string; q4Actual?: string;
  remarks?: string;
  approvalStatus?: string; approvedBy?: number; approvalComments?: string; approvedAt?: string;
}
interface ParsedItem {
  sno: number; kpiName: string; description: string; category: string;
  weightage: string; metric: string; unit: string; annualTarget: string;
  q1Target: string; q2Target: string; q3Target: string; q4Target: string;
  q1Actual: string; q2Actual: string; q3Actual: string; q4Actual: string; remarks: string;
}
interface CategoryGroup {
  category: string; items: KpiSetItem[];
  totalWeightage: number; avgAchievement: number | null;
  approvedCount: number; rejectedCount: number; pendingCount: number; totalCount: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DESIGNATIONS = [
  "Chief Executive Officer","Chief Financial Officer","Chief Technology Officer","Chief Operating Officer",
  "Chief Information Officer","Chief Human Resources Officer","Chief Marketing Officer","Chief Strategy Officer",
  "Vice President","Senior Vice President","Director","Senior Director","General Manager",
  "Deputy General Manager","Assistant General Manager","Manager","Senior Manager","Head of Department","Team Lead",
];
const DEPARTMENTS = [
  "Technology","Finance","Operations","Human Resources","Marketing","Strategy","Legal",
  "Risk & Compliance","Sales","Customer Success","Product","Research & Development",
  "Administration","Business Development","Internal Audit",
];
const STATUS_COLORS: Record<string,string> = {
  Draft: "border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
  Pending: "border-yellow-500/30 text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-400/10",
  Approved: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10",
  Rejected: "border-red-500/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10",
  Archived: "border-gray-400/30 text-gray-400 bg-gray-50 dark:bg-gray-400/10",
};
const TEMPLATE_HEADERS = ["S.No","KPI Name","Description","Category","Weightage (%)","Metric","Unit","Annual Target","Q1 Target","Q2 Target","Q3 Target","Q4 Target","Q1 Actual","Q2 Actual","Q3 Actual","Q4 Actual","Remarks"];

// ─── Utilities ───────────────────────────────────────────────────────────────

const fmt2 = (v: string|number|null|undefined, fallback="—"): string => {
  if (v===null||v===undefined||v==="") return fallback;
  const n = parseFloat(String(v));
  return isNaN(n) ? fallback : n.toFixed(2);
};

const norm = (k: string) => k.toLowerCase().replace(/[\s_()\-%#./\\:]/g,"");

const parseExcelRows = (data: ArrayBuffer): ParsedItem[] => {
  const wb = XLSX.read(data,{type:"array"});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string,unknown>>(ws,{defval:""});
  const getStr = (row: Record<string,unknown>,...keys: string[]): string => {
    for (const k of keys) {
      const nk = norm(k);
      for (const [rk,rv] of Object.entries(row)) {
        if (norm(rk)===nk) { const val=rv!==null&&rv!==undefined?String(rv).trim():""; if(val!=="") return val; }
      }
    }
    return "";
  };
  return raw.map((r,i)=>{
    const snoRaw=getStr(r,"S.No","SNo","No.","No","S No","Sl No","#");
    const sno=snoRaw?parseInt(snoRaw):i+1;
    return {
      sno: isNaN(sno)?i+1:sno,
      kpiName: getStr(r,"KPI Name","KPIName","Name","kpi_name","KPI"),
      description: getStr(r,"Description","Desc","Details","KPI Description"),
      category: getStr(r,"Category","Cat","KPI Category","Category Name","Group"),
      weightage: getStr(r,"Weightage (%)","Weightage","Weight","Wt%","Wt","wt","Weightage%"),
      metric: getStr(r,"Metric","Metrics","Measurement","KPI Metric"),
      unit: getStr(r,"Unit","Units","Measure Unit","UOM"),
      annualTarget: getStr(r,"Annual Target","AnnualTarget","Annual","Target","Full Year Target"),
      q1Target: getStr(r,"Q1 Target","Q1Target","Q1T","Q1 T","Q1"),
      q2Target: getStr(r,"Q2 Target","Q2Target","Q2T","Q2 T","Q2"),
      q3Target: getStr(r,"Q3 Target","Q3Target","Q3T","Q3 T","Q3"),
      q4Target: getStr(r,"Q4 Target","Q4Target","Q4T","Q4 T","Q4"),
      q1Actual: getStr(r,"Q1 Actual","Q1Actual","Q1A","Q1 A","Q1Actuals","Q1 Achievement"),
      q2Actual: getStr(r,"Q2 Actual","Q2Actual","Q2A","Q2 A","Q2 Achievement"),
      q3Actual: getStr(r,"Q3 Actual","Q3Actual","Q3A","Q3 A","Q3 Achievement"),
      q4Actual: getStr(r,"Q4 Actual","Q4Actual","Q4A","Q4 A","Q4 Achievement"),
      remarks: getStr(r,"Remarks","Notes","Comments","Remark"),
    };
  }).filter(r=>r.kpiName!=="");
};

const downloadTemplate = (yearLabel?: string) => {
  const wb=XLSX.utils.book_new();
  const sampleRows=[
    [1,"IT Infrastructure Uptime","Measure % uptime across critical systems","Operations","10.00","% Uptime","%","99.50","99.00","99.50","99.50","99.00","","","","","Monthly dashboards"],
    [2,"Revenue Growth","Annual revenue growth vs previous year","Financial","15.00","% Growth","%","15.00","12.00","13.50","14.00","15.00","","","","",""],
    [3,"Customer Satisfaction","NPS or CSAT from surveys","Customer","10.00","NPS Score","Score","75.00","70.00","72.00","74.00","75.00","","","","","Quarterly survey"],
    [4,"Employee Engagement","Annual engagement survey","People","8.00","Score","%","80.00","","","","80.00","","","","","Annual survey"],
    [5,"Cost Reduction","Cost savings through optimization","Financial","12.00","₹ Lakhs","₹ Lakhs","50.00","10.00","20.00","35.00","50.00","","","","",""],
  ];
  const ws=XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS,...sampleRows]);
  ws["!cols"]=[6,36,32,16,12,16,10,14,10,10,10,10,10,10,10,10,24].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,"KPI Template");
  const infoData=[
    ["Column","Required","Description","Example"],
    ["S.No","No","Auto-filled if blank","1, 2, 3..."],
    ["KPI Name","YES","Unique name for this KPI","IT Infrastructure Uptime"],
    ["Description","No","What is measured","Measure % uptime across critical systems"],
    ["Category","No","Group (Operations/Financial/Customer/People)","Operations"],
    ["Weightage (%)","No","Importance weight — total should be 100","10.00"],
    ["Metric","No","How the KPI is measured","% Uptime"],
    ["Unit","No","Unit of measurement","%, Days, ₹ Lakhs, Score"],
    ["Annual Target","No","Target for full financial year","99.50"],
    ["Q1-Q4 Target","No","Quarterly targets","99.00"],
    ["Q1-Q4 Actual","No","Actual achievement per quarter (fill post quarter)",""],
    ["Remarks","No","Notes, context, or observations","Track via dashboards"],
  ];
  const wsInfo=XLSX.utils.aoa_to_sheet(infoData);
  wsInfo["!cols"]=[{wch:18},{wch:10},{wch:52},{wch:30}];
  XLSX.utils.book_append_sheet(wb,wsInfo,"Instructions");
  XLSX.writeFile(wb,`KPI_Template${yearLabel?`_${yearLabel.replace(/\s+/g,"_")}`:""}.xlsx`);
};

const downloadSetExcel=(items: KpiSetItem[],person: KpiPerson,year: KpiYear)=>{
  const wb=XLSX.utils.book_new();
  const headers=[...TEMPLATE_HEADERS,"Approval Status","Approval Comments"];
  const rows=items.map((item,i)=>[
    item.sno??i+1,item.kpiName,item.description||"",item.category||"",
    fmt2(item.weightage,""),item.metric||"",item.unit||"",
    fmt2(item.annualTarget,""),fmt2(item.q1Target,""),fmt2(item.q2Target,""),fmt2(item.q3Target,""),fmt2(item.q4Target,""),
    fmt2(item.q1Actual,""),fmt2(item.q2Actual,""),fmt2(item.q3Actual,""),fmt2(item.q4Actual,""),
    item.remarks||"",item.approvalStatus||"Draft",item.approvalComments||"",
  ]);
  const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);
  ws["!cols"]=[6,36,32,16,12,16,10,14,10,10,10,10,10,10,10,10,24,14,36].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,"KPIs");
  XLSX.writeFile(wb,`${person.name.replace(/\s+/g,"_")}_${year.label.replace(/\s+/g,"_")}_KPIs.xlsx`);
};

// ─── Category computation ─────────────────────────────────────────────────────

const computeGroups=(items: KpiSetItem[]): CategoryGroup[]=>{
  const map=new Map<string,KpiSetItem[]>();
  for(const item of items){
    const cat=item.category?.trim()||"Uncategorized";
    if(!map.has(cat)) map.set(cat,[]);
    map.get(cat)!.push(item);
  }
  return Array.from(map.entries()).map(([category,grpItems])=>{
    const totalWeightage=grpItems.reduce((s,i)=>s+parseFloat(i.weightage||"0"),0);
    const achievements: number[]=grpItems.flatMap(i=>{
      const target=parseFloat(i.annualTarget||"0");
      const actuals=[i.q4Actual,i.q3Actual,i.q2Actual,i.q1Actual].map(a=>parseFloat(a||"0")).filter(a=>a>0);
      return target>0&&actuals.length>0?[(actuals[0]/target)*100]:[];
    });
    const avgAchievement=achievements.length>0?achievements.reduce((s,a)=>s+a,0)/achievements.length:null;
    return {
      category,items:grpItems,totalWeightage,avgAchievement,
      approvedCount:grpItems.filter(i=>i.approvalStatus==="Approved").length,
      rejectedCount:grpItems.filter(i=>i.approvalStatus==="Rejected").length,
      pendingCount:grpItems.filter(i=>!["Approved","Rejected"].includes(i.approvalStatus||"")).length,
      totalCount:grpItems.length,
    };
  });
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

const useKpiYears=()=>useQuery({queryKey:["kpi-years"],queryFn:()=>apiFetch<KpiYear[]>("/kpi-years")});
const usePersons=()=>useQuery({queryKey:["kpi-persons"],queryFn:()=>apiFetch<KpiPerson[]>("/kpi-persons")});
const useKpiSets=(yearId?: number)=>useQuery({queryKey:["kpi-sets",yearId],enabled:!!yearId,queryFn:()=>apiFetch<KpiSet[]>(`/kpi-sets?yearId=${yearId}`)});
const useArchivedSets=(yearId?: number)=>useQuery({queryKey:["kpi-sets-archived",yearId],enabled:!!yearId,queryFn:()=>apiFetch<KpiSet[]>(`/kpi-sets?yearId=${yearId}&archived=true`)});
const useVersions=(setId?: number)=>useQuery({queryKey:["kpi-set-versions",setId],enabled:!!setId,queryFn:()=>apiFetch<KpiSetVersion[]>(`/kpi-sets/${setId}/versions`)});
const useSetItems=(setId?: number)=>useQuery({queryKey:["kpi-set-items",setId],enabled:!!setId,queryFn:()=>apiFetch<KpiSetItem[]>(`/kpi-set-items?setId=${setId}`),refetchOnWindowFocus:false});

// ─── Person Dialog ────────────────────────────────────────────────────────────

function PersonDialog({open,initialPerson,persons,onClose,onSuccess}:{
  open: boolean; initialPerson: KpiPerson|null; persons: KpiPerson[]; onClose:()=>void; onSuccess:()=>void;
}){
  const{toast}=useToast();
  const[saving,setSaving]=useState(false);
  const[form,setForm]=useState({name:"",designation:"",department:"",email:"",employeeCode:"",approvingAuthorityId:""});
  useEffect(()=>{
    if(initialPerson){setForm({name:initialPerson.name,designation:initialPerson.designation,department:initialPerson.department||"",email:initialPerson.email||"",employeeCode:initialPerson.employeeCode||"",approvingAuthorityId:initialPerson.approvingAuthorityId?.toString()||""});}
    else{setForm({name:"",designation:"",department:"",email:"",employeeCode:"",approvingAuthorityId:""});}
  },[initialPerson,open]);
  const handleSave=async()=>{
    if(!form.name.trim()||!form.designation){toast({title:"Name and Designation are required",variant:"destructive"});return;}
    setSaving(true);
    try{
      const body={name:form.name.trim(),designation:form.designation,department:form.department||null,email:form.email||null,employeeCode:form.employeeCode||null,approvingAuthorityId:form.approvingAuthorityId?parseInt(form.approvingAuthorityId):null};
      if(initialPerson){await apiFetch(`/kpi-persons/${initialPerson.id}`,{method:"PATCH",body:JSON.stringify(body)});toast({title:"Person updated"});}
      else{await apiFetch("/kpi-persons",{method:"POST",body:JSON.stringify(body)});toast({title:"Person created"});}
      onSuccess();
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    finally{setSaving(false);}
  };
  return(
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{initialPerson?"Edit Person / CXO":"Add Person / CXO"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label className="text-xs">Full Name *</Label><Input className="h-8 text-sm" placeholder="e.g. Sachin Birla" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
            <div className="space-y-1"><Label className="text-xs">Designation *</Label>
              <Select value={form.designation} onValueChange={v=>setForm(p=>({...p,designation:v}))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select"/></SelectTrigger>
                <SelectContent>{DESIGNATIONS.map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Department</Label>
              <Select value={form.department} onValueChange={v=>setForm(p=>({...p,department:v}))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select"/></SelectTrigger>
                <SelectContent>{DEPARTMENTS.map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Work Email</Label><Input className="h-8 text-sm" placeholder="name@ashikagroup.com" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></div>
            <div className="space-y-1"><Label className="text-xs">Employee Code</Label><Input className="h-8 text-sm" placeholder="EMP001" value={form.employeeCode} onChange={e=>setForm(p=>({...p,employeeCode:e.target.value}))}/></div>
            <div className="col-span-2 space-y-1"><Label className="text-xs">Approving Authority</Label>
              <Select value={form.approvingAuthorityId} onValueChange={v=>setForm(p=>({...p,approvingAuthorityId:v}))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select approver"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {persons.filter(p=>!initialPerson||p.id!==initialPerson.id).map(p=><SelectItem key={p.id} value={p.id.toString()}>{p.name} — {p.designation}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving?"Saving…":"Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Set Dialog ───────────────────────────────────────────────────────────

function KpiSetDialog({open,initialSet,persons,years,onClose,onSuccess}:{
  open: boolean; initialSet: KpiSet|null; persons: KpiPerson[]; years: KpiYear[]; onClose:()=>void; onSuccess:()=>void;
}){
  const{toast}=useToast();
  const[saving,setSaving]=useState(false);
  const[personId,setPersonId]=useState("");
  const[yearId,setYearId]=useState("");
  const[notes,setNotes]=useState("");
  useEffect(()=>{
    if(initialSet){setPersonId(initialSet.personId.toString());setYearId(initialSet.yearId.toString());setNotes(initialSet.notes||"");}
    else{setPersonId("");setYearId("");setNotes("");}
  },[initialSet,open]);
  const handleSave=async()=>{
    if(!personId||!yearId){toast({title:"Person and Year are required",variant:"destructive"});return;}
    setSaving(true);
    try{
      if(initialSet){await apiFetch(`/kpi-sets/${initialSet.id}`,{method:"PATCH",body:JSON.stringify({notes})});toast({title:"KPI set updated"});}
      else{await apiFetch("/kpi-sets",{method:"POST",body:JSON.stringify({personId:parseInt(personId),yearId:parseInt(yearId),notes})});toast({title:"KPI set created"});}
      onSuccess();
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    finally{setSaving(false);}
  };
  return(
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{initialSet?"Edit KPI Set":"New KPI Set"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1"><Label className="text-xs">Person / Employee *</Label>
            <Select value={personId} onValueChange={setPersonId} disabled={!!initialSet}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select person"/></SelectTrigger>
              <SelectContent>{persons.map(p=><SelectItem key={p.id} value={p.id.toString()}>{p.name} — {p.designation}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Financial Year *</Label>
            <Select value={yearId} onValueChange={setYearId} disabled={!!initialSet}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select year"/></SelectTrigger>
              <SelectContent>{years.map(y=><SelectItem key={y.id} value={y.id.toString()}>{y.label}{y.isCurrent?" (Current)":""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea className="text-sm min-h-[60px]" placeholder="Optional notes…" value={notes} onChange={e=>setNotes(e.target.value)}/></div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving?"Saving…":"Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Upload Dialog ────────────────────────────────────────────────────────────

type UploadStep="select"|"preview"|"confirm";

function UploadDialog({open,set,person,year,userId,onClose,onSuccess}:{
  open: boolean; set: KpiSet; person: KpiPerson; year: KpiYear; userId?: number; onClose:()=>void; onSuccess:()=>void;
}){
  const{toast}=useToast();
  const[step,setStep]=useState<UploadStep>("select");
  const[file,setFile]=useState<File|null>(null);
  const[parsed,setParsed]=useState<ParsedItem[]>([]);
  const[comments,setComments]=useState("");
  const[saving,setSaving]=useState(false);
  const[fileData,setFileData]=useState<string>("");
  useEffect(()=>{if(!open){setStep("select");setFile(null);setParsed([]);setComments("");}}, [open]);
  const handleFile=async(e: React.ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];
    if(!f) return;
    setFile(f);
    const buf=await f.arrayBuffer();
    const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
    setFileData(b64);
    try{
      const rows=parseExcelRows(buf);
      if(rows.length===0){toast({title:"No KPI rows found",description:"Ensure the file uses the standard template format.",variant:"destructive"});return;}
      setParsed(rows);setStep("preview");
    }catch(e:any){toast({title:"Parse error",description:e.message,variant:"destructive"});}
  };
  const handleUpload=async()=>{
    setSaving(true);
    try{
      await apiFetch(`/kpi-sets/${set.id}/upload`,{method:"POST",body:JSON.stringify({
        fileName:file!.name,fileData,fileSize:file!.size,comments,uploadedBy:userId,
        items:parsed.map(p=>({sno:p.sno,kpiName:p.kpiName,description:p.description,category:p.category,weightage:p.weightage,metric:p.metric,unit:p.unit,annualTarget:p.annualTarget,q1Target:p.q1Target,q2Target:p.q2Target,q3Target:p.q3Target,q4Target:p.q4Target,q1Actual:p.q1Actual,q2Actual:p.q2Actual,q3Actual:p.q3Actual,q4Actual:p.q4Actual,remarks:p.remarks})),
      })});
      toast({title:"KPIs uploaded",description:`${parsed.length} KPIs saved as new version.`});
      onSuccess();
    }catch(e:any){toast({title:"Upload failed",description:e.message,variant:"destructive"});}
    finally{setSaving(false);}
  };
  const totalWt=parsed.reduce((s,r)=>s+parseFloat(r.weightage||"0"),0);
  const categories=[...new Set(parsed.map(r=>r.category).filter(Boolean))];
  return(
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader><DialogTitle className="text-sm font-semibold">Upload KPIs — {person.name} · {year.label}</DialogTitle></DialogHeader>
        {step==="select"&&(
          <div className="py-6 flex flex-col items-center gap-4">
            <div className="border-2 border-dashed border-border rounded-xl p-10 w-full text-center">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3"/>
              <p className="text-sm font-medium mb-1">Select Excel file to upload</p>
              <p className="text-xs text-muted-foreground mb-4">Use the standard KPI template (.xlsx)</p>
              <Button size="sm" onClick={()=>document.getElementById("kpi-file-input")?.click()}><Upload className="mr-2 h-4 w-4"/>Choose File</Button>
              <input id="kpi-file-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile}/>
            </div>
            <p className="text-xs text-muted-foreground">Download the template from the main page header.</p>
          </div>
        )}
        {step==="preview"&&(
          <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-0">
            <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              <span><strong className="text-foreground">{parsed.length}</strong> KPIs found</span>
              {categories.length>0&&<span><strong className="text-foreground">{categories.length}</strong> categories: {categories.join(", ")}</span>}
              <span>Total weightage: <strong className={totalWt>101||(totalWt<99&&totalWt>0)?"text-yellow-600":"text-foreground"}>{totalWt.toFixed(2)}%</strong></span>
              <span className="ml-auto font-medium text-foreground">{file?.name}</span>
            </div>
            <div className="flex-1 overflow-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm border-b border-border">
                  <tr>{["#","KPI Name","Category","Description","Metric","Unit","Wt%","Annual","Q1T","Q2T","Q3T","Q4T","Q1A","Q2A","Q3A","Q4A","Remarks"].map(h=><th key={h} className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {parsed.map((r,i)=>(
                    <tr key={i} className="border-t border-border/40 hover:bg-muted/20">
                      <td className="px-2 py-1.5 text-muted-foreground">{r.sno}</td>
                      <td className="px-2 py-1.5 font-medium max-w-36"><div className="truncate" title={r.kpiName}>{r.kpiName}</div></td>
                      <td className="px-2 py-1.5"><span className={cn("px-1.5 py-0.5 rounded text-[10px]",r.category?"bg-blue-100 text-blue-700 dark:bg-blue-400/20 dark:text-blue-400":"text-muted-foreground")}>{r.category||"—"}</span></td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-32"><div className="truncate" title={r.description}>{r.description||"—"}</div></td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.metric||"—"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.unit||"—"}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{fmt2(r.weightage)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt2(r.annualTarget)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt2(r.q1Target)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt2(r.q2Target)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt2(r.q3Target)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt2(r.q4Target)}</td>
                      <td className="px-2 py-1.5 text-right text-blue-600 dark:text-blue-400">{fmt2(r.q1Actual)}</td>
                      <td className="px-2 py-1.5 text-right text-blue-600 dark:text-blue-400">{fmt2(r.q2Actual)}</td>
                      <td className="px-2 py-1.5 text-right text-blue-600 dark:text-blue-400">{fmt2(r.q3Actual)}</td>
                      <td className="px-2 py-1.5 text-right text-blue-600 dark:text-blue-400">{fmt2(r.q4Actual)}</td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-24"><div className="truncate" title={r.remarks}>{r.remarks||"—"}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 justify-between">
              <Button variant="outline" size="sm" onClick={()=>setStep("select")}>Back</Button>
              <Button size="sm" onClick={()=>setStep("confirm")}>Review &amp; Confirm</Button>
            </div>
          </div>
        )}
        {step==="confirm"&&(
          <div className="space-y-4 py-2">
            <div className="border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-400/10 rounded-lg p-4">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5"/>
                <div>
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Confirm Upload</p>
                  <p className="text-xs text-yellow-600/80 dark:text-yellow-400/70 mt-1">
                    This will replace all existing KPIs for <strong>{person.name}</strong> in <strong>{year.label}</strong> with {parsed.length} new KPIs from <strong>{file?.name}</strong>. The previous version will be saved in history.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Upload comments (optional)</Label><Textarea className="text-sm min-h-[60px]" placeholder="e.g. Updated Q2 targets based on board review…" value={comments} onChange={e=>setComments(e.target.value)}/></div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={()=>setStep("preview")}>Back to Preview</Button>
              <Button size="sm" onClick={handleUpload} disabled={saving}>{saving?"Uploading…":`Upload ${parsed.length} KPIs`}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── History Dialog ───────────────────────────────────────────────────────────

function HistoryDialog({open,set,person,year,onClose}:{
  open: boolean; set: KpiSet; person: KpiPerson; year: KpiYear; onClose:()=>void;
}){
  const{data:versions}=useVersions(open?set.id:undefined);
  const{toast}=useToast();
  const handleDownload=async(v: KpiSetVersion)=>{
    try{
      const res=await apiFetch<{fileName:string;fileData:string}>(`/kpi-set-versions/${v.id}/download`);
      const bytes=Uint8Array.from(atob(res.fileData),c=>c.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      const a=document.createElement("a");a.href=url;a.download=res.fileName||`version_${v.versionNumber}.xlsx`;a.click();URL.revokeObjectURL(url);
    }catch(e:any){toast({title:"Download failed",description:e.message,variant:"destructive"});}
  };
  return(
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-sm">Version History — {person.name} · {year.label}</DialogTitle></DialogHeader>
        <div className="space-y-2 py-2 max-h-96 overflow-y-auto">
          {!versions?(<div className="space-y-2">{[1,2,3].map(i=><Skeleton key={i} className="h-14 w-full"/>)}</div>)
          :versions.length===0?(<p className="text-sm text-muted-foreground text-center py-8">No upload history yet.</p>)
          :versions.map(v=>(
            <div key={v.id} className={cn("flex items-center gap-3 p-3 border border-border rounded-lg",v.isCurrent&&"border-primary/40 bg-primary/5")}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">v{v.versionNumber}</span>
                  {v.isCurrent&&<Badge variant="outline" className="text-[9px] h-4 border-primary/40 text-primary">Current</Badge>}
                  <span className="text-[10px] text-muted-foreground">{v.itemCount??0} KPIs</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(v.createdAt).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}
                  {v.fileName&&<span className="ml-2 italic">— {v.fileName}</span>}
                </div>
                {v.comments&&<p className="text-[10px] text-muted-foreground mt-0.5">{v.comments}</p>}
              </div>
              {v.fileData&&<Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={()=>handleDownload(v)} title="Download"><Download className="h-3.5 w-3.5"/></Button>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Approval panel state ─────────────────────────────────────────────────────

interface ApprovalPanelState{id:number;decision:"Approved"|"Rejected";}

// ─── KPI Item Row (all columns + inline approval panel) ───────────────────────

function KpiItemRow({item,idx,canApprove,approvalPanel,approvalComment,saving,onPanelChange,onCommentChange,onApprove,colSpanTotal}:{
  item: KpiSetItem; idx: number; canApprove: boolean;
  approvalPanel: ApprovalPanelState|null; approvalComment: string; saving: boolean;
  onPanelChange:(v:ApprovalPanelState|null)=>void;
  onCommentChange:(v:string)=>void;
  onApprove:(id:number,decision:"Approved"|"Rejected",comment:string)=>void;
  colSpanTotal: number;
}){
  const isActive=approvalPanel?.id===item.id;
  const itemPending=!["Approved","Rejected"].includes(item.approvalStatus||"");
  const rowBg=item.approvalStatus==="Approved"?"bg-emerald-50/40 dark:bg-emerald-400/5":item.approvalStatus==="Rejected"?"bg-red-50/40 dark:bg-red-400/5":"";
  return(
    <>
      <tr className={cn("border-b border-border/40 hover:bg-muted/10 transition-colors",rowBg,isActive&&"bg-blue-50/30 dark:bg-blue-400/5")}>
        <td className="px-2 py-1.5 text-muted-foreground text-center text-[10px] w-7">{item.sno??idx+1}</td>
        <td className="px-2 py-1.5 font-medium max-w-44"><div className="truncate text-[11px]" title={item.kpiName}>{item.kpiName}</div></td>
        <td className="px-2 py-1.5 text-muted-foreground max-w-36"><div className="truncate text-[10px]" title={item.description||""}>{item.description||"—"}</div></td>
        <td className="px-2 py-1.5 text-[10px] text-muted-foreground">{item.metric||"—"}</td>
        <td className="px-2 py-1.5 text-[10px] text-muted-foreground">{item.unit||"—"}</td>
        <td className="px-2 py-1.5 text-right text-[11px] font-medium">{fmt2(item.weightage)}</td>
        <td className="px-2 py-1.5 text-right text-[11px] font-semibold">{fmt2(item.annualTarget)}</td>
        <td className="px-2 py-1.5 text-right text-[10px]">{fmt2(item.q1Target)}</td>
        <td className="px-2 py-1.5 text-right text-[10px]">{fmt2(item.q2Target)}</td>
        <td className="px-2 py-1.5 text-right text-[10px]">{fmt2(item.q3Target)}</td>
        <td className="px-2 py-1.5 text-right text-[10px]">{fmt2(item.q4Target)}</td>
        <td className="px-2 py-1.5 text-right text-[10px] text-blue-600 dark:text-blue-400">{fmt2(item.q1Actual)}</td>
        <td className="px-2 py-1.5 text-right text-[10px] text-blue-600 dark:text-blue-400">{fmt2(item.q2Actual)}</td>
        <td className="px-2 py-1.5 text-right text-[10px] text-blue-600 dark:text-blue-400">{fmt2(item.q3Actual)}</td>
        <td className="px-2 py-1.5 text-right text-[10px] text-blue-600 dark:text-blue-400">{fmt2(item.q4Actual)}</td>
        <td className="px-2 py-1.5 max-w-28"><div className="truncate text-[10px] text-muted-foreground" title={item.remarks||""}>{item.remarks||"—"}</div></td>
        <td className="px-2 py-1.5 text-center">
          <Badge variant="outline" className={cn("text-[9px] px-1 py-0 whitespace-nowrap",STATUS_COLORS[item.approvalStatus||"Draft"]||"")}>{item.approvalStatus||"Draft"}</Badge>
          {item.approvalComments&&<div className="text-[9px] text-muted-foreground mt-0.5 max-w-20 truncate" title={item.approvalComments}>{item.approvalComments}</div>}
        </td>
        {canApprove&&(
          <td className="px-2 py-1.5 text-center">
            {itemPending?(
              <div className="flex items-center justify-center gap-1">
                <button onClick={()=>{onPanelChange({id:item.id,decision:"Approved"});onCommentChange("");}}
                  className={cn("p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-400/20 text-emerald-600 transition-colors",isActive&&approvalPanel?.decision==="Approved"&&"bg-emerald-100 dark:bg-emerald-400/20")} title="Approve">
                  <CheckCircle2 className="h-3.5 w-3.5"/>
                </button>
                <button onClick={()=>{onPanelChange({id:item.id,decision:"Rejected"});onCommentChange("");}}
                  className={cn("p-1 rounded hover:bg-red-100 dark:hover:bg-red-400/20 text-red-600 transition-colors",isActive&&approvalPanel?.decision==="Rejected"&&"bg-red-100 dark:bg-red-400/20")} title="Reject">
                  <XCircle className="h-3.5 w-3.5"/>
                </button>
              </div>
            ):<span className="text-[10px] text-muted-foreground">—</span>}
          </td>
        )}
      </tr>
      {isActive&&(
        <tr className={cn("border-b border-border/40",approvalPanel?.decision==="Approved"?"bg-emerald-50/60 dark:bg-emerald-400/10":"bg-red-50/60 dark:bg-red-400/10")}>
          <td colSpan={colSpanTotal} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={cn("text-[11px] font-semibold shrink-0",approvalPanel?.decision==="Approved"?"text-emerald-700 dark:text-emerald-400":"text-red-700 dark:text-red-400")}>
                {approvalPanel?.decision==="Approved"?"✓ Approving:":"✗ Rejecting:"}{" "}<span className="font-normal text-foreground">{item.kpiName}</span>
              </span>
              <input type="text" className="flex-1 h-7 rounded border border-border bg-background px-2 text-xs"
                placeholder="Add comments (optional)…" value={approvalComment} onChange={e=>onCommentChange(e.target.value)} autoFocus/>
              <button onClick={()=>onApprove(item.id,approvalPanel!.decision,approvalComment)} disabled={saving}
                className={cn("h-7 px-3 rounded text-[11px] font-semibold text-white shrink-0 transition-colors",
                  approvalPanel?.decision==="Approved"?"bg-emerald-600 hover:bg-emerald-700":"bg-red-600 hover:bg-red-700",saving&&"opacity-50 cursor-not-allowed")}>
                {saving?"Saving…":"Confirm"}
              </button>
              <button onClick={()=>{onPanelChange(null);onCommentChange("");}} className="h-7 px-2 rounded text-[11px] border border-border hover:bg-muted shrink-0">Cancel</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Category Row ─────────────────────────────────────────────────────────────

function CategoryRow({group,expanded,onToggle,canApprove,approvalPanel,approvalComment,saving,onPanelChange,onCommentChange,onApprove}:{
  group: CategoryGroup; expanded: boolean; onToggle:()=>void; canApprove: boolean;
  approvalPanel: ApprovalPanelState|null; approvalComment: string; saving: boolean;
  onPanelChange:(v:ApprovalPanelState|null)=>void;
  onCommentChange:(v:string)=>void;
  onApprove:(id:number,decision:"Approved"|"Rejected",comment:string)=>void;
}){
  const colCount=canApprove?18:17;
  return(
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/50 hover:bg-muted/70 transition-colors text-left">
        <span className="text-muted-foreground flex-shrink-0">{expanded?<ChevronDown className="h-3.5 w-3.5"/>:<ChevronRight className="h-3.5 w-3.5"/>}</span>
        <span className="font-semibold text-sm flex-1 min-w-0 truncate">{group.category}</span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 flex-wrap justify-end">
          <span><strong className="text-foreground">{group.totalCount}</strong> KPIs</span>
          <span className="font-medium text-foreground">{group.totalWeightage.toFixed(2)}% Wt.</span>
          {group.avgAchievement!==null&&(
            <span className={cn("font-semibold px-1.5 py-0.5 rounded text-[10px]",
              group.avgAchievement>=100?"bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-400"
              :group.avgAchievement>=75?"bg-yellow-100 text-yellow-700 dark:bg-yellow-400/20 dark:text-yellow-400"
              :"bg-red-100 text-red-700 dark:bg-red-400/20 dark:text-red-400")}>
              {group.avgAchievement.toFixed(1)}% Achv.
            </span>
          )}
          {group.approvedCount>0&&<span className="text-emerald-600 dark:text-emerald-400 text-[10px]">✓ {group.approvedCount}</span>}
          {group.rejectedCount>0&&<span className="text-red-600 dark:text-red-400 text-[10px]">✗ {group.rejectedCount}</span>}
          {group.pendingCount>0&&<span className="text-yellow-600 dark:text-yellow-400 text-[10px]">⏳ {group.pendingCount}</span>}
        </div>
      </button>
      {expanded&&(
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-t border-border bg-muted/20">
                {["#","KPI Name","Description","Metric","Unit","Wt%","Annual","Q1 T","Q2 T","Q3 T","Q4 T","Q1 A","Q2 A","Q3 A","Q4 A","Remarks","Status",...(canApprove?["Review"]:[])].map(h=>(
                  <th key={h} className={cn("px-2 py-1.5 text-[10px] font-semibold text-muted-foreground whitespace-nowrap",
                    ["Wt%","Annual","Q1 T","Q2 T","Q3 T","Q4 T","Q1 A","Q2 A","Q3 A","Q4 A"].includes(h)?"text-right":"text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.items.map((item,i)=>(
                <KpiItemRow key={item.id} item={item} idx={i} canApprove={canApprove}
                  approvalPanel={approvalPanel} approvalComment={approvalComment} saving={saving}
                  onPanelChange={onPanelChange} onCommentChange={onCommentChange} onApprove={onApprove}
                  colSpanTotal={colCount}/>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Category Grouped KPI Dialog (full-screen capable) ────────────────────────

function CategoryGroupedKpiDialog({open,set,person,year,isAdmin,userId,onClose,onRefresh}:{
  open: boolean; set: KpiSet; person: KpiPerson; year: KpiYear;
  isAdmin: boolean; userId?: number; onClose:()=>void; onRefresh:()=>void;
}){
  const{data:items,refetch}=useSetItems(open?set.id:undefined);
  const{toast}=useToast();
  const[isFullscreen,setIsFullscreen]=useState(false);
  const[expanded,setExpanded]=useState<Set<string>>(new Set());
  const[approvalPanel,setApprovalPanel]=useState<ApprovalPanelState|null>(null);
  const[approvalComment,setApprovalComment]=useState("");
  const[saving,setSaving]=useState(false);
  const displayItems=items||[];
  const groups=useMemo(()=>computeGroups(displayItems),[displayItems]);
  const allExpanded=groups.length>0&&groups.every(g=>expanded.has(g.category));
  const canApprove=isAdmin&&set.status==="Pending";
  const pendingCount=displayItems.filter(i=>!["Approved","Rejected"].includes(i.approvalStatus||"")).length;
  const approvedCount=displayItems.filter(i=>i.approvalStatus==="Approved").length;
  const rejectedCount=displayItems.filter(i=>i.approvalStatus==="Rejected").length;
  const toggleCategory=(cat:string)=>setExpanded(prev=>{const next=new Set(prev);next.has(cat)?next.delete(cat):next.add(cat);return next;});
  const approveItem=async(itemId:number,decision:"Approved"|"Rejected",comment:string)=>{
    setSaving(true);
    try{
      await apiFetch(`/kpi-set-items/${itemId}/review`,{method:"PATCH",body:JSON.stringify({decision,approvedBy:userId,approvalComments:comment})});
      toast({title:`KPI ${decision==="Approved"?"approved":"rejected"}`});
      refetch();onRefresh();
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    finally{setSaving(false);setApprovalPanel(null);setApprovalComment("");}
  };
  const batchReview=async(decision:"Approved"|"Rejected")=>{
    if(!confirm(`${decision==="Approved"?"Approve":"Reject"} all pending KPIs in this set?`)) return;
    setSaving(true);
    try{
      await apiFetch(`/kpi-sets/${set.id}/batch-review`,{method:"POST",body:JSON.stringify({decision,approvedBy:userId})});
      toast({title:`All KPIs ${decision==="Approved"?"approved":"rejected"}`});
      refetch();onRefresh();
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    finally{setSaving(false);}
  };
  const contentClass=isFullscreen
    ?"fixed inset-0 z-50 max-w-full w-full h-full rounded-none flex flex-col overflow-hidden bg-background"
    :"sm:max-w-[1200px] max-h-[92vh] flex flex-col overflow-hidden";
  return(
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={contentClass}>
        <DialogHeader className="shrink-0 pr-8">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight">
                {person.name}<span className="text-sm font-normal text-muted-foreground ml-2">— {person.designation}</span>
              </DialogTitle>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground">{year.label}</span>
                {person.department&&<span className="text-xs text-muted-foreground">· {person.department}</span>}
                <Badge variant="outline" className={cn("text-[10px] px-1.5",STATUS_COLORS[set.status]||"")}>{set.status}</Badge>
                {displayItems.length>0&&(
                  <span className="text-xs text-muted-foreground">
                    {displayItems.length} KPIs · {groups.length} categories
                    {pendingCount>0&&<span className="text-yellow-600 dark:text-yellow-400 ml-2">· {pendingCount} pending</span>}
                    {approvedCount>0&&<span className="text-emerald-600 dark:text-emerald-400 ml-1">· {approvedCount} approved</span>}
                    {rejectedCount>0&&<span className="text-red-600 dark:text-red-400 ml-1">· {rejectedCount} rejected</span>}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
              {displayItems.length>0&&(
                <>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={()=>allExpanded?setExpanded(new Set()):setExpanded(new Set(groups.map(g=>g.category)))}>
                    {allExpanded?"Collapse All":"Expand All"}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={()=>downloadSetExcel(displayItems,person,year)}><Download className="mr-1 h-3 w-3"/>Download</Button>
                </>
              )}
              {canApprove&&pendingCount>0&&(
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-500/50 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-400/10" onClick={()=>batchReview("Approved")} disabled={saving}><CheckCircle2 className="mr-1 h-3 w-3"/>Approve All</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-400/10" onClick={()=>batchReview("Rejected")} disabled={saving}><XCircle className="mr-1 h-3 w-3"/>Reject All</Button>
                </>
              )}
              <button onClick={()=>setIsFullscreen(!isFullscreen)} className="h-7 w-7 flex items-center justify-center rounded border border-border hover:bg-muted transition-colors" title={isFullscreen?"Exit fullscreen":"Fullscreen"}>
                {isFullscreen?<Minimize2 className="h-3.5 w-3.5"/>:<Maximize2 className="h-3.5 w-3.5"/>}
              </button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0">
          {!items?(<div className="space-y-2 p-1">{[1,2,3].map(i=><Skeleton key={i} className="h-12 w-full"/>)}</div>)
          :displayItems.length===0?(
            <div className="flex items-center justify-center h-40 text-center">
              <div><FolderOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3"/><p className="text-sm text-muted-foreground">No KPIs uploaded yet.</p><p className="text-xs text-muted-foreground mt-1">Use the Upload button on the KPI Sets list to add KPIs via Excel.</p></div>
            </div>
          ):(
            <div className="space-y-2 p-1">
              {set.approvalComments&&(
                <div className="flex items-start gap-2 p-3 border border-border rounded-lg bg-muted/20 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5"/><span><strong>Reviewer comment:</strong> {set.approvalComments}</span>
                </div>
              )}
              {groups.map(group=>(
                <CategoryRow key={group.category} group={group} expanded={expanded.has(group.category)}
                  onToggle={()=>toggleCategory(group.category)} canApprove={canApprove}
                  approvalPanel={approvalPanel} approvalComment={approvalComment} saving={saving}
                  onPanelChange={setApprovalPanel} onCommentChange={setApprovalComment} onApprove={approveItem}/>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Persons Tab ──────────────────────────────────────────────────────────────

function PersonsTab({persons,onEdit,onAdd,isAdmin,onRefresh}:{
  persons: KpiPerson[]; onEdit:(p:KpiPerson)=>void; onAdd:()=>void; isAdmin: boolean; onRefresh:()=>void;
}){
  const{toast}=useToast();
  const approver=(id?: number)=>persons.find(p=>p.id===id);
  const handleDelete=async(p:KpiPerson)=>{
    if(!confirm(`Deactivate ${p.name}?`)) return;
    try{await apiFetch(`/kpi-persons/${p.id}`,{method:"DELETE"});toast({title:"Person deactivated"});onRefresh();}
    catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
  };
  return(
    <div className="space-y-3">
      {isAdmin&&<div className="flex justify-end"><Button size="sm" onClick={onAdd}><Plus className="mr-1.5 h-3.5 w-3.5"/>Add Person / CXO</Button></div>}
      {persons.length===0?(
        <div className="flex items-center justify-center h-40 text-center"><div><Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3"/><p className="text-sm text-muted-foreground">No persons configured yet.</p></div></div>
      ):(
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/30">
              {["Name","Designation","Department","Employee Code","Email","Approving Authority",...(isAdmin?["Actions"]:[])].map(h=><th key={h} className="text-left px-4 py-2.5 font-medium text-xs">{h}</th>)}
            </tr></thead>
            <tbody>
              {persons.map(p=>(
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium text-sm">{p.name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.designation}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.department||"—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{p.employeeCode||"—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.email||"—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{approver(p.approvingAuthorityId)?.name||"—"}</td>
                  {isAdmin&&<td className="px-4 py-2.5"><div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>onEdit(p)}><Pencil className="h-3.5 w-3.5"/></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={()=>handleDelete(p)}><Trash2 className="h-3.5 w-3.5"/></Button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Performance Capture Dialog ───────────────────────────────────────────────

function PerformanceCaptureDialog({open,set,person,year,onClose,onRefresh}:{
  open: boolean; set: KpiSet; person: KpiPerson; year: KpiYear; onClose:()=>void; onRefresh:()=>void;
}){
  const{toast}=useToast();
  const{data:items}=useSetItems(open?set.id:undefined);
  const[actuals,setActuals]=useState<Record<number,{q1:string;q2:string;q3:string;q4:string;remarks:string}>>({});
  const[saving,setSaving]=useState(false);
  const[isFullscreen,setIsFullscreen]=useState(false);

  useEffect(()=>{
    if(items){
      const init:Record<number,{q1:string;q2:string;q3:string;q4:string;remarks:string}>={}
      for(const item of items){
        init[item.id]={q1:item.q1Actual||"",q2:item.q2Actual||"",q3:item.q3Actual||"",q4:item.q4Actual||"",remarks:item.remarks||""};
      }
      setActuals(init);
    }
  },[items]);

  const setField=(itemId:number,field:keyof typeof actuals[number],val:string)=>{
    setActuals(prev=>({...prev,[itemId]:{...prev[itemId],[field]:val}}));
  };

  const achievement=(item:KpiSetItem)=>{
    const a=actuals[item.id];
    const target=parseFloat(item.annualTarget||"0");
    const q4=parseFloat(a?.q4||"0");
    if(!target||!a) return null;
    const latest=parseFloat(a.q4)||parseFloat(a.q3)||parseFloat(a.q2)||parseFloat(a.q1)||0;
    return target>0?((latest/target)*100).toFixed(1):null;
  };

  const handleSave=async()=>{
    setSaving(true);
    try{
      const payload={actuals:Object.entries(actuals).map(([id,v])=>({
        itemId:parseInt(id),
        q1Actual:v.q1||null,q2Actual:v.q2||null,q3Actual:v.q3||null,q4Actual:v.q4||null,remarks:v.remarks||null,
      }))};
      await apiFetch(`/kpi-sets/${set.id}/actuals`,{method:"PUT",body:JSON.stringify(payload)});
      toast({title:"Performance actuals saved",description:`${Object.keys(actuals).length} KPIs updated`});
      onRefresh();onClose();
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    finally{setSaving(false);}
  };

  const displayItems=items||[];
  const contentClass=isFullscreen
    ?"fixed inset-0 z-50 max-w-full w-full h-full rounded-none flex flex-col overflow-hidden bg-background"
    :"sm:max-w-[1300px] max-h-[92vh] flex flex-col overflow-hidden";

  return(
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={contentClass}>
        <DialogHeader className="shrink-0 pr-8">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold">
                Enter Performance Actuals — {person.name}
              </DialogTitle>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                <span>{year.label}</span>
                {person.designation&&<span>· {person.designation}</span>}
                {person.department&&<span>· {person.department}</span>}
                <Badge variant="outline" className={cn("text-[10px] px-1.5",STATUS_COLORS[set.status]||"")}>{set.status}</Badge>
                <span>{displayItems.length} KPIs</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving||displayItems.length===0}>
                {saving?"Saving…":"Save Actuals"}
              </Button>
              <button onClick={()=>setIsFullscreen(f=>!f)} className="h-7 w-7 flex items-center justify-center rounded border border-border hover:bg-muted transition-colors">
                {isFullscreen?<Minimize2 className="h-3.5 w-3.5"/>:<Maximize2 className="h-3.5 w-3.5"/>}
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {!items?(<div className="space-y-2 p-4">{[1,2,3].map(i=><Skeleton key={i} className="h-10 w-full"/>)}</div>)
          :displayItems.length===0?(
            <div className="flex items-center justify-center h-40 text-center">
              <div><FolderOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3"/><p className="text-sm text-muted-foreground">No KPI items found. Upload the KPI sheet first.</p></div>
            </div>
          ):(
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b border-border bg-muted/40">
                    {["#","KPI Name","Category","Metric","Unit","Annual T","Q1 T","Q2 T","Q3 T","Q4 T","Q1 Actual","Q2 Actual","Q3 Actual","Q4 Actual","Achv %","Remarks"].map(h=>(
                      <th key={h} className={cn("px-2 py-2 font-semibold whitespace-nowrap",["Annual T","Q1 T","Q2 T","Q3 T","Q4 T","Q1 Actual","Q2 Actual","Q3 Actual","Q4 Actual","Achv %"].includes(h)?"text-right":"text-left")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item,i)=>{
                    const a=actuals[item.id]||{q1:"",q2:"",q3:"",q4:"",remarks:""};
                    const achv=achievement(item);
                    const achvColor=achv===null?"":parseFloat(achv)>=100?"text-emerald-600 dark:text-emerald-400 font-bold":parseFloat(achv)>=75?"text-yellow-600 dark:text-yellow-400":"text-red-600 dark:text-red-400";
                    return(
                      <tr key={item.id} className={cn("border-b border-border/50 hover:bg-muted/10",i%2===0?"":"bg-muted/5")}>
                        <td className="px-2 py-1.5 text-muted-foreground">{item.sno??i+1}</td>
                        <td className="px-2 py-1.5 font-medium max-w-[200px]"><span title={item.kpiName} className="line-clamp-2">{item.kpiName}</span></td>
                        <td className="px-2 py-1.5 text-muted-foreground">{item.category||"—"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{item.metric||"—"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{item.unit||"—"}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{item.annualTarget||"—"}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{item.q1Target||"—"}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{item.q2Target||"—"}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{item.q3Target||"—"}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{item.q4Target||"—"}</td>
                        {(["q1","q2","q3","q4"] as const).map(q=>(
                          <td key={q} className="px-1 py-1">
                            <input type="number" value={a[q]} onChange={e=>setField(item.id,q,e.target.value)}
                              className="w-20 h-7 text-right text-xs border border-border rounded px-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"/>
                          </td>
                        ))}
                        <td className={cn("px-2 py-1.5 text-right font-semibold",achvColor)}>{achv!==null?`${achv}%`:"—"}</td>
                        <td className="px-1 py-1">
                          <input type="text" value={a.remarks} onChange={e=>setField(item.id,"remarks",e.target.value)}
                            className="w-28 h-7 text-xs border border-border rounded px-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"/>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-border px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Enter quarterly actuals for each KPI. Achievement % is calculated automatically against annual target.</span>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving||displayItems.length===0}>
            {saving?"Saving…":"Save Actuals"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Sets Tab ─────────────────────────────────────────────────────────────

function KpiSetsTab({sets,archivedSets,persons,years,statusFilter,onStatusFilter,isAdmin,userId,onView,onUpload,onHistory,onEdit,onSubmit,onDelete,onPerformance,onRefresh}:{
  sets: KpiSet[]; archivedSets: KpiSet[]; persons: KpiPerson[]; years: KpiYear[];
  statusFilter: string; onStatusFilter:(s:string)=>void;
  isAdmin: boolean; userId?: number;
  onView:(s:KpiSet)=>void; onUpload:(s:KpiSet)=>void; onHistory:(s:KpiSet)=>void;
  onEdit:(s:KpiSet)=>void; onSubmit:(s:KpiSet)=>void; onDelete:(s:KpiSet)=>void;
  onPerformance:(s:KpiSet)=>void; onRefresh:()=>void;
}){
  const{toast}=useToast();
  const[showArchived,setShowArchived]=useState(false);
  const getPerson=(s:KpiSet)=>persons.find(p=>p.id===s.personId);
  const getYear=(id:number)=>years.find(y=>y.id===id);
  const handleRecall=async(set:KpiSet)=>{
    if(!confirm("Recall this submission and revert to Draft?")) return;
    try{await apiFetch(`/kpi-sets/${set.id}/recall`,{method:"POST"});toast({title:"Submission recalled"});onRefresh();}
    catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
  };
  const handleUnarchive=async(set:KpiSet)=>{
    if(!confirm("Restore this KPI set to Draft status?")) return;
    try{await apiFetch(`/kpi-sets/${set.id}`,{method:"PATCH",body:JSON.stringify({status:"Draft"})});toast({title:"KPI set restored"});onRefresh();}
    catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
  };
  const statusOpts=["all","Draft","Pending","Approved","Rejected"];
  const renderRows=(rows:KpiSet[],archived=false)=>(
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            {["Person / Employee","Designation","Department","Year","Version","KPIs","Status","Submitted","Actions"].map(h=>(
              <th key={h} className={cn("px-4 py-2.5 font-medium text-xs",["Version","KPIs","Status"].includes(h)?"text-center":h==="Actions"?"text-right":"text-left")}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map(set=>{
              const person=getPerson(set); const year=getYear(set.yearId);
              return(
                <tr key={set.id} className={cn("border-b border-border/50 hover:bg-muted/20 transition-colors",archived&&"opacity-70")}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-sm">{person?.name||"Unknown"}</div>
                    {person?.email&&<div className="text-[10px] text-muted-foreground">{person.email}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{person?.designation||"—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{person?.department||"—"}</td>
                  <td className="px-4 py-2.5 text-xs">{year?.label||"—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    {set.versionNumber?<span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-400/20 text-blue-700 dark:text-blue-400 font-semibold">v{set.versionNumber}</span>:<span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center text-sm font-semibold">{set.itemCount??""}</td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge variant="outline" className={cn("text-[10px]",archived?"border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10":STATUS_COLORS[set.status]||"")}>
                      {archived?"Archived":set.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-[10px] text-muted-foreground">
                    {set.submittedAt?new Date(set.submittedAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"2-digit"}):"—"}
                  </td>
                  <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>onView(set)} title="View KPIs"><Eye className="h-3.5 w-3.5"/></Button>
                    {!archived&&set.status==="Approved"&&(
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700" onClick={()=>onPerformance(set)} title="Enter performance actuals"><Target className="h-3.5 w-3.5"/></Button>
                    )}
                    {isAdmin&&!archived&&(
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>onUpload(set)} title="Upload KPIs" disabled={set.status==="Approved"}><Upload className="h-3.5 w-3.5"/></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>onHistory(set)} title="Version history"><History className="h-3.5 w-3.5"/></Button>
                        {set.status==="Draft"&&(
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>onEdit(set)} title="Edit"><Pencil className="h-3.5 w-3.5"/></Button>
                            {set.currentVersionId&&<Button variant="ghost" size="icon" className="h-7 w-7 text-yellow-600" onClick={()=>onSubmit(set)} title="Submit for review"><Send className="h-3.5 w-3.5"/></Button>}
                          </>
                        )}
                        {set.status==="Pending"&&<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={()=>handleRecall(set)} title="Recall submission"><RotateCcw className="h-3.5 w-3.5"/></Button>}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={()=>onDelete(set)} title="Archive"><Trash2 className="h-3.5 w-3.5"/></Button>
                      </>
                    )}
                    {isAdmin&&archived&&(
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" onClick={()=>handleUnarchive(set)} title="Restore to Draft"><RotateCcw className="h-3.5 w-3.5"/></Button>
                    )}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
  return(
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {!showArchived&&statusOpts.map(s=>{
          const cnt=s==="all"?sets.length:sets.filter(x=>x.status===s).length;
          return(<button key={s} onClick={()=>onStatusFilter(s)}
            className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-colors",statusFilter===s?"bg-primary text-primary-foreground border-primary":"border-border text-muted-foreground hover:text-foreground")}>
            {s==="all"?"All":s} ({cnt})</button>);
        })}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>setShowArchived(v=>!v)}
            className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors",showArchived?"bg-gray-500/10 border-gray-400/50 text-gray-600 dark:text-gray-400":"border-border text-muted-foreground hover:text-foreground")}>
            <Archive className="h-3 w-3"/>{showArchived?`Archived (${archivedSets.length})`:`Show Archived (${archivedSets.length})`}
          </button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefresh} title="Refresh"><RefreshCw className="h-3.5 w-3.5"/></Button>
        </div>
      </div>
      {!showArchived&&(
        sets.length===0?(
          <div className="flex items-center justify-center h-48 text-center"><div>
            <FolderOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3"/>
            <p className="text-sm text-muted-foreground">No KPI sets found.</p>
            {isAdmin&&<p className="text-xs text-muted-foreground mt-1">Click "New KPI Set" to create one.</p>}
          </div></div>
        ):renderRows(sets)
      )}
      {showArchived&&(
        archivedSets.length===0?(
          <div className="flex items-center justify-center h-48 text-center"><div>
            <Archive className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3"/>
            <p className="text-sm text-muted-foreground">No archived KPI sets.</p>
          </div></div>
        ):(
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1"><Archive className="h-3.5 w-3.5 text-muted-foreground"/><span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Archived Sets ({archivedSets.length})</span></div>
            {renderRows(archivedSets,true)}
          </div>
        )
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KpisPage(){
  const{isAdmin,user}=useAuth();
  const{toast}=useToast();
  const qc=useQueryClient();

  const[activeTab,setActiveTab]=useState<"sets"|"persons">("sets");
  const[yearFilter,setYearFilter]=useState<number|undefined>();
  const[statusFilter,setStatusFilter]=useState("all");
  const[detailSet,setDetailSet]=useState<KpiSet|null>(null);
  const[uploadSet,setUploadSet]=useState<KpiSet|null>(null);
  const[historySet,setHistorySet]=useState<KpiSet|null>(null);
  const[editSet,setEditSet]=useState<KpiSet|"new"|null>(null);
  const[editPerson,setEditPerson]=useState<KpiPerson|"new"|null>(null);
  const[performanceSet,setPerformanceSet]=useState<KpiSet|null>(null);

  const{data:years}=useKpiYears();
  const{data:persons}=usePersons();
  const{data:sets}=useKpiSets(yearFilter);
  const{data:archivedSets=[]}=useArchivedSets(yearFilter);

  useEffect(()=>{
    if(years&&!yearFilter){const cur=years.find(y=>y.isCurrent)||years[0];if(cur) setYearFilter(cur.id);}
  },[years]);

  const stats=useMemo(()=>{
    const all=sets||[];
    return{total:all.length,draft:all.filter(s=>s.status==="Draft").length,pending:all.filter(s=>s.status==="Pending").length,approved:all.filter(s=>s.status==="Approved").length,rejected:all.filter(s=>s.status==="Rejected").length};
  },[sets]);

  const filteredSets=useMemo(()=>{const all=sets||[];return statusFilter==="all"?all:all.filter(s=>s.status===statusFilter);},[sets,statusFilter]);
  const getPerson=(set:KpiSet)=>persons?.find(p=>p.id===set.personId);
  const getYear=(id:number)=>years?.find(y=>y.id===id);
  const currentYear=years?.find(y=>y.id===yearFilter);

  const refresh=useCallback(()=>{
    qc.invalidateQueries({queryKey:["kpi-sets"]});
    qc.invalidateQueries({queryKey:["kpi-sets-archived"]});
    qc.invalidateQueries({queryKey:["kpi-set-items"]});
  },[qc]);

  const handleSubmit=async(set:KpiSet)=>{
    const person=getPerson(set);
    if(!confirm(`Submit KPI set for ${person?.name} (${currentYear?.label}) for review? All KPIs will be set to pending individual approval.`)) return;
    try{
      await apiFetch(`/kpi-sets/${set.id}/submit`,{method:"POST"});
      toast({title:"Submitted for review",description:"All KPIs are now pending individual approval."});
      refresh();
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
  };

  const handleDelete=async(set:KpiSet)=>{
    if(!confirm("Archive this KPI set?")) return;
    try{await apiFetch(`/kpi-sets/${set.id}`,{method:"DELETE"});toast({title:"KPI set archived"});refresh();}
    catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
  };

  return(
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Target className="h-6 w-6 text-primary"/>
          <div>
            <h1 className="text-xl font-bold">Performance &amp; KPI Management</h1>
            <p className="text-xs text-muted-foreground">Enterprise-wide performance tracking — CXOs, HR &amp; all employees</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {years&&(
            <Select value={yearFilter?.toString()} onValueChange={v=>setYearFilter(parseInt(v))}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Select year"/></SelectTrigger>
              <SelectContent>{years.map(y=><SelectItem key={y.id} value={y.id.toString()}>{y.label}{y.isCurrent?" ★":""}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {isAdmin&&activeTab==="sets"&&(
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={()=>downloadTemplate(currentYear?.label)}><Download className="mr-1.5 h-3.5 w-3.5"/>Template</Button>
              <Button size="sm" className="h-8 text-xs" onClick={()=>setEditSet("new")}><Plus className="mr-1.5 h-3.5 w-3.5"/>New KPI Set</Button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      {activeTab==="sets"&&(
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[{label:"Total Sets",value:stats.total,color:"text-foreground"},{label:"Draft",value:stats.draft,color:"text-gray-500"},{label:"Pending Review",value:stats.pending,color:"text-yellow-600"},{label:"Approved",value:stats.approved,color:"text-emerald-600"},{label:"Rejected",value:stats.rejected,color:"text-red-600"}].map(s=>(
            <Card key={s.label} className="border-border"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-0.5",s.color)}>{s.value}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {([["sets",ClipboardList,"KPI Sets"],["persons",Users,"Persons / CXOs"]] as [string,React.ElementType,string][]).map(([t,Icon,label])=>(
          <button key={t} onClick={()=>setActiveTab(t as any)}
            className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",activeTab===t?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4"/>{label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab==="sets"&&(
        <KpiSetsTab sets={filteredSets} archivedSets={archivedSets} persons={persons||[]} years={years||[]}
          statusFilter={statusFilter} onStatusFilter={setStatusFilter}
          isAdmin={isAdmin} userId={user?.id}
          onView={setDetailSet} onUpload={setUploadSet} onHistory={setHistorySet}
          onEdit={setEditSet} onSubmit={handleSubmit} onDelete={handleDelete}
          onPerformance={setPerformanceSet} onRefresh={refresh}/>
      )}

      {activeTab==="persons"&&(
        <PersonsTab persons={persons||[]} onEdit={p=>setEditPerson(p)} onAdd={()=>setEditPerson("new")}
          isAdmin={isAdmin} onRefresh={()=>qc.invalidateQueries({queryKey:["kpi-persons"]})}/>
      )}

      {/* Dialogs */}
      {detailSet&&(()=>{const person=getPerson(detailSet);const year=getYear(detailSet.yearId);if(!person||!year) return null;
        return(<CategoryGroupedKpiDialog open={!!detailSet} set={detailSet} person={person} year={year} isAdmin={isAdmin} userId={user?.id} onClose={()=>setDetailSet(null)} onRefresh={refresh}/>);
      })()}
      {uploadSet&&(()=>{const person=getPerson(uploadSet);const year=getYear(uploadSet.yearId);if(!person||!year) return null;
        return(<UploadDialog open={!!uploadSet} set={uploadSet} person={person} year={year} userId={user?.id} onClose={()=>setUploadSet(null)} onSuccess={()=>{setUploadSet(null);refresh();}}/>);
      })()}
      {historySet&&(()=>{const person=getPerson(historySet);const year=getYear(historySet.yearId);if(!person||!year) return null;
        return(<HistoryDialog open={!!historySet} set={historySet} person={person} year={year} onClose={()=>setHistorySet(null)}/>);
      })()}
      {editSet!==null&&(
        <KpiSetDialog open={editSet!==null} initialSet={editSet==="new"?null:editSet} persons={persons||[]} years={years||[]}
          onClose={()=>setEditSet(null)} onSuccess={()=>{setEditSet(null);refresh();}}/>
      )}
      {editPerson!==null&&(
        <PersonDialog open={editPerson!==null} initialPerson={editPerson==="new"?null:editPerson} persons={persons||[]}
          onClose={()=>setEditPerson(null)} onSuccess={()=>{setEditPerson(null);qc.invalidateQueries({queryKey:["kpi-persons"]});}}/>
      )}
      {performanceSet&&(()=>{const person=getPerson(performanceSet);const year=getYear(performanceSet.yearId);if(!person||!year) return null;
        return(<PerformanceCaptureDialog open={!!performanceSet} set={performanceSet} person={person} year={year} onClose={()=>setPerformanceSet(null)} onRefresh={refresh}/>);
      })()}
    </div>
  );
}
