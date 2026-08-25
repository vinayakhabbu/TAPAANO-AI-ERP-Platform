import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AutonomousApprover() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Autonomous approval unavailable
        </CardTitle>
        <CardDescription>
          Automated approval and execution are disabled pending a transactional, tenant-authorized workflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Review and approve supported documents only through their audited manual workflows.
      </CardContent>
    </Card>
  );
}
