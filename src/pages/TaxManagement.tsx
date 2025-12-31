import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Percent, MapPin, FileText, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { TaxCodeForm } from "@/components/forms/TaxCodeForm";
import { TaxRateForm } from "@/components/forms/TaxRateForm";
import { TaxJurisdictionForm } from "@/components/forms/TaxJurisdictionForm";
import {
  useTaxCodes,
  useTaxRates,
  useTaxJurisdictions,
  useTaxTransactions,
  useTaxFilingPeriods,
  useTaxSummary,
  TAX_TYPES,
} from "@/hooks/useTaxManagement";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString();
};

export default function TaxManagement() {
  const { data: taxCodes = [], isLoading: codesLoading } = useTaxCodes();
  const { data: taxRates = [], isLoading: ratesLoading } = useTaxRates();
  const { data: jurisdictions = [], isLoading: jurisdictionsLoading } = useTaxJurisdictions();
  const { data: transactions = [], isLoading: txLoading } = useTaxTransactions();
  const { data: filingPeriods = [], isLoading: filingsLoading } = useTaxFilingPeriods();
  const summary = useTaxSummary();

  const getTaxTypeLabel = (value: string) => {
    return TAX_TYPES.find((t) => t.value === value)?.label || value;
  };

  return (
    <AppLayout
      title="Tax Management"
      subtitle="Manage tax codes, rates, jurisdictions, and reporting"
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Sales Tax (MTD)</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.salesTax)}</div>
              <p className="text-xs text-muted-foreground">Collected this month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Purchase Tax (MTD)</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.purchaseTax)}</div>
              <p className="text-xs text-muted-foreground">Paid this month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Net Tax Payable</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.netTaxPayable < 0 ? "text-green-600" : ""}`}>
                {formatCurrency(summary.netTaxPayable)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.netTaxPayable < 0 ? "Credit" : "Due to authorities"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Filing Status</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.pendingFilings}</div>
              <p className="text-xs text-muted-foreground">
                {summary.overdueFilings > 0 && (
                  <span className="text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {summary.overdueFilings} overdue
                  </span>
                )}
                {summary.overdueFilings === 0 && "Pending filings"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="codes" className="space-y-4">
          <TabsList>
            <TabsTrigger value="codes">Tax Codes</TabsTrigger>
            <TabsTrigger value="rates">Tax Rates</TabsTrigger>
            <TabsTrigger value="jurisdictions">Jurisdictions</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="filings">Filing Periods</TabsTrigger>
          </TabsList>

          {/* Tax Codes */}
          <TabsContent value="codes">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Tax Codes
                </CardTitle>
                <TaxCodeForm />
              </CardHeader>
              <CardContent>
                {codesLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : taxCodes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No tax codes configured. Create your first tax code.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Recoverable</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taxCodes.map((code) => (
                        <TableRow key={code.id}>
                          <TableCell className="font-mono">{code.code}</TableCell>
                          <TableCell>{code.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{getTaxTypeLabel(code.tax_type)}</Badge>
                          </TableCell>
                          <TableCell>
                            {code.is_recoverable ? (
                              <Badge variant="secondary">Yes</Badge>
                            ) : (
                              <span className="text-muted-foreground">No</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={code.is_active ? "default" : "secondary"}>
                              {code.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tax Rates */}
          <TabsContent value="rates">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5" />
                  Tax Rates
                </CardTitle>
                <TaxRateForm />
              </CardHeader>
              <CardContent>
                {ratesLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : taxRates.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No tax rates configured. Add rates to your tax codes.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tax Code</TableHead>
                        <TableHead>Jurisdiction</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead>Effective From</TableHead>
                        <TableHead>Effective To</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taxRates.map((rate) => (
                        <TableRow key={rate.id}>
                          <TableCell className="font-medium">
                            {rate.tax_code?.code} - {rate.tax_code?.name}
                          </TableCell>
                          <TableCell>
                            {rate.jurisdiction?.name || (
                              <span className="text-muted-foreground">All</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(rate.rate).toFixed(2)}%
                          </TableCell>
                          <TableCell>{formatDate(rate.effective_from)}</TableCell>
                          <TableCell>
                            {rate.effective_to ? formatDate(rate.effective_to) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={rate.is_active ? "default" : "secondary"}>
                              {rate.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Jurisdictions */}
          <TabsContent value="jurisdictions">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Tax Jurisdictions
                </CardTitle>
                <TaxJurisdictionForm />
              </CardHeader>
              <CardContent>
                {jurisdictionsLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : jurisdictions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No jurisdictions configured. Add tax jurisdictions for location-based taxes.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jurisdictions.map((j) => (
                        <TableRow key={j.id}>
                          <TableCell className="font-mono">{j.code}</TableCell>
                          <TableCell>{j.name}</TableCell>
                          <TableCell>{j.country_code}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{j.jurisdiction_type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={j.is_active ? "default" : "secondary"}>
                              {j.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Tax Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {txLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : transactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No tax transactions recorded yet. Tax will be tracked when invoices and bills are created.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Tax Code</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Base Amount</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Tax Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>{formatDate(tx.transaction_date)}</TableCell>
                          <TableCell className="font-mono">{tx.tax_period}</TableCell>
                          <TableCell>{tx.tax_code?.code}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{tx.source_type}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(tx.base_amount)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(tx.tax_rate).toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(tx.tax_amount)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                tx.status === "filed"
                                  ? "default"
                                  : tx.status === "paid"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {tx.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Filing Periods */}
          <TabsContent value="filings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Tax Filing Periods
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filingsLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : filingPeriods.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No filing periods configured. Filing periods will be created based on your tax calendar.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Jurisdiction</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Sales Tax</TableHead>
                        <TableHead className="text-right">Purchase Tax</TableHead>
                        <TableHead className="text-right">Net Payable</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filingPeriods.map((period) => (
                        <TableRow key={period.id}>
                          <TableCell className="font-medium">{period.period_name}</TableCell>
                          <TableCell>{period.jurisdiction?.name}</TableCell>
                          <TableCell>
                            <span
                              className={
                                new Date(period.filing_due_date) < new Date() &&
                                period.status === "open"
                                  ? "text-destructive font-medium"
                                  : ""
                              }
                            >
                              {formatDate(period.filing_due_date)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(period.total_sales_tax)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(period.total_purchase_tax)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(period.net_tax_payable)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                period.status === "filed"
                                  ? "default"
                                  : period.status === "paid"
                                  ? "secondary"
                                  : period.status === "closed"
                                  ? "outline"
                                  : "destructive"
                              }
                            >
                              {period.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
