import { AlertTriangle, FileCheck2, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { InvoiceForm } from "@/components/forms/InvoiceForm";
import { CreditNoteForm } from "@/components/forms/CreditNoteForm";
import { ReceiptForm } from "@/components/forms/ReceiptForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReceivables } from "@/hooks/useReceivables";

const Receivables = () => {
  const { invoices, creditNotes, receipts, stats, isLoading, error } = useReceivables();

  return (
    <AppLayout
      title="Customer invoicing"
      subtitle="Atomic invoice, full-credit, and full-receipt posting within the supported boundary"
    >
      <Alert className="mb-6 border-warning/40 bg-warning/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Partial accounting workflow</AlertTitle>
        <AlertDescription>
          Only direct, zero-tax invoices in the legal entity&apos;s functional currency are supported.
          Full exact credit notes and manual full receipts are supported for verified invoices.
          Receipt amounts are derived by PostgreSQL and are not bank-reconciled. Partial credits,
          partial receipts, overpayments, refunds, collections, aging, tax, FX, quotations,
          sales-order conversion, shipping, subscriptions, and revenue recognition are unavailable.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Full receipts recorded</p>
          {isLoading ? <Skeleton className="mt-2 h-8 w-16" /> : (
            <p className="mt-2 text-2xl font-bold">{stats.fullReceiptCount}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Manual accounting records; not bank-reconciled</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Full credit notes</p>
          {isLoading ? <Skeleton className="mt-2 h-8 w-16" /> : (
            <p className="mt-2 text-2xl font-bold">{stats.fullCreditCount}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Exact-offset corrections, not refunds</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Gross posted invoice total</p>
          {isLoading ? <Skeleton className="mt-2 h-8 w-28" /> : (
            <p className="mt-2 text-2xl font-bold">{stats.postedInvoiceTotal.toLocaleString()}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Not an outstanding receivable or aging balance</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Posted invoices</p>
          {isLoading ? <Skeleton className="mt-2 h-8 w-16" /> : (
            <p className="mt-2 text-2xl font-bold">{stats.invoiceCount}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Verified journal-linked source documents</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <FileCheck2 className="h-5 w-5" />
              Verified posted invoice history
            </h2>
            <p className="text-sm text-muted-foreground">
              Tenant-scoped rows with a linked posted journal; legacy headers are excluded.
            </p>
          </div>
          <InvoiceForm />
        </div>

        {error ? (
          <div className="p-6 text-sm text-destructive">Posted invoice history is unavailable.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Issue date</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="text-right">Posted total</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Resolution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 7 }).map((__, cell) => (
                      <TableCell key={cell}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                    No verified posted invoices.
                  </TableCell>
                </TableRow>
              ) : invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-sm">{invoice.invoiceNumber}</TableCell>
                  <TableCell>{invoice.customerName}</TableCell>
                  <TableCell>{invoice.issueDate}</TableCell>
                  <TableCell>{invoice.dueDate}</TableCell>
                  <TableCell className="text-right font-mono">
                    {invoice.currency ?? "—"} {invoice.total.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck className="h-3 w-3" /> Journal linked
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {creditNotes.find((credit) => credit.originalInvoiceId === invoice.id) ? (
                      <Badge variant="secondary">
                        Full credit posted
                      </Badge>
                    ) : receipts.find((receipt) => receipt.invoiceId === invoice.id) ? (
                      <Badge variant="secondary">
                        Full receipt recorded
                      </Badge>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <ReceiptForm
                          invoiceId={invoice.id}
                          invoiceNumber={invoice.invoiceNumber}
                          invoiceIssueDate={invoice.issueDate}
                          currency={invoice.currency ?? ""}
                          total={invoice.total}
                        />
                        <CreditNoteForm
                          invoiceId={invoice.id}
                          invoiceNumber={invoice.invoiceNumber}
                          invoiceIssueDate={invoice.issueDate}
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </AppLayout>
  );
};

export default Receivables;
