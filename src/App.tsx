import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { useLayoutEffect } from "react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Receivables from "./pages/Receivables";
import Payables from "./pages/Payables";
import Inventory from "./pages/Inventory";
import GeneralLedger from "./pages/GeneralLedger";
import FinancialReports from "./pages/FinancialReports";
import Banking from "./pages/Banking";
import PeriodClose from "./pages/PeriodClose";
import Settings from "./pages/Settings";
import Production from "./pages/Production";
import CRM from "./pages/CRM";
import Controlling from "./pages/Controlling";
import ServiceManagement from "./pages/ServiceManagement";
import Help from "./pages/Help";
import DecisionDesk from "./pages/DecisionDesk";
import Currency from "./pages/Currency";
import TaxManagement from "./pages/TaxManagement";
import HRPayroll from "./pages/HRPayroll";
import InvestorMetrics from "./pages/InvestorMetrics";
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

function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/ar" element={<Receivables />} />
        <Route path="/crm" element={<CRM />} />
        <Route path="/ap" element={<Payables />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/gl" element={<GeneralLedger />} />
        <Route path="/reports" element={<FinancialReports />} />
        <Route path="/banking" element={<Banking />} />
        <Route path="/close" element={<PeriodClose />} />
        <Route path="/production" element={<Production />} />
        <Route path="/controlling" element={<Controlling />} />
        <Route path="/service" element={<ServiceManagement />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/help" element={<Help />} />
        <Route path="/decisions" element={<DecisionDesk />} />
        <Route path="/currency" element={<Currency />} />
        <Route path="/tax" element={<TaxManagement />} />
        <Route path="/hr" element={<HRPayroll />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
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
