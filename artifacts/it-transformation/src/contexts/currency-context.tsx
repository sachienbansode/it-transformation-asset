import React, { createContext, useContext, useState } from "react";

type CurrencyUnit = "lakhs" | "millions";

interface CurrencyContextValue {
  unit: CurrencyUnit;
  toggle: () => void;
  format: (lakhs: number) => string;
  label: string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnit] = useState<CurrencyUnit>("lakhs");

  const toggle = () => setUnit(u => u === "lakhs" ? "millions" : "lakhs");

  const format = (lakhs: number): string => {
    if (unit === "millions") {
      const m = lakhs / 10; // 1 lakh = 0.1 million (INR 10 lakhs = 1 million)
      return `₹${m.toFixed(2)}M`;
    }
    return `₹${lakhs}L`;
  };

  const label = unit === "lakhs" ? "₹ Lakhs" : "₹ Millions";

  return (
    <CurrencyContext.Provider value={{ unit, toggle, format, label }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be inside CurrencyProvider");
  return ctx;
}
