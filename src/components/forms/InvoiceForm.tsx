import { useState, useEffect } from "react";
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
import { CURRENCIES, useLatestRates } from "@/hooks/useCurrency";
import { useTaxCodesWithRates } from "@/hooks/useTransactionDefaults";

interface InvoiceFormProps {
  trigger?: React.ReactNode;
  defaultSalesOrderId?: string;
  defaultShipmentId?: string;
}

export function InvoiceForm({ trigger, defaultSalesOrderId, defaultShipmentId }: InvoiceFormProps) {
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [salesOrderId, setSalesOrderId] = useState(defaultSalesOrderId || "");
  const [shipmentId, setShipmentId] = useState(defaultShipmentId || "");
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [subtotal, setSubtotal] = useState("");
  const [taxCodeId, setTaxCodeId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
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
      const { data, error } = await supabase.from("entities").select("id, name, currency");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: shippedOrders = [] } = useQuery({
    queryKey: ["shipped-sales-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select(`id, so_number, customer_id, total, customers (name)`)
        .eq("status", "shipped");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: orderShipments = [] } = useQuery({
    queryKey: ["shipments-for-order", salesOrderId],
    queryFn: async () => {
      if (!salesOrderId) return [];
      const { data, error } = await supabase
        .from("shipments")
        .select("id, shipment_number, ship_date")
        .eq("sales_order_id", salesOrderId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!salesOrderId,
  });

  const { data: taxCodes = [] } = useTaxCodesWithRates();
  const salesTaxCodes = taxCodes.filter(tc => tc.tax_type === "sales" || tc.tax_type === "vat_output");
  
  const { data: latestRates = [] } = useLatestRates();
  
  // Get exchange rate for selected currency
  const getExchangeRate = () => {
    if (currency === "USD") return 1;
    const rate = latestRates.find(r => r.from_currency === currency && r.to_currency === "USD");
    return rate?.rate || 1;
  };

  // Get tax rate from selected tax code
  const getTaxRate = () => {
    if (!taxCodeId) return 0;
    const taxCode = taxCodes.find(tc => tc.id === taxCodeId);
    return taxCode?.currentRate || 0;
  };

  useEffect(() => {
    if (salesOrderId && salesOrderId !== "manual") {
      const selectedOrder = shippedOrders.find((o) => o.id === salesOrderId);
      if (selectedOrder) {
        setCustomerId(selectedOrder.customer_id);
        setSubtotal(selectedOrder.total.toString());
      }
    }
  }, [salesOrderId, shippedOrders]);

  useEffect(() => {
    if (orderShipments.length > 0 && !shipmentId) {
      setShipmentId(orderShipments[0].id);
    }
  }, [orderShipments, shipmentId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const entityId = entities[0]?.id;
      if (!entityId) throw new Error("No entity found");

      const subtotalNum = parseFloat(subtotal) || 0;
      const taxRate = getTaxRate();
      const tax = subtotalNum * (taxRate / 100);
      const total = subtotalNum + tax;
      const exchangeRate = getExchangeRate();
      const functionalTotal = total * exchangeRate;

      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const actualSalesOrderId = salesOrderId === "manual" ? null : salesOrderId;
      
      const { error } = await supabase.from("invoices").insert({
        org_id: profile.org_id,
        entity_id: entityId,
        customer_id: customerId,
        invoice_number: invoiceNumber,
        due_date: dueDate,
        subtotal: subtotalNum,
        tax,
        total,
        notes: notes || null,
        status: "draft",
        sales_order_id: actualSalesOrderId || null,
        shipment_id: actualSalesOrderId ? (shipmentId || null) : null,
        tax_code_id: taxCodeId || null,
        currency: currency,
        exchange_rate: exchangeRate,
        functional_total: functionalTotal,
      });

      if (error) throw error;

      if (actualSalesOrderId) {
        await supabase
          .from("sales_orders")
          .update({ status: "invoiced" })
          .eq("id", salesOrderId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices-with-customers"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["shipped-sales-orders"] });
      toast.success("Invoice created successfully");
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to create invoice: " + error.message);
    },
  });

  const resetForm = () => {
    setCustomerId("");
    setSalesOrderId(defaultSalesOrderId || "");
    setShipmentId(defaultShipmentId || "");
    setDueDate(format(addDays(new Date(), 30), "yyyy-MM-dd"));
    setSubtotal("");
    setTaxCodeId("");
    setCurrency("USD");
    setNotes("");
  };

  const subtotalNum = parseFloat(subtotal) || 0;
  const taxRate = getTaxRate();
  const tax = subtotalNum * (taxRate / 100);
  const total = subtotalNum + tax;
  const exchangeRate = getExchangeRate();
  const functionalTotal = total * exchangeRate;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Invoice
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>From Sales Order (optional)</Label>
            <Select value={salesOrderId} onValueChange={setSalesOrderId}>
              <SelectTrigger>
                <SelectValue placeholder="Select shipped order to invoice..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">— Manual Invoice —</SelectItem>
                {shippedOrders.map((so) => (
                  <SelectItem key={so.id} value={so.id}>
                    {so.so_number} - {so.customers?.name} (${so.total.toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {salesOrderId && salesOrderId !== "manual" && orderShipments.length > 0 && (
            <div className="space-y-2">
              <Label>Shipment</Label>
              <Select value={shipmentId} onValueChange={setShipmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shipment..." />
                </SelectTrigger>
                <SelectContent>
                  {orderShipments.map((sh) => (
                    <SelectItem key={sh.id} value={sh.id}>
                      {sh.shipment_number} - {format(new Date(sh.ship_date), "MMM d, yyyy")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Customer *</Label>
            <Select 
              value={customerId} 
              onValueChange={setCustomerId} 
              disabled={salesOrderId !== "manual" && !!salesOrderId}
            >
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
              <Label>Due Date *</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
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
                disabled={salesOrderId !== "manual" && !!salesOrderId}
                required
              />
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
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="border-t pt-4 space-y-1 text-right">
            <p className="text-sm text-muted-foreground">Subtotal: {currency} {subtotalNum.toFixed(2)}</p>
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
            <Button type="submit" disabled={!customerId || !subtotal || mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create Invoice"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
