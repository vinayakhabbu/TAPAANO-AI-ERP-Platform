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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CURRENCIES, useLatestRates } from "@/hooks/useCurrency";
import { useTaxCodesWithRates } from "@/hooks/useTransactionDefaults";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface SalesOrderFormProps {
  trigger?: React.ReactNode;
}

export function SalesOrderForm({ trigger }: SalesOrderFormProps) {
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [taxCodeId, setTaxCodeId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const queryClient = useQueryClient();

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name");
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

  const { data: taxCodes = [] } = useTaxCodesWithRates();
  const salesTaxCodes = taxCodes.filter(tc => tc.tax_type === "sales" || tc.tax_type === "vat_output");
  
  const { data: latestRates = [] } = useLatestRates();
  
  const getExchangeRate = () => {
    if (currency === "USD") return 1;
    const rate = latestRates.find(r => r.from_currency === currency && r.to_currency === "USD");
    return rate?.rate || 1;
  };

  const getTaxRate = () => {
    if (!taxCodeId) return 0;
    const taxCode = taxCodes.find(tc => tc.id === taxCodeId);
    return taxCode?.currentRate || 0;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const entityId = entities[0]?.id;
      if (!entityId) throw new Error("No entity found");

      const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
      const taxRate = getTaxRate();
      const tax = subtotal * (taxRate / 100);
      const total = subtotal + tax;

      const soNumber = `SO-${Date.now().toString().slice(-6)}`;

      const { data: so, error: soError } = await supabase
        .from("sales_orders")
        .insert({
          org_id: profile.org_id,
          entity_id: entityId,
          customer_id: customerId,
          so_number: soNumber,
          requested_delivery_date: requestedDeliveryDate || null,
          notes: notes || null,
          subtotal,
          tax,
          total,
          status: "draft",
          currency,
          tax_code_id: taxCodeId || null,
        })
        .select()
        .single();

      if (soError) throw soError;

      const lineInserts = lines.filter(l => l.description).map((l) => ({
        sales_order_id: so.id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        amount: l.quantity * l.unit_price,
      }));

      if (lineInserts.length > 0) {
        const { error: linesError } = await supabase
          .from("sales_order_lines")
          .insert(lineInserts);
        if (linesError) throw linesError;
      }

      return so;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Sales order created successfully");
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to create sales order: " + error.message);
    },
  });

  const resetForm = () => {
    setCustomerId("");
    setRequestedDeliveryDate("");
    setNotes("");
    setLines([{ description: "", quantity: 1, unit_price: 0 }]);
    setTaxCodeId("");
    setCurrency("USD");
  };

  const addLine = () => {
    setLines([...lines, { description: "", quantity: 1, unit_price: 0 }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const updateLine = (index: number, field: keyof LineItem, value: string | number) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setLines(newLines);
  };

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
  const taxRate = getTaxRate();
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;
  const exchangeRate = getExchangeRate();
  const functionalTotal = total * exchangeRate;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Order
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Sales Order</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select value={customerId} onValueChange={setCustomerId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Requested Delivery</Label>
              <Input
                type="date"
                value={requestedDeliveryDate}
                onChange={(e) => setRequestedDeliveryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tax Code</Label>
              <Select value={taxCodeId} onValueChange={setTaxCodeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tax code" />
                </SelectTrigger>
                <SelectContent>
                  {salesTaxCodes.map((tc) => (
                    <SelectItem key={tc.id} value={tc.id}>
                      {tc.code} ({tc.currentRate}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Line Items</Label>
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => updateLine(index, "description", e.target.value)}
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, "quantity", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      placeholder="Price"
                      value={line.unit_price}
                      onChange={(e) => updateLine(index, "unit_price", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="w-24 text-right font-medium">
                    {currency} {(line.quantity * line.unit_price).toFixed(2)}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(index)}
                    disabled={lines.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4 mr-2" />
              Add Line
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="border-t pt-4 space-y-1 text-right">
            <p className="text-sm text-muted-foreground">Subtotal: {currency} {subtotal.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">Tax ({taxRate}%): {currency} {tax.toFixed(2)}</p>
            <p className="text-lg font-semibold">Total: {currency} {total.toFixed(2)}</p>
            {currency !== "USD" && (
              <p className="text-xs text-muted-foreground">
                ≈ USD {functionalTotal.toFixed(2)} @ {exchangeRate.toFixed(4)}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!customerId || mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
