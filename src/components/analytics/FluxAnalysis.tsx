import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowRight,
  AlertTriangle,
  Lightbulb,
  BarChart3,
  FileText,
  Sparkles,
  ChevronRight,
  DollarSign
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  Legend
} from "recharts";

interface FluxItem {
  account: string;
  accountCode: string;
  category: string;
  currentPeriod: number;
  priorPeriod: number;
  variance: number;
  variancePercent: number;
  isSignificant: boolean;
  aiExplanation?: string;
  aiRecommendation?: string;
  relatedTransactions?: number;
}

const mockFluxData: FluxItem[] = [
  {
    account: "Sales Revenue",
    accountCode: "4000",
    category: "Revenue",
    currentPeriod: 1250000,
    priorPeriod: 1100000,
    variance: 150000,
    variancePercent: 13.6,
    isSignificant: true,
    aiExplanation: "Revenue increase driven by new enterprise contracts signed in Q4. Key customers: TechCorp (+$80K), GlobalFin (+$45K), StartupXYZ (+$25K).",
    aiRecommendation: "Consider expanding sales team capacity to maintain momentum.",
    relatedTransactions: 47
  },
  {
    account: "Cost of Goods Sold",
    accountCode: "5000",
    category: "Cost of Sales",
    currentPeriod: 625000,
    priorPeriod: 550000,
    variance: 75000,
    variancePercent: 13.6,
    isSignificant: true,
    aiExplanation: "COGS increased proportionally with revenue. Gross margin maintained at 50%.",
    relatedTransactions: 156
  },
  {
    account: "Marketing Expense",
    accountCode: "6100",
    category: "Operating Expenses",
    currentPeriod: 185000,
    priorPeriod: 120000,
    variance: 65000,
    variancePercent: 54.2,
    isSignificant: true,
    aiExplanation: "Significant increase due to new digital advertising campaign and trade show participation. $40K for Google Ads, $25K for industry conference.",
    aiRecommendation: "Review ROI metrics for new campaigns. Consider A/B testing for ad spend optimization.",
    relatedTransactions: 23
  },
  {
    account: "Salaries & Wages",
    accountCode: "6200",
    category: "Operating Expenses",
    currentPeriod: 320000,
    priorPeriod: 290000,
    variance: 30000,
    variancePercent: 10.3,
    isSignificant: false,
    aiExplanation: "Increase from 3 new hires and annual merit increases.",
    relatedTransactions: 12
  },
  {
    account: "Office Supplies",
    accountCode: "6300",
    category: "Operating Expenses",
    currentPeriod: 8500,
    priorPeriod: 12000,
    variance: -3500,
    variancePercent: -29.2,
    isSignificant: true,
    aiExplanation: "Decrease due to work-from-home policy reducing in-office supply needs.",
    relatedTransactions: 34
  },
  {
    account: "Professional Fees",
    accountCode: "6400",
    category: "Operating Expenses",
    currentPeriod: 95000,
    priorPeriod: 45000,
    variance: 50000,
    variancePercent: 111.1,
    isSignificant: true,
    aiExplanation: "Spike due to IPO preparation legal and audit fees. One-time engagement with external counsel.",
    aiRecommendation: "Flag as non-recurring for forecasting purposes.",
    relatedTransactions: 8
  },
  {
    account: "Depreciation",
    accountCode: "6500",
    category: "Operating Expenses",
    currentPeriod: 42000,
    priorPeriod: 40000,
    variance: 2000,
    variancePercent: 5.0,
    isSignificant: false,
    aiExplanation: "Normal increase from new equipment additions.",
    relatedTransactions: 3
  },
  {
    account: "Interest Expense",
    accountCode: "7100",
    category: "Other Expenses",
    currentPeriod: 18000,
    priorPeriod: 22000,
    variance: -4000,
    variancePercent: -18.2,
    isSignificant: false,
    aiExplanation: "Decrease from principal paydown on term loan.",
    relatedTransactions: 6
  }
];

const trendData = [
  { month: "Jul", revenue: 980000, expenses: 720000 },
  { month: "Aug", revenue: 1020000, expenses: 745000 },
  { month: "Sep", revenue: 1050000, expenses: 760000 },
  { month: "Oct", revenue: 1100000, expenses: 785000 },
  { month: "Nov", revenue: 1150000, expenses: 820000 },
  { month: "Dec", revenue: 1250000, expenses: 875000 },
];

