import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { AssetHealthPanel, HealthBadge, ago } from "@/components/asset-health";
import { PageHero, WorkspaceStrip } from "@/components/workspace-ui";
import { Laptop, CheckCircle2, AlertTriangle, MessageSquare } from "lucide-react";
import { Link } from "wouter";

/* My Workspace › My Device — the employee's own computer(s): health and what needs attention (opened from the tray icon).
   Usage data is not shown here (ITH-074: Super Admin only, in Device Health). */
export default function MyDevice() {
  const { data: list = [], isLoading } = useQuery({ queryKey: ["my-devices"], queryFn: () => apiFetch<any[]>("/my-devices"), refetchInterval: 60_000 });
  return (
    <div className="space-y-4 max-w-5xl">
      <PageHero img={`${import.meta.env.BASE_URL}niytri-agent.png`} title="My Device"
        subtitle="Health of your computer as reported by the IT Hub agent. Items clear on their own when your computer reports them fixed; IT already knows about anything critical." />
      <WorkspaceStrip />
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && !list.length && <Card><CardContent className="p-10 text-center text-sm text-muted-foreground"><Laptop className="w-9 h-9 mx-auto mb-2 opacity-40" />No computer with the IT Hub agent is linked to you yet. IT installs it on company laptops and desktops.</CardContent></Card>}
      {list.map((d: any) => {
        const ok = !d.openItems;
        return (
          <Card key={d.id} className="overflow-hidden">
            <div className={cn("px-4 py-3 border-b flex items-center gap-3 flex-wrap", ok ? "bg-emerald-50/60 dark:bg-emerald-900/10" : "bg-amber-50/60 dark:bg-amber-900/10")}>
              <div className="w-10 h-10 rounded-lg bg-background border flex items-center justify-center"><Laptop className="w-5 h-5 text-primary" /></div>
              <div className="min-w-0">
                <div className="font-semibold text-[15px]">{d.hostname}</div>
                <div className="text-xs text-muted-foreground">{[d.assetTag, [d.manufacturer, d.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <span className={cn("inline-flex items-center gap-1 text-xs font-medium", ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
                  {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}{ok ? "Nothing needs your attention" : `${d.openItems} item${d.openItems > 1 ? "s" : ""} need attention`}</span>
                <HealthBadge state={d.healthState} />
              </div>
            </div>
            <CardContent className="p-4 space-y-3">
              <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">Last report {d.lastSeenAt ? `${fmtDateTime(d.lastSeenAt)} (${ago(d.lastSeenAt)})` : "never"}
                <Link href="/chats" className="ml-auto inline-flex items-center gap-1 text-primary font-medium"><MessageSquare className="w-3.5 h-3.5" />Need help? Chats</Link></div>
              <AssetHealthPanel src={`/my-devices/${d.id}/health`} hideHeader />
            </CardContent>
          </Card>);
      })}
    </div>
  );
}
