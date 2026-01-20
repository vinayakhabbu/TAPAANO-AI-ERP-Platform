import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, GitBranch, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight, Layers, FileText, Settings } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Book {
  id: string;
  name: string;
  standard: "GAAP" | "IFRS" | "TAX" | "STAT";
  description: string;
  isPrimary: boolean;
  lastSync: string;
  status: "synced" | "pending" | "error";
}

interface JournalEntry {
  id: string;
  date: string;
  description: string;
  bookValues: {
    [bookId: string]: {
      debit: number;
      credit: number;
      account: string;
    };
  };
  hasAdjustment: boolean;
  adjustmentType?: string;
}

interface Adjustment {
  id: string;
  fromBook: string;
  toBook: string;
  description: string;
  amount: number;
  account: string;
  reason: string;
  status: "pending" | "applied" | "reversed";
  createdAt: string;
}

interface Reconciliation {
  account: string;
  gaapBalance: number;
  ifrsBalance: number;
  taxBalance: number;
  variance: number;
  status: "reconciled" | "variance" | "pending";
}

const books: Book[] = [
  { id: "gaap", name: "US GAAP", standard: "GAAP", description: "Primary financial reporting", isPrimary: true, lastSync: "2025-01-20T10:30:00", status: "synced" },
  { id: "ifrs", name: "IFRS", standard: "IFRS", description: "International reporting", isPrimary: false, lastSync: "2025-01-20T10:25:00", status: "synced" },
  { id: "tax", name: "Tax Basis", standard: "TAX", description: "Federal tax reporting", isPrimary: false, lastSync: "2025-01-20T09:00:00", status: "pending" },
  { id: "stat", name: "Statutory", standard: "STAT", description: "Local statutory requirements", isPrimary: false, lastSync: "2025-01-19T18:00:00", status: "error" }
];

const mockEntries: JournalEntry[] = [
  {
    id: "je_001",
    date: "2025-01-15",
    description: "Lease Payment - Office Building",
    bookValues: {
      gaap: { debit: 50000, credit: 0, account: "Right-of-Use Asset" },
      ifrs: { debit: 50000, credit: 0, account: "Right-of-Use Asset" },
      tax: { debit: 50000, credit: 0, account: "Rent Expense" }
    },
    hasAdjustment: true,
    adjustmentType: "Lease Accounting (ASC 842 vs IAS 16)"
  },
  {
    id: "je_002",
    date: "2025-01-14",
    description: "Revenue Recognition - Software License",
    bookValues: {
      gaap: { debit: 0, credit: 120000, account: "Deferred Revenue" },
      ifrs: { debit: 0, credit: 120000, account: "Contract Liability" },
      tax: { debit: 0, credit: 120000, account: "Revenue" }
    },
    hasAdjustment: true,
    adjustmentType: "Revenue Recognition Timing"
  },
  {
    id: "je_003",
    date: "2025-01-12",
    description: "Depreciation - Equipment",
    bookValues: {
      gaap: { debit: 8500, credit: 0, account: "Depreciation Expense" },
      ifrs: { debit: 8500, credit: 0, account: "Depreciation Expense" },
      tax: { debit: 12000, credit: 0, account: "Depreciation Expense" }
    },
    hasAdjustment: true,
    adjustmentType: "Depreciation Method Difference"
  }
];

const mockAdjustments: Adjustment[] = [
  { id: "adj_001", fromBook: "GAAP", toBook: "TAX", description: "Section 179 Depreciation", amount: 3500, account: "Depreciation Expense", reason: "Accelerated tax depreciation", status: "applied", createdAt: "2025-01-12" },
  { id: "adj_002", fromBook: "GAAP", toBook: "IFRS", description: "Lease Classification", amount: 0, account: "Right-of-Use Asset", reason: "Classification difference under IAS 16", status: "applied", createdAt: "2025-01-15" },
  { id: "adj_003", fromBook: "GAAP", toBook: "TAX", description: "Revenue Recognition Timing", amount: 120000, account: "Revenue", reason: "Tax recognizes revenue at billing", status: "pending", createdAt: "2025-01-14" }
];

const mockReconciliation: Reconciliation[] = [
  { account: "Revenue", gaapBalance: 2500000, ifrsBalance: 2500000, taxBalance: 2620000, variance: 120000, status: "variance" },
  { account: "Depreciation", gaapBalance: 85000, ifrsBalance: 85000, taxBalance: 120000, variance: 35000, status: "variance" },
  { account: "Right-of-Use Assets", gaapBalance: 450000, ifrsBalance: 450000, taxBalance: 0, variance: 450000, status: "variance" },
  { account: "Lease Liability", gaapBalance: 460000, ifrsBalance: 460000, taxBalance: 0, variance: 460000, status: "variance" },
  { account: "Accounts Receivable", gaapBalance: 380000, ifrsBalance: 380000, taxBalance: 380000, variance: 0, status: "reconciled" },
  { account: "Cash", gaapBalance: 1250000, ifrsBalance: 1250000, taxBalance: 1250000, variance: 0, status: "reconciled" }
];

