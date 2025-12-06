import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useProducts, useWarehouses } from "@/hooks/useInventory";
import { useCreateInventoryReceipt } from "@/hooks/useInventoryReceipts";

interface ReceiptLine {
  product_id: string;
  quantity: string;
  unit_cost: string;
  reason: string;
}

interface InventoryReceiptFormProps {
  trigger?: React.ReactNode;
}

export const InventoryReceiptForm = ({ trigger }: InventoryReceiptFormProps) => {
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [receiptType, setReceiptType] = useState<string>("adjustment_in");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([
    { product_id: "", quantity: "", unit_cost: "", reason: "" }
  ]);

  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const createReceipt = useCreateInventoryReceipt();

  const addLine = () => {
    setLines([...lines, { product_id: "", quantity: "", unit_cost: "", reason: "" }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const updateLine = (index: number, field: keyof ReceiptLine, value: string) => {
    const updated = [...lines];
    updated[index][field] = value;
    setLines(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validLines = lines.filter(l => l.product_id && l.quantity);
    if (validLines.length === 0) return;

    await createReceipt.mutateAsync({
      warehouse_id: warehouseId,
      receipt_type: receiptType,
      receipt_date: receiptDate,
      notes,
      lines: validLines.map(l => ({
        product_id: l.product_id,
        quantity: receiptType.includes("out") || receiptType === "damage" 
          ? -Math.abs(Number(l.quantity)) 
          : Math.abs(Number(l.quantity)),
        unit_cost: Number(l.unit_cost) || 0,
        reason: l.reason,
      })),
    });

    setWarehouseId("");
    setReceiptType("adjustment_in");
    setReceiptDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setLines([{ product_id: "", quantity: "", unit_cost: "", reason: "" }]);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Inventory Receipt
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Inventory Receipt</DialogTitle>
          <DialogDescription>
            Adjust inventory quantities directly without a purchase order or shipment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="warehouse">Warehouse *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((wh: any) => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Receipt Type *</Label>
              <Select value={receiptType} onValueChange={setReceiptType} required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adjustment_in">Adjustment In (+)</SelectItem>
                  <SelectItem value="adjustment_out">Adjustment Out (-)</SelectItem>
                  <SelectItem value="initial_stock">Initial Stock</SelectItem>
                  <SelectItem value="count_adjustment">Count Adjustment</SelectItem>
                  <SelectItem value="damage">Damage/Scrap (-)</SelectItem>
                  <SelectItem value="return">Customer Return (+)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Receipt Date *</Label>
              <Input
                id="date"
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Add Line
              </Button>
            </div>
            <div className="space-y-3 rounded-lg border border-border p-3">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-12 items-end">
                  <div className="sm:col-span-4 space-y-1">
                    {index === 0 && <Label className="text-xs text-muted-foreground">Product</Label>}
                    <Select
                      value={line.product_id}
                      onValueChange={(v) => updateLine(index, "product_id", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.sku} - {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    {index === 0 && <Label className="text-xs text-muted-foreground">Quantity</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, "quantity", e.target.value)}
                      placeholder="Qty"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    {index === 0 && <Label className="text-xs text-muted-foreground">Unit Cost</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      value={line.unit_cost}
                      onChange={(e) => updateLine(index, "unit_cost", e.target.value)}
                      placeholder="Cost"
                    />
                  </div>
                  <div className="sm:col-span-3 space-y-1">
                    {index === 0 && <Label className="text-xs text-muted-foreground">Reason</Label>}
                    <Input
                      value={line.reason}
                      onChange={(e) => updateLine(index, "reason", e.target.value)}
                      placeholder="Reason"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                      className="h-9 w-9"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createReceipt.isPending}>
              {createReceipt.isPending ? "Creating..." : "Create Receipt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};