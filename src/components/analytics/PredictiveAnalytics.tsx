import { Ban } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const PredictiveAnalytics = () => (
  <Alert>
    <Ban className="h-4 w-4" />
    <AlertTitle>Financial predictions unavailable</AlertTitle>
    <AlertDescription>
      The application does not generate cash-flow or revenue forecasts from unverified
      invoice, bill, bank-balance, or opportunity headers.
    </AlertDescription>
  </Alert>
);

export default PredictiveAnalytics;
