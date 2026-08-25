import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useLayoutEffect } from "react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Receivables from "./pages/Receivables";
import Payables from "./pages/Payables";
import GeneralLedger from "./pages/GeneralLedger";
import Banking from "./pages/Banking";
import PeriodClose from "./pages/PeriodClose";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import ContainedModule from "./pages/ContainedModule";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Prevent scroll restoration on navigation
function ScrollToTop() {
  const { pathname } = useLocation();
  
  useLayoutEffect(() => {
    // Don't scroll - keep current position
  }, [pathname]);
  
  return null;
}

function AuthenticatedRoute() {
  const { user, profile, loading, signingOut } = useAuth();

  if (loading || signingOut) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading secure workspace…
      </div>
    );
  }
  if (!user || !profile?.org_id) return <Navigate to="/auth" replace />;
  return <Outlet />;
}

function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route element={<AuthenticatedRoute />}>
          <Route path="/" element={<Index />} />
          <Route path="/ar" element={<Receivables />} />
          <Route path="/crm" element={<ContainedModule title="CRM" reason="Customer opportunity and forecasting policies have not been verified." />} />
          <Route path="/ap" element={<Payables />} />
          <Route path="/inventory" element={<ContainedModule title="Inventory" reason="Stock, transfer, count, receipt, valuation, and COGS workflows are not atomic or ledger-backed." />} />
          <Route path="/gl" element={<GeneralLedger />} />
          <Route path="/reports" element={<ContainedModule title="Financial reports" reason="Authoritative subledgers and report reconciliation are incomplete." />} />
          <Route path="/banking" element={<Banking />} />
          <Route path="/close" element={<PeriodClose />} />
          <Route path="/production" element={<ContainedModule title="Production" reason="Backflush, goods receipt, WIP, variance, and capacity histories are unverified." />} />
          <Route path="/controlling" element={<ContainedModule title="Controlling" reason="Allocations, prepaid schedules, budgets, projects, and asset outputs are unverified." />} />
          <Route path="/service" element={<ContainedModule title="Service" reason="Service-document mutation and revenue/accounting effects are not controlled." />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
          <Route path="/decisions" element={<ContainedModule title="Decision history" reason="Legacy Decision Ledger and autonomous evidence are not authoritative and are hidden." />} />
          <Route path="/currency" element={<ContainedModule title="Currency" reason="FX-rate governance and revaluation posting are incomplete." />} />
          <Route path="/tax" element={<ContainedModule title="Tax" reason="Tax master data, jurisdiction resolution, calculation, filing, and posting are unverified." />} />
          <Route path="/hr" element={<ContainedModule title="HR and payroll" reason="Payroll calculation, approval, payment, and GL posting are incomplete." />} />
          <Route path="/metrics" element={<ContainedModule title="Investor metrics" reason="Revenue, subscription, and forecast inputs are not authoritative." />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
