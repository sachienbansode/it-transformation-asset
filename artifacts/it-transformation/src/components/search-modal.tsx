import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Search, X, CheckSquare, Map, Server, BrainCircuit, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: number;
  title: string;
  sub?: string;
  business?: string;
  status?: string;
}

interface SearchResults {
  checklist: SearchResult[];
  roadmap: SearchResult[];
  applications: SearchResult[];
  aibom: SearchResult[];
  sbom: SearchResult[];
}

const MODULE_META: Record<keyof SearchResults, { label: string; icon: React.ElementType; href: string; color: string }> = {
  checklist: { label: "Checklist", icon: CheckSquare, href: "/checklist", color: "text-blue-500" },
  roadmap: { label: "Roadmap", icon: Map, href: "/roadmap", color: "text-violet-500" },
  applications: { label: "Applications", icon: Server, href: "/applications", color: "text-emerald-500" },
  aibom: { label: "AI BOM", icon: BrainCircuit, href: "/aibom", color: "text-orange-500" },
  sbom: { label: "Software BOM", icon: ShieldCheck, href: "/sbom", color: "text-rose-500" },
};

const STATUS_COLORS: Record<string, string> = {
  Available: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Not Available": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Legacy: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Partial: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  Critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  High: "bg-orange-100 text-orange-700",
  Low: "bg-green-100 text-green-700",
  Completed: "bg-green-100 text-green-700",
  "In Progress": "bg-blue-100 text-blue-700",
};

function useDebounce<T>(val: T, delay: number) {
  const [debouncedVal, setDebouncedVal] = useState(val);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedVal(val), delay);
    return () => clearTimeout(t);
  }, [val, delay]);
  return debouncedVal;
}

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 280);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) { setResults(null); return; }
    setLoading(true);
    apiFetch<SearchResults>(`/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then(r => setResults(r))
      .catch(() => setResults(null))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  const handleNavigate = useCallback((href: string) => {
    onClose();
    navigate(href);
  }, [navigate, onClose]);

  const totalResults = results
    ? Object.values(results).reduce((s, arr) => s + arr.length, 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden gap-0">
        {/* Search Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search checklist, roadmap, applications, BOM…"
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
            onKeyDown={e => e.key === "Escape" && onClose()}
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5 hidden sm:block">ESC</kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-[420px]">
          {loading && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Searching…
            </div>
          )}

          {!loading && results && totalResults === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Search className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No results for "<span className="text-foreground">{query}</span>"</p>
            </div>
          )}

          {!loading && results && totalResults > 0 && (
            <div className="py-1">
              {(Object.keys(MODULE_META) as (keyof SearchResults)[]).map(module => {
                const items = results[module];
                if (!items || items.length === 0) return null;
                const meta = MODULE_META[module];
                const Icon = meta.icon;
                return (
                  <div key={module}>
                    <div className="px-4 py-1.5 flex items-center gap-2">
                      <Icon className={cn("h-3 w-3", meta.color)} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{meta.label}</span>
                    </div>
                    {items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => handleNavigate(meta.href)}
                        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-muted/60 transition-colors text-left"
                      >
                        <Icon className={cn("h-4 w-4 flex-shrink-0 opacity-50", meta.color)} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate text-foreground">{item.title}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {[item.sub, item.business].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        {item.status && (
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0",
                            STATUS_COLORS[item.status] ?? "bg-muted text-muted-foreground"
                          )}>
                            {item.status}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !results && !query && (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">Type to search across all modules</p>
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                {(Object.keys(MODULE_META) as (keyof SearchResults)[]).map(m => {
                  const meta = MODULE_META[m];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={m}
                      onClick={() => handleNavigate(meta.href)}
                      className={cn("flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted transition-colors", meta.color)}
                    >
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {results && totalResults > 0 && (
          <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            {totalResults} result{totalResults !== 1 ? "s" : ""} found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
