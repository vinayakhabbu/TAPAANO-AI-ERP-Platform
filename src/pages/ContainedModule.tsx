import { Ban } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ContainedModuleProps {
  title: string;
  reason: string;
}

export default function ContainedModule({ title, reason }: ContainedModuleProps) {
  return (
    <AppLayout title={title} subtitle="Unavailable pending a controlled tenant-safe workflow">
      <Alert>
        <Ban className="h-4 w-4" />
        <AlertTitle>{title} is contained</AlertTitle>
        <AlertDescription>
          {reason} No transaction, approval, posting, prediction, balance, or audit result was produced.
        </AlertDescription>
      </Alert>
    </AppLayout>
  );
}
