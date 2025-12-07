import { useState } from "react";
import { Bell, Search, ChevronDown, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { CommandPalette } from "./CommandPalette";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-xl">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <button
            onClick={() => setCommandOpen(true)}
            className="relative hidden sm:flex items-center"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <div className="h-9 w-64 rounded-lg border border-border bg-muted/50 pl-9 pr-4 text-sm text-muted-foreground flex items-center cursor-pointer hover:bg-muted/70 transition-colors">
              Search...
            </div>
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              ⌘K
            </kbd>
          </button>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-muted-foreground" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-muted-foreground" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
          </Button>

          {/* Period Selector */}
          <Button variant="outline" className="gap-2 border-border text-sm hidden sm:flex">
            <span className="text-muted-foreground">Period:</span>
            <span className="font-medium">Nov 2024</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </header>
    </>
  );
}
