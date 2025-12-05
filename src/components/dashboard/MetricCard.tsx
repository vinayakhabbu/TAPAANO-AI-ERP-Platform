import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  change?: {
    value: string;
    isPositive: boolean;
  };
  icon: LucideIcon;
  colorClass?: string;
  description?: string;
}

export function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  colorClass = "text-primary",
  description,
}: MetricCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-primary/50 hover:shadow-glow-sm">
      {/* Background glow effect */}
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition-all duration-300 group-hover:bg-primary/10" />
      
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={cn("mt-2 text-3xl font-bold tracking-tight", colorClass)}>
              {value}
            </p>
          </div>
          <div className={cn("rounded-lg bg-muted p-2.5", colorClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>

        {(change || description) && (
          <div className="mt-4 flex items-center gap-2">
            {change && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  change.isPositive
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {change.isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {change.value}
              </span>
            )}
            {description && (
              <span className="text-xs text-muted-foreground">{description}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
