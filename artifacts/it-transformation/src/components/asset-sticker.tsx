import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { Printer, QrCode } from "lucide-react";

/* QR stickers. The QR holds a link to /a/<asset tag>: any phone camera opens the asset page
   (after sign-in), and the in-app scanner reads the same link. */

export function assetScanUrl(tag: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}/a/${encodeURIComponent(tag)}`;
}

export async function qrDataUrl(text: string, size = 256) {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 1, width: size, color: { dark: "#0F2A4A", light: "#FFFFFF" } });
}

const FORMATS = {
  label50x25: { name: "Label 50 × 25 mm (thermal label printer)", page: "50mm 25mm", w: 50, h: 25, perPage: 1 },
  label70x37: { name: "A4 sheet — 24 labels of 70 × 37 mm", page: "A4", w: 70, h: 37, perPage: 24 },
  card85x54: { name: "Card 85 × 54 mm", page: "85mm 54mm", w: 85, h: 54, perPage: 1 },
} as const;
type FormatKey = keyof typeof FORMATS;

const esc = (v: any) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function labelHtml(a: any, qr: string, org: string, f: typeof FORMATS[FormatKey]) {
  const small = f.h <= 25;
  const qrSize = small ? f.h - 4 : Math.min(f.h - 6, 30);
  return `<div class="lbl" style="width:${f.w}mm;height:${f.h}mm">
    <img src="${qr}" style="width:${qrSize}mm;height:${qrSize}mm">
    <div class="tx">
      <div class="org">${esc(org)}</div>
      <div class="tag" style="font-size:${small ? 11 : 15}pt">${esc(a.assetTag)}</div>
      <div class="nm">${esc(a.name)}</div>
      <div class="sn">SN ${esc(a.serialNumber || "—")}</div>
      ${small ? "" : `<div class="sn">${esc(a.type || "")}${a.purchaseDate ? " · " + esc(a.purchaseDate) : ""}</div><div class="ft">Property of ${esc(org)} · IT helpdesk</div>`}
    </div></div>`;
}

export async function printStickers(assets: any[], format: FormatKey = "label50x25") {
  if (!assets.length) return;
  const f = FORMATS[format];
  let org = "IT Asset";
  try { const cfg: any = await apiFetch("/config"); org = (cfg.appTagline?.split("—").pop() || cfg.appName || org).trim(); } catch { /* default */ }
  const qrs = await Promise.all(assets.map(a => qrDataUrl(assetScanUrl(a.assetTag), 300)));
  const labels = assets.map((a, i) => labelHtml(a, qrs[i], org, f)).join("");
  const sheet = f.perPage > 1;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Asset stickers (${assets.length})</title><style>
    @page{size:${f.page};margin:${sheet ? "10mm 0 0 0" : "0"}}
    *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#0F2A4A}
    .wrap{${sheet ? "display:grid;grid-template-columns:repeat(3,70mm);grid-auto-rows:37mm;justify-content:center" : ""}}
    .lbl{display:flex;align-items:center;gap:2mm;padding:1.5mm 2mm;overflow:hidden;${sheet ? "border:0.2mm dashed #ccd5e0" : "page-break-after:always"}}
    .tx{min-width:0;line-height:1.15}.org{font-size:5.5pt;text-transform:uppercase;letter-spacing:.4pt;color:#5E6B7A}
    .tag{font-family:"Courier New",monospace;font-weight:900;letter-spacing:.3pt}.nm{font-size:7pt;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${f.w - f.h}mm}
    .sn{font-size:6pt;color:#3A4756;font-family:"Courier New",monospace}.ft{font-size:5pt;color:#8592A0;margin-top:1mm}
  </style></head><body><div class="wrap">${labels}</div><script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script></body></html>`;
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

export function StickerDialog({ assets, onClose }: { assets: any[]; onClose: () => void }) {
  const [format, setFormat] = useState<FormatKey>(assets.length > 4 ? "label70x37" : "label50x25");
  const [qr, setQr] = useState("");
  const first = assets[0];
  useEffect(() => { if (first) qrDataUrl(assetScanUrl(first.assetTag), 220).then(setQr); }, [first?.assetTag]);
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><QrCode className="w-4 h-4 text-primary" />QR sticker{assets.length > 1 ? `s (${assets.length})` : ""}</DialogTitle>
          <DialogDescription>Scanning the QR with a phone camera opens this asset in the app (sign-in required).</DialogDescription>
        </DialogHeader>
        {first && (
          <div className="rounded-[12px] border bg-white p-3 flex items-center gap-3 text-[#0F2A4A]">
            {qr ? <img src={qr} alt="QR" className="w-24 h-24" /> : <div className="w-24 h-24 bg-muted rounded" />}
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Asset tag</div>
              <div className="font-mono font-black text-xl">{first.assetTag}</div>
              <div className="text-xs font-semibold truncate">{first.name}</div>
              <div className="text-[11px] font-mono text-slate-600">SN {first.serialNumber || "—"}</div>
              <div className="text-[10px] text-slate-400 mt-1 break-all">{assetScanUrl(first.assetTag)}</div>
            </div>
          </div>
        )}
        {assets.length > 1 && <p className="text-xs text-muted-foreground">Preview shows the first of {assets.length} stickers.</p>}
        <div>
          <div className="text-xs font-medium mb-1">Label format</div>
          <Select value={format} onValueChange={v => setFormat(v as FormatKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(FORMATS).map(([k, v]) => <SelectItem key={k} value={k}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex justify-start gap-2 pt-2 border-t">
          <Button className="gap-2" onClick={() => printStickers(assets, format)}><Printer className="w-4 h-4" />Print {assets.length > 1 ? `${assets.length} stickers` : "sticker"}</Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
