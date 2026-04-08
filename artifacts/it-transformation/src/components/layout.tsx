import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useCurrency } from "@/contexts/currency-context";
import {
  LayoutDashboard, CheckSquare, Map, Archive, Server,
  BrainCircuit, ShieldCheck, User, Settings, LogOut, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

interface AppConfig {
  appName: string;
  appTagline: string;
  logoUrl: string;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { unit, toggle, label } = useCurrency();
  const { toast } = useToast();
  const [appConfig, setAppConfig] = useState<AppConfig>({
    appName: "Ashika Drishti Transform",
    appTagline: "",
    logoUrl: "",
  });

  useEffect(() => {
    apiFetch<AppConfig>("/config").then(setAppConfig).catch(() => {});
  }, []);

  const navItems = [
    { href: "/", label: "Executive Summary", icon: LayoutDashboard },
    { href: "/checklist", label: "IT Master Checklist", icon: CheckSquare },
    { href: "/roadmap", label: "Transformation Roadmap", icon: Map },
    { href: "/retirements", label: "App Retirement Plan", icon: Archive },
    { href: "/applications", label: "Application Inventory", icon: Server },
    { href: "/aibom", label: "AI Bill of Materials", icon: BrainCircuit },
    { href: "/sbom", label: "Software Bill of Materials", icon: ShieldCheck },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
    toast({ title: "Signed out", description: "You have been signed out successfully." });
  };

  return (
    <div className="flex min-h-screen w-full bg-background font-sans text-foreground">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-sidebar-border bg-sidebar-accent/50 shrink-0 gap-3">
          {appConfig.logoUrl ? (
            <img src={appConfig.logoUrl} alt="Logo" className="h-8 w-8 object-contain rounded flex-shrink-0" />
          ) : null}
          <div className="font-bold text-base text-primary tracking-tight leading-tight truncate">
            {appConfig.appName}
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 flex-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "opacity-100" : "opacity-70"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User info at bottom */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="text-xs text-muted-foreground mb-1 px-1">Signed in as</div>
          <div className="text-sm font-medium px-1 truncate">{user?.name}</div>
          <div className="text-xs text-muted-foreground px-1 truncate">{user?.email}</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-8 shrink-0">
          <h1 className="text-lg font-semibold">IT Transformation Planning Suite</h1>
          <div className="flex items-center gap-3">
            {/* Currency toggle */}
            <button
              onClick={toggle}
              className="flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 border border-border rounded-md px-3 py-1.5 transition-colors font-medium"
            >
              <span className={unit === "lakhs" ? "text-primary" : "text-muted-foreground"}>₹L</span>
              <span className="text-muted-foreground">/</span>
              <span className={unit === "millions" ? "text-primary" : "text-muted-foreground"}>₹M</span>
            </button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2 h-8">
                  <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                    <span className="text-xs text-primary font-bold">{user?.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <span className="text-sm font-medium max-w-24 truncate">{user?.name?.split(" ")[0]}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  <div className="flex gap-1 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${
                      user?.userType === "internal" ? "border-blue-500/30 text-blue-400" : "border-purple-500/30 text-purple-400"
                    }`}>{user?.userType}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${
                      user?.role === "admin" ? "border-yellow-500/30 text-yellow-400" : "border-gray-500/30 text-gray-400"
                    }`}>{user?.role}</span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="h-4 w-4 mr-2" />Profile & Security
                </DropdownMenuItem>
                {user?.role === "admin" && (
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <Settings className="h-4 w-4 mr-2" />Admin Panel
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
