import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ArrowLeftRight, 
  Building2, 
  CheckCircle2, 
  AlertTriangle,
  Play,
  FileText,
  DollarSign,
  ArrowRight,
  Loader2,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Entity {
  id: string;
  code: string;
  name: string;
  currency: string;
  type: "parent" | "subsidiary";
}

interface IntercompanyTransaction {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  fromEntityCode: string;
  toEntityCode: string;
  amount: number;
  description: string;
  transactionDate: string;
  type: "sale" | "loan" | "service" | "dividend" | "inventory";
  status: "pending" | "matched" | "eliminated" | "exception";
  counterpartId?: string;
}

interface EliminationEntry {
  id: string;
  description: string;
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  transactionIds: string[];
}

// Sample entities
const ENTITIES: Entity[] = [
  { id: "1", code: "PARENT", name: "DualEntry Holdings", currency: "USD", type: "parent" },
  { id: "2", code: "US-SUB", name: "DualEntry US", currency: "USD", type: "subsidiary" },
  { id: "3", code: "EU-SUB", name: "DualEntry Europe", currency: "EUR", type: "subsidiary" },
  { id: "4", code: "APAC", name: "DualEntry Asia Pacific", currency: "SGD", type: "subsidiary" },
];

// Sample intercompany transactions
const IC_TRANSACTIONS: IntercompanyTransaction[] = [
  { id: "1", fromEntityId: "1", toEntityId: "2", fromEntityCode: "PARENT", toEntityCode: "US-SUB", amount: 500000, description: "Management Fee Q4", transactionDate: "2024-12-15", type: "service", status: "matched", counterpartId: "2" },
  { id: "2", fromEntityId: "2", toEntityId: "1", fromEntityCode: "US-SUB", toEntityCode: "PARENT", amount: 500000, description: "Management Fee Q4 (IC)", transactionDate: "2024-12-15", type: "service", status: "matched", counterpartId: "1" },
  { id: "3", fromEntityId: "1", toEntityId: "3", fromEntityCode: "PARENT", toEntityCode: "EU-SUB", amount: 250000, description: "Intercompany Loan", transactionDate: "2024-11-01", type: "loan", status: "matched", counterpartId: "4" },
  { id: "4", fromEntityId: "3", toEntityId: "1", fromEntityCode: "EU-SUB", toEntityCode: "PARENT", amount: 250000, description: "Loan from Parent", transactionDate: "2024-11-01", type: "loan", status: "matched", counterpartId: "3" },
  { id: "5", fromEntityId: "2", toEntityId: "4", fromEntityCode: "US-SUB", toEntityCode: "APAC", amount: 75000, description: "Inventory Transfer", transactionDate: "2024-12-20", type: "inventory", status: "pending" },
  { id: "6", fromEntityId: "3", toEntityId: "2", fromEntityCode: "EU-SUB", toEntityCode: "US-SUB", amount: 120000, description: "Software License", transactionDate: "2024-12-10", type: "sale", status: "exception" },
];

