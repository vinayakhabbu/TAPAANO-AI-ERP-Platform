import { Calendar, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccountingPeriods } from "@/hooks/usePeriodClose";

export function CloseStatusCard() {
  const { data: periods = [], isLoading } = useAccountingPeriods();
  const latest = periods[0];

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="mt-4 h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Accounting period</h3>
      </div>
      {latest ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">{latest.entity_id}</span>
            <Badge>{latest.status.replace("_", " ")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {latest.period_start} through {latest.period_end}
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Browser controls are read-only.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No authoritative period is configured. Controlled posting remains unavailable.
        </p>
      )}
    </div>
  );
}
