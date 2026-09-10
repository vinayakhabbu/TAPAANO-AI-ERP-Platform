import { SubledgerAging } from "@/components/reports/SubledgerAging";
import { AlertTriangle, FileCheck2, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { InvoiceForm } from "@/components/forms/InvoiceForm";
import { CreditNoteForm } from "@/components/forms/CreditNoteForm";
import { ReceiptForm } from "@/components/forms/ReceiptForm";
import { ReceiptCorrectionForm } from "@/components/forms/ReceiptCorrectionForm";
import { ReceiptReplacementForm } from "@/components/forms/ReceiptReplacementForm";
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
import { formatCurrencyTotal } from "@/lib/operationalSummary";

const Receivables = () => {
  const {
    invoices,
    creditNotes,
    receipts,
    receiptCorrections,
    receiptReplacements,
    stats,
    isLoading,
    error,
  } = useReceivables();
  const statsUnavailable = Boolean(error);

  const renderStat = (value: number, width = "w-16") => {
    if (isLoading) return <Skeleton className={`mt-2 h-8 ${width}`} />;
    return <p className="mt-2 text-2xl font-bold">{statsUnavailable ? "Unavailable" : value.toLocaleString()}</p>;
  };

  return (
    <AppLayout
      title="Customer invoicing"
      subtitle="Atomic invoice, receipt, credit, correction, and one-time replacement posting"
    >
      <Alert className="mb-6 border-warning/40 bg-warning/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Partial accounting workflow</AlertTitle>
        <AlertDescription>
          Only direct, zero-tax invoices in the legal entity&apos;s functional currency are supported.
          Full or partial receipts are supported for verified invoices. Review partial invoice credits, paid-invoice refunds and customer balances in Customer Credits and Refunds.
          Each receipt supports one exact correction and one server-derived replacement.
          Record partial allocations from aging; the server checks the available balance across dated history.
          Receipts are not bank-reconciled by posting; review their cash entries in Banking. Corrections and replacements are accounting entries, not refunds or bank actions.
          Partial credits, overpayments, refunds, collections, tax, FX, quotations, sales-order conversion,
          and shipping remain unavailable here. Approved subscriptions and revenue recognition are available under Contracts and Revenue.
        </AlertDescription>
      </Alert>

      <SubledgerAging kind="ar" />

      {statsUnavailable ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Receivables summary unavailable</AlertTitle>
          <AlertDescription>
            One or more verified-history reads failed. Counts and totals are hidden; do not interpret missing values as zero.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Replacement receipts</p>
          {renderStat(stats.receiptReplacementCount)}
          <p className="mt-1 text-xs text-muted-foreground">One verified post-correction replacement</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Receipt corrections</p>
          {renderStat(stats.receiptCorrectionCount)}
          <p className="mt-1 text-xs text-muted-foreground">Exact-offset accounting; not a refund</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Receipts recorded</p>
          {renderStat(stats.fullReceiptCount)}
          <p className="mt-1 text-xs text-muted-foreground">Manual accounting records; review Banking for reconciliation</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Full credit notes</p>
          {renderStat(stats.fullCreditCount)}
          <p className="mt-1 text-xs text-muted-foreground">Exact-offset corrections, not refunds</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Gross posted invoices by currency</p>
          {isLoading ? <Skeleton className="mt-2 h-8 w-28" /> : statsUnavailable ? (
            <p className="mt-2 text-lg font-bold">Unavailable</p>
          ) : stats.postedInvoiceTotals.length === 0 ? (
            <p className="mt-2 text-sm">No posted invoices</p>
          ) : stats.postedInvoiceTotals.map(({ currency, total }) => (
            <p key={currency} className="mt-2 break-words text-lg font-bold">{formatCurrencyTotal(currency, total)}</p>
          ))}
          <p className="mt-1 text-xs text-muted-foreground">Not an outstanding receivable or aging balance</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Posted invoices</p>
          {renderStat(stats.invoiceCount)}
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
              ) : invoices.map((invoice) => {
                const invoiceReceipts = receipts.filter(candidate => candidate.invoiceId === invoice.id);
                return (
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
                    ) : invoiceReceipts.length ? (
                      <div className="space-y-3">{invoiceReceipts.map(receipt => {
                        const correction = receiptCorrections.find(item => item.originalReceiptId === receipt.id);
                        const replacement = receiptReplacements.find(item => item.originalCorrectionId === correction?.id);
                        return <div key={receipt.id} className="space-y-1 rounded border p-2">
                          <p className="text-sm">{receipt.receiptNumber} · {receipt.receiptDate} · {receipt.currency} {receipt.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          {replacement ? <Badge variant="secondary">Replacement receipt recorded</Badge> : correction ? <>
                            <Badge variant="secondary">Receipt correction posted</Badge>
                            <ReceiptReplacementForm correctionId={correction.id} correctionNumber={correction.correctionNumber} correctionDate={correction.correctionDate} currency={correction.currency} amount={correction.amount} />
                          </> : <ReceiptCorrectionForm receiptId={receipt.id} receiptNumber={receipt.receiptNumber} receiptDate={receipt.receiptDate} currency={receipt.currency} amount={receipt.amount} />}
                        </div>;
                      })}<p className="text-xs text-muted-foreground">Record further allocations from aging. Historical receipts do not show the current balance.</p></div>
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
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </AppLayout>
  );
};

export default Receivables;
