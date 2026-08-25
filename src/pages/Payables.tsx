import { AlertTriangle, FileWarning, Landmark } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { BillForm } from "@/components/forms/BillForm";
import { PaymentRunForm } from "@/components/forms/PaymentRunForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBills, usePayablesSummary, usePaymentRuns } from "@/hooks/usePayables";

const Payables = () => {
  const { data: bills = [], isLoading: billsLoading } = useBills();
  const { data: paymentRuns = [], isLoading: runsLoading } = usePaymentRuns();
  const summary = usePayablesSummary();

  return (
    <AppLayout title="Payables containment" subtitle="Read-only preservation of unverified legacy AP/payment metadata">
      <Alert className="border-warning/40 bg-warning/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>AP posting and payment execution are unavailable</AlertTitle>
        <AlertDescription>
          Legacy bill and payment-run rows are frozen evidence, not a subledger, aging report,
          payable balance, cash movement, or proof of payment. Controlled bill capture,
          matching, approval, posting, settlement, and reversal still require atomic workflows.
        </AlertDescription>
      </Alert>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Legacy bill headers", summary.billHeaderCount],
          ["Legacy payment-run headers", summary.paymentRunHistoryCount],
          ["Tenant vendor records", summary.vendorCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            {summary.isLoading ? <Skeleton className="mt-2 h-8 w-14" /> : (
              <p className="mt-2 text-2xl font-bold">{value}</p>
            )}
          </div>
        ))}
      </div>

      <Tabs defaultValue="bills" className="mt-6">
        <TabsList>
          <TabsTrigger value="bills">Bill metadata</TabsTrigger>
          <TabsTrigger value="payments">Payment-run metadata</TabsTrigger>
        </TabsList>
        <TabsContent value="bills" className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><FileWarning className="h-5 w-5" />Legacy bill headers</h2>
              <p className="text-sm text-muted-foreground">Amounts are intentionally not presented as accounting balances.</p>
            </div>
            <BillForm />
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Bill</TableHead><TableHead>Vendor</TableHead><TableHead>Issue date</TableHead><TableHead>Due date</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
            <TableBody>
              {billsLoading ? <TableRow><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                : bills.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No legacy bill headers.</TableCell></TableRow>
                : bills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell className="font-mono">{bill.bill_number}</TableCell>
                    <TableCell>{bill.vendors?.name ?? "Unknown vendor"}</TableCell>
                    <TableCell>{bill.issue_date}</TableCell>
                    <TableCell>{bill.due_date}</TableCell>
                    <TableCell><Badge variant="outline">Unverified legacy</Badge></TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="payments" className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><Landmark className="h-5 w-5" />Legacy payment-run headers</h2>
              <p className="text-sm text-muted-foreground">Recorded statuses are not proof that a bank or ledger action occurred.</p>
            </div>
            <PaymentRunForm />
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Run</TableHead><TableHead>Date</TableHead><TableHead>Recorded state</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
            <TableBody>
              {runsLoading ? <TableRow><TableCell colSpan={4}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                : paymentRuns.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No legacy payment-run headers.</TableCell></TableRow>
                : paymentRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono">{run.run_number}</TableCell>
                    <TableCell>{run.run_date}</TableCell>
                    <TableCell>{run.status}</TableCell>
                    <TableCell><Badge variant="outline">Unverified legacy</Badge></TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Payables;
