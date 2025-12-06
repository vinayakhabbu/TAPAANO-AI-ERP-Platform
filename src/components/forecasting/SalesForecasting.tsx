import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  ComposedChart,
  Area,
} from "recharts";
import {
  TrendingUp,
  Target,
  DollarSign,
  Plus,
  Calendar,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { useSalesForecastData, useCreateSalesTarget, useSalesTargets } from "@/hooks/useSalesForecasting";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, addMonths } from "date-fns";
import { toast } from "sonner";

export function SalesForecasting() {
  const { pipelineForecast, historicalTrends, targetVsActual, isLoading } = useSalesForecastData();
  const { data: targets } = useSalesTargets();
  const createTarget = useCreateSalesTarget();
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [targetType, setTargetType] = useState("monthly");
  const [targetAmount, setTargetAmount] = useState("");

  const handleCreateTarget = async () => {
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    if (targetType === "monthly") {
      periodStart = startOfMonth(addMonths(now, 1));
      periodEnd = endOfMonth(addMonths(now, 1));
    } else {
      periodStart = startOfQuarter(addMonths(now, 3));
      periodEnd = endOfQuarter(addMonths(now, 3));
    }

    try {
      await createTarget.mutateAsync({
        period_type: targetType,
        period_start: format(periodStart, "yyyy-MM-dd"),
        period_end: format(periodEnd, "yyyy-MM-dd"),
        target_amount: parseFloat(targetAmount),
      });
      toast.success("Sales target created");
      setTargetDialogOpen(false);
      setTargetAmount("");
    } catch (error) {
      toast.error("Failed to create target");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const monthlyProgress = targetVsActual.monthly.target > 0
    ? (targetVsActual.monthly.actual / targetVsActual.monthly.target) * 100
    : 0;

  const quarterlyProgress = targetVsActual.quarterly.target > 0
    ? (targetVsActual.quarterly.actual / targetVsActual.quarterly.target) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Target vs Actual Section */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h4 className="font-semibold text-foreground">Monthly Target</h4>
            </div>
            {targetVsActual.monthly.target > 0 ? (
              <span className={`text-sm font-medium ${monthlyProgress >= 100 ? "text-success" : monthlyProgress >= 70 ? "text-warning" : "text-destructive"}`}>
                {monthlyProgress.toFixed(0)}%
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">No target set</span>
            )}
          </div>
          
          {targetVsActual.monthly.target > 0 ? (
            <>
              <Progress value={Math.min(monthlyProgress, 100)} className="h-3 mb-3" />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Actual</p>
                  <p className="font-semibold text-foreground">${targetVsActual.monthly.actual.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pipeline</p>
                  <p className="font-semibold text-primary">${targetVsActual.monthly.pipeline.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className="font-semibold text-foreground">${targetVsActual.monthly.target.toLocaleString()}</p>
                </div>
              </div>
              {targetVsActual.monthly.projected < targetVsActual.monthly.target && (
                <div className="mt-3 flex items-center gap-2 text-sm text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Gap of ${(targetVsActual.monthly.target - targetVsActual.monthly.projected).toLocaleString()}</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-2">Set a monthly target to track progress</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-cash" />
              <h4 className="font-semibold text-foreground">Quarterly Target</h4>
            </div>
            {targetVsActual.quarterly.target > 0 ? (
              <span className={`text-sm font-medium ${quarterlyProgress >= 100 ? "text-success" : quarterlyProgress >= 70 ? "text-warning" : "text-destructive"}`}>
                {quarterlyProgress.toFixed(0)}%
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">No target set</span>
            )}
          </div>
          
          {targetVsActual.quarterly.target > 0 ? (
            <>
              <Progress value={Math.min(quarterlyProgress, 100)} className="h-3 mb-3" />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Actual</p>
                  <p className="font-semibold text-foreground">${targetVsActual.quarterly.actual.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pipeline</p>
                  <p className="font-semibold text-primary">${targetVsActual.quarterly.pipeline.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className="font-semibold text-foreground">${targetVsActual.quarterly.target.toLocaleString()}</p>
                </div>
              </div>
              {targetVsActual.quarterly.projected >= targetVsActual.quarterly.target && (
                <div className="mt-3 flex items-center gap-2 text-sm text-success">
                  <CheckCircle className="h-4 w-4" />
                  <span>On track to meet target</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-2">Set a quarterly target to track progress</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Target Button */}
      <div className="flex justify-end">
        <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Set Target
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set Sales Target</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Period Type</Label>
                <Select value={targetType} onValueChange={setTargetType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Amount</Label>
                <Input
                  type="number"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder="100000"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTargetDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateTarget} disabled={!targetAmount || createTarget.isPending}>
                  {createTarget.isPending ? "Creating..." : "Create Target"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pipeline Forecast Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h4 className="font-semibold text-foreground">Pipeline Forecast (Next 6 Months)</h4>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={pipelineForecast}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
              />
              <Legend />
              <Area type="monotone" dataKey="bestCase" name="Best Case" fill="hsl(var(--primary) / 0.1)" stroke="hsl(var(--primary))" strokeDasharray="5 5" />
              <Bar dataKey="weighted" name="Weighted" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="committed" name="Committed (70%+)" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Historical Trends Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-5 w-5 text-cash" />
          <h4 className="font-semibold text-foreground">Historical Revenue (Past 6 Months)</h4>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historicalTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
              />
              <Legend />
              <Line type="monotone" dataKey="actual" name="Invoiced Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
              <Line type="monotone" dataKey="won" name="Won Deals" stroke="hsl(var(--success))" strokeWidth={2} dot={{ fill: "hsl(var(--success))" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sales Targets List */}
      {targets && targets.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h4 className="font-semibold text-foreground mb-4">Configured Targets</h4>
          <div className="space-y-2">
            {targets.slice(0, 5).map((target) => (
              <div key={target.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <span className="font-medium text-foreground capitalize">{target.period_type}</span>
                  <span className="text-muted-foreground mx-2">•</span>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(target.period_start), "MMM d")} - {format(new Date(target.period_end), "MMM d, yyyy")}
                  </span>
                </div>
                <span className="font-semibold text-foreground">${target.target_amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
