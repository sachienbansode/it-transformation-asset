import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  userType: "internal" | "external";
  role: "admin" | "user";
  department?: string;
  mobile?: string;
  mfaEnabled: boolean;
  mfaMethod: "totp" | "sms_otp" | "email_otp";
  status: "active" | "inactive" | "dormant";
}

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ requiresMfa?: boolean }>;
  loginMfa: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
    setUser(res);
    return {};
  };

  const loginMfa = async (token: string) => {
    const res = await apiFetch<AuthUser>("/auth/login/mfa", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    setUser(res);
  };

  const logout = async () => {
    await apiFetch("/auth/logout", { method: "POST" });
    setUser(null);
  };

  const isAdmin = user?.role === "admin";

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, login, loginMfa, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
