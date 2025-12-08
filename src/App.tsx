import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
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
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
