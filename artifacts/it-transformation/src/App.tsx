import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmDialogHost } from "@/components/confirm-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { CurrencyProvider } from "@/contexts/currency-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import KpiDashboard from "@/pages/kpi-dashboard";
import NotFound from "@/pages/not-found";
import Checklist from "@/pages/checklist";
import Roadmap from "@/pages/roadmap";
import Retirements from "@/pages/retirements";
import Applications from "@/pages/applications";
import Aibom from "@/pages/aibom";
import Sbom from "@/pages/sbom";
import Login from "@/pages/login";
import Admin from "@/pages/admin";
import AdminUsers from "@/pages/admin-users";
import AdminRoles from "@/pages/admin-roles";
import Profile from "@/pages/profile";
import Reports from "@/pages/reports";
import Kpis from "@/pages/kpis";
import AssetDashboard from "@/pages/asset-dashboard";
import AssetRegistry from "@/pages/asset-registry";
import AssetVendors from "@/pages/asset-vendors";
import AssetLicenses from "@/pages/asset-licenses";
import AssetAllocations from "@/pages/asset-allocations";
import MaintenanceRecords from "@/pages/maintenance-records";
import ItsmDashboard from "@/pages/itsm-dashboard";
import ItsmIncidents from "@/pages/itsm-incidents";
import ItsmProblems from "@/pages/itsm-problems";
import ItsmChanges from "@/pages/itsm-changes";
import ItsmKnowledgeBase from "@/pages/itsm-knowledge-base";
import ItsmSlaPolicies from "@/pages/itsm-sla-policies";
import ItsmServiceRequests from "@/pages/itsm-service-requests";
import ItsmApprovalConfig from "@/pages/itsm-approval-config";
import { Skeleton } from "@/components/ui/skeleton";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 30000,
      gcTime: 300000,
    },
  },
});

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-2 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;
  if (adminOnly && user.role !== "admin") return <Redirect to="/" />;
  return <Component />;
}

function Router() {
  const { user, loading, defaultDashboard } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        {!user ? (
          <Redirect to="/login" />
        ) : (
          <Layout>
            <Switch>
              {/* Executive Dashboard — admin only; others redirect to their default */}
              <Route path="/">
                {user.role === "admin"
                  ? <Dashboard />
                  : <Redirect to={defaultDashboard || "/kpi-dashboard"} />
                }
              </Route>
              {/* KPI Dashboard for CXO / HR / employee */}
              <Route path="/kpi-dashboard">
                {(user.role === "cxo" || user.role === "kpi_employee" || user.role === "hr" || user.role === "admin")
                  ? <KpiDashboard />
                  : <Redirect to="/" />
                }
              </Route>
              <Route path="/checklist" component={Checklist} />
              <Route path="/roadmap" component={Roadmap} />
              <Route path="/retirements" component={Retirements} />
              <Route path="/applications" component={Applications} />
              <Route path="/aibom" component={Aibom} />
              <Route path="/sbom" component={Sbom} />
              <Route path="/reports" component={Reports} />
              <Route path="/kpis" component={Kpis} />
              <Route path="/assets" component={AssetDashboard} />
              <Route path="/asset-registry" component={AssetRegistry} />
              <Route path="/asset-vendors" component={AssetVendors} />
              <Route path="/asset-licenses" component={AssetLicenses} />
              <Route path="/asset-allocations" component={AssetAllocations} />
              <Route path="/maintenance-records" component={MaintenanceRecords} />
              <Route path="/itsm" component={ItsmDashboard} />
              <Route path="/itsm-incidents" component={ItsmIncidents} />
              <Route path="/itsm-problems" component={ItsmProblems} />
              <Route path="/itsm-changes" component={ItsmChanges} />
              <Route path="/itsm-kb" component={ItsmKnowledgeBase} />
              <Route path="/itsm-sla" component={ItsmSlaPolicies} />
              <Route path="/itsm-requests" component={ItsmServiceRequests} />
              <Route path="/itsm-approval" component={ItsmApprovalConfig} />
              <Route path="/profile" component={Profile} />
              <Route path="/admin/users">
                {user.role === "admin" ? <AdminUsers /> : <Redirect to={defaultDashboard || "/kpi-dashboard"} />}
              </Route>
              <Route path="/admin/roles">
                {user.role === "admin" ? <AdminRoles /> : <Redirect to={defaultDashboard || "/kpi-dashboard"} />}
              </Route>
              <Route path="/admin">
                {user.role === "admin" ? <Admin /> : <Redirect to={defaultDashboard || "/kpi-dashboard"} />}
              </Route>
              <Route component={NotFound} />
            </Switch>
          </Layout>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <AuthProvider>
        <CurrencyProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
            <ConfirmDialogHost />
          </TooltipProvider>
        </CurrencyProvider>
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
