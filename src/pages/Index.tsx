import { Link } from "react-router-dom";
import { AlertTriangle, BookLock, FileCheck2, Landmark, ReceiptText } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useReceivables } from "@/hooks/useReceivables";
import { usePayablesSummary } from "@/hooks/usePayables";
import { useBankAccounts } from "@/hooks/useBanking";
import { useAccountingPeriods } from "@/hooks/usePeriodClose";

const Index = () => {
  const receivables = useReceivables();
  const payables = usePayablesSummary();
  const bankAccounts = useBankAccounts();
  const periods = useAccountingPeriods();
  const loading = receivables.isLoading || payables.isLoading || bankAccounts.isLoading || periods.isLoading;
  const summaryUnavailable = Boolean(
    receivables.error || payables.error || bankAccounts.error || periods.error,
  );
  const openPeriods = periods.data?.filter((period) => period.status === "OPEN").length ?? 0;

  const cards = [
    { label: "Journal-linked posted invoices", value: receivables.stats.invoiceCount, href: "/ar", icon: FileCheck2 },
    { label: "Open accounting periods", value: openPeriods, href: "/close", icon: BookLock },
    { label: "Legacy bill headers", value: payables.billHeaderCount, href: "/ap", icon: ReceiptText },
    { label: "Bank metadata rows", value: bankAccounts.data?.length ?? 0, href: "/banking", icon: Landmark },
  ];

  return (
    <AppLayout title="Recovery status" subtitle="Verified accounting slices and explicit containment boundaries">
      <Alert className="border-warning/40 bg-warning/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>TAPAANO is not production-ready</AlertTitle>
        <AlertDescription>
          Only the journal/period foundation and the narrow zero-tax,
          functional-currency invoice, bill, full-credit, manual full-settlement,
          correction, and one-time replacement paths are authoritative. All other
          financial capabilities are read-only preservation metadata or unavailable.
        </AlertDescription>
      </Alert>

      {summaryUnavailable ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Operational summary unavailable</AlertTitle>
          <AlertDescription>
            One or more tenant-scoped reads failed. Counts are hidden; do not interpret missing values as zero.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, href, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
            {loading ? <Skeleton className="mt-3 h-8 w-16" /> : (
              <p className="mt-3 text-2xl font-bold">{summaryUnavailable ? "Unavailable" : value}</p>
            )}
            <Button asChild variant="link" className="mt-2 h-auto p-0"><Link to={href}>View boundary</Link></Button>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Verified locally</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Balanced, idempotent journals; immutable posting history; exact-offset reversals.</li>
          <li>Entity accounting-period enforcement with terminal hard close.</li>
          <li>Atomic invoice, line, accounting-event, period, and journal creation for the supported invoice boundary.</li>
          <li>Atomic full credit notes with copied lines and exact-offset reversal journals.</li>
          <li>Server-derived manual full customer receipts and supplier payments through cash clearing.</li>
          <li>Immutable exact-offset settlement corrections and one verified replacement; no bank-action claim.</li>
          <li>Atomic supplier bills and full supplier credits within the verified zero-tax functional-currency boundary.</li>
          <li>Fail-closed privileged AI, search, notification, AP/payment, and banking execution paths.</li>
        </ul>
      </div>
    </AppLayout>
  );
};

export default Index;
