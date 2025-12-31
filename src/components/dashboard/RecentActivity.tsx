import { Clock } from "lucide-react";

export function RecentActivity() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
          <p className="text-sm text-muted-foreground">Latest transactions and events</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Clock className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-foreground">No recent activity</p>
        <p className="text-xs text-muted-foreground mt-1">Activity will appear here as you use the system</p>
      </div>
    </div>
  );
}
