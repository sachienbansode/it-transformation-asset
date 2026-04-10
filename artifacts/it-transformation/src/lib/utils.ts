import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  cxo: "CXO",
  kpi_employee: "Employee",
  hr: "HR Manager",
  user: "User",
};

export function getRoleLabel(role?: string | null): string {
  if (!role) return "—";
  return ROLE_LABELS[role] ?? role;
}
