import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useItsmConfig } from "@/hooks/use-itsm-config";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

/* 2.05 (ITH-179) — ITSM Setup › Priority matrix: impact (rows) × urgency (columns) → incident priority. */
const PR = ["Critical", "High", "Medium", "Low"];
const TONE: Record<string, string> = { Critical: "bg-red-600 text-white", High: "bg-orange-500 text-white", Medium: "bg-amber-300 text-amber-950", Low: "bg-emerald-500 text-white" };
export function PriorityMatrixEditor() {
  const cfg = useItsmConfig(); const { isAdmin } = useAuth(); const { toast } = useToast(); const qc = useQueryClient();
  const impacts = cfg["itsm.impactLevels"], urgencies = cfg["itsm.urgencyLevels"];
  const [m, setM] = useState<Record<string, Record<string, string>>>({}); const [busy, setBusy] = useState(false);
  useEffect(() => setM(JSON.parse(JSON.stringify(cfg["itsm.priorityMatrix"] || {}))), [cfg]);
  const val = (i: string, u: string) => m[i]?.[u] || "";
  async function save() {
    setBusy(true);
    try { await apiFetch("/itsm-config", { method: "PUT", headers: { "X-No-Confirm": "1" }, body: JSON.stringify({ "itsm.priorityMatrix": m }) }); toast({ title: "Priority matrix saved", description: "New and re-classified incidents use it." }); qc.invalidateQueries({ queryKey: ["itsm-config"] }); }
    catch (e: any) { toast({ title: "Not saved", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  }
  return (
    <Card data-testid="priority-matrix"><CardContent className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">An incident's priority is worked out from its <b>impact</b> (who is affected) and <b>urgency</b> (how soon it must be fixed). The service desk can still set a priority by hand on a ticket. Priority decides the SLA.</p>
      <div className="overflow-x-auto"><table className="text-sm border-collapse min-w-[520px]">
        <thead><tr><th className="p-2 text-left text-xs text-muted-foreground">Impact ↓ / Urgency →</th>{urgencies.map(u => <th key={u} className="p-2 text-xs font-semibold">{u}</th>)}</tr></thead>
        <tbody>{impacts.map(i => <tr key={i} className="border-t"><td className="p-2 font-medium whitespace-nowrap">{i}</td>{urgencies.map(u => <td key={u} className="p-1.5">
          <Select disabled={!isAdmin} value={val(i, u)} onValueChange={v => setM({ ...m, [i]: { ...(m[i] || {}), [u]: v } })}>
            <SelectTrigger className={cn("h-8 w-[120px] border-0 font-semibold", TONE[val(i, u)] || "bg-muted")}><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{PR.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select></td>)}</tr>)}</tbody>
      </table></div>
      {isAdmin && <div className="flex justify-end"><Button size="sm" disabled={busy} onClick={save}>Save matrix</Button></div>}
    </CardContent></Card>
  );
}
