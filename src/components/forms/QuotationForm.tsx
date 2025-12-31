import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useCreateQuotation } from "@/hooks/useQuotations";
import { useReceivables } from "@/hooks/useReceivables";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { CURRENCIES, useLatestRates } from "@/hooks/useCurrency";
import { useTaxCodesWithRates } from "@/hooks/useTransactionDefaults";

interface QuotationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export function QuotationForm({ open, onOpenChange }: QuotationFormProps) {
  const { toast } = useToast();
  const createQuotation = useCreateQuotation();
  const { customers } = useReceivables();

  const { data: entities } = useQuery({
    queryKey: ["entities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entities").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: taxCodes = [] } = useTaxCodesWithRates();
  const salesTaxCodes = taxCodes.filter(tc => tc.tax_type === "sales" || tc.tax_type === "vat_output");
  
  const { data: latestRates = [] } = useLatestRates();

  const [formData, setFormData] = useState({
    customer_id: "",
    entity_id: "",
    quote_number: `QT-${Date.now().toString().slice(-8)}`,
    quote_date: new Date().toISOString().split("T")[0],
    valid_until: "",
    notes: "",
    tax_code_id: "",
    currency: "USD",
  });

  const [lines, setLines] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price: 0 },
  ]);

  const getExchangeRate = () => {
    if (formData.currency === "USD") return 1;
    const rate = latestRates.find(r => r.from_currency === formData.currency && r.to_currency === "USD");
    return rate?.rate || 1;
  };

  const getTaxRate = () => {
    if (!formData.tax_code_id) return 0;
    const taxCode = taxCodes.find(tc => tc.id === formData.tax_code_id);
    return taxCode?.currentRate || 0;
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
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const calculateTotals = () => {
    const subtotal = lines.reduce(
      (sum, line) => sum + line.quantity * line.unit_price,
      0
    );
    const taxRate = getTaxRate();
    const tax = subtotal * (taxRate / 100);
    return { subtotal, tax, total: subtotal + tax, taxRate };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { subtotal, tax, total } = calculateTotals();

    try {
      await createQuotation.mutateAsync({
        ...formData,
        subtotal,
        tax,
        total,
        lines: lines.map((line) => ({
          ...line,
          amount: line.quantity * line.unit_price,
        })),
      });

      toast({ title: "Quotation Created", description: "Quotation saved successfully" });
      onOpenChange(false);
      setFormData({
        customer_id: "",
        entity_id: "",
        quote_number: `QT-${Date.now().toString().slice(-8)}`,
        quote_date: new Date().toISOString().split("T")[0],
        valid_until: "",
        notes: "",
        tax_code_id: "",
        currency: "USD",
      });
      setLines([{ description: "", quantity: 1, unit_price: 0 }]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create quotation",
        variant: "destructive",
      });
    }
  };

  const { subtotal, tax, total, taxRate } = calculateTotals();
  const exchangeRate = getExchangeRate();
  const functionalTotal = total * exchangeRate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Quotation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quote Number</Label>
              <Input
                value={formData.quote_number}
                onChange={(e) =>
                  setFormData({ ...formData, quote_number: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Entity</Label>
              <Select
                value={formData.entity_id}
                onValueChange={(v) => setFormData({ ...formData, entity_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select entity" />
                </SelectTrigger>
                <SelectContent>
                  {entities?.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={formData.customer_id}
                onValueChange={(v) => setFormData({ ...formData, customer_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(v) => setFormData({ ...formData, currency: v })}
              >
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
              <Label>Quote Date</Label>
              <Input
                type="date"
                value={formData.quote_date}
                onChange={(e) =>
                  setFormData({ ...formData, quote_date: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Valid Until</Label>
              <Input
                type="date"
                value={formData.valid_until}
                onChange={(e) =>
                  setFormData({ ...formData, valid_until: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Tax Code</Label>
              <Select
                value={formData.tax_code_id}
                onValueChange={(v) => setFormData({ ...formData, tax_code_id: v })}
              >
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

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Add Line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <Input
                    placeholder="Description"
                    className="flex-1"
                    value={line.description}
                    onChange={(e) => updateLine(index, "description", e.target.value)}
                    required
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    className="w-20"
                    value={line.quantity}
                    onChange={(e) => updateLine(index, "quantity", Number(e.target.value))}
                    min={1}
                    required
                  />
                  <Input
                    type="number"
                    placeholder="Unit Price"
                    className="w-28"
                    value={line.unit_price}
                    onChange={(e) => updateLine(index, "unit_price", Number(e.target.value))}
                    min={0}
                    step="0.01"
                    required
                  />
                  <div className="w-24 text-right pt-2 text-sm">
                    {formData.currency} {(line.quantity * line.unit_price).toFixed(2)}
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
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
            />
          </div>

          <div className="border-t pt-4 space-y-1 text-right">
            <div>Subtotal: {formData.currency} {subtotal.toFixed(2)}</div>
            <div>Tax ({taxRate}%): {formData.currency} {tax.toFixed(2)}</div>
            <div className="text-lg font-semibold">Total: {formData.currency} {total.toFixed(2)}</div>
            {formData.currency !== "USD" && (
              <div className="text-xs text-muted-foreground">
                ≈ USD {functionalTotal.toFixed(2)} @ {exchangeRate.toFixed(4)}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createQuotation.isPending}>
              {createQuotation.isPending ? "Saving..." : "Create Quotation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
