import { ShieldAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Help() {
  return (
    <AppLayout title="Implementation status" subtitle="Current supported boundaries">
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Use this build only for recovery verification</AlertTitle>
        <AlertDescription>
          Authoritative behavior is limited to deterministic journals, accounting periods,
          exact reversal, and the supported atomic customer-invoice, full-credit, and manual
          full-receipt workflows, plus direct zero-tax functional-currency supplier-bill posting.
          Agent River, autonomous approvals, search, notifications, supplier-bill credits,
          AP approval/matching/payment execution, bank matching/reconciliation,
          tax, FX, inventory/production posting, payroll posting, forecasts, and financial
          reports are unavailable or unverified. See LOOP.md for executable evidence and staging requirements.
        </AlertDescription>
      </Alert>
    </AppLayout>
  );
}
