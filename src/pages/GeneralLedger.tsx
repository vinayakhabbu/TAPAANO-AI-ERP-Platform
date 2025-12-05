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
  FileText,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useState } from "react";

const chartOfAccounts = [
  { id: "1", code: "1000", name: "Assets", type: "asset", balance: 1850000, isParent: true, expanded: true },
  { id: "1.1", code: "1100", name: "Cash & Bank", type: "asset", balance: 1200000, parent: "1", indent: 1 },
  { id: "1.2", code: "1200", name: "Accounts Receivable", type: "asset", balance: 220600, parent: "1", indent: 1 },
  { id: "1.3", code: "1300", name: "Prepaid Expenses", type: "asset", balance: 45000, parent: "1", indent: 1 },
  { id: "1.4", code: "1400", name: "Fixed Assets", type: "asset", balance: 384400, parent: "1", indent: 1 },
  { id: "2", code: "2000", name: "Liabilities", type: "liability", balance: 425000, isParent: true, expanded: true },
  { id: "2.1", code: "2100", name: "Accounts Payable", type: "liability", balance: 33200, parent: "2", indent: 1 },
  { id: "2.2", code: "2200", name: "Accrued Expenses", type: "liability", balance: 41800, parent: "2", indent: 1 },
  { id: "2.3", code: "2300", name: "Long-term Debt", type: "liability", balance: 350000, parent: "2", indent: 1 },
  { id: "3", code: "3000", name: "Equity", type: "equity", balance: 1425000, isParent: true, expanded: false },
  { id: "4", code: "4000", name: "Revenue", type: "revenue", balance: 565200, isParent: true, expanded: false },
  { id: "5", code: "5000", name: "Expenses", type: "expense", balance: 380200, isParent: true, expanded: false },
];

const journalEntries = [
  { id: "JE-2024-156", date: "2024-12-01", memo: "November revenue accrual", debit: 45000, credit: 45000, status: "posted" },
  { id: "JE-2024-157", date: "2024-12-02", memo: "Bank fee adjustment", debit: 125, credit: 125, status: "posted" },
  { id: "JE-2024-158", date: "2024-12-03", memo: "Depreciation - Nov", debit: 8500, credit: 8500, status: "posted" },
  { id: "JE-2024-159", date: "2024-12-04", memo: "Prepaid insurance amortization", debit: 2400, credit: 2400, status: "draft" },
  { id: "JE-2024-160", date: "2024-12-05", memo: "Intercompany allocation", debit: 15000, credit: 15000, status: "draft" },
];

const statusConfig = {
  draft: { label: "Draft", className: "bg-warning/10 text-warning" },
  posted: { label: "Posted", className: "bg-success/10 text-success" },
  reversed: { label: "Reversed", className: "bg-muted text-muted-foreground" },
};

const typeConfig = {
  asset: { className: "text-cash" },
  liability: { className: "text-warning" },
  equity: { className: "text-primary" },
  revenue: { className: "text-success" },
  expense: { className: "text-destructive" },
};

const GeneralLedger = () => {
  const [expandedAccounts, setExpandedAccounts] = useState<string[]>(["1", "2"]);

  const toggleAccount = (id: string) => {
    setExpandedAccounts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const visibleAccounts = chartOfAccounts.filter((account) => {
    if (!account.parent) return true;
    return expandedAccounts.includes(account.parent);
  });

  return (
    <AppLayout title="General Ledger" subtitle="Chart of accounts and journal entries">
      {/* Trial Balance Summary */}
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">Total Assets</h3>
          <p className="mt-2 text-3xl font-bold text-cash">$1,850,000</p>
          <p className="mt-1 text-sm text-muted-foreground">5 accounts</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">Total Liabilities</h3>
          <p className="mt-2 text-3xl font-bold text-warning">$425,000</p>
          <p className="mt-1 text-sm text-muted-foreground">3 accounts</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">Total Equity</h3>
          <p className="mt-2 text-3xl font-bold text-primary">$1,425,000</p>
          <p className="mt-1 text-sm text-muted-foreground">Retained + Current</p>
        </div>
      </div>

      {/* Chart of Accounts */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Chart of Accounts</h3>
            <p className="text-sm text-muted-foreground">Account hierarchy and balances</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search accounts..." className="w-64 pl-9" />
            </div>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Account
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground w-24">Code</TableHead>
              <TableHead className="text-muted-foreground">Account Name</TableHead>
              <TableHead className="text-muted-foreground">Type</TableHead>
              <TableHead className="text-muted-foreground text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleAccounts.map((account) => {
              const isExpanded = expandedAccounts.includes(account.id);
              const typeClass = typeConfig[account.type as keyof typeof typeConfig];
              
              return (
                <TableRow key={account.id} className="border-border">
                  <TableCell className="font-mono text-muted-foreground">
                    {account.code}
                  </TableCell>
                  <TableCell>
                    <div
                      className="flex items-center gap-2"
                      style={{ paddingLeft: (account.indent || 0) * 24 }}
                    >
                      {account.isParent ? (
                        <button
                          onClick={() => toggleAccount(account.id)}
                          className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      ) : (
                        <span className="w-5" />
                      )}
                      {account.isParent ? (
                        isExpanded ? (
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Folder className="h-4 w-4 text-muted-foreground" />
                        )
                      ) : null}
                      <span className={cn("font-medium", account.isParent ? "text-foreground" : "text-muted-foreground")}>
                        {account.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={cn("capitalize", typeClass?.className)}>
                      {account.type}
                    </span>
                  </TableCell>
                  <TableCell className={cn("text-right font-semibold", typeClass?.className)}>
                    ${account.balance.toLocaleString()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Journal Entries */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Recent Journal Entries</h3>
            <p className="text-sm text-muted-foreground">Manual adjustments and entries</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Entry
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Entry #</TableHead>
              <TableHead className="text-muted-foreground">Date</TableHead>
              <TableHead className="text-muted-foreground">Memo</TableHead>
              <TableHead className="text-muted-foreground text-right">Debit</TableHead>
              <TableHead className="text-muted-foreground text-right">Credit</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journalEntries.map((entry) => {
              const status = statusConfig[entry.status as keyof typeof statusConfig];
              return (
                <TableRow key={entry.id} className="border-border">
                  <TableCell className="font-medium text-foreground">
                    {entry.id}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{entry.date}</TableCell>
                  <TableCell className="text-foreground">{entry.memo}</TableCell>
                  <TableCell className="text-right font-medium text-foreground">
                    ${entry.debit.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-medium text-foreground">
                    ${entry.credit.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("font-medium", status.className)}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
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

export default GeneralLedger;