export function MultiBookAccounting() {
  const [selectedBook, setSelectedBook] = useState("gaap");
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  const syncBook = (bookId: string) => {
    toast.success(`Syncing ${books.find(b => b.id === bookId)?.name}...`, {
      description: "Automatic adjustments will be generated"
    });
  };

  const getBookBadge = (status: Book["status"]) => {
    const styles = {
      synced: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      pending: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      error: "bg-destructive/10 text-destructive border-destructive/20"
    };
    return <Badge variant="outline" className={styles[status]}>{status}</Badge>;
  };

  const getReconciliationBadge = (status: Reconciliation["status"]) => {
    const styles = {
      reconciled: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      variance: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      pending: "bg-blue-500/10 text-blue-500 border-blue-500/20"
    };
    const labels = {
      reconciled: "Reconciled",
      variance: "Has Variance",
      pending: "Pending Review"
    };
    return <Badge variant="outline" className={styles[status]}>{labels[status]}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Books Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {books.map((book) => (
          <Card key={book.id} className={book.isPrimary ? "border-primary" : ""}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{book.name}</span>
                    {book.isPrimary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{book.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Last sync: {format(new Date(book.lastSync), "MMM d, h:mm a")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getBookBadge(book.status)}
                  <Button variant="ghost" size="icon" onClick={() => syncBook(book.id)}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="entries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="entries">Parallel Entries</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="entries">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    Parallel Ledger Entries
                  </CardTitle>
                  <CardDescription>View how entries are recorded across different accounting standards</CardDescription>
                </div>
                <Select value={selectedBook} onValueChange={setSelectedBook}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {books.map((book) => (
                      <SelectItem key={book.id} value={book.id}>{book.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead>Adjustment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockEntries.map((entry) => {
                    const bookValue = entry.bookValues[selectedBook];
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>{format(new Date(entry.date), "MMM d, yyyy")}</TableCell>
                        <TableCell className="font-medium">{entry.description}</TableCell>
                        <TableCell>{bookValue?.account || "-"}</TableCell>
                        <TableCell className="text-right">
                          {bookValue?.debit ? `$${bookValue.debit.toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {bookValue?.credit ? `$${bookValue.credit.toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell>
                          {entry.hasAdjustment && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-amber-500"
                              onClick={() => {
                                setSelectedEntry(entry);
                                setShowAdjustmentDialog(true);
                              }}
                            >
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adjustments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Automatic Adjustments
              </CardTitle>
              <CardDescription>System-generated adjustments between accounting standards</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockAdjustments.map((adj) => (
                    <TableRow key={adj.id}>
                      <TableCell>{format(new Date(adj.createdAt), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline">{adj.fromBook}</Badge>
                          <ArrowRight className="h-3 w-3" />
                          <Badge variant="outline">{adj.toBook}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{adj.description}</TableCell>
                      <TableCell>{adj.account}</TableCell>
                      <TableCell className="text-right">${adj.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {adj.reason}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            adj.status === "applied"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : adj.status === "pending"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-muted"
                          }
                        >
                          {adj.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Multi-Book Reconciliation
                  </CardTitle>
                  <CardDescription>Compare account balances across all books</CardDescription>
                </div>
                <Button variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">GAAP Balance</TableHead>
                    <TableHead className="text-right">IFRS Balance</TableHead>
                    <TableHead className="text-right">Tax Balance</TableHead>
                    <TableHead className="text-right">Max Variance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockReconciliation.map((rec, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{rec.account}</TableCell>
                      <TableCell className="text-right">${rec.gaapBalance.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${rec.ifrsBalance.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${rec.taxBalance.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {rec.variance !== 0 && (
                          <span className="text-amber-500">${rec.variance.toLocaleString()}</span>
                        )}
                        {rec.variance === 0 && <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>{getReconciliationBadge(rec.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-500/10 rounded-lg">
                  <div className="flex items-center gap-2 text-emerald-500">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">Fully Reconciled</span>
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {mockReconciliation.filter(r => r.status === "reconciled").length} accounts
                  </p>
                </div>
                <div className="p-4 bg-amber-500/10 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-500">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-medium">Has Variance</span>
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {mockReconciliation.filter(r => r.status === "variance").length} accounts
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Adjustment Details Dialog */}
      <Dialog open={showAdjustmentDialog} onOpenChange={setShowAdjustmentDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Book-to-Book Differences</DialogTitle>
            <DialogDescription>{selectedEntry?.description}</DialogDescription>
          </DialogHeader>
          
          {selectedEntry && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-500/10 rounded-lg text-amber-500 text-sm">
                <strong>Adjustment Type:</strong> {selectedEntry.adjustmentType}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(selectedEntry.bookValues).map(([bookId, value]) => (
                    <TableRow key={bookId}>
                      <TableCell className="font-medium">
                        {books.find(b => b.id === bookId)?.name || bookId.toUpperCase()}
                      </TableCell>
                      <TableCell>{value.account}</TableCell>
                      <TableCell className="text-right">
                        {value.debit ? `$${value.debit.toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {value.credit ? `$${value.credit.toLocaleString()}` : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustmentDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
