import { AlertTriangle, FileCheck2, FileWarning, Landmark, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { BillForm } from "@/components/forms/BillForm";
import { SupplierBillCreditForm } from "@/components/forms/SupplierBillCreditForm";
import { PaymentRunForm } from "@/components/forms/PaymentRunForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBills, usePayablesSummary, usePaymentRuns, usePostedSupplierBills, usePostedSupplierCredits } from "@/hooks/usePayables";

const Payables = () => {
  const { data: bills = [], isLoading: billsLoading } = useBills();
  const { data: postedBills = [], isLoading: postedBillsLoading } = usePostedSupplierBills();
  const { data: postedCredits = [] } = usePostedSupplierCredits();
  const { data: paymentRuns = [], isLoading: runsLoading } = usePaymentRuns();
  const summary = usePayablesSummary();

  return (
    <AppLayout title="Supplier bills" subtitle="Atomic supplier-bill posting within the supported AP boundary">
      <Alert className="border-warning/40 bg-warning/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Supplier-bill posting boundary</AlertTitle>
        <AlertDescription>
          Direct, zero-tax bills in the entity&apos;s functional currency can post atomically to
          a configured expense and AP control account. Full exact supplier credits are supported.
          Payment execution remains unavailable, as do approval, matching, PO/receipt conversion,
          tax, FX, partial credits, refunds, aging, and settlement.
          Legacy rows remain frozen metadata and are not included in verified posted history.
        </AlertDescription>
      </Alert>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Verified posted bills", summary.postedBillCount],
          ["Full supplier credits", summary.postedCreditCount],
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

      <Tabs defaultValue="posted" className="mt-6">
        <TabsList>
          <TabsTrigger value="posted">Posted bills</TabsTrigger>
          <TabsTrigger value="bills">Legacy bill metadata</TabsTrigger>
          <TabsTrigger value="payments">Payment-run metadata</TabsTrigger>
        </TabsList>
        <TabsContent value="posted" className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><FileCheck2 className="h-5 w-5" />Verified posted supplier bills</h2>
              <p className="text-sm text-muted-foreground">Tenant-scoped source documents linked to immutable balanced AP journals.</p>
            </div>
            <BillForm />
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Bill</TableHead><TableHead>Vendor</TableHead><TableHead>Issue date</TableHead><TableHead>Due date</TableHead><TableHead className="text-right">Posted total</TableHead><TableHead>Evidence</TableHead><TableHead>Resolution</TableHead></TableRow></TableHeader>
            <TableBody>
              {postedBillsLoading ? <TableRow><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                : postedBills.length === 0 ? <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No verified posted supplier bills.</TableCell></TableRow>
                : postedBills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell className="font-mono">{bill.billNumber}</TableCell>
                    <TableCell>{bill.vendorName}</TableCell>
                    <TableCell>{bill.issueDate}</TableCell>
                    <TableCell>{bill.dueDate}</TableCell>
                    <TableCell className="text-right font-mono">{bill.currency || "—"} {bill.total.toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" />Journal linked</Badge></TableCell>
                    <TableCell>
                      {postedCredits.find((credit) => credit.originalBillId === bill.id) ? (
                        <Badge variant="secondary">Full supplier credit posted</Badge>
                      ) : (
                        <SupplierBillCreditForm billId={bill.id} billNumber={bill.billNumber} billIssueDate={bill.issueDate} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="bills" className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><FileWarning className="h-5 w-5" />Legacy bill headers</h2>
              <p className="text-sm text-muted-foreground">Amounts are intentionally not presented as accounting balances.</p>
            </div>
            <Badge variant="outline">Read only</Badge>
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
