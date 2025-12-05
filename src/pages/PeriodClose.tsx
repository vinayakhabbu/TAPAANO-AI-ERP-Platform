import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Calendar,
  FileText,
  Users,
  Play,
  ChevronRight,
} from "lucide-react";
import { useCloseTasks, useClosePeriods, useUpdateCloseTask } from "@/hooks/usePeriodClose";
import { useState, useMemo } from "react";
import { format, differenceInDays } from "date-fns";

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

const PeriodClose = () => {
  const { data: periods, isLoading: periodsLoading } = useClosePeriods();
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  
  const currentPeriodId = selectedPeriod || periods?.[0]?.id;
  const { data: tasks, isLoading: tasksLoading } = useCloseTasks(currentPeriodId);
  const updateTask = useUpdateCloseTask();

  const currentPeriod = useMemo(() => {
    return periods?.find((p) => p.id === currentPeriodId);
  }, [periods, currentPeriodId]);

  const completedTasks = tasks?.filter((t) => t.status === "complete").length || 0;
  const totalTasks = tasks?.length || 0;
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const estimatedHours = tasks?.reduce((sum, t) => {
    // Estimate 2 hours per task as default
    return sum + 2;
  }, 0) || 0;

  const daysRemaining = currentPeriod?.dueDate 
    ? Math.max(0, differenceInDays(new Date(currentPeriod.dueDate), new Date()))
    : 0;

  const handleTaskClick = (taskId: string, currentStatus: string) => {
    // Cycle through statuses: pending -> in_progress -> complete
    const nextStatus = currentStatus === "pending" 
      ? "in_progress" 
      : currentStatus === "in_progress" 
        ? "complete" 
        : "pending";
    
    updateTask.mutate({ taskId, status: nextStatus as "pending" | "in_progress" | "complete" });
  };

  return (
    <AppLayout title="Period Close" subtitle="Month-end close management">
      {/* Current Period Header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
              <Calendar className="h-7 w-7 text-primary" />
            </div>
            <div>
              {periodsLoading ? (
                <>
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="mt-1 h-4 w-64" />
                </>
              ) : currentPeriod ? (
                <>
                  <h2 className="text-2xl font-bold text-foreground">{currentPeriod.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {currentPeriod.dueDate && `Due: ${format(new Date(currentPeriod.dueDate), "MMM d, yyyy")}`} • {completedTasks} of {totalTasks} tasks complete
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-foreground">No Active Period</h2>
                  <p className="text-sm text-muted-foreground">Create close tasks to start a period</p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              View Summary
            </Button>
            <Button className="gap-2">
              <Play className="h-4 w-4" />
              Continue Close
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium text-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        {/* Quick Stats */}
        <div className="mt-6 grid grid-cols-4 gap-4">
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Estimated Time</p>
            <p className="text-xl font-bold text-foreground">{estimatedHours} hrs</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Tasks Complete</p>
            <p className="text-xl font-bold text-foreground">{completedTasks}/{totalTasks}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">In Progress</p>
            <p className="text-xl font-bold text-foreground">
              {tasks?.filter((t) => t.status === "in_progress").length || 0}
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Days Remaining</p>
            <p className={cn("text-xl font-bold", daysRemaining <= 2 ? "text-warning" : "text-foreground")}>
              {daysRemaining}
            </p>
          </div>
        </div>
      </div>

      {/* Close Tasks */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Close Checklist</h3>
            <p className="text-sm text-muted-foreground">Tasks for {currentPeriod?.name || "current period"}</p>
          </div>
          <Button variant="outline" className="gap-2">
            <Users className="h-4 w-4" />
            Manage Assignees
          </Button>
        </div>

        <div className="divide-y divide-border">
          {tasksLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div>
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="mt-1 h-4 w-64" />
                  </div>
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))
          ) : tasks?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No close tasks found for this period
            </div>
          ) : (
            tasks?.map((task, index) => {
              const config = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.pending;
              const Icon = config.icon;

              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-center justify-between p-4 transition-colors hover:bg-muted/30 cursor-pointer",
                    task.status === "complete" && "opacity-60"
                  )}
                  onClick={() => handleTaskClick(task.id, task.status)}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn("rounded-lg p-2", config.bg)}>
                      <Icon className={cn("h-5 w-5", config.color)} />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{task.name}</p>
                      <p className="text-sm text-muted-foreground">{task.description || "No description"}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {task.due_date && (
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Due</p>
                        <p className="font-medium text-foreground">
                          {format(new Date(task.due_date), "MMM d")}
                        </p>
                      </div>
                    )}
                    <div className="w-24">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                          config.bg,
                          config.color
                        )}
                      >
                        {config.label}
                      </span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Previous Periods */}
      {periods && periods.length > 1 && (
        <div className="mt-6 rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <h3 className="text-lg font-semibold text-foreground">Previous Periods</h3>
            <p className="text-sm text-muted-foreground">Historical close records</p>
          </div>

          <div className="divide-y divide-border">
            {periods.slice(1).map((period) => (
              <div
                key={period.id}
                className="flex items-center justify-between p-4 hover:bg-muted/30 cursor-pointer"
                onClick={() => setSelectedPeriod(period.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "rounded-lg p-2",
                    period.status === "complete" ? "bg-success/10" : "bg-cash/10"
                  )}>
                    {period.status === "complete" ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <Clock className="h-5 w-5 text-cash" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{period.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {period.completedTasks}/{period.totalTasks} tasks • {period.progress}% complete
                    </p>
                  </div>
                </div>
                <Button variant="ghost" className="gap-2">
                  View Details
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default PeriodClose;
