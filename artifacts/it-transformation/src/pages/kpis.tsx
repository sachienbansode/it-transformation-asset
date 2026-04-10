import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch, ApiError } from "@/lib/api";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Plus, Upload, Download, History, Eye, Send, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Maximize2, Minimize2, FileSpreadsheet, ClipboardList,
  Pencil, Trash2, RefreshCw, AlertTriangle, Target, Archive,
  FolderOpen, RotateCcw, Info, Search, UserCheck,
} from "lucide-react";
// ─── Types ───────────────────────────────────────────────────────────────────

interface KpiYear { id: number; label: string; startDate: string; endDate: string; isActive: boolean; isCurrent: boolean; }
interface KpiPerson { id: number; name: string; designation: string; department?: string; email?: string; employeeCode?: string; approvingAuthorityId?: number; isActive: boolean; }
interface KpiUser { id: number; name: string; email: string; role: string; department?: string; designation?: string; employeeCode?: string; }
interface KpiSet {
  id: number; personId: number; yearId: number; status: string;
  currentVersionId?: number; notes?: string; submittedAt?: string;
  approvedAt?: string; approvedBy?: number; approvalComments?: string;
  actualsStatus?: string; actualsSubmittedAt?: string; actualsReviewedAt?: string; actualsReviewedBy?: number; actualsReviewComments?: string;
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
  kpiId?: string; kpiType?: string; owner?: string; businessAlignment?: string; dataSource?: string; riskDependency?: string;
  approvalStatus?: string; approvedBy?: number; approvalComments?: string; approvedAt?: string;
  createdAt?: string; updatedAt?: string;
}
interface ParsedItem {
  sno: number; kpiName: string; description: string; category: string;
  weightage: string; metric: string; unit: string; annualTarget: string;
  q1Target: string; q2Target: string; q3Target: string; q4Target: string;
  q1Actual: string; q2Actual: string; q3Actual: string; q4Actual: string; remarks: string;
  kpiId: string; kpiType: string; owner: string; businessAlignment: string; dataSource: string; riskDependency: string;
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
  "Approved - Partial": "border-teal-500/30 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-400/10",
  Rejected: "border-red-500/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10",
  "Rejected - All": "border-red-600/50 text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-400/15 font-semibold",
  Archived: "border-gray-400/30 text-gray-400 bg-gray-50 dark:bg-gray-400/10",
};
const TEMPLATE_HEADERS = ["S.No","KPI ID","KPI Type","KPI Name","Description","Category (Run/Change/Transform)","Business Alignment","Owner","Weightage (%)","Scoring Logic","Measurement Unit","Annual Target","Q1 Target","Q2 Target","Q3 Target","Q4 Target","Q1 Actual","Q2 Actual","Q3 Actual","Q4 Actual","Data Source","Risk/Dependency","Remarks"];

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
  // Exact norm-match lookup across multiple key aliases
  const getStr = (row: Record<string,unknown>,...keys: string[]): string => {
    for (const k of keys) {
      const nk = norm(k);
      for (const [rk,rv] of Object.entries(row)) {
        if (norm(rk)===nk) {
          const val=rv!==null&&rv!==undefined?String(rv).trim():"";
          if(val!=="") return val;
        }
      }
    }
    return "";
  };
  return raw.map((r,i)=>{
    const snoRaw=getStr(r,"S.No","SNo","No.","S No","Sl No","Sl.No","SR No","SR");
    const sno=snoRaw?parseInt(snoRaw):i+1;
    return {
      sno: isNaN(sno)?i+1:sno,
      kpiName: getStr(r,"KPI Name","KPIName","kpi_name","KPI Title","KPI"),
      description: getStr(r,"Description","Desc","Details","KPI Description"),
      // "Category (Run/Change/Transform)" → norm → "categoryrunchangetransform"
      category: getStr(r,"Category","Cat","KPI Category","Category Name","Group","Category (Run/Change/Transform)","Category(Run/Change/Transform)"),
      weightage: getStr(r,"Weightage (%)","Weightage","Weight","Wt%","Wt","Weightage%"),
      // "Scoring Logic" maps to Metric in CTO template
      metric: getStr(r,"Metric","Metrics","Measurement","KPI Metric","Scoring Logic","Score Logic"),
      // "Measurement Unit" → norm → "measurementunit"
      unit: getStr(r,"Unit","Units","Measure Unit","UOM","Measurement Unit","MeasurementUnit"),
      annualTarget: getStr(r,"Annual Target","AnnualTarget","Annual","Full Year Target"),
      q1Target: getStr(r,"Q1 Target","Q1Target","Q1 T"),
      q2Target: getStr(r,"Q2 Target","Q2Target","Q2 T"),
      q3Target: getStr(r,"Q3 Target","Q3Target","Q3 T"),
      q4Target: getStr(r,"Q4 Target","Q4Target","Q4 T"),
      q1Actual: getStr(r,"Q1 Actual","Q1Actual","Q1A","Q1 A","Q1Actuals","Q1 Achievement"),
      q2Actual: getStr(r,"Q2 Actual","Q2Actual","Q2A","Q2 A","Q2 Achievement"),
      q3Actual: getStr(r,"Q3 Actual","Q3Actual","Q3A","Q3 A","Q3 Achievement"),
      q4Actual: getStr(r,"Q4 Actual","Q4Actual","Q4A","Q4 A","Q4 Achievement"),
      remarks: getStr(r,"Remarks","Notes","Comments","Remark"),
      kpiId: getStr(r,"KPI ID","KPIID","KPI_ID","KPI Ref","Ref ID"),
      kpiType: getStr(r,"KPI Type","KPIType","KPI_Type","Type"),
      owner: getStr(r,"Owner","KPI Owner","Responsible","Accountable","Ownership"),
      businessAlignment: getStr(r,"Business Alignment","BusinessAlignment","Alignment","Strategic Alignment","Business Goal","Business Objective"),
      dataSource: getStr(r,"Data Source","DataSource","Source","Measurement Source","Data/Source"),
      riskDependency: getStr(r,"Risk/Dependency","RiskDependency","Risk Dependency","Risks","Dependencies","Risk & Dependency"),
    };
  }).filter(r=>r.kpiName!=="");
};

