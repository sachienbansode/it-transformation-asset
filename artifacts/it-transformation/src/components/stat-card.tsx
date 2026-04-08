import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  valueColor?: string;
  borderColor?: string;
  progress?: number;
  progressColor?: string;
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg = "bg-muted",
  iconColor = "text-muted-foreground",
  valueColor,
  borderColor,
  progress,
  progressColor,
}: StatCardProps) {
  return (
    <Card className={cn("relative overflow-hidden", borderColor && `border-l-4 ${borderColor}`)}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">
              {label}
            </p>
            <p className={cn("text-xl font-bold leading-none mt-1.5", valueColor || "text-foreground")}>
              {value}
            </p>
            {sub && (
              <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{sub}</p>
            )}
          </div>
          {Icon && (
            <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0", iconBg)}>
              <Icon className={cn("h-3.5 w-3.5", iconColor)} />
            </div>
          )}
        </div>
        {progress !== undefined && (
          <div className="mt-3">
            <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
              <span>Progress</span>
              <span className="font-semibold">{progress}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, backgroundColor: progressColor || "#16a34a" }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
