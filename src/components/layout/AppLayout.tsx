import { ReactNode, useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AIChatBar } from "@/components/ai/AIChatBar";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";
const AI_PANEL_COLLAPSED_KEY = "ai-panel-collapsed";

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
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
        <Header title={title} subtitle={subtitle} />
        <main className="min-h-[calc(100vh-4rem)] p-6">
          {children}
        </main>
      </div>
      <AIChatBar collapsed={aiPanelCollapsed} onToggle={() => setAiPanelCollapsed(!aiPanelCollapsed)} />
    </div>
  );
}
