/*
 * One set of field rules for an asset, used by Add / Edit, the register upload and the finance upload.
 * Returns { field: message } — empty when everything is valid.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const realDate = (d: unknown) => {
  const s = String(d ?? ""); if (!ISO.test(s)) return false;
  const t = new Date(s + "T00:00:00Z"); return !isNaN(+t) && t.toISOString().slice(0, 10) === s && s >= "1990-01-01" && s <= "2100-12-31";
};
const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
const num = (v: unknown) => Number(String(v).replace(/[,₹\s]/g, ""));
export const isIPv4 = (s: string) => /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(s);
export const isIPv6 = (s: string) => s.includes(":") && /^[0-9a-f:]+$/i.test(s) && s.split(":").length <= 8 && !/:::/.test(s);
export const isMAC = (s: string) => /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(s) || /^([0-9a-f]{4}\.){2}[0-9a-f]{4}$/i.test(s);
export const fmtD = (s: string) => { const [y, m, d] = s.split("-"); return `${d}-${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1]}-${y}`; };

export function assetFieldErrors(a: Record<string, any>, opts: { requireCostPositive?: boolean } = {}): Record<string, string> {
  const e: Record<string, string> = {};
  for (const [f, label] of [["purchaseDate", "Purchase date"], ["warrantyStart", "Warranty start"], ["warrantyExpiry", "Warranty expiry"]] as const)
    if (!blank(a[f]) && !realDate(a[f])) e[f] = `${label} "${a[f]}" is not a valid date`;
  if (!e.purchaseDate && !blank(a.purchaseDate) && a.purchaseDate > today()) e.purchaseDate = "Purchase date cannot be in the future";
  if (!e.warrantyStart && !e.purchaseDate && !blank(a.warrantyStart) && !blank(a.purchaseDate) && a.warrantyStart < a.purchaseDate) e.warrantyStart = `Warranty cannot start before the purchase date (${fmtD(a.purchaseDate)})`;
  if (!e.warrantyExpiry && !blank(a.warrantyExpiry)) {
    const from = !blank(a.warrantyStart) && !e.warrantyStart ? a.warrantyStart : !blank(a.purchaseDate) && !e.purchaseDate ? a.purchaseDate : null;
    if (from && a.warrantyExpiry <= from) e.warrantyExpiry = `Warranty expiry must be after the ${from === a.warrantyStart ? "warranty start" : "purchase"} date (${fmtD(from)})`;
  }
  if (!blank(a.cost)) { const c = num(a.cost); if (!Number.isFinite(c) || c < 0) e.cost = "Cost must be a positive amount"; else if (c === 0 && opts.requireCostPositive) e.cost = "Cost must be more than 0 (leave it blank if not known)"; else if (c > 1e10) e.cost = "Cost looks too large"; }
  if (!blank(a.salvageValue)) { const v = num(a.salvageValue); if (!Number.isFinite(v) || v < 0) e.salvageValue = "Residual value must be 0 or more"; else if (!blank(a.cost) && !e.cost && v > num(a.cost)) e.salvageValue = "Residual value cannot be more than the cost"; }
  if (!blank(a.usefulLifeYears)) { const y = num(a.usefulLifeYears); if (!Number.isFinite(y) || y <= 0 || y > 50) e.usefulLifeYears = "Useful life must be between 1 and 50 years"; }
  if (!blank(a.ipAddress)) { const s = String(a.ipAddress).trim(); if (!isIPv4(s) && !isIPv6(s)) e.ipAddress = `"${s}" is not a valid IP address (e.g. 10.0.1.25)`; }
  if (!blank(a.macAddress)) { const s = String(a.macAddress).trim(); if (!isMAC(s)) e.macAddress = `"${s}" is not a valid MAC address (e.g. 3C:52:82:1A:2B:3C)`; }
  return e;
}
export const firstError = (e: Record<string, string>) => Object.values(e)[0] || null;
