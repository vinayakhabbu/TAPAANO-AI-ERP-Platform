import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PaymentRunForm({ trigger }: { trigger?: React.ReactNode }) {
  void trigger;
  return (
    <Button disabled variant="outline" className="gap-2" title="Payment execution is unavailable">
      <Ban className="h-4 w-4" />
      Payment execution unavailable
    </Button>
  );
}
