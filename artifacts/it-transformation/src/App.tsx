import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { CurrencyProvider } from "@/contexts/currency-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import Checklist from "@/pages/checklist";
import Roadmap from "@/pages/roadmap";
import Retirements from "@/pages/retirements";
import Applications from "@/pages/applications";
import Aibom from "@/pages/aibom";
import Sbom from "@/pages/sbom";
import Login from "@/pages/login";
import Admin from "@/pages/admin";
import Profile from "@/pages/profile";
import Reports from "@/pages/reports";
import TechKpis from "@/pages/tech-kpis";
import Kpis from "@/pages/kpis";
import { Skeleton } from "@/components/ui/skeleton";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false },
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
  const { user, loading } = useAuth();

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
              <Route path="/" component={Dashboard} />
              <Route path="/checklist" component={Checklist} />
              <Route path="/roadmap" component={Roadmap} />
              <Route path="/retirements" component={Retirements} />
              <Route path="/applications" component={Applications} />
              <Route path="/aibom" component={Aibom} />
              <Route path="/sbom" component={Sbom} />
              <Route path="/reports" component={Reports} />
              <Route path="/tech-kpis" component={TechKpis} />
              <Route path="/kpis" component={Kpis} />
              <Route path="/profile" component={Profile} />
              <Route path="/admin">
                {user.role === "admin" ? <Admin /> : <Redirect to="/" />}
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
          </TooltipProvider>
        </CurrencyProvider>
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
