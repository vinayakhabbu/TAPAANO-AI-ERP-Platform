import { AppLayout } from "@/components/layout/AppLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useInvestorMetrics } from "@/hooks/useInvestorMetrics";
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  BarChart3,
  Percent,
  RefreshCw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const formatCurrency = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
};

const formatPct = (v: number) => `${v}%`;

// Cohort heatmap colours: retention % → background intensity
function retentionColor(pct: number) {
  if (pct >= 100) return "bg-success/20 text-success";
  if (pct >= 90) return "bg-success/10 text-success";
  if (pct >= 75) return "bg-warning/20 text-warning";
  if (pct >= 50) return "bg-warning/10 text-warning";
  return "bg-destructive/10 text-destructive";
}

export default function InvestorMetrics() {
  const metrics = useInvestorMetrics();

  const waterfallData = metrics.waterfall.map((m) => ({
    name: m.periodLabel.split(" ")[0], // "Jan"
    "New MRR": m.newMrr,
    "Expansion": m.expansionMrr,
    "Churned": -m.churnedMrr,
    "Contraction": -m.contractionMrr,
    mrr: m.mrr,
  }));

  // Build a simple NRR heatmap from the last 6 months
  const last6 = metrics.waterfall.slice(-6);

  return (
    <AppLayout
      title="Investor Metrics"
      subtitle="SaaS KPIs derived from your GL — MRR, ARR, NRR, Churn"
    >
      {/* KPI Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))
        ) : (
          <>
            <MetricCard
              title="MRR"
              value={formatCurrency(metrics.currentMrr)}
              change={{
                value: `${metrics.mrrGrowthRate > 0 ? "+" : ""}${metrics.mrrGrowthRate}% MoM`,
                isPositive: metrics.mrrGrowthRate >= 0,
              }}
              icon={DollarSign}
              colorClass="text-revenue"
              description="monthly recurring revenue"
            />
            <MetricCard
              title="ARR"
              value={formatCurrency(metrics.arr)}
              icon={TrendingUp}
              colorClass="text-primary"
              description="annualized run rate"
            />
            <MetricCard
              title="NRR"
              value={formatPct(metrics.nrr)}
              change={{
                value: metrics.nrr >= 100 ? "Net positive" : "Below 100%",
                isPositive: metrics.nrr >= 100,
              }}
              icon={RefreshCw}
              colorClass={metrics.nrr >= 100 ? "text-success" : "text-destructive"}
              description="net revenue retention"
            />
            <MetricCard
              title="Gross Churn"
              value={formatPct(metrics.grossChurnRate)}
              change={{
                value: metrics.grossChurnRate < 5 ? "Healthy" : "High churn",
                isPositive: metrics.grossChurnRate < 5,
              }}
              icon={TrendingDown}
              colorClass={metrics.grossChurnRate < 5 ? "text-success" : "text-destructive"}
              description="monthly customer churn"
            />
            <MetricCard
              title="Active Customers"
              value={metrics.activeCustomers.toString()}
              icon={Users}
              colorClass="text-primary"
              description="paying this month"
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* MRR Waterfall */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              MRR Waterfall (12 months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={waterfallData} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tickFormatter={(v) => formatCurrency(Math.abs(v))}
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(Math.abs(value)),
                      name,
                    ]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="New MRR" stackId="a" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Expansion" stackId="a" fill="hsl(var(--chart-2))" />
                  <Bar dataKey="Churned" stackId="b" fill="hsl(var(--destructive) / 0.7)" radius={[0, 0, 2, 2]} />
                  <Bar dataKey="Contraction" stackId="b" fill="hsl(var(--warning) / 0.6)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* NRR Retention Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Percent className="h-4 w-4 text-primary" />
              Revenue Retention (Last 6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="space-y-3">
                {last6.map((m) => (
                  <div key={m.period} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{m.periodLabel}</span>
                      <span className="font-medium text-foreground">
                        {formatCurrency(m.mrr)} MRR
                      </span>
                    </div>
                    <div className="flex h-8 gap-px overflow-hidden rounded-md">
                      {/* Stacked visual: new / expansion / base / churn */}
                      {m.mrr > 0 ? (
                        <>
                          <div
                            title={`Base MRR: ${formatCurrency(m.mrr - m.newMrr - m.expansionMrr)}`}
                            className="bg-primary/40"
                            style={{
                              flex: Math.max(0, m.mrr - m.newMrr - m.expansionMrr),
                            }}
                          />
                          <div
                            title={`New: ${formatCurrency(m.newMrr)}`}
                            className="bg-success/60"
                            style={{ flex: m.newMrr }}
                          />
                          <div
                            title={`Expansion: ${formatCurrency(m.expansionMrr)}`}
                            className="bg-chart-2/60"
                            style={{ flex: m.expansionMrr }}
                          />
                        </>
                      ) : (
                        <div className="flex-1 rounded-md bg-muted text-center text-xs leading-8 text-muted-foreground">
                          No revenue
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge
                        variant="outline"
                        className={cn("text-xs", retentionColor(m.nrr))}
                      >
                        NRR {m.nrr}%
                      </Badge>
                      {m.churnedMrr > 0 && (
                        <span className="text-destructive">
                          −{formatCurrency(m.churnedMrr)} churned
                        </span>
                      )}
                      {m.expansionMrr > 0 && (
                        <span className="text-success">
                          +{formatCurrency(m.expansionMrr)} expansion
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Monthly Cohort Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly MRR Movement</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {metrics.isLoading ? (
              <div className="p-6">
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Month
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        MRR
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-success">
                        New
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-chart-2">
                        Expansion
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-destructive">
                        Churn
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        Customers
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.waterfall.slice(-6).reverse().map((m, i) => (
                      <tr
                        key={m.period}
                        className={cn(
                          "border-b border-border/50 transition-colors hover:bg-muted/30",
                          i === 0 && "bg-muted/20 font-medium"
                        )}
                      >
                        <td className="px-4 py-2.5 text-foreground">
                          {m.periodLabel}
                          {i === 0 && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Current
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                          {formatCurrency(m.mrr)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-success">
                          {m.newMrr > 0 ? `+${formatCurrency(m.newMrr)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-chart-2">
                          {m.expansionMrr > 0 ? `+${formatCurrency(m.expansionMrr)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-destructive">
                          {m.churnedMrr > 0 ? `−${formatCurrency(m.churnedMrr)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {m.activeCustomers}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Customers by MRR */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Customers by MRR</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {metrics.isLoading ? (
              <div className="p-6">
                <Skeleton className="h-48 w-full" />
              </div>
            ) : metrics.topCustomers.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No invoice data for the current month
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {metrics.topCustomers.map((c, i) => {
                  const pct =
                    metrics.currentMrr > 0
                      ? Math.round((c.mrr / metrics.currentMrr) * 100)
                      : 0;
                  return (
                    <div key={c.customerId} className="flex items-center gap-4 px-6 py-3">
                      <span className="w-5 text-sm font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {c.customerName}
                        </p>
                        <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {formatCurrency(c.mrr)}
                        </p>
                        <p className="text-xs text-muted-foreground">{pct}% of MRR</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
