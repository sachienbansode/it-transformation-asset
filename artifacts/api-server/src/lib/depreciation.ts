/*
 * Fixed-asset depreciation (Companies Act 2013, Schedule II style), Indian financial year (1 Apr – 31 Mar).
 *  - SLM: (cost − residual) / useful life per year, pro-rata by days in the year of purchase / disposal.
 *  - WDV: rate = 1 − (residual / cost)^(1 / life), applied to the opening book value each FY, pro-rata by days.
 *  - Book value never goes below the residual (salvage) value. Depreciation stops on the disposal date.
 * An asset's own method / life / salvage override the rule for its type.
 */

export type DepRule = { assetType: string; method: string; usefulLifeYears: string | number; salvagePct: string | number; notes?: string | null };
/** Frozen position of an asset at the last closed financial year (see asset_fy_closes.carry). */
export type Carry = { rows: DepRow[]; book: number; elapsed: number; nextFy: number };
export type DepInput = { cost: number; purchaseDate: string; method: "SLM" | "WDV" | "None"; lifeYears: number; salvage: number; disposalDate: string | null; source: "asset" | "rule" | "default"; carry?: Carry | null };
export type DepRow = { fy: string; from: string; to: string; days: number; opening: number; depreciation: number; closing: number };

const DAY = 86_400_000;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toT = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
export const today = () => new Date().toISOString().slice(0, 10);
export const fyOf = (s: string) => { const [y, m] = s.split("-").map(Number); return m >= 4 ? y : y - 1; };
export const fyLabel = (y: number) => `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`;
export const fyStart = (y: number) => `${y}-04-01`;
export const fyEnd = (y: number) => `${y + 1}-03-31`;
const fyStartT = (y: number) => Date.UTC(y, 3, 1);
const fyEndT = (y: number) => Date.UTC(y + 1, 2, 31);

const DEFAULT_RULE: DepRule = { assetType: "Others", method: "SLM", usefulLifeYears: 5, salvagePct: 5 };

/** Resolve the inputs for one asset. Returns { missing } when cost or purchase date is absent. */
export function resolveInput(a: any, rules: Map<string, DepRule>, carries?: Map<number, Carry> | null): { input?: DepInput; missing?: string[]; rule: DepRule } {
  const rule = rules.get(String(a.type || "").toLowerCase()) || rules.get("others") || DEFAULT_RULE;
  const missing: string[] = [];
  const cost = a.cost === null || a.cost === undefined || a.cost === "" ? NaN : Number(a.cost);
  if (!Number.isFinite(cost) || cost <= 0) missing.push("Cost");
  if (!a.purchaseDate || !DATE_RE.test(a.purchaseDate)) missing.push("Purchase date");
  if (missing.length) return { missing, rule };
  const method = (a.depreciationMethod || rule.method || "SLM") as DepInput["method"];
  const lifeYears = Number(a.usefulLifeYears ?? rule.usefulLifeYears) || 5;
  const salvage = a.salvageValue !== null && a.salvageValue !== undefined && a.salvageValue !== ""
    ? Math.min(Number(a.salvageValue), cost)
    : r2(cost * (Number(rule.salvagePct) || 0) / 100);
  const disposalDate = a.disposalDate && DATE_RE.test(a.disposalDate) ? a.disposalDate : null;
  const source = a.depreciationMethod || a.usefulLifeYears || a.salvageValue ? "asset" : rules.size ? "rule" : "default";
  return { input: { cost, purchaseDate: a.purchaseDate, method, lifeYears, salvage, disposalDate, source, carry: carries?.get(a.id) ?? null }, rule };
}

/**
 * Year-by-year schedule from purchase up to `until` (inclusive), stopping at disposal or when fully depreciated.
 * With a carry (financial year closed), the closed years come from the frozen rows and later years continue from the
 * frozen closing book value over the remaining life — so a later rule change applies prospectively (AS 10 / Ind AS 16).
 */
