import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VendorForm({ trigger }: { trigger?: React.ReactNode }) {
  void trigger;
  return <Button disabled variant="outline" className="gap-2"><Ban className="h-4 w-4" />Vendor maintenance unavailable</Button>;
}
