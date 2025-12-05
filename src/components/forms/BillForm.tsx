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
import { addDays, format } from "date-fns";

interface BillFormProps {
  trigger?: React.ReactNode;
}

export function BillForm({ trigger }: BillFormProps) {
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [subtotal, setSubtotal] = useState("");
  const [taxRate, setTaxRate] = useState("10");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchase-orders-for-bill"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_number, vendor_id, total")
        .in("status", ["approved", "partially_received", "received"]);
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

      const subtotalNum = parseFloat(subtotal) || 0;
      const tax = subtotalNum * (parseFloat(taxRate) / 100);
      const total = subtotalNum + tax;

      const billNumber = `BILL-${Date.now().toString().slice(-6)}`;

      const { error } = await supabase.from("bills").insert({
        org_id: profile.org_id,
        entity_id: entityId,
        vendor_id: vendorId,
        purchase_order_id: purchaseOrderId || null,
        bill_number: billNumber,
        due_date: dueDate,
        subtotal: subtotalNum,
        tax,
        total,
        notes: notes || null,
        status: "pending",
        match_status: purchaseOrderId ? "partial" : "unmatched",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      toast.success("Bill created successfully");
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to create bill: " + error.message);
    },
  });

  const resetForm = () => {
    setVendorId("");
    setPurchaseOrderId("");
    setDueDate(format(addDays(new Date(), 30), "yyyy-MM-dd"));
    setSubtotal("");
    setTaxRate("10");
    setNotes("");
  };

  const handlePOSelect = (poId: string) => {
    setPurchaseOrderId(poId);
    const po = purchaseOrders.find((p) => p.id === poId);
    if (po) {
      setVendorId(po.vendor_id);
      const poSubtotal = po.total / 1.1; // Reverse the tax
      setSubtotal(poSubtotal.toFixed(2));
    }
  };

  const subtotalNum = parseFloat(subtotal) || 0;
  const tax = subtotalNum * (parseFloat(taxRate) / 100);
  const total = subtotalNum + tax;

  const filteredPOs = vendorId
    ? purchaseOrders.filter((po) => po.vendor_id === vendorId)
    : purchaseOrders;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Bill</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Bill</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Link to PO (optional)</Label>
            <Select value={purchaseOrderId} onValueChange={handlePOSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select PO to link" />
              </SelectTrigger>
              <SelectContent>
                {filteredPOs.map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.po_number} - ${po.total.toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Vendor *</Label>
            <Select value={vendorId} onValueChange={setVendorId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Due Date *</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Subtotal *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={subtotal}
                onChange={(e) => setSubtotal(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tax Rate (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="border-t pt-4 space-y-1 text-right">
            <p className="text-sm text-muted-foreground">Subtotal: ${subtotalNum.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">Tax ({taxRate}%): ${tax.toFixed(2)}</p>
            <p className="text-lg font-semibold">Total: ${total.toFixed(2)}</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!vendorId || !subtotal || mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create Bill"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
