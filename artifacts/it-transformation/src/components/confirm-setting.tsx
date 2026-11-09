import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { setConfirmChanges } from "@/components/confirm-dialog";
import { ShieldCheck } from "lucide-react";

/* Admin › Settings: ask in-app before every change (all modules). */
export function ConfirmChangesSetting() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["admin-settings"], queryFn: () => apiFetch<Record<string, unknown>>("/admin/settings") });
  const on = data?.["ui.confirmChanges"] !== false;
  async function set(v: boolean) {
    try { await apiFetch("/admin/settings", { method: "PUT", body: JSON.stringify({ "ui.confirmChanges": v }) }); setConfirmChanges(v); qc.invalidateQueries({ queryKey: ["admin-settings"] }); toast({ title: v ? "Changes are confirmed before saving" : "Confirmation before changes switched off" }); }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); }
  }
  return (
    <Card className="mt-4"><CardContent className="p-4 flex items-center gap-3 flex-wrap">
      <ShieldCheck className="w-5 h-5 text-primary" />
      <div className="flex-1 min-w-[240px]"><div className="font-semibold text-sm">Confirm every change</div>
        <div className="text-xs text-muted-foreground">Ask "Are you sure?" in the app before any create, update, assignment or delete is saved, in every module. Every change is recorded in the audit log either way.</div></div>
      <Switch checked={on} onCheckedChange={set} />
    </CardContent></Card>
  );
}
