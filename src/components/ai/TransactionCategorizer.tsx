import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Brain, 
  Sparkles,
  Check,
  X,
  ChevronDown,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  TrendingUp,
  Loader2,
  History
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TransactionSuggestion {
  id: string;
  description: string;
  amount: number;
  date: string;
  currentCategory: string | null;
  suggestedCategory: string;
  suggestedAccount: string;
  confidence: number;
  reasoning: string;
  learnedFrom?: string;
  status: "pending" | "accepted" | "rejected";
}

interface CategoryRule {
  id: string;
  pattern: string;
  category: string;
  account: string;
  matchCount: number;
  accuracy: number;
  isActive: boolean;
}

// Sample uncategorized transactions
const SAMPLE_TRANSACTIONS: TransactionSuggestion[] = [
  {
    id: "1",
    description: "AMZN MKTP US*2K9X4",
    amount: -234.56,
    date: "2024-01-15",
    currentCategory: null,
    suggestedCategory: "Office Supplies",
    suggestedAccount: "6200 - Office Expense",
    confidence: 92,
    reasoning: "Matched 47 similar Amazon Marketplace transactions categorized as Office Supplies",
    learnedFrom: "Historical patterns",
    status: "pending",
  },
  {
    id: "2",
    description: "ADOBE *CREATIVE CL",
    amount: -54.99,
    date: "2024-01-15",
    currentCategory: null,
    suggestedCategory: "Software Subscriptions",
    suggestedAccount: "6500 - Software & Cloud Services",
    confidence: 98,
    reasoning: "Adobe Creative Cloud subscription - consistent with 12 prior months",
    learnedFrom: "Recurring pattern",
    status: "pending",
  },
  {
    id: "3",
    description: "UBER TRIP HLDFHT",
    amount: -28.45,
    date: "2024-01-14",
    currentCategory: null,
    suggestedCategory: "Travel & Transportation",
    suggestedAccount: "6300 - Travel Expense",
    confidence: 88,
    reasoning: "Uber ride - matched similar Uber transactions",
    status: "pending",
  },
  {
    id: "4",
    description: "ACH TRANSFER - PAYROLL",
    amount: -45000.00,
    date: "2024-01-15",
    currentCategory: null,
    suggestedCategory: "Payroll",
    suggestedAccount: "6100 - Salaries & Wages",
    confidence: 99,
    reasoning: "Regular bi-weekly payroll transfer matching historical pattern",
    learnedFrom: "Scheduled pattern",
    status: "pending",
  },
  {
    id: "5",
    description: "ZOOM.US 888-799-9666",
    amount: -14.99,
    date: "2024-01-10",
    currentCategory: null,
    suggestedCategory: "Software Subscriptions",
    suggestedAccount: "6500 - Software & Cloud Services",
    confidence: 96,
    reasoning: "Zoom subscription - matches vendor pattern",
    status: "pending",
  },
];

// Sample learned rules
const LEARNED_RULES: CategoryRule[] = [
  { id: "1", pattern: "AMZN*", category: "Office Supplies", account: "6200", matchCount: 156, accuracy: 94, isActive: true },
  { id: "2", pattern: "ADOBE*", category: "Software", account: "6500", matchCount: 24, accuracy: 100, isActive: true },
  { id: "3", pattern: "UBER*", category: "Travel", account: "6300", matchCount: 89, accuracy: 91, isActive: true },
  { id: "4", pattern: "PAYROLL*", category: "Payroll", account: "6100", matchCount: 52, accuracy: 100, isActive: true },
  { id: "5", pattern: "GOOGLE*", category: "Software", account: "6500", matchCount: 36, accuracy: 97, isActive: true },
];

