import React, { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useCurrency } from "@/contexts/currency-context";
import { useTheme } from "@/contexts/theme-context";
import {
  LayoutDashboard, CheckSquare, Map, Archive, Server,
  BrainCircuit, ShieldCheck, User, Settings, LogOut, ChevronDown,
  Users, Sliders, Database, ChevronRight, Sun, Moon,
  PanelLeftClose, PanelLeftOpen, Menu, X, Building2, Clock, Presentation, BarChart3,
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

type SidebarState = "expanded" | "collapsed" | "hidden";
const SIDEBAR_KEY = "ashika-sidebar";

const DRISHTI_ITEMS = [
  { href: "/", label: "Executive Dashboard", icon: LayoutDashboard },
  { href: "/checklist", label: "IT Master Checklist", icon: CheckSquare },
  { href: "/roadmap", label: "Transformation Roadmap", icon: Map },
  { href: "/retirements", label: "App Retirement Plan", icon: Archive },
  { href: "/applications", label: "Application Inventory", icon: Server },
  { href: "/aibom", label: "AI Bill of Materials", icon: BrainCircuit },
  { href: "/sbom", label: "Software BOM", icon: ShieldCheck },
  { href: "/tech-kpis", label: "Technology KPIs", icon: BarChart3 },
  { href: "/reports", label: "PPT Reports", icon: Presentation },
];

const ADMIN_ITEMS = [
  { href: "/admin", label: "Settings", icon: Sliders, tab: "settings" },
  { href: "/admin?tab=users", label: "User Management", icon: Users, tab: "users" },
  { href: "/admin?tab=masters", label: "Master Data", icon: Database, tab: "masters" },
  { href: "/admin?tab=business-units", label: "Business Units", icon: Building2, tab: "business-units" },
  { href: "/admin?tab=audit", label: "Audit Trail", icon: Clock, tab: "audit" },
];

function NavItem({
  href, label, icon: Icon, active, collapsed,
}: {
  href: string; label: string; icon: React.ElementType; active: boolean; collapsed: boolean;
}) {
  return (
    <Link href={href}>
      <div
        title={collapsed ? label : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded-md text-[12px] font-medium transition-all duration-150 cursor-pointer",
          collapsed ? "px-2.5 py-2 justify-center" : "px-2.5 py-1.5",
          active
            ? "bg-sidebar-primary/20 text-sidebar-primary border border-sidebar-primary/25"
            : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground border border-transparent"
        )}
      >
        <Icon className={cn(
          "flex-shrink-0 transition-colors",
          collapsed ? "w-4 h-4" : "w-3.5 h-3.5",
          active ? "text-sidebar-primary" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70"
        )} />
        {!collapsed && <span className="truncate leading-tight">{label}</span>}
        {!collapsed && active && <ChevronRight className="w-3 h-3 ml-auto text-sidebar-primary/60 flex-shrink-0" />}
      </div>
    </Link>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="h-px bg-sidebar-border/40 mx-2 my-1.5" />;
  return (
    <div className="px-2.5 pt-2 pb-0.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/30 select-none">
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

  const [sidebar, setSidebar] = useState<SidebarState>(() => {
    try { return (localStorage.getItem(SIDEBAR_KEY) as SidebarState) || "expanded"; } catch { return "expanded"; }
  });
  const [appConfig, setAppConfig] = useState<AppConfig>({ appName: "Ashika Drishti Transform", appTagline: "", logoUrl: "" });

  useEffect(() => {
    apiFetch<AppConfig>("/config").then(cfg => {
      setAppConfig(cfg);
      if (cfg.logoUrl) {
        const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
        if (link) link.href = cfg.logoUrl;
      }
    }).catch(() => {});
  }, []);

  const setSidebarState = useCallback((s: SidebarState) => {
    setSidebar(s);
    try { localStorage.setItem(SIDEBAR_KEY, s); } catch {}
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
  const isCollapsed = sidebar === "collapsed";
  const isHidden = sidebar === "hidden";

  return (
    <div className="flex min-h-screen w-full bg-background font-sans text-foreground">

      {/* ─── Sidebar ─────────────────────────────────────── */}
      {!isHidden && (
        <aside className={cn(
          "flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col shadow-md transition-all duration-200 h-screen sticky top-0",
          isCollapsed ? "w-13" : "w-56"
        )}>

          {/* Brand */}
          <div className={cn(
            "h-12 flex items-center border-b border-sidebar-border/50 shrink-0 gap-2",
            isCollapsed ? "px-1.5 justify-center" : "px-2.5"
          )}>
            {/* Collapse toggle — always visible in header */}
            <button
              onClick={() => setSidebarState(isCollapsed ? "expanded" : "collapsed")}
              className="h-7 w-7 flex items-center justify-center rounded text-sidebar-foreground/40 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent transition-colors flex-shrink-0"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed
                ? <PanelLeftOpen className="h-3.5 w-3.5" />
                : <PanelLeftClose className="h-3.5 w-3.5" />
              }
            </button>

            {!isCollapsed && (
              <>
                {appConfig.logoUrl ? (
                  <img src={appConfig.logoUrl} alt="Logo" className="h-6 w-6 object-contain rounded flex-shrink-0" />
                ) : (
                  <div className="h-5 w-5 rounded bg-sidebar-primary/20 border border-sidebar-primary/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-sidebar-primary font-black text-[8px]">AD</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[11px] text-white/90 tracking-tight leading-tight truncate">
                    {appConfig.appName}
                  </div>
                </div>
                <button
                  onClick={() => setSidebarState("hidden")}
                  className="flex-shrink-0 text-sidebar-foreground/30 hover:text-sidebar-foreground/70 transition-colors"
                  title="Hide sidebar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 px-1.5 py-1.5 space-y-0.5 overflow-y-auto min-h-0">
            <SectionLabel collapsed={isCollapsed}>IT – Drishti</SectionLabel>
            {DRISHTI_ITEMS.map(item => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={item.href === "/" ? location === "/" : location.startsWith(item.href)}
                collapsed={isCollapsed}
              />
            ))}
            {isAdmin && (
              <>
                <SectionLabel collapsed={isCollapsed}>Admin</SectionLabel>
                {ADMIN_ITEMS.map(item => (
                  <NavItem
                    key={item.href + item.label}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={location.startsWith("/admin")}
                    collapsed={isCollapsed}
                  />
                ))}
              </>
            )}
          </nav>

          {/* User footer */}
          <div className="border-t border-sidebar-border/50 shrink-0">
            {/* User info */}
            {!isCollapsed ? (
              <div className="px-2 pb-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-sidebar-primary/20 border border-sidebar-primary/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] text-sidebar-primary font-bold">{user?.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-white/80 truncate">{user?.name}</div>
                    <span className={`text-[9px] px-1 py-px rounded border leading-none ${
                      user?.role === "admin" ? "border-yellow-500/40 text-yellow-400/90" : "border-white/20 text-white/40"
                    }`}>{user?.role}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 text-white/40 hover:text-white hover:bg-sidebar-accent">
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="end" className="w-52">
                      <div className="px-3 py-2">
                        <p className="text-sm font-medium">{user?.name}</p>
                        <p className="text-xs text-muted-foreground">{user?.email}</p>
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate("/profile")}><User className="h-4 w-4 mr-2" /> Profile</DropdownMenuItem>
                      {isAdmin && <DropdownMenuItem onClick={() => navigate("/admin")}><Settings className="h-4 w-4 mr-2" /> Admin Panel</DropdownMenuItem>}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                        <LogOut className="h-4 w-4 mr-2" /> Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ) : (
              <div className="flex justify-center pb-2">
                <button
                  title={user?.name}
                  className="h-7 w-7 rounded-full bg-sidebar-primary/20 border border-sidebar-primary/30 flex items-center justify-center"
                  onClick={handleLogout}
                >
                  <span className="text-[10px] text-sidebar-primary font-bold">{user?.name?.[0]?.toUpperCase()}</span>
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* ─── Main ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <header className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 gap-3 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            {/* Show/hide sidebar toggle */}
            {isHidden ? (
              <button
                onClick={() => setSidebarState("expanded")}
                className="flex items-center justify-center h-7 w-7 rounded-md border border-border bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
                title="Show sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>
            ) : null}
            <span className="text-xs text-muted-foreground hidden sm:block font-medium">Ashika Group</span>
            {currentPage && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 hidden sm:block" />
                <span className="text-sm font-semibold text-foreground truncate">{currentPage}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={cycle}
              className="flex items-center gap-1 text-xs bg-muted hover:bg-muted/80 border border-border rounded-md px-2.5 py-1.5 transition-colors font-semibold select-none text-foreground"
            >
              {unitLabels[unit]}
            </button>

            <button
              onClick={toggleTheme}
              className="flex items-center justify-center h-8 w-8 rounded-md border border-border bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-1.5 h-8 px-2 border border-border">
                  <div className="w-5 h-5 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                    <span className="text-[10px] text-primary font-bold">{user?.name?.[0]?.toUpperCase()}</span>
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
                <DropdownMenuItem onClick={() => navigate("/profile")}><User className="h-4 w-4 mr-2" /> Profile & Security</DropdownMenuItem>
                {isAdmin && <DropdownMenuItem onClick={() => navigate("/admin")}><Settings className="h-4 w-4 mr-2" /> Admin Panel</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive"><LogOut className="h-4 w-4 mr-2" /> Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-background">
          <div className="min-h-full p-5">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
