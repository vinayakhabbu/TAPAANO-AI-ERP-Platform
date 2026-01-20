import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, Legend, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, Brain, RefreshCw, AlertTriangle, DollarSign, Calendar } from 'lucide-react';
import {
  useCashFlowPredictions,
  useRevenuePredictions,
  useGenerateCashFlowPrediction,
  useGenerateRevenuePrediction,
} from '@/hooks/usePredictions';

const PredictiveAnalytics = () => {
  const [forecastDays, setForecastDays] = useState(90);
  const { data: cashFlowPredictions = [], isLoading: cashLoading } = useCashFlowPredictions(forecastDays);
  const { data: revenuePredictions = [], isLoading: revenueLoading } = useRevenuePredictions();
  const generateCashFlow = useGenerateCashFlowPrediction();
  const generateRevenue = useGenerateRevenuePrediction();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

  // Calculate cash flow summary
  const cashFlowSummary = {
    minBalance: cashFlowPredictions.length > 0
      ? Math.min(...cashFlowPredictions.map(p => p.predicted_balance))
      : 0,
    avgConfidence: cashFlowPredictions.length > 0
      ? cashFlowPredictions.reduce((sum, p) => sum + (p.confidence_score || 0), 0) / cashFlowPredictions.length
      : 0,
    totalInflow: cashFlowPredictions.reduce((sum, p) => sum + p.predicted_inflow, 0),
    totalOutflow: cashFlowPredictions.reduce((sum, p) => sum + p.predicted_outflow, 0),
    lowCashDays: cashFlowPredictions.filter(p => p.predicted_balance < 10000).length,
  };

  // Format chart data
  const cashChartData = cashFlowPredictions.slice(0, 30).map(p => ({
    date: new Date(p.forecast_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    balance: p.predicted_balance,
    inflow: p.predicted_inflow,
    outflow: p.predicted_outflow,
    confidence: Math.round((p.confidence_score || 0) * 100),
  }));

  const revenueChartData = revenuePredictions.map(p => ({
    period: p.forecast_period,
    predicted: p.predicted_revenue,
    pipeline: p.predicted_pipeline_value,
    weighted: p.weighted_pipeline,
    confidence: Math.round((p.confidence_score || 0) * 100),
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Predictive Analytics
          </h2>
          <p className="text-muted-foreground">AI-powered financial forecasting and predictions</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => generateCashFlow.mutate({ days: forecastDays })}
            disabled={generateCashFlow.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${generateCashFlow.isPending ? 'animate-spin' : ''}`} />
            Refresh Cash Flow
          </Button>
          <Button
            variant="outline"
            onClick={() => generateRevenue.mutate()}
            disabled={generateRevenue.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${generateRevenue.isPending ? 'animate-spin' : ''}`} />
            Refresh Revenue
          </Button>
        </div>
      </div>

      <Tabs defaultValue="cash-flow" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cash-flow" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Cash Flow Forecast
          </TabsTrigger>
          <TabsTrigger value="revenue" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Revenue Prediction
          </TabsTrigger>
        </TabsList>

        {/* Cash Flow Tab */}
        <TabsContent value="cash-flow" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Min Projected Balance</CardTitle>
                {cashFlowSummary.minBalance < 10000 ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${cashFlowSummary.minBalance < 10000 ? 'text-destructive' : ''}`}>
                  {formatCurrency(cashFlowSummary.minBalance)}
                </div>
                <p className="text-xs text-muted-foreground">Next {forecastDays} days</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Expected Inflows</CardTitle>
                <TrendingUp className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">{formatCurrency(cashFlowSummary.totalInflow)}</div>
                <p className="text-xs text-muted-foreground">From AR & recurring</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Expected Outflows</CardTitle>
                <TrendingDown className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{formatCurrency(cashFlowSummary.totalOutflow)}</div>
                <p className="text-xs text-muted-foreground">From AP & payroll</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
                <Brain className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Math.round(cashFlowSummary.avgConfidence * 100)}%</div>
                <p className="text-xs text-muted-foreground">Model certainty</p>
              </CardContent>
            </Card>
          </div>

          {/* Cash Flow Chart */}
          <Card>
            <CardHeader>
              <CardTitle>30-Day Cash Flow Projection</CardTitle>
            </CardHeader>
            <CardContent>
              {cashLoading ? (
                <div className="h-80 flex items-center justify-center text-muted-foreground">Loading predictions...</div>
              ) : cashChartData.length === 0 ? (
                <div className="h-80 flex flex-col items-center justify-center text-muted-foreground">
                  <Brain className="h-12 w-12 mb-4 opacity-50" />
                  <p>No predictions available</p>
                  <Button variant="outline" className="mt-4" onClick={() => generateCashFlow.mutate({ days: 90 })}>
                    Generate Forecast
                  </Button>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={cashChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      name="Projected Balance"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.2)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Low Cash Warning */}
          {cashFlowSummary.lowCashDays > 0 && (
            <Card className="border-destructive bg-destructive/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                  <div>
                    <h4 className="font-semibold text-destructive">Cash Flow Warning</h4>
                    <p className="text-sm text-muted-foreground">
                      {cashFlowSummary.lowCashDays} days in the forecast period show projected balance below $10,000.
                      Consider accelerating receivables or deferring payables.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Prediction by Quarter</CardTitle>
            </CardHeader>
            <CardContent>
              {revenueLoading ? (
                <div className="h-80 flex items-center justify-center text-muted-foreground">Loading predictions...</div>
              ) : revenueChartData.length === 0 ? (
                <div className="h-80 flex flex-col items-center justify-center text-muted-foreground">
                  <Brain className="h-12 w-12 mb-4 opacity-50" />
                  <p>No revenue predictions available</p>
                  <Button variant="outline" className="mt-4" onClick={() => generateRevenue.mutate()}>
                    Generate Prediction
                  </Button>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="period" className="text-xs" />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="pipeline" name="Total Pipeline" fill="hsl(var(--muted-foreground) / 0.3)" />
                    <Bar dataKey="weighted" name="Weighted Pipeline" fill="hsl(var(--primary) / 0.6)" />
                    <Bar dataKey="predicted" name="Predicted Revenue" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Revenue Details Table */}
          {revenuePredictions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Prediction Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {revenuePredictions.map((prediction) => (
                    <div key={prediction.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="font-medium">{prediction.forecast_period}</div>
                        <div className="text-sm text-muted-foreground">
                          {(prediction.factors as any)?.opportunity_count || 0} opportunities
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatCurrency(prediction.predicted_revenue)}</div>
                        <Badge variant="outline" className="mt-1">
                          {Math.round((prediction.confidence_score || 0) * 100)}% confidence
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PredictiveAnalytics;
