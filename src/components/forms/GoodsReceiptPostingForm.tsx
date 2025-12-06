import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { usePostProductionGoodsReceipt } from "@/hooks/useProduction";
import { useAuth } from "@/hooks/useAuth";

interface GoodsReceiptPostingFormProps {
  productionOrder: {
    id: string;
    order_number: string;
    planned_quantity: number;
    confirmed_quantity: number;
    product?: { name: string; sku: string; planning_strategy?: string };
    warehouse?: { id: string; name: string };
    sales_order?: { id: string; so_number?: string } | null;
  };
  onSuccess?: () => void;
}

export function GoodsReceiptPostingForm({ productionOrder, onSuccess }: GoodsReceiptPostingFormProps) {
  const { profile } = useAuth();
  const postGR = usePostProductionGoodsReceipt();
  
  const remainingQty = productionOrder.planned_quantity - productionOrder.confirmed_quantity;
  const [quantity, setQuantity] = useState(String(remainingQty));
  
  const isMTO = productionOrder.product?.planning_strategy === 'mto';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.org_id) return;

    await postGR.mutateAsync({
      org_id: profile.org_id,
      production_order_id: productionOrder.id,
      quantity: parseFloat(quantity),
      warehouse_id: productionOrder.warehouse?.id,
    });

    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 bg-muted rounded-lg text-sm space-y-2">
        <div className="flex items-center justify-between">
          <span><strong>Order:</strong> {productionOrder.order_number}</span>
          <Badge variant={isMTO ? "default" : "secondary"}>
            {isMTO ? "MTO" : "MTS"}
          </Badge>
        </div>
        <p><strong>Product:</strong> {productionOrder.product?.name} ({productionOrder.product?.sku})</p>
        <p><strong>Progress:</strong> {productionOrder.confirmed_quantity} / {productionOrder.planned_quantity}</p>
        {productionOrder.warehouse && (
          <p><strong>Warehouse:</strong> {productionOrder.warehouse.name}</p>
        )}
        {isMTO && productionOrder.sales_order && (
          <p className="text-primary"><strong>Sales Order:</strong> {productionOrder.sales_order.so_number}</p>
        )}
      </div>

      <div className="p-3 border rounded-lg space-y-1 text-sm">
        <p><strong>Stock Type:</strong> {isMTO ? "Sales Order Stock (Reserved)" : "Unrestricted Stock"}</p>
        {isMTO && (
          <p className="text-muted-foreground">Goods will be reserved for the linked sales order</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="quantity">Quantity to Receive</Label>
        <Input
          id="quantity"
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          min="0.01"
          max={remainingQty}
          step="0.01"
          required
        />
        <p className="text-xs text-muted-foreground">Maximum: {remainingQty}</p>
      </div>

      <Button 
        type="submit" 
        disabled={postGR.isPending || parseFloat(quantity) <= 0 || parseFloat(quantity) > remainingQty} 
        className="w-full"
      >
        {postGR.isPending ? "Posting..." : "Post Goods Receipt"}
      </Button>
    </form>
  );
}
