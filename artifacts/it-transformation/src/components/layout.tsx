import React, { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useCurrency } from "@/contexts/currency-context";
import { useTheme } from "@/contexts/theme-context";
import {
  LayoutDashboard, CheckSquare, Map, Archive, Server,
  BrainCircuit, ShieldCheck, User, Settings, LogOut, ChevronDown,
  Users, Sliders, Database, ChevronRight, Sun, Moon,
  PanelLeftClose, PanelLeftOpen, Menu, X, Building2, Clock, Presentation, Target, ClipboardList, Shield, BarChart3, Search,
  Monitor, AlertTriangle, GitBranch, BookOpen, HardDrive, GitMerge, Wrench, UserCheck, Laptop, ScanLine, FileSignature, TrendingDown,
  ClipboardCheck, FolderOpen,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { cn, getRoleLabel } from "@/lib/utils";
import { SearchModal } from "@/components/search-modal";
import { NotificationBell } from "@/components/notification-bell";

interface AppConfig {
  appName: string;
  appTagline: string;
  logoUrl: string;
}

type SidebarState = "expanded" | "collapsed" | "hidden";
const SIDEBAR_KEY = "ashika-sidebar";
const SECTIONS_KEY = "ashika-sidebar-sections";

const DRISHTI_ITEMS = [
  { href: "/", label: "Executive Dashboard", icon: LayoutDashboard, module: "dashboard", adminOnly: true },
  { href: "/checklist", label: "IT Master Checklist", icon: CheckSquare, module: "checklist", adminOnly: false },
  { href: "/roadmap", label: "Transformation Roadmap", icon: Map, module: "roadmap", adminOnly: false },
  { href: "/retirements", label: "App Retirement Plan", icon: Archive, module: "retirements", adminOnly: false },
  { href: "/applications", label: "Application Inventory", icon: Server, module: "applications", adminOnly: false },
  { href: "/aibom", label: "AI Bill of Materials", icon: BrainCircuit, module: "aibom", adminOnly: false },
  { href: "/sbom", label: "Software BOM", icon: ShieldCheck, module: "sbom", adminOnly: false },
  { href: "/reports", label: "PPT Reports", icon: Presentation, module: "reports", adminOnly: false },
];

const KPI_ITEMS = [
  { href: "/kpi-dashboard", label: "KPI Dashboard", icon: BarChart3, module: "kpi_dashboard" },
  { href: "/kpis", label: "KPI Management", icon: ClipboardList, module: "kpis" },
];

const ASSET_ITEMS = [
  { href: "/assets", label: "Asset Dashboard", icon: Monitor, module: "assets" },
  { href: "/asset-registry", label: "Asset Registry", icon: HardDrive, module: "asset_registry" },
  { href: "/asset-vendors", label: "Vendors", icon: Building2, module: "asset_vendors" },
  { href: "/asset-licenses", label: "Licenses", icon: Shield, module: "asset_licenses" },
  { href: "/asset-contracts", label: "Contracts & AMC", icon: FileSignature, module: "asset_contracts" },
  { href: "/asset-depreciation", label: "Depreciation", icon: TrendingDown, module: "asset_depreciation" },
  { href: "/asset-allocations", label: "Handovers", icon: Users, module: "asset_allocations" },
  { href: "/asset-employees", label: "Employee Assets", icon: UserCheck, module: "asset_allocations" },
  { href: "/maintenance-records", label: "Maintenance", icon: Wrench, module: "maintenance_records" },
  { href: "/asset-audits", label: "Physical Audit", icon: ScanLine, module: "asset_audits" },
];

const ITSM_ITEMS = [
  { href: "/itsm", label: "ITSM Dashboard", icon: BarChart3, module: "itsm_dashboard" },
  { href: "/itsm-incidents", label: "Incidents", icon: AlertTriangle, module: "itsm_incidents" },
  { href: "/itsm-problems", label: "Problems", icon: Database, module: "itsm_problems" },
  { href: "/itsm-changes", label: "Change Requests", icon: GitBranch, module: "itsm_changes" },
  { href: "/itsm-kb", label: "Knowledge Base", icon: BookOpen, module: "itsm_kb" },
  { href: "/itsm-sla", label: "SLA Policies", icon: Shield, module: "itsm_sla" },
  { href: "/itsm-requests", label: "Service Requests", icon: Clock, module: "itsm_requests" },
  { href: "/itsm-my-approvals", label: "My Approvals", icon: CheckSquare, module: "itsm_my_approvals" },
  { href: "/itsm-approval", label: "Approval Workflow", icon: GitMerge, module: "itsm_approval" },
  { href: "/itsm-setup", label: "ITSM Setup", icon: Wrench, module: "itsm_setup" },
];

const COMPLIANCE_ITEMS = [
  { href: "/compliance", label: "Audits", icon: ClipboardCheck, module: "compliance" },
  { href: "/compliance-library", label: "Evidence Library", icon: FolderOpen, module: "compliance" },
];

const ADMIN_ITEMS = [
  { href: "/admin", label: "Settings", icon: Sliders, tab: "settings" },
  { href: "/admin/users", label: "User Master", icon: Users, tab: "users" },
  { href: "/admin/roles", label: "Roles & Permissions", icon: Shield, tab: "roles" },
  { href: "/admin?tab=masters", label: "Master Data", icon: Database, tab: "masters" },
  { href: "/admin?tab=business-units", label: "Business Units", icon: Building2, tab: "business-units" },
  { href: "/admin?tab=audit", label: "Audit Trail", icon: Clock, tab: "audit" },
  { href: "/admin/archive", label: "Archive & Notifications", icon: Archive, tab: "archive" },
];

function NavItem({
  href, label, icon: Icon, active, collapsed, badge,
}: {
  href: string; label: string; icon: React.ElementType; active: boolean; collapsed: boolean; badge?: number;
}) {
  return (
    <Link href={href}>
      <div
        title={collapsed ? label : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-[9px] text-[13px] font-medium transition-colors duration-150 cursor-pointer my-0.5",
          collapsed ? "px-2.5 py-2 justify-center" : "px-3 py-[7px]",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold before:content-[''] before:absolute before:-left-1.5 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-sidebar-primary"
            : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className={cn(
          "flex-shrink-0 transition-colors",
          "w-[17px] h-[17px]",
          active ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-foreground"
        )} />
        {!collapsed && <span className="truncate leading-tight">{label}</span>}
        {!!badge && <span className={cn("ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold grid place-items-center", collapsed && "absolute -top-1 -right-1 ml-0")}>{badge > 99 ? "99+" : badge}</span>}
      </div>
    </Link>
  );
}

function SectionLabel({
  children, collapsed, open, onToggle,
}: {
  children: React.ReactNode; collapsed: boolean; open: boolean; onToggle: () => void;
}) {
  if (collapsed) return <div className="h-px bg-sidebar-border/40 mx-2 my-1.5" />;
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 pt-4 pb-1.5 group/sec"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-muted-foreground/80 select-none group-hover/sec:text-foreground transition-colors">
        {children}
      </span>
      <ChevronDown className={cn(
        "h-2.5 w-2.5 text-sidebar-foreground/20 group-hover/sec:text-sidebar-foreground/50 transition-all duration-200 flex-shrink-0",
        open ? "rotate-0" : "-rotate-90"
      )} />
    </button>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout, isAdmin, isHR, canAccess } = useAuth();
  const { unit, cycle } = useCurrency();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const isMobile = () => typeof window !== "undefined" && window.innerWidth < 860;
  const [mobile, setMobile] = useState(isMobile());
  const [sidebar, setSidebar] = useState<SidebarState>(() => {
    if (isMobile()) return "hidden"; // phones / tablets: sidebar is an overlay, closed by default
    try { return (localStorage.getItem(SIDEBAR_KEY) as SidebarState) || "expanded"; } catch { return "expanded"; }
  });
  useEffect(() => {
    const onResize = () => setMobile(isMobile());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // close the overlay sidebar after navigating on a phone
  useEffect(() => { if (mobile) setSidebar("hidden"); }, [location, mobile]);
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(SECTIONS_KEY);
      return saved ? JSON.parse(saved) : { drishti: true, kpi: true, admin: true };
    } catch { return { drishti: true, kpi: true, admin: true }; }
  });
  const [appConfig, setAppConfig] = useState<AppConfig>({ appName: "Ashika Drishti Transform", appTagline: "", logoUrl: "" });
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    apiFetch<AppConfig>("/config").then(cfg => {
      setAppConfig(cfg);
      if (cfg.logoUrl) {
        const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
        if (link) link.href = cfg.logoUrl;
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const setSidebarState = useCallback((s: SidebarState) => {
    setSidebar(mobile && s === "collapsed" ? "hidden" : s);
    if (!mobile) { try { localStorage.setItem(SIDEBAR_KEY, s); } catch {} }
  }, [mobile]);

  const toggleSection = useCallback((key: string) => {
    setSectionsOpen(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
    toast({ title: "Signed out" });
  };

  const visibleDrishtiItems = DRISHTI_ITEMS.filter(item =>
    canAccess(item.module) && (!item.adminOnly || isAdmin)
  );
  const visibleKpiItems = KPI_ITEMS.filter(item => canAccess(item.module));
  const visibleAssetItems = ASSET_ITEMS.filter(item => canAccess(item.module));
  const { data: myApprovals } = useQuery({ queryKey: ["my-approvals-count"], queryFn: () => apiFetch<{ count: number }>("/my-approvals/count"), refetchInterval: 120_000, enabled: !!user });
  const anyItsm = ITSM_ITEMS.some(i => i.module.startsWith("itsm_") && i.module !== "itsm_my_approvals" && canAccess(i.module));
  const visibleComplianceItems = COMPLIANCE_ITEMS.filter(item => canAccess(item.module));
  const visibleItsmItems = ITSM_ITEMS.filter(item => item.module === "itsm_my_approvals" ? (anyItsm || (myApprovals?.count || 0) > 0) : canAccess(item.module));

  // Longest matching href wins (so "/itsm-incidents" is not shown as "/itsm" ITSM Dashboard)
  const best = (items: { href: string; label: string }[]) => items.filter(i => i.href === "/" ? location === "/" : (location === i.href || location.startsWith(i.href + "/") || location.startsWith(i.href + "?"))).sort((a, b) => b.href.length - a.href.length)[0]?.label;
  const currentPage =
    best(ITSM_ITEMS) ?? best(COMPLIANCE_ITEMS) ?? best(ASSET_ITEMS) ?? best(KPI_ITEMS) ??
    DRISHTI_ITEMS.find(i => i.href === "/" ? location === "/" : location.startsWith(i.href))?.label
    ?? KPI_ITEMS.find(i => location.startsWith(i.href))?.label
    ?? ASSET_ITEMS.find(i => location.startsWith(i.href))?.label
    ?? ITSM_ITEMS.find(i => location.startsWith(i.href))?.label
    ?? (location.startsWith("/admin") ? "Admin Controls" : location.startsWith("/profile") ? "Profile & Security" : location.startsWith("/my-assets") ? "My Assets" : "");

  const unitLabels: Record<string, string> = { lakhs: "₹ Lakh", crores: "₹ Crore", millions: "₹ Million" };
  const isCollapsed = sidebar === "collapsed";
  const isHidden = sidebar === "hidden";

  return (
    <div className="flex min-h-screen w-full bg-background font-sans text-foreground">

      {/* ─── Sidebar ─────────────────────────────────────── */}
      {!isHidden && (
        <aside className={cn(
          "flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-all duration-200 h-screen sticky top-0",
          mobile && "fixed left-0 top-0 z-50 shadow-2xl",
          isCollapsed ? "w-14" : "w-[238px]"
        )}>

          {/* Brand */}
          <div className={cn(
            "h-16 flex items-center shrink-0 gap-2.5",
            isCollapsed ? "px-1.5 justify-center" : "px-3"
          )}>
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
                  <img src={appConfig.logoUrl} alt="Logo" className="h-[38px] w-[38px] object-contain rounded-[11px] bg-white p-[3px] flex-shrink-0 shadow-[0_1px_4px_rgba(16,24,40,.12)]" />
                ) : (
                  <div className="h-[38px] w-[38px] rounded-[11px] bg-sidebar-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-white font-semibold text-[13px]">AD</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[13px] text-foreground leading-tight break-words">
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
          <nav className="flex-1 px-3 py-1 overflow-y-auto min-h-0">
            {visibleDrishtiItems.length > 0 && (
              <>
                <SectionLabel
                  collapsed={isCollapsed}
                  open={sectionsOpen.drishti ?? true}
                  onToggle={() => toggleSection("drishti")}
                >
                  IT – Drishti
                </SectionLabel>
                {(isCollapsed || (sectionsOpen.drishti ?? true)) && visibleDrishtiItems.map(item => (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={item.href === "/" ? location === "/" : location.startsWith(item.href)}
                    collapsed={isCollapsed}
                  />
                ))}
              </>
            )}
            {visibleKpiItems.length > 0 && (
              <>
                <SectionLabel
                  collapsed={isCollapsed}
                  open={sectionsOpen.kpi ?? true}
                  onToggle={() => toggleSection("kpi")}
                >
                  Performance
                </SectionLabel>
                {(isCollapsed || (sectionsOpen.kpi ?? true)) && visibleKpiItems.map(item => (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={location.startsWith(item.href)}
                    collapsed={isCollapsed}
                  />
                ))}
              </>
            )}
            {visibleAssetItems.length > 0 && (
              <>
                <SectionLabel
                  collapsed={isCollapsed}
                  open={sectionsOpen.assets ?? true}
                  onToggle={() => toggleSection("assets")}
                >
                  IT Assets
                </SectionLabel>
                {(isCollapsed || (sectionsOpen.assets ?? true)) && visibleAssetItems.map(item => (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={location.startsWith(item.href)}
                    collapsed={isCollapsed}
                  />
                ))}
              </>
            )}
            {visibleItsmItems.length > 0 && (
              <>
                <SectionLabel
                  collapsed={isCollapsed}
                  open={sectionsOpen.itsm ?? true}
                  onToggle={() => toggleSection("itsm")}
                >
                  ITSM
                </SectionLabel>
                {(isCollapsed || (sectionsOpen.itsm ?? true)) && visibleItsmItems.map(item => (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={location === item.href || location.startsWith(item.href + "/")}
                    collapsed={isCollapsed}
                    badge={item.module === "itsm_my_approvals" ? myApprovals?.count : undefined}
                  />
                ))}
              </>
            )}
            {visibleComplianceItems.length > 0 && (
              <>
                <SectionLabel
                  collapsed={isCollapsed}
                  open={sectionsOpen.compliance ?? true}
                  onToggle={() => toggleSection("compliance")}
                >
                  Audit & Compliance
                </SectionLabel>
                {(isCollapsed || (sectionsOpen.compliance ?? true)) && visibleComplianceItems.map(item => (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={location === item.href || location.startsWith(item.href + "/")}
                    collapsed={isCollapsed}
                  />
                ))}
              </>
            )}
            {(isAdmin || isHR) && (
              <>
                <SectionLabel
                  collapsed={isCollapsed}
                  open={sectionsOpen.admin ?? true}
                  onToggle={() => toggleSection("admin")}
                >
                  Admin
                </SectionLabel>
                {(isCollapsed || (sectionsOpen.admin ?? true)) && (isAdmin ? ADMIN_ITEMS : ADMIN_ITEMS.filter(i => i.tab === "users")).map(item => (
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
            {!isAdmin && !isHR && visibleDrishtiItems.length === 0 && visibleKpiItems.length === 0 && visibleAssetItems.length === 0 && visibleItsmItems.length === 0 && (
              <div className="px-2.5 py-4 text-center">
                <p className="text-[10px] text-sidebar-foreground/30 leading-relaxed">
                  No access configured.<br />Contact your administrator.
                </p>
              </div>
            )}
          </nav>

          {/* User footer */}
          <div className="border-t border-sidebar-border shrink-0 pt-2">
            {!isCollapsed ? (
              <div className="px-2 pb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#4D93FA] to-[#1B63D6] flex items-center justify-center flex-shrink-0">
                    <span className="text-[12px] text-white font-semibold">{user?.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-foreground truncate">{user?.name}</div>
                    <span className={`text-[9px] px-1 py-px rounded border leading-none ${
                      user?.role === "admin" ? "border-primary/30 text-primary bg-accent" : "border-border text-muted-foreground"
                    }`}>{getRoleLabel(user?.role)}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted">
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
                      <DropdownMenuItem onClick={() => navigate("/my-assets")}><Laptop className="h-4 w-4 mr-2" /> My Assets</DropdownMenuItem>
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
                  className="h-8 w-8 rounded-full bg-gradient-to-br from-[#4D93FA] to-[#1B63D6] flex items-center justify-center"
                  onClick={handleLogout}
                >
                  <span className="text-[12px] text-white font-semibold">{user?.name?.[0]?.toUpperCase()}</span>
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      {mobile && !isHidden && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSidebarState("hidden")} />}

      {/* ─── Main ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <header className="h-14 border-b border-border bg-card/85 backdrop-blur-md flex items-center justify-between px-3 sm:px-6 shrink-0 gap-3 sticky top-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
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
                <span className="text-[18px] font-semibold text-foreground truncate">{currentPage}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Global Search */}
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden sm:flex items-center gap-2 text-xs bg-muted hover:bg-muted/80 border border-border rounded-md px-2.5 py-1.5 transition-colors text-muted-foreground hover:text-foreground"
              title="Search (Ctrl+K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden md:block">Search…</span>
              <kbd className="hidden md:block text-[9px] bg-background border border-border rounded px-1">⌘K</kbd>
            </button>

            <button
              onClick={cycle}
              className="flex items-center gap-1 text-xs bg-muted hover:bg-muted/80 border border-border rounded-md px-2.5 py-1.5 transition-colors font-semibold select-none text-foreground"
            >
              {unitLabels[unit]}
            </button>

            <NotificationBell />

            <button
              onClick={toggleTheme}
              className="flex items-center justify-center h-8 w-8 rounded-md border border-border bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2 h-9 pl-1 pr-3 border border-border rounded-full bg-card">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#4D93FA] to-[#1B63D6] flex items-center justify-center">
                    <span className="text-[11px] text-white font-semibold">{user?.name?.[0]?.toUpperCase()}</span>
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
                <DropdownMenuItem onClick={() => navigate("/my-assets")}><Laptop className="h-4 w-4 mr-2" /> My Assets</DropdownMenuItem>
                {isAdmin && <DropdownMenuItem onClick={() => navigate("/admin")}><Settings className="h-4 w-4 mr-2" /> Admin Panel</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive"><LogOut className="h-4 w-4 mr-2" /> Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-background flex flex-col">
          <div className="flex-1 px-3 sm:px-6 pt-4 sm:pt-[22px] pb-10">
            {children}
          </div>
          <footer className="shrink-0 border-t border-border/40 px-5 py-2 text-center text-[10px] text-muted-foreground/60">
            &copy; 2026 NIYTRI Technologies. All rights reserved.
          </footer>
        </div>
      </main>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
