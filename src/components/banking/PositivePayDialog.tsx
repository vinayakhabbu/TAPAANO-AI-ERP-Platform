import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Plus, AlertTriangle, Check, X, Download } from "lucide-react";
import { useBankAccounts } from "@/hooks/useBanking";
import { 
  usePositivePayChecks, 
  useCreatePositivePayCheck, 
  useVoidCheck, 
  useResolveCheckException 
} from "@/hooks/useBankingReconciliation";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PositivePayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PositivePayDialog({ open, onOpenChange }: PositivePayDialogProps) {
  const { data: bankAccounts } = useBankAccounts();
  const { data: checks, isLoading } = usePositivePayChecks();
  const createCheck = useCreatePositivePayCheck();
  const voidCheck = useVoidCheck();
  const resolveException = useResolveCheckException();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    bank_account_id: "",
    check_number: "",
    payee_name: "",
    amount: "",
    issue_date: new Date().toISOString().split("T")[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createCheck.mutateAsync({
      ...formData,
      amount: parseFloat(formData.amount),
    });
    setFormData({
      bank_account_id: "",
      check_number: "",
      payee_name: "",
      amount: "",
      issue_date: new Date().toISOString().split("T")[0],
    });
    setShowForm(false);
  };

  const statusConfig = {
    issued: { label: "Issued", className: "bg-primary/10 text-primary" },
    presented: { label: "Presented", className: "bg-warning/10 text-warning" },
    paid: { label: "Paid", className: "bg-success/10 text-success" },
    void: { label: "Void", className: "bg-muted text-muted-foreground" },
    exception: { label: "Exception", className: "bg-destructive/10 text-destructive" },
  };

  const issuedChecks = checks?.filter((c) => c.status === "issued") || [];
  const exceptionChecks = checks?.filter((c) => c.status === "exception") || [];
  const processedChecks = checks?.filter((c) => ["paid", "void"].includes(c.status)) || [];

  const exportPositivePayFile = () => {
    // Generate positive pay file format (typically fixed-width or CSV)
    const lines = issuedChecks.map((check) => {
      const acc = bankAccounts?.find((a) => a.id === check.bank_account_id);
      return [
        acc?.account_number || "",
        check.check_number.padStart(10, "0"),
        check.amount.toFixed(2).replace(".", "").padStart(10, "0"),
        check.issue_date.replace(/-/g, ""),
        check.payee_name.substring(0, 40).padEnd(40, " "),
      ].join(",");
    });

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `positive-pay-${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Positive Pay - Check Fraud Prevention
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="issued" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="issued">
                Issued Checks
                {issuedChecks.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{issuedChecks.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="exceptions">
                Exceptions
                {exceptionChecks.length > 0 && (
                  <Badge variant="destructive" className="ml-2">{exceptionChecks.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <div className="flex gap-2">
              {issuedChecks.length > 0 && (
                <Button variant="outline" onClick={exportPositivePayFile} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export File
                </Button>
              )}
              <Button onClick={() => setShowForm(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Register Check
              </Button>
            </div>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Bank Account</Label>
                  <Select
                    value={formData.bank_account_id}
                    onValueChange={(v) => setFormData({ ...formData, bank_account_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts?.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Check Number</Label>
                  <Input
                    value={formData.check_number}
                    onChange={(e) => setFormData({ ...formData, check_number: e.target.value })}
                    placeholder="e.g., 1001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Issue Date</Label>
                  <Input
                    type="date"
                    value={formData.issue_date}
                    onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payee Name</Label>
                  <Input
                    value={formData.payee_name}
                    onChange={(e) => setFormData({ ...formData, payee_name: e.target.value })}
                    placeholder="e.g., Acme Corp"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createCheck.isPending}>
                  Register Check
                </Button>
              </div>
            </form>
          )}

          <TabsContent value="issued">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check #</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : issuedChecks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No issued checks pending
                    </TableCell>
                  </TableRow>
                ) : (
                  issuedChecks.map((check) => (
                    <TableRow key={check.id}>
                      <TableCell className="font-mono">{check.check_number}</TableCell>
                      <TableCell>{check.bank_account?.name}</TableCell>
                      <TableCell>{check.payee_name}</TableCell>
                      <TableCell className="text-right font-medium">
                        ${Number(check.amount).toLocaleString()}
                      </TableCell>
                      <TableCell>{check.issue_date}</TableCell>
                      <TableCell>
                        <Badge className={statusConfig.issued.className}>
                          {statusConfig.issued.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => voidCheck.mutate(check.id)}
                        >
                          Void
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="exceptions">
            {exceptionChecks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No exceptions to review
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Check #</TableHead>
                    <TableHead>Payee</TableHead>
                    <TableHead className="text-right">Issued Amount</TableHead>
                    <TableHead className="text-right">Presented Amount</TableHead>
                    <TableHead>Exception Reason</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptionChecks.map((check) => (
                    <TableRow key={check.id} className="bg-destructive/5">
                      <TableCell className="font-mono">{check.check_number}</TableCell>
                      <TableCell>{check.payee_name}</TableCell>
                      <TableCell className="text-right font-medium">
                        ${Number(check.amount).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium text-destructive">
                        ${Number(check.presented_amount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertTriangle className="h-4 w-4" />
                          {check.exception_reason}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-success hover:text-success"
                            onClick={() => resolveException.mutate({ checkId: check.id, resolution: "paid" })}
                            title="Approve payment"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => resolveException.mutate({ checkId: check.id, resolution: "void" })}
                            title="Reject / Void"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check #</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedChecks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No processed checks
                    </TableCell>
                  </TableRow>
                ) : (
                  processedChecks.map((check) => {
                    const status = statusConfig[check.status as keyof typeof statusConfig] || statusConfig.issued;
                    return (
                      <TableRow key={check.id}>
                        <TableCell className="font-mono">{check.check_number}</TableCell>
                        <TableCell>{check.bank_account?.name}</TableCell>
                        <TableCell>{check.payee_name}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${Number(check.amount).toLocaleString()}
                        </TableCell>
                        <TableCell>{check.issue_date}</TableCell>
                        <TableCell>
                          <Badge className={status.className}>{status.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
