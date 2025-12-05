import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Receivables from "./pages/Receivables";
import Payables from "./pages/Payables";
import GeneralLedger from "./pages/GeneralLedger";
import Banking from "./pages/Banking";
import PeriodClose from "./pages/PeriodClose";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/ar" element={<Receivables />} />
          <Route path="/ap" element={<Payables />} />
          <Route path="/gl" element={<GeneralLedger />} />
          <Route path="/banking" element={<Banking />} />
          <Route path="/close" element={<PeriodClose />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
