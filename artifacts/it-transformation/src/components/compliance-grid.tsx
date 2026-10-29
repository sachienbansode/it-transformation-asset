import React, { useMemo } from "react";
import { Trash2, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * A schedule sheet from the auditor's workbook, laid out like the Excel sheet:
 *  - merged cells are kept (titles across the table), template text is read-only,
 *  - a row with 2+ template labels is shown as a table header, a row with one label at the left is a title / label,
 *  - empty cells are editable; rows added by the team can be deleted, template rows can be cleared.
 */

type Merge = { r: number; c: number; rs: number; cs: number };
export function GridTable({ grid, templateGrid, merges, editable, onChange }: { grid: string[][]; templateGrid: string[][]; merges?: Merge[] | null; editable: boolean; onChange?: (g: string[][]) => void }) {
  const width = Math.max(1, ...grid.map(r => r.length), ...templateGrid.map(r => r.length));
  const { start, covered } = useMemo(() => {
    const start = new Map<string, Merge>(), covered = new Set<string>();
    for (const m of merges || []) { start.set(`${m.r}:${m.c}`, m); for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) covered.add(`${r}:${c}`); }
    return { start, covered };
  }, [merges]);
  const label = (r: number, c: number) => !!templateGrid[r]?.[c]?.trim();
  const labels = (r: number) => (templateGrid[r] || []).filter(x => x?.trim()).length;
  const isHeader = (r: number) => labels(r) >= 2;
  const isTitle = (r: number) => labels(r) === 1 && !!start.get(`${r}:0`) && (start.get(`${r}:0`)!.cs > 1) ;
  const setCell = (r: number, c: number, v: string) => onChange?.(grid.map((row, ri) => (ri === r ? Array.from({ length: width }, (_, ci) => (ci === c ? v : row[ci] ?? "")) : row)));
  const delRow = (r: number) => onChange?.(grid.filter((_, i) => i !== r));
  const clearRow = (r: number) => onChange?.(grid.map((row, ri) => (ri === r ? row.map((v, ci) => (label(r, ci) ? v : "")) : row)));
  const tLen = templateGrid.length;
  return (
    <table className="text-xs border-collapse w-max min-w-full">
      <tbody>
        {grid.map((row, r) => {
          const header = isHeader(r), title = isTitle(r), added = r >= tLen;
          const hasValues = row.some((v, c) => !label(r, c) && v?.trim());
          return (
            <tr key={r} className={cn("group", header && "sticky top-0 z-10")}>
              {Array.from({ length: width }, (_, c) => {
                if (covered.has(`${r}:${c}`)) return null;
                const m = start.get(`${r}:${c}`);
                const span = { colSpan: m?.cs, rowSpan: m?.rs };
                if (label(r, c)) return (
                  <td key={c} {...span} className={cn("border px-2 py-1.5 align-top whitespace-pre-line max-w-[360px]",
                    title ? "bg-primary/10 text-primary font-semibold text-[13px]" : header ? "bg-muted font-semibold text-foreground min-w-[140px]" : c === 0 ? "bg-muted/50 font-medium min-w-[120px]" : "bg-muted/40 min-w-[120px]")}>{row[c]}</td>);
                if (title || header) return <td key={c} {...span} className={cn("border", header ? "bg-muted" : "bg-primary/5")} />;
                return (
                  <td key={c} {...span} className={cn("border p-0 min-w-[150px] align-top", header && "bg-muted/60")}>
                    {editable
                      ? <textarea rows={1} value={row[c] ?? ""} onChange={e => setCell(r, c, e.target.value)} className="block w-full min-h-[30px] bg-transparent px-2 py-1.5 resize-none outline-none focus:bg-accent/40 focus:ring-1 focus:ring-primary/40 [field-sizing:content]" />
                      : <div className="px-2 py-1.5 whitespace-pre-line min-h-[30px]">{row[c]}</div>}
                  </td>);
              })}
              {editable && <td className="pl-1 align-middle w-8">
                {added ? <button type="button" title="Delete this row" onClick={() => delRow(r)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                  : hasValues ? <button type="button" title="Clear the values in this row" onClick={() => clearRow(r)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent"><Eraser className="w-3.5 h-3.5 text-muted-foreground" /></button> : null}
              </td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
