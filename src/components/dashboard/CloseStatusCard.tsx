import { CheckCircle2, Circle, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const closeTasks = [
  { id: 1, name: "Bank Reconciliation", status: "complete", assignee: "JD" },
  { id: 2, name: "AP Cutoff Verification", status: "complete", assignee: "SM" },
  { id: 3, name: "AR Aging Review", status: "in_progress", assignee: "JD" },
  { id: 4, name: "Revenue Recognition", status: "in_progress", assignee: "MK" },
  { id: 5, name: "Accruals Review", status: "pending", assignee: "SM" },
  { id: 6, name: "Intercompany Eliminations", status: "pending", assignee: "MK" },
];

const statusConfig = {
  complete: {
    icon: CheckCircle2,
    color: "text-success",
    bg: "bg-success/10",
    label: "Complete",
  },
  in_progress: {
    icon: Clock,
    color: "text-cash",
    bg: "bg-cash/10",
    label: "In Progress",
  },
  pending: {
    icon: Circle,
    color: "text-muted-foreground",
    bg: "bg-muted",
    label: "Pending",
  },
  overdue: {
    icon: AlertCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
    label: "Overdue",
  },
};

export function CloseStatusCard() {
  const completedCount = closeTasks.filter((t) => t.status === "complete").length;
  const progress = (completedCount / closeTasks.length) * 100;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">November 2024 Close</h3>
          <p className="text-sm text-muted-foreground">Period close progress</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-foreground">
            {completedCount}/{closeTasks.length}
          </p>
          <p className="text-sm text-muted-foreground">Tasks Complete</p>
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium text-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="space-y-3">
        {closeTasks.map((task) => {
          const config = statusConfig[task.status as keyof typeof statusConfig];
          const Icon = config.icon;

          return (
            <div
              key={task.id}
              className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <Icon className={cn("h-4 w-4", config.color)} />
                <span className="text-sm font-medium text-foreground">{task.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    config.bg,
                    config.color
                  )}
                >
                  {config.label}
                </span>
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
                  {task.assignee}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">Estimated completion</span>
        <span className="text-sm font-medium text-foreground">Dec 5, 2024</span>
      </div>
    </div>
  );
}
