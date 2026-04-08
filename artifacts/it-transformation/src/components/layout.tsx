import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useCurrency } from "@/contexts/currency-context";
import { useTheme } from "@/contexts/theme-context";
import {
  LayoutDashboard, CheckSquare, Map, Archive, Server,
  BrainCircuit, ShieldCheck, User, Settings, LogOut, ChevronDown,
  Users, Sliders, Database, ChevronRight, Sun, Moon,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AppConfig {
  appName: string;
  appTagline: string;
  logoUrl: string;
}

const DRISHTI_ITEMS = [
  { href: "/", label: "Executive Dashboard", icon: LayoutDashboard },
  { href: "/checklist", label: "IT Master Checklist", icon: CheckSquare },
  { href: "/roadmap", label: "Transformation Roadmap", icon: Map },
  { href: "/retirements", label: "App Retirement Plan", icon: Archive },
  { href: "/applications", label: "Application Inventory", icon: Server },
  { href: "/aibom", label: "AI Bill of Materials", icon: BrainCircuit },
  { href: "/sbom", label: "Software BOM", icon: ShieldCheck },
];

const ADMIN_ITEMS = [
  { href: "/admin", label: "Settings", icon: Sliders },
  { href: "/admin?tab=users", label: "User Management", icon: Users },
  { href: "/admin?tab=masters", label: "Master Data", icon: Database },
  { href: "/admin?tab=business-units", label: "Business Units", icon: LayoutDashboard },
];

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <Link href={href}>
      <div className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer",
        active
          ? "bg-sidebar-primary/20 text-sidebar-primary border border-sidebar-primary/25"
          : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}>
        <Icon className={cn("w-4 h-4 flex-shrink-0 transition-colors", active ? "text-sidebar-primary" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70")} />
        <span className="truncate text-[13px] leading-tight">{label}</span>
        {active && <ChevronRight className="w-3 h-3 ml-auto text-sidebar-primary/60 flex-shrink-0" />}
      </div>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/30 select-none">
        {children}
      </span>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const { unit, cycle } = useCurrency();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [appConfig, setAppConfig] = useState<AppConfig>({
    appName: "Ashika Drishti Transform",
    appTagline: "",
    logoUrl: "",
  });

  useEffect(() => {
    apiFetch<AppConfig>("/config").then(setAppConfig).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
    toast({ title: "Signed out" });
  };

  const currentPage =
    DRISHTI_ITEMS.find(i => i.href === "/" ? location === "/" : location.startsWith(i.href))?.label
    ?? (location.startsWith("/admin") ? "Admin Controls" : location.startsWith("/profile") ? "Profile & Security" : "");

  const unitLabels: Record<string, string> = { lakhs: "₹ Lakh", crores: "₹ Crore", millions: "₹ Million" };

  return (
    <div className="flex min-h-screen w-full bg-background font-sans text-foreground">

      {/* ─── Sidebar ─────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col shadow-md">

        {/* Brand */}
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border/50 gap-3 shrink-0">
          {appConfig.logoUrl ? (
            <img src={appConfig.logoUrl} alt="Logo" className="h-7 w-7 object-contain rounded flex-shrink-0" />
          ) : (
            <div className="h-7 w-7 rounded-md bg-sidebar-primary/20 border border-sidebar-primary/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sidebar-primary font-black text-xs">AD</span>
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-[13px] text-white/90 tracking-tight leading-tight truncate">
              {appConfig.appName}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          <SectionLabel>IT – Drishti</SectionLabel>
          {DRISHTI_ITEMS.map(item => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={item.href === "/" ? location === "/" : location.startsWith(item.href)}
            />
          ))}
          {isAdmin && (
            <>
              <SectionLabel>Admin Controls</SectionLabel>
              {ADMIN_ITEMS.map(item => (
                <NavItem
                  key={item.href + item.label}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={location.startsWith("/admin")}
                />
              ))}
            </>
          )}
        </nav>

        {/* User Footer */}
        <div className="border-t border-sidebar-border/50 p-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-sidebar-primary/20 border border-sidebar-primary/30 flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-sidebar-primary font-bold">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white/80 truncate">{user?.name}</div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`text-[10px] px-1.5 py-px rounded-sm border leading-none ${
                  user?.role === "admin" ? "border-yellow-500/40 text-yellow-400/90 bg-yellow-400/5" : "border-white/20 text-white/40 bg-white/5"
                }`}>{user?.role}</span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-white/40 hover:text-white hover:bg-sidebar-accent">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-52">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="h-4 w-4 mr-2" /> Profile & Security
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <Settings className="h-4 w-4 mr-2" /> Admin Panel
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* ─── Main ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 gap-4 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-muted-foreground hidden sm:block font-medium">Ashika Group</span>
            {currentPage && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 hidden sm:block" />
                <span className="text-sm font-semibold text-foreground truncate">{currentPage}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 3-way currency cycle */}
            <button
              onClick={cycle}
              className="flex items-center gap-1 text-xs bg-muted hover:bg-muted/80 border border-border rounded-md px-2.5 py-1.5 transition-colors font-semibold select-none text-foreground"
            >
              {unitLabels[unit]}
            </button>

            {/* Dark/Light toggle */}
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center h-8 w-8 rounded-md border border-border bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2 h-8 px-2 border border-border">
                  <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                    <span className="text-xs text-primary font-bold">{user?.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <span className="text-sm font-medium max-w-20 truncate hidden sm:block">{user?.name?.split(" ")[0]}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="h-4 w-4 mr-2" /> Profile & Security
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <Settings className="h-4 w-4 mr-2" /> Admin Panel
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-background">
          <div className="min-h-full p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