export function IntercompanyElimination() {
  const [selectedPeriod, setSelectedPeriod] = useState("2024-12");
  const [processing, setProcessing] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [eliminationEntries, setEliminationEntries] = useState<EliminationEntry[]>([]);

  const transactions = IC_TRANSACTIONS;

  const stats = useMemo(() => {
    return {
      total: transactions.length,
      matched: transactions.filter((t) => t.status === "matched").length,
      pending: transactions.filter((t) => t.status === "pending").length,
      exceptions: transactions.filter((t) => t.status === "exception").length,
      eliminated: transactions.filter((t) => t.status === "eliminated").length,
      totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0) / 2, // Divide by 2 to avoid double counting
    };
  }, [transactions]);

  const handleAutoMatch = async () => {
    setProcessing(true);
    // Simulate auto-matching process
    await new Promise((resolve) => setTimeout(resolve, 2000));
    toast.success("Auto-matching complete", {
      description: "3 transaction pairs matched successfully",
    });
    setProcessing(false);
  };

  const handleGenerateEliminations = async () => {
    setProcessing(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Generate elimination entries for matched transactions
    const eliminations: EliminationEntry[] = [
      {
        id: "elim-1",
        description: "Eliminate IC Management Fees",
        debitAccount: "IC Revenue - Services",
        debitAmount: 500000,
        creditAccount: "IC Expense - Management Fees",
        creditAmount: 500000,
        transactionIds: ["1", "2"],
      },
      {
        id: "elim-2",
        description: "Eliminate IC Loan Balances",
        debitAccount: "IC Loan Payable",
        debitAmount: 250000,
        creditAccount: "IC Loan Receivable",
        creditAmount: 250000,
        transactionIds: ["3", "4"],
      },
    ];
    
    setEliminationEntries(eliminations);
    toast.success("Elimination entries generated", {
      description: "2 elimination journal entries prepared for review",
    });
    setProcessing(false);
  };

  const handlePostEliminations = async () => {
    setProcessing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast.success("Eliminations posted", {
      description: "Elimination entries posted to consolidated ledger",
    });
    setProcessing(false);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={ArrowLeftRight} label="Total IC Transactions" value={stats.total} />
        <StatCard icon={CheckCircle2} label="Matched" value={stats.matched} color="text-success" />
        <StatCard icon={AlertTriangle} label="Pending Match" value={stats.pending} color="text-warning" />
        <StatCard icon={AlertTriangle} label="Exceptions" value={stats.exceptions} color="text-destructive" />
        <StatCard icon={DollarSign} label="Total Value" value={`$${(stats.totalAmount / 1000).toFixed(0)}K`} />
      </div>

      {/* Period Selector & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024-12">Dec 2024</SelectItem>
              <SelectItem value="2024-11">Nov 2024</SelectItem>
              <SelectItem value="2024-10">Oct 2024</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="gap-1">
            <Building2 className="h-3 w-3" />
            {ENTITIES.length} Entities
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleAutoMatch} disabled={processing} className="gap-2">
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Auto-Match
          </Button>
          <Button onClick={handleGenerateEliminations} disabled={processing} className="gap-2">
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Generate Eliminations
          </Button>
        </div>
      </div>

      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions" className="gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            IC Transactions
          </TabsTrigger>
          <TabsTrigger value="eliminations" className="gap-2">
            <FileText className="h-4 w-4" />
            Elimination Entries
            {eliminationEntries.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 justify-center">
                {eliminationEntries.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-2">
            <Building2 className="h-4 w-4" />
            IC Reconciliation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Intercompany Transactions</CardTitle>
              <CardDescription>Review and match intercompany transactions across entities</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.exceptions > 0 && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Unmatched Exceptions</AlertTitle>
                  <AlertDescription>
                    {stats.exceptions} transaction(s) could not be automatically matched. Manual review required.
                  </AlertDescription>
                </Alert>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox />
                    </TableHead>
                    <TableHead>From Entity</TableHead>
                    <TableHead></TableHead>
                    <TableHead>To Entity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TransactionRow key={tx.id} transaction={tx} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="eliminations">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Elimination Journal Entries</CardTitle>
                <CardDescription>Auto-generated elimination entries for consolidation</CardDescription>
              </div>
              {eliminationEntries.length > 0 && (
                <Button onClick={handlePostEliminations} disabled={processing} className="gap-2">
                  Post to Ledger
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {eliminationEntries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No elimination entries generated yet</p>
                  <p className="text-sm">Click "Generate Eliminations" to create entries from matched transactions</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {eliminationEntries.map((entry) => (
                    <div key={entry.id} className="p-4 rounded-lg border border-border bg-muted/30">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-medium">{entry.description}</p>
                        <Badge variant="outline">Pending Post</Badge>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead className="text-right">Debit</TableHead>
                            <TableHead className="text-right">Credit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>{entry.debitAccount}</TableCell>
                            <TableCell className="text-right font-medium">${entry.debitAmount.toLocaleString()}</TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="pl-8">{entry.creditAccount}</TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right font-medium">${entry.creditAmount.toLocaleString()}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation">
          <Card>
            <CardHeader>
              <CardTitle>Intercompany Reconciliation Matrix</CardTitle>
              <CardDescription>Cross-entity balance comparison</CardDescription>
            </CardHeader>
            <CardContent>
              <ICReconciliationMatrix entities={ENTITIES} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Icon className={cn("h-5 w-5", color || "text-muted-foreground")} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn("text-2xl font-bold", color || "text-foreground")}>{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TransactionRow({ transaction }: { transaction: IntercompanyTransaction }) {
  const statusConfig = {
    pending: { label: "Pending", className: "bg-warning/10 text-warning" },
    matched: { label: "Matched", className: "bg-success/10 text-success" },
    eliminated: { label: "Eliminated", className: "bg-primary/10 text-primary" },
    exception: { label: "Exception", className: "bg-destructive/10 text-destructive" },
  };

  const typeConfig = {
    sale: "Sale",
    loan: "Loan",
    service: "Service",
    dividend: "Dividend",
    inventory: "Inventory",
  };

  const status = statusConfig[transaction.status];

  return (
    <TableRow>
      <TableCell>
        <Checkbox />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{transaction.fromEntityCode}</span>
        </div>
      </TableCell>
      <TableCell>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{transaction.toEntityCode}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">{typeConfig[transaction.type]}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{transaction.description}</TableCell>
      <TableCell className="text-right font-medium">${transaction.amount.toLocaleString()}</TableCell>
      <TableCell>
        <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
      </TableCell>
    </TableRow>
  );
}

function ICReconciliationMatrix({ entities }: { entities: Entity[] }) {
  // Sample IC balance matrix
  const balances: Record<string, Record<string, number>> = {
    "PARENT": { "US-SUB": 500000, "EU-SUB": 250000, "APAC": 0 },
    "US-SUB": { "PARENT": -500000, "EU-SUB": -120000, "APAC": 75000 },
    "EU-SUB": { "PARENT": -250000, "US-SUB": 120000, "APAC": 0 },
    "APAC": { "PARENT": 0, "US-SUB": -75000, "EU-SUB": 0 },
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">From / To</TableHead>
          {entities.map((e) => (
            <TableHead key={e.id} className="text-center">{e.code}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entities.map((fromEntity) => (
          <TableRow key={fromEntity.id}>
            <TableCell className="font-medium">{fromEntity.code}</TableCell>
            {entities.map((toEntity) => {
              if (fromEntity.id === toEntity.id) {
                return <TableCell key={toEntity.id} className="text-center bg-muted">—</TableCell>;
              }
              const balance = balances[fromEntity.code]?.[toEntity.code] || 0;
              return (
                <TableCell 
                  key={toEntity.id} 
                  className={cn(
                    "text-center font-mono text-sm",
                    balance > 0 ? "text-success" : balance < 0 ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {balance !== 0 ? `${balance > 0 ? "+" : ""}${(balance / 1000).toFixed(0)}K` : "0"}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
