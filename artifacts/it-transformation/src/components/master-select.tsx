import React from "react";
import { useMasters } from "@/hooks/use-masters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface MasterSelectProps {
  category: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  includeAll?: boolean;
  allLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function MasterSelect({
  category,
  value,
  onChange,
  placeholder = "Select...",
  includeAll = false,
  allLabel = "All",
  disabled,
  className,
}: MasterSelectProps) {
  const { data: masters, isLoading } = useMasters(category);

  if (isLoading) return <Skeleton className="h-9 w-full" />;

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && (
          <SelectItem value="">
            {allLabel}
          </SelectItem>
        )}
        {(masters || []).map(m => (
          <SelectItem key={m.id} value={m.label}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
