import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useExchangeRates,
  useCurrencyRevaluations,
  formatCurrency,
} from "@/hooks/useCurrency";
import { ExchangeRateForm } from "@/components/forms/ExchangeRateForm";
import { CurrencyRevaluationDialog } from "@/components/currency/CurrencyRevaluationDialog";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, DollarSign, RefreshCw } from "lucide-react";

export default function Currency() {
  const { data: rates, isLoading: ratesLoading } = useExchangeRates();
  const { data: revaluations, isLoading: revalsLoading } =
    useCurrencyRevaluations();

  // Calculate summary stats
  const totalUnrealizedGain =
    revaluations
      ?.filter((r) => r.gain_loss_type === "unrealized" && r.gain_loss_amount > 0)
      .reduce((sum, r) => sum + r.gain_loss_amount, 0) || 0;

  const totalUnrealizedLoss =
    revaluations
      ?.filter((r) => r.gain_loss_type === "unrealized" && r.gain_loss_amount < 0)
      .reduce((sum, r) => sum + Math.abs(r.gain_loss_amount), 0) || 0;

  const totalRealizedGain =
    revaluations
      ?.filter((r) => r.gain_loss_type === "realized" && r.gain_loss_amount > 0)
      .reduce((sum, r) => sum + r.gain_loss_amount, 0) || 0;

  const totalRealizedLoss =
    revaluations
      ?.filter((r) => r.gain_loss_type === "realized" && r.gain_loss_amount < 0)
      .reduce((sum, r) => sum + Math.abs(r.gain_loss_amount), 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Multi-Currency</h1>
          <p className="text-muted-foreground">
            Manage exchange rates and track currency gains/losses
          </p>
        </div>
        <div className="flex gap-2">
          <CurrencyRevaluationDialog />
          <ExchangeRateForm />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Unrealized Gains
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalUnrealizedGain)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Unrealized Losses
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ({formatCurrency(totalUnrealizedLoss)})
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Realized Gains</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalRealizedGain)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Realized Losses</CardTitle>
            <DollarSign className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ({formatCurrency(totalRealizedLoss)})
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rates">
        <TabsList>
          <TabsTrigger value="rates">Exchange Rates</TabsTrigger>
          <TabsTrigger value="revaluations">Revaluations</TabsTrigger>
        </TabsList>

        <TabsContent value="rates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Exchange Rate History</CardTitle>
            </CardHeader>
            <CardContent>
              {ratesLoading ? (
                <p className="text-muted-foreground">Loading rates...</p>
              ) : rates?.length === 0 ? (
                <p className="text-muted-foreground">
                  No exchange rates configured. Add your first rate to get started.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates?.map((rate) => (
                      <TableRow key={rate.id}>
                        <TableCell>
                          {format(new Date(rate.rate_date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{rate.from_currency}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{rate.to_currency}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {rate.rate.toFixed(6)}
                        </TableCell>
                        <TableCell className="capitalize">{rate.rate_type}</TableCell>
                        <TableCell className="capitalize">
                          {rate.source || "manual"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revaluations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Currency Revaluations</CardTitle>
            </CardHeader>
            <CardContent>
              {revalsLoading ? (
                <p className="text-muted-foreground">Loading revaluations...</p>
              ) : revaluations?.length === 0 ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    No revaluations yet. Run a revaluation to calculate
                    unrealized gains/losses on foreign currency transactions.
                  </p>
                  <CurrencyRevaluationDialog />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Original</TableHead>
                      <TableHead className="text-right">Original Rate</TableHead>
                      <TableHead className="text-right">Current Rate</TableHead>
                      <TableHead className="text-right">Gain/Loss</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revaluations?.map((reval) => (
                      <TableRow key={reval.id}>
                        <TableCell>
                          {format(new Date(reval.revaluation_date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="capitalize">
                          {reval.source_type}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{reval.original_currency}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {reval.original_amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {reval.original_rate.toFixed(6)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {reval.current_rate.toFixed(6)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            reval.gain_loss_amount >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {reval.gain_loss_amount >= 0 ? "" : "("}
                          {formatCurrency(Math.abs(reval.gain_loss_amount))}
                          {reval.gain_loss_amount < 0 ? ")" : ""}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              reval.gain_loss_type === "realized"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {reval.gain_loss_type}
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
  );
}
