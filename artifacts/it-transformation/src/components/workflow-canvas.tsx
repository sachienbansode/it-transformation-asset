import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Play, Flag, CircleDot, CheckSquare, GitBranch, UserPlus, Bell, Square } from "lucide-react";

/* ITH-101 — drag-and-drop workflow canvas (no external library).
   Drag a step from the palette onto the canvas, drag steps to move them, drag from a step's right-hand dot to another
   step to connect them. Click a step or a connection to edit it; Delete removes the selection. */

export type WNode = { id: string; type: "start" | "stage" | "approval" | "condition" | "assign" | "notify" | "end"; label?: string; x: number; y: number; config?: any };
export type WEdge = { id: string; from: string; to: string; label?: string; outcome?: string };
export type WDef = { nodes: WNode[]; edges: WEdge[] };
export type Sel = { kind: "node" | "edge"; id: string } | null;

export const NODE_TYPES: { type: WNode["type"]; label: string; icon: React.ElementType; cls: string; help: string }[] = [
  { type: "start", label: "Start", icon: Play, cls: "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40", help: "Where a new ticket enters" },
  { type: "stage", label: "Stage (status)", icon: CircleDot, cls: "border-blue-400 bg-blue-50 dark:bg-blue-950/40", help: "A ticket status; people move it on" },
  { type: "approval", label: "Approval", icon: CheckSquare, cls: "border-amber-400 bg-amber-50 dark:bg-amber-950/40", help: "Approved / rejected by people, a team or a role" },
  { type: "condition", label: "Condition", icon: GitBranch, cls: "border-violet-400 bg-violet-50 dark:bg-violet-950/40", help: "Yes / no on priority, category …" },
  { type: "assign", label: "Assign", icon: UserPlus, cls: "border-cyan-400 bg-cyan-50 dark:bg-cyan-950/40", help: "Set team and / or person" },
  { type: "notify", label: "Notify", icon: Bell, cls: "border-pink-400 bg-pink-50 dark:bg-pink-950/40", help: "In-app notice to people" },
  { type: "end", label: "End", icon: Flag, cls: "border-slate-400 bg-slate-100 dark:bg-slate-800", help: "Finishes the workflow" },
];
export const typeOf = (t: string) => NODE_TYPES.find(n => n.type === t) || NODE_TYPES[1];
const W = 176, H = 62, GRID = 20, CW = 2600, CH = 1600;
const snap = (v: number) => Math.max(0, Math.round(v / GRID) * GRID);
export const OUTCOMES: Record<string, string[]> = { condition: ["yes", "no"], approval: ["approved", "rejected"], stage: ["next", "timeout"], start: ["next"], assign: ["next"], notify: ["next"], end: [] };
const OUT_CLS: Record<string, string> = { yes: "#16a34a", no: "#dc2626", approved: "#16a34a", rejected: "#dc2626", timeout: "#d97706", next: "#64748b" };
export function nodeSummary(n: WNode) {
  const c = n.config || {};
  if (n.type === "stage") return c.status ? `Status: ${c.status}${c.timeoutHours ? ` · ${c.timeoutHours} h limit` : ""}` : "Choose a status";
  if (n.type === "approval" && ["reporting_manager", "assigned_team", "itsm_admins", "asset_admins"].includes(c.approverType)) return ({ reporting_manager: Number(c.level) === 2 ? "Manager's manager" : "Reporting manager", assigned_team: "Ticket's team", itsm_admins: "ITSM Admins", asset_admins: "IT Asset Admins" } as any)[c.approverType];
  if (n.type === "approval") return c.approverType === "users" ? `${(c.userNames || c.userIds || []).length} person(s)` : c.approverType === "team" ? (c.team ? `Team ${c.team}` : "Choose team") : c.approverType === "role" ? (c.roleName || "Choose role") : "Choose approvers";
  if (n.type === "condition") return c.field ? `${c.field} ${c.op === "neq" ? "is not" : c.op === "contains" ? "contains" : c.op === "empty" ? "is empty" : "is"} ${c.op === "empty" ? "" : c.value || "…"}` : "Choose field";
  if (n.type === "assign") return [c.team && `Team ${c.team}`, c.user].filter(Boolean).join(" · ") || "Choose team / person";
  if (n.type === "notify") return (c.to || []).length ? `To ${(c.to || []).join(", ")}` : "Choose who";
  if (n.type === "end") return c.status ? `Final status: ${c.status}` : "Finish";
  return "";
}