export function TransactionCategorizer() {
  const [transactions, setTransactions] = useState(SAMPLE_TRANSACTIONS);
  const [rules, setRules] = useState(LEARNED_RULES);
  const [autoCategorizationEnabled, setAutoCategorizationEnabled] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showAllAccepted, setShowAllAccepted] = useState(false);

  const pendingCount = transactions.filter((t) => t.status === "pending").length;
  const acceptedCount = transactions.filter((t) => t.status === "accepted").length;
  const avgConfidence = Math.round(
    transactions.reduce((sum, t) => sum + t.confidence, 0) / transactions.length
  );

  const handleAccept = (id: string) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "accepted" as const } : t))
    );
    toast.success("Category accepted", {
      description: "This pattern will be learned for future transactions",
    });
  };

  const handleReject = (id: string) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "rejected" as const } : t))
    );
  };

  const handleAcceptAll = async () => {
    setProcessing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setTransactions((prev) =>
      prev.map((t) => (t.status === "pending" ? { ...t, status: "accepted" as const } : t))
    );
    toast.success(`${pendingCount} transactions categorized`, {
      description: "AI has learned from your confirmations",
    });
    setProcessing(false);
  };

  const handleToggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
    );
  };

  const displayTransactions = showAllAccepted 
    ? transactions 
    : transactions.filter((t) => t.status === "pending");

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                <Sparkles className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold text-warning">{pendingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                <Check className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Auto-Categorized</p>
                <p className="text-2xl font-bold text-success">{acceptedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Confidence</p>
                <p className="text-2xl font-bold text-primary">{avgConfidence}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                <TrendingUp className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Learned Rules</p>
                <p className="text-2xl font-bold">{rules.filter((r) => r.isActive).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Settings */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch 
                  id="auto-cat" 
                  checked={autoCategorizationEnabled}
                  onCheckedChange={setAutoCategorizationEnabled}
                />
                <Label htmlFor="auto-cat" className="font-medium">
                  Auto-categorize high-confidence transactions
                </Label>
              </div>
              <Badge variant="outline" className="gap-1">
                <Lightbulb className="h-3 w-3" />
                ≥95% confidence
              </Badge>
            </div>
            <Button onClick={handleAcceptAll} disabled={processing || pendingCount === 0} className="gap-2">
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Accept All ({pendingCount})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              AI Category Suggestions
            </CardTitle>
            <CardDescription>Review and approve AI-suggested categories</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Switch 
              id="show-all" 
              checked={showAllAccepted}
              onCheckedChange={setShowAllAccepted}
            />
            <Label htmlFor="show-all" className="text-sm">Show accepted</Label>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Suggested Category</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Check className="h-8 w-8 mx-auto mb-2 text-success" />
                    All transactions have been categorized!
                  </TableCell>
                </TableRow>
              ) : (
                displayTransactions.map((tx) => (
                  <TableRow key={tx.id} className={cn(tx.status !== "pending" && "opacity-50")}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{tx.date}</p>
                      </div>
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-mono font-medium",
                      tx.amount < 0 ? "text-destructive" : "text-success"
                    )}>
                      ${Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3 w-3 text-primary" />
                        <span>{tx.suggestedCategory}</span>
                      </div>
                      {tx.learnedFrom && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <History className="h-3 w-3" />
                          {tx.learnedFrom}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{tx.suggestedAccount}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress 
                          value={tx.confidence} 
                          className={cn(
                            "w-16 h-2",
                            tx.confidence >= 95 ? "[&>div]:bg-success" :
                            tx.confidence >= 80 ? "[&>div]:bg-primary" : "[&>div]:bg-warning"
                          )} 
                        />
                        <span className={cn(
                          "text-sm font-medium",
                          tx.confidence >= 95 ? "text-success" :
                          tx.confidence >= 80 ? "text-primary" : "text-warning"
                        )}>
                          {tx.confidence}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {tx.status === "pending" ? (
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-success hover:text-success hover:bg-success/10"
                            onClick={() => handleAccept(tx.id)}
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleReject(tx.id)}
                          >
                            <ThumbsDown className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Badge className={cn(
                          tx.status === "accepted" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                        )}>
                          {tx.status === "accepted" ? "Accepted" : "Rejected"}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Learned Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Learned Categorization Rules
          </CardTitle>
          <CardDescription>Rules automatically learned from your categorization decisions</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pattern</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-center">Matches</TableHead>
                <TableHead className="text-center">Accuracy</TableHead>
                <TableHead className="text-center">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono text-sm">{rule.pattern}</TableCell>
                  <TableCell>{rule.category}</TableCell>
                  <TableCell className="text-muted-foreground">{rule.account}</TableCell>
                  <TableCell className="text-center">{rule.matchCount}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={cn(
                      rule.accuracy >= 95 ? "border-success text-success" :
                      rule.accuracy >= 80 ? "border-primary text-primary" : ""
                    )}>
                      {rule.accuracy}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch 
                      checked={rule.isActive} 
                      onCheckedChange={() => handleToggleRule(rule.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
