import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BillForm({ trigger }: { trigger?: React.ReactNode }) {
  void trigger;
  return (
    <Button disabled variant="outline" className="gap-2" title="Controlled bill capture is unavailable">
      <Ban className="h-4 w-4" />
      Bill capture unavailable
    </Button>
  );
}
