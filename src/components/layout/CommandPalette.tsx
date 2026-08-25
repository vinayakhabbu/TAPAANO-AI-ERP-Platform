import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Package,
  PieChart,
  Settings,
  Target,
  Wrench,
} from "lucide-react";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const navigationItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Target, label: "CRM", href: "/crm" },
  { icon: FileText, label: "Order to Cash", href: "/ar" },
  { icon: Wrench, label: "Service Management", href: "/service" },
  { icon: FileText, label: "Procure to Pay", href: "/ap" },
  { icon: Package, label: "Inventory", href: "/inventory" },
  { icon: BookOpen, label: "General Ledger", href: "/gl" },
  { icon: Building2, label: "Banking", href: "/banking" },
  { icon: PieChart, label: "Controlling", href: "/controlling" },
  { icon: BarChart3, label: "Financial Reports", href: "/reports" },
  { icon: CalendarCheck, label: "Period Close", href: "/close" },
  { icon: Settings, label: "Settings", href: "/settings" },
  { icon: HelpCircle, label: "Help", href: "/help" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const select = (href: string) => {
    navigate(href);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Find a page…" />
      <CommandList>
        <CommandGroup heading="Pages">
          {navigationItems.map((item) => (
            <CommandItem key={item.href} value={item.label} onSelect={() => select(item.href)}>
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
