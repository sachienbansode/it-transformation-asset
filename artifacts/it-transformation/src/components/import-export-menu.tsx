import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Download, Upload, FileText, AlertTriangle, CheckCircle2, ChevronDown, Archive } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ImportPreview {
  total: number;
  valid: number;
  errors: string[];
  sample: Record<string, string>[];
}

interface ImportExportMenuProps {
  module: string;
  label: string;
  onImportSuccess?: () => void;
  archiveWarning?: string;
}

export function ImportExportMenu({ module, label, onImportSuccess, archiveWarning }: ImportExportMenuProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pendingCsv, setPendingCsv] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleDownload = async () => {
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const url = `${BASE}/api/${module}/export`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${module}_export.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast({ title: `${label} exported successfully` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const handleFileSelect = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast({ title: "Please select a .csv file", variant: "destructive" });
      return;
    }
    const text = await file.text();
    setPendingCsv(text);
    setPendingFileName(file.name);
    try {
      const result = await apiFetch<ImportPreview>(`/${module}/preview-import`, {
        method: "POST",
        body: JSON.stringify({ csv: text }),
      });
      setPreview(result);
    } catch (e: any) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  const handleConfirmImport = async () => {
    if (!pendingCsv) return;
    setImporting(true);
    try {
      const result = await apiFetch<{ imported: number; skipped: number; archivedCount?: number }>(`/${module}/import`, {
        method: "POST",
        body: JSON.stringify({ csv: pendingCsv, fileName: pendingFileName || `${module}.csv` }),
      });
      const archivedMsg = result.archivedCount ? ` (${result.archivedCount} previous records archived)` : "";
      toast({ title: `Imported ${result.imported} rows${result.skipped ? `, skipped ${result.skipped}` : ""}${archivedMsg}` });
      setPreview(null);
      setPendingCsv(null);
      setPendingFileName(null);
      onImportSuccess?.();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <FileText className="h-4 w-4" />
            CSV
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" /> Download CSV
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleFileSelect}>
            <Upload className="h-4 w-4 mr-2" /> Upload CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Import Confirmation Dialog */}
      <Dialog open={!!preview} onOpenChange={o => { if (!o) { setPreview(null); setPendingCsv(null); setPendingFileName(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import {label} — Review Summary</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4 py-2">
              {/* Archive warning */}
              {archiveWarning && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-400/10">
                  <Archive className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">{archiveWarning}</p>
                </div>
              )}

              {pendingFileName && (
                <p className="text-xs text-muted-foreground">File: <span className="font-medium text-foreground">{pendingFileName}</span></p>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{preview.total}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Rows</p>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{preview.valid}</p>
                  <p className="text-xs text-muted-foreground mt-1">Valid to Import</p>
                </div>
                <div className={cn("rounded-lg border p-3 text-center",
                  preview.errors.length > 0
                    ? "border-red-500/30 bg-red-50 dark:bg-red-500/10"
                    : "border-border"
                )}>
                  <p className={cn("text-2xl font-bold", preview.errors.length > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                    {preview.total - preview.valid}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Rows Skipped</p>
                </div>
              </div>

              {/* Errors */}
              {preview.errors.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-400">Validation Errors</span>
                  </div>
                  <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                    {preview.errors.slice(0, 20).map((e, i) => (
                      <li key={i} className="text-xs text-red-600 dark:text-red-400">{e}</li>
                    ))}
                    {preview.errors.length > 20 && (
                      <li className="text-xs text-muted-foreground">…and {preview.errors.length - 20} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Sample preview */}
              {preview.sample.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Preview (first {preview.sample.length} rows)</p>
                  <div className="overflow-x-auto border border-border rounded-lg">
                    <table className="text-xs w-full">
                      <thead className="bg-muted/40">
                        <tr>
                          {Object.keys(preview.sample[0]).slice(0, 5).map(k => (
                            <th key={k} className="px-2 py-1.5 text-left font-semibold text-muted-foreground truncate max-w-24">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sample.map((row, i) => (
                          <tr key={i} className="border-t border-border">
                            {Object.values(row).slice(0, 5).map((v, j) => (
                              <td key={j} className="px-2 py-1.5 truncate max-w-24">{v || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {preview.valid === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">No valid rows to import. Please fix the errors and try again.</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreview(null); setPendingCsv(null); setPendingFileName(null); }}>Cancel</Button>
            <Button
              onClick={handleConfirmImport}
              disabled={!preview || preview.valid === 0 || importing}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              {importing ? "Importing…" : `Import ${preview?.valid ?? 0} Rows`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
