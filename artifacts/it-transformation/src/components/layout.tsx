import React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  CheckSquare, 
  Map, 
  Archive, 
  Server, 
  BrainCircuit, 
  ShieldCheck 
} from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Executive Summary", icon: LayoutDashboard },
    { href: "/checklist", label: "IT Master Checklist", icon: CheckSquare },
    { href: "/roadmap", label: "Transformation Roadmap", icon: Map },
    { href: "/retirements", label: "App Retirement Plan", icon: Archive },
    { href: "/applications", label: "Application Inventory", icon: Server },
    { href: "/aibom", label: "AI Bill of Materials", icon: BrainCircuit },
    { href: "/sbom", label: "Software Bill of Materials", icon: ShieldCheck },
  ];

  return (
    <div className="flex min-h-screen w-full bg-background font-sans text-foreground">
      <aside className="w-64 flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar-accent/50">
          <div className="font-bold text-lg text-primary tracking-tight">ASHIKA IT <span className="text-muted-foreground font-medium text-sm">TransForm</span></div>
        </div>
        <nav className="p-4 space-y-1">
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
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-8">
          <h1 className="text-lg font-semibold">IT Transformation Planning Suite</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Currency: INR (₹) Lakhs</span>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
