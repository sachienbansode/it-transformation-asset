import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { confirmDialog } from "@/components/confirm-dialog";
import { Bell } from "lucide-react";

/* Admin › Settings — push notifications: on/off for everyone, coverage, and per-person devices (only IT can remove them). */
export function PushAdmin() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["push-admin"], queryFn: () => apiFetch<any>("/push/admin") });
  const [q, setQ] = useState(""); const [only, setOnly] = useState<"all" | "on" | "off">("all");
  if (!data) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["push-admin"] });
  async function toggle(v: boolean) {
    if (!v && !await confirmDialog("Switch push notifications off for everyone? People will still see notifications under the bell in IT Hub.", { title: "Push notifications", confirmText: "Switch off" })) return;
    try { await apiFetch("/push/admin", { method: "PUT", body: JSON.stringify({ enabled: v }) }); refresh(); toast({ title: `Push notifications ${v ? "on" : "off"} for everyone` }); }
    catch (e: any) { toast({ title: "Could not change", description: e.message, variant: "destructive" }); }
  }
  async function remove(u: any) {
    if (!await confirmDialog(`Stop push notifications on ${u.name}'s ${u.devices} device(s)? While push is on they will be asked to turn it on again.`, { title: "Remove devices", confirmText: "Remove" })) return;
    await apiFetch(`/push/admin/users/${u.userId}`, { method: "DELETE" }); refresh();
  }
  async function test(u: any) { const r = await apiFetch<any>(`/push/admin/test/${u.userId}`, { method: "POST" }); toast({ title: r.sent ? `Test sent to ${r.sent} device(s)` : "Not delivered — no working device" }); refresh(); }
  const list = data.users.filter((u: any) => (only === "all" || (only === "on" ? u.devices > 0 : u.devices === 0)) && (!q.trim() || `${u.name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <Card className="mt-4"><CardContent className="p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Bell className="w-5 h-5 text-primary" />
        <div className="flex-1"><div className="font-semibold">Push notifications</div>
          <div className="text-xs text-muted-foreground">Required for all users while on — people cannot switch them off; only IT can (here). {data.withPush} of {data.total} active users have at least one device.</div></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={data.enabled} onCheckedChange={toggle} />{data.enabled ? "On for everyone" : "Off for everyone"}</label>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <Input className="h-8 w-56" placeholder="Search person…" value={q} onChange={e => setQ(e.target.value)} />
        {(["all", "on", "off"] as const).map(k => <button key={k} onClick={() => setOnly(k)} className={`px-2.5 py-1 rounded-md text-xs border ${only === k ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"}`}>{k === "all" ? "Everyone" : k === "on" ? "Push on" : "Not on yet"}</button>)}
      </div>
      <div className="border rounded-lg divide-y text-xs max-h-72 overflow-y-auto">{list.map((u: any) => (
        <div key={u.userId} className="px-3 py-1.5 flex items-center gap-2 flex-wrap">
          <span className="font-medium">{u.name}</span><span className="text-muted-foreground">{u.email}</span>
          <span className="ml-auto">{u.devices ? `${u.devices} device${u.devices > 1 ? "s" : ""}${u.lastDelivered ? ` · last delivered ${fmtDateTime(u.lastDelivered)}` : ""}` : <span className="text-amber-600">not on yet</span>}</span>
          {u.devices > 0 && <><Button size="sm" variant="ghost" className="h-6" onClick={() => test(u)}>Test</Button><Button size="sm" variant="ghost" className="h-6 text-red-600" onClick={() => remove(u)}>Remove</Button></>}
        </div>))}</div>
    </CardContent></Card>
  );
}
