import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, FileText, CheckCircle2, XCircle, Clock, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useBankAccounts } from "@/hooks/useBanking";
import { useBankStatementImports, useImportBankStatement } from "@/hooks/useBankingReconciliation";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface StatementImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
}

export function StatementImportDialog({ open, onOpenChange }: StatementImportDialogProps) {
  const { data: bankAccounts } = useBankAccounts();
  const { data: imports, isLoading: importsLoading } = useBankStatementImports();
  const importStatement = useImportBankStatement();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedAccount, setSelectedAccount] = useState("");
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    setFileType(ext);

    const text = await file.text();
    const transactions = parseFileContent(text, ext);
    setParsedTransactions(transactions);
  };

  const parseFileContent = (content: string, type: string): ParsedTransaction[] => {
    const transactions: ParsedTransaction[] = [];

    if (type === "csv") {
      const lines = content.split("\n").filter((l) => l.trim());
      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",").map((p) => p.trim().replace(/"/g, ""));
        if (parts.length >= 3) {
          // Assume format: Date, Description, Amount
          const date = parseDate(parts[0]);
          const description = parts[1];
          const amount = parseFloat(parts[2]) || 0;
          if (date && description) {
            transactions.push({ date, description, amount });
          }
        }
      }
    } else if (type === "ofx" || type === "qfx") {
      // Simple OFX parsing - extract STMTTRN elements
      const stmtPattern = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
      let match;
      while ((match = stmtPattern.exec(content)) !== null) {
        const block = match[1];
        const dtPosted = block.match(/<DTPOSTED>(\d{8})/)?.[1];
        const name = block.match(/<NAME>([^<\n]+)/)?.[1]?.trim();
        const memo = block.match(/<MEMO>([^<\n]+)/)?.[1]?.trim();
        const trnAmt = block.match(/<TRNAMT>([^<\n]+)/)?.[1]?.trim();

        if (dtPosted && trnAmt) {
          const date = `${dtPosted.slice(0, 4)}-${dtPosted.slice(4, 6)}-${dtPosted.slice(6, 8)}`;
          transactions.push({
            date,
            description: name || memo || "Transaction",
            amount: parseFloat(trnAmt) || 0,
          });
        }
      }
    }

    return transactions;
  };

  const parseDate = (dateStr: string): string | null => {
    // Try various date formats
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
      /^(\d{2})-(\d{2})-(\d{4})$/, // MM-DD-YYYY
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        if (format === formats[0]) {
          return dateStr;
        } else {
          return `${match[3]}-${match[1]}-${match[2]}`;
        }
      }
    }
    return null;
  };

  const handleImport = async () => {
    if (!selectedAccount || parsedTransactions.length === 0) return;

    await importStatement.mutateAsync({
      bankAccountId: selectedAccount,
      fileName,
      fileType,
      transactions: parsedTransactions,
    });

    // Reset form
    setParsedTransactions([]);
    setFileName("");
    setFileType("");
    setSelectedAccount("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const statusConfig = {
    pending: { icon: Clock, className: "text-warning" },
    processing: { icon: Clock, className: "text-primary animate-pulse" },
    completed: { icon: CheckCircle2, className: "text-success" },
    failed: { icon: XCircle, className: "text-destructive" },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Import Bank Statement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Import Form */}
          <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank Account</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts?.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} - {acc.bank_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Statement File</Label>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.ofx,.qfx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 justify-start gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    {fileName || "Choose file (CSV, OFX, QFX)"}
                  </Button>
                </div>
              </div>
            </div>

            {parsedTransactions.length > 0 && (
              <>
                <div className="text-sm text-muted-foreground">
                  Preview: {parsedTransactions.length} transactions found
                </div>
                <div className="max-h-48 overflow-y-auto rounded border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedTransactions.slice(0, 10).map((tx, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{tx.date}</TableCell>
                          <TableCell className="text-sm">{tx.description}</TableCell>
                          <TableCell className={cn("text-right text-sm font-medium", tx.amount > 0 ? "text-success" : "text-foreground")}>
                            {tx.amount > 0 ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {parsedTransactions.length > 10 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground text-sm">
                            ... and {parsedTransactions.length - 10} more transactions
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <Button
                  onClick={handleImport}
                  disabled={!selectedAccount || importStatement.isPending}
                  className="w-full"
                >
                  {importStatement.isPending ? "Importing..." : `Import ${parsedTransactions.length} Transactions`}
                </Button>
              </>
            )}
          </div>

          {/* Import History */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Import History</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Transactions</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : imports?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No imports yet
                    </TableCell>
                  </TableRow>
                ) : (
                  imports?.map((imp) => {
                    const StatusIcon = statusConfig[imp.status as keyof typeof statusConfig]?.icon || Clock;
                    return (
                      <TableRow key={imp.id}>
                        <TableCell className="text-sm">
                          {format(new Date(imp.import_date), "yyyy-MM-dd HH:mm")}
                        </TableCell>
                        <TableCell>{imp.bank_account?.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="uppercase">{imp.file_type}</Badge>
                            <span className="text-sm text-muted-foreground truncate max-w-32">
                              {imp.file_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <span className="text-success">{imp.imported_transactions}</span>
                            {" / "}
                            <span>{imp.total_transactions}</span>
                            {imp.duplicate_transactions > 0 && (
                              <span className="text-muted-foreground ml-1">
                                ({imp.duplicate_transactions} dupes)
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusIcon className={cn("h-4 w-4", statusConfig[imp.status as keyof typeof statusConfig]?.className)} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