const downloadTemplate = (yearLabel?: string) => {
  const wb=XLSX.utils.book_new();
  const sampleRows=[
    // S.No, KPI ID, KPI Type, KPI Name, Description, Category (Run/Change/Transform), Business Alignment, Owner, Weightage (%), Scoring Logic, Measurement Unit, Annual Target, Q1 Target, Q2 Target, Q3 Target, Q4 Target, Q1 Actual, Q2 Actual, Q3 Actual, Q4 Actual, Data Source, Risk/Dependency, Remarks
    [1,"KPI-001","Outcome","IT Infrastructure Uptime","Measure % uptime across critical systems","Run","Operational Excellence","IT Operations","10.00","% Uptime — Higher is better","%","99.50","99.00","99.50","99.50","99.00","","","","","Monthly dashboards","Dependency on ITSM tool",""],
    [2,"KPI-002","Outcome","Revenue Growth","Annual revenue growth vs previous year","Change","Financial Growth","Finance","15.00","% Growth — Higher is better","%","15.00","12.00","13.50","14.00","15.00","","","","","Finance ERP","None",""],
    [3,"KPI-003","Output","Customer Satisfaction","NPS or CSAT from surveys","Run","Customer Centricity","CX Team","10.00","NPS Score — Higher is better","Score","75.00","70.00","72.00","74.00","75.00","","","","","Quarterly survey","Survey vendor dependency","Quarterly survey"],
    [4,"KPI-004","Strategic","Digital Transformation Index","Progress on digital initiatives","Transform","Innovation","Digital Office","12.00","% Completion — Higher is better","%","80.00","","","","80.00","","","","","Program tracker","None","Annual review"],
    [5,"KPI-005","Output","Cost Reduction","Cost savings through optimization","Change","Financial Efficiency","Procurement","12.00","₹ Lakhs saved","₹ Lakhs","50.00","10.00","20.00","35.00","50.00","","","","","Finance ERP","Market volatility",""],
  ];
  const ws=XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS,...sampleRows]);
  ws["!cols"]=[6,10,12,32,30,18,22,18,10,26,14,12,10,10,10,10,10,10,10,10,22,22,22].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,"KPI Template");
  const infoData=[
    ["Column","Required","Description","Example"],
    ["S.No","No","Auto-filled if blank","1, 2, 3..."],
    ["KPI ID","No","Unique reference ID for this KPI","KPI-001"],
    ["KPI Type","No","Type: Outcome / Output / Strategic / Leading / Lagging","Outcome"],
    ["KPI Name","YES","Unique name for this KPI","IT Infrastructure Uptime"],
    ["Description","No","What is measured","Measure % uptime across critical systems"],
    ["Category (Run/Change/Transform)","No","Run = ongoing ops, Change = improvement, Transform = strategic shift","Run"],
    ["Business Alignment","No","Strategic objective this KPI supports","Operational Excellence"],
    ["Owner","No","Team or person responsible for this KPI","IT Operations"],
    ["Weightage (%)","No","Importance weight — total should ideally be 100","10.00"],
    ["Scoring Logic","No","How achievement is calculated / measured","% Uptime — Higher is better"],
    ["Measurement Unit","No","Unit: %, Days, ₹ Lakhs, Score, Count, etc.","%, ₹ Lakhs, Score"],
    ["Annual Target","No","Target for full financial year","99.50"],
    ["Q1-Q4 Target","No","Quarterly targets (leave blank if not split by quarter)","99.00"],
    ["Q1-Q4 Actual","No","Actual achievement per quarter (fill post quarter)",""],
    ["Data Source","No","System or report used to measure this KPI","ITSM Dashboard"],
    ["Risk/Dependency","No","Known risks or external dependencies","Vendor tool availability"],
    ["Remarks","No","Notes, context, or observations","Track via monthly reviews"],
  ];
  const wsInfo=XLSX.utils.aoa_to_sheet(infoData);
  wsInfo["!cols"]=[{wch:18},{wch:10},{wch:52},{wch:30}];
  XLSX.utils.book_append_sheet(wb,wsInfo,"Instructions");
  XLSX.writeFile(wb,`KPI_Template${yearLabel?`_${yearLabel.replace(/\s+/g,"_")}`:""}.xlsx`);
};

const fmtTs=(ts?: string|null)=>ts?new Date(ts).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}):"";
const downloadSetExcel=(items: KpiSetItem[],person: KpiPerson,year: KpiYear)=>{
  const wb=XLSX.utils.book_new();
  const headers=[...TEMPLATE_HEADERS,"Approval Status","Approval Comments","KPI Created On","KPI Reviewed On"];
  const rows=items.map((item,i)=>[
    item.sno??i+1,
    item.kpiId||"",item.kpiType||"",
    item.kpiName,item.description||"",item.category||"",
    item.businessAlignment||"",item.owner||"",
    fmt2(item.weightage,""),item.metric||"",item.unit||"",
    fmt2(item.annualTarget,""),fmt2(item.q1Target,""),fmt2(item.q2Target,""),fmt2(item.q3Target,""),fmt2(item.q4Target,""),
    fmt2(item.q1Actual,""),fmt2(item.q2Actual,""),fmt2(item.q3Actual,""),fmt2(item.q4Actual,""),
    item.dataSource||"",item.riskDependency||"",item.remarks||"",
    item.approvalStatus||"Draft",item.approvalComments||"",
    fmtTs(item.createdAt),fmtTs(item.approvedAt),
  ]);
  const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);
  ws["!cols"]=[6,10,12,32,30,18,22,18,10,26,14,12,10,10,10,10,10,10,10,10,22,22,22,14,36,20,20].map(w=>({wch:w}));
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
  }).sort((a,b)=>a.category.localeCompare(b.category));
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

