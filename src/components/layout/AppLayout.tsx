import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AIChatBar } from "@/components/ai/AIChatBar";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";
const AI_PANEL_COLLAPSED_KEY = "ai-panel-collapsed";

const ROUTE_SUBTITLES: Record<string, string> = {
  "/": "Enterprise overview across all modules",
  "/crm": "Manage customers, opportunities, and sales pipeline",
  "/receivables": "Track invoices, payments, and customer balances",
  "/payables": "Manage vendor bills, payments, and aging",
  "/banking": "Bank accounts, reconciliation, and cash management",
  "/inventory": "Products, warehouses, and stock levels",
  "/production": "Manufacturing orders, BOMs, and work centers",
  "/general-ledger": "Chart of accounts and journal entries",
  "/controlling": "Cost centers, budgets, and profitability analysis",
  "/period-close": "Month-end close tasks and checklists",
  "/financial-reports": "Balance sheet, P&L, and cash flow statements",
  "/hr": "Employees, departments, and payroll management",
  "/tax": "Tax codes, rates, jurisdictions, and filings",
  "/currency": "Exchange rates and multi-currency management",
  "/service": "Service calls, contracts, and warranties",
  "/decisions": "AI decision audit trail and approvals",
  "/settings": "Organization and user preferences",
  "/help": "Documentation and support resources",
};

const getSubtitleForRoute = (pathname: string): string => {
  if (ROUTE_SUBTITLES[pathname]) {
    return ROUTE_SUBTITLES[pathname];
  }
  const baseRoute = "/" + pathname.split("/")[1];
  return ROUTE_SUBTITLES[baseRoute] || "Enterprise resource planning";
};

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === "true";
  });

  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(() => {
    const saved = localStorage.getItem(AI_PANEL_COLLAPSED_KEY);
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem(AI_PANEL_COLLAPSED_KEY, String(aiPanelCollapsed));
  }, [aiPanelCollapsed]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "ml-16" : "ml-64",
          aiPanelCollapsed ? "mr-14" : "mr-80"
        )}
      >
        <Header subtitle={subtitle || getSubtitleForRoute(location.pathname)} />
        <main className="min-h-[calc(100vh-4rem)] p-6">
          {children}
        </main>
      </div>
      <AIChatBar collapsed={aiPanelCollapsed} onToggle={() => setAiPanelCollapsed(!aiPanelCollapsed)} />
    </div>
  );
}
