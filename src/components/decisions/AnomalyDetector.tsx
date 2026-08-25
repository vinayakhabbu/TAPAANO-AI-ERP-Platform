import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AnomalyDetector() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Anomaly analysis unavailable
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        No scan has run. Automated anomaly conclusions are disabled until their evidence and tenant boundary are audited.
      </CardContent>
    </Card>
  );
}
