import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useInventoryMovements, useCreateInventoryMovement } from "@/hooks/useInventoryMovements";
import { useProducts, useWarehouses } from "@/hooks/useInventory";
import { Plus, Search, ArrowUpRight, ArrowDownRight, RefreshCw, Package } from "lucide-react";

const movementTypeConfig: Record<string, { label: string; icon: typeof ArrowUpRight; className: string }> = {
  purchase: { label: "Purchase", icon: ArrowUpRight, className: "bg-success/10 text-success" },
  sale: { label: "Sale", icon: ArrowDownRight, className: "bg-primary/10 text-primary" },
  transfer_in: { label: "Transfer In", icon: ArrowUpRight, className: "bg-accent/10 text-accent-foreground" },
  transfer_out: { label: "Transfer Out", icon: ArrowDownRight, className: "bg-muted text-muted-foreground" },
  adjustment: { label: "Adjustment", icon: RefreshCw, className: "bg-warning/10 text-warning" },
  production_in: { label: "Production In", icon: ArrowUpRight, className: "bg-success/10 text-success" },
  production_out: { label: "Production Out", icon: ArrowDownRight, className: "bg-destructive/10 text-destructive" },
};

export function InventoryMovementsPanel() {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { data: movements = [], isLoading } = useInventoryMovements(
    typeFilter !== "all" ? { movementType: typeFilter } : undefined
  );
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();

  const filteredMovements = movements.filter((m) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      m.product?.name?.toLowerCase().includes(search) ||
      m.product?.sku?.toLowerCase().includes(search) ||
      m.warehouse?.name?.toLowerCase().includes(search) ||
      m.notes?.toLowerCase().includes(search)
    );
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Inventory Movements</h3>
          <p className="text-sm text-muted-foreground">Track stock purchases, sales, and adjustments</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search movements..."
              className="w-full sm:w-48 pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="purchase">Purchase</SelectItem>
              <SelectItem value="sale">Sale</SelectItem>
              <SelectItem value="adjustment">Adjustment</SelectItem>
              <SelectItem value="transfer_in">Transfer In</SelectItem>
              <SelectItem value="transfer_out">Transfer Out</SelectItem>
            </SelectContent>
          </Select>
          <MovementForm products={products} warehouses={warehouses} />
        </div>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filteredMovements.length === 0 ? (
        <div className="p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No movements found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Record inventory movements to track COGS
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Date</TableHead>
              <TableHead className="text-muted-foreground">Type</TableHead>
              <TableHead className="text-muted-foreground">Product</TableHead>
              <TableHead className="text-muted-foreground">Warehouse</TableHead>
              <TableHead className="text-muted-foreground text-right">Qty</TableHead>
              <TableHead className="text-muted-foreground text-right">Unit Cost</TableHead>
              <TableHead className="text-muted-foreground text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMovements.map((movement) => {
              const config = movementTypeConfig[movement.movement_type] || {
                label: movement.movement_type,
                icon: RefreshCw,
                className: "bg-muted text-muted-foreground",
              };
              const Icon = config.icon;
              return (
                <TableRow key={movement.id} className="border-border">
                  <TableCell className="text-foreground">{formatDate(movement.movement_date)}</TableCell>
                  <TableCell>
                    <Badge className={config.className}>
                      <Icon className="mr-1 h-3 w-3" />
                      {config.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{movement.product?.name || "—"}</span>
                      <span className="text-xs text-muted-foreground">{movement.product?.sku}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{movement.warehouse?.name || "—"}</TableCell>
                  <TableCell className="text-right font-medium text-foreground">
                    {movement.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatCurrency(movement.unit_cost)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-foreground">
                    {formatCurrency(movement.total_cost)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function MovementForm({ products, warehouses }: { products: any[]; warehouses: any[] }) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [movementType, setMovementType] = useState("purchase");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [movementDate, setMovementDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const createMovement = useCreateInventoryMovement();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !quantity || !unitCost) return;

    await createMovement.mutateAsync({
      product_id: productId,
      warehouse_id: warehouseId || undefined,
      movement_type: movementType,
      quantity: Number(quantity),
      unit_cost: Number(unitCost),
      movement_date: movementDate,
      notes: notes || undefined,
    });

    setOpen(false);
    setProductId("");
    setWarehouseId("");
    setMovementType("purchase");
    setQuantity("");
    setUnitCost("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Record Movement
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Record Inventory Movement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sku} - {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Warehouse</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.code} - {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Movement Type *</Label>
              <Select value={movementType} onValueChange={setMovementType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="transfer_in">Transfer In</SelectItem>
                  <SelectItem value="transfer_out">Transfer Out</SelectItem>
                  <SelectItem value="production_in">Production In</SelectItem>
                  <SelectItem value="production_out">Production Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={movementDate}
                onChange={(e) => setMovementDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input
                type="number"
                placeholder="100"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Unit Cost *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="25.00"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMovement.isPending}>
              {createMovement.isPending ? "Saving..." : "Record Movement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