const useKpiYears=()=>useQuery({queryKey:["kpi-years"],queryFn:()=>apiFetch<KpiYear[]>("/kpi-years")});
const usePersons=()=>useQuery({queryKey:["kpi-persons"],queryFn:()=>apiFetch<KpiPerson[]>("/kpi-persons")});
const useKpiUsers=()=>useQuery({queryKey:["kpi-users"],queryFn:()=>apiFetch<KpiUser[]>("/kpi-users")});
const useDeptMasters=()=>useQuery({queryKey:["masters-department"],queryFn:()=>apiFetch<{key:string;label:string}[]>("/masters?category=department")});
const useKpiSets=(yearId?: number)=>useQuery({queryKey:["kpi-sets",yearId],enabled:!!yearId,queryFn:()=>apiFetch<KpiSet[]>(`/kpi-sets?yearId=${yearId}`)});
const useArchivedSets=(yearId?: number)=>useQuery({queryKey:["kpi-sets-archived",yearId],enabled:!!yearId,queryFn:()=>apiFetch<KpiSet[]>(`/kpi-sets?yearId=${yearId}&archived=true`)});
const useVersions=(setId?: number)=>useQuery({queryKey:["kpi-set-versions",setId],enabled:!!setId,queryFn:()=>apiFetch<KpiSetVersion[]>(`/kpi-sets/${setId}/versions`)});
const useSetItems=(setId?: number)=>useQuery({queryKey:["kpi-set-items",setId],enabled:!!setId,queryFn:()=>apiFetch<KpiSetItem[]>(`/kpi-set-items?setId=${setId}`),refetchOnWindowFocus:false});

// ─── KPI Set Dialog ───────────────────────────────────────────────────────────

