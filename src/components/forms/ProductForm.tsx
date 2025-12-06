import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, Package } from "lucide-react";
import { useCreateProduct } from "@/hooks/useInventory";

interface ProductFormProps {
  trigger?: React.ReactNode;
}

export const ProductForm = ({ trigger }: ProductFormProps) => {
  const [open, setOpen] = useState(false);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("EA");
  const [valuationMethod, setValuationMethod] = useState<"fifo" | "lifo" | "average">("average");
  const [standardCost, setStandardCost] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [reorderQuantity, setReorderQuantity] = useState("");
  const [isSerialized, setIsSerialized] = useState(false);
  const [isBatchTracked, setIsBatchTracked] = useState(false);
  
  const createProduct = useCreateProduct();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await createProduct.mutateAsync({
      sku,
      name,
      description: description || undefined,
      unit_of_measure: unitOfMeasure,
      valuation_method: valuationMethod,
      standard_cost: parseFloat(standardCost) || 0,
      reorder_point: parseFloat(reorderPoint) || 0,
      reorder_quantity: parseFloat(reorderQuantity) || 0,
      is_serialized: isSerialized,
      is_batch_tracked: isBatchTracked,
    });

    // Reset form
    setSku("");
    setName("");
    setDescription("");
    setUnitOfMeasure("EA");
    setValuationMethod("average");
    setStandardCost("");
    setReorderPoint("");
    setReorderQuantity("");
    setIsSerialized(false);
    setIsBatchTracked(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            New Product
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                placeholder="PROD-001"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uom">Unit of Measure</Label>
              <Select value={unitOfMeasure} onValueChange={setUnitOfMeasure}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EA">Each (EA)</SelectItem>
                  <SelectItem value="BOX">Box (BOX)</SelectItem>
                  <SelectItem value="CS">Case (CS)</SelectItem>
                  <SelectItem value="KG">Kilogram (KG)</SelectItem>
                  <SelectItem value="LB">Pound (LB)</SelectItem>
                  <SelectItem value="L">Liter (L)</SelectItem>
                  <SelectItem value="M">Meter (M)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Product Name</Label>
            <Input
              id="name"
              placeholder="Product name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Product description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valuation">Valuation Method</Label>
              <Select value={valuationMethod} onValueChange={(v) => setValuationMethod(v as "fifo" | "lifo" | "average")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fifo">FIFO</SelectItem>
                  <SelectItem value="lifo">LIFO</SelectItem>
                  <SelectItem value="average">Average Cost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">Standard Cost</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={standardCost}
                onChange={(e) => setStandardCost(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reorderPoint">Reorder Point</Label>
              <Input
                id="reorderPoint"
                type="number"
                placeholder="0"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reorderQty">Reorder Quantity</Label>
              <Input
                id="reorderQty"
                type="number"
                placeholder="0"
                value={reorderQuantity}
                onChange={(e) => setReorderQuantity(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="serialized"
                checked={isSerialized}
                onCheckedChange={(c) => setIsSerialized(c === true)}
              />
              <Label htmlFor="serialized" className="font-normal">Serial Tracked</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="batch"
                checked={isBatchTracked}
                onCheckedChange={(c) => setIsBatchTracked(c === true)}
              />
              <Label htmlFor="batch" className="font-normal">Batch/Lot Tracked</Label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProduct.isPending}>
              {createProduct.isPending ? "Creating..." : "Create Product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
