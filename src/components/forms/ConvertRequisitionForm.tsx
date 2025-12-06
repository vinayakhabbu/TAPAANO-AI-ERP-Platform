import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useConvertRequisitionToPO, PurchaseRequisition } from "@/hooks/usePurchaseRequisitions";
import { useVendors } from "@/hooks/usePayables";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ConvertRequisitionFormProps {
  requisition: PurchaseRequisition;
  trigger?: React.ReactNode;
}

export function ConvertRequisitionForm({ requisition, trigger }: ConvertRequisitionFormProps) {
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");

  const { profile } = useAuth();
  const convertToPO = useConvertRequisitionToPO();
  const { data: vendors = [] } = useVendors();

  const { data: entities = [] } = useQuery({
    queryKey: ["entities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entities")
        .select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.org_id || !vendorId || entities.length === 0) return;

    await convertToPO.mutateAsync({
      requisitionId: requisition.id,
      vendorId,
      entityId: entities[0].id,
      orgId: profile.org_id,
      expectedDeliveryDate: expectedDeliveryDate || undefined,
      notes: notes || undefined,
    });

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1">
            <ArrowRightCircle className="h-4 w-4" />
            Convert to PO
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert to Purchase Order</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-muted rounded-lg text-sm">
            <p><strong>Requisition:</strong> {requisition.requisition_number}</p>
            {requisition.department && <p><strong>Department:</strong> {requisition.department}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor *</Label>
            <Select value={vendorId} onValueChange={setVendorId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expectedDeliveryDate">Expected Delivery Date</Label>
            <Input
              id="expectedDeliveryDate"
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes for the PO..."
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={convertToPO.isPending || !vendorId}>
              {convertToPO.isPending ? "Converting..." : "Create Purchase Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
