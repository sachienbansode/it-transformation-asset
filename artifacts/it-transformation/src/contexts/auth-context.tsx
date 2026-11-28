import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  userType: "internal" | "external";
  role: "admin" | "user" | "cxo" | "kpi_employee" | "hr";
  department?: string;
  mobile?: string;
  mfaEnabled: boolean;
  mfaMethod: "totp" | "email";
  mustChangePassword?: boolean;
  status: "active" | "inactive" | "dormant";
  effectivePermissions?: Record<string, string>;
  defaultDashboard?: string;
  photoUrl?: string | null;
  auditor?: boolean;
}

export type AccessLevel = "read" | "write" | "admin";

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  isCxo: boolean;
  isEmployee: boolean;
  isHR: boolean;
  loading: boolean;
  effectivePermissions: Record<string, string>;
  defaultDashboard: string;
  canAccess: (module: string, level?: AccessLevel) => boolean;
  moduleOn: (key: string) => boolean;   // 2.20: modules switched off by the Super Admin
  modulesOff: string[];
  login: (email: string, password: string) => Promise<{ requiresMfa?: boolean; method?: "totp" | "email"; to?: string }>;
  loginMfa: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LEVEL_ORDER = ["none", "read", "write", "admin"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const u = await apiFetch<AuthUser>("/auth/me");
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await apiFetch<any>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.requiresMfa) return { requiresMfa: true, method: res.method || "totp", to: res.to };
    // Call refresh() to get full user data including effectivePermissions and defaultDashboard
    await refresh();
    return {};
  };

  const loginMfa = async (token: string) => {
    await apiFetch<AuthUser>("/auth/login/mfa", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    await refresh();
  };

  const logout = async () => {
    await apiFetch("/auth/logout", { method: "POST" });
    setUser(null);
  };

  const isAdmin = user?.role === "admin";
  const isCxo = user?.role === "cxo";
  const isEmployee = user?.role === "kpi_employee";
  const isHR = user?.role === "hr";
  const effectivePermissions = user?.effectivePermissions ?? {};
  const defaultDashboard = user?.defaultDashboard ?? "/";

  // 2.20: switched-off modules are hidden for everyone, Super Admin included
  const [modulesOff, setModulesOff] = useState<string[]>([]);
  useEffect(() => {
    if (!user) return;
    const load = () => apiFetch<any[]>("/modules").then(l => setModulesOff(l.filter(m => !m.enabled).map(m => m.key))).catch(() => {});
    load(); window.addEventListener("ithub:modules-changed", load); return () => window.removeEventListener("ithub:modules-changed", load);
  }, [user]);
  const moduleOn = useCallback((k: string) => !modulesOff.includes(k), [modulesOff]);
  const canAccess = useCallback((module: string, level: AccessLevel = "read"): boolean => {
    if (!user) return false;
    const g = moduleOfPerm(module); if (g && modulesOff.includes(g)) return false;
    if (user.role === "admin") return true;
    const perm = effectivePermissions[module] || "none";
    return LEVEL_ORDER.indexOf(perm) >= LEVEL_ORDER.indexOf(level);
  }, [user, effectivePermissions, modulesOff]);

  return (
    <AuthContext.Provider value={{
      user, isAdmin, isCxo, isEmployee, isHR, loading, effectivePermissions, defaultDashboard, canAccess, moduleOn, modulesOff,
      login, loginMfa, logout, refresh,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

/** 2.20: permission key → module that can be switched off */
export function moduleOfPerm(m: string): string | null {
  if (/^(dashboard|checklist|roadmap|retirements|applications|aibom|sbom|reports)$/.test(m)) return "drishti";
  if (/^kpi/.test(m)) return "performance";
  if (/^(assets?|asset_|maintenance_records)/.test(m)) return "assets";
  if (/^itsm_/.test(m)) return "itsm";
  if (m === "compliance") return "audit";
  if (m === "policies") return "policies";
  return null;
}
/** 2.20: app page → module */
export function moduleOfHref(h: string): string | null {
  const p = h.split("?")[0];
  if (p === "/" || /^\/(checklist|roadmap|retirements|applications|aibom|sbom|reports)/.test(p)) return "drishti";
  if (/^\/kpi/.test(p)) return "performance";
  if (/^\/(assets?(-|\/|$)|maintenance-records|my-assets|my-device|device-policy|software-compliance)/.test(p)) return "assets";
  if (/^\/itsm/.test(p)) return "itsm";
  if (/^\/chats/.test(p)) return "chats";
  if (/^\/compliance/.test(p)) return "audit";
  if (/^\/(policies|my-policies|admin\/policies)/.test(p)) return "policies";
  return null;
}
