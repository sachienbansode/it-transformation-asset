import React, { createContext, useContext, useState } from "react";

export type CurrencyUnit = "lakhs" | "crores" | "millions";

/* Current header unit, readable outside React (used by inrShort for rupee amounts). */
const KEY = "currencyUnit";
let current: CurrencyUnit = (() => { try { const v = localStorage.getItem(KEY); return v === "crores" || v === "millions" ? v : "lakhs"; } catch { return "lakhs"; } })();
export const currentUnit = () => current;

interface CurrencyContextValue {
  unit: CurrencyUnit;
  setUnit: (u: CurrencyUnit) => void;
  cycle: () => void;
  format: (lakhs: number, decimals?: number) => string;
  formatShort: (lakhs: number) => string;
  label: string;
  unitLabel: string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<CurrencyUnit>(current);
  const setUnit = (u: CurrencyUnit) => { current = u; try { localStorage.setItem(KEY, u); } catch { /* ignore */ } setUnitState(u); };

  const cycle = () => setUnit(unit === "lakhs" ? "crores" : unit === "crores" ? "millions" : "lakhs");

  const format = (lakhs: number, decimals = 2): string => {
    if (unit === "crores") {
      const cr = lakhs / 100;
      return `₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(decimals)} Cr`;
    }
    if (unit === "millions") {
      const m = lakhs / 10;
      return `₹${m % 1 === 0 ? m.toFixed(0) : m.toFixed(decimals)}M`;
    }
    return `₹${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(decimals)}L`;
  };

  const formatShort = (lakhs: number): string => {
    if (unit === "crores") return `₹${(lakhs / 100).toFixed(1)}Cr`;
    if (unit === "millions") return `₹${(lakhs / 10).toFixed(1)}M`;
    return `₹${lakhs.toFixed(0)}L`;
  };

  const label = unit === "crores" ? "₹ Crores" : unit === "millions" ? "₹ Millions" : "₹ Lakhs";
  const unitLabel = unit === "crores" ? "Cr" : unit === "millions" ? "M" : "L";

  return (
    <CurrencyContext.Provider value={{ unit, setUnit, cycle, format, formatShort, label, unitLabel }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be inside CurrencyProvider");
  return ctx;
}
