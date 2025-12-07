import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOpportunities } from "@/hooks/useOpportunities";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { TrendingUp, TrendingDown, Target, Clock, DollarSign, Award } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, differenceInDays } from "date-fns";

const STAGE_ORDER = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

export function SalesAnalytics() {
  const { data: opportunities = [] } = useOpportunities();

  // Performance Metrics Calculations
  const closedWon = opportunities.filter(o => o.stage === 'closed_won');
  const closedLost = opportunities.filter(o => o.stage === 'closed_lost');
  const totalClosed = closedWon.length + closedLost.length;
  const winRate = totalClosed > 0 ? (closedWon.length / totalClosed) * 100 : 0;

  const avgDealSize = closedWon.length > 0 
    ? closedWon.reduce((sum, o) => sum + (o.expected_value || 0), 0) / closedWon.length 
    : 0;

  // Calculate average sales cycle (days from created to closed)
  const salesCycles = closedWon
    .filter(o => o.created_at && o.closed_at)
    .map(o => differenceInDays(new Date(o.closed_at!), new Date(o.created_at)));
  const avgSalesCycle = salesCycles.length > 0 
    ? Math.round(salesCycles.reduce((a, b) => a + b, 0) / salesCycles.length) 
    : 0;

  // Conversion rates by stage
  const stageConversions = STAGE_ORDER.slice(0, -2).map((stage, idx) => {
    const currentCount = opportunities.filter(o => 
      STAGE_ORDER.indexOf(o.stage) >= idx
    ).length;
    const nextCount = opportunities.filter(o => 
      STAGE_ORDER.indexOf(o.stage) >= idx + 1
    ).length;
    const rate = currentCount > 0 ? (nextCount / currentCount) * 100 : 0;
    return {
      stage: stage.charAt(0).toUpperCase() + stage.slice(1).replace('_', ' '),
      rate: Math.round(rate),
      count: opportunities.filter(o => o.stage === stage).length
    };
  });

  // Monthly trend data (past 6 months)
  const monthlyTrends = Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(new Date(), 5 - i);
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    
    const monthOpps = opportunities.filter(o => {
      const created = new Date(o.created_at);
      return created >= start && created <= end;
    });
    
    const monthWon = opportunities.filter(o => {
      if (o.stage !== 'closed_won' || !o.closed_at) return false;
      const closed = new Date(o.closed_at);
      return closed >= start && closed <= end;
    });
    
    const monthRevenue = monthWon.reduce((sum, o) => sum + (o.expected_value || 0), 0);
    
    return {
      month: format(date, 'MMM'),
      created: monthOpps.length,
      won: monthWon.length,
      revenue: monthRevenue,
      pipeline: monthOpps.reduce((sum, o) => sum + (o.expected_value || 0), 0)
    };
  });

  // Pipeline velocity (value moving through stages per month)
  const currentMonthStart = startOfMonth(new Date());
  const lastMonthStart = startOfMonth(subMonths(new Date(), 1));
  
  const currentMonthWonValue = closedWon
    .filter(o => o.closed_at && new Date(o.closed_at) >= currentMonthStart)
    .reduce((sum, o) => sum + (o.expected_value || 0), 0);
  
  const lastMonthWonValue = closedWon
    .filter(o => o.closed_at && new Date(o.closed_at) >= lastMonthStart && new Date(o.closed_at) < currentMonthStart)
    .reduce((sum, o) => sum + (o.expected_value || 0), 0);
  
  const velocityChange = lastMonthWonValue > 0 
    ? ((currentMonthWonValue - lastMonthWonValue) / lastMonthWonValue) * 100 
    : 0;

  // Deal source analysis (using the source field)
  const sourceData = opportunities.reduce<Record<string, { count: number; value: number; won: number }>>((acc, opp) => {
    const source = opp.source || 'Unknown';
    if (!acc[source]) {
      acc[source] = { count: 0, value: 0, won: 0 };
    }
    acc[source].count++;
    acc[source].value += opp.expected_value || 0;
    if (opp.stage === 'closed_won') acc[source].won++;
    return acc;
  }, {});

  const sourceChartData = Object.entries(sourceData).map(([name, data]) => ({
    name,
    deals: data.count,
    value: data.value,
    winRate: data.count > 0 ? Math.round((data.won / data.count) * 100) : 0
  }));

  // Stage distribution for pie chart
  const stageDistribution = STAGE_ORDER.map(stage => ({
    name: stage.charAt(0).toUpperCase() + stage.slice(1).replace('_', ' '),
    value: opportunities.filter(o => o.stage === stage).length,
    amount: opportunities.filter(o => o.stage === stage).reduce((sum, o) => sum + (o.expected_value || 0), 0)
  })).filter(s => s.value > 0);

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--revenue))', 'hsl(var(--overdue))'];

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <div className="space-y-6">
      {/* Key Performance Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
            <Target className="h-4 w-4 text-revenue" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{winRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {closedWon.length} won / {totalClosed} closed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Deal Size</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgDealSize)}</div>
            <p className="text-xs text-muted-foreground">
              From {closedWon.length} won deals
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Sales Cycle</CardTitle>
            <Clock className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgSalesCycle} days</div>
            <p className="text-xs text-muted-foreground">
              Lead to close
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline Velocity</CardTitle>
            {velocityChange >= 0 ? (
              <TrendingUp className="h-4 w-4 text-revenue" />
            ) : (
              <TrendingDown className="h-4 w-4 text-overdue" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(currentMonthWonValue)}</div>
            <p className="text-xs text-muted-foreground">
              {velocityChange >= 0 ? '+' : ''}{velocityChange.toFixed(1)}% vs last month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue & Deals Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
                  <YAxis yAxisId="left" className="text-xs fill-muted-foreground" />
                  <YAxis yAxisId="right" orientation="right" className="text-xs fill-muted-foreground" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'revenue') return [formatCurrency(value), 'Revenue'];
                      return [value, name.charAt(0).toUpperCase() + name.slice(1)];
                    }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--revenue))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--revenue))' }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="won" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="created" 
                    stroke="hsl(var(--chart-3))" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: 'hsl(var(--chart-3))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Stage Distribution Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stageDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {stageDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string, entry: any) => [
                      `${value} deals (${formatCurrency(entry.payload.amount)})`,
                      name
                    ]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stage Conversion Rates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageConversions} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" domain={[0, 100]} className="text-xs fill-muted-foreground" />
                  <YAxis type="category" dataKey="stage" width={100} className="text-xs fill-muted-foreground" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [`${value}%`, 'Conversion Rate']}
                  />
                  <Bar dataKey="rate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Source Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
                  <YAxis yAxisId="left" className="text-xs fill-muted-foreground" />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} className="text-xs fill-muted-foreground" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'value') return [formatCurrency(value), 'Pipeline Value'];
                      if (name === 'winRate') return [`${value}%`, 'Win Rate'];
                      return [value, 'Deals'];
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="deals" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="winRate" fill="hsl(var(--revenue))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4" />
            Quick Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-primary">{opportunities.length}</div>
              <div className="text-sm text-muted-foreground">Total Opportunities</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-revenue">
                {formatCurrency(opportunities.filter(o => !['closed_won', 'closed_lost'].includes(o.stage)).reduce((sum, o) => sum + (o.expected_value || 0), 0))}
              </div>
              <div className="text-sm text-muted-foreground">Active Pipeline</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-chart-3">
                {formatCurrency(closedWon.reduce((sum, o) => sum + (o.expected_value || 0), 0))}
              </div>
              <div className="text-sm text-muted-foreground">Total Won Value</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-overdue">
                {closedLost.length}
              </div>
              <div className="text-sm text-muted-foreground">Lost Deals</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
