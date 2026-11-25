import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { Loader2, PlugZap } from "lucide-react";

/* r100 (ITH-161) — "Test" button + ✓ / ✕ result list, used for every integration. */
export function useIntegrationTest() {
  const [busy, setBusy] = useState(false); const [r, setR] = useState<any>(null);
  const run = async (body: any) => {
    setBusy(true); setR(null);
    try { setR(await apiFetch("/admin/integrations/test", { method: "POST", headers: { "X-No-Confirm": "1" }, body: JSON.stringify(body) })); }
    catch (e: any) { setR({ ok: false, steps: [{ step: "Test", ok: false, detail: e.message }] }); }
    finally { setBusy(false); }
  };
  return { busy, r, run, clear: () => setR(null) };
}
export function TestButton({ busy, onClick, label = "Test connection", testId }: { busy: boolean; onClick: () => void; label?: string; testId?: string }) {
  return <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={onClick} data-testid={testId}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}{busy ? "Testing…" : label}</Button>;
}
export function TestResult({ r }: { r: any }) {
  if (!r) return null;
  return (
    <div className="space-y-1 rounded-md border p-2.5" data-testid="integration-result">
      <div className={r.ok ? "text-sm font-semibold text-emerald-600" : "text-sm font-semibold text-red-600"}>{r.ok ? "Working" : "Needs attention"}</div>
      {(r.steps || []).map((s: any, i: number) => <div key={i} className="text-xs flex gap-2"><span className={s.ok ? "text-emerald-600" : "text-red-600"}>{s.ok ? "✓" : "✕"}</span><span className="font-medium min-w-[200px]">{s.step}</span><span className="text-muted-foreground break-all">{s.detail}</span></div>)}
    </div>
  );
}
