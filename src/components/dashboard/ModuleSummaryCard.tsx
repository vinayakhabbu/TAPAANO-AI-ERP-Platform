import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface ModuleSummaryCardProps {
  title: string;
  href: string;
  icon: LucideIcon;
  stats: {
    label: string;
    value: string | number;
    highlight?: boolean;
  }[];
  accentColor?: string;
}

export function ModuleSummaryCard({
  title,
  href,
  icon: Icon,
  stats,
  accentColor = "text-primary",
}: ModuleSummaryCardProps) {
  return (
    <Link
      to={href}
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/50 hover:shadow-glow-sm"
    >
      {/* Background gradient on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      
      <div className="relative">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className={cn("rounded-lg bg-muted p-2", accentColor)}>
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat, index) => (
            <div key={index} className="space-y-1">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={cn(
                "text-lg font-bold",
                stat.highlight ? accentColor : "text-foreground"
              )}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
