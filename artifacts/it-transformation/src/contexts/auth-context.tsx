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
  mfaMethod: "totp" | "sms_otp" | "email_otp";
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
  login: (email: string, password: string) => Promise<{ requiresMfa?: boolean }>;
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
    if (res.requiresMfa) return { requiresMfa: true };
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

  const canAccess = useCallback((module: string, level: AccessLevel = "read"): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    const perm = effectivePermissions[module] || "none";
    return LEVEL_ORDER.indexOf(perm) >= LEVEL_ORDER.indexOf(level);
  }, [user, effectivePermissions]);

  return (
    <AuthContext.Provider value={{
      user, isAdmin, isCxo, isEmployee, isHR, loading, effectivePermissions, defaultDashboard, canAccess,
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
