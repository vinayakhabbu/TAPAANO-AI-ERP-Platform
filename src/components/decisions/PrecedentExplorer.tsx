import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PrecedentExplorer() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Precedent search unavailable
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Historical decision rows are not similarity evidence. Search and precedent promotion are disabled pending audited provenance.
      </CardContent>
    </Card>
  );
}
