import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FileDown, FileText, Presentation, Building2,
  Server, Map, CheckSquare, Archive, ShieldCheck,
  BrainCircuit, Filter, Eye, RefreshCw, Layers,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ReportSummary {
  businesses: string[];
  phases: string[];
  counts: {
    apps: number;
    roadmap: number;
    checklist: number;
    retirements: number;
    aibom: number;
    sbom: number;
  };
  totalBudget: number;
  criticalCves: number;
}

const MODULES = [
  { id: "apps", label: "Application Inventory", icon: Server, color: "text-blue-600 dark:text-blue-400" },
  { id: "roadmap", label: "Transformation Roadmap", icon: Map, color: "text-amber-600 dark:text-amber-400" },
  { id: "checklist", label: "Digital Readiness Checklist", icon: CheckSquare, color: "text-emerald-600 dark:text-emerald-400" },
  { id: "retirement", label: "Retirement Pipeline", icon: Archive, color: "text-orange-600 dark:text-orange-400" },
  { id: "security", label: "Security Posture (SBOM + AIBOM)", icon: ShieldCheck, color: "text-red-600 dark:text-red-400" },
];

const SLIDE_PREVIEWS = [
  { slide: "01", title: "Title Slide", desc: "Ashika Group branded cover with date and filter details", color: "bg-slate-800" },
  { slide: "02", title: "Agenda", desc: "Table of contents listing all included sections", color: "bg-amber-700" },
  { slide: "03", title: "Executive Summary", desc: "KPI dashboard — applications, budget, readiness, CVEs", color: "bg-blue-700" },
  { slide: "04–05", title: "Current IT Landscape", desc: "Application inventory table + hosting/criticality breakdown charts", color: "bg-indigo-700" },
  { slide: "06", title: "Transformation Roadmap", desc: "Phase-wise initiative table with budget and owner", color: "bg-violet-700" },
  { slide: "07", title: "Digital Readiness", desc: "Checklist progress by business unit with completion %", color: "bg-emerald-700" },
  { slide: "08", title: "Retirement Pipeline", desc: "Legacy decommissioning plan with status and target dates", color: "bg-orange-700" },
  { slide: "09", title: "Security Posture", desc: "SBOM CVEs and AIBOM risk landscape summary", color: "bg-red-700" },
  { slide: "10", title: "Proposed Landscape", desc: "Current → In-transition → Target state view", color: "bg-teal-700" },
  { slide: "11", title: "Key Actions", desc: "Next 90-day priority actions with owners", color: "bg-cyan-700" },
  { slide: "12", title: "Thank You", desc: "Closing slide with contact information", color: "bg-slate-800" },
];

