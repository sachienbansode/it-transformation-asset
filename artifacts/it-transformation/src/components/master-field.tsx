import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMasters } from "@/hooks/use-masters";

/**
 * Drop-down driven by Master Data (e.g. department, asset_location). Stores the label. A value that is no longer
 * (or not yet) in the master list is still shown so old records stay readable; new values come from Admin › Master
 * Data or are added automatically by the asset register upload.
 */
export function MasterField({ category, value, onChange, placeholder = "Select", allowClear = true }: { category: string; value?: string | null; onChange: (v: string | null) => void; placeholder?: string; allowClear?: boolean }) {
  const { data = [] } = useMasters(category);
  const items = data.filter(m => m.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label)).map(m => m.label);
  const current = value || "";
  const listed = !current || items.some(i => i.toLowerCase() === current.toLowerCase());
  return (
    <Select value={current || "__none__"} onValueChange={v => onChange(v === "__none__" ? null : v)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowClear && <SelectItem value="__none__" className="text-muted-foreground">{placeholder}</SelectItem>}
        {!listed && <SelectItem value={current}>{current} (not in master)</SelectItem>}
        {items.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
