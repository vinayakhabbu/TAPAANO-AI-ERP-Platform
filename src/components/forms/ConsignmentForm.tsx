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
import { Plus } from "lucide-react";
import { useProducts, useWarehouses } from "@/hooks/useInventory";
import { useCreateConsignmentTransaction } from "@/hooks/useConsignment";

interface ConsignmentFormProps {
  trigger?: React.ReactNode;
}

export const ConsignmentForm = ({ trigger }: ConsignmentFormProps) => {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [transactionType, setTransactionType] = useState<"received" | "consumed" | "returned" | "transferred">("received");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const createTransaction = useCreateConsignmentTransaction();

  // Filter to only show consignment products
  const consignmentProducts = products.filter((p: any) => p.is_consignment);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const product = consignmentProducts.find((p: any) => p.id === productId);
    
    await createTransaction.mutateAsync({
      product_id: productId,
      vendor_id: product?.consignment_vendor_id,
      warehouse_id: warehouseId,
      transaction_type: transactionType,
      quantity: Number(quantity),
      unit_cost: Number(unitCost),
      transaction_date: transactionDate,
      notes,
    });

    setProductId("");
    setWarehouseId("");
    setTransactionType("received");
    setQuantity("");
    setUnitCost("");
    setTransactionDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Consignment Transaction
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Record Consignment Transaction</DialogTitle>
          <DialogDescription>
            Record receipt, consumption, return, or transfer of consignment inventory.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product">Consignment Product *</Label>
              <Select value={productId} onValueChange={setProductId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {consignmentProducts.map((product: any) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.sku} - {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type">Transaction Type *</Label>
              <Select 
                value={transactionType} 
                onValueChange={(v) => setTransactionType(v as typeof transactionType)} 
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Received from Vendor</SelectItem>
                  <SelectItem value="consumed">Consumed/Sold</SelectItem>
                  <SelectItem value="returned">Returned to Vendor</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Transaction Date *</Label>
              <Input
                id="date"
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitCost">Unit Cost</Label>
              <Input
                id="unitCost"
                type="number"
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
              />
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
            <Button type="submit" disabled={createTransaction.isPending}>
              {createTransaction.isPending ? "Recording..." : "Record Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};