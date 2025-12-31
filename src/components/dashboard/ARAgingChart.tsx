import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Receipt } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const colors = {
  current: "hsl(160, 84%, 39%)",
  "1-30": "hsl(199, 89%, 48%)",
  "31-60": "hsl(38, 92%, 50%)",
  "61-90": "hsl(25, 95%, 53%)",
  "90+": "hsl(0, 72%, 51%)",
};

export function ARAgingChart() {
  const { data: agingData, isLoading } = useQuery({
    queryKey: ["ar-aging-chart"],
    queryFn: async () => {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("total, due_date, amount_paid")
        .in("status", ["sent", "overdue"]);

      const today = new Date();
      const buckets = {
        current: 0,
        "1-30": 0,
        "31-60": 0,
        "61-90": 0,
        "90+": 0,
      };

      invoices?.forEach((inv) => {
        const outstanding = (inv.total || 0) - (inv.amount_paid || 0);
        if (outstanding <= 0) return;

        const daysOverdue = differenceInDays(today, new Date(inv.due_date));

        if (daysOverdue <= 0) buckets.current += outstanding;
        else if (daysOverdue <= 30) buckets["1-30"] += outstanding;
        else if (daysOverdue <= 60) buckets["31-60"] += outstanding;
        else if (daysOverdue <= 90) buckets["61-90"] += outstanding;
        else buckets["90+"] += outstanding;
      });

      return [
        { name: "Current", value: buckets.current, fill: colors.current },
        { name: "1-30 days", value: buckets["1-30"], fill: colors["1-30"] },
        { name: "31-60 days", value: buckets["31-60"], fill: colors["31-60"] },
        { name: "61-90 days", value: buckets["61-90"], fill: colors["61-90"] },
        { name: "90+ days", value: buckets["90+"], fill: colors["90+"] },
      ];
    },
  });

  const total = agingData?.reduce((sum, item) => sum + item.value, 0) || 0;
  const hasData = total > 0;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="mt-1 h-4 w-48" />
          </div>
          <div className="text-right">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="mt-1 h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-[240px] w-full" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">AR Aging</h3>
            <p className="text-sm text-muted-foreground">Outstanding receivables by age</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-foreground">$0</p>
            <p className="text-sm text-muted-foreground">Total Outstanding</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center h-[240px] text-center">
          <Receipt className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No outstanding receivables</p>
          <p className="text-xs text-muted-foreground mt-1">Create invoices to track aging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">AR Aging</h3>
          <p className="text-sm text-muted-foreground">Outstanding receivables by age</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-foreground">${total.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">Total Outstanding</p>
        </div>
      </div>

      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={agingData} barSize={40}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="hsl(217, 33%, 16%)"
            />
            <XAxis
              dataKey="name"
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
              formatter={(value: number) => [`$${value.toLocaleString()}`, "Amount"]}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {agingData?.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
        {agingData?.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: item.fill }}
            />
            <span className="text-xs text-muted-foreground">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
