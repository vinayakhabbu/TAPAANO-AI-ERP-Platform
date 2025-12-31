import { useState } from "react";
import { Bell, Search, ChevronDown, Moon, Sun, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { CommandPalette } from "./CommandPalette";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, subMonths } from "date-fns";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(new Date());

  // Generate last 12 months for period selection
  const periods = Array.from({ length: 12 }, (_, i) => subMonths(new Date(), i));

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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="border-b border-border p-3">
                <h4 className="font-medium text-foreground">Notifications</h4>
                <p className="text-xs text-muted-foreground">0 unread</p>
              </div>
              <div className="p-8 text-center">
                <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            </PopoverContent>
          </Popover>

          {/* Period Selector */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 border-border text-sm hidden sm:flex">
                <span className="text-muted-foreground">Period:</span>
                <span className="font-medium">{format(selectedPeriod, "MMM yyyy")}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="end">
              <ScrollArea className="h-[280px]">
                {periods.map((period) => (
                  <button
                    key={period.toISOString()}
                    onClick={() => setSelectedPeriod(period)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted ${
                      format(selectedPeriod, "yyyy-MM") === format(period, "yyyy-MM")
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {format(period, "MMMM yyyy")}
                    {format(selectedPeriod, "yyyy-MM") === format(period, "yyyy-MM") && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </header>
    </>
  );
}
