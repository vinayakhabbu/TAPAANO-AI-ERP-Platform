import { Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ScheduledReportsManager() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Scheduled delivery unavailable
        </CardTitle>
        <CardDescription>Financial report email delivery is disabled.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        No report is generated or sent from this screen while report evidence and recipient authorization are under review.
      </CardContent>
    </Card>
  );
}
