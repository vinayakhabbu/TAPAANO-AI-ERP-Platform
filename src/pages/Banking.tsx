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
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  Filter,
  Download,
  RefreshCw,
  MoreHorizontal,
  Building2,
  ArrowUpRight,
  ArrowDownLeft,
  Link2,
  Sparkles,
  Check,
  X,
} from "lucide-react";

const bankAccounts = [
  { id: "1", name: "Operating Account", bank: "Chase Bank", number: "****4521", balance: 856200, currency: "USD" },
  { id: "2", name: "Payroll Account", bank: "Chase Bank", number: "****7834", balance: 125000, currency: "USD" },
  { id: "3", name: "Savings Account", bank: "Wells Fargo", number: "****2156", balance: 218800, currency: "USD" },
];

const transactions = [
  { id: "1", date: "2024-12-05", description: "Wire Transfer - GlobalTech Corp", amount: 15600, type: "credit", status: "matched", matchedTo: "INV-1043" },
  { id: "2", date: "2024-12-04", description: "ACH Payment - AWS Services", amount: -4500, type: "debit", status: "matched", matchedTo: "BILL-2024-089" },
  { id: "3", date: "2024-12-04", description: "Bank Fee - Wire Transfer", amount: -25, type: "debit", status: "pending", suggestedAccount: "6100 - Bank Fees" },
  { id: "4", date: "2024-12-03", description: "Check Deposit #1847", amount: 8200, type: "credit", status: "matched", matchedTo: "INV-1042" },
  { id: "5", date: "2024-12-03", description: "ACH - Monthly Interest", amount: 142.50, type: "credit", status: "pending", suggestedAccount: "4200 - Interest Income" },
  { id: "6", date: "2024-12-02", description: "Debit Card - Office Supplies", amount: -320, type: "debit", status: "pending", suggestedAccount: "6300 - Office Supplies" },
  { id: "7", date: "2024-12-02", description: "ACH Payment - Salesforce", amount: -3100, type: "debit", status: "reconciled", matchedTo: "BILL-2024-092" },
  { id: "8", date: "2024-12-01", description: "Wire Transfer - CloudFirst Ltd", amount: 12400, type: "credit", status: "reconciled", matchedTo: "INV-1038" },
];

const statusConfig = {
  pending: { label: "Unmatched", className: "bg-warning/10 text-warning" },
  matched: { label: "Matched", className: "bg-cash/10 text-cash" },
  reconciled: { label: "Reconciled", className: "bg-success/10 text-success" },
};

const Banking = () => {
  const totalBalance = bankAccounts.reduce((sum, a) => sum + a.balance, 0);
  const unmatchedCount = transactions.filter((t) => t.status === "pending").length;

  return (
    <AppLayout title="Banking" subtitle="Bank accounts and transaction reconciliation">
      {/* Bank Accounts */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {bankAccounts.map((account) => (
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
                    {account.bank} • {account.number}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-foreground">
                ${account.balance.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">{account.currency}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Summary Row */}
      <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-sm text-muted-foreground">Total Cash Balance</p>
            <p className="text-2xl font-bold text-foreground">
              ${totalBalance.toLocaleString()}
            </p>
          </div>
          <div className="h-10 w-px bg-border" />
          <div>
            <p className="text-sm text-muted-foreground">Unmatched Transactions</p>
            <p className="text-2xl font-bold text-warning">{unmatchedCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Sync Transactions
          </Button>
          <Button className="gap-2">
            <Sparkles className="h-4 w-4" />
            Auto-Match All
          </Button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
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
            {transactions.map((tx) => {
              const status = statusConfig[tx.status as keyof typeof statusConfig];
              const isCredit = tx.amount > 0;
              
              return (
                <TableRow key={tx.id} className="border-border">
                  <TableCell className="text-muted-foreground">{tx.date}</TableCell>
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
                      <span className="text-foreground">{tx.description}</span>
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-semibold",
                      isCredit ? "text-success" : "text-foreground"
                    )}
                  >
                    {isCredit ? "+" : ""}${Math.abs(tx.amount).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("font-medium", status.className)}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {tx.matchedTo ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Link2 className="h-3 w-3 text-primary" />
                        <span className="text-primary">{tx.matchedTo}</span>
                      </div>
                    ) : tx.suggestedAccount ? (
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3 w-3 text-warning" />
                        <span className="text-sm text-muted-foreground">
                          {tx.suggestedAccount}
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
            })}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
};

export default Banking;