export function WorkflowCanvas({ def, onChange, sel, onSel, readOnly, highlight, current, visited, compact }: {
  def: WDef; onChange?: (d: WDef) => void; sel?: Sel; onSel?: (s: Sel) => void; readOnly?: boolean;
  highlight?: string[]; current?: string | null; visited?: string[]; compact?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [link, setLink] = useState<{ from: string; x: number; y: number } | null>(null);
  const pt = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left + box.current!.scrollLeft, y: e.clientY - r.top + box.current!.scrollTop }; };
  const set = (d: WDef) => onChange?.(d);
  const newId = (p: string) => `${p}${Math.random().toString(36).slice(2, 7)}`;

  useEffect(() => {   // show the current step on the ticket map
    const n = current ? def.nodes.find(x => x.id === current) : null; if (n && box.current) box.current.scrollTo({ left: Math.max(0, n.x - 200), top: Math.max(0, n.y - 80) });
  }, [current]);
  useEffect(() => {
    if (readOnly || !sel) return;
    const k = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && !(e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]")) { e.preventDefault(); remove(def, sel, set); onSel?.(null); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [sel, def, readOnly]);

  function onDrop(e: React.DragEvent) {
    if (readOnly) return; const t = e.dataTransfer.getData("text/wf-node") as WNode["type"]; if (!t) return; e.preventDefault();
    if (t === "start" && def.nodes.some(n => n.type === "start")) return;
    const p = pt(e); const n: WNode = { id: newId(t.slice(0, 2)), type: t, label: typeOf(t).label.replace(" (status)", ""), x: snap(p.x - W / 2), y: snap(p.y - H / 2), config: t === "notify" ? { to: ["requester"] } : t === "condition" ? { op: "eq" } : t === "approval" ? { approverType: "team" } : {} };
    set({ ...def, nodes: [...def.nodes, n] }); onSel?.({ kind: "node", id: n.id });
  }
  function move(e: React.PointerEvent) {
    if (drag) { const p = pt(e); set({ ...def, nodes: def.nodes.map(n => n.id === drag.id ? { ...n, x: snap(p.x - drag.dx), y: snap(p.y - drag.dy) } : n) }); }
    else if (link) { const p = pt(e); setLink({ ...link, x: p.x, y: p.y }); }
  }
  function up(e: React.PointerEvent) {
    if (link) {
      const p = pt(e); const target = def.nodes.find(n => p.x >= n.x && p.x <= n.x + W && p.y >= n.y && p.y <= n.y + H && n.id !== link.from);
      const src = def.nodes.find(n => n.id === link.from);
      if (target && src && target.type !== "start") {
        const used = def.edges.filter(x => x.from === src.id).map(x => x.outcome || "next");
        const opts = OUTCOMES[src.type] || ["next"]; const outcome = src.type === "stage" ? "next" : opts.find(o => !used.includes(o)) || opts[0];
        if (!(src.type === "start" && used.length) && !def.edges.some(x => x.from === src.id && x.to === target.id && (x.outcome || "next") === outcome)) {
          const ed: WEdge = { id: newId("e"), from: src.id, to: target.id, outcome, label: src.type === "stage" ? (target.label || "") : "" };
          set({ ...def, edges: [...def.edges, ed] }); onSel?.({ kind: "edge", id: ed.id });
        }
      }
    }
    setDrag(null); setLink(null);
  }
  const path = (a: WNode, b: WNode) => {
    const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
    if (x2 > x1 + 20) { const mx = (x1 + x2) / 2; return { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, lx: mx, ly: (y1 + y2) / 2 }; }
    const dy = Math.abs(y2 - y1) < 40 ? 90 : 0; const top = Math.min(y1, y2) - dy - 30;   // backward / same-column: loop over the top
    return { d: `M${x1},${y1} C${x1 + 80},${y1} ${x1 + 80},${top} ${(x1 + x2) / 2},${top} S${x2 - 80},${y2} ${x2},${y2}`, lx: (x1 + x2) / 2, ly: top };
  };
  const maxX = Math.max(CW, ...def.nodes.map(n => n.x + W + 200)), maxY = Math.max(compact ? 300 : CH, ...def.nodes.map(n => n.y + H + 160));
  return (
    <div ref={box} onDragOver={e => !readOnly && e.preventDefault()} onDrop={onDrop} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
      onPointerDown={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.bg) onSel?.(null); }}
      className={cn("relative overflow-auto rounded-lg border bg-[radial-gradient(circle,_hsl(var(--border))_1px,_transparent_1px)] [background-size:20px_20px] select-none", compact ? "h-[320px]" : "h-[calc(100vh-260px)] min-h-[480px]")} data-testid="wf-canvas">
      <div data-bg="1" style={{ width: maxX, height: maxY }} className="relative">
        <svg className="absolute inset-0 pointer-events-none" width={maxX} height={maxY}>
          <defs>{Object.entries(OUT_CLS).map(([k, c]) => <marker key={k} id={`arr-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={c} /></marker>)}</defs>
          {def.edges.map(ed => {
            const a = def.nodes.find(n => n.id === ed.from), b = def.nodes.find(n => n.id === ed.to); if (!a || !b) return null;
            const p = path(a, b); const oc = ed.outcome || "next"; const on = sel?.kind === "edge" && sel.id === ed.id; const hl = highlight?.includes(a.id) && highlight?.includes(b.id);
            const txt = [oc !== "next" ? oc : "", ed.label].filter(Boolean).join(" · ");
            return <g key={ed.id} className="pointer-events-auto cursor-pointer" onPointerDown={ev => { ev.stopPropagation(); onSel?.({ kind: "edge", id: ed.id }); }}>
              <path d={p.d} stroke="transparent" strokeWidth={14} fill="none" />
              <path d={p.d} stroke={on ? "hsl(var(--primary))" : OUT_CLS[oc] || OUT_CLS.next} strokeWidth={on || hl ? 3 : 1.6} strokeDasharray={oc === "timeout" ? "6 4" : undefined} fill="none" markerEnd={`url(#arr-${oc})`} opacity={highlight && !hl ? 0.35 : 1} />
              {txt && <foreignObject x={p.lx - 70} y={p.ly - 11} width={140} height={22}><div className={cn("mx-auto w-fit max-w-[140px] truncate rounded-full border bg-background px-1.5 text-[10px] leading-[18px]", on && "border-primary text-primary")}>{txt}</div></foreignObject>}
            </g>;
          })}
          {link && (() => { const a = def.nodes.find(n => n.id === link.from)!; return <path d={`M${a.x + W},${a.y + H / 2} L${link.x},${link.y}`} stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="5 4" fill="none" />; })()}
        </svg>
        {def.nodes.map(n => {
          const T = typeOf(n.type); const I = T.icon; const on = sel?.kind === "node" && sel.id === n.id;
          return <div key={n.id} data-node={n.id} style={{ left: n.x, top: n.y, width: W, height: H }}
            className={cn("absolute rounded-lg border-2 shadow-sm px-2 py-1.5 text-xs", T.cls, on && "ring-2 ring-primary ring-offset-1", current === n.id && "ring-2 ring-orange-500 ring-offset-2 animate-pulse",
              highlight && !highlight.includes(n.id) && "opacity-40", visited?.includes(n.id) && current !== n.id && "outline outline-2 outline-emerald-500/60", !readOnly && "cursor-grab active:cursor-grabbing")}
            onPointerDown={e => { e.stopPropagation(); onSel?.({ kind: "node", id: n.id }); if (readOnly) return; const p = pt(e); setDrag({ id: n.id, dx: p.x - n.x, dy: p.y - n.y }); }}>
            <div className="flex items-center gap-1 font-semibold truncate"><I className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{n.label || T.label}</span></div>
            <div className="text-[10px] text-muted-foreground truncate mt-0.5">{nodeSummary(n)}</div>
            {!readOnly && n.type !== "end" && <div title="Drag to connect" onPointerDown={e => { e.stopPropagation(); const p = pt(e); setLink({ from: n.id, x: p.x, y: p.y }); }}
              className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-primary bg-background cursor-crosshair hover:scale-125 transition" data-handle={n.id} />}
            {n.type !== "start" && <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-muted-foreground/50" />}
          </div>;
        })}
        {!def.nodes.length && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none"><Square className="w-4 h-4 mr-2" />Drag steps here from the left</div>}
      </div>
    </div>
  );
}
export function remove(def: WDef, sel: Sel, set: (d: WDef) => void) {
  if (!sel) return;
  if (sel.kind === "edge") set({ ...def, edges: def.edges.filter(e => e.id !== sel.id) });
  else set({ nodes: def.nodes.filter(n => n.id !== sel.id), edges: def.edges.filter(e => e.from !== sel.id && e.to !== sel.id) });
}
export function Palette({ disabled, hasStart }: { disabled?: boolean; hasStart: boolean }) {
  return <div className="space-y-1.5">{NODE_TYPES.map(t => { const I = t.icon; const off = disabled || (t.type === "start" && hasStart);
    return <div key={t.type} draggable={!off} onDragStart={e => { e.dataTransfer.setData("text/wf-node", t.type); e.dataTransfer.effectAllowed = "copy"; }} data-palette={t.type}
      className={cn("rounded-md border-2 px-2 py-1.5 text-xs", t.cls, off ? "opacity-40 cursor-not-allowed" : "cursor-grab hover:shadow")} title={t.help}>
      <div className="flex items-center gap-1.5 font-semibold"><I className="w-3.5 h-3.5" />{t.label}</div><div className="text-[10px] text-muted-foreground">{t.help}</div></div>; })}</div>;
}