export default function Reports() {
  const { toast } = useToast();
  const [business, setBusiness] = useState("all");
  const [phase, setPhase] = useState("all");
  const [selectedModules, setSelectedModules] = useState<string[]>(MODULES.map(m => m.id));
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: summary, isLoading, refetch } = useQuery<ReportSummary>({
    queryKey: ["reports-summary", business, phase],
    queryFn: () => {
      const params = new URLSearchParams();
      if (business !== "all") params.set("business", business);
      if (phase !== "all") params.set("phase", phase);
      return apiFetch<ReportSummary>(`/reports/summary?${params}`);
    },
  });

  const toggleModule = (id: string) => {
    setSelectedModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const params = new URLSearchParams();
      if (business !== "all") params.set("business", business);
      if (phase !== "all") params.set("phase", phase);
      if (selectedModules.length < MODULES.length) {
        params.set("includeModules", selectedModules.join(","));
      }

      const response = await fetch(
        `${import.meta.env.BASE_URL}api/reports/ppt?${params}`,
        { credentials: "include" }
      );

      if (!response.ok) throw new Error("Failed to generate report");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().split("T")[0];
      a.download = `Ashika_IT_Transformation_${today}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Report downloaded successfully", description: "Your PowerPoint presentation is ready." });
    } catch (e: any) {
      toast({ title: "Failed to generate report", description: e.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const slidesIncluded = 3 + // Title + Agenda + Exec Summary
    (selectedModules.includes("apps") ? 2 : 0) +
    (selectedModules.includes("roadmap") ? 1 : 0) +
    (selectedModules.includes("checklist") ? 1 : 0) +
    (selectedModules.includes("retirement") ? 1 : 0) +
    (selectedModules.includes("security") ? 1 : 0) +
    2; // Proposed landscape + Key Actions + Thank you

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Presentation className="h-5 w-5 text-primary" />
            PowerPoint Report Generator
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Generate an Ashika Group branded IT Transformation presentation with live data</p>
        </div>
        <Button
          onClick={handleDownload}
          disabled={isGenerating || selectedModules.length === 0}
          size="sm"
          className="gap-2"
        >
          {isGenerating
            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</>
            : <><FileDown className="h-4 w-4" /> Download PPTX</>
          }
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Filters + Config */}
        <div className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" /> Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Business Unit</Label>
                <Select value={business} onValueChange={setBusiness}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Business Units</SelectItem>
                    {(summary?.businesses ?? []).map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Roadmap Phase</Label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Phases</SelectItem>
                    {(summary?.phases ?? []).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Module Selection */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" /> Include Sections
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {MODULES.map(mod => {
                const Icon = mod.icon;
                const selected = selectedModules.includes(mod.id);
                return (
                  <div
                    key={mod.id}
                    className={cn(
                      "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all",
                      selected ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"
                    )}
                    onClick={() => toggleModule(mod.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-3.5 w-3.5", selected ? mod.color : "text-muted-foreground")} />
                      <span className="text-xs font-medium">{mod.label}</span>
                    </div>
                    <Switch
                      checked={selected}
                      onCheckedChange={() => toggleModule(mod.id)}
                      className="scale-75"
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Data Preview */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" /> Data Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : summary ? (
                <div className="space-y-2">
                  {[
                    { label: "Applications", value: summary.counts.apps, icon: Server, color: "text-blue-600", show: selectedModules.includes("apps") },
                    { label: "Roadmap Items", value: summary.counts.roadmap, icon: Map, color: "text-amber-600", show: selectedModules.includes("roadmap") },
                    { label: "Checklist Items", value: summary.counts.checklist, icon: CheckSquare, color: "text-emerald-600", show: selectedModules.includes("checklist") },
                    { label: "Retirements", value: summary.counts.retirements, icon: Archive, color: "text-orange-600", show: selectedModules.includes("retirement") },
                    { label: "SBOM Entries", value: summary.counts.sbom, icon: ShieldCheck, color: "text-red-600", show: selectedModules.includes("security") },
                    { label: "AI Components", value: summary.counts.aibom, icon: BrainCircuit, color: "text-purple-600", show: selectedModules.includes("security") },
                  ].filter(r => r.show).map(row => {
                    const Icon = row.icon;
                    return (
                      <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                        <div className="flex items-center gap-1.5">
                          <Icon className={cn("h-3 w-3", row.color)} />
                          <span className="text-xs text-muted-foreground">{row.label}</span>
                        </div>
                        <Badge variant="secondary" className="text-[10px] font-bold">{row.value}</Badge>
                      </div>
                    );
                  })}
                  <div className="pt-1 flex items-center justify-between text-xs font-semibold">
                    <span>Total Budget</span>
                    <span className="text-primary">₹{summary.totalBudget.toLocaleString()} L</span>
                  </div>
                  {summary.criticalCves > 0 && (
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>Critical CVEs</span>
                      <span className="text-red-600">{summary.criticalCves}</span>
                    </div>
                  )}
                </div>
              ) : <p className="text-xs text-muted-foreground">No data available</p>}
            </CardContent>
          </Card>
        </div>

        {/* Right: Slide Preview */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" /> Slide Preview
                  <Badge variant="secondary" className="text-[10px]">{slidesIncluded} slides</Badge>
                </CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Ashika Group branded dark template with gold accent</p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SLIDE_PREVIEWS.filter(s => {
                  if (s.slide.includes("04") || s.slide.includes("05")) return selectedModules.includes("apps");
                  if (s.slide === "06") return selectedModules.includes("roadmap");
                  if (s.slide === "07") return selectedModules.includes("checklist");
                  if (s.slide === "08") return selectedModules.includes("retirement");
                  if (s.slide === "09") return selectedModules.includes("security");
                  return true;
                }).map(preview => (
                  <div key={preview.slide} className="rounded-lg overflow-hidden border border-border shadow-sm">
                    {/* Slide thumbnail */}
                    <div className={cn("h-20 p-2.5 flex flex-col justify-between", preview.color)}>
                      <div className="flex items-center justify-between">
                        <div className="w-12 h-1 bg-white/20 rounded" />
                        <span className="text-[8px] text-white/50 font-mono">{preview.slide}</span>
                      </div>
                      <div>
                        <div className="h-1.5 bg-amber-400/80 rounded mb-1 w-3/4" />
                        <div className="space-y-0.5">
                          <div className="h-0.5 bg-white/20 rounded w-full" />
                          <div className="h-0.5 bg-white/20 rounded w-4/5" />
                          <div className="h-0.5 bg-white/20 rounded w-3/5" />
                        </div>
                      </div>
                    </div>
                    {/* Label */}
                    <div className="px-2 py-1.5 bg-card">
                      <p className="text-[10px] font-semibold text-foreground truncate">{preview.title}</p>
                      <p className="text-[9px] text-muted-foreground line-clamp-2 leading-tight mt-0.5">{preview.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Branding Info */}
          <Card>
            <CardContent className="px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Presentation className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Ashika Group Standard Template</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Dark slate header/footer · Gold accent bars · White content area · Calibri font · A4 widescreen (16:9)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Each slide includes the company name, generation date, and "CONFIDENTIAL" watermark footer.
                    Slides are auto-generated with live data based on your selected filters.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleDownload}
            disabled={isGenerating || selectedModules.length === 0}
            className="w-full gap-2"
            size="lg"
          >
            {isGenerating
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating PowerPoint…</>
              : <><FileDown className="h-5 w-5" /> Generate & Download PPTX ({slidesIncluded} slides)</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