export function FluxAnalysis() {
  const [selectedPeriod, setSelectedPeriod] = useState("dec-2025");
  const [comparisonType, setComparisonType] = useState("prior-month");
  const [significanceThreshold, setSignificanceThreshold] = useState("10");
  const [selectedItem, setSelectedItem] = useState<FluxItem | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const significantItems = useMemo(() => 
    mockFluxData.filter(item => item.isSignificant),
    []
  );

  const totalVariance = useMemo(() => 
    mockFluxData.reduce((acc, item) => acc + item.variance, 0),
    []
  );

  const chartData = useMemo(() => 
    mockFluxData.map(item => ({
      name: item.account.length > 15 ? item.account.substring(0, 15) + '...' : item.account,
      variance: item.variance,
      percent: item.variancePercent
    })),
    []
  );

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                AI Flux Analysis
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Period-over-period variance analysis with AI-powered insights
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dec-2025">Dec 2025</SelectItem>
                  <SelectItem value="nov-2025">Nov 2025</SelectItem>
                  <SelectItem value="oct-2025">Oct 2025</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">vs</span>
              <Select value={comparisonType} onValueChange={setComparisonType}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prior-month">Prior Month</SelectItem>
                  <SelectItem value="prior-quarter">Prior Quarter</SelectItem>
                  <SelectItem value="prior-year">Prior Year</SelectItem>
                  <SelectItem value="budget">Budget</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Variance</div>
            <div className={`text-2xl font-bold ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalVariance)}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              {totalVariance >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              Net P&L impact
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Significant Variances</div>
            <div className="text-2xl font-bold text-orange-600">{significantItems.length}</div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              Exceeds {significanceThreshold}% threshold
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">AI Insights</div>
            <div className="text-2xl font-bold text-primary">
              {mockFluxData.filter(i => i.aiRecommendation).length}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <Sparkles className="h-4 w-4 text-primary" />
              Recommendations available
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Accounts Analyzed</div>
            <div className="text-2xl font-bold">{mockFluxData.length}</div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <DollarSign className="h-4 w-4" />
              GL accounts reviewed
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Variance Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Variance by Account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), "Variance"]}
                    labelStyle={{ fontWeight: 'bold' }}
                  />
                  <Bar dataKey="variance" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={index} 
                        fill={entry.variance >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* AI Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-start gap-2">
                <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800">Revenue Growth</p>
                  <p className="text-sm text-green-700">
                    Strong 13.6% increase driven by enterprise sales. Margin maintained.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
                <div>
                  <p className="font-medium text-orange-800">Watch Items</p>
                  <p className="text-sm text-orange-700">
                    Professional fees +111% - confirm one-time nature. Marketing +54% - validate ROI.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-2">
                <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800">Recommendations</p>
                  <p className="text-sm text-blue-700">
                    Flag IPO costs as non-recurring for clean EBITDA presentation.
                  </p>
                </div>
              </div>
            </div>

            <Button className="w-full gap-2">
              <FileText className="h-4 w-4" />
              Generate Full Report
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">6-Month Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-2))" strokeWidth={2} name="Revenue" />
                <Line type="monotone" dataKey="expenses" stroke="hsl(var(--chart-1))" strokeWidth={2} name="Expenses" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Detailed Variance Analysis</CardTitle>
            <Select value={significanceThreshold} onValueChange={setSignificanceThreshold}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Significance threshold" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Show &gt; 5% variance</SelectItem>
                <SelectItem value="10">Show &gt; 10% variance</SelectItem>
                <SelectItem value="20">Show &gt; 20% variance</SelectItem>
                <SelectItem value="all">Show all</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockFluxData.map((item, index) => (
              <div
                key={index}
                className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                  selectedItem?.account === item.account ? 'border-primary bg-muted/30' : ''
                }`}
                onClick={() => setSelectedItem(selectedItem?.account === item.account ? null : item)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-muted-foreground w-12">{item.accountCode}</div>
                    <div>
                      <div className="font-medium">{item.account}</div>
                      <div className="text-sm text-muted-foreground">{item.category}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Current</div>
                      <div className="font-medium">{formatCurrency(item.currentPeriod)}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Prior</div>
                      <div className="font-medium">{formatCurrency(item.priorPeriod)}</div>
                    </div>
                    <div className="text-right w-24">
                      <div className={`font-bold ${item.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.variance >= 0 ? '+' : ''}{formatCurrency(item.variance)}
                      </div>
                      <Badge 
                        variant={item.isSignificant ? "default" : "secondary"}
                        className={item.isSignificant ? (item.variance >= 0 ? 'bg-green-600' : 'bg-red-600') : ''}
                      >
                        {item.variancePercent >= 0 ? '+' : ''}{item.variancePercent.toFixed(1)}%
                      </Badge>
                    </div>
                    <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${
                      selectedItem?.account === item.account ? 'rotate-90' : ''
                    }`} />
                  </div>
                </div>

                {/* Expanded AI Explanation */}
                {selectedItem?.account === item.account && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-primary mt-1" />
                      <div>
                        <p className="text-sm font-medium">AI Analysis</p>
                        <p className="text-sm text-muted-foreground">{item.aiExplanation}</p>
                      </div>
                    </div>
                    {item.aiRecommendation && (
                      <div className="flex items-start gap-2">
                        <Lightbulb className="h-4 w-4 text-yellow-600 mt-1" />
                        <div>
                          <p className="text-sm font-medium">Recommendation</p>
                          <p className="text-sm text-muted-foreground">{item.aiRecommendation}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{item.relatedTransactions} related transactions</span>
                      <Button variant="link" size="sm" className="h-auto p-0">
                        View transactions →
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
