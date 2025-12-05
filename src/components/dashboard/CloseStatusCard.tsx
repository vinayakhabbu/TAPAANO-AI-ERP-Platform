import { CheckCircle2, Circle, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useCloseTasks, useClosePeriods } from "@/hooks/usePeriodClose";
import { format, addDays } from "date-fns";

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
  const { data: periods, isLoading: periodsLoading } = useClosePeriods();
  const currentPeriod = periods?.[0];
  const { data: tasks, isLoading: tasksLoading } = useCloseTasks(currentPeriod?.id);

  const isLoading = periodsLoading || tasksLoading;
  const displayTasks = tasks?.slice(0, 6) || [];
  const completedCount = tasks?.filter((t) => t.status === "complete").length || 0;
  const totalCount = tasks?.length || 0;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Estimate completion based on current progress
  const estimatedCompletion = currentPeriod?.dueDate 
    ? format(new Date(currentPeriod.dueDate), "MMM d, yyyy")
    : format(addDays(new Date(), 5), "MMM d, yyyy");

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-1 h-4 w-32" />
          </div>
          <div className="text-right">
            <Skeleton className="h-8 w-12" />
            <Skeleton className="mt-1 h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-2 w-full mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!currentPeriod || displayTasks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="text-center py-8">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground">No Active Close Period</h3>
          <p className="text-sm text-muted-foreground">Create close tasks to track period-end progress</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{currentPeriod.name} Close</h3>
          <p className="text-sm text-muted-foreground">Period close progress</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-foreground">
            {completedCount}/{totalCount}
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
        {displayTasks.map((task) => {
          const config = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.pending;
          const Icon = config.icon;
          // Get initials from task name if no assignee
          const initials = task.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

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
                  {initials}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">Due date</span>
        <span className="text-sm font-medium text-foreground">{estimatedCompletion}</span>
      </div>
    </div>
  );
}
