import { 
  Plus, 
  FileText, 
  Receipt, 
  Package, 
  Factory, 
  Wrench,
  Users,
  Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const quickActions = [
  { label: "New Invoice", icon: FileText, href: "/ar", color: "text-revenue" },
  { label: "New Bill", icon: Receipt, href: "/ap", color: "text-overdue" },
  { label: "New Order", icon: Package, href: "/inventory", color: "text-cash" },
  { label: "Production", icon: Factory, href: "/production", color: "text-primary" },
  { label: "Service Call", icon: Wrench, href: "/service", color: "text-warning" },
  { label: "New Customer", icon: Users, href: "/crm", color: "text-success" },
];

export function QuickActions() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
        <p className="text-sm text-muted-foreground">Frequently used operations</p>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.label} to={action.href}>
              <Button
                variant="outline"
                className="w-full h-auto flex-col gap-2 py-4 hover:border-primary/50 hover:bg-accent/50"
              >
                <Icon className={`h-5 w-5 ${action.color}`} />
                <span className="text-xs font-medium">{action.label}</span>
              </Button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
