import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { AssetHealthPanel, HealthBadge } from "@/components/asset-health";
import { Laptop } from "lucide-react";

/* My Workspace › My Device — the employee's own computer(s): health, what needs attention, usage. Opened from the tray icon. */
export default function MyDevice() {
  const { data: list = [], isLoading } = useQuery({ queryKey: ["my-devices"], queryFn: () => apiFetch<any[]>("/my-devices"), refetchInterval: 60_000 });
  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><img src={`${import.meta.env.BASE_URL}niytri-agent.png`} alt="" className="w-7 h-7 rounded-md" />My Device</h1>
        <p className="text-sm text-muted-foreground">Health of your computer as reported by the IT Hub agent, and anything that needs attention. Items clear on their own when your computer reports them fixed; IT is already informed of anything critical.</p>
      </div>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && !list.length && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground"><Laptop className="w-8 h-8 mx-auto mb-2 opacity-40" />No computer with the IT Hub agent is linked to you yet.</CardContent></Card>}
      {list.map((d: any) => (
        <Card key={d.id}><CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap"><Laptop className="w-5 h-5 text-primary" /><span className="font-semibold">{d.hostname}</span><span className="text-xs text-muted-foreground">{[d.assetTag, d.model].filter(Boolean).join(" · ")}</span><span className="ml-auto"><HealthBadge state={d.healthState} /></span></div>
          <div className="text-xs text-muted-foreground">Last report {d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : "never"} · {d.openItems ? `${d.openItems} item(s) need attention` : "nothing needs attention"}</div>
          <AssetHealthPanel src={`/my-devices/${d.id}/health`} />
        </CardContent></Card>))}
    </div>
  );
}
