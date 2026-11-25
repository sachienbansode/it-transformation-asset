import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { PlugZap } from "lucide-react";
import { useIntegrationTest, TestButton, TestResult } from "@/components/integration-test";

/* r100 (ITH-161) — Admin › Integrations: every connection IT Hub uses, with what it is for, its status and a Test button. */
function Row({ it }: { it: any }) {
  const t = useIntegrationTest(); const [to, setTo] = useState("");
  return (
    <Card data-testid={`integration-${it.kind}`}><CardContent className="p-4 space-y-2">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[220px]"><div className="font-semibold text-sm">{it.name}</div><div className="text-xs text-muted-foreground">{it.what}</div>
          <div className="text-xs mt-1">Status: <b>{it.status}</b>{it.setup && <> · <Link href={it.setup} className="text-primary underline">set up</Link></>}</div></div>
        <div className="flex flex-wrap items-center gap-2">
          {it.kind === "mail" && <Input className="h-8 w-56" placeholder="Also send a test email to…" value={to} onChange={e => setTo(e.target.value)} />}
          <TestButton busy={t.busy} onClick={() => t.run({ kind: it.kind, to })} label={it.kind === "push" ? "Send test notification" : "Test"} testId={`test-${it.kind}`} />
        </div>
      </div>
      <TestResult r={t.r} />
    </CardContent></Card>
  );
}
export default function AdminIntegrations() {
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ["integrations"], queryFn: () => apiFetch("/admin/integrations") });
  return (
    <div className="space-y-4 max-w-5xl">
      <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><PlugZap className="w-6 h-6 text-primary" />Integrations</h1>
        <p className="text-sm text-muted-foreground">Every connection IT Hub uses, with a test. Tests do not change any setting; email tests send only when you give an address.</p></div>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : data.map(it => <Row key={it.kind} it={it} />)}
    </div>
  );
}
