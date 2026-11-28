/** 2.20 (ITH-208) — Admin › Settings › Modules: switch whole modules on / off. Off = gone for everyone (Super Admin too), data kept. */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { reasonDialog, confirmDialog } from "@/components/confirm-dialog";
import { Boxes } from "lucide-react";

export function ModulesSettings() {
  const { toast } = useToast();
  const { data = [], refetch } = useQuery<any[]>({ queryKey: ["modules"], queryFn: () => apiFetch("/modules") });
  async function toggle(m: any, on: boolean) {
    let reason = "";
    if (!on) { const r = await reasonDialog(`Switch off ${m.label}? It disappears from the menu for everyone — Super Admin included — until it is switched on again. Its data is kept.`, { title: `Switch off ${m.label}`, confirmText: "Switch off", destructive: true, label: "Reason", minLength: 5 }); if (!r) return; reason = r; }
    else if (!(await confirmDialog(`Switch on ${m.label}? People with access through their roles see it again.`, { title: `Switch on ${m.label}`, confirmText: "Switch on" }))) return;
    try { await apiFetch(`/modules/${m.key}`, { method: "PUT", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ enabled: on, reason }) }); toast({ title: `${m.label} switched ${on ? "on" : "off"}` }); await refetch(); window.dispatchEvent(new Event("ithub:modules-changed")); }
    catch (e: any) { toast({ title: "Not changed", description: e.message, variant: "destructive" }); }
  }
  return (
    <Card data-testid="modules-settings"><CardContent className="p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-2"><Boxes className="w-5 h-5 text-[#2D7FF9] mt-0.5" /><div><div className="font-semibold">Modules</div>
        <div className="text-xs text-muted-foreground">A switched-off module is not in the menu and cannot be opened by anyone — whatever their roles, Super Admin included. Nothing is deleted; switching it on brings everything back. Every change is in the audit trail.</div></div></div>
      <div className="divide-y rounded-lg border">
        {data.map((m: any) => (
          <div key={m.key} className="flex items-center gap-3 px-3 py-2.5" data-testid={`module-${m.key}`}>
            <div className="flex-1 min-w-0"><div className="text-sm font-medium">{m.label} {!m.enabled && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">OFF</span>}</div><div className="text-xs text-muted-foreground">{m.what}</div></div>
            <Switch checked={m.enabled} onCheckedChange={v => toggle(m, v)} data-testid={`module-switch-${m.key}`} />
          </div>
        ))}
      </div>
    </CardContent></Card>
  );
}
