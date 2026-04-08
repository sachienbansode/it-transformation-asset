import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useCurrency } from "@/contexts/currency-context";
import {
  LayoutDashboard, CheckSquare, Map, Archive, Server,
  BrainCircuit, ShieldCheck, User, Settings, LogOut, ChevronDown,
  Users, Sliders, Database, ChevronRight,
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
  { href: "/admin", label: "System Settings", icon: Sliders },
  { href: "/admin?tab=users", label: "User Management", icon: Users },
  { href: "/admin?tab=masters", label: "Master Data", icon: Database },
];

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <Link href={href}>
      <div className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer",
        active
          ? "bg-primary/15 text-primary border border-primary/20 shadow-sm"
          : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground"
      )}>
        <Icon className={cn("w-4 h-4 flex-shrink-0 transition-colors", active ? "text-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80")} />
        <span className="truncate leading-tight">{label}</span>
        {active && <ChevronRight className="w-3 h-3 ml-auto text-primary/60" />}
      </div>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 mb-1 mt-4 first:mt-0">
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/35 select-none">
        {children}
      </span>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const { unit, cycle } = useCurrency();
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
    toast({ title: "Signed out", description: "You have been signed out successfully." });
  };

  const currentPage = DRISHTI_ITEMS.find(i => {
    if (i.href === "/") return location === "/";
    return location.startsWith(i.href);
  })?.label
    ?? (location.startsWith("/admin") ? "Admin Controls" : location.startsWith("/profile") ? "Profile & Security" : "");

  const unitLabels: Record<string, string> = { lakhs: "₹ Lakh", crores: "₹ Crore", millions: "₹ Million" };
  const nextLabels: Record<string, string> = { lakhs: "→ Crore", crores: "→ Million", millions: "→ Lakh" };

  return (
    <div className="flex min-h-screen w-full bg-background font-sans text-foreground">

      {/* ─── Sidebar ─────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">

        {/* Brand Header */}
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border/60 gap-3 shrink-0">
          {appConfig.logoUrl ? (
            <img src={appConfig.logoUrl} alt="Logo" className="h-7 w-7 object-contain rounded flex-shrink-0" />
          ) : (
            <div className="h-7 w-7 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-bold text-xs">AD</span>
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-sm text-foreground tracking-tight leading-tight truncate">
              {appConfig.appName}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">

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
                  key={item.href}
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
        <div className="border-t border-sidebar-border/60 p-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-primary font-bold">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground truncate">{user?.name}</div>
              <div className="flex gap-1 mt-0.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border leading-none ${
                  user?.role === "admin" ? "border-yellow-500/40 text-yellow-400 bg-yellow-400/5" : "border-gray-500/40 text-gray-400 bg-gray-400/5"
                }`}>{user?.role}</span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground">
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

      {/* ─── Main ─────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top Header */}
        <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-muted-foreground hidden sm:block">Ashika Group</span>
            {currentPage && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 hidden sm:block" />
                <span className="text-sm font-semibold text-foreground truncate">{currentPage}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 3-way currency toggle */}
            <button
              onClick={cycle}
              title={`Switch currency — next: ${nextLabels[unit]}`}
              className="group flex items-center gap-1.5 text-xs bg-muted/60 hover:bg-muted border border-border/60 hover:border-border rounded-lg px-3 py-1.5 transition-all font-medium select-none"
            >
              <span className="text-primary font-semibold">{unitLabels[unit]}</span>
              <span className="text-muted-foreground/60 text-[10px] ml-1 group-hover:text-muted-foreground transition-colors">
                {nextLabels[unit]}
              </span>
            </button>

            {/* User avatar trigger */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2 h-8 px-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
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
        <div className="flex-1 overflow-auto">
          <div className="min-h-full p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
