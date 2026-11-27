import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Pencil, Crown, ChevronsUpDown, ChevronsDownUp, AlertCircle } from "lucide-react";

/* 2.08 (ITH-190) — Admin › Users › Org tree: people under their reporting manager. Anyone without a (valid, active)
 * manager is shown under the top Super Admin. Inactive people are left out. */
type U = { id: number; name: string; email: string; designation?: string; department?: string; role: string; isActive: boolean; status?: string; reportingManagerId?: number | null; accessRoles?: string[]; employeeCode?: string };
const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();

export function UserOrgTree({ users, q, deptLabel, onEdit }: { users: U[]; q: string; deptLabel: (d: string) => string; onEdit: (u: U) => void }) {
  const active = useMemo(() => users.filter(u => u.isActive && (u.status || "active") !== "inactive"), [users]);
  const byId = useMemo(() => new Map(active.map(u => [u.id, u])), [active]);
  // top of the tree: the Super Admin who is not the "initial" set-up account, else the first Super Admin
  const top = useMemo(() => { const a = active.filter(u => u.role === "admin" && !u.reportingManagerId); return a.find(u => !/^Initial Super Admin/i.test(u.designation || "")) || a[0] || active.find(u => u.role === "admin") || null; }, [active]);
  const parentOf = (u: U) => { const m = u.reportingManagerId && byId.get(u.reportingManagerId); return m && m.id !== u.id ? m.id : (top && u.id !== top.id ? top.id : null); };
  const kids = useMemo(() => { const k = new Map<number | null, U[]>(); for (const u of active) { const p = parentOf(u); k.set(p, [...(k.get(p) || []), u]); }
    for (const l of k.values()) l.sort((a, b) => (b.role === "admin" ? 1 : 0) - (a.role === "admin" ? 1 : 0) || a.name.localeCompare(b.name)); return k; }, [active, top]);
  const unmapped = active.filter(u => u.id !== top?.id && !(u.reportingManagerId && byId.get(u.reportingManagerId))).length;
  const roots = kids.get(null) || [];
  const [open, setOpen] = useState<Set<number>>(() => new Set(top ? [top.id] : []));
  const ql = q.trim().toLowerCase();
  const hit = (u: U) => !!ql && [u.name, u.email, u.designation, u.department && deptLabel(u.department), u.employeeCode].some(x => String(x || "").toLowerCase().includes(ql));
  const sub = useMemo(() => { const m = new Map<number, boolean>(); const walk = (u: U): boolean => { const r = hit(u) || (kids.get(u.id) || []).map(walk).some(Boolean); m.set(u.id, r); return r; }; roots.forEach(walk); return m; }, [kids, ql]);
  const isOpen = (id: number) => ql ? !!sub.get(id) : open.has(id);
  const allIds = active.filter(u => (kids.get(u.id) || []).length).map(u => u.id);
  const Node = ({ u, depth }: { u: U; depth: number }) => {
    const ch = kids.get(u.id) || []; if (ql && !sub.get(u.id)) return null;
    const noMgr = u.id !== top?.id && !(u.reportingManagerId && byId.get(u.reportingManagerId));
    return (
      <li>
        <div className={cn("group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50", hit(u) && "bg-amber-50 dark:bg-amber-500/10")} style={{ paddingLeft: 8 + depth * 22 }} data-testid={`tree-node-${u.email}`}>
          <button type="button" className="w-5 h-5 flex items-center justify-center text-muted-foreground" onClick={() => ch.length && setOpen(p => { const n = new Set(p); n.has(u.id) ? n.delete(u.id) : n.add(u.id); return n; })} disabled={!ch.length} aria-expanded={isOpen(u.id)}>
            {ch.length ? (isOpen(u.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-1.5 h-1.5 rounded-full bg-border" />}
          </button>
          <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", u.role === "admin" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300" : "bg-[#2D7FF9]/15 text-[#1B63D6]")}>{ini(u.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate flex items-center gap-1.5">{u.name}{u.role === "admin" && <Crown className="w-3.5 h-3.5 text-yellow-600" aria-label="Super Admin" />}
              {ch.length > 0 && <span className="rounded-full bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">{ch.length} report{ch.length > 1 ? "s" : ""}</span>}
              {noMgr && <span className="inline-flex items-center gap-0.5 text-[10px] font-normal text-amber-700"><AlertCircle className="w-3 h-3" />no manager set</span>}</div>
            <div className="text-[11px] text-muted-foreground truncate">{[u.designation, u.department && deptLabel(u.department)].filter(Boolean).join(" · ") || u.email}</div>
          </div>
          <div className="hidden md:flex flex-wrap gap-1 max-w-[40%] justify-end">{(u.accessRoles || []).filter(r => r !== "Employee").map(r => <span key={r} className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{r}</span>)}</div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-60 group-hover:opacity-100" onClick={() => onEdit(u)} title="Edit (set reporting manager)"><Pencil className="h-3.5 w-3.5" /></Button>
        </div>
        {ch.length > 0 && isOpen(u.id) && <ul>{ch.map(c => <Node key={c.id} u={c} depth={depth + 1} />)}</ul>}
      </li>
    );
  };
  return (
    <div className="rounded-lg border p-2 space-y-2" data-testid="org-tree">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!!ql} onClick={() => setOpen(new Set(allIds))}><ChevronsUpDown className="w-3.5 h-3.5" />Expand all</Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!!ql} onClick={() => setOpen(new Set())}><ChevronsDownUp className="w-3.5 h-3.5" />Collapse all</Button>
        <span className="ml-auto text-[11px] text-muted-foreground">{active.length} active people{unmapped ? ` · ${unmapped} without a reporting manager (shown under ${top?.name || "Super Admin"})` : ""}</span>
      </div>
      {!roots.length ? <p className="p-6 text-center text-sm text-muted-foreground">No active users.</p> : <ul>{roots.map(r => <Node key={r.id} u={r} depth={0} />)}</ul>}
    </div>
  );
}
