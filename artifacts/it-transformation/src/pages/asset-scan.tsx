import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { StatusPill, AckPill, LifecycleButtons, AssetTrail } from "@/components/asset-lifecycle";
import { StickerDialog } from "@/components/asset-sticker";
import { QrCode, AlertTriangle, ShieldCheck, ShieldAlert, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// Opened by scanning an asset's QR sticker: /a/<asset tag>
export default function AssetScan() {
  const { tag } = useParams<{ tag: string }>();
  const { isAdmin, canAccess } = useAuth();
  const [sticker, setSticker] = useState(false);
  const { data: a, isLoading, error, refetch } = useQuery({ queryKey: ["asset-by-tag", tag], queryFn: () => apiFetch<any>(`/assets/by-tag/${encodeURIComponent(tag)}`), retry: false });
  const canSee = isAdmin || canAccess("asset_registry");

  if (isLoading) return <div className="py-16 text-center text-muted-foreground">Looking up {tag}…</div>;
  if (error || !a) return (
    <Card className="max-w-lg mx-auto"><CardContent className="py-12 text-center space-y-2">
      <AlertTriangle className="w-8 h-8 mx-auto text-amber-500" />
      <div className="font-semibold text-foreground">Asset {tag} not found</div>
      <div className="text-sm text-muted-foreground">The sticker may be old or the asset was removed. Report it to IT.</div>
    </CardContent></Card>
  );
  const today = new Date().toISOString().slice(0, 10);
  const warrantyOk = a.warrantyExpiry && a.warrantyExpiry >= today;
  const h = a.activeHandover;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><QrCode className="w-4 h-4" />Scanned asset</div>
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="font-mono font-black text-2xl text-foreground">{a.assetTag}</div>
              <div className="text-base font-semibold text-foreground">{a.name}</div>
              <div className="text-sm text-muted-foreground">{a.type} · SN {a.serialNumber || "—"}</div>
            </div>
            <StatusPill status={a.status} />
          </div>
          {!a.isActive && <div className="rounded-[10px] border border-red-500/30 bg-red-50 dark:bg-red-400/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">This asset has been deleted from the register.</div>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Issued to</div><div className="font-medium text-foreground">{a.ownerName || "—"}</div></div>
            <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Department</div><div className="font-medium text-foreground">{a.department || "—"}</div></div>
            <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Location</div><div className="font-medium text-foreground">{a.location || "—"}</div></div>
            <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Vendor</div><div className="font-medium text-foreground">{a.vendorName || "—"}</div></div>
            <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Purchased</div><div className="font-medium text-foreground">{fmt(a.purchaseDate)}</div></div>
            <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Warranty</div>
              <div className={cn("font-medium flex items-center gap-1", a.warrantyExpiry ? (warrantyOk ? "text-emerald-600" : "text-red-600") : "text-foreground")}>
                {a.warrantyExpiry ? (warrantyOk ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />) : null}{a.warrantyExpiry ? `${warrantyOk ? "till" : "expired"} ${fmt(a.warrantyExpiry)}` : "—"}</div></div>
          </div>
          {h && <div className="rounded-[10px] border p-3 text-sm flex items-center justify-between gap-2 flex-wrap">
            <span>Handover <b className="text-foreground">{h.handoverNo}</b> · since {fmt(h.startDate)} · {h.allocationType}</span><AckPill status={h.ackStatus} />
          </div>}
          {a.configuration && <div className="text-sm"><span className="text-muted-foreground">Configuration: </span>{a.configuration}</div>}
          {isAdmin && a.isActive && <div className="rounded-[10px] border p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Lifecycle</div>
            <LifecycleButtons asset={a} onDone={() => refetch()} />
          </div>}
          <div className="flex gap-2 flex-wrap">
            {canSee && <Link href="/asset-registry"><Button variant="outline" size="sm">Open Asset Registry</Button></Link>}
            {isAdmin && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSticker(true)}><Tag className="w-4 h-4" />Reprint sticker</Button>}
          </div>
        </CardContent>
      </Card>
      {canSee && <Card><CardContent className="p-5"><h3 className="text-sm font-semibold text-foreground mb-3">History & comments</h3><AssetTrail assetId={a.id} assetTag={a.assetTag} /></CardContent></Card>}
      {sticker && <StickerDialog assets={[a]} onClose={() => setSticker(false)} />}
    </div>
  );
}
