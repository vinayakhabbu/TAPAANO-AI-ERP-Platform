import { KeyRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function APIKeysSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          External API credentials
        </CardTitle>
        <CardDescription>Unavailable while privileged AI workflows are contained</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <AlertTitle>Credential storage disabled</AlertTitle>
          <AlertDescription>
            This browser does not read, accept, display, update, or remove OpenAI API keys.
            Existing legacy values are preserved but inaccessible pending a managed secret-storage migration.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
