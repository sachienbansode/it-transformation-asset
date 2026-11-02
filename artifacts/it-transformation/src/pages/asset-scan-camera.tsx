import React, { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrScanner } from "@/components/qr-scanner";
import { useToast } from "@/hooks/use-toast";
import { ScanLine, Search } from "lucide-react";

/* Asset Dashboard › Scan QR: point the camera at a sticker (or type the tag) → opens /a/<tag>. */
export default function AssetScanCamera() {
  const [, nav] = useLocation(); const { toast } = useToast();
  const [tag, setTag] = useState("");
  const open = (raw: string) => {
    const t = String(raw || "").trim();
    // stickers hold a link …/a/<TAG>; a plain tag or serial also works
    const m = t.match(/\/a\/([^/?#]+)/); const code = decodeURIComponent(m ? m[1] : t);
    if (!code) return;
    if (!m && /^https?:\/\//i.test(t)) { toast({ title: "Not an IT Hub asset QR", description: t.slice(0, 80), variant: "destructive" }); return; }
    nav(`/a/${encodeURIComponent(code.toUpperCase())}`);
  };
  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ScanLine className="w-6 h-6 text-primary" />Scan asset QR</h1>
        <p className="text-sm text-muted-foreground">Point the camera at the QR sticker, or type the asset tag. The asset opens with its holder, status, history and actions.</p></div>
      <Card><CardContent className="p-3"><QrScanner onScan={open} /></CardContent></Card>
      <Card><CardContent className="p-3">
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); open(tag); }}>
          <Input value={tag} onChange={e => setTag(e.target.value)} placeholder="Asset tag, e.g. LAP-0005" className="h-10" />
          <Button type="submit" className="gap-1.5 h-10" disabled={!tag.trim()}><Search className="w-4 h-4" />Open</Button>
        </form>
      </CardContent></Card>
    </div>
  );
}
