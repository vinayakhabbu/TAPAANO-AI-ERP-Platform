import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AIChatBar } from "@/components/ai/AIChatBar";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-64">
        <Header title={title} subtitle={subtitle} />
        <main className="min-h-[calc(100vh-4rem)] p-6 pb-24">
          {children}
        </main>
      </div>
      <AIChatBar />
    </div>
  );
}