export function schedule(inp: DepInput, until = "2100-03-31"): DepRow[] {
  const rows: DepRow[] = [];
  const endT0 = toT(until);
  let book = inp.cost, elapsed = 0, firstFy = fyOf(inp.purchaseDate);
  if (inp.carry) {
    for (const r of inp.carry.rows) {
      if (toT(r.from) > endT0) return rows;
      if (toT(r.to) <= endT0) { rows.push(r); continue; }
      const days = (endT0 - toT(r.from)) / DAY + 1;                    // part of a frozen year: linear within the year
      const dep = r2(r.depreciation * days / r.days);
      rows.push({ ...r, to: until.slice(0, 10), days, depreciation: dep, closing: r2(r.opening - dep) });
      return rows;
    }
    book = inp.carry.book; elapsed = inp.carry.elapsed; firstFy = inp.carry.nextFy;
  }
  if (inp.method === "None") return rows;
  const start = Math.max(toT(inp.purchaseDate), fyStartT(firstFy));
  let end = endT0;
  if (inp.disposalDate) end = Math.min(end, toT(inp.disposalDate));
  if (end < start) return rows;
  const salvage = Math.max(0, Math.min(inp.salvage, inp.cost));
  if (book - salvage < 0.01) return rows;
  const remainingLife = inp.lifeYears - elapsed;
  const annualSlm = remainingLife > 0.0001 ? (book - salvage) / remainingLife : Infinity;   // life already used up → write off the rest now
  const wdvRate = 1 - Math.pow(Math.max(salvage, inp.cost * 0.05) / inp.cost, 1 / inp.lifeYears);
  for (let y = firstFy; fyStartT(y) <= end && y < firstFy + 60; y++) {
    const from = Math.max(start, fyStartT(y)), to = Math.min(end, fyEndT(y));
    if (to < from) continue;
    const days = (to - from) / DAY + 1, fyDays = (fyEndT(y) - fyStartT(y)) / DAY + 1;
    let dep = inp.method === "WDV" ? (remainingLife > 0.0001 ? book * wdvRate * days / fyDays : book - salvage) : annualSlm === Infinity ? book - salvage : annualSlm * days / fyDays;
    dep = r2(Math.max(0, Math.min(dep, book - salvage)));
    rows.push({ fy: fyLabel(y), from: iso(from), to: iso(to), days, opening: r2(book), depreciation: dep, closing: r2(book - dep) });
    book = r2(book - dep);
    if (book - salvage < 0.01) break;
  }
  return rows;
}

/** Life used (in years) by a set of schedule rows — days / days-in-FY, as the schedule pro-rates. */
export const lifeUsed = (rows: DepRow[]) => rows.reduce((t, r) => { const y = Number(r.fy.slice(3, 7)); return t + r.days / ((fyEndT(y) - fyStartT(y)) / DAY + 1); }, 0);

export const accumulated = (inp: DepInput, until: string) => r2(schedule(inp, until).reduce((s, r) => s + r.depreciation, 0));
export const bookValue = (inp: DepInput, until = today()) => r2(inp.cost - accumulated(inp, until));

/** Fixed-asset register line for one FY (gross block / depreciation / net block), as of min(FY end, asOf). */
export function registerLine(a: any, inp: DepInput, fy: number, asOf: string) {
  const fs = fyStart(fy), fe = fyEnd(fy);
  const periodEnd = asOf < fe ? asOf : fe;
  if (inp.purchaseDate > periodEnd) return null;                       // bought after the period
  if (inp.disposalDate && inp.disposalDate < fs) return null;          // gone before the period
  const dayBefore = iso(toT(fs) - DAY);
  const accOpening = inp.purchaseDate < fs ? accumulated(inp, dayBefore) : 0;
  const accEnd = accumulated(inp, periodEnd);
  const disposedInPeriod = !!inp.disposalDate && inp.disposalDate <= periodEnd;
  const grossOpening = inp.purchaseDate < fs ? inp.cost : 0;
  const additions = inp.purchaseDate >= fs ? inp.cost : 0;
  const deletions = disposedInPeriod ? inp.cost : 0;
  const bookAtDisposal = disposedInPeriod ? r2(inp.cost - accEnd) : null;
  const disposalValue = a.disposalValue !== null && a.disposalValue !== undefined ? Number(a.disposalValue) : null;
  return {
    grossOpening, additions, deletions, grossClosing: r2(grossOpening + additions - deletions),
    accOpening, depreciation: r2(accEnd - accOpening), accOnDeletion: disposedInPeriod ? accEnd : 0, accClosing: disposedInPeriod ? 0 : accEnd,
    netOpening: r2(grossOpening - accOpening), netClosing: disposedInPeriod ? 0 : r2(inp.cost - accEnd),
    bookAtDisposal, disposalValue, gainLoss: bookAtDisposal !== null && disposalValue !== null ? r2(disposalValue - bookAtDisposal) : null,
    fullyDepreciated: !disposedInPeriod && inp.method !== "None" && r2(inp.cost - accEnd) - inp.salvage < 0.01,
  };
}
