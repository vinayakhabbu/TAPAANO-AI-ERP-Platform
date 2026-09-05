import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { lazy, Suspense } from "react";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Receivables = lazy(() => import("./pages/Receivables"));
const Payables = lazy(() => import("./pages/Payables"));
const GeneralLedger = lazy(() => import("./pages/GeneralLedger"));
const Banking = lazy(() => import("./pages/Banking"));
const PeriodClose = lazy(() => import("./pages/PeriodClose"));
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));
const ContainedModule = lazy(() => import("./pages/ContainedModule"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function AuthenticatedRoute() {
  const { user, profile, loading, signingOut, signOut } = useAuth();

  if (loading || signingOut) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading secure workspace…
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!profile?.org_id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <section className="w-full max-w-lg rounded-xl border border-border bg-card p-8 shadow-lg">
          <p className="text-sm font-medium text-destructive">Access unavailable</p>
          <h1 className="mt-2 text-2xl font-semibold">No authorized tenant membership was loaded.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            No financial data is available. Contact your tenant administrator, or sign out and use another account.
          </p>
          <button
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={signingOut}
            onClick={() => void signOut().catch(() => undefined)}
            type="button"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </section>
      </main>
    );
  }
  return <Outlet />;
}

function AppRoutes() {
  return (
    <Suspense fallback={(
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading TAPAANO…
      </div>
    )}>
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
    </Suspense>
  );
}

const App = () => (
  <AppErrorBoundary>
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
  </AppErrorBoundary>
);

export default App;
