import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export function RevenueChart() {
  const { data: chartData, isLoading } = useQuery({
    queryKey: ["revenue-expenses-chart"],
    queryFn: async () => {
      const months = Array.from({ length: 6 }, (_, i) => {
        const date = subMonths(new Date(), 5 - i);
        return {
          month: format(date, "MMM"),
          start: startOfMonth(date).toISOString(),
          end: endOfMonth(date).toISOString(),
        };
      });

      const results = await Promise.all(
        months.map(async ({ month, start, end }) => {
          // Get revenue from invoices
          const { data: invoices } = await supabase
            .from("invoices")
            .select("total")
            .gte("issue_date", start)
            .lte("issue_date", end);

          // Get expenses from bills
          const { data: bills } = await supabase
            .from("bills")
            .select("total")
            .gte("issue_date", start)
            .lte("issue_date", end);

          const revenue = invoices?.reduce((sum, inv) => sum + (inv.total || 0), 0) || 0;
          const expenses = bills?.reduce((sum, bill) => sum + (bill.total || 0), 0) || 0;

          return { month, revenue, expenses };
        })
      );

      return results;
    },
  });

  const hasData = chartData && chartData.some(d => d.revenue > 0 || d.expenses > 0);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="mt-1 h-4 w-36" />
          </div>
        </div>
        <Skeleton className="h-[280px] w-full" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground">Revenue vs Expenses</h3>
          <p className="text-sm text-muted-foreground">Last 6 months performance</p>
        </div>
        <div className="flex flex-col items-center justify-center h-[280px] text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No data yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create invoices and bills to see trends</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Revenue vs Expenses</h3>
          <p className="text-sm text-muted-foreground">Last 6 months performance</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-revenue" />
            <span className="text-sm text-muted-foreground">Revenue</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-expense" />
            <span className="text-sm text-muted-foreground">Expenses</span>
          </div>
        </div>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="hsl(217, 33%, 16%)"
            />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(222, 47%, 10%)",
                border: "1px solid hsl(217, 33%, 16%)",
                borderRadius: "8px",
                color: "hsl(210, 40%, 98%)",
              }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="hsl(160, 84%, 39%)"
              strokeWidth={2}
              fill="url(#revenueGradient)"
            />
            <Area
              type="monotone"
              dataKey="expenses"
              stroke="hsl(0, 72%, 51%)"
              strokeWidth={2}
              fill="url(#expenseGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
