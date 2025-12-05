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

interface GoodsReceiptFormProps {
  trigger?: React.ReactNode;
}

export function GoodsReceiptForm({ trigger }: GoodsReceiptFormProps) {
  const [open, setOpen] = useState(false);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [receiptDate, setReceiptDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchase-orders-for-receipt"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
          id, 
          po_number, 
          vendors (name)
        `)
        .in("status", ["approved", "partially_received"]);
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

      const receiptNumber = `GR-${Date.now().toString().slice(-6)}`;

      const { error } = await supabase.from("goods_receipts").insert({
        org_id: profile.org_id,
        entity_id: entityId,
        purchase_order_id: purchaseOrderId,
        receipt_number: receiptNumber,
        receipt_date: receiptDate,
        notes: notes || null,
      });

      if (error) throw error;

      // Update PO status
      await supabase
        .from("purchase_orders")
        .update({ status: "received" })
        .eq("id", purchaseOrderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Goods receipt created successfully");
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to create goods receipt: " + error.message);
    },
  });

  const resetForm = () => {
    setPurchaseOrderId("");
    setReceiptDate(format(new Date(), "yyyy-MM-dd"));
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Receive Goods</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive Goods</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Purchase Order *</Label>
            <Select value={purchaseOrderId} onValueChange={setPurchaseOrderId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select purchase order" />
              </SelectTrigger>
              <SelectContent>
                {purchaseOrders.map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.po_number} - {po.vendors?.name || "Unknown"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Receipt Date *</Label>
            <Input
              type="date"
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              placeholder="Add any notes about the received goods..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!purchaseOrderId || mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Receive Goods"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
