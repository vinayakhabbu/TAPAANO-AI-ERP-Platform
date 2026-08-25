import { Bot, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AIChatBarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AIChatBar({ collapsed, onToggle }: AIChatBarProps) {
  return (
    <aside
      className={cn(
        "fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-border bg-card transition-all duration-300",
        collapsed ? "w-14" : "w-80",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        aria-label={collapsed ? "Open Agent River status" : "Close Agent River status"}
        className="absolute -left-3 top-20 z-50 h-6 w-6 rounded-full border border-border bg-background shadow-md"
      >
        {collapsed ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </Button>

      <div className={cn("flex h-16 items-center border-b border-border", collapsed ? "justify-center" : "gap-3 px-4")}>
        <Bot className="h-5 w-5 text-muted-foreground" />
        {!collapsed && <span className="font-semibold">Agent River</span>}
      </div>

      {!collapsed && (
        <div className="p-4 text-sm text-muted-foreground">
          Agent River is unavailable while its authorization and accounting actions are being audited.
          No prompts are sent and no automated action is performed.
        </div>
      )}
    </aside>
  );
}
