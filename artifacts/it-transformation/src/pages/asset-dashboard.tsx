import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { apiFetch } from "@/lib/api";
import { inr, inrShort, fmtDate, daysText } from "@/components/asset-finance";
import { Monitor, Wallet, ShieldCheck, KeyRound, AlertTriangle, AlertCircle, Info, ArrowRight, ScanLine, HardDrive, FileText, ClipboardList, History, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/date";

/* Asset Dashboard — one screen for the IT asset manager: what we have, where it is, what it is worth,
   what is covered, and what needs action. All numbers come from GET /asset-dashboard. */

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** Horizontal magnitude bars — one hue, value labels in text ink, hover title per row. */
function BarList({ items, total, empty = "No data yet", href }: { items: { name: string; value: number }[]; total?: number; empty?: string; href?: (name: string) => string }) {
  if (!items.length || items.every(i => !i.value)) return <div className="text-sm text-muted-foreground py-6 text-center">{empty}</div>;
  const max = Math.max(...items.map(i => i.value), 1);
  const sum = total ?? items.reduce((t, i) => t + i.value, 0);
  return (
    <div className="space-y-1.5">
      {items.map(i => {
        const row = (
          <div className="group grid grid-cols-[minmax(84px,38%)_1fr_auto] items-center gap-2 text-sm rounded-[6px] px-1 py-0.5 hover:bg-accent/50" title={`${i.name}: ${i.value} (${sum ? Math.round((i.value / sum) * 100) : 0}%)`}>
            <span className={cn("truncate", i.name === "Not set" || i.name === "Unknown" ? "text-muted-foreground italic" : "text-foreground")}>{i.name}</span>
            <div className="h-2.5 rounded-[4px] bg-muted overflow-hidden"><div className="h-full rounded-[4px] bg-primary/80 group-hover:bg-primary transition-colors" style={{ width: `${i.value ? Math.max(2, (i.value / max) * 100) : 0}%` }} /></div>
            <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">{i.value}</span>
          </div>
        );
        return href ? <Link key={i.name} href={href(i.name)}>{row}</Link> : <div key={i.name}>{row}</div>;
      })}
    </div>
  );
}

const LEVEL = {
  high: { icon: AlertCircle, cls: "text-red-600 bg-red-50 dark:bg-red-400/10", label: "Urgent" },
  medium: { icon: AlertTriangle, cls: "text-amber-600 bg-amber-50 dark:bg-amber-400/10", label: "Soon" },
  low: { icon: Info, cls: "text-blue-600 bg-blue-50 dark:bg-blue-400/10", label: "To do" },
} as const;

function Mini({ k, v, cls }: { k: string; v: React.ReactNode; cls?: string }) {
  return <div><div className="text-muted-foreground">{k}</div><div className={cn("font-semibold text-base", cls)}>{v}</div></div>;
}

export default function AssetDashboard() {
  const { data: d, isLoading } = useQuery({ queryKey: ["asset-dashboard"], queryFn: () => apiFetch<any>("/asset-dashboard") });

  if (isLoading || !d) return <div className="py-20 text-center text-sm text-muted-foreground">Loading dashboard…</div>;
  const inv = d.inventory, w = d.warranty, fin = d.finance, lic = d.licenses, ho = d.handovers;
  const noWarrantyData = inv.total > 0 && w.unknown === inv.total && !w.underAmc;
  const coveredPct = inv.total ? Math.round((w.covered / inv.total) * 100) : 0;
  const empty = inv.all === 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset Dashboard</h1>
          <p className="text-sm text-muted-foreground">As of {fmtDate(d.asOf)} · {d.fyLabel}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/asset-scan"><Button variant="outline" size="sm" className="gap-1.5"><ScanLine className="w-4 h-4" />Scan QR</Button></Link>
          <Link href="/asset-registry"><Button size="sm" className="gap-1.5"><HardDrive className="w-4 h-4" />Asset Registry</Button></Link>
        </div>
      </div>

      {empty && <Card><CardContent className="py-12 text-center space-y-3">
        <Monitor className="w-10 h-10 mx-auto text-muted-foreground/50" />
        <div className="font-semibold">No assets yet</div>
        <p className="text-sm text-muted-foreground">Upload your asset register from the Asset Registry to get started.</p>
        <Link href="/asset-registry"><Button size="sm">Go to Asset Registry</Button></Link>
      </CardContent></Card>}

      {!empty && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/asset-registry"><div className="cursor-pointer"><StatCard icon={Monitor} label="Assets in service" value={inv.total} sub={`${inv.deployed} deployed · ${inv.inStock} in stock · ${inv.maintenance} in repair`} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" /></div></Link>
          <Link href="/asset-depreciation"><div className="cursor-pointer"><StatCard icon={Wallet} label="Book value" value={inrShort(fin.bookValue)} sub={fin.missingFinance ? `${fin.missingFinance} assets without cost / date` : `cost ${inrShort(fin.cost)} · ${inrShort(fin.depreciationFy)} dep. this FY`} iconBg="bg-[#2D7FF9]/20" iconColor="text-[#2D7FF9]" borderColor="border-l-[#2D7FF9]" /></div></Link>
          <Link href="/asset-contracts?tab=warranty"><div className="cursor-pointer"><StatCard icon={ShieldCheck} label="Warranty / AMC cover" value={noWarrantyData ? "—" : `${coveredPct}%`} sub={noWarrantyData ? "warranty dates not recorded" : `${w.notCovered} not covered · ${w.unknown} unknown`} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" /></div></Link>
          <Link href="/asset-licenses?tab=compliance"><div className="cursor-pointer"><StatCard icon={KeyRound} label="License compliance" value={lic.licenses ? `${lic.score}%` : "—"} sub={lic.licenses ? `${lic.underLicensed + lic.expiredInUse} issues · exposure ${inrShort(lic.exposure)}` : "no licenses recorded"} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" valueColor={lic.licenses && lic.score < 100 ? "text-amber-600" : undefined} /></div></Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title={`Needs attention (${d.attention.length})`} className="lg:col-span-2">
            {!d.attention.length ? <div className="text-sm text-muted-foreground py-6 text-center">Nothing needs action right now.</div> : (
              <div className="divide-y">
                {d.attention.map((a: any, i: number) => {
                  const L = LEVEL[a.level as keyof typeof LEVEL];
                  return (
                    <Link key={i} href={a.href}>
                      <div className="flex items-center gap-3 py-2.5 px-1 hover:bg-accent/40 rounded-[8px] cursor-pointer">
                        <span className={cn("w-8 h-8 rounded-full grid place-items-center shrink-0", L.cls)}><L.icon className="w-4 h-4" /></span>
                        <div className="flex-1 min-w-0 text-sm"><span className="font-semibold text-foreground tabular-nums">{a.count}</span> <span className="text-foreground">{a.text}</span></div>
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">{L.label}</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>
          <Panel title="Handovers" action={<Link href="/asset-allocations" className="text-xs text-primary">Open</Link>}>
            <div className="grid grid-cols-2 gap-3">
              {([["Active", ho.active, ""], ["Ack pending", ho.pendingAck, ho.pendingAck ? "text-amber-600" : ""], ["Issued this month", ho.issuedThisMonth, ""], ["Returned this month", ho.returnedThisMonth, ""], ["Overdue returns", ho.overdueReturns, ho.overdueReturns ? "text-red-600" : ""], ["In repair", inv.maintenance, ""]] as [string, number, string][]).map(([k, v, c]) => (
                <div key={k} className="rounded-[10px] border px-3 py-2"><div className="text-[11px] text-muted-foreground">{k}</div><div className={cn("text-lg font-semibold tabular-nums", c || "text-foreground")}>{v}</div></div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Panel title="By status"><BarList items={inv.byStatus} total={inv.all} /></Panel>
          <Panel title="By type"><BarList items={inv.byType} /></Panel>
          <Panel title="By location"><BarList items={inv.byLocation} /></Panel>
          <Panel title="Age (refresh planning)"><BarList items={inv.age} empty="Purchase dates not recorded" />
            {inv.age.find((a: any) => a.name === "Unknown")?.value > 0 && <p className="text-[11px] text-muted-foreground mt-2">Unknown = no purchase date. <Link href="/asset-depreciation?tab=missing" className="text-primary">Fill them in</Link>.</p>}
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Contract renewals (next 90 days)" action={<Link href="/asset-contracts" className="text-xs text-primary">All contracts</Link>}>
            {!d.contracts.upcoming.length ? <div className="text-sm text-muted-foreground py-4 text-center">{d.contracts.active ? "No renewals due in 90 days." : "No contracts recorded yet."}</div> : (
              <div className="divide-y">{d.contracts.upcoming.map((c: any) => (
                <div key={c.id} className="py-2 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1"><div className="truncate text-foreground">{c.title}</div><div className="text-[11px] text-muted-foreground">{c.contractNo} · {c.vendorName || c.contractType} · {inr(c.value)}</div></div>
                  <div className={cn("text-xs text-right shrink-0", c.daysLeft <= 30 ? "text-amber-600 font-semibold" : "text-muted-foreground")}>{fmtDate(c.endDate)}<div>{daysText(c.daysLeft)}</div></div>
                </div>
              ))}</div>
            )}
            <div className="mt-3 pt-3 border-t grid grid-cols-3 text-center text-xs">
              <Mini k="Active" v={d.contracts.active} /><Mini k="Renewal due" v={d.contracts.expiring} cls={d.contracts.expiring ? "text-amber-600" : ""} /><Mini k="Value" v={inrShort(d.contracts.value)} />
            </div>
          </Panel>
          <Panel title="Warranty ending, no AMC" action={<Link href="/asset-contracts?tab=warranty" className="text-xs text-primary">Coverage</Link>}>
            {!w.expiringNoAmc.length ? <div className="text-sm text-muted-foreground py-4 text-center">{noWarrantyData ? "Warranty dates not recorded yet." : "None in the next 90 days."}</div> : (
              <div className="divide-y">{w.expiringNoAmc.map((a: any) => (
                <div key={a.id} className="py-2 text-sm flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1"><div className="truncate"><span className="font-mono text-xs text-primary font-semibold">{a.assetTag}</span> {a.name}</div><div className="text-[11px] text-muted-foreground truncate">{a.ownerName || "—"}</div></div>
                  <div className={cn("text-xs text-right shrink-0", a.days <= 30 ? "text-amber-600 font-semibold" : "text-muted-foreground")}>{fmtDate(a.warrantyExpiry)}<div>{daysText(a.days)}</div></div>
                </div>
              ))}{w.expiringNoAmcCount > w.expiringNoAmc.length && <div className="pt-2 text-xs text-muted-foreground">+{w.expiringNoAmcCount - w.expiringNoAmc.length} more</div>}</div>
            )}
            <div className="mt-3 pt-3 border-t grid grid-cols-3 text-center text-xs">
              <Mini k="In warranty" v={w.inWarranty + w.expiring90} /><Mini k="Under AMC" v={w.underAmc} /><Mini k="Expired" v={w.expired} cls={w.expired ? "text-red-600" : ""} />
            </div>
          </Panel>
          <Panel title="Spare pool (in stock)" action={<Link href="/asset-registry" className="text-xs text-primary">Registry</Link>}>
            <BarList items={inv.spare} empty="Nothing in stock — every asset is issued." />
            <div className="mt-3 pt-3 border-t grid grid-cols-3 text-center text-xs">
              <Mini k="Open audits" v={d.audits.open} />
              <Mini k="Last audit" v={<span className="text-sm">{d.audits.last ? fmtDate(d.audits.last.completedAt) : "—"}</span>} />
              <Mini k="Missing then" v={d.audits.last?.summary?.Missing ?? "—"} cls={d.audits.last?.summary?.Missing ? "text-red-600" : ""} />
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="By department (top 10)"><BarList items={inv.byDepartment} /></Panel>
          <Panel title="Recent activity" className="lg:col-span-2">
            {!d.activity.length ? <div className="text-sm text-muted-foreground py-4 text-center">No activity yet.</div> : (
              <div className="divide-y">{d.activity.map((t: any) => (
                <div key={t.id} className="py-2 flex items-start gap-3 text-sm">
                  <History className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1"><span className="font-mono text-xs text-primary font-semibold">{t.assetTag || "—"}</span> <span className="font-medium">{t.action}</span> <span className="text-muted-foreground">— {t.comment || t.notes || ""}</span></div>
                  <div className="text-[11px] text-muted-foreground text-right shrink-0">{t.userName}<div>{fmtDateTime(t.createdAt)}</div></div>
                </div>
              ))}</div>
            )}
          </Panel>
        </div>
        {inv.disposed > 0 && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" />{inv.disposed} disposed / lost asset(s) are excluded from these counts.</p>}
      </>}
    </div>
  );
}