function KpiSetDialog({open,initialSet,users,years,deptMasters,onClose,onSuccess}:{
  open: boolean; initialSet: KpiSet|null; users: KpiUser[]; years: KpiYear[]; deptMasters:{key:string;label:string}[]; onClose:()=>void; onSuccess:()=>void;
}){
  const{toast}=useToast();
  const{refresh}=useAuth();
  const[saving,setSaving]=useState(false);
  const[userId,setUserId]=useState("");
  const[yearId,setYearId]=useState("");
  const[notes,setNotes]=useState("");
  const[userPickerOpen,setUserPickerOpen]=useState(false);
  useEffect(()=>{
    if(initialSet){setYearId(initialSet.yearId.toString());setNotes(initialSet.notes||"");}
    else{setUserId("");setYearId("");setNotes("");setUserPickerOpen(false);}
  },[initialSet,open]);
  const selectedUser=useMemo(()=>users.find(u=>u.id.toString()===userId),[users,userId]);
  const getDeptLabel=(key:string)=>deptMasters.find(d=>d.key===key)?.label||key;
  const groupedUsers=useMemo(()=>{
    const map=new Map<string,KpiUser[]>();
    for(const u of users){
      const dept=u.department||"Other";
      if(!map.has(dept)) map.set(dept,[]);
      map.get(dept)!.push(u);
    }
    return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b));
  },[users]);

  const handleSave=async()=>{
    if((!userId&&!initialSet)||!yearId){toast({title:"User and Year are required",variant:"destructive"});return;}
    setSaving(true);
    try{
      if(initialSet){await apiFetch(`/kpi-sets/${initialSet.id}`,{method:"PATCH",body:JSON.stringify({notes})});toast({title:"KPI set updated"});}
      else{await apiFetch("/kpi-sets",{method:"POST",body:JSON.stringify({userId:parseInt(userId),yearId:parseInt(yearId),notes})});toast({title:"KPI set created"});}
      onSuccess();
    }catch(e:any){
      if((e instanceof ApiError&&e.status===409)||e.message?.toLowerCase().includes("already exists")){
        toast({title:"Duplicate KPI Set",description:"A KPI set for this employee and financial year already exists. Archive the existing set to create a new one.",variant:"destructive"});
      }else if(e instanceof ApiError&&e.status===403){
        // Session may have been overwritten (e.g. another login in a different tab).
        // Re-fetch auth state so the UI reflects the actual signed-in account.
        await refresh();
        toast({title:"Session Mismatch",description:e.message||"Your session has changed. Please sign out and sign in with a CXO / HR account to create KPI sets.",variant:"destructive",duration:8000});
      }else{
        toast({title:"Error",description:e.message,variant:"destructive"});
      }
    }
    finally{setSaving(false);}
  };
  return(
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{initialSet?"Edit KPI Set":"New KPI Set"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          {!initialSet&&(
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Employee / User *</Label>
              <Popover open={userPickerOpen} onOpenChange={setUserPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 h-9 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring",
                      !selectedUser&&"text-muted-foreground"
                    )}
                  >
                    {selectedUser?(
                      <span className="flex items-center gap-2 min-w-0">
                        <UserCheck className="h-3.5 w-3.5 text-primary shrink-0"/>
                        <span className="font-medium truncate">{selectedUser.name}</span>
                        {selectedUser.employeeCode&&<span className="text-muted-foreground text-xs shrink-0">· {selectedUser.employeeCode}</span>}
                        {selectedUser.designation&&<span className="text-muted-foreground text-xs truncate">· {selectedUser.designation}</span>}
                      </span>
                    ):(
                      <span>Search and select employee…</span>
                    )}
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50"/>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by name, code, dept…" className="h-9"/>
                    <CommandList className="max-h-60">
                      <CommandEmpty>No employees found.</CommandEmpty>
                      {groupedUsers.map(([dept,deptUsers])=>(
                        <CommandGroup key={dept} heading={getDeptLabel(dept)}>
                          {deptUsers.map(u=>(
                            <CommandItem
                              key={u.id}
                              value={`${u.name} ${u.employeeCode||""} ${u.designation||""} ${getDeptLabel(dept)} ${dept}`}
                              onSelect={()=>{setUserId(u.id.toString());setUserPickerOpen(false);}}
                              className="flex flex-col items-start gap-0.5 py-2"
                            >
                              <div className="flex items-center gap-2 w-full">
                                <span className="font-medium text-sm">{u.name}</span>
                                {u.employeeCode&&<span className="text-xs font-mono text-muted-foreground">{u.employeeCode}</span>}
                              </div>
                              {u.designation&&<span className="text-xs text-muted-foreground">{u.designation}</span>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
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
        items:parsed.map(p=>({sno:p.sno,kpiName:p.kpiName,description:p.description,category:p.category,weightage:p.weightage,metric:p.metric,unit:p.unit,annualTarget:p.annualTarget,q1Target:p.q1Target,q2Target:p.q2Target,q3Target:p.q3Target,q4Target:p.q4Target,q1Actual:p.q1Actual,q2Actual:p.q2Actual,q3Actual:p.q3Actual,q4Actual:p.q4Actual,remarks:p.remarks,kpiId:p.kpiId,kpiType:p.kpiType,owner:p.owner,businessAlignment:p.businessAlignment,dataSource:p.dataSource,riskDependency:p.riskDependency})),
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
              {categories.length>0&&<span><strong className="text-foreground">{categories.length}</strong> categories: {categories.slice().sort().join(", ")}</span>}
              <span>Total weightage: <strong className={Math.abs(totalWt-100)>0.01?"text-red-600 dark:text-red-400":"text-emerald-600 dark:text-emerald-400"}>{totalWt.toFixed(2)}%</strong></span>
              <span className="ml-auto font-medium text-foreground">{file?.name}</span>
            </div>
            {Math.abs(totalWt-100)>0.01&&totalWt>0&&(
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-400/10 text-xs text-red-700 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0"/>
                <span><strong>Weightage must total exactly 100%.</strong> Current total is <strong>{totalWt.toFixed(2)}%</strong>. Please correct your Excel file and re-upload. Upload is blocked until this is fixed.</span>
              </div>
            )}
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
              <Button size="sm" onClick={()=>setStep("confirm")} disabled={Math.abs(totalWt-100)>0.01} title={Math.abs(totalWt-100)>0.01?"Fix weightage to total 100% before proceeding":""}>
                Review &amp; Confirm
              </Button>
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

function CategoryGroupedKpiDialog({open,set,person,year,isAdmin,userId,getDeptLabel,onClose,onRefresh}:{
  open: boolean; set: KpiSet; person: KpiPerson; year: KpiYear;
  isAdmin: boolean; userId?: number; getDeptLabel:(k:string)=>string; onClose:()=>void; onRefresh:()=>void;
}){
  const{data:items,refetch}=useSetItems(open?set.id:undefined);
  const{toast}=useToast();
  const[isFullscreen,setIsFullscreen]=useState(false);
  const[expanded,setExpanded]=useState<Set<string>>(new Set());
  const[approvalPanel,setApprovalPanel]=useState<ApprovalPanelState|null>(null);
  const[approvalComment,setApprovalComment]=useState("");
  const[saving,setSaving]=useState(false);
  const[batchDialog,setBatchDialog]=useState<{decision:"Approved"|"Rejected",comment:string}|null>(null);
  const[finalRemarks,setFinalRemarks]=useState("");
  const[showFinalSubmit,setShowFinalSubmit]=useState(false);
  const[submittingFinal,setSubmittingFinal]=useState(false);
  const displayItems=items||[];
  const groups=useMemo(()=>computeGroups(displayItems),[displayItems]);
  const allExpanded=groups.length>0&&groups.every(g=>expanded.has(g.category));
  const canApprove=isAdmin&&["Pending","Approved - Partial","Rejected - All"].includes(set.status);
  const canSubmitFinal=isAdmin&&set.status==="Pending";
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
  const batchReview=async()=>{
    if(!batchDialog) return;
    setSaving(true);
    try{
      await apiFetch(`/kpi-sets/${set.id}/batch-review`,{method:"POST",body:JSON.stringify({decision:batchDialog.decision,approvedBy:userId,approvalComments:batchDialog.comment||null})});
      toast({title:`All pending KPIs ${batchDialog.decision==="Approved"?"approved":"rejected"}`});
      setBatchDialog(null);
      refetch();onRefresh();
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    finally{setSaving(false);}
  };
  const submitFinalReview=async()=>{
    setSubmittingFinal(true);
    try{
      await apiFetch(`/kpi-sets/${set.id}/submit-review`,{method:"POST",body:JSON.stringify({approvedBy:userId,approvalComments:finalRemarks||null})});
      toast({title:"Review submitted",description:"KPI set has been finalised. Only approved KPIs will proceed to performance capture."});
      setShowFinalSubmit(false);setFinalRemarks("");
      refetch();onRefresh();onClose();
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    finally{setSubmittingFinal(false);}
  };
  const contentClass=isFullscreen
    ?"fixed inset-0 z-50 max-w-none w-screen h-screen rounded-none flex flex-col overflow-hidden bg-background translate-x-0 translate-y-0 border-0"
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
                {person.department&&<span className="text-xs text-muted-foreground">· {getDeptLabel(person.department)}</span>}
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
                  <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-500/50 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-400/10" onClick={()=>setBatchDialog({decision:"Approved",comment:""})} disabled={saving||!!batchDialog}><CheckCircle2 className="mr-1 h-3 w-3"/>Approve All</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-400/10" onClick={()=>setBatchDialog({decision:"Rejected",comment:""})} disabled={saving||!!batchDialog}><XCircle className="mr-1 h-3 w-3"/>Reject All</Button>
                </>
              )}
              {canSubmitFinal&&displayItems.length>0&&(
                <Button size="sm" className="h-7 text-xs bg-primary" onClick={()=>setShowFinalSubmit(v=>!v)}
                  disabled={submittingFinal||pendingCount>0}
                  title={pendingCount>0?`${pendingCount} KPI${pendingCount>1?"s":""} still pending — review all KPIs before submitting`:undefined}>
                  <CheckCircle2 className="mr-1 h-3 w-3"/>Submit Review
                </Button>
              )}
              <button onClick={()=>setIsFullscreen(!isFullscreen)} className="h-7 w-7 flex items-center justify-center rounded border border-border hover:bg-muted transition-colors" title={isFullscreen?"Exit fullscreen":"Fullscreen"}>
                {isFullscreen?<Minimize2 className="h-3.5 w-3.5"/>:<Maximize2 className="h-3.5 w-3.5"/>}
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* ── Batch comment bar ─────────────────────────────────────────── */}
        {batchDialog&&(
          <div className={cn("shrink-0 mx-1 rounded-lg border px-3 py-2.5 text-xs flex items-center gap-2",
            batchDialog.decision==="Approved"
              ?"border-emerald-400/40 bg-emerald-50 dark:bg-emerald-400/10"
              :"border-red-400/40 bg-red-50 dark:bg-red-400/10")}>
            <span className={cn("font-semibold shrink-0",batchDialog.decision==="Approved"?"text-emerald-700 dark:text-emerald-400":"text-red-700 dark:text-red-400")}>
              {batchDialog.decision==="Approved"?"✓ Approve All Pending:":"✗ Reject All Pending:"}
            </span>
            <input type="text" className="flex-1 h-7 rounded border border-border bg-background px-2 text-xs"
              placeholder="Add a comment (optional)…" autoFocus
              value={batchDialog.comment} onChange={e=>setBatchDialog(d=>d?{...d,comment:e.target.value}:null)}
              onKeyDown={e=>{if(e.key==="Enter")batchReview();if(e.key==="Escape")setBatchDialog(null);}}/>
            <button onClick={batchReview} disabled={saving}
              className={cn("h-7 px-3 rounded text-[11px] font-semibold text-white shrink-0",
                batchDialog.decision==="Approved"?"bg-emerald-600 hover:bg-emerald-700":"bg-red-600 hover:bg-red-700",
                saving&&"opacity-50 cursor-not-allowed")}>
              {saving?"Saving…":"Confirm"}
            </button>
            <button onClick={()=>setBatchDialog(null)} className="h-7 px-2 rounded border border-border hover:bg-muted shrink-0">Cancel</button>
          </div>
        )}

        {/* ── Final submit bar ──────────────────────────────────────────── */}
        {showFinalSubmit&&canSubmitFinal&&(
          <div className={cn("shrink-0 mx-1 rounded-lg border px-3 py-3 text-xs flex flex-col gap-2",
            pendingCount>0?"border-yellow-400/50 bg-yellow-50 dark:bg-yellow-400/10":"border-primary/40 bg-primary/5")}>
            <div className="flex items-center gap-2 font-semibold text-[11px]">
              <CheckCircle2 className={cn("h-3.5 w-3.5",pendingCount>0?"text-yellow-600 dark:text-yellow-400":"text-primary")}/>
              <span className={pendingCount>0?"text-yellow-700 dark:text-yellow-400":"text-primary"}>Submit Final Review</span>
              <span className="font-normal text-muted-foreground ml-1">
                — {approvedCount} approved, {rejectedCount} rejected
                {pendingCount>0&&<span className="text-yellow-700 dark:text-yellow-400 font-semibold ml-1">, {pendingCount} pending · must review all KPIs first</span>}
              </span>
            </div>
            {pendingCount>0&&(
              <div className="flex items-center gap-1.5 text-yellow-700 dark:text-yellow-400 text-[11px] font-medium">
                <XCircle className="h-3.5 w-3.5 shrink-0"/>
                {pendingCount} KPI{pendingCount>1?"s":""} still pending. Approve or Reject every KPI before submitting the final review.
              </div>
            )}
            {pendingCount===0&&(<>
            <div className="flex items-center gap-2">
              <textarea rows={2} className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs resize-none"
                placeholder="Final remarks on this KPI set review (optional)…"
                value={finalRemarks} onChange={e=>setFinalRemarks(e.target.value)}/>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={submitFinalReview} disabled={submittingFinal}
                  className="h-8 px-4 rounded bg-primary text-white text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap">
                  {submittingFinal?"Submitting…":"Submit & Finalise"}
                </button>
                <button onClick={()=>{setShowFinalSubmit(false);setFinalRemarks("");}}
                  className="h-7 px-3 rounded border border-border hover:bg-muted text-[11px] text-muted-foreground">
                  Cancel
                </button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Only KPIs individually marked <strong>Approved</strong> will be available for performance actuals capture.</p>
            </>)}
          </div>
        )}

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

// ─── Performance Capture Dialog ───────────────────────────────────────────────

const ACTUALS_STATUS_COLORS: Record<string,string>={
  NotStarted:"border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10",
  PendingReview:"border-yellow-500/30 text-yellow-600 bg-yellow-50 dark:bg-yellow-400/10",
  Reviewed:"border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10",
  RevisionNeeded:"border-red-500/30 text-red-600 bg-red-50 dark:bg-red-400/10",
};
const ACTUALS_STATUS_LABELS: Record<string,string>={
  NotStarted:"Actuals Not Started",PendingReview:"Actuals Pending Review",
  Reviewed:"Actuals Reviewed",RevisionNeeded:"Revision Needed",
};

function PerformanceCaptureDialog({open,set,person,year,isAdmin,userId,getDeptLabel,onClose,onRefresh}:{
  open: boolean; set: KpiSet; person: KpiPerson; year: KpiYear;
  isAdmin?: boolean; userId?: number; getDeptLabel:(k:string)=>string; onClose:()=>void; onRefresh:()=>void;
}){
  const{toast}=useToast();
  const{data:items}=useSetItems(open?set.id:undefined);
  const[actuals,setActuals]=useState<Record<number,{q1:string;q2:string;q3:string;q4:string;remarks:string}>>({});
  const[saving,setSaving]=useState(false);
  const[submitting,setSubmitting]=useState(false);
  const[isFullscreen,setIsFullscreen]=useState(false);
  const[reviewComment,setReviewComment]=useState(set.actualsReviewComments||"");
  const[reviewDecision,setReviewDecision]=useState<"Reviewed"|"RevisionNeeded"|null>(null);

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

  const handleSubmitForReview=async()=>{
    if(!confirm("Submit actuals for HR/Admin review? You can still update actuals after submission.")) return;
    setSubmitting(true);
    try{
      await apiFetch(`/kpi-sets/${set.id}/actuals/submit`,{method:"POST"});
      toast({title:"Actuals submitted for review",description:"HR/Admin will be notified to review the performance data."});
      onRefresh();onClose();
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    finally{setSubmitting(false);}
  };

  const handleReview=async(decision:"Reviewed"|"RevisionNeeded")=>{
    if(!confirm(decision==="Reviewed"?"Mark these actuals as Reviewed?":"Request revision from the employee?")) return;
    setSubmitting(true);
    try{
      await apiFetch(`/kpi-sets/${set.id}/actuals/review`,{method:"POST",body:JSON.stringify({decision,comments:reviewComment||null,reviewedBy:userId})});
      toast({title:decision==="Reviewed"?"Actuals approved":"Revision requested",description:decision==="Reviewed"?"Performance actuals marked as reviewed.":"Employee has been asked to revise their actuals."});
      onRefresh();onClose();
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    finally{setSubmitting(false);}
  };

  const allItems=items||[];
  const displayItems=allItems.filter(i=>i.approvalStatus==="Approved");
  const contentClass=isFullscreen
    ?"fixed inset-0 z-50 max-w-none w-screen h-screen rounded-none flex flex-col overflow-hidden bg-background translate-x-0 translate-y-0 border-0"
    :"sm:max-w-[1300px] max-h-[92vh] flex flex-col overflow-hidden";

  return(
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={contentClass}>
        <DialogHeader className="shrink-0 pr-8">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold">
                {isAdmin&&set.actualsStatus==="PendingReview"?"Review Performance Actuals":"Enter Performance Actuals"} — {person.name}
              </DialogTitle>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                <span>{year.label}</span>
                {person.designation&&<span>· {person.designation}</span>}
                {person.department&&<span>· {getDeptLabel(person.department)}</span>}
                <Badge variant="outline" className={cn("text-[10px] px-1.5",STATUS_COLORS[set.status]||"")}>{set.status}</Badge>
                {set.actualsStatus&&set.actualsStatus!=="NotStarted"&&(
                  <Badge variant="outline" className={cn("text-[10px] px-1.5",ACTUALS_STATUS_COLORS[set.actualsStatus]||"")}>
                    {ACTUALS_STATUS_LABELS[set.actualsStatus]||set.actualsStatus}
                  </Badge>
                )}
                <span>{displayItems.length} KPIs</span>
              </div>
              {set.actualsStatus==="RevisionNeeded"&&set.actualsReviewComments&&(
                <div className="mt-2 flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10 border border-red-200 dark:border-red-400/30 rounded-md px-2 py-1.5">
                  <Info className="h-3 w-3 flex-shrink-0 mt-0.5"/>
                  <span><strong>Revision needed:</strong> {set.actualsReviewComments}</span>
                </div>
              )}
              {set.actualsStatus==="Reviewed"&&set.actualsReviewedAt&&(
                <div className="mt-2 flex items-start gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10 border border-emerald-200 dark:border-emerald-400/30 rounded-md px-2 py-1.5">
                  <CheckCircle2 className="h-3 w-3 flex-shrink-0 mt-0.5"/>
                  <span><strong>Actuals reviewed</strong> on {fmtTs(set.actualsReviewedAt)}{set.actualsReviewComments&&` — ${set.actualsReviewComments}`}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
              {!isAdmin&&(
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving||displayItems.length===0}>
                  {saving?"Saving…":"Save Actuals"}
                </Button>
              )}
              {!isAdmin&&set.actualsStatus!=="PendingReview"&&set.actualsStatus!=="Reviewed"&&displayItems.length>0&&(
                <Button size="sm" variant="outline" className="h-7 text-xs border-yellow-500/50 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-400/10"
                  onClick={handleSubmitForReview} disabled={submitting}>
                  {submitting?"Submitting…":"Submit for Review"}
                </Button>
              )}
              {isAdmin&&set.actualsStatus==="PendingReview"&&(
                <>
                  <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving||displayItems.length===0}>
                    {saving?"Saving…":"Save Actuals"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-500/50 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-400/10"
                    onClick={()=>handleReview("Reviewed")} disabled={submitting}>
                    <CheckCircle2 className="mr-1 h-3 w-3"/>{submitting?"…":"Mark Reviewed"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-400/10"
                    onClick={()=>handleReview("RevisionNeeded")} disabled={submitting}>
                    <XCircle className="mr-1 h-3 w-3"/>Request Revision
                  </Button>
                </>
              )}
              {isAdmin&&set.actualsStatus!=="PendingReview"&&(
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving||displayItems.length===0}>
                  {saving?"Saving…":"Save Actuals"}
                </Button>
              )}
              {displayItems.length>0&&(
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={()=>downloadSetExcel(displayItems,person,year)}>
                  <Download className="mr-1 h-3 w-3"/>Download
                </Button>
              )}
              <button onClick={()=>setIsFullscreen(f=>!f)} className="h-7 w-7 flex items-center justify-center rounded border border-border hover:bg-muted transition-colors">
                {isFullscreen?<Minimize2 className="h-3.5 w-3.5"/>:<Maximize2 className="h-3.5 w-3.5"/>}
              </button>
            </div>
          </div>
          {isAdmin&&set.actualsStatus==="PendingReview"&&(
            <div className="mt-2">
              <Label className="text-xs text-muted-foreground">Review comments (optional)</Label>
              <input type="text" value={reviewComment} onChange={e=>setReviewComment(e.target.value)}
                className="mt-1 w-full h-7 text-xs border border-border rounded px-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Add review notes for the employee…"/>
            </div>
          )}
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

function KpiSetsTab({sets,archivedSets,persons,years,statusFilter,onStatusFilter,isAdmin,isEmployee,isCxo,isHR,userId,getDeptLabel,onView,onUpload,onHistory,onEdit,onSubmit,onDelete,onPerformance,onRefresh}:{
  sets: KpiSet[]; archivedSets: KpiSet[]; persons: KpiPerson[]; years: KpiYear[];
  statusFilter: string; onStatusFilter:(s:string)=>void;
  isAdmin: boolean; isEmployee?: boolean; isCxo?: boolean; isHR?: boolean; userId?: number;
  getDeptLabel:(k:string)=>string;
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
  const statusOpts=["all","Draft","Pending","Approved","Approved - Partial","Rejected - All"];
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
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{person?.department?getDeptLabel(person.department):"—"}</td>
                  <td className="px-4 py-2.5 text-xs">{year?.label||"—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    {set.versionNumber?<span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-400/20 text-blue-700 dark:text-blue-400 font-semibold">v{set.versionNumber}</span>:<span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center text-sm font-semibold">{set.itemCount??""}</td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Badge variant="outline" className={cn("text-[10px]",archived?"border-gray-400/30 text-gray-500 bg-gray-50 dark:bg-gray-400/10":STATUS_COLORS[set.status]||"")}>
                        {archived?"Archived":set.status}
                      </Badge>
                      {!archived&&set.actualsStatus&&set.actualsStatus!=="NotStarted"&&(
                        <Badge variant="outline" className={cn("text-[9px] px-1",ACTUALS_STATUS_COLORS[set.actualsStatus]||"")}>
                          {ACTUALS_STATUS_LABELS[set.actualsStatus]||set.actualsStatus}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[10px] text-muted-foreground">
                    {set.submittedAt?new Date(set.submittedAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"2-digit"}):"—"}
                  </td>
                  <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>onView(set)} title="View KPIs"><Eye className="h-3.5 w-3.5"/></Button>
                    {!archived&&["Approved","Approved - Partial"].includes(set.status)&&(
                      <Button variant="ghost" size="icon"
                        className={cn("h-7 w-7",set.actualsStatus==="PendingReview"&&isAdmin?"text-yellow-600 hover:text-yellow-700 bg-yellow-50 dark:bg-yellow-400/10":"text-emerald-600 hover:text-emerald-700")}
                        onClick={()=>onPerformance(set)}
                        title={set.actualsStatus==="PendingReview"&&isAdmin?"Review actuals submitted by employee":isEmployee?"Enter your performance actuals":"Enter performance actuals"}>
                        <Target className="h-3.5 w-3.5"/>
                      </Button>
                    )}
                    {!archived&&(isAdmin||isEmployee||isCxo||isHR)&&(
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>onUpload(set)} title={["Pending","Approved","Approved - Partial"].includes(set.status)?"Upload locked — KPI set is under review or finalised":"Upload KPIs"} disabled={["Pending","Approved","Approved - Partial"].includes(set.status)}><Upload className="h-3.5 w-3.5"/></Button>
                        {(isAdmin||isCxo||isHR)&&<Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>onHistory(set)} title="Version history"><History className="h-3.5 w-3.5"/></Button>}
                        {set.status==="Draft"&&(
                          <>
                            {isAdmin&&<Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>onEdit(set)} title="Edit"><Pencil className="h-3.5 w-3.5"/></Button>}
                            {set.currentVersionId&&<Button variant="ghost" size="icon" className="h-7 w-7 text-yellow-600" onClick={()=>onSubmit(set)} title="Submit for review"><Send className="h-3.5 w-3.5"/></Button>}
                          </>
                        )}
                        {isAdmin&&set.status==="Pending"&&<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={()=>handleRecall(set)} title="Recall submission"><RotateCcw className="h-3.5 w-3.5"/></Button>}
                        {isAdmin&&<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={()=>onDelete(set)} title="Archive"><Trash2 className="h-3.5 w-3.5"/></Button>}
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
  const{isAdmin,isCxo,isEmployee,isHR,user}=useAuth();
  const{toast}=useToast();
  const qc=useQueryClient();

  const[yearFilter,setYearFilter]=useState<number|undefined>();
  const[statusFilter,setStatusFilter]=useState("all");
  const[detailSet,setDetailSet]=useState<KpiSet|null>(null);
  const[uploadSet,setUploadSet]=useState<KpiSet|null>(null);
  const[historySet,setHistorySet]=useState<KpiSet|null>(null);
  const[editSet,setEditSet]=useState<KpiSet|"new"|null>(null);
  const[performanceSet,setPerformanceSet]=useState<KpiSet|null>(null);

  const{data:years}=useKpiYears();
  const{data:persons}=usePersons();
  const{data:kpiUsers=[]}=useKpiUsers();
  const{data:deptMasters=[]}=useDeptMasters();
  const getDeptLabel=useCallback((key:string)=>deptMasters.find(d=>d.key===key)?.label||key,[deptMasters]);
  const{data:sets}=useKpiSets(yearFilter);
  const{data:archivedSets=[]}=useArchivedSets(yearFilter);

  useEffect(()=>{
    if(years&&!yearFilter){const cur=years.find(y=>y.isCurrent)||years[0];if(cur) setYearFilter(cur.id);}
  },[years]);

  const stats=useMemo(()=>{
    const all=sets||[];
    return{total:all.length,draft:all.filter(s=>s.status==="Draft").length,pending:all.filter(s=>s.status==="Pending").length,approved:all.filter(s=>s.status==="Approved").length,partial:all.filter(s=>s.status==="Approved - Partial").length,rejected:all.filter(s=>s.status==="Rejected - All").length};
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
          {user&&<span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 hidden sm:inline">{user.name} · <span className="font-medium capitalize">{user.role === "kpi_employee" ? "Employee" : user.role.toUpperCase()}</span></span>}
          {years&&(
            <Select value={yearFilter?.toString()} onValueChange={v=>setYearFilter(parseInt(v))}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Select year"/></SelectTrigger>
              <SelectContent>{years.map(y=><SelectItem key={y.id} value={y.id.toString()}>{y.label}{y.isCurrent?" ★":""}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={()=>downloadTemplate(currentYear?.label)}><Download className="mr-1.5 h-3.5 w-3.5"/>Template</Button>
          {(isAdmin||isCxo||isHR)&&(
            <Button size="sm" className="h-8 text-xs" onClick={()=>setEditSet("new")}><Plus className="mr-1.5 h-3.5 w-3.5"/>New KPI Set</Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[{label:"Total Sets",value:stats.total,color:"text-foreground"},{label:"Draft",value:stats.draft,color:"text-gray-500"},{label:"Pending Review",value:stats.pending,color:"text-yellow-600"},{label:"Approved",value:stats.approved,color:"text-emerald-600"},{label:"Partial Approval",value:stats.partial,color:"text-teal-600"},{label:"Rejected All",value:stats.rejected,color:"text-red-600"}].map(s=>(
          <Card key={s.label} className="border-border"><CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{s.label}</p>
            <p className={cn("text-2xl font-bold mt-0.5",s.color)}>{s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* KPI Sets Tab */}
      <KpiSetsTab sets={filteredSets} archivedSets={archivedSets} persons={persons||[]} years={years||[]}
        statusFilter={statusFilter} onStatusFilter={setStatusFilter}
        isAdmin={isAdmin} isEmployee={isEmployee} isCxo={isCxo} isHR={isHR} userId={user?.id}
        getDeptLabel={getDeptLabel}
        onView={setDetailSet} onUpload={setUploadSet} onHistory={setHistorySet}
        onEdit={setEditSet} onSubmit={handleSubmit} onDelete={handleDelete}
        onPerformance={setPerformanceSet} onRefresh={refresh}/>

      {/* Dialogs */}
      {detailSet&&(()=>{const person=getPerson(detailSet);const year=getYear(detailSet.yearId);if(!person||!year) return null;
        return(<CategoryGroupedKpiDialog open={!!detailSet} set={detailSet} person={person} year={year} isAdmin={isAdmin} userId={user?.id} getDeptLabel={getDeptLabel} onClose={()=>setDetailSet(null)} onRefresh={refresh}/>);
      })()}
      {uploadSet&&(()=>{const person=getPerson(uploadSet);const year=getYear(uploadSet.yearId);if(!person||!year) return null;
        return(<UploadDialog open={!!uploadSet} set={uploadSet} person={person} year={year} userId={user?.id} onClose={()=>setUploadSet(null)} onSuccess={()=>{setUploadSet(null);refresh();}}/>);
      })()}
      {historySet&&(()=>{const person=getPerson(historySet);const year=getYear(historySet.yearId);if(!person||!year) return null;
        return(<HistoryDialog open={!!historySet} set={historySet} person={person} year={year} onClose={()=>setHistorySet(null)}/>);
      })()}
      {editSet!==null&&(
        <KpiSetDialog open={editSet!==null} initialSet={editSet==="new"?null:editSet} users={kpiUsers} years={years||[]} deptMasters={deptMasters}
          onClose={()=>setEditSet(null)} onSuccess={()=>{setEditSet(null);qc.invalidateQueries({queryKey:["kpi-persons"]});refresh();}}/>
      )}
      {performanceSet&&(()=>{const person=getPerson(performanceSet);const year=getYear(performanceSet.yearId);if(!person||!year) return null;
        return(<PerformanceCaptureDialog open={!!performanceSet} set={performanceSet} person={person} year={year} isAdmin={isAdmin} userId={user?.id} getDeptLabel={getDeptLabel} onClose={()=>setPerformanceSet(null)} onRefresh={refresh}/>);
      })()}
    </div>
  );
}
