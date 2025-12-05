import { useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ShipmentFormProps {
  trigger?: React.ReactNode;
}

export function ShipmentForm({ trigger }: ShipmentFormProps) {
  const [open, setOpen] = useState(false);
  const [salesOrderId, setSalesOrderId] = useState("");
  const [shipDate, setShipDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const { data: salesOrders = [] } = useQuery({
    queryKey: ["sales-orders-for-shipment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select(`
          id, 
          so_number, 
          customers (name)
        `)
        .in("status", ["confirmed", "partially_shipped"]);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: entities = [] } = useQuery({
    queryKey: ["entities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entities").select("id, name");
      if (error) throw error;
      return data || [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const entityId = entities[0]?.id;
      if (!entityId) throw new Error("No entity found");

      const shipmentNumber = `SHP-${Date.now().toString().slice(-6)}`;

      const { error } = await supabase.from("shipments").insert({
        org_id: profile.org_id,
        entity_id: entityId,
        sales_order_id: salesOrderId,
        shipment_number: shipmentNumber,
        ship_date: shipDate,
        carrier: carrier || null,
        tracking_number: trackingNumber || null,
        notes: notes || null,
      });

      if (error) throw error;

      // Update sales order status
      await supabase
        .from("sales_orders")
        .update({ status: "shipped" })
        .eq("id", salesOrderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Shipment created successfully");
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to create shipment: " + error.message);
    },
  });

  const resetForm = () => {
    setSalesOrderId("");
    setShipDate(format(new Date(), "yyyy-MM-dd"));
    setCarrier("");
    setTrackingNumber("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Create Shipment
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Shipment</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Sales Order *</Label>
            <Select value={salesOrderId} onValueChange={setSalesOrderId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select sales order" />
              </SelectTrigger>
              <SelectContent>
                {salesOrders.map((so) => (
                  <SelectItem key={so.id} value={so.id}>
                    {so.so_number} - {so.customers?.name || "Unknown"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ship Date *</Label>
            <Input
              type="date"
              value={shipDate}
              onChange={(e) => setShipDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Carrier</Label>
              <Input
                placeholder="e.g., FedEx, UPS"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tracking Number</Label>
              <Input
                placeholder="Tracking #"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!salesOrderId || mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create Shipment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
