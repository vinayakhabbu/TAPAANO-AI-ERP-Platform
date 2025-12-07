import { useEffect, useState } from "react";
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
} from "lucide-react";

const navigationItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/", category: "Overview" },
  { icon: Target, label: "CRM", href: "/crm", category: "Sales" },
  { icon: Receipt, label: "Order to Cash", href: "/ar", category: "Sales" },
  { icon: Wrench, label: "Service Management", href: "/service", category: "Sales" },
  { icon: FileText, label: "Procure to Pay", href: "/ap", category: "Purchasing" },
  { icon: Package, label: "Inventory", href: "/inventory", category: "Operations" },
  { icon: Factory, label: "Production", href: "/production", category: "Operations" },
  { icon: BookOpen, label: "General Ledger", href: "/gl", category: "Accounting" },
  { icon: Building2, label: "Banking", href: "/banking", category: "Accounting" },
  { icon: PieChart, label: "Controlling", href: "/controlling", category: "Accounting" },
  { icon: BarChart3, label: "Financial Reports", href: "/reports", category: "Reports" },
  { icon: CalendarCheck, label: "Period Close", href: "/close", category: "Reports" },
  { icon: Settings, label: "Settings", href: "/settings", category: "System" },
  { icon: HelpCircle, label: "Help", href: "/help", category: "System" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();

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

  const handleSelect = (href: string) => {
    navigate(href);
    onOpenChange(false);
  };

  const groupedItems = navigationItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof navigationItems>);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Object.entries(groupedItems).map(([category, items], index) => (
          <div key={category}>
            {index > 0 && <CommandSeparator />}
            <CommandGroup heading={category}>
              {items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.category}`}
                  onSelect={() => handleSelect(item.href)}
                  className="cursor-pointer"
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
