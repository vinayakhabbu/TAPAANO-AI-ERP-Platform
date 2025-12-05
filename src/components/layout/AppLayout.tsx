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

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div
        className={cn(
          "transition-all duration-300",
          collapsed ? "ml-16" : "ml-64"
        )}
      >
        <Header title={title} subtitle={subtitle} />
        <main className="min-h-[calc(100vh-4rem)] p-6 pb-24">
          {children}
        </main>
      </div>
      <AIChatBar />
    </div>
  );
}
