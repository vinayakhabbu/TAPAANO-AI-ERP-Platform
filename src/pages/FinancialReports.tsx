import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  Scale,
  Banknote,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Sparkles,
  Bot,
  LineChart,
  Brain,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { useFinancialReports } from "@/hooks/useFinancialReports";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { exportIncomeStatement, exportBalanceSheet } from "@/lib/pdfExport";
import { toast } from "@/hooks/use-toast";
import { FluxAnalysis } from "@/components/analytics/FluxAnalysis";
import { AIReportBuilder } from "@/components/analytics/AIReportBuilder";
import PredictiveAnalytics from "@/components/analytics/PredictiveAnalytics";
import { ContractAnalyzer } from "@/components/compliance/ContractAnalyzer";
import { ScheduledReportsManager } from "@/components/reports/ScheduledReportsManager";

const FinancialReports = () => {
  const [periodStart, setPeriodStart] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [periodEnd, setPeriodEnd] = useState(
    format(endOfMonth(new Date()), "yyyy-MM-dd")
  );

  const { incomeStatement, balanceSheet, cashFlowStatement, isLoading } =
    useFinancialReports(periodStart, periodEnd);

  const setQuickPeriod = (months: number) => {
    const end = endOfMonth(new Date());
    const start = startOfMonth(subMonths(new Date(), months - 1));
    setPeriodStart(format(start, "yyyy-MM-dd"));
    setPeriodEnd(format(end, "yyyy-MM-dd"));
  };

  const formatCurrency = (amount: number) => {
    const isNegative = amount < 0;
    return `${isNegative ? "(" : ""}$${Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}${isNegative ? ")" : ""}`;
  };

  return (
    <AppLayout
      title="Financial Reports"
      subtitle="Income Statement, Balance Sheet & Cash Flow"
    >
      {/* Period Selection */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Reporting Period:
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div>
                <Label htmlFor="start" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="start"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="w-40"
                />
              </div>
              <div>
                <Label htmlFor="end" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="end"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setQuickPeriod(1)}>
                This Month
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickPeriod(3)}>
                Last 3 Months
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickPeriod(12)}>
                YTD
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold text-success">
                {formatCurrency(incomeStatement?.revenue.total || 0)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expenses
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold text-destructive">
                {formatCurrency(incomeStatement?.expenses.total || 0)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Income
            </CardTitle>
            <Banknote className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p
                className={cn(
                  "text-2xl font-bold",
                  (incomeStatement?.netIncome || 0) >= 0
                    ? "text-success"
                    : "text-destructive"
                )}
              >
                {formatCurrency(incomeStatement?.netIncome || 0)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Balance Sheet
            </CardTitle>
            <Scale className="h-4 w-4 text-cash" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="flex items-center gap-2">
                {balanceSheet?.isBalanced ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <span className="text-sm font-medium text-success">Balanced</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <span className="text-sm font-medium text-destructive">
                      Out of Balance
                    </span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Report Tabs */}
      <Tabs defaultValue="income" className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList className="h-auto flex-wrap gap-1 p-1 bg-muted/50">
            <TabsTrigger value="income" className="gap-2 text-xs sm:text-sm">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Income Statement</span>
              <span className="sm:hidden">P&L</span>
            </TabsTrigger>
            <TabsTrigger value="balance" className="gap-2 text-xs sm:text-sm">
              <Scale className="h-4 w-4" />
              <span className="hidden sm:inline">Balance Sheet</span>
              <span className="sm:hidden">BS</span>
            </TabsTrigger>
            <TabsTrigger value="cashflow" className="gap-2 text-xs sm:text-sm">
              <Banknote className="h-4 w-4" />
              <span className="hidden sm:inline">Cash Flow</span>
              <span className="sm:hidden">CF</span>
            </TabsTrigger>
            <TabsTrigger value="flux" className="gap-2 text-xs sm:text-sm">
              <LineChart className="h-4 w-4" />
              <span className="hidden sm:inline">Flux Analysis</span>
              <span className="sm:hidden">Flux</span>
            </TabsTrigger>
            <TabsTrigger value="ai-builder" className="gap-2 text-xs sm:text-sm">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">AI Report Builder</span>
              <span className="sm:hidden">AI</span>
            </TabsTrigger>
            <TabsTrigger value="predictions" className="gap-2 text-xs sm:text-sm">
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">Predictions</span>
              <span className="sm:hidden">Pred</span>
            </TabsTrigger>
            <TabsTrigger value="contracts" className="gap-2 text-xs sm:text-sm">
              <Scale className="h-4 w-4" />
              <span className="hidden sm:inline">Contracts</span>
              <span className="sm:hidden">CTR</span>
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="gap-2 text-xs sm:text-sm">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Scheduled</span>
              <span className="sm:hidden">SCHED</span>
            </TabsTrigger>
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={isLoading}>
                <Download className="h-4 w-4" />
                Export
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Export Reports</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (incomeStatement) {
                    exportIncomeStatement(incomeStatement, periodStart, periodEnd);
                    toast({ title: "PDF Exported", description: "Income Statement downloaded" });
                  }
                }}
                disabled={!incomeStatement}
              >
                <FileText className="h-4 w-4 mr-2" />
                Income Statement (PDF)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (balanceSheet) {
                    exportBalanceSheet(balanceSheet, periodEnd);
                    toast({ title: "PDF Exported", description: "Balance Sheet downloaded" });
                  }
                }}
                disabled={!balanceSheet}
              >
                <Scale className="h-4 w-4 mr-2" />
                Balance Sheet (PDF)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Income Statement */}
        <TabsContent value="income">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Income Statement (Profit & Loss)</span>
                <Badge variant="outline">
                  {periodStart} to {periodEnd}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableBody>
                    {/* Revenue Section */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={2} className="font-bold text-foreground">
                        REVENUE
                      </TableCell>
                    </TableRow>
                    {incomeStatement?.revenue.accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="pl-8">
                          <span className="text-muted-foreground">{account.code}</span>
                          <span className="ml-4">{account.name}</span>
                        </TableCell>
                        <TableCell className="text-right font-medium text-success">
                          {formatCurrency(account.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {incomeStatement?.revenue.accounts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="pl-8 text-muted-foreground">
                          No revenue accounts
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold">Total Revenue</TableCell>
                      <TableCell className="text-right font-bold text-success">
                        {formatCurrency(incomeStatement?.revenue.total || 0)}
                      </TableCell>
                    </TableRow>

                    {/* Expenses Section */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={2} className="font-bold text-foreground">
                        EXPENSES
                      </TableCell>
                    </TableRow>
                    {incomeStatement?.expenses.accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="pl-8">
                          <span className="text-muted-foreground">{account.code}</span>
                          <span className="ml-4">{account.name}</span>
                        </TableCell>
                        <TableCell className="text-right font-medium text-destructive">
                          {formatCurrency(account.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {incomeStatement?.expenses.accounts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="pl-8 text-muted-foreground">
                          No expense accounts
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold">Total Expenses</TableCell>
                      <TableCell className="text-right font-bold text-destructive">
                        {formatCurrency(incomeStatement?.expenses.total || 0)}
                      </TableCell>
                    </TableRow>

                    {/* Net Income */}
                    <TableRow className="bg-primary/10">
                      <TableCell className="font-bold text-lg">NET INCOME</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-bold text-lg",
                          (incomeStatement?.netIncome || 0) >= 0
                            ? "text-success"
                            : "text-destructive"
                        )}
                      >
                        {formatCurrency(incomeStatement?.netIncome || 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Balance Sheet */}
        <TabsContent value="balance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Balance Sheet</span>
                <Badge variant="outline">As of {periodEnd}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Assets */}
                  <div>
                    <Table>
                      <TableBody>
                        <TableRow className="bg-cash/10">
                          <TableCell colSpan={2} className="font-bold text-cash">
                            ASSETS
                          </TableCell>
                        </TableRow>
                        {balanceSheet?.assets.accounts.map((account) => (
                          <TableRow key={account.id}>
                            <TableCell className="pl-8">
                              <span className="text-muted-foreground">
                                {account.code}
                              </span>
                              <span className="ml-4">{account.name}</span>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(account.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {balanceSheet?.assets.accounts.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={2}
                              className="pl-8 text-muted-foreground"
                            >
                              No asset accounts
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow className="border-t-2 bg-cash/5">
                          <TableCell className="font-bold">TOTAL ASSETS</TableCell>
                          <TableCell className="text-right font-bold text-cash">
                            {formatCurrency(balanceSheet?.totalAssets || 0)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  {/* Liabilities & Equity */}
                  <div>
                    <Table>
                      <TableBody>
                        {/* Liabilities */}
                        <TableRow className="bg-warning/10">
                          <TableCell colSpan={2} className="font-bold text-warning">
                            LIABILITIES
                          </TableCell>
                        </TableRow>
                        {balanceSheet?.liabilities.accounts.map((account) => (
                          <TableRow key={account.id}>
                            <TableCell className="pl-8">
                              <span className="text-muted-foreground">
                                {account.code}
                              </span>
                              <span className="ml-4">{account.name}</span>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(account.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {balanceSheet?.liabilities.accounts.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={2}
                              className="pl-8 text-muted-foreground"
                            >
                              No liability accounts
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow className="border-t">
                          <TableCell className="font-semibold">
                            Total Liabilities
                          </TableCell>
                          <TableCell className="text-right font-semibold text-warning">
                            {formatCurrency(balanceSheet?.liabilities.total || 0)}
                          </TableCell>
                        </TableRow>

                        {/* Equity */}
                        <TableRow className="bg-primary/10">
                          <TableCell colSpan={2} className="font-bold text-primary">
                            EQUITY
                          </TableCell>
                        </TableRow>
                        {balanceSheet?.equity.accounts.map((account) => (
                          <TableRow key={account.id}>
                            <TableCell className="pl-8">
                              <span className="text-muted-foreground">
                                {account.code}
                              </span>
                              <span className="ml-4">{account.name}</span>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(account.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell className="pl-8 italic">
                            Current Period Net Income
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(incomeStatement?.netIncome || 0)}
                          </TableCell>
                        </TableRow>
                        <TableRow className="border-t-2 bg-primary/5">
                          <TableCell className="font-bold">
                            TOTAL LIABILITIES & EQUITY
                          </TableCell>
                          <TableCell className="text-right font-bold text-primary">
                            {formatCurrency(
                              balanceSheet?.totalLiabilitiesAndEquity || 0
                            )}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cash Flow Statement */}
        <TabsContent value="cashflow">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Statement of Cash Flows</span>
                <Badge variant="outline">
                  {periodStart} to {periodEnd}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableBody>
                    {/* Operating Activities */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={2} className="font-bold">
                        CASH FLOWS FROM OPERATING ACTIVITIES
                      </TableCell>
                    </TableRow>
                    {cashFlowStatement?.operating.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="pl-8">{item.description}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t">
                      <TableCell className="font-semibold">
                        Net Cash from Operating
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(
                          cashFlowStatement?.operating.reduce(
                            (sum, i) => sum + i.amount,
                            0
                          ) || 0
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Investing Activities */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={2} className="font-bold">
                        CASH FLOWS FROM INVESTING ACTIVITIES
                      </TableCell>
                    </TableRow>
                    {cashFlowStatement?.investing.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="pl-8 text-muted-foreground">
                          No investing activities
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="border-t">
                      <TableCell className="font-semibold">
                        Net Cash from Investing
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(0)}
                      </TableCell>
                    </TableRow>

                    {/* Financing Activities */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={2} className="font-bold">
                        CASH FLOWS FROM FINANCING ACTIVITIES
                      </TableCell>
                    </TableRow>
                    {cashFlowStatement?.financing.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="pl-8 text-muted-foreground">
                          No financing activities
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="border-t">
                      <TableCell className="font-semibold">
                        Net Cash from Financing
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(0)}
                      </TableCell>
                    </TableRow>

                    {/* Summary */}
                    <TableRow className="bg-primary/10">
                      <TableCell className="font-bold text-lg">
                        NET CHANGE IN CASH
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-bold text-lg",
                          (cashFlowStatement?.netCashFlow || 0) >= 0
                            ? "text-success"
                            : "text-destructive"
                        )}
                      >
                        {formatCurrency(cashFlowStatement?.netCashFlow || 0)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Cash at End of Period</TableCell>
                      <TableCell className="text-right font-medium text-cash">
                        {formatCurrency(cashFlowStatement?.endingCash || 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Flux Analysis Tab */}
        <TabsContent value="flux">
          <FluxAnalysis />
        </TabsContent>

        {/* AI Report Builder Tab */}
        <TabsContent value="ai-builder">
          <AIReportBuilder />
        </TabsContent>

        {/* Predictions Tab */}
        <TabsContent value="predictions">
          <PredictiveAnalytics />
        </TabsContent>

        {/* Contract Analyzer Tab */}
        <TabsContent value="contracts">
          <ContractAnalyzer />
        </TabsContent>

        {/* Scheduled Reports Tab */}
        <TabsContent value="scheduled">
          <ScheduledReportsManager />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default FinancialReports;
