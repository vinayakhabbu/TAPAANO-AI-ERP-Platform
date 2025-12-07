import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  BookOpen,
  Receipt,
  FileText,
  Building2,
  CalendarCheck,
  Settings,
  HelpCircle,
  Package,
  Factory,
  Target,
  PieChart,
  Wrench,
  BarChart3,
  Users,
  Building,
  ShoppingCart,
  ClipboardList,
  FileCheck,
  Warehouse,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  BookOpen,
  Receipt,
  FileText,
  Building2,
  CalendarCheck,
  Settings,
  HelpCircle,
  Package,
  Factory,
  Target,
  PieChart,
  Wrench,
  BarChart3,
  Users,
  Building,
  ShoppingCart,
  ClipboardList,
  FileCheck,
  Warehouse,
};

const navigationItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/", category: "Pages" },
  { icon: Target, label: "CRM", href: "/crm", category: "Pages" },
  { icon: Receipt, label: "Order to Cash", href: "/ar", category: "Pages" },
  { icon: Wrench, label: "Service Management", href: "/service", category: "Pages" },
  { icon: FileText, label: "Procure to Pay", href: "/ap", category: "Pages" },
  { icon: Package, label: "Inventory", href: "/inventory", category: "Pages" },
  { icon: Factory, label: "Production", href: "/production", category: "Pages" },
  { icon: BookOpen, label: "General Ledger", href: "/gl", category: "Pages" },
  { icon: Building2, label: "Banking", href: "/banking", category: "Pages" },
  { icon: PieChart, label: "Controlling", href: "/controlling", category: "Pages" },
  { icon: BarChart3, label: "Financial Reports", href: "/reports", category: "Pages" },
  { icon: CalendarCheck, label: "Period Close", href: "/close", category: "Pages" },
  { icon: Settings, label: "Settings", href: "/settings", category: "Pages" },
  { icon: HelpCircle, label: "Help", href: "/help", category: "Pages" },
];

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  href: string;
  icon: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Simple debounce hook
function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const debouncedQuery = useDebounceValue(searchQuery, 300);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [open]);

  // Search when debounced query changes
  useEffect(() => {
    async function performSearch() {
      if (debouncedQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("global-search", {
          body: { query: debouncedQuery },
        });

        if (error) throw error;
        setSearchResults(data?.results || []);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }

    performSearch();
  }, [debouncedQuery]);

  const handleSelect = (href: string) => {
    navigate(href);
    onOpenChange(false);
  };

  const getIcon = (iconName: string) => {
    return iconMap[iconName] || FileText;
  };

  // Group search results by type
  const groupedResults = searchResults.reduce((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = [];
    }
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const hasSearchResults = searchResults.length > 0;
  const showNavigation = !searchQuery || searchQuery.length < 2;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput 
        placeholder="Search anything... customers, invoices, products, pages..." 
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        {isSearching && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
          </div>
        )}

        {!isSearching && searchQuery.length >= 2 && !hasSearchResults && (
          <CommandEmpty>No results found for "{searchQuery}"</CommandEmpty>
        )}

        {/* Search Results */}
        {!isSearching && hasSearchResults && (
          <>
            {Object.entries(groupedResults).map(([type, results]) => (
              <CommandGroup key={type} heading={type}>
                {results.map((result) => {
                  const IconComponent = getIcon(result.icon);
                  return (
                    <CommandItem
                      key={result.id}
                      value={`${result.title} ${result.type} ${result.subtitle || ""}`}
                      onSelect={() => handleSelect(result.href)}
                      className="cursor-pointer"
                    >
                      <IconComponent className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span>{result.title}</span>
                        {result.subtitle && (
                          <span className="text-xs text-muted-foreground">{result.subtitle}</span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
            <CommandSeparator />
          </>
        )}

        {/* Navigation Pages - Show when no search or when search is too short */}
        {showNavigation && !isSearching && (
          <CommandGroup heading="Pages">
            {navigationItems.map((item) => (
              <CommandItem
                key={item.href}
                value={`${item.label} page navigation`}
                onSelect={() => handleSelect(item.href)}
                className="cursor-pointer"
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
