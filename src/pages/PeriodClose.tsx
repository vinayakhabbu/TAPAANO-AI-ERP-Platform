import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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

const closePeriods = [
  { id: "2024-11", name: "November 2024", status: "in_progress", progress: 33, dueDate: "2024-12-05" },
  { id: "2024-10", name: "October 2024", status: "complete", progress: 100, dueDate: "2024-11-05" },
  { id: "2024-09", name: "September 2024", status: "complete", progress: 100, dueDate: "2024-10-05" },
];

const closeTasks = [
  { id: 1, name: "Bank Reconciliation", description: "Reconcile all bank accounts", status: "complete", assignee: "John D.", estimatedHours: 2, completedAt: "2024-12-01" },
  { id: 2, name: "AP Cutoff Verification", description: "Verify all invoices in correct period", status: "complete", assignee: "Sarah M.", estimatedHours: 1, completedAt: "2024-12-02" },
  { id: 3, name: "AR Aging Review", description: "Review and update AR aging report", status: "in_progress", assignee: "John D.", estimatedHours: 1.5, completedAt: null },
  { id: 4, name: "Revenue Recognition", description: "Apply ASC 606 revenue recognition", status: "in_progress", assignee: "Mike K.", estimatedHours: 3, completedAt: null },
  { id: 5, name: "Accruals Review", description: "Review and adjust accrued expenses", status: "pending", assignee: "Sarah M.", estimatedHours: 2, completedAt: null },
  { id: 6, name: "Intercompany Eliminations", description: "Process IC eliminations", status: "pending", assignee: "Mike K.", estimatedHours: 2, completedAt: null },
  { id: 7, name: "Depreciation & Amortization", description: "Run depreciation schedules", status: "pending", assignee: "John D.", estimatedHours: 1, completedAt: null },
  { id: 8, name: "Management Review", description: "Final review and sign-off", status: "pending", assignee: "CFO", estimatedHours: 1, completedAt: null },
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

const PeriodClose = () => {
  const currentPeriod = closePeriods[0];
  const completedTasks = closeTasks.filter((t) => t.status === "complete").length;
  const totalTasks = closeTasks.length;
  const progress = (completedTasks / totalTasks) * 100;

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
              <h2 className="text-2xl font-bold text-foreground">{currentPeriod.name}</h2>
              <p className="text-sm text-muted-foreground">
                Due: {currentPeriod.dueDate} • {completedTasks} of {totalTasks} tasks complete
              </p>
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
            <p className="text-xl font-bold text-foreground">13.5 hrs</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Time Spent</p>
            <p className="text-xl font-bold text-foreground">4.5 hrs</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Team Members</p>
            <p className="text-xl font-bold text-foreground">4</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Days Remaining</p>
            <p className="text-xl font-bold text-warning">2</p>
          </div>
        </div>
      </div>

      {/* Close Tasks */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Close Checklist</h3>
            <p className="text-sm text-muted-foreground">Tasks for {currentPeriod.name}</p>
          </div>
          <Button variant="outline" className="gap-2">
            <Users className="h-4 w-4" />
            Manage Assignees
          </Button>
        </div>

        <div className="divide-y divide-border">
          {closeTasks.map((task, index) => {
            const config = statusConfig[task.status as keyof typeof statusConfig];
            const Icon = config.icon;

            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-center justify-between p-4 transition-colors hover:bg-muted/30",
                  task.status === "complete" && "opacity-60"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className={cn("rounded-lg p-2", config.bg)}>
                    <Icon className={cn("h-5 w-5", config.color)} />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{task.name}</p>
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Assignee</p>
                    <p className="font-medium text-foreground">{task.assignee}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Est. Time</p>
                    <p className="font-medium text-foreground">{task.estimatedHours}h</p>
                  </div>
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
          })}
        </div>
      </div>

      {/* Previous Periods */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="text-lg font-semibold text-foreground">Previous Periods</h3>
          <p className="text-sm text-muted-foreground">Historical close records</p>
        </div>

        <div className="divide-y divide-border">
          {closePeriods.slice(1).map((period) => (
            <div
              key={period.id}
              className="flex items-center justify-between p-4 hover:bg-muted/30"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-success/10 p-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{period.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Closed on {period.dueDate}
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
    </AppLayout>
  );
};

export default PeriodClose;
