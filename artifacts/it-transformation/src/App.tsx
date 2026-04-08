import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import Checklist from "@/pages/checklist";
import Roadmap from "@/pages/roadmap";
import Retirements from "@/pages/retirements";
import Applications from "@/pages/applications";
import Aibom from "@/pages/aibom";
import Sbom from "@/pages/sbom";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/checklist" component={Checklist} />
        <Route path="/roadmap" component={Roadmap} />
        <Route path="/retirements" component={Retirements} />
        <Route path="/applications" component={Applications} />
        <Route path="/aibom" component={Aibom} />
        <Route path="/sbom" component={Sbom} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
