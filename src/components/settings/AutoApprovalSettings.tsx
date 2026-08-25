import { BotOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AutoApprovalSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BotOff className="h-5 w-5" />
          Autonomous approval
        </CardTitle>
        <CardDescription>Unavailable pending an atomic, auditable approval workflow</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <AlertTitle>No autonomous action is enabled</AlertTitle>
          <AlertDescription>
            Legacy thresholds are not executable or editable. Purchase orders, payments,
            requisitions, and journals require their controlled manual workflows.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
