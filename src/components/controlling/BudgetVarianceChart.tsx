import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Budget } from '@/hooks/useControlling';
import { useMemo } from 'react';

interface BudgetVarianceChartProps {
  budgets: Budget[];
}

const BudgetVarianceChart = ({ budgets }: BudgetVarianceChartProps) => {
  const chartData = useMemo(() => {
    return budgets
      .filter((b) => b.status === 'approved')
      .slice(0, 10)
      .map((b) => ({
        name: b.name.length > 15 ? b.name.slice(0, 15) + '...' : b.name,
        budgeted: b.total_amount,
        actual: 0, // Would come from budget lines aggregation
        variance: b.total_amount, // Placeholder
      }));
  }, [budgets]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(value);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Budget Overview</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground">
          No approved budgets. Create and approve budgets to see the chart.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" />
            <YAxis tickFormatter={formatCurrency} className="text-xs" />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
            />
            <Legend />
            <Bar dataKey="budgeted" name="Budgeted" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual" name="Actual" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default BudgetVarianceChart;
