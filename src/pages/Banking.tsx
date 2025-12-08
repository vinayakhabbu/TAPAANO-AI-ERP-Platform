import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  Building2,
  ArrowUpRight,
  ArrowDownLeft,
  Link2,
  Sparkles,
  Check,
  X,
  Upload,
  Zap,
  Shield,
} from "lucide-react";
import { useBankAccounts, useBankTransactions } from "@/hooks/useBanking";
import { useAutoMatchTransactions } from "@/hooks/useBankingReconciliation";
import { format } from "date-fns";
import { MatchingRulesDialog } from "@/components/banking/MatchingRulesDialog";
import { StatementImportDialog } from "@/components/banking/StatementImportDialog";
import { PositivePayDialog } from "@/components/banking/PositivePayDialog";
import { toast } from "sonner";

const statusConfig = {
  pending: { label: "Unmatched", className: "bg-warning/10 text-warning" },
  matched: { label: "Matched", className: "bg-cash/10 text-cash" },
  reconciled: { label: "Reconciled", className: "bg-success/10 text-success" },
};

const Banking = () => {
  const [matchingRulesOpen, setMatchingRulesOpen] = useState(false);
  const [statementImportOpen, setStatementImportOpen] = useState(false);
  const [positivePayOpen, setPositivePayOpen] = useState(false);

  const { data: bankAccounts, isLoading: accountsLoading } = useBankAccounts();
  const { data: transactions, isLoading: transactionsLoading, refetch: refetchTransactions } = useBankTransactions();
  const autoMatchMutation = useAutoMatchTransactions();

  const totalBalance = bankAccounts?.reduce((sum, a) => sum + Number(a.current_balance), 0) || 0;
  const unmatchedCount = transactions?.filter((t) => t.status === "pending").length || 0;

  const handleAutoMatchAll = async () => {
    try {
      await autoMatchMutation.mutateAsync();
      toast.success("Auto-matching completed");
      refetchTransactions();
    } catch (error) {
      toast.error("Failed to auto-match transactions");
    }
  };

  return (
    <AppLayout title="Banking" subtitle="Bank accounts and transaction reconciliation">
      {/* Quick Actions Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Button variant="outline" className="gap-2" onClick={() => setStatementImportOpen(true)}>
          <Upload className="h-4 w-4" />
          Import Statement
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => setMatchingRulesOpen(true)}>
          <Zap className="h-4 w-4" />
          Matching Rules
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => setPositivePayOpen(true)}>
          <Shield className="h-4 w-4" />
          Positive Pay
        </Button>
      </div>

      {/* Bank Accounts */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {accountsLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))
        ) : bankAccounts?.length === 0 ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            No bank accounts configured
          </div>
        ) : (
          bankAccounts?.map((account) => (
            <div
              key={account.id}
              className="rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/50"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{account.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {account.bank_name || "Bank"} • ****{account.account_number?.slice(-4) || "****"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-foreground">
                  ${Number(account.current_balance).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">{account.currency}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary Row */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-8">
          <div>
            <p className="text-sm text-muted-foreground">Total Cash Balance</p>
            <p className="text-2xl font-bold text-foreground">
              ${totalBalance.toLocaleString()}
            </p>
          </div>
          <div className="h-10 w-px bg-border hidden sm:block" />
          <div>
            <p className="text-sm text-muted-foreground">Unmatched Transactions</p>
            <p className="text-2xl font-bold text-warning">{unmatchedCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={() => refetchTransactions()}>
            <RefreshCw className="h-4 w-4" />
            Sync Transactions
          </Button>
          <Button 
            className="gap-2" 
            onClick={handleAutoMatchAll}
            disabled={autoMatchMutation.isPending || unmatchedCount === 0}
          >
            <Sparkles className="h-4 w-4" />
            {autoMatchMutation.isPending ? "Matching..." : "Auto-Match All"}
          </Button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Recent Transactions</h3>
            <p className="text-sm text-muted-foreground">Match and reconcile bank entries</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search transactions..." className="w-64 pl-9" />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Date</TableHead>
              <TableHead className="text-muted-foreground">Description</TableHead>
              <TableHead className="text-muted-foreground text-right">Amount</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Match / Suggestion</TableHead>
              <TableHead className="text-muted-foreground w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactionsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                </TableRow>
              ))
            ) : transactions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              transactions?.map((tx) => {
                const status = statusConfig[tx.status as keyof typeof statusConfig] || statusConfig.pending;
                const amount = Number(tx.amount);
                const isCredit = amount > 0;
                const matchedTo = tx.matched_invoice?.invoice_number || tx.matched_bill?.bill_number;
                const suggestedAccount = tx.suggested_account ? 
                  `${tx.suggested_account.code} - ${tx.suggested_account.name}` : null;

                return (
                  <TableRow key={tx.id} className="border-border">
                    <TableCell className="text-muted-foreground">
                      {format(new Date(tx.transaction_date), "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "rounded-full p-1",
                            isCredit ? "bg-success/10" : "bg-muted"
                          )}
                        >
                          {isCredit ? (
                            <ArrowDownLeft className="h-3 w-3 text-success" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                        <span className="text-foreground">{tx.description || "Transaction"}</span>
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold",
                        isCredit ? "text-success" : "text-foreground"
                      )}
                    >
                      {isCredit ? "+" : ""}${Math.abs(amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", status.className)}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {matchedTo ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Link2 className="h-3 w-3 text-primary" />
                          <span className="text-primary">{matchedTo}</span>
                        </div>
                      ) : suggestedAccount ? (
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3 w-3 text-warning" />
                          <span className="text-sm text-muted-foreground">
                            {suggestedAccount}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {tx.status === "pending" && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-success hover:bg-success/10 hover:text-success"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialogs */}
      <MatchingRulesDialog open={matchingRulesOpen} onOpenChange={setMatchingRulesOpen} />
      <StatementImportDialog open={statementImportOpen} onOpenChange={setStatementImportOpen} />
      <PositivePayDialog open={positivePayOpen} onOpenChange={setPositivePayOpen} />
    </AppLayout>
  );
};

export default Banking;
